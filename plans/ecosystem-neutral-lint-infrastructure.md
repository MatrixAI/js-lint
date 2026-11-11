# Ecosystem-neutral MatrixAI lint infrastructure

## Status and scope

Planning baseline agreed on 2026-11-02. This document records the strategic
direction and implementation sequence; it does not introduce a new CLI,
configuration schema, formatter output, or executed conformance claim.

Implementation, downstream migrations, standards changes, releases, and
publication remain separate actions requiring authorization. Existing released
tags and exact dependency resolutions must remain immutable. Distribution
remains Git-only; this plan does not introduce npm publication or GitHub
Actions.

## Goal

Evolve the existing Node.js implementation into a language-ecosystem-neutral
lint, check, and fix orchestrator for MatrixAI repositories. Keep smart defaults
for MatrixAI's standardized layouts, permit downstream customization, and expose
the same behavior through pinned local runners and hermetic Nix checks.

The tool is a house-convention orchestrator, not a universal configuration
framework requiring every repository to describe its ordinary layout manually.
Retain the existing implementation and backend integrations rather than rewrite
them merely because some consumers are Rust repositories.

## Observed baseline

- The [domain registry](../src/domains.ts) already composes ESLint, ShellCheck,
  Markdown, SVG, Nix, and SQL adapters.
- The [default roots](../src/constants.ts),
  [configuration resolver](../src/config.ts), and
  [CLI](../src/bin/matrixai-lint.ts) already support convention-driven discovery
  and invocation-specific targeting.
- The [domain engine](../src/domainEngine.ts) separates selection, relevance,
  availability, and execution. Some automatically selected unavailable backends
  currently warn and skip; migration must not silently preserve incomplete
  coverage in a declared hermetic lint gate.
- The [package](../package.json) provides both a CLI and importable presets and
  rules. These are distinct consumer roles even though they share a package.
- The [flake](../flake.nix) currently exposes prepared npm archives, not a
  standalone executable distribution. Its earlier formatter removal remains the
  current implemented contract until this migration is approved.
- Existing [Nix checks](../nix/checks/default.nix) provide a default aggregate
  and a JavaScript unit suite. New lint proof surfaces must integrate with this
  structure rather than replace it with another CI mechanism.
- The inspected MatrixAI/rs-objlog checkout has Rust formatting and Clippy
  tools, a Nix-only formatter entrypoint, and distinct portable, WASM, native,
  and diagnostics feature sets.
- The inspected MatrixAI/Zeta-House-Docs checkout has npm lint scripts, a
  separate Nix-only formatter entrypoint, SQL and Markdown sources, and a custom
  ESLint configuration importing MatrixAI presets and project-local plugins.

The downstream observations describe the inspected checkouts, not permanent
claims about those projects. Scratch-directory symlinks are not portable plan
dependencies; use source-repository identifiers when coordinating migrations.

## Agreed design principles

- Defaults should do the useful, standard thing without mandatory configuration.
- Repository policy can extend, replace, or disable inherited behavior.
- Invocation policy can scope, extend, or replace the repository behavior.
- Source relevance must not depend on which tools happen to be on the user's
  PATH. A missing required backend is an environment failure, not less coverage.
- One driver owns discovery, policy resolution, backend execution, and results.
- Nix supplies pinned tools and dependencies, not a second implementation of
  lint policy.
- Fix mode applies approved fixes and reports residual violations. Check mode
  does not modify source.
- A successful fix pass completes the lint gate for its reported scope; a
  redundant external check pass is not part of the normal development loop.
- The common workflow must work without an npm manifest in a Rust repository.

## Policy resolution

Resolve behavior in this order:

1. Built-in MatrixAI conventions and source-derived project detection.
2. Repository configuration.
3. Invocation-specific adjustments.

Within each layer, distinguish these operations explicitly:

| Operation         | Meaning                                                |
| ----------------- | ------------------------------------------------------ |
| Inherit           | Keep the preceding value without restating it.         |
| Extend            | Add to the inherited target set or supported settings. |
| Replace           | Substitute a specific value or target set.             |
| Disable or remove | Deliberately subtract inherited behavior.              |

Specify list behavior rather than rely on an ambiguous generic deep merge.
Define the treatment of omission, empty replacement, duplicate targets,
exclusions, conflicting operations, and domain enablement. In particular, an
explicitly empty replacement must not silently fall back to default discovery.

Keep domain selection separate from target selection. Preserve current selector
semantics for existing invocations; introduce additive operations explicitly. Do
not choose new flag names or schema syntax without compatibility fixtures.
Retain version-2 behavior or provide an explicit, tested schema migration.

Resolve the effective policy before executing backends. Extend the existing
explanation facility to expose inherited defaults, override provenance,
effective targets and exclusions, backend identity, relevance, skip reasons, and
actual execution scope. Explanation-only inspection should not accidentally run
fixes.

## Discovery and backend contract

Use deterministic repository structure and maintained source to detect relevant
domains. Preserve useful default roots and add ecosystem support without making
normal repositories enumerate every root. Inventory unsupported maintained
formats, including Rust, CSS, YAML, and TOML, before claiming complete coverage.
Source coverage does not mean applying text formatters to binary assets.

Keep dependency trees, generated outputs, secrets, vendored submodules,
materialized skill copies, and scratch repositories outside default discovery.
Respect repository exclusions and real filesystem boundaries. Specify nested
ignore handling, symlink aliases, explicit external roots, and source selection
without Git metadata. Local targeting must handle eligible new files without
staging or modifying the user's index.

For each backend, declare and test:

- Relevance and required executable or runtime dependencies.
- Supported check behavior and supported fix behavior, if any.
- Approved fix safety and diagnostic severity policy.
- Source scope and any expansion to a crate, workspace, or configuration graph.
- Residual-diagnostic and exit-status behavior after fixes.
- Configuration inputs, cache locations, and offline requirements.

Fix mode may run a check-only backend such as ShellCheck. Where a backend's fix
command does not establish residual cleanliness, perform the necessary scoped
verification internally. Do not require the operator to repeat the whole suite.
Detect conflicting fixers and non-convergence with bounded behavior rather than
unbounded retries. Treat success as evidence only for the executed scope.

## Nix distribution and entrypoints

Add a real executable package wrapping the compiled Node driver and its runtime
closure. Expose the executable as the default package, a named package, and the
default app. Keep explicitly named prepared archive outputs for downstream npm
composition and preserve canonical npm manifests. Audit runtime imports,
including TypeScript used during configuration loading.

Provide thin adapters over the same driver:

| Surface                      | Intended role                                             |
| ---------------------------- | --------------------------------------------------------- |
| Nix formatter                | Default resolved fix workflow on the live working tree.   |
| Nix lint application         | Explicit local check or fix invocation.                   |
| Development-shell executable | The same packaged driver without repeated Nix evaluation. |
| Optional npm scripts         | Compatibility entrypoints with equivalent semantics.      |
| Named Nix check              | Sandboxed non-mutating verification of declared source.   |

The Nix formatter entrypoint runs a flake-selected executable; it does not
itself discover languages or guarantee lint coverage. Making it the fix-first
front door is an intentional MatrixAI convention. No second formatter
multiplexer is required merely to implement that convention.

Finalize adapter names and mode flags during implementation. Keep existing CLI
invocations working; examples of new flags must remain labeled as proposals
until implemented. If check mode is accepted through the formatter adapter,
define mode translation explicitly instead of blindly combining conflicting fix
and check flags.

Operate on the caller's checkout, not the immutable source copy in the store.
Specify root discovery from subdirectories and explicit roots without assuming a
particular Nix version exports a project-root environment variable. Do not
recurse between npm scripts and Nix wrappers. Do not implicitly install project
dependencies, activate a whole development shell, or start services.

## JavaScript configuration boundary

Moving CLI execution into Nix does not automatically remove importable npm
presets and rules. Preserve existing configuration imports until a replacement
is implemented and tested, especially Zeta's custom Tailwind and project-plugin
composition.

Decide whether JS consumers retain a configuration package or use an explicit
preset-composition interface supplied by the driver. Define module resolution,
tool and preset compatibility, project-plugin loading, and version provenance.
Do not rely on global module search hacks or accidentally select a different
local CLI through npm's binary-path precedence.

## Rust behavior

Add useful MatrixAI Rust defaults with repository and CLI overrides. Do not
hardwire compiler-backed linting as permanently outside the default policy, or
require every Rust repository to opt into ordinary supported behavior.

Use ObjLog to resolve formatting, Clippy, target, feature, and workspace policy.
Do not assume all features form one valid or representative build. Report when
Cargo-level execution expands beyond requested files. Keep dependency resolution
locked and supply the declared dependencies for offline hermetic execution.
Compiler-assisted fixes need explicit safety semantics; do not automatically
enable broad dirty-tree or potentially destructive repair options.

## Hermetic proof surface

Pinned local fixing and sandboxed verification share behavior but not mutable
state. A live working-tree fix is intentionally mutating and is not itself a
hermetic derivation. The named Nix check is the reproducible proof boundary.

- Expose stable suite-level leaves under the recognized per-system checks
  namespace. Choose a lint or static suite name consistent with existing checks.
- Integrate routine lint evidence into the explicit default aggregate where
  appropriate. Keep genuinely expensive additional proof profiles named and
  separately selectable without changing ordinary source-detection semantics.
- Use `nix build '.#checks.x86_64-linux.default'` for the routine aggregate on
  the currently declared system, not a broad flake check as the universal
  runner.
- Declare the driver, backends, source, native configurations, and applicable
  npm or Cargo dependency inputs. Do not depend on user-profile binaries,
  network installation, ambient caches, credentials, or active devenv processes.
- Keep human-edited fixtures and tests under [tests](../tests), environment
  adapters under [Nix checks](../nix/checks), and reusable Nix helpers outside
  check-specific leaves.
- Keep source inputs non-mutating in check mode and place backend scratch state
  outside the checked source. Fix-contract tests can use disposable copies.
- Emit concise build logs and a durable structured report with linked backend
  logs, effective policy, tool identity, scope, and outcomes. Generate execution
  and evidence in the same derivation unless a separate boundary is justified.
- Fail actual lint violations. Preserve useful failure logs without converting a
  failed proof into a successful derivation merely to retain report artifacts.

Share command implementation and semantic configuration across local and
sandboxed execution. Do not duplicate backend command logic in check adapters.
Account explicitly for source filtering and unavailable Git metadata so the
sandbox does not silently check a different subset.

## Standards and agent workflow

Make changes in the canonical MatrixAI/matrixai-standards source repository,
then update downstream pins and rematerialize skills. Do not independently edit
vendored standards or generated skill copies as the source of policy.

Coordinate the universal hotset, linting and tooling contracts, affected
profiles, agent templates, a generic workflow skill, and the existing JS/npm
compatibility skill. Ensure the generic skill reaches non-JS repositories
through the profile and ecosystem collections; ObjLog currently selects the Nix
profile.

The common agent policy should state:

> Work in coherent batches. At a useful checkpoint, run the fix workflow over
> the affected scope. Use defaults when they fit; narrow or extend them when
> necessary. A successful fix pass completes that scope's lint gate. Repeat only
> after relevant edits or unresolved diagnostics. Reserve non-mutating checks
> for CI, explicit CI parity, and read-only audits.

Do not interpret fix-first as running before every edit. Do not add a redundant
full check after successful scoped fixing, claim whole-repository success from a
partial pass, or run the full suite after every small edit. Broader validation
is justified by broader changes, such as shared policy or backend configuration.

## Implementation sequence

1. Freeze current behavior with fixtures for discovery, version-2 configuration,
   selectors, backend availability, and existing package exports.
2. Specify and implement layered replacement, extension, subtraction, and
   explanation semantics without silently breaking existing consumers.
3. Normalize backend fix/check contracts and test residual diagnostics,
   non-mutation, bounded convergence, and scope reporting.
4. Build the standalone Nix executable and shared backend environment while
   preserving archive outputs and proving runtime dependency completeness.
5. Add Nix formatter, lint app, shell, npm compatibility, and sandboxed check
   adapters over the same driver. Resolve JS configuration loading before
   removing any npm configuration dependency.
6. Pilot Rust defaults and scope handling with ObjLog; pilot complex JS, SQL,
   Markdown, assets, and custom plugins with Zeta. Use isolated fixtures for
   automated proof rather than requiring private sibling checkouts in js-lint
   CI.
7. Update canonical standards and skills against proven interfaces. Materialize
   and review downstream instruction changes rather than publishing promises
   ahead of supported behavior.
8. Adopt the proven interfaces across the six JS libraries and other approved
   consumers. Coordinate separately authorized Git-only releases in dependency
   order if required; do not move existing tags.

## Acceptance checklist

- [ ] Standard MatrixAI layouts work without mandatory repository configuration.
- [ ] Layered inherit, extend, replace, and remove behavior has compatibility
      tests.
- [ ] Explanation identifies effective policy, provenance, tools, and real
      scope.
- [ ] Required missing backends fail instead of silently reducing coverage.
- [ ] Successful fix mode establishes residual cleanliness for its reported
      scope.
- [ ] Check mode never modifies maintained source, and fix mode is idempotent.
- [ ] Small targeted runs do not silently widen to unrelated domains or roots.
- [ ] Rust scope expansion and feature policy are visible and tested.
- [ ] The executable works in a non-npm consumer without a local npm
      installation.
- [ ] JS preset and project-plugin resolution remains correct and attributable.
- [ ] Local runners and sandboxed checks share behavior and declared tool
      inputs.
- [ ] Named checks produce durable evidence and join an explicit aggregate
      policy.
- [ ] Fixtures cover untracked files, ignored trees, symlinks, nested
      invocation, missing Git metadata, unsupported formats, and backend
      failures.
- [ ] Generic standards and skills teach checkpoint-based scoped fixing without
      redundant checking or npm-only assumptions.
- [ ] Existing prepared archives, package exports, and immutable tags are
      preserved.

## Decisions still requiring implementation design

- Exact additive configuration syntax, CLI spelling, and schema-version
  strategy.
- Final executable package and app names and formatter check-mode ergonomics.
- Backend dependency composition without making repositories duplicate policy in
  both Nix and JSON configuration.
- JS preset distribution and project-plugin compatibility boundaries.
- Rust default target and feature profiles and compiler-assisted fix safety.
- Additional supported source formats and exclusion policy.
- Structured lint report details and stable public proof-suite names.

Incremental caches and automatic changed-file selection are optional later
optimizations. Begin with correct explicit scope and measured costs rather than
introduce another subsystem before the shared contract is proven.
