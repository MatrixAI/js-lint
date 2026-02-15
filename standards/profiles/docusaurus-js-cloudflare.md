# Rules
- [MXS-PROF-DOCUSAURUS-CF-001] This profile inherits all `worker-js-cloudflare` requirements (Worker deploy contract + layout) and adds Docusaurus-specific requirements. Placement: Architecture (coding-in-the-large).
- [MXS-PROF-DOCUSAURUS-CF-002] Canonical Docusaurus content roots MUST be top-level `pages/` and `docs/` (not nested under `src/`). Placement: Architecture (coding-in-the-large).
- [MXS-PROF-DOCUSAURUS-CF-003] Docusaurus theme overrides MUST live under `src/theme/**` (classic theme shadowing). Placement: Coding (coding-in-the-small).
- [MXS-PROF-DOCUSAURUS-CF-004] Static asset inputs for Docusaurus MUST live under top-level `static/` and binary static assets under `static/fonts/**`, `static/images/**`, `static/files/**` MUST be tracked with Git LFS and marked `-text` via `.gitattributes`. Placement: Architecture (coding-in-the-large).
- [MXS-PROF-DOCUSAURUS-CF-005] Static site builds MUST emit to `./public` and Wrangler `[site].bucket` MUST point to `./public`. Placement: Architecture (coding-in-the-large).
- [MXS-PROF-DOCUSAURUS-CF-006] Repos SHOULD support Webpack resource-query imports `?raw`, `?inline`, `?url` (e.g. via a rule or plugin) so assets can be loaded as source, inline data URLs, or emitted URLs. Placement: Architecture (coding-in-the-large).
- [MXS-PROF-DOCUSAURUS-CF-007] Ambient declarations for resource queries belong in a root `global.d.ts` only when those queries are used, and that file SHOULD contain only non-package ambient stubs (e.g. `declare module '*?raw'`). Package-provided globals (e.g. Docusaurus types, Cloudflare types) MUST be included through `tsconfig.json` `compilerOptions.types`, not via `global.d.ts`. Placement: Coding (coding-in-the-small).

## When this profile applies
- A Docusaurus site deployed via Cloudflare Wrangler.
- A Worker exists as the runtime deploy surface.

## Expected layout
- Everything from profile [`worker-js-cloudflare.md`](worker-js-cloudflare.md).
- Docusaurus content roots: top-level `docs/` and `pages/`.
- Theme overrides: `src/theme/**`.
- Static assets: `static/**`.
- Static build output: `public/**`.

## Golden commands
- Dev server: `npm run dev` (Wrangler dev).
- Build static site: `npm run build` (Docusaurus build output to `./public`).
- Deploy: `npm run deploy`.
- Lint: `npm run lint`; Autofix: `npm run lintfix`.

## Pointers
- Universal hotset: [`../HOTSET.md`](../HOTSET.md)
- Worker-only architecture: [`../architecture/worker-js-cloudflare.md`](../architecture/worker-js-cloudflare.md)
- Docusaurus + Worker architecture: [`../architecture/docusaurus-js-cloudflare.md`](../architecture/docusaurus-js-cloudflare.md)
- Tooling contract: [`../coding/tooling/tooling-contract.md`](../coding/tooling/tooling-contract.md)
