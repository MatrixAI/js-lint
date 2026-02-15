# Rules
- [MXS-TOOL-LINT-001] Product repos MUST expose `npm run lint` and `npm run lintfix` delegating to `matrixai-lint`.
- [MXS-TOOL-LINT-002] Lint commands MUST be runnable without build artifacts present; do not require `dist/`.
- [MXS-TOOL-LINT-003] `matrixai-lint` config consumption is forward-declared; repos MUST route CLI flags transparently (e.g., `npm run lint -- --max-warnings 0`).
- [MXS-TOOL-LINT-004] Auto-fix mode MUST be `npm run lintfix` invoking `matrixai-lint --fix` with pass-through flags.
- [MXS-TOOL-LINT-005] Lint scripts MUST be defined in `package.json` scripts, not in ad-hoc shell wrappers.
- [MXS-TOOL-LINT-006] Linting MUST cover TS/JS sources under `src`, `tests`, `scripts`, `benches` consistent with the TypeScript `include` set.
- [MXS-TOOL-LINT-007] Lint outputs MUST be non-interactive and CI-safe; no prompts.

## Exhibits (non-normative)
- Exhibit: npm scripts shape

```json
{
  "scripts": {
    "lint": "matrixai-lint",
    "lintfix": "matrixai-lint --fix"
  }
}
```

- Exhibit: pass-through flags

```sh
npm run lint -- --max-warnings 0
npm run lintfix -- --max-warnings 0
```
