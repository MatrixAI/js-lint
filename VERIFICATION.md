# Verification evidence

## Version 3.0.0: native TypeScript

Before the version update, 132 Vitest tests, fix-first repository lint, and the
default Nix check aggregate passed. The aggregate includes unit tests with JUnit
and coverage artifacts, the pinned lint check, and the separately installed
Tailwind consumer check. A separately installed npm archive passed CLI fix and
check runs and Node and TypeScript export resolution.

A separate Nix CLI fixture without a project TypeScript installation verified
autofix, explicit lint-project selection, untrusted mapper rejection, and
trusted dotschema diagnostics that change when the schema type changes. These
scenarios do not prove all mapper failures or transformed-source fix ranges are
safe. The experimental adapter relies on a pinned private upstream module.

## Patch release 2.0.1: separately installed Tailwind v4 tooling

The regression uses a real independent consumer dependency tree locked to
Tailwind CSS 4.3.4 and TypeScript 5.9.3. It never symlinks the tool's dependency
tree into the consumer. The stylesheet matches the workbench's prefixed theme
and utilities imports without Preflight.

- Local scenario command: `npm run test:prepare-tailwind`, then `npm run build`
  and `npm run test:package-tailwind`.
- Packaged proof: `nix build -L '.#checks.x86_64-linux.package-tailwind'`.
- Routine gate: `nix build -L '.#checks.x86_64-linux.default'` includes the
  packaged proof, canonical Jest tests, and packaged lint.
- The named arbitrary-value rule, ordering fixes, contradictory utilities,
  consumer theme, nested invocation, missing dependency, invalid entrypoint,
  broken CSS import, unsupported v3, and non-Tailwind diagnostics are exercised.
- Local evidence is written under `tmp/package-tailwind`; hermetic evidence is
  retained in the check output's `report.json` and `artifacts` directory.

The upstream beta alone still reproduces the failure. The tested configuration
also sets `useLocalPkgWorkaround` to `false`. This is a supported upstream
option, not a dependency patch. No reset, disabled rule, global resolution hook,
or new process-directory mutation is part of this fix.

Downstream consumers must acquire the revision containing both the dependency
upgrade and preset setting, not merely any package labelled 2.0.0. Consumers
using a package-set-provided CLI must update that package set's js-lint source
pin and dependency hash, then their own package-set lock. The workbench also
needs its actual entrypoint selected in `eslint.settings.json` as documented in
the [Tailwind configuration guide](README.md#tailwind-css-v4-and-mixed-styling).
No release revision, tag, or npm publication is created by these checks.

The canonical build, lintfix, non-mutating lint, 18 Jest suites (118 tests),
isolated packaged consumer check, and default Nix gate passed before the release
version bump. The 2.0.1 manifest and lock are prepared; the release-version Nix
dependency hash and gates are verified separately before delivery.

The built Nix CLI passes the workbench's originally failing source file using
the unchanged application CSS. In a disposable source copy, autofix reduces 158
errors and 21 warnings to four non-fixable React errors, with no Tailwind
initialization failure. These remaining application diagnostics are not waived
and the full workbench lint gate is not claimed as passing. The linked consumer
checkout and live Nix store were not modified.

## Git-only staging patch 1.0.2

This patch carries the common npm-script development workflow, explicit lint
backend provisioning, identical generic lint configuration, and removal of the
obsolete GitHub workflows. All six libraries passed their lintfix commands in
the aligned Nix development environments before this dependency-pin update. The
final release graph receives a prepared archive build; broad runtime suites are
not repeated. Existing release tags remain immutable. No npm publication is
performed.
