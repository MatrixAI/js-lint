# Breaking migration: Tailwind CSS v4 and Node 24

These changes require a breaking release. The package version has not been
changed or published as part of this implementation.

## Compatibility

- Node.js 24 or newer is required. The integrated development and Nix-check
  environment uses Node 24.
- Tailwind linting now uses stable `eslint-plugin-tailwindcss` 4.4.0. Upstream
  supports ESLint 9 or 10 and requires Node 20.19 or newer; this package retains
  ESLint 9 and applies its stricter Node 24 baseline.
- The adapter requires Tailwind CSS v4. Tailwind v3 consumers must upgrade or
  remain on the preceding MatrixAI lint release. There is no dual-adapter
  compatibility layer.
- The adapter's recommended configuration is its `configs.recommended` export,
  not the former `flat/recommended` export. MatrixAI composes that flat preset
  directly rather than passing it through legacy configuration conversion.
- The adapter declares Tailwind as a peer. The resolved npm lockfile installs
  Tailwind 4.3.3 transitively, without adding a consumer-facing direct Tailwind
  dependency declaration to this lint repository. Consumer applications still
  own their Tailwind installation and build pipeline.
- The new canonical-classname rule is available with Tailwind 4.3 or newer;
  upstream skips canonicalization suggestions on earlier supported v4 versions.

## Consumer configuration

Keep the actual CSS-first entrypoint in native ESLint settings, not in
`matrixai-lint-config.json`. Set `settings.tailwindcss.cssConfigPath` to an
absolute filesystem path derived from the configuration module's directory. The
[consumer example](README.md#tailwind-css-v4-and-mixed-styling) uses a relative
URL anchored to `import.meta.url`, so nested packages and different working
directories do not change its meaning. A legacy `tailwind.config.js` is not a
substitute for the CSS entrypoint.

Use `createConfig({ root })` when preset discovery must also be independent of
the working directory. Existing default imports remain available for callers
whose working directory is already the intended lint root.

Remove obsolete v3 adapter settings such as `config`, `cssFiles`,
`cssFilesRefreshRate` and `removeDuplicates`. Upstream renamed `callees` and
`tags` to `functions`, and `classRegex` to `attributes`; migrate custom settings
to their v4 equivalents when needed.

## Mixed styling and removable workarounds

`tailwindcss/no-custom-classname` is explicitly off after the recommended
configuration. Other useful recommended checks, including ordering and
contradiction detection, remain enabled. Unrelated MatrixAI rules are not
relaxed.

After adoption, downstream projects can remove:

- Temporary replacement adapters, duplicate plugin imports and manual plugin
  re-registration introduced solely to work around the v3 shared preset.
- Overrides that disable `no-custom-classname` solely to permit custom classes,
  framework styles or CSS Module composition.
- Per-file suppressions, class allowlists and variable-name exceptions added
  solely to appease Tailwind-only class enforcement.

Keep the site's real CSS entrypoint setting, native rule customizations that
remain intentional, and application-specific build configuration. Do not remove
unrelated suppressions without checking their diagnostic origin. Tailwind-only
projects can explicitly re-enable class enforcement through a later scoped
ESLint override.

## Forwarded-value investigation

Regression fixtures run both the shared preset and the unwrapped upstream
adapter. With 4.4.0, a plain forwarded identifier and a template-literal
interpolation pass strict upstream enforcement. Inside `clsx`, however, a
forwarded identifier is reported as the literal unknown class `className`. This
reproduces the issue without MatrixAI configuration and distinguishes it from
the default mixed-styling policy. The shared default accepts all these forms,
including differently named forwarded values. No variable-name exception is
added. Consumers opting back into strict enforcement inherit this upstream
limitation.

## Development and testing

The repository now follows the reference library's flake-parts/devenv/direnv
structure, TypeScript toolchain and build-before-test workflow. The test command
typechecks both build and development configurations before Jest. Domain tests
live under corresponding directories, and standalone Nix checks invoke the same
canonical npm command and preserve JUnit/coverage evidence. No lifecycle or
benchmark implementation from another package is imported.
