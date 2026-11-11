{
  lib,
  buildNpmPackage,
  nodejs_24,
  makeWrapper,
  writeShellApplication,
  symlinkJoin,
  which,
  stdenv,
  src ? lib.cleanSource ../.,
}:
let
  package = builtins.fromJSON (builtins.readFile (src + "/package.json"));
  cli = buildNpmPackage {
    pname = "matrixai-lint";
    inherit (package) version;
    inherit src;
    nodejs = nodejs_24;
    npmDepsHash = import (src + "/nix/npm-deps-hash.nix");
    npmDepsFetcherVersion = 2;
    nativeBuildInputs = [ makeWrapper ];
    npmBuildScript = "build";
    # The native backend uses its pinned classic API compatibility dependency,
    # never the consumer's TypeScript installation.
    npmPruneFlags = [ "--omit=peer" ];
    postInstall = ''
      # Keep both the native compiler and the adapter's classic API dependency.
      lintPackageOut="$out/lib/node_modules/${package.name}"
      rm -f "$lintPackageOut/node_modules/.bin/tsc" "$lintPackageOut/node_modules/.bin/tsserver"
      test -f "$lintPackageOut/node_modules/typescript/lib/typescript.js"
      test -f "$lintPackageOut/node_modules/@typescript/native/dist/api/sync/api.js"
      ${nodejs_24}/bin/node "$lintPackageOut/node_modules/@typescript/native/bin/tsc" --version
      wrapProgram "$out/bin/matrixai-lint" \
        --add-flags --strict \
        --prefix PATH : ${lib.makeBinPath [ which ]}
    '';
    passthru = {
      withTools =
        tools:
        let
          runner = writeShellApplication {
            name = "matrixai-lint";
            runtimeInputs = tools;
            text = ''
              export MATRIXAI_LINT_TOOLCHAIN=${
                lib.escapeShellArg (
                  builtins.toJSON (
                    map (tool: {
                      name = lib.getName tool;
                      version = lib.getVersion tool;
                      path = toString tool;
                    }) tools
                  )
                )
              }
              exec ${cli}/bin/matrixai-lint "$@"
            '';
          };
          formatter = writeShellApplication {
            name = "matrixai-fmt";
            runtimeInputs = [ runner ];
            text = ''
              exec matrixai-lint --fix "$@"
            '';
          };
          mkCheck =
            {
              src,
              name ? "lint",
              npmDependencies ? null,
              nativeBuildInputs ? [ ],
              setup ? "",
              args ? [ ],
            }:
            (if npmDependencies == null then stdenv.mkDerivation else buildNpmPackage) (
              {
                pname = "check-${name}";
                version = "0";
                inherit src;
                nodejs = nodejs_24;
                nativeBuildInputs = [
                  runner
                  nodejs_24
                ]
                ++ nativeBuildInputs;
                dontNpmBuild = true;
                dontBuild = true;
                doCheck = true;
                checkPhase = ''
                  runHook preCheck
                  export HOME="$TMPDIR/lint-home"
                  export XDG_CACHE_HOME="$TMPDIR/lint-cache"
                  mkdir -p "$HOME" "$XDG_CACHE_HOME" "$out/artifacts"
                  ${setup}
                  if ! matrixai-lint --check --report "$out/report.json" ${lib.escapeShellArgs args} > "$out/artifacts/lint.log" 2>&1; then
                    cat "$out/artifacts/lint.log"
                    exit 1
                  fi
                  cat "$out/artifacts/lint.log"
                  ${nodejs_24}/bin/node --input-type=module - "$out/report.json" <<'NODE'
                  import fs from 'node:fs';
                  const destination = process.argv[2];
                  const report = JSON.parse(fs.readFileSync(destination, 'utf8'));
                  report.system = '${stdenv.hostPlatform.system}';
                  report.artifacts = { log: 'artifacts/lint.log' };
                  fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
                  NODE
                  runHook postCheck
                '';
                installPhase = "true";
              }
              // lib.optionalAttrs (npmDependencies != null) npmDependencies
            );
        in
        symlinkJoin {
          name = "matrixai-lint-environment-${package.version}";
          paths = [ runner ];
          passthru = {
            inherit formatter tools mkCheck;
            inherit (cli) withTools;
            npmDependencies = {
              inherit (cli) npmDeps;
              npmDepsFetcherVersion = 2;
            };
          };
          meta.mainProgram = "matrixai-lint";
        };
    };
    meta = {
      description = "Convention-driven, ecosystem-neutral MatrixAI lint and fix orchestrator";
      license = lib.licenses.asl20;
      mainProgram = "matrixai-lint";
      platforms = lib.platforms.unix;
    };
  };
in
cli
