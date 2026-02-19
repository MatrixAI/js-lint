# Templates guide

## Purpose
- Provide a minimal, repo-agnostic starter set for new repositories.
- Separate **baseline** files (always present) from **profile overlays** (language/toolchain specific).

## Baseline files (always include)
- [.editorconfig](.editorconfig.template) - enforce LF, 2-space indent, trim whitespace.
- [.gitignore](.gitignore.template) - general ignores; includes `/.direnv` ignore and `.env*` ignore with `!.envrc` and `!.env.example` so local env files stay uncommitted while examples remain tracked.
- [.envrc](.envrc.template) - direnv entrypoint; uses `use flake` and optionally loads `.envr` for local-only overrides.
- [AGENTS.md](AGENTS.md.template) - entrypoint for automation; fill golden commands per repo.
- [.aider.conf.yml](.aider.conf.yml.template) - aider wiring; points aider at repo-root `AGENTS.md`.
- [./.matrixai/repo-profile.yml](.matrixai/repo-profile.yml.template) - select profile (`library-js` default; others listed inside template).
- [flake.nix](flake.nix.template) - minimal devshell using indirect `nixpkgs-matrix` + `flake-utils`; no language-specific hooks. Do **not** add `flake.lock` unless you intend to pin.

Generated artifacts (do **not** template):
- `package-lock.json` (or other lockfiles) - generate after choosing profile overlays and installing deps.
- Build artifacts (`dist/`, `docs/`, `benches/results/`, etc.)

## Profile overlays
- `library-js`: Node/TS ESM library starter ([package.json](library-js/package.json.template)); align commands with [`../standards/coding/tooling/tooling-contract.md`](../standards/coding/tooling/tooling-contract.md) and [`../standards/profiles/library-js.md`](../standards/profiles/library-js.md).
- `application-js`: Node/TS CLI starter ([package.json](application-js/package.json.template)); align with [`../standards/profiles/application-js.md`](../standards/profiles/application-js.md).
- `worker-js-cloudflare`: Cloudflare Worker overlay ([package.json](worker-js-cloudflare/package.json.template)); pair with profile doc [`../standards/profiles/worker-js-cloudflare.md`](../standards/profiles/worker-js-cloudflare.md).
- `docusaurus-js-cloudflare`: Cloudflare + Docusaurus overlay ([package.json](docusaurus-js-cloudflare/package.json.template), [.gitattributes](docusaurus-js-cloudflare/.gitattributes.template)); pair with profile doc [`../standards/profiles/docusaurus-js-cloudflare.md`](../standards/profiles/docusaurus-js-cloudflare.md).
- Add additional overlays by creating subfolders under `templates/<profile>/` with only the files that differ from baseline.

## How to apply
1) Copy baseline files into the new repo root and fill placeholders (golden commands, profile selection). When using Nix flakes + direnv, keep `.envrc` committed, use `.envr` for local secrets/overrides (gitignored), and never commit `/.direnv`.
2) Choose a profile overlay and copy its files; extend [.gitignore](.gitignore.template) if the language/toolchain needs more ignores. For Cloudflare profiles, the overlays include:
   - `worker-js-cloudflare`: TypeScript config (`tsconfig.json.template`) with `types` set to `node` and `@cloudflare/workers-types` (nodejs_compat), plus `@types/node` and `@cloudflare/workers-types` in devDependencies.
   - `docusaurus-js-cloudflare`: TypeScript config with Docusaurus + Worker ambient `types`, optional `global.d.ts` stubs for resource-query imports (`?raw`, `?inline`, `?url`), and Webpack-friendly typing. Remove `global.d.ts` if you do not use those queries.
3) Install dependencies and generate lockfiles (e.g., `npm install --package-lock-only --ignore-scripts` inside your chosen toolchain env).
4) Verify commands follow the tooling contract and profile rules before first commit.

## Notes
- Keep templates repo-agnostic: avoid hardcoding product names or subsystems; cite commands/paths explicitly when adding new overlays.
- If a project is not JS, start from baseline and add a new overlay directory for that language with its own minimal files.
