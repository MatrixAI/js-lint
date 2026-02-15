# Rules
- [MXS-TS-HOT-001] Target `ES2022` with `module` and `moduleResolution` `NodeNext`; do not downgrade targets.
- [MXS-TS-HOT-002] Keep `strictNullChecks: true`; `noImplicitAny` MAY remain false if inherited; `noEmit: true` in dev, emit only in build config.
- [MXS-TS-HOT-003] Decorators MAY be enabled where used; when enabled, keep `experimentalDecorators: true` across TS and Jest/SWC.
- [MXS-TS-HOT-004] Use ESM imports with explicit `.js` extensions in local paths; Jest mapper MUST strip `.js` to real sources.
- [MXS-TS-HOT-005] Path alias `#*` MUST point to `src/*` (TS `paths`) and `./dist/*` (package `imports`); prefer aliases over deep relatives.
- [MXS-TS-HOT-006] Keep `noEmit: true` in dev tsconfig; emit only in `tsconfig.build.json` with `rootDir: ./src`.
- [MXS-TS-HOT-007] Include `src`, `tests`, `scripts`, optional `benches` in TS includes; avoid stray TS outside these roots.
- [MXS-TS-HOT-008] Use `esModuleInterop` and `allowSyntheticDefaultImports` for compatibility with CJS deps.
- [MXS-TS-HOT-009] Use `resolveJsonModule: true` for config JSON imports; keep JSON colocated in `src` when bundled.
- [MXS-TS-HOT-010] Prefer explicit type exports (`export type *` or named type exports) in barrels to avoid runtime cost and circulars.
- [MXS-TS-HOT-011] Error classes MUST be defined in-repo and exported via barrels; shared bases MAY be library-local (no external base coupling).
- [MXS-TS-HOT-012] Event classes MUST be defined in-repo and exported via barrels when present; avoid external base dependencies.
- [MXS-TS-HOT-013] Shared utility types SHOULD live in `types.ts` or equivalent namespaces; prefer reuse over ad-hoc definitions.
- [MXS-TS-HOT-014] Tests MUST import via aliases (`#...`) or barrel paths to mirror production imports; avoid brittle relatives.
- [MXS-TS-HOT-015] Jest ESM configs MUST rely on SWC without requiring `NODE_OPTIONS=--experimental-vm-modules` unless the project explicitly needs it; prefer mapper-based resolution.
- [MXS-TS-HOT-016] Async tests MUST respect shared timeouts (20s default) and override per case; avoid unbounded waits.
- [MXS-TS-HOT-017] SWC transform SHOULD keep class names (`keepClassNames: true`) when identity matters for errors/events.
- [MXS-TS-HOT-018] Module name mapper MUST strip `.js` extensions for TS resolution in tests.
- [MXS-TS-HOT-019] Avoid implicit globals; pass dependencies (e.g., loggers, fs, options) explicitly into functions/constructors.
- [MXS-TS-HOT-020] Maintain `skipLibCheck: true` unless library types are fully clean.
- [MXS-TS-HOT-021] Exports SHOULD be consolidated at the end of the module. Prefer `const thing = ...; export default thing;` over inline default exports like `export default { ... }` so the module's declarations read top-down and the export surface is easy to audit.

## Exhibits (non-normative)
- Exhibit: NodeNext tsconfig sketch

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "noEmit": true,
    "baseUrl": "./src",
    "paths": {
      "#*": ["./*"]
    },
    "strictNullChecks": true
  },
  "include": ["src", "tests", "scripts", "benches"]
}
```

- Exhibit: Jest ESM mapper intent

```js
// moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" }
```
