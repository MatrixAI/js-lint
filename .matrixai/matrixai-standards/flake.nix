{
  inputs = {
    nixpkgs-matrix-private = {
      type = "indirect";
      id = "nixpkgs-matrix-private";
    };
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { nixpkgs-matrix-private, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs-matrix-private.legacyPackages.${system};

        shell = { ci ? false }:
          with pkgs;
          mkShell {
            nativeBuildInputs =
              [
                nodejs
                shellcheck
                patchelf
                gh
                jq
              ];
            shellHook = ''
              echo "Entering $(npm pkg get name)"
              set -o allexport
              ${lib.optionalString (!ci) ''
              . ./.env
              ''}
              set +o allexport
              set -v
              ${lib.optionalString ci ''
                set -o errexit
                set -o nounset
                set -o pipefail
                shopt -s inherit_errexit
              ''}
              mkdir --parents "$PWD/tmp"

              # Built executables and NPM executables
              export PATH="$PWD/dist/bin:$PWD/node_modules/.bin:$PATH"

              flock -x tmp/npm-install.lock \
                npm install --ignore-scripts --no-audit --fund=false --prefer-offline

              set +v
            '';
          };
      in {
        devShells = {
          default = shell { ci = false; };
          ci = shell { ci = true; };
        };
      });
}
