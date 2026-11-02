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
            npmDeps = lint.npmDependencies.npmDeps;
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
          lint =
            (pkgs.callPackage ./nix/cli.nix {
              src = nixpkgs-matrixai.lib.gitignore.gitignoreSource ./.;
            }).withTools
              [
                pkgs.shellcheck
                pkgs.nixfmt
                pkgs.sqlfluff
              ];
        in
        {
          packages = {
            default = lint;
            npm-package = npmPackage.out;
            npm-package-unpacked = npmPackage.unpacked;
            matrixai-lint = lint;
          };

          apps.default = config.apps.lint;
          apps.lint = {
            type = "app";
            program = "${lint}/bin/matrixai-lint";
          };
          formatter = lint.formatter;

          checks =
            let
              existing = import ./nix/checks/default.nix {
                inherit pkgs system;
                gitignore = nixpkgs-matrixai.lib.gitignore;
              };
              lintCheck = lint.mkCheck {
                src = nixpkgs-matrixai.lib.gitignore.gitignoreSource ./.;
                npmDependencies = lint.npmDependencies;
                setup = "npm run prepare";
              };
            in
            existing
            // {
              lint = lintCheck;
              default = pkgs.runCommand "check-default-with-lint" { } ''
                mkdir -p "$out/artifacts"
                ln -s ${existing.default} "$out/artifacts/routine"
                ln -s ${lintCheck} "$out/artifacts/lint"
                cat > "$out/report.json" <<EOF
                { "schemaVersion": 1, "name": "default", "kind": "aggregate", "status": "passed", "system": "${system}", "summary": "Routine tests and packaged lint passed", "artifacts": { "routine": "artifacts/routine/report.json", "lint": "artifacts/lint/report.json" } }
                EOF
              '';
            };

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
                # External backends invoked through the npm lint scripts.
                pkgs.shellcheck
                pkgs.nixfmt
                pkgs.sqlfluff
                pkgs.util-linux
                pkgs.gh
                pkgs.structured-madr
              ];

              enterShell = ''
                echo "Entering $(npm pkg get name) via devenv"
                mkdir --parents "$PWD/tmp"

                export PATH="$PWD/dist/bin:$PWD/node_modules/.bin:$PATH"

                (
                  flock -x 8 || exit "$?"
                  npm install --no-audit --fund=false --prefer-offline
                ) 8>"$PWD/tmp/npm-install.lock" || return "$?"
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
