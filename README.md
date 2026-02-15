# js-lint

A batteries-included, TypeScript-aware linting CLI and ESLint flat config bundle
for use in Matrix AI JavaScript/TypeScript projects.

- Type-aware linting powered by `@typescript-eslint` using one or more
  `tsconfig.json` files
- Built-in support for React, Tailwind, JSX a11y, Prettier, and Matrix AI custom
  rules
- Supports Prettier formatting for Markdown and ShellCheck for shell scripts
- Single command to lint JavaScript/TypeScript, Markdown, and shell scripts
- Customizable via `matrixai-lint-config.json` and extensible with your own
  ESLint config
- CLI options to override config and enable auto-fix

## Installation

```sh
npm install --save-dev @matrixai/lint
```

## Usage

### CLI

```sh
matrixai-lint
```

With autofix:

```sh
matrixai-lint --fix
```

### CLI Options

| Flag               | Description                                                                  |
| ------------------ | ---------------------------------------------------------------------------- |
| _(no flag)_        | Uses built-in Matrix AI ESLint config                                        |
| `--fix`            | Enables auto-fixing via ESLint and Prettier                                  |
| `--user-config`    | Uses detected `eslint.config.[js,mjs,cjs,ts]` from the project root if found |
| `--config <path>`  | Explicitly use a custom ESLint config file                                   |
| `--eslint <paths>` | Glob(s) forwarded to ESLint                                                  |
| `--shell <paths>`  | Glob(s) forwarded to ShellCheck search roots                                 |

#### Examples

```sh
matrixai-lint --fix
matrixai-lint --user-config
matrixai-lint --config ./eslint.config.js --fix
matrixai-lint --eslint "src/**/*.{ts,tsx}" --shell scripts
```

### ESLint config (ESM / NodeNext)

`matrixai-lint` ships an ESLint Flat Config array and types for TypeScript
projects configured as NodeNext.

#### Default import

```js
// eslint.config.js
import { config } from '@matrixai/lint';

export default config;
```

#### Explicit subpath import

```js
// eslint.config.js
import matrixai from '@matrixai/lint/config';

export default matrixai;
```

### Lint configuration file

The linter is TypeScript-aware and requires a `tsconfig.json` to determine which
files to lint and how to parse them. By default it looks for `tsconfig.json` in
the project root and uses the `include`/`exclude` entries.

If your project uses more than one `tsconfig.json` or does not have one at the
root, configure the linter using a `matrixai-lint-config.json` file at the root:

```json
{
  "tsconfigPaths": ["./tsconfig.base.json", "./packages/core/tsconfig.json"],
  "forceInclude": ["scripts", "src/overrides"]
}
```

| Field           | Type       | Description                                                                              |
| --------------- | ---------- | ---------------------------------------------------------------------------------------- |
| `tsconfigPaths` | `string[]` | One or more paths to `tsconfig.json` files                                               |
| `forceInclude`  | `string[]` | Paths to always include, even if excluded by tsconfig (must be included by at least one) |

Note: If a path in `forceInclude` is not included in any of the `tsconfigPaths`,
TypeScript will throw a parsing error.

### Public API

Supported imports:

- `@matrixai/lint`: named export `config`; types `MatrixAILintCfg`,
  `RawMatrixCfg`, `CLIOptions`.
- `@matrixai/lint/config`: default export of the Flat Config array (same shape
  as `config`).

Internal modules (plugins, rules, utilities, and wildcard passthroughs under
`@matrixai/lint/*`) are for tooling and are not a stable public API.

## Contributing

Golden commands:

- `npm run build`
- `npm run lint`
- `npm run lintfix`
- `npm run docs`

Notes:

- `npm run lint` and `npm run lintfix` invoke `npm run prepare` first so the
  compiled CLI in `dist/bin/lint.js` stays up to date while keeping TypeScript
  incremental rebuilds fast.

For the authoritative contributor guidance see [AGENTS.md](AGENTS.md).

Docs: https://matrixai.github.io/js-lint/

### Publishing

Publishing is handled automatically by the staging pipeline.

Prerelease:

```sh
# npm login
npm version prepatch --preid alpha # premajor/preminor/prepatch
git push --follow-tags
```

Release:

```sh
# npm login
npm version patch # major/minor/patch
git push --follow-tags
```

Manually:

```sh
# npm login
npm version patch # major/minor/patch
npm run build
npm publish --access public
git push
git push --tags
```
