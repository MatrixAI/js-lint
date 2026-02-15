# Rules
- [MXS-ARCH-ONT-001] Maintain `src/` domain folders where domains exist; each domain SHOULD expose a barrel (e.g., `src/locks/index.ts`, `src/tracer/index.ts`) re-exporting its public surface and shared helpers.
- [MXS-ARCH-ONT-002] Keep top-level barrels to frame the public API: `src/index.ts` as the public barrel, `src/types.ts` for shared/public types, `src/errors.ts` for exported error classes/types, `src/events.ts` only when the library is eventful, and `src/utils.ts` for public utilities (avoid leaking deep internals); omit unused files per library.
- [MXS-ARCH-ONT-003] Tests MUST mirror exported domains (class/domain-focused) under `tests/` with matching subjects and barrel coverage.
- [MXS-ARCH-ONT-004] Generated artifacts stay in `dist/`; docs in `docs/`; benches under `benches/` writing to `benches/results/` when present.
- [MXS-ARCH-ONT-005] Public exports of error/event classes MUST be defined locally (per-domain files or `errors.ts`/`events.ts`) and aggregated via barrels; shared bases MAY be local to the library.
- [MXS-ARCH-ONT-006] Use path alias `#*` for intra-repo imports (`imports` map to `./dist/*`, TS `paths` to `src/*`) to avoid brittle relatives and keep ESM compatibility.
- [MXS-ARCH-ONT-007] Package boundaries MUST declare `type: module`, an `exports` map for `.` plus `./*.js` patterns and wildcard passthrough `./*` to `dist`; deep imports are only allowed where the wildcard is intentionally exposed.
- [MXS-ARCH-ONT-008] Module ontology SHOULD favor class-per-file domain objects with shared helpers (`utils`, `types`, optional `errors`, optional `events`) and domain submodules when needed.
- [MXS-ARCH-ONT-009] When a repo uses profile `worker-js-cloudflare`, the Worker deploy surface MUST be treated as architecture (repo boundary / deploy contract): Worker entrypoint [`src/worker.ts`](../profiles/worker-js-cloudflare.md#rules) and Worker module subtree `src/worker/**` define the boundary consumed by Wrangler via `wrangler.toml`; agents MUST route placement/layout decisions for this surface to architecture standards, not coding standards. See also: [`../profiles/worker-js-cloudflare.md`](../profiles/worker-js-cloudflare.md), [`worker-js-cloudflare.md`](worker-js-cloudflare.md).
- [MXS-ARCH-ONT-010] When a repo uses profile `docusaurus-js-cloudflare`, Docusaurus content roots [`docs/`](docusaurus-js-cloudflare.md#rules) and [`pages/`](docusaurus-js-cloudflare.md#rules) MUST be treated as architecture (site surface / content boundary): agents MUST route placement/layout decisions about these roots to architecture standards and MUST NOT classify content-root placement as coding. See also: [`docusaurus-js-cloudflare.md`](docusaurus-js-cloudflare.md), [`../profiles/docusaurus-js-cloudflare.md`](../profiles/docusaurus-js-cloudflare.md).
- [MXS-ARCH-ONT-011] When a repo uses profile `docusaurus-js-cloudflare`, Docusaurus theme override subtree `src/theme/**` MUST be treated as coding (implementation detail) even though its existence is an architectural layout decision: repo ontology SHOULD reserve this path specifically for theme shadowing/overrides and agents SHOULD apply coding standards to its contents, not architecture standards. See also: [`../profiles/docusaurus-js-cloudflare.md`](../profiles/docusaurus-js-cloudflare.md), [`docusaurus-js-cloudflare.md`](docusaurus-js-cloudflare.md).
- [MXS-ARCH-ONT-012] If a repo reserves a future frontend application subtree `src/app/**`, treat it as architecture (repo boundary / separation-of-surfaces): keep it distinct from Worker glue (`src/worker/**`) and from Docusaurus content roots (`docs/`, `pages/`) when present.
- [MXS-ARCH-ONT-013] When a repo uses profile `docusaurus-js-cloudflare`, Git attributes and static-asset handling MUST be treated as architecture: root [`.gitattributes`](docusaurus-js-cloudflare.md#rules) MUST classify Docusaurus static assets for binary-safe diffs/merges (e.g., [`static/fonts/`](docusaurus-js-cloudflare.md#rules), [`static/images/`](docusaurus-js-cloudflare.md#rules), optional [`static/files/`](docusaurus-js-cloudflare.md#rules)); agents MUST route `.gitattributes`/LFS policy for Docusaurus repos to architecture standards, not coding standards. See also: [`docusaurus-js-cloudflare.md`](docusaurus-js-cloudflare.md#rules), [`../profiles/docusaurus-js-cloudflare.md`](../profiles/docusaurus-js-cloudflare.md).

# Notes / anchors
## Exhibits (non-normative)
- Barrel export sketch aggregating domain surface `src/index.ts`:
  ```ts
  export * from './locks/index.js';
  export * from './tracer/index.js';
  export * from './errors.js';
  export * from './types.js';
  ```
- Domain barrel with types/errors utilities `src/locks/index.ts`:
  ```ts
  export { Barrier } from './Barrier.js';
  export type { LockRequest, ContextTimed } from './types.js';
  export { ErrorLockTimedOut } from './errors.js';
  export { setupTimedCancellable } from './utils.js';
  ```
- Package `exports` and `imports` map with ESM + dist wiring `package.json`:
  ```json
  {
    "type": "module",
    "exports": {
      ".": {
        "import": "./dist/index.js",
        "types": "./dist/index.d.ts"
      },
      "./*.js": "./dist/*.js",
      "./*": "./dist/*"
    },
    "imports": {
      "#*": "./dist/*"
    }
  }
  ```
- Test layout mirroring domain barrels `tests/locks/Barrier.test.ts`:
  ```ts
  import { Barrier } from '#locks/Barrier.js';

  describe('locks/Barrier', () => {
    it('blocks until released', async () => {
      const barrier = new Barrier();
      const p = barrier.wait();
      barrier.release();
      await expect(p).resolves.toBeUndefined();
    });
  });
  ```
- Package boundary hint for Worker surface `src/worker/index.ts`:
  ```ts
  export { fetch, scheduled } from './worker.js';
  export type { Env } from './types.js';
  ```
