# js-lint

An opinionated, batteries-included lint runner and ESLint config bundle for JavaScript/TypeScript projects at Matrix AI.

This package provides:

- ESLint support with Prettier, TypeScript, React, Tailwind, JSX-a11y, and custom `@matrixai` rules
- Optional auto-fixing via `--fix`
- Shell script linting via `shellcheck`
- Markdown/MDX linting via Prettier (`README.md`, `pages/`, `docs/`, `blog/`)
- CLI flags to use your own config when needed (`--user-config`, `--config`)
- Direct import access to the config for manual use

---

## Installation (not yet published)

```bash
# With pnpm
pnpm add -D @matrixai/lint

# With npm
npm install -D @matrixai/lint

# With yarn
yarn add -D @matrixai/lint
```

This package exposes one binary:

```bash
matrixai-lint
```

---

## Quick Start

Run the default lint checks (JS/TS, shell, markdown):

```bash
matrixai-lint
```

Run with auto-fixes applied (where possible):

```bash
matrixai-lint --fix
```

---

## CLI Flags

| Flag               | Description                                                                 | Works with `--fix` |
|--------------------|-----------------------------------------------------------------------------|---------------------|
| _(no flag)_        | Uses the built-in Matrix AI ESLint config                                   | ✅                  |
| `--fix`            | Runs ESLint with `--fix` and Prettier with `--write`                        | —                   |
| `--user-config`    | Uses `eslint.config.js` (or `.mjs`, `.cjs`, `.ts`) if found in the repo     | ✅                  |
| `--config <path>`  | Uses the given config file explicitly (fails if not found)                  | ✅                  |

### Examples:

```bash
# Use built-in config with auto-fix
matrixai-lint --fix

# Use local config if available
matrixai-lint --user-config

# Use specific config path
matrixai-lint --config ./eslint.config.js --fix
```

---

## Overriding the ESLint Config

You have three options:

### 1. Supply your own config file

```bash
matrixai-lint --config ./eslint.custom.js
```

### 2. Use `--user-config`

Create `eslint.config.js`, `eslint.config.mjs`, `eslint.config.cjs`, or `eslint.config.ts` in your repo root:

```bash
matrixai-lint --user-config
```

### 3. Extend the Matrix AI config

```js
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

Then run:

```bash
matrixai-lint --user-config
```

---

## Using the Config Directly

If you're not using the CLI runner, you can import the ESLint config directly:

```js
// eslint.config.js
import matrixai from '@matrixai/lint/config';

export default matrixai;
```

---

## How It Works

### CLI Flow (`matrixai-lint`)

1. Parses CLI flags (`--fix`, `--user-config`, `--config`)
2. Resolves ESLint config priority:
   - `--config` if given
   - `--user-config` if detected
   - fallback to built-in config
3. Executes:
   - ESLint using includes from `tsconfig.json`
   - `shellcheck` on `.sh` files in `src/` and `scripts/`
   - Prettier on `README.md`, and `*.mdx`/`*.md` in `pages/`, `docs/`, `blog/`

### ESLint Config Details

The bundled config (`@matrixai/lint/config`) includes:

- `eslint:recommended`
- `plugin:@typescript-eslint/recommended`
- `plugin:prettier/recommended`
- `plugin:react/recommended`
- `plugin:react-hooks/recommended`
- `plugin:jsx-a11y/recommended`
- `plugin:tailwindcss/recommended`
- `@matrixai/no-aliased-imports`

Configured via `@eslint/compat` for ESLint v9 flat config format.

### Markdown Linting

- Formats `README.md` and all markdown in `pages/`, `blog/`, and `docs/`
- Uses Prettier
- Requires `--fix` to write changes

### Shell Script Linting

- Lints `*.sh` files in `./src` and `./scripts`
- Only runs if both `find` and `shellcheck` exist in `$PATH`

---

## Peer Dependencies

You must install ESLint ≥ 9 in your project:

```bash
pnpm add -D eslint@^9
```

All other tooling is handled internally by the linter.

---

## License

Apache 2.0 © Matrix AI
Maintained by [Roger Qiu](https://github.com/MatrixAI)

