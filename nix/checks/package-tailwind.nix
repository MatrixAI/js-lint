{
  pkgs,
  system,
  src,
  lint,
}:
let
  consumer = pkgs.buildNpmPackage {
    pname = "matrixai-tailwind-consumer-fixture";
    version = "0";
    src = pkgs.lib.fileset.toSource {
      root = ../../tests/eslint/fixtures/tailwind-consumer;
      fileset = pkgs.lib.fileset.unions [
        ../../tests/eslint/fixtures/tailwind-consumer/package.json
        ../../tests/eslint/fixtures/tailwind-consumer/package-lock.json
      ];
    };
    nodejs = pkgs.nodejs_24;
    npmDepsFetcherVersion = 2;
    npmDepsHash = import ./tailwind-consumer-deps-hash.nix;
    dontNpmBuild = true;
    installPhase = ''
      mkdir -p "$out"
      cp -R node_modules "$out/node_modules"
    '';
  };
in
pkgs.runCommand "check-package-tailwind"
  {
    nativeBuildInputs = [ pkgs.nodejs_24 ];
  }
  ''
    cp -R ${src} source
    chmod -R u+w source
    cd source
    export HOME="$TMPDIR/home"
    export npm_config_cache="$TMPDIR/npm-cache"
    export MATRIXAI_LINT_PACKAGED_CLI="${lint}/bin/matrixai-lint"
    export MATRIXAI_LINT_CONSUMER_DEPS="${consumer}/node_modules"
    export MATRIXAI_LINT_PACKAGE_EVIDENCE="$out/artifacts"
    export CHECK_SYSTEM="${system}"
    mkdir -p "$HOME" "$out/artifacts"
    npm run test:package-tailwind
    # The public check owns execution and its report in the same derivation.
    cp "$out/artifacts/report.json" "$out/report.json"
    ${pkgs.nodejs_24}/bin/node --input-type=module - "$out/report.json" <<'NODE'
    import fs from 'node:fs';
    const destination = process.argv[2];
    const report = JSON.parse(fs.readFileSync(destination, 'utf8'));
    report.artifacts = { scenarios: 'artifacts/scenarios.json', logs: 'artifacts' };
    fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
    NODE
  ''
