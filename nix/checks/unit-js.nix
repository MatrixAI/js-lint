{
  pkgs,
  system,
  src,
  npmDeps,
  npmDepsFetcherVersion,
  npmFlags,
  npmScriptShell,
}:
pkgs.buildNpmPackage {
  pname = "check-unit-js";
  version = "0";
  inherit
    src
    npmDeps
    npmDepsFetcherVersion
    npmFlags
    ;
  nodejs = pkgs.nodejs_24;
  npm_config_script_shell = npmScriptShell;
  nativeBuildInputs = [
    pkgs.shellcheck
    pkgs.nixfmt
    pkgs.sqlfluff
  ];
  dontNpmBuild = true;
  doCheck = true;
  checkPhase = ''
    runHook preCheck
    workers="$NIX_BUILD_CORES"
    if [ "$workers" -gt 2 ]; then workers=2; fi
    npm test -- --coverage --maxWorkers="$workers" --no-file-parallelism
    runHook postCheck
  '';
  installPhase = ''
    runHook preInstall
    mkdir -p "$out/artifacts"
    cp -R tmp/junit "$out/artifacts/junit"
    cp -R tmp/coverage "$out/artifacts/coverage"
    cat > "$out/report.json" <<EOF
    {
      "schemaVersion": 1,
      "name": "unit-js",
      "kind": "unit-test",
      "status": "passed",
      "system": "${system}",
      "summary": "TypeScript build, development typecheck and Vitest suite passed",
      "artifacts": {
        "junit": "artifacts/junit",
        "coverage": "artifacts/coverage"
      }
    }
    EOF
    runHook postInstall
  '';
}
