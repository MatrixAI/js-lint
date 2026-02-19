# Rules
- [MXS-GEN-001] Agents MUST begin from the product repo's `AGENTS.md` (repo root; see template [`../templates/AGENTS.md.template`](../templates/AGENTS.md.template)) and honour the declared profile key in the product repo's `.matrixai/repo-profile.yml` (see template [`../templates/.matrixai/repo-profile.yml.template`](../templates/.matrixai/repo-profile.yml.template)).
- [MXS-GEN-002] Internal reference materials used during synthesis are READ-ONLY and non-portable; treat them as background context only and avoid copying large blocks.
- [MXS-GEN-003] Profile selection MUST be driven by the product repo's `.matrixai/repo-profile.yml`. Supported profiles are documented under [`profiles/`](profiles).
- [MXS-TOOL-001] npm commands MUST be run via package scripts: `npm run build`, `npm test`, `npm run lint`, `npm run lintfix`, `npm run docs`, optional `npm run bench`; scripts MUST wrap the underlying tooling so commands stay consistent.
- [MXS-TOOL-002] For profiles that require tests (e.g. `library-js`, `application-js`), tests MUST be invoked through `npm test` so any required pre-step (e.g. `tsc -p tsconfig.build.json` or equivalent) runs before Jest.
- [MXS-TOOL-003] Linting MUST surface `matrixai-lint`; auto-fix uses `npm run lintfix`.
- [MXS-ARCH-001] Source code MUST live under `src/` with domain subfolders where needed and barrels exporting domain surfaces.
- [MXS-ARCH-002] Tests MUST mirror exported domains under `tests/` with matching subjects (class/domain-focused).
- [MXS-ARCH-003] Public surface MUST be re-exported via `src/index.ts` plus optional `types.ts`, `errors.ts`, `events.ts` to keep a single import locus. Barrels SHOULD prefer direct re-exports (`export ... from`).
- [MXS-ARCH-004] Domain error/event classes MUST be defined in-repo (e.g., `errors.ts` or domain files) and exported through barrels; shared bases may be local to the library.
- [MXS-TS-001] For NodeNext-based profiles (e.g. `library-js`, `application-js`), TypeScript MUST target `ES2022` with `module` + `moduleResolution` `NodeNext`.
- [MXS-TS-002] `strictNullChecks` MUST remain true. Emit behavior is profile-specific (e.g. NodeNext profiles compile to `dist/`; Cloudflare Worker profiles are IDE-only).
- [MXS-TS-003] For `library-js` and `application-js`, internal import specifiers `#*` MUST resolve to `./dist/*` via package `imports`; therefore `#*` MUST be used only by code under `tests/` and those tests MUST run after a build step. TypeScript `paths` MAY map `#*` to `./src/*` for typechecking. This does not apply to `worker-js-cloudflare` or `docusaurus-js-cloudflare`.
- [MXS-TS-004] Decorators MAY be enabled when the library uses them; when enabled keep `experimentalDecorators: true` across TS and Jest/SWC.
- [MXS-TEST-001] Jest config MUST retain SWC transform with module-aware mapper stripping `.js` extensions and setup hooks.
- [MXS-TEST-002] Default test timeout is 20s and should be overridden per slow test via Jest timeouts.
- [MXS-PROF-001] Generated docs MUST avoid external links; cite local paths. Prefer heading anchors (`#some-heading`) over line anchors (`#L123`). Do NOT use `:N` suffixes in Markdown link destinations; treat `:1` and `#L1` as redundant.
- [MXS-GEN-004] All JS/TS repos under these profiles are **ESM-native** by default: builds emit ESM to `dist/`, `type: module` and `exports`/`imports` maps define the boundary; CJS use is an explicit opt-out via profile or override.
- [MXS-GEN-005] Standards and repo configs MUST NOT reference non-vendored or internal-only materials; deliverables MUST remain self-contained and portable.
- [MXS-GEN-006] Agent-generated text artifacts (especially prose/Markdown) MUST prefer plain ASCII when an equivalent exists; avoid typographic Unicode punctuation/symbols. Unicode is allowed only when there is no reasonable ASCII equivalent, or when preserving exact user-provided text.

## ASCII preference (non-normative quick reference)

Prefer these ASCII spellings:

| Category | Prefer |
| --- | --- |
| Smart quotes | `'` and `"` |
| Ellipsis | `...` |
| En dash / em dash | `-` |
| Arrows | `->`, `<-`, `<->`, `=>`, `<=>` |
| Relations | `<=`, `>=`, `!=` |

Quick check (ripgrep + PCRE2):

```sh
rg -nP '\x{2018}|\x{2019}|\x{201C}|\x{201D}|\x{2026}|\x{2013}|\x{2014}|\x{2190}|\x{2192}|\x{2194}|\x{21D0}|\x{21D2}|\x{21D4}|\x{2264}|\x{2265}|\x{2260}' .
```

# Exhibits (non-normative)

Exhibits are non-normative snippets that illustrate how to satisfy the rules. Follow [`exhibit-conventions.md`](exhibit-conventions.md) for sizing and references.

### Exhibit HOTSET-1 - npm scripts shape (supports MXS-TOOL-001/003)
```jsonc
{
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "test": "node ./scripts/test.mjs",
    "lint": "matrixai-lint",
    "lintfix": "matrixai-lint --fix",
    "docs": "typedoc",
    "bench": "node ./scripts/bench.mjs"
  }
}
```

### Exhibit HOTSET-2 - `npm test` wrapper concept (supports MXS-TOOL-002)
```js
// scripts/test.mjs
import { $ } from "execa";

await $`tsc -p tsconfig.build.json`;
await $`node --experimental-vm-modules ./node_modules/.bin/jest`;
```

### Exhibit HOTSET-3 - `tsconfig.json` baseline settings (supports MXS-TS-001/002/004)
```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strictNullChecks": true,
    "noEmit": true,
    "paths": {
      "#*": ["./src/*"],
      "#dist/*": ["./dist/*"]
    },
    "experimentalDecorators": true
  }
}
```

### Exhibit HOTSET-4 - Jest config transform + timeout setup (supports MXS-TEST-001/002)
```js
// jest.config.mjs
const config = {
  transform: {
    "^.+\\.(t|j)sx?$": ["@swc/jest", { module: { type: "es6" } }]
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1"
  },
  setupFilesAfterEnv: ["<rootDir>/tests/setupAfterEnv.ts"],
  testTimeout: 20000
};

export default config;
```

### Exhibit HOTSET-5 - Barrel export pattern (supports MXS-ARCH-001/003)
```ts
// src/index.ts
export * from "./domain/foo";
export * from "./domain/bar";
export * from "./errors";
```
