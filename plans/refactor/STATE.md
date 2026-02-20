# Refactor epic state: smart detection + domain architecture

## Status

- First implementation slice for CLI execution semantics has been delivered.
- The target architecture is described in [`PLAN.md`](PLAN.md).

## Implemented in this slice

- Finalized canonical long-term CLI surface:
  - `--domain <id...>` and `--skip-domain <id...>` for explicit inclusion/exclusion
  - `--list-domains` prints available domains with descriptions and exits without lint execution
  - `--explain` prints per-domain decision details (selection source, relevance, availability, planned action)
  - `--eslint-config <path>` as the canonical explicit ESLint config override
  - domain ids remain: `eslint`, `shell`, `markdown`
- Integrated explain/list output with the domain engine (no duplicate decision logic in CLI):
  - added decision evaluation and domain-list helpers in [`src/domains/engine.ts`](../../src/domains/engine.ts)
  - CLI now consumes those helpers in [`src/bin/lint.ts`](../../src/bin/lint.ts)
- Clarified shell target semantics in CLI help and docs:
  - `--shell` now documented as targets (files, roots, or globs), not only globs
  - effective behavior remains root-derivation + recursive `*.sh` discovery
- Removed legacy flag surface from docs/CLI path:
  - canonical path uses `--domain`, `--skip-domain`, `--eslint-config`
  - no backward-compat requirement maintained for `--only`, `--skip`, `--config` in this slice
- Preserved script-level workflow compatibility by updating package scripts to canonical flags:
  - `npm run lint` and `npm run lintfix` remain functional workflows and now invoke canonical domain flags
- Added/updated tests for canonical behavior:
  - domain selection + explain/list integration in [`tests/domains/index.test.ts`](../../tests/domains/index.test.ts)
  - CLI canonical flags, explain output path, list-domains early exit, and script-shape coverage in [`tests/bin/lint.test.ts`](../../tests/bin/lint.test.ts)

## Implemented in smart-detection completion slice

- Completed two-axis smart detection across all current built-in domains (`eslint`, `shell`, `markdown`):
  - Axis A (project relevance): each domain now performs detection against effective scope roots before execution.
  - Axis B (tool availability): each domain reports runtime tool availability independently from relevance.
- Extended the domain engine contract in [`src/domains/engine.ts`](../../src/domains/engine.ts):
  - added per-domain `detect` hook returning relevance + availability metadata
  - retained ordered orchestration via the domain engine
  - enforced single aggregate failure decision from all domain outcomes
- Added shared discovery helpers in [`src/domains/files.ts`](../../src/domains/files.ts):
  - pattern-to-root resolution for path/glob inputs
  - filesystem extension-based discovery for relevance checks
  - relative path normalization for stable CLI invocation
- Updated built-in domains to use detection consistently:
  - [`src/domains/eslint.ts`](../../src/domains/eslint.ts): detects JS/TS relevance in effective scope; availability is required
  - [`src/domains/shell.ts`](../../src/domains/shell.ts): detects `*.sh` relevance and `shellcheck` availability (optional in auto mode)
  - [`src/domains/markdown.ts`](../../src/domains/markdown.ts): detects Markdown/MDX relevance in current default markdown scope; availability is required
- Enforced explicit-vs-auto semantics in engine/orchestration:
  - explicit requests are tracked via `--only` and domain target flags (`--eslint`, `--shell`)
  - auto + not relevant => skip
  - auto + relevant + missing optional tool => warn/skip (non-fatal)
  - explicit + missing required tool OR missing optional-now-required tool => deterministic failure
  - explicit + no matched files => non-fatal no-op with explicit warning
- Kept backward-compatible flag behavior in selection logic:
  - `--eslint` / `--shell` still imply explicit domain selection when used without domain selectors
  - `--only` / `--skip` remain stable
- Expanded and reorganized tests:
  - CLI orchestration behavior remains in [`tests/bin/lint.test.ts`](../../tests/bin/lint.test.ts)
  - moved engine and selection semantics tests to [`tests/domains/index.test.ts`](../../tests/domains/index.test.ts)

## Implemented in follow-up cleanup slice

- Removed shell-domain dependence on external `find`:
  - shell discovery now walks filesystem roots in Node and collects `*.sh` files before invoking `shellcheck`
  - non-existent shell roots are still ignored
  - explicit shell requests (`--shell ...` or `--only shell`) still fail if `shellcheck` is missing
  - default shell auto-run still warns/skips when `shellcheck` is missing
- Removed runtime dependency-injection indirection from CLI entry:
  - removed `MainDeps`, `defaultMainDeps`, and `mainWithDeps` from `src/bin/lint.ts`
  - retained `main` as the runtime/default export entrypoint
- Refactored CLI tests to use Jest spies/mocks instead of `mainWithDeps`:
  - tests now mock dependency behavior through module spies (for example `utils.commandExists`)
  - shell assertions updated to verify direct `shellcheck` invocation behavior

## Implemented in domain-engine core + packaging alignment slice

- Introduced an internal domain engine core:
  - added [`src/domains/engine.ts`](../../src/domains/engine.ts) containing a domain plugin contract, registry creation, and ordered execution with aggregated failure status
  - added built-in domain plugin modules and registry composition under [`src/domains/`](../../src/domains/)
  - added duplicate-domain registration protection in the registry
  - preserved deterministic ordered execution using the existing built-in order (`eslint`, `shell`, `markdown`)
- Refactored CLI orchestration to run through the domain engine:
  - [`src/bin/lint.ts`](../../src/bin/lint.ts) now builds a built-in domain registry and executes selected domains through the engine
  - preserved external behavior and compatibility:
    - existing flags (`--fix`, `--user-config`, `--config`, `--eslint`, `--shell`, `--only`, `--skip`)
    - inferred selection from `--eslint` and `--shell`
    - shell explicit-vs-auto missing-tool behavior
    - single aggregate final pass/fail result
- Added/updated tests for engine and API surface parity:
  - [`tests/bin/lint.test.ts`](../../tests/bin/lint.test.ts) now includes direct engine tests (ordered execution, failure aggregation, duplicate registration guard)
  - [`tests/index.test.ts`](../../tests/index.test.ts) now validates package programmatic exports (`#index.js` named `config` and `#config.js` default config)
- Standardized programmatic package surface:
  - added [`src/index.ts`](../../src/index.ts) as the public barrel exporting named `config` and public types
  - added [`src/config.ts`](../../src/config.ts) as the default-export config subpath module
  - updated [`package.json`](../../package.json) exports map:
    - includes `./package.json`
    - keeps `.` with `types` + `import`
    - keeps `./*.js` with `types` + `import`
    - keeps `./*` fallback to `dist/*`
    - removed custom `./config` export block
  - preserved `imports` compatibility mapping `#* -> ./dist/*`

## Prettier config file-format decision (question follow-up)

- Decision: keep the Prettier config as JavaScript runtime source, and rename from `.mjs` to `.js` (ESM due to package `type: module`) rather than converting to TypeScript.
- Implemented changes:
  - replaced [`src/configs/prettier.config.mjs`](../../src/configs/prettier.config.mjs) with [`src/configs/prettier.config.js`](../../src/configs/prettier.config.js)
  - updated imports and runtime references in:
    - [`src/configs/js.ts`](../../src/configs/js.ts)
    - [`src/bin/lint.ts`](../../src/bin/lint.ts)
- Rationale:
  - the file is consumed directly at runtime by both ESLint config composition and Prettier CLI `--config`
  - keeping runtime config as JS avoids introducing extra TS-to-runtime coupling for a non-domain logic config asset
  - `.js` aligns with repo ESM boundary (`type: module`) and is simpler than `.mjs` while staying explicit and portable
  - this keeps build/package behavior robust without additional post-build copy or loader complexity

## Current pain points (observed in current implementation)

- Domains run in a fixed sequence and cannot be cleanly targeted.
- Domain targeting flags are inconsistent (for example, shell targeting is described like globs but treated like search roots).
- Default scope is tightly coupled to `cwd` and `tsconfig` assumptions.
- Optional external tools are not modeled cleanly (missing tools are sometimes warnings, sometimes implicit no-ops).
- Extensibility is constrained (no per-domain plugin/config abstraction).

Notes on resolved items:

- Domain execution is now backed by an internal plugin registry/engine abstraction.

## Decisions (draft)

- Introduce a first-class domain/plugin architecture.
- Split auto-discovery into two axes: project relevance vs tool availability.
- Classify dependencies as required vs optional, with an explicit-request escalation rule.
- Introduce a new CLI model that supports domain inclusion/exclusion and consistent target semantics.

## Open questions

- Final naming for the new flags (for example `--domain` vs `--only`, `--skip` vs `--exclude-domain`).
- Config schema evolution strategy: extend `matrixai-lint-config.json` in place vs introduce a v2 file name.

## Next actions

- Continue phased implementation from [`PLAN.md`](PLAN.md):
  - move toward domain/plugin architecture internals
  - align config evolution with v2 schema and precedence
  - extend domain coverage and execution diagnostics (`--explain`, registry-style reporting)
