# Rules
- [MXS-PROF-WORKER-CF-001] Cloudflare Worker entrypoint MUST be defined in `wrangler.toml` with `compatibility_flags = ["nodejs_compat"]`, an explicit `compatibility_date`, `main` pointing to the Worker module, and `[env.*]` per deploy target. Placement: Architecture (coding-in-the-large). See also Worker-only architecture rules in [`../architecture/worker-js-cloudflare.md`](../architecture/worker-js-cloudflare.md).
- [MXS-PROF-WORKER-CF-002] Worker entrypoint file MUST be `src/worker.ts`, with Worker modules colocated under `src/worker/**` (handlers, middleware, bindings). Placement: Architecture (coding-in-the-large).
- [MXS-PROF-WORKER-CF-003] Cloudflare Worker repos MUST NOT assume Docusaurus content roots (`docs/`, `pages/`) or theme overrides (`src/theme/**`). Use profile `docusaurus-js-cloudflare` when a Docusaurus site exists. Placement: Architecture (coding-in-the-large).
- [MXS-PROF-WORKER-CF-004] TypeScript is IDE-only: `noEmit: true`, `moduleResolution: "bundler"`, `module: "ESNext"`, `target: "ES2022"`. Placement: Coding (coding-in-the-small).
- [MXS-PROF-WORKER-CF-005] Linting surface MUST expose `npm run lint` and `npm run lintfix` powered by `matrixai-lint`. Placement: Coding (coding-in-the-small).
 - [MXS-PROF-WORKER-CF-006] Tests are OPTIONAL; when present they SHOULD live under `tests/` and mirror Worker domains; validation defaults to lint/typecheck when no test script exists. Placement: Coding (coding-in-the-small).
 - [MXS-PROF-WORKER-CF-007] `package.json` SHOULD place all npm packages under `devDependencies`; `dependencies` SHOULD be empty/omitted because Workers are bundled for deploy. Rare exceptions MUST document the runtime install requirement (e.g. explicit README or `./.matrixai/repo-profile.yml`). CI MUST install devDependencies (do not use `npm ci --omit=dev`). Placement: Coding (coding-in-the-small).
 - [MXS-PROF-WORKER-CF-008] Router/IoC/env typing SHOULD follow the Cloudflare Worker architecture overlay: `itty-router` with `(request, env, ctx, container)` call signature, singleton IoC container seeded from `env`, and split `ServerConfig` + `ServerBindings` composing `Env`. Recommended deps: `itty-router`, `@matrixai/async-init`, `@matrixai/logger` (equivalent alternatives allowed). Placement: Architecture (coding-in-the-large).
 - [MXS-PROF-WORKER-CF-009] TypeScript ambient surface MUST include both `node` and `@cloudflare/workers-types` via `compilerOptions.types` in `tsconfig.json` whenever the Worker uses `compatibility_flags = ["nodejs_compat"]` in `wrangler.toml`. Placement: Coding (coding-in-the-small).
 - [MXS-PROF-WORKER-CF-010] When `nodejs_compat` is enabled, `package.json` MUST declare `@types/node` (devDependency) so IDEs and typecheckers see Node ambient types; do not add other global types here that packages already ship. Placement: Coding (coding-in-the-small).

## When this profile applies
- Cloudflare Worker applications built with Wrangler.
- No Docusaurus site is shipped.

## Expected layout
- `wrangler.toml` at repo root declaring `main = "src/worker.ts"`, `compatibility_flags = ["nodejs_compat"]`, `compatibility_date`, and optional `[env.*]` blocks.
- Worker entry at `src/worker.ts` with Worker modules under `src/worker/**`.
- `package.json` with scripts `dev`, `deploy`, `lint`, `lintfix`, and any project-specific tasks.
- `tsconfig.json` using `moduleResolution: "bundler"`, `noEmit: true`, and `ES2022` libs for IDE tooling only.
- Local dev env (when using Nix flakes + direnv): keep `.envrc` committed (loads `use flake` and optional `.envr`), keep `.envr` local-only (gitignored), and never commit `/.direnv`.

## Golden commands
- Dev server: `npm run dev` (invokes `wrangler dev`, pass-through args supported).
- Deploy: `npm run deploy` (deploys via Wrangler, pass-through args supported).
- Lint: `npm run lint`; Autofix: `npm run lintfix`.
- Tests: not required; run only if a project adds them.

## Acceptance checklist
- `package.json` has no runtime `dependencies` block (or it is empty); all packages live in `devDependencies`.
- CI installs devDependencies (avoid `npm ci --omit=dev`); bundling relies on them.
- Any rare runtime-install exception is justified and documented (link from README or `./.matrixai/repo-profile.yml`).
- Bundling output is produced from the dev surface (Wrangler build) with no additional runtime npm install step.

## Notes / optional layers (non-normative)
- Wrangler optional layers such as durable objects, migrations, cron triggers, KV/R2/D1 bindings MAY appear and should be treated as project-specific configuration.

## Exhibits (non-normative)
- `tsconfig.json` ambient types for nodejs_compat Workers:
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "ESNext",
      "moduleResolution": "Bundler",
      "types": ["node", "@cloudflare/workers-types"],
      "noEmit": true
    },
    "include": ["./src/**/*", "./scripts/**/*"]
  }
  ```
- `package.json` devDependency for Node ambient types when `nodejs_compat` is set:
  ```json
  {
    "devDependencies": {
      "@types/node": "^22.19.11",
      "@cloudflare/workers-types": "^4.20250724.0"
    }
  }
  ```

## Pointers
- Universal hotset: [`../HOTSET.md`](../HOTSET.md)
- Worker-only architecture: [`../architecture/worker-js-cloudflare.md`](../architecture/worker-js-cloudflare.md)
- Tooling contract: [`../coding/tooling/tooling-contract.md`](../coding/tooling/tooling-contract.md)
