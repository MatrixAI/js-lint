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

| Flag                     | Description                                                                  |
| ------------------------ | ---------------------------------------------------------------------------- |
| _(no flag)_              | Uses built-in Matrix AI ESLint config                                        |
| `--fix`                  | Enables auto-fixing via ESLint and Prettier                                  |
| `--user-config`          | Uses detected `eslint.config.[js,mjs,cjs,ts]` from the project root if found |
| `--eslint-config <path>` | Explicitly use a custom ESLint config file                                   |
| `--eslint <targets>`     | ESLint targets (files, roots, or globs); implies ESLint domain selection     |
| `--shell <targets>`      | Shell targets (files, roots, or globs); implies shell domain selection       |
| `--domain <id...>`       | Run only selected domains (`eslint`, `shell`, `markdown`)                    |
| `--skip-domain <id...>`  | Skip selected domains (`eslint`, `shell`, `markdown`)                        |
| `--list-domains`         | Print available domains and short descriptions, then exit 0                  |
| `--explain`              | Print per-domain decision details before execution                           |
| `-v, --verbose`          | Increase log verbosity (repeat for more detail)                              |

Domain selection behavior:

- With no selectors and no domain-specific target flags, all built-in domains
  run by default.
- Passing `--eslint` and/or `--shell` implies explicit domain selection from
  those flags.
  - `--eslint ...` runs ESLint only.
  - `--shell ...` runs shell only.
  - Passing both runs both.
- `shellcheck` is optional only for default auto-run shell execution.
  - If shell is explicitly requested (`--shell ...` or `--domain shell`),
    missing `shellcheck` is a failure.
- `--shell` accepts target paths and glob patterns.
  - Directories are used as roots.
  - File paths and glob patterns are reduced to search roots, then `*.sh` files
    are discovered under those roots.

#### Targeted workflows

- Only ESLint on a subset of files:

  ```sh
  matrixai-lint --eslint "src/**/*.{ts,tsx}" --domain eslint
  ```

- Only shell scripts under specific roots:

  ```sh
  matrixai-lint --shell scripts packages/*/scripts
  ```

- Markdown only:

  ```sh
  matrixai-lint --domain markdown
  ```

- Mixed scoped run (ESLint + shell only):

  ```sh
  matrixai-lint --eslint "src/**/*.{ts,tsx}" --shell scripts
  ```

#### Examples

```sh
matrixai-lint --fix
matrixai-lint --user-config
matrixai-lint --eslint-config ./eslint.config.js --fix
matrixai-lint --eslint "src/**/*.{ts,tsx}" --shell scripts
matrixai-lint --domain eslint markdown
matrixai-lint --skip-domain markdown
matrixai-lint --list-domains
matrixai-lint --explain --domain eslint
matrixai-lint -v -v --domain markdown
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
import matrixai from '@matrixai/lint/configs/eslint.js';

export default matrixai;
```

### Lint configuration file

The linter is TypeScript-aware and requires a `tsconfig.json` to determine which
files to lint and how to parse them. By default it looks for `tsconfig.json` in
the project root and uses the `include`/`exclude` entries.

If your project uses more than one `tsconfig.json` or does not have one at the
root, configure the linter using a `matrixai-lint-config.json` file at the root.

This config uses a versioned schema and must explicitly declare `"version": 2`:

```json
{
  "version": 2,
  "root": ".",
  "domains": {
    "eslint": {
      "tsconfigPaths": [
        "./tsconfig.base.json",
        "./packages/core/tsconfig.json"
      ],
      "forceInclude": ["scripts", "src/overrides"]
    }
  }
}
```

| Field                          | Type       | Description                                                                               |
| ------------------------------ | ---------- | ----------------------------------------------------------------------------------------- |
| `version`                      | `2`        | Required schema version marker                                                            |
| `root`                         | `string`   | Optional lint root (defaults to `.`). `tsconfigPaths` are resolved relative to this root. |
| `domains.eslint.tsconfigPaths` | `string[]` | One or more paths to `tsconfig.json` files                                                |
| `domains.eslint.forceInclude`  | `string[]` | Paths to always include, even if excluded by tsconfig (must be included by at least one)  |

Note: If a path in `forceInclude` is not included in any of the `tsconfigPaths`,
TypeScript will throw a parsing error.

### Public API

Supported imports:

- `@matrixai/lint`: named export `config`; types `MatrixAILintCfg`,
  `RawMatrixCfg`, `CLIOptions`.
- `@matrixai/lint/configs/eslint.js`: default export of the ESLint Flat Config
  array (same shape as `config`).
- `@matrixai/lint/configs/prettier.config.js`: reusable Prettier options object.

The exported `config` is intended as a composable base preset for downstream
`eslint.config.js` files, not as an internal-only implementation detail.

Any package import path not listed above is internal and not a stable public
API.

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
