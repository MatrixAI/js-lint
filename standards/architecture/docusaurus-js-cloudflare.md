# Rules
- [MXS-ARCH-WDOC-001] Scope: Repos using profile `docusaurus-js-cloudflare` (inherits `worker-js-cloudflare`) MUST follow this document. Docusaurus content roots MUST stay at repo top-level `docs/` and `pages/` (not nested under `src/`), matching layouts that render landing and docs from these roots and feed the static pipeline.
- [MXS-ARCH-WDOC-002] Static asset inputs for Docusaurus MUST live under top-level `static/`, keeping family buckets (`static/images/**`, `static/fonts/**`, optional large `static/files/**`) and ensuring `staticDirectories` includes `static` so bundling copies these assets.
- [MXS-ARCH-WDOC-003] Repos with Docusaurus MUST apply Git LFS to binary static assets via root `.gitattributes` patterns `/static/fonts/**`, `/static/images/**`, `/static/files/**` with `filter=lfs diff=lfs merge=lfs -text`, avoiding text diffs on binaries and keeping LFS pointers in history.
- [MXS-ARCH-WDOC-004] Static site builds MUST emit to `./public` (e.g., `docusaurus build --out-dir=./public`), and Wrangler `[site].bucket` MUST point to `./public` so the Worker serves the generated assets.
- [MXS-ARCH-WDOC-005] Cloudflare Worker entrypoint (`main`) MUST remain `src/worker.ts` and be paired with the static bucket declared in `[site]`; Worker logic MUST avoid embedding static assets outside the Wrangler bucket and instead rely on the `public/` output for content delivery. See also [`worker-js-cloudflare.md`](worker-js-cloudflare.md) for Worker-only deployment rules.
- [MXS-ARCH-WDOC-006] Webpack configuration SHOULD support resource-query imports `?raw`, `?inline`, `?url` so assets can be imported as source strings, inline data URLs, or emitted URLs. Pair this with ambient declarations only for those query suffixes (see profile doc) and prefer package-provided types via `compilerOptions.types` instead of `global.d.ts` for package globals.

## Exhibits (non-normative)
- Minimal Docusaurus config fragments for static directories and build output `docusaurus.config.ts`:
  ```ts
  import { Config } from '@docusaurus/types';

  const config: Config = {
    staticDirectories: ['static'],
    onBrokenLinks: 'throw',
    onBrokenMarkdownLinks: 'warn',
    presets: [
      ['classic', {
        docs: { path: 'docs', routeBasePath: 'docs' },
        pages: { path: 'pages' },
      }],
    ],
  };
  
  export default config;
  ```
- Resource-query Webpack rule (pair with SVGR ordering when used):
  ```ts
  // docusaurus.config.ts
  const pluginAssetResources = () => ({
    name: 'asset-resource-queries',
    configureWebpack() {
      return {
        module: {
          rules: [
            { resourceQuery: /raw/, type: 'asset/source' },
            { resourceQuery: /inline/, type: 'asset/inline' },
            { resourceQuery: /url/, type: 'asset/resource', generator: { filename: 'assets/files/[name]-[contenthash].[ext]' } }
          ]
        }
      };
    }
  });
  
  const config: Config = {
    plugins: [pluginAssetResources],
  };
  export default config;
  ```
- Ambient declarations for resource queries (only when such imports exist) `global.d.ts`:
  ```ts
  declare module '*?raw' { const content: string; export default content; }
  declare module '*?inline' { const dataUrl: string; export default dataUrl; }
  declare module '*?url' { const url: string; export default url; }
  ```
- Folder layout snippet for content and static assets `docs/`, `pages/`, `static/`:
  ```
  docs/
    intro.md
  pages/
    index.mdx
  static/
    images/
    fonts/
    files/
  ```
- Deployment pointer linking build output to Wrangler site bucket `wrangler.toml`:
  ```toml
  [site]
  bucket = "./public"
  
  # docusaurus build --out-dir ./public
  ```
