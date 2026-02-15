# Tooling contract reference (library-js, application-js, worker-js-cloudflare, docusaurus-js-cloudflare)

# Rules
- [MXS-TOOL-CON-001] Scope: this tooling contract applies to downstream JS repos using profiles `library-js`, `application-js`, `worker-js-cloudflare`, and `docusaurus-js-cloudflare`.
- [MXS-TOOL-CON-002] This document is authoritative for the tooling contract. Plans and migration notes are non-normative.
- [MXS-TOOL-CON-003] Lint rules live in [`linting.md`](linting.md); this document defines **test/docs/bench/build/dev/deploy** contract expectations and artifacts per profile.
- [MXS-TOOL-CON-004] Where this document specifies an npm script contract, repos MUST implement the script with the same spelling and MUST support pass-through arguments via `npm run <script> -- <args>`.

## Test contract (library-js baseline)
- [MXS-TOOL-CON-101] Repos using profile `library-js` MUST run tests via `npm test`.
- [MXS-TOOL-CON-102] `npm test` MUST compile first using `tsc -p ./tsconfig.build.json` (or an equivalent compilation step) and then run Jest in ESM mode via SWC.
- [MXS-TOOL-CON-103] `npm test` MUST pass through CLI flags and positional test paths to Jest (e.g., `npm test -- --ci --coverage tests/...`).
- [MXS-TOOL-CON-104] Test runs MUST write JUnit XML to `./tmp/junit/junit.xml`.
- [MXS-TOOL-CON-105] When coverage is enabled, test runs SHOULD write Cobertura XML to `./tmp/coverage/cobertura-coverage.xml` (or another Cobertura XML filename under `./tmp/coverage/`).
- [MXS-TOOL-CON-106] If a CI test-job generator exists (e.g., `./scripts/check-test-generate.sh`), it MUST emit per-directory jobs that run `npm test -- --ci --coverage <test_files...>` under the repo's CI environment and publish the same JUnit and coverage artifacts.

## Docs contract (library-js)
- [MXS-TOOL-CON-111] Repos using profile `library-js` MUST expose `npm run docs`.
- [MXS-TOOL-CON-112] `npm run docs` MUST clean `./docs` prior to generation and MUST invoke TypeDoc using `./tsconfig.build.json`, outputting to `./docs`.
- [MXS-TOOL-CON-113] Docs artifacts are `./docs/**` per [`../../architecture/repo-ontology.md`](../../architecture/repo-ontology.md#rules).

## Bench contract (optional, library-js)
- [MXS-TOOL-CON-121] Benchmarks are OPTIONAL for profile `library-js`.
- [MXS-TOOL-CON-122] When benchmarks are present, repos MUST expose `npm run bench`.
- [MXS-TOOL-CON-123] `npm run bench` MUST run using the build TypeScript configuration (or equivalent) and MUST write results under `./benches/results/**`.
- [MXS-TOOL-CON-124] When `./benches/results/` exists, `npm run bench` SHOULD remove prior results before writing new ones.

## Build contract (library-js)
- [MXS-TOOL-CON-131] Repos using profile `library-js` MUST expose `npm run build`.
- [MXS-TOOL-CON-132] `npm run build` MUST clean `./dist` then compile using `tsc -p ./tsconfig.build.json`.
- [MXS-TOOL-CON-133] A `postbuild` step MAY copy runtime assets into `./dist/`.
- [MXS-TOOL-CON-134] Build artifacts are `./dist/**` per [`../../architecture/repo-ontology.md`](../../architecture/repo-ontology.md#rules).

---

## Test contract (application-js baseline)
- [MXS-TOOL-CON-201] Repos using profile `application-js` MUST run tests via `npm test`.
- [MXS-TOOL-CON-202] `npm test` MUST compile first using `tsc -p ./tsconfig.build.json` (or an equivalent compilation step) and then run Jest via SWC.
- [MXS-TOOL-CON-203] `npm test` MUST pass through CLI flags and positional test paths to Jest.
- [MXS-TOOL-CON-204] Test runs MUST write JUnit XML to `./tmp/junit/junit.xml`.
- [MXS-TOOL-CON-205] Coverage is OPTIONAL; when enabled, coverage SHOULD be written under `./tmp/coverage/`.

## Docs contract (application-js)
- [MXS-TOOL-CON-211] Repos using profile `application-js` MUST expose `npm run docs` generating TypeDoc output to `./docs/**`.

## Build contract (application-js)
- [MXS-TOOL-CON-221] Repos using profile `application-js` MUST expose `npm run build` producing build artifacts under `./dist/**`.
- [MXS-TOOL-CON-222] The build process MAY be implemented via a Node wrapper (e.g., `node ./scripts/build.mjs`) that compiles via `./tsconfig.build.json` and then performs application bundling.
- [MXS-TOOL-CON-223] Packaging is OPTIONAL; when present, repos SHOULD expose `npm run pkg`.

---

## Dev contract (Cloudflare)
- [MXS-TOOL-CON-301] Repos using Cloudflare profiles (`worker-js-cloudflare`, `docusaurus-js-cloudflare`) MUST expose `npm run dev`.
- [MXS-TOOL-CON-302] `npm run dev` MUST invoke `wrangler dev` and MUST forward CLI flags and arguments.
- [MXS-TOOL-CON-303] When a repo uses schema-driven env configuration for local development, `npm run dev` SHOULD generate `.dev.vars` (or equivalent Wrangler env file) before invoking `wrangler dev`.
- [MXS-TOOL-CON-304] If local TLS assets are generated, they MUST be written under `./tmp/`.

## Build contract (Cloudflare)
- [MXS-TOOL-CON-311] When a static site exists, `npm run build` MUST emit build output to `./public/**`.
- [MXS-TOOL-CON-312] When a static site exists, `wrangler.toml` MUST set `[site].bucket = "./public"` so Wrangler serves the built assets.
- [MXS-TOOL-CON-313] Static site artifacts are `./public/**` per [`../../architecture/repo-ontology.md`](../../architecture/repo-ontology.md#rules).

## Deploy contract (Cloudflare)
- [MXS-TOOL-CON-321] Repos using Cloudflare profiles (`worker-js-cloudflare`, `docusaurus-js-cloudflare`) MUST expose `npm run deploy`.
- [MXS-TOOL-CON-322] `npm run deploy` MUST deploy via Wrangler and MUST forward CLI flags and arguments.
- [MXS-TOOL-CON-323] If `npm run deploy` performs secret management (e.g., `wrangler secret bulk`), it SHOULD apply secrets before invoking the deploy command.
- [MXS-TOOL-CON-324] Feature deploy flows MAY create transient backup files (e.g., `./wrangler.toml.bak`) but MUST restore the original configuration and MUST clean up transient backups.

## Test contract (Cloudflare)
 - [MXS-TOOL-CON-331] Tests are OPTIONAL for Cloudflare profiles.
 - [MXS-TOOL-CON-332] When tests are present, repos SHOULD expose `npm test`.

## Profile mapping

These Cloudflare contract rules apply to:

- `worker-js-cloudflare`
- `docusaurus-js-cloudflare`

---

## Out of scope (deferred)
- Profiles not covered above remain deferred pending additional profile documentation.

## Exhibits (non-normative)
- Exhibit: test invocation shape

```sh
# library-js and application-js
npm test -- --ci --coverage tests/index.test.ts
```

- Exhibit: expected artifact locations

```
tmp/
  junit/junit.xml
  coverage/cobertura-coverage.xml
```

- Exhibit: docs invocation shape

```sh
npm run docs
# implementation detail: clean ./docs then typedoc using ./tsconfig.build.json
```

- Exhibit: cloudflare dev/deploy pass-through

```sh
npm run dev -- --local
npm run deploy -- --env production
```
