# js-lint

An opinionated, batteries-included lint runner and ESLint config bundle for TypeScript-based JavaScript projects at Matrix AI.

This package provides:

- ESLint support with Prettier, TypeScript, React, Tailwind, JSX-a11y, and custom `@matrixai` rules
- Optional auto-fixing via `--fix`
- Shell script linting via `shellcheck`
- Markdown/MDX linting via Prettier (`README.md`, `pages/`, `docs/`, `blog/`)
- Support for multiple or non-standard tsconfig.json setups via `matrixai-lint-config.json`
- CLI flags to use your own ESLint config when needed (`--user-config`, `--config`)

---

## 📦 Installation (not yet published)

```bash
# With pnpm
pnpm add -D @matrixai/lint

# With npm
npm install -D @matrixai/lint

# With yarn
yarn add -D @matrixai/lint
```

This package exposes a single CLI binary:

```bash
matrixai-lint
```

---

## 🚀 Quick Start

Run the default lint checks (JS/TS, shell, markdown):

```bash
matrixai-lint
```

Run with auto-fixes applied (where possible):

```bash
matrixai-lint --fix
```

---

## ⚙️ TypeScript Awareness & tsconfig.json

The custom ESLint runner is TypeScript-aware and **requires at least one valid `tsconfig.json`** to function. By default:

- It looks for `tsconfig.json` in the root of the repository
- It only lints files explicitly **included** in the `include` array of the config
- It **excludes** any files or folders listed in the `exclude` array

If you have multiple tsconfig files, or if your main `tsconfig.json` is not in the root, you must provide additional metadata in a config file:

### `matrixai-lint-config.json`

Place this in the root of your repository to customize how the ESLint runner selects tsconfigs and files.

```json
{
  "tsconfigPaths": [
    "./tsconfig.base.json",
    "./packages/core/tsconfig.json"
  ],
  "forceInclude": [
    "scripts",
    "src/overrides"
  ]
}
```

#### Options

| Field           | Type       | Description                                                                                 |
|----------------|------------|---------------------------------------------------------------------------------------------|
| `tsconfigPaths`| `string[]` | List of `tsconfig.json` files to include. Required if none exists in the root directory.   |
| `forceInclude` | `string[]` | Glob-like paths to forcefully lint, even if excluded in some tsconfig.json files.          |

> ⚠ At least one tsconfig **must** include the files in `forceInclude`. Otherwise, the TypeScript parser will throw errors.

---

## 🛠️ CLI Flags

| Flag                | Description                                                                 | Works with `--fix` |
|---------------------|-----------------------------------------------------------------------------|---------------------|
| _(no flag)_         | Uses the built-in Matrix AI ESLint config                                   | ✅                  |
| `--fix`             | Runs ESLint with `--fix` and Prettier with `--write`                        | —                   |
| `--user-config`     | Uses `eslint.config.js` (or `.mjs`, `.cjs`, `.ts`) if found in the repo     | ✅                  |
| `--config <path>`   | Uses the specified config file explicitly (fails if not found)              | ✅                  |

### Examples

```bash
# Use built-in config with auto-fix
matrixai-lint --fix

# Use local config if available
matrixai-lint --user-config

# Use specific config path
matrixai-lint --config ./eslint.config.js --fix
```

---

## 🔧 Overriding the ESLint Config

You have three options:

### 1. Use a custom config file directly

```bash
matrixai-lint --config ./eslint.custom.js
```

### 2. Use `--user-config`

Create a config file in your repo root named:
- `eslint.config.js`
- `eslint.config.mjs`
- `eslint.config.cjs`
- `eslint.config.ts`

Then run:

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

---

## 📚 Using the Config Directly

If you're not using the CLI, you can still import the ESLint config:

```js
// eslint.config.js
import matrixai from '@matrixai/lint/config';

export default matrixai;
```

---

## 🧠 How It Works

### CLI Flow (`matrixai-lint`)

1. Parses CLI flags (`--fix`, `--user-config`, `--config`)
2. Resolves ESLint config priority:
   - Uses `--config <path>` if given
   - Falls back to `--user-config` if a config file is found
   - Defaults to built-in config otherwise
3. Uses `matrixai-lint-config.json` (if present) to determine:
   - One or more `tsconfig.json` locations
   - Additional `forceInclude` files
4. Executes:
   - Type-aware ESLint using those tsconfigs
   - `shellcheck` on `.sh` files in `src/` and `scripts/`
   - Prettier on `README.md`, and markdown in `pages/`, `docs/`, `blog/`

### ESLint Config Contents

The bundled config (`@matrixai/lint/config`) includes:

- `eslint:recommended`
- `plugin:@typescript-eslint/recommended`
- `plugin:prettier/recommended`
- `plugin:react/recommended`
- `plugin:react-hooks/recommended`
- `plugin:jsx-a11y/recommended`
- `plugin:tailwindcss/recommended`
- Custom `@matrixai/no-aliased-imports` rule

Configured using `@eslint/compat` to support ESLint v9's flat config format.

### Markdown Linting

- Prettier formats:
  - `README.md`
  - All `*.md` and `*.mdx` files in `pages/`, `blog/`, and `docs/`
- Requires `--fix` to apply formatting

### Shell Script Linting

- Targets all `*.sh` files in `./src` and `./scripts`
- Only runs if both `find` and `shellcheck` are available in `$PATH`

---

## 📦 Peer Dependencies

If you import the config manually (e.g., in `eslint.config.js`), you must install ESLint v9 or higher:

```bash
pnpm add -D eslint@^9
```

The CLI runner includes and manages all other tooling internally.

---

## 📄 License

Apache 2.0 © Matrix AI. Maintained by [Roger Qiu](https://github.com/MatrixAI).

