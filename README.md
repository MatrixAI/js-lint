# js-lint

A batteries-included, TypeScript-aware linting CLI and ESLint flat config bundle for use in Matrix AI JavaScript/TypeScript projects.

- Type-aware linting powered by `@typescript-eslint` using one or more `tsconfig.json` files
- Built-in support for React, Tailwind, JSX a11y, Prettier, and Matrix AI custom rules
- Supports Prettier formatting for Markdown and ShellCheck for shell scripts
- Single command to lint JavaScript/TypeScript, Markdown, and shell scripts
- Customizable via `matrixai-lint-config.json` and extensible with your own ESLint config
- CLI options to override config and enable auto-fix

## Installation

```sh
npm install --save-dev @matrixai/lint
```

## Usage

```sh
matrixai-lint
```

To run with autofix:

```sh
matrixai-lint --fix
```

### CLI Options

| Flag              | Description                                                                  |
| ----------------- | ---------------------------------------------------------------------------- |
| _(no flag)_       | Uses built-in Matrix AI ESLint config                                        |
| `--fix`           | Enables auto-fixing via ESLint and Prettier                                  |
| `--user-config`   | Uses detected \`eslint.config.[js,mjs,cjs,ts] from the project root if found |
| `--config <path>` | Explicitly use a custom ESLint config file                                   |

### Examples

```sh
matrixai-lint --fix
matrixai-lint --user-config
matrixai-lint --config ./eslint.config.js --fix
```

## TypeScript Support

The linter is TypeScript-aware and requires a `tsconfig.json` to determine which files to lint and how to parse them.

By default:

- It looks for `tsconfig.json` in the project root
- Files are selected based on the `include` and `exclude` fields in the tsconfig

### Working with multiple tsconfigs

If your project uses more than one `tsconfig.json` or doesn't have one at the root, you can configure the linter using a `matrixai-lint-config.json` file at the root:

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

> ⚠ If a path in `forceInclude` is not included in any of the `tsconfigPaths`, TypeScript will throw a parsing error.

## ESLint Config Override

You can use your own ESLint config by one of the following methods:

### 1. Inline Custom Config

```sh
matrixai-lint --config ./eslint.config.js
```

### 2. Auto-detect with `--user-config`

```sh
matrixai-lint --user-config
```

This will look for a valid eslint.config file in the project root.

Valid config filenames:

- `eslint.config.js`
- `eslint.config.cjs`
- `eslint.config.mjs`
- `eslint.config.ts`

### 3. Extend the base config

```ts
// eslint.config.js
import matrixai from '@matrixai/lint/config';

export default [
  ...matrixai,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': 'off',
    },
  },
];
```

## Development

Run `nix develop`, and once you're inside, you can use:

```sh
# install (or reinstall packages from package.json)
npm install
# build the dist
npm run build
# run the repl (this allows you to import from ./src)
npm run tsx
# run the tests
npm run test
# lint the source code
npm run lint
# automatically fix the source
npm run lintfix
```

### Docs Generation

```sh
npm run docs
```

See the docs at: https://matrixai.github.io/js-lint/

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
