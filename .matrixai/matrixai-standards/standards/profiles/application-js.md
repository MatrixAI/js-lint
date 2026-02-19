# Rules
- [MXS-PROF-APPJS-001] Apply this profile to **ESM-native** Node TypeScript CLI applications: TS compiles to ESM output in `dist/`, package boundary declares `type: module`, provides `exports`, and exposes `bin` pointing to built CLI entrypoints.
- [MXS-PROF-APPJS-002] Build MUST run through `npm run build`, executing a Node wrapper that emits `dist/` from `src/` with `tsconfig.build.json`.
- [MXS-PROF-APPJS-003] Tests MUST run via `npm test` using a wrapper that runs `tsc -p tsconfig.build.json` then Jest with SWC transform, Node environment, junit reporter, and global setup/teardown/hooks.
- [MXS-PROF-APPJS-004] Lint surface MUST expose `npm run lint`, `npm run lintfix` powered by `matrixai-lint`.
- [MXS-PROF-APPJS-005] Docs generation MUST remain `npm run docs` invoking typedoc with `tsconfig.build.json` outputting to `docs/`.
- [MXS-PROF-APPJS-006] Runtime invocations in dev MUST wrap CLI arguments as `npm run <bin> -- <args>` to ensure npm passes through to the built binary.
- [MXS-PROF-APPJS-007] TypeScript config MUST target `ES2022`, use `module`/`moduleResolution` `NodeNext`, `baseUrl: ./src`, `paths` alias `#*`, `experimentalDecorators: true`, `strictNullChecks: true`, `noEmit: true` in dev; build overrides only `noEmit`/`rootDir`.
- [MXS-PROF-APPJS-008] Jest globals MUST define default timeouts (20s) and tmpDir via `globals` with setup scripts `tests/globalSetup.ts`, `tests/setup.ts`, `tests/setupAfterEnv.ts`, `tests/globalTeardown.ts`.
- [MXS-PROF-APPJS-009] Directory layout MUST keep command domains under `src/` (agent, bootstrap, identities, keys, nodes, notifications, secrets, vaults, utils, audit, auth) with barrel `src/index.ts` exporting per-domain entrypoints.
- [MXS-PROF-APPJS-010] Tests MUST mirror command domains under `tests/` with utility harnesses (`tests/utils/*.ts`, `tests/setup*.ts`) and integration suites (e.g., Docker under `tests/integration/docker/`).
- [MXS-PROF-APPJS-011] Watch-mode development SHOULD rely on `nodemon.json` watching `src`, `package.json`, `tsconfig.json` with `ts,js,json` extensions.
- [MXS-PROF-APPJS-012] Packaging for distribution SHOULD retain `pkg` assets list for native deps and any build-time manifest files placed under `dist/`.

## When this profile applies
- Node.js ESM TypeScript CLI applications that publish runnable binaries (`bin` entries) and ESM exports, built with custom build scripts plus Jest+SWC and `matrixai-lint`.

## Expected layout
- `src/` domain folders: `agent/`, `bootstrap/`, `identities/`, `keys/`, `nodes/`, `notifications/`, `secrets/`, `vaults/`, `utils/`, plus supporting `audit/`, `auth/`, `Command*.ts`, `polykey.ts`, `errors.ts`, `types.ts`, any worker manifest files, and a barrel at `src/index.ts` exporting per-domain entrypoints.
- Tests mirror domains under `tests/` with global harness files (`globalSetup.ts`, `setup.ts`, `setupAfterEnv.ts`, `globalTeardown.ts`) and integration suites under `tests/integration/docker/` (or equivalent integration roots).
- Build artifacts in `dist/`; docs in `docs/`; tmp outputs under `tmp/jest` and `tmp/junit` as per Jest config.
- Local dev env (when using Nix flakes + direnv): keep `.envrc` committed (loads `use flake` and optional `.envr`), keep `.envr` local-only (gitignored), and never commit `/.direnv`.

## Golden commands
- Install deps: `npm install` (within `nix develop` when applicable).
- Build: `npm run build`.
- Test: `npm test`.
- Lint: `npm run lint` / `npm run lintfix`.
- Docs: `npm run docs`.
- Run CLI in dev: `npm run <bin> -- <args>`.
- Start convenience script: `npm run start` (builds then runs built entrypoint with arguments).
- Package binary (optional): `npm run pkg`.

## Pointers
- Universal hotset: [`../HOTSET.md`](../HOTSET.md)
- Profile doc: this file.
- Architecture: [`../architecture/repo-ontology.md`](../architecture/repo-ontology.md), [`../architecture/testing-quality.md`](../architecture/testing-quality.md)
- TypeScript coding hotset: [`../coding/typescript/HOTSET.md`](../coding/typescript/HOTSET.md)
- Tooling contract: [`../coding/tooling/linting.md`](../coding/tooling/linting.md)

## Exhibits (non-normative)
- Exhibit: application-js scripts shape

```json
{
  "scripts": {
    "build": "node ./scripts/build.mjs",
    "test": "node ./scripts/test.mjs",
    "lint": "matrixai-lint",
    "lintfix": "matrixai-lint --fix",
    "docs": "typedoc --tsconfig ./tsconfig.build.json --out ./docs",
    "polykey": "node ./dist/polykey.mjs",
    "pkg": "node ./scripts/pkg.mjs"
  }
}
```

- Exhibit: application-js layout sketch

```
src/
  index.ts
  agent/**
  bootstrap/**
  identities/**
  keys/**
  nodes/**
  notifications/**
  secrets/**
  vaults/**
  utils/**
  audit/**
  auth/**
tests/
  globalSetup.ts
  setup.ts
  setupAfterEnv.ts
  globalTeardown.ts
  integration/docker/*.test.ts
dist/
docs/
tmp/jest/
tmp/junit/
```
