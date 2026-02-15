# Rules
- [MXS-ARCH-CFW-001] Scope: Repos using profile `worker-js-cloudflare` (no Docusaurus/static bucket) MUST follow this document; when a repo also ships Docusaurus/static buckets, see [`docusaurus-js-cloudflare.md`](docusaurus-js-cloudflare.md) for static-asset/LFS/bucket policy.
- [MXS-ARCH-CFW-002] Root `wrangler.toml` is the canonical deploy contract: declare `name`, `main`, `compatibility_flags`, `compatibility_date`, `routes`, optional `[site]`, and all bindings. Source layout MUST NOT fork per environment; environment differences live in `[env.*]`.
- [MXS-ARCH-CFW-003] Entrypoint MUST be `main = "src/worker.ts"`; Worker modules belong under `src/worker/**` and the default export defines `fetch` (and `scheduled` when used). Legacy `main = "server/worker.ts"` SHOULD be migrated.
- [MXS-ARCH-CFW-004] Environment configuration MUST use `[env.staging]` and `[env.master]` as the canonical pair; add other envs only when justified (e.g., `[env.dev]`). Do NOT branch source directories per env.
- [MXS-ARCH-CFW-005] Routes MAY be custom-domain subdomain roots with `custom_domain = true` or explicit path patterns; a repo MUST be internally consistent across all envs. Use subdomain roots for whole-site Workers; use path patterns for mounted docs/API segments.
- [MXS-ARCH-CFW-006] Compatibility surface MUST be pinned: set `compatibility_date` and required `compatibility_flags` (e.g., `nodejs_compat`) in root, optionally overriding per `[env.*]` when an env must advance.
 - [MXS-ARCH-CFW-006] Compatibility surface MUST be pinned: set `compatibility_date` and required `compatibility_flags` (e.g., `nodejs_compat`) in root, optionally overriding per `[env.*]` when an env must advance. When `nodejs_compat` is set, ambient types MUST include both `node` and `@cloudflare/workers-types` (via `tsconfig.json`) and `package.json` MUST carry `@types/node` (devDependency) so Node globals are available to tooling.
- [MXS-ARCH-CFW-007] Cloudflare subsystems (durable objects, KV, R2, D1, queues, cron triggers) MUST be declared in `wrangler.toml` at root, with env-specific bindings nested under `[env.*]` when differing. Treat these bindings as architecture boundaries; Worker code MAY import the injected bindings but MUST NOT redefine them in source.
- [MXS-ARCH-CFW-008] Source layout: keep Worker logic and composition in `src/worker.ts` plus `src/worker/**` modules (handlers, middleware, bindings/schema types). Avoid placing Worker code under `pages/` or `docs/`.
- [MXS-ARCH-CFW-009] Static site buckets are optional; when present, `[site].bucket` SHOULD point to `./public` and Worker code SHOULD serve dynamic APIs only, delegating static responses to Wrangler's bucket plumbing. When Docusaurus is present, follow [`docusaurus-js-cloudflare.md`](docusaurus-js-cloudflare.md) for bucket and LFS rules.
- [MXS-ARCH-CFW-010] Scheduled and queue-driven behaviors belong in the Worker entry (e.g., `scheduled` export) with bindings defined in `wrangler.toml`; avoid env-specific source forks.
- [MXS-ARCH-CFW-011] Router composition SHOULD use `itty-router` (e.g., `ittyRouter.AutoRouter()`) and invoke `router.fetch(request, env, ctx, container)` so handlers/middleware can depend on the IoC container alongside Cloudflare bindings.
- [MXS-ARCH-CFW-012] Non-trivial Workers SHOULD provide a singleton IoC container (e.g., `Container.createContainer`) that receives `env`, surfaces shared services (logging, storage clients, configs), and is passed into `router.fetch`; container lifecycle SHOULD define `start`/`destroy` boundaries for reuse across requests.
- [MXS-ARCH-CFW-013] Env typing SHOULD be split: define runtime config in `src/types.ts` (e.g., `ServerConfig`) and compose with Cloudflare bindings in `src/worker/types.ts` as `Env = ServerConfig & ServerBindings`, keeping only injected bindings in the Worker-layer types.
- [MXS-ARCH-CFW-014] Recommended dependencies for the router+container pattern are `itty-router`, `@matrixai/async-init`, and `@matrixai/logger`; equivalent alternatives are acceptable but SHOULD provide the same IoC + logging capabilities.

## Exhibits (non-normative)
- Minimal `wrangler.toml` layout with env overrides `wrangler.toml`:
  ```toml
  name = "example-worker"
  main = "src/worker.ts"
  compatibility_date = "2024-12-15"
  compatibility_flags = ["nodejs_compat"]

  routes = [
    { pattern = "api.example.com", custom_domain = true },
    { pattern = "example.com/docs/*" },
  ]

  [site]
  bucket = "./public"

  [[kv_namespaces]]
  binding = "KV_CACHE"
  id = "<production-kv-id>"

  [env.staging]
  routes = [{ pattern = "staging.api.example.com", custom_domain = true }]
  [[env.staging.kv_namespaces]]
  binding = "KV_CACHE"
  id = "<staging-kv-id>"
  ```
- Worker entry with `fetch` and `scheduled` surfaces `src/worker.ts`:
  ```ts
  const worker = {
    async fetch(request, env, ctx) {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
      const data = await env.KV_CACHE.get('status');
      return new Response(JSON.stringify({ status: data ?? 'ok' }), { headers: { 'content-type': 'application/json' } });
    },

    async scheduled(event, env, ctx) {
      ctx.waitUntil(env.KV_CACHE.put('status', 'ok', { expirationTtl: 60 * 10 }));
    },
  } satisfies ExportedHandler<{ KV_CACHE: KVNamespace }>;

  export default worker;
  ```
- Router + container + middleware composition (example) `src/worker.ts`:
  - Why middleware: keep cross-cutting concerns (e.g., CORS response shaping, auth, error normalization) out of individual route handlers and compose them once at the entrypoint.
  ```ts
  const router = ittyRouter.AutoRouter();
  // Example routes only: pick paths that match your API surface.
  router.options('*', handlers.handleCORSPreflight);
  router.get('/health', handlers.healthGet);
  router.get('/api/*', handlers.apiGet);
  router.head('/api/*', handlers.apiHead);
  router.all('*', () => new Response('Not Found', { status: 404 }));

  const worker = {
    async fetch(request, env, ctx) {
      const container = await Container.createContainer({ env });
      let response: Response;
      try {
        response = await router.fetch(request as IRequest, env, ctx, container);
      } catch (e) {
        response = new Response(JSON.stringify({ type: 'Error', message: e.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // Example middleware: set CORS headers on non-preflight responses.
      if (request.method !== 'OPTIONS') {
        return middleware.modifyResponseWithCORS(response, request);
      }
      return response;
    },
  };

  export default worker;
  ```
- Env typing split (example) `src/types.ts` and `src/worker/types.ts`:
  ```ts
  // src/types.ts
  type ServerConfig = {
    BASIC_AUTH_USERNAME: string;
    BASIC_AUTH_PASSWORD: string;
  };
  export type { ServerConfig };

  // src/worker/types.ts
  import type { ServerConfig } from '../types';
  type ServerBindings = { R2_BUCKET_CACHE: R2Bucket };
  type Env = ServerConfig & ServerBindings;
  export type { Env, ServerBindings };
  ```
- Container singleton pattern (example) `src/worker/Container.ts`:
  ```ts
  @createDestroyStartStop.CreateDestroyStartStop()
  class Container {
    protected static instance?: Container;
    public static async createContainer({ env }: { env: Env }) {
      if (this.instance != null) return this.instance;
      this.instance = new Container(env);
      return this.instance;
    }

    protected env: Env;
    public constructor(env: Env) {
      this.env = env;
    }

    public get logger(): Logger {
      // derive level from env, create StreamHandler
    }
  }
  export default Container;
  ```
- Durable object binding and class placement `src/worker/objects/counter.ts`:
  ```ts
  export class Counter {
    state; env;
    constructor(state, env) {
      this.state = state; this.env = env;
    }
    async fetch() {
      const n = (await this.state.storage.get<number>('n')) ?? 0;
      const next = n + 1;
      await this.state.storage.put('n', next);
      return new Response(String(next));
    }
  }
  ```
