{
  pkgs,
  nodejs,
  gitignore,
  sourceProvenance,
}:
let
  src = gitignore.gitignoreSource ../.;
  package = builtins.fromJSON (builtins.readFile ../package.json);
  pname = builtins.replaceStrings [ "@" "/" ] [ "" "-" ] package.name;
  archiveName = "${pname}-${package.version}.tgz";
  npmDepsFetcherVersion = 2;
  npmFlags = [ "--ignore-scripts=false" ];

  # Use the existing check acquisition strategy without changing its wiring.
  # This hash includes the current lockfile, including the root package version.
  npmDeps = pkgs.fetchNpmDeps {
    name = "matrixai-lint-npm-deps";
    inherit src;
    fetcherVersion = npmDepsFetcherVersion;
    hash = import ./npm-deps-hash.nix;
  };
  npmScriptShell = pkgs.writeShellScript "npm-script-shell" ''
    for candidate in "$PWD"/node_modules/.bin/*; do
      [ -e "$candidate" ] || continue
      target="$(readlink -f "$candidate")"
      [ -f "$target" ] || continue
      [ "$(head -c 2 "$target")" = "#!" ] || continue

      if [ "$(head -n 1 "$target")" = "#!/usr/bin/env node" ]; then
        sed -i '1c #!${nodejs}/bin/node' "$target"
      fi
    done

    exec ${pkgs.bash}/bin/bash "$@"
  '';
in
pkgs.buildNpmPackage {
  inherit pname;
  version = package.version;
  name = archiveName;

  outputs = [
    "out"
    "unpacked"
  ];

  inherit
    src
    npmDeps
    npmDepsFetcherVersion
    npmFlags
    ;

  inherit nodejs;
  npm_config_script_shell = npmScriptShell;
  npmBuildScript = "build";

  # Producer contract: $out is the npm-named archive file; $unpacked is a
  # separate output with the exact package contents directly at its root.
  # Let npm select package contents; leave runtime dependencies and lifecycle
  # scripts intact. Directory consumers must account for preparation semantics.
  installPhase = ''
    runHook preInstall

    mkdir -p "$TMPDIR/npm-pack" "$unpacked"
    # Compilation already ran above. Suppress hooks only for this packing step,
    # and keep npm's pack cache writable without changing dependency acquisition.
    npm_config_cache="$TMPDIR/npm-pack-cache" \
      npm pack --offline --ignore-scripts --pack-destination "$TMPDIR/npm-pack"
    mv "$TMPDIR/npm-pack"/*.tgz "$out"
    tar -xzf "$out" -C "$unpacked" --strip-components=1

    runHook postInstall
  '';

  # Keep the archive and its unpacked view identical, without runtime fixups.
  dontFixup = true;

  # Evaluation-only descriptor: no archive reads, build dependencies, or store
  # paths in the package manifest. The derivation itself selects the archive.
  passthru.npmPackage = {
    schemaVersion = 1;
    format = "npm-tgz";
    inherit (package) name version;
    dependencies = package.dependencies or { };
    peerDependencies = package.peerDependencies or { };
    peerDependenciesMeta = package.peerDependenciesMeta or { };
    optionalDependencies = package.optionalDependencies or { };
    engines = package.engines or { };
    bin = package.bin or { };
    source = sourceProvenance;
  };

  # Direct runtime artifact candidates, not a resolved dependency closure.
  # Keep this JSON-serializable and empty until real providers are selected.
  passthru.npmDistribution = {
    schemaVersion = 1;
    archiveOutput = "npm-package";
    runtimeProviders = [ ];
  };

  meta = {
    description = package.description;
    license = pkgs.lib.meta.getLicenseFromSpdxId package.license;
    outputsToInstall = [ "out" ];
  };
}
