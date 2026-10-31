{
  inputs = {
    nixpkgs-matrixai = {
      type = "indirect";
      id = "nixpkgs-matrixai";
    };
    nixpkgs.follows = "nixpkgs-matrixai/nixpkgs";
    flake-parts.follows = "nixpkgs-matrixai/flake-parts";
    devenv = {
      url = "github:cachix/devenv";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    inputs@{
      devenv,
      flake-parts,
      nixpkgs-matrixai,
      ...
    }:
    let
      systems = [
        "x86_64-linux"
      ];
    in
    flake-parts.lib.mkFlake { inherit inputs; } {
      imports = [
        devenv.flakeModule
      ];

      # Declared systems are support claims. Keep this set conservative and
      # expand only when evaluation/build evidence exists.
      systems = systems;

      perSystem =
        { config, system, ... }:
        let
          pkgs = nixpkgs-matrixai.legacyPackages.${system};
          npmPackage = import ./nix/npm-package.nix {
            inherit pkgs;
            nodejs = pkgs.nodejs_24;
            gitignore = nixpkgs-matrixai.lib.gitignore;
            sourceProvenance = {
              rev = inputs.self.rev or null;
              dirtyRev = inputs.self.dirtyRev or null;
              narHash = inputs.self.narHash or null;
              dirty =
                if inputs.self ? dirtyRev then
                  true
                else if inputs.self ? rev then
                  false
                else
                  null;
            };
          };
        in
        {
          # The default is the archive file itself; the unpacked view is separate.
          # Both outputs share one build, with no bundled dependency tree.
          packages = {
            default = npmPackage.out;
            npm-package = npmPackage.out;
            npm-package-unpacked = npmPackage.unpacked;
          };

          checks = import ./nix/checks/default.nix {
            inherit pkgs system;
            gitignore = nixpkgs-matrixai.lib.gitignore;
          };

          formatter = pkgs.nixfmt;

          # Preserve callers of the previous development-shell name.
          devShells.ci = config.devShells.default;

          devenv.shells.default =
            { lib, ... }:
            {
              containers = lib.mkForce { };
              devenv.root = lib.mkForce (
                let
                  root = builtins.getEnv "PWD";
                in
                if root == "" then toString ./. else root
              );

              packages = [
                pkgs.nodejs_24
                pkgs.shellcheck
                pkgs.nixfmt
                pkgs.sqlfluff
                pkgs.gh
                pkgs.structured-madr
              ];

              enterShell = ''
                echo "Entering $(npm pkg get name) via devenv"
                mkdir --parents "$PWD/tmp"

                export PATH="$PWD/dist/bin:$PWD/node_modules/.bin:$PATH"

                exec 8>"$PWD/tmp/npm-install.lock"
                flock -x 8
                npm install --no-audit --fund=false --prefer-offline
                flock -u 8
              '';
            };
        };

      # If this repo vendors matrixai-standards at
      # `./.matrixai/matrixai-standards/`, materialize runtime skills with:
      # nix run './.matrixai/matrixai-standards#skills-materializer' -- \
      #   --standards-root ./.matrixai/matrixai-standards \
      #   --output ./.agents/skills
    };
}
