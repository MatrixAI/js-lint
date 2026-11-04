{
  pkgs,
  system,
  gitignore,
  lint,
  cli,
}:
let
  src = gitignore.gitignoreSource ../..;
  npmDepsFetcherVersion = 2;
  npmFlags = [ "--ignore-scripts=false" ];
  npmScriptShell = pkgs.writeShellScript "npm-script-shell" ''
    for candidate in "$PWD"/node_modules/.bin/*; do
      [ -e "$candidate" ] || continue
      target="$(readlink -f "$candidate")"
      [ -f "$target" ] || continue
      [ "$(head -c 2 "$target")" = "#!" ] || continue
      if [ "$(head -n 1 "$target")" = "#!/usr/bin/env node" ]; then
        sed -i '1c #!${pkgs.nodejs_24}/bin/node' "$target"
      fi
    done
    exec ${pkgs.bash}/bin/bash "$@"
  '';
  npmDeps = pkgs.fetchNpmDeps {
    name = "matrixai-lint-npm-deps";
    inherit src;
    fetcherVersion = npmDepsFetcherVersion;
    hash = import ../npm-deps-hash.nix;
  };
  unit-js = import ./unit-js.nix {
    inherit
      pkgs
      system
      src
      npmDeps
      npmDepsFetcherVersion
      npmFlags
      npmScriptShell
      ;
  };
  lintCheck = import ./lint.nix {
    inherit
      lint
      src
      npmDeps
      npmDepsFetcherVersion
      ;
  };
  package-tailwind = import ./package-tailwind.nix {
    inherit pkgs system src;
    lint = cli;
  };
  default = pkgs.runCommand "check-default" { } ''
    mkdir -p "$out/artifacts"
    ln -s ${unit-js} "$out/artifacts/unit-js"
    ln -s ${lintCheck} "$out/artifacts/lint"
    ln -s ${package-tailwind} "$out/artifacts/package-tailwind"
    cat > "$out/report.json" <<EOF
    {
      "schemaVersion": 1,
      "name": "default",
      "kind": "aggregate",
      "status": "passed",
      "system": "${system}",
      "summary": "Unit tests, pinned repository lint and isolated producer Tailwind consumer passed",
      "artifacts": {
        "unit-js": "artifacts/unit-js/report.json",
        "lint": "artifacts/lint/report.json",
        "package-tailwind": "artifacts/package-tailwind/report.json"
      }
    }
    EOF
  '';
in
{
  inherit default unit-js package-tailwind;
  lint = lintCheck;
}
