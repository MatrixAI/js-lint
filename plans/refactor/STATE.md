# Refactor epic state: smart detection + domain architecture

## Status

- First implementation slice for CLI execution semantics has been delivered.
- The target architecture is described in [`PLAN.md`](PLAN.md).

## Implemented in this slice

- Added domain selection controls in the CLI:
  - `--only <domains...>`
  - `--skip <domains...>`
  - supported values: `eslint`, `shell`, `markdown`
- Updated targeting semantics for backward-compatible flags:
  - If no selectors and no domain-target flags are provided, default behavior runs all built-in domains.
  - If `--eslint` and/or `--shell` are provided, selected domains are inferred from those flags so unrelated domains do not run by default.
- Implemented shellcheck optional-vs-explicit behavior:
  - default auto-run shell domain with missing tool => warn and skip
  - explicit shell selection (`--shell ...` or `--only shell`) with missing tool => deterministic failure
- Fixed aggregate outcome control flow:
  - removed early markdown return path that could mask prior failures
  - `main` now makes one final pass/fail decision from aggregate outcomes
- Tightened option correctness:
  - removed permissive unknown-option behavior so unknown flags are rejected by the CLI parser
- Added tests for this slice in [`tests/bin/lint.test.ts`](../../tests/bin/lint.test.ts).

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

## Current pain points (observed in current implementation)

- Domains run in a fixed sequence and cannot be cleanly targeted.
- Domain targeting flags are inconsistent (for example, shell targeting is described like globs but treated like search roots).
- Default scope is tightly coupled to `cwd` and `tsconfig` assumptions.
- Optional external tools are not modeled cleanly (missing tools are sometimes warnings, sometimes implicit no-ops).
- Extensibility is constrained (no per-domain plugin/config abstraction).

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
