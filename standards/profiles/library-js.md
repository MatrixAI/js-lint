# Rules
- [MXS-PROF-LIBJS-001] Apply this profile to **ESM-native** Node TypeScript libraries: TS compiles to ESM output in `dist/`, package boundary declares `type: module` plus aligned `exports`/`imports` maps.
- [MXS-PROF-LIBJS-002] Use `npm run build` (tsc -p tsconfig.build.json); if runtime assets exist, copy them postbuild into `dist/`.
- [MXS-PROF-LIBJS-003] Tests MUST run through `npm test`, precompiling with `tsc -p tsconfig.build.json` (or SWC equivalent) then running Jest ESM via SWC.
- [MXS-PROF-LIBJS-004] Lint surface MUST expose `npm run lint` and `npm run lintfix` powered by `matrixai-lint`.
- [MXS-PROF-LIBJS-005] Docs generation MUST wire `npm run docs` to typedoc using build tsconfig; clean `docs/` before generation.
- [MXS-PROF-LIBJS-006] Benchmarks are OPTIONAL; when present they MUST run via build tsconfig and write results under `benches/` or `benches/results/`.
- [MXS-PROF-LIBJS-007] Public API MUST be aggregated through `src/index.ts` plus optional `types.ts`, `errors.ts`, `events.ts`; per-domain barrels SHOULD exist when domains are present.
- [MXS-PROF-LIBJS-008] Directory layout SHOULD keep domain subfolders when domains exist (e.g., handlers, tracer, locks) with matching tests under `tests/`.
- [MXS-PROF-LIBJS-009] TypeScript config MUST target `ES2022`, `moduleResolution`/`module` `NodeNext`, `strictNullChecks: true`, `noEmit: true` in dev; decorators MAY be enabled when used; build overrides only `rootDir`/`noEmit`.
- [MXS-PROF-LIBJS-010] Path alias `#*` MUST resolve to `src/*` in TS and `./dist/*` in package `imports`; use aliases in source and tests.
- [MXS-PROF-LIBJS-011] Jest config MUST keep SWC transform, module-aware mapper stripping `.js`, Node env, and setup hooks; decorator flag only when decorators are used.
- [MXS-PROF-LIBJS-012] Default test timeout is 20s; override per test as needed using Jest timeout parameter.
- [MXS-PROF-LIBJS-013] Shell linting is out of scope for this profile.
- [MXS-PROF-LIBJS-014] Exports map MUST include `.` plus `./*.js` and wildcard `./*` passthrough to `dist/*` for submodules; include `imports` alias `#*`.

## When this profile applies
- Node.js ESM TypeScript libraries publishing `dist/`, using Jest+SWC and `matrixai-lint`.

## Expected layout
- `src/` domain folders as needed (e.g., locks, tracer, handlers); omit domains not relevant to the library.
- Barrel files: `src/index.ts`, optional `src/types.ts`, optional `src/errors.ts`, optional `src/events.ts`, and per-domain `index.ts` that re-export types/utils/errors/events when present.
- Tests mirror domains under `tests/` with matching subjects (class/domain-focused) and barrel coverage.
- Build artifacts in `dist/`; docs in `docs/`; optional benches in `benches/` writing to `benches/results/`.

## Golden commands
- Install: `npm install --package-lock-only --ignore-scripts --silent` (for versioning).
- Build: `npm run build`.
- Test: `npm test` (runs `tsc -p tsconfig.build.json` then Jest ESM via SWC).
- Lint: `npm run lint` / `npm run lintfix`.
- Docs: `npm run docs`.
- Bench: `npm run bench` when present.

## Pointers
- Universal hotset: [`../HOTSET.md`](../HOTSET.md)
- Profile doc: this file.
- TypeScript coding hotset: [`../coding/typescript/HOTSET.md`](../coding/typescript/HOTSET.md)
- Architecture: [`../architecture/repo-ontology.md`](../architecture/repo-ontology.md), [`../architecture/testing-quality.md`](../architecture/testing-quality.md)
- Tooling contract: [`../coding/tooling/linting.md`](../coding/tooling/linting.md)

## Exhibits (non-normative)
- Exhibit: library-js scripts shape

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "test": "npm test",
    "lint": "matrixai-lint",
    "lintfix": "matrixai-lint --fix",
    "docs": "typedoc --tsconfig ./tsconfig.build.json --out ./docs",
    "bench": "tsx ./benches/index.ts"
  }
}
```

- Exhibit: library-js layout sketch

```
src/
  index.ts
  types.ts (optional)
  errors.ts (optional)
  events.ts (optional)
  <domain>/**
tests/
  <domain>/*.test.ts
dist/
docs/
benches/ (optional)
```
