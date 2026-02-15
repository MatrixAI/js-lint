# Exhibit TOOLING-1 - npm scripts shape

This exhibit illustrates an npm scripts surface that satisfies the universal tooling
expectations in [`../HOTSET.md`](../HOTSET.md) and the per-profile expectations in
[`../coding/tooling/tooling-contract.md`](../coding/tooling/tooling-contract.md).

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
