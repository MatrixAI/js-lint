# js-lint

A batteries-included, TypeScript-aware linting CLI and ESLint flat config bundle
for use in Matrix AI JavaScript/TypeScript projects.

- Type-aware linting powered by `@typescript-eslint` using one or more
  `tsconfig.json` files
- Built-in support for React, conditionally enabled Tailwind, JSX a11y,
  Prettier, and Matrix AI custom rules
- Supports Prettier formatting for Markdown and SVG, ShellCheck for shell
  scripts, nixfmt for Nix files, and SQLFluff for SQL files
- Single command to lint JavaScript/TypeScript, Markdown, SVG, shell scripts,
  Nix files, and SQL files
- Customizable via `matrixai-lint-config.json` and extensible with your own
  ESLint config
- CLI options to override config and enable auto-fix

## Installation

Requires Node.js 24 or newer. Tailwind linting supports Tailwind CSS v4 only;
see the [breaking migration notes](MIGRATION.md).

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

| Flag                     | Description                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------- |
| _(no flag)_              | Uses built-in Matrix AI ESLint config                                               |
| `--fix`                  | Enables auto-fixing via ESLint and Prettier                                         |
| `--user-config`          | Deprecated ESLint-only alias that detects a root flat config; use `--eslint-config` |
| `--eslint-config <path>` | Explicitly use a custom ESLint config file                                          |
| `--eslint <targets>`     | ESLint targets (files, roots, or globs); implies ESLint domain selection            |
| `--markdown <targets>`   | Markdown targets (files, roots, or globs); implies markdown domain selection        |
| `--svg <targets>`        | SVG targets (files, roots, or globs); implies SVG domain selection                  |
| `--nix <targets>`        | Nix targets (files, roots, or globs); implies nix domain selection                  |
| `--sql <targets>`        | SQL targets (files, roots, or globs); implies SQL domain selection                  |
| `--shell <targets>`      | Shell targets (files, roots, or globs); implies shell domain selection              |
| `--domain <id...>`       | Run only selected domains (`eslint`, `shell`, `markdown`, `svg`, `nix`, `sql`)      |
| `--skip-domain <id...>`  | Skip selected domains (`eslint`, `shell`, `markdown`, `svg`, `nix`, `sql`)          |
| `--list-domains`         | Print available domains and short descriptions, then exit 0                         |
| `--explain`              | Print per-domain decision details before execution                                  |
| `-v, --verbose`          | Increase log verbosity (repeat for more detail)                                     |

Domain selection behavior:

- With no selectors and no domain-specific target flags, all built-in domains
  run by default.
- Passing `--eslint` and/or `--shell` implies explicit domain selection from
  those flags.
  - `--eslint ...` runs ESLint only.
  - `--shell ...` runs shell only.
  - Passing both runs both.
- Passing `--markdown` implies markdown domain selection.
  - `--markdown ...` runs markdown only.
  - Combined with other target flags, only those targeted domains run.
- Passing `--svg` implies SVG domain selection.
  - `--svg ...` runs SVG only.
  - Combined with other target flags, only those targeted domains run.
- Passing `--nix` implies nix domain selection.
  - `--nix ...` runs nix only.
  - Combined with other target flags, only those targeted domains run.
- Passing `--sql` implies SQL domain selection.
  - `--sql ...` runs SQL only.
  - Combined with other target flags, only those targeted domains run.
- `shellcheck` is optional only for default auto-run shell execution.
  - If shell is explicitly requested (`--shell ...` or `--domain shell`),
    missing `shellcheck` is a failure.
- `nixfmt` is optional only for default auto-run nix execution.
  - If nix is explicitly requested (`--nix ...` or `--domain nix`), missing
    `nixfmt` is a failure.
- `sqlfluff` is optional only for default auto-run SQL execution.
  - If SQL is explicitly requested (`--sql ...` or `--domain sql`), missing
    `sqlfluff` is a failure.
- `--shell` accepts target paths and glob patterns.
  - Directories are used as roots.
  - File paths and glob patterns are reduced to search roots, then `*.sh` files
    are discovered under those roots.
- `--markdown` accepts target paths and glob patterns.
  - Directories are used as roots.
  - File paths and glob patterns are reduced to search roots, then `*.md` /
    `*.mdx` files are discovered under those roots.
  - Root-level `README.md` and `AGENTS.md` are always auto-included when
    present.
- `--svg` accepts target paths and glob patterns.
  - Directories are used as roots.
  - File paths and glob patterns are reduced to search roots, then `*.svg` files
    are discovered under those roots.
  - By default, SVG domain scope is `./src`, `./specs`, `./pages`, `./public`,
    `./static`, `./docs`, and `./assets`.
- `--nix` accepts target paths and glob patterns.
  - Directories are used as roots.
  - File paths and glob patterns are reduced to search roots, then `*.nix` files
    are discovered under those roots.
  - By default, nix domain scope is `flake.nix`, `shell.nix`, `default.nix`, and
    `nix/**/*.nix`.
  - When `--nix` is provided, explicit nix targets replace these defaults.
- `--sql` accepts target paths and glob patterns.
  - Directories are used as roots.
  - File paths and glob patterns are reduced to search roots, then `*.sql` files
    are discovered under those roots.
  - By default, SQL domain scope is `./src`, `./scripts`, `./tests`, `./sql`,
    `./migrations`, `./db`, `./database`, `./prisma`, `./supabase`, and
    root-level `*.sql` files.
  - When `--sql` is provided, explicit SQL targets replace these defaults.

#### Effective default search scope

When you run bare `matrixai-lint` or bare `matrixai-lint --fix` with no
domain-specific target flags, all built-in domains run, but each domain decides
its own effective scope:

- `eslint`: computed from resolved `tsconfigPaths` and `forceInclude`. With no
  [`matrixai-lint-config.json`](README.md) and no explicit
  `domains.eslint.tsconfigPaths`, this means the root `tsconfig.json` is used by
  default. The effective ESLint patterns come from that `tsconfig.json`
  `include`/`exclude` plus any `forceInclude` entries. If no usable
  TypeScript-driven scope can be derived, ESLint falls back to `./src`,
  `./scripts`, and `./tests`.
- `shell`: `./src`, `./scripts`, `./tests`
- `markdown`: `./README.md`, `./AGENTS.md`, `./specs`, `./pages`, `./blog`, and
  `./docs`. Root-level `README.md` and `AGENTS.md` are always auto-included when
  present.
- `svg`: `./src`, `./specs`, `./pages`, `./public`, `./static`, `./docs`, and
  `./assets`.
- `nix`: `./flake.nix`, `./shell.nix`, `./default.nix`, and `./nix/**/*.nix`
- `sql`: `./src`, `./scripts`, `./tests`, `./sql`, `./migrations`, `./db`,
  `./database`, `./prisma`, `./supabase`, and root-level `*.sql` files

Use `matrixai-lint --explain` to print the per-domain decision details and see
which scope was selected at runtime.

#### Repo-local npm scripts in this repository

The scripts in this repository's [`package.json`](package.json) are wrappers for
developing this package itself; they are not the generic package defaults.

- [`npm run lint`](package.json) and [`npm run lintfix`](package.json) compile
  the package before invoking its CLI without target flags.
- These scripts use the generic domain scopes described above, including the
  TypeScript-derived ESLint scope. Pass explicit domain targets when a narrower
  run is needed.

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

- Markdown only under selected roots:

  ```sh
  matrixai-lint --markdown standards templates README.md
  ```

- SVG only under selected roots:

  ```sh
  matrixai-lint --svg specs assets public
  ```

- Nix only (default nix scope):

  ```sh
  matrixai-lint --domain nix
  ```

- Nix only under selected roots/patterns:

  ```sh
  matrixai-lint --nix nix modules flake.nix
  ```

- SQL only under selected roots/patterns:

  ```sh
  matrixai-lint --sql db migrations './sql/**/*.sql'
  ```

- Mixed scoped run (ESLint + shell only):

  ```sh
  matrixai-lint --eslint "src/**/*.{ts,tsx}" --shell scripts
  ```

#### Examples

```sh
matrixai-lint --fix
matrixai-lint --eslint-config ./eslint.config.js --fix
matrixai-lint --eslint "src/**/*.{ts,tsx}" --shell scripts
matrixai-lint --markdown standards templates README.md
matrixai-lint --svg specs assets public
matrixai-lint --nix nix flake.nix
matrixai-lint --sql db migrations './sql/**/*.sql'
matrixai-lint --domain eslint markdown svg sql
matrixai-lint --domain nix
matrixai-lint --skip-domain markdown
matrixai-lint --list-domains
matrixai-lint --explain --domain eslint
matrixai-lint -v -v --domain markdown
```

### SQLFluff config

`matrixai-lint` invokes SQLFluff from the downstream project root without an
explicit `--config` argument. SQLFluff therefore performs its normal native
configuration discovery, including project files such as `.sqlfluff`,
`pyproject.toml`, `setup.cfg`, and `tox.ini`.

Downstream projects should declare their SQL dialect and rule policy in one of
those native SQLFluff files. `matrixai-lint --fix` runs `sqlfluff fix --force`,
while a non-fix run uses `sqlfluff lint`.

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

### Tailwind CSS v4 and mixed styling

The shared preset uses `eslint-plugin-tailwindcss` 4.4.0's recommended flat
configuration. It keeps compiler-based utility ordering and contradictory-class
diagnostics, then explicitly disables `tailwindcss/no-custom-classname`. Custom
classes, CSS Modules, forwarded class-name values and other styling systems can
coexist with Tailwind without allowlists or per-file suppressions. No framework
packages or stylesheet-scanning rules are required.

Tailwind v4 uses a consumer-owned CSS entrypoint, not a legacy JavaScript
Tailwind configuration. Set `settings.tailwindcss.cssConfigPath` in your native
ESLint configuration to the stylesheet your application uses. The stylesheet
normally imports `tailwindcss` and may define `@theme` or `@utility` directives.
This package neither discovers nor chooses that stylesheet for you.

Resolve the stylesheet location against the **directory containing your ESLint
configuration**, not the current working directory or each linted file's nearest
package. Pass an absolute filesystem path to the adapter:

```js
// eslint.config.mjs
import { fileURLToPath } from 'node:url';
import { createConfig } from '@matrixai/lint';

export default [
  ...createConfig({ root: fileURLToPath(new URL('.', import.meta.url)) }),
  {
    files: ['**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}'],
    settings: {
      tailwindcss: {
        cssConfigPath: fileURLToPath(
          new URL('./styles/utilities.css', import.meta.url),
        ),
      },
    },
  },
];
```

The stylesheet location above is illustrative: replace it with your site's
actual entrypoint. This works for repository-root and nested-package ESLint
configurations even when ESLint runs from another directory. `createConfig`
anchors MatrixAI orchestration lookup, TypeScript project lookup and Tailwind
auto-detection to the supplied root. Keep the CLI's targets and orchestration
selection rooted as documented under
[lint configuration](#lint-configuration-file). Use `--eslint-config` when
running the MatrixAI CLI with this native config.

Do not pass an unresolved relative `cssConfigPath`: upstream 4.4.0 resolves it
against each linted file's nearest package, which is not the policy above. No
CSS entrypoint is required for ordinary non-Tailwind consumers. Auto mode does
not activate from the adapter's transitive Tailwind installation. An explicitly
enabled Tailwind project needs its real entrypoint when linting class-bearing
code; importing the preset or linting ordinary configuration code does not load
a theme by itself.

Tailwind-only consumers can opt back into strict class enforcement with a later
ordinary ESLint override using the same source scope:

```js
{
  files: ['**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}'],
  rules: { 'tailwindcss/no-custom-classname': 'error' },
}
```

Keep settings and Tailwind rule overrides within the supported source scope.
Plugin registration and MatrixAI's default override cover these extensions,
including module and configuration files. Other MatrixAI rules are unchanged.

### Lint configuration file

`matrixai-lint-config.json` is an orchestration and scope configuration file. It
selects the files visible to each domain; it does not contain ESLint, Prettier,
ShellCheck, nixfmt, or SQLFluff rule settings. Keep rule configuration in each
tool's native downstream configuration file.

The ESLint domain is TypeScript-aware and uses `tsconfig.json` to determine how
to parse files. By default it looks for `tsconfig.json` in the project root. A
project with multiple TypeScript configurations can list them explicitly.

This config uses a versioned schema and must explicitly declare `"version": 2`:

```json
{
  "version": 2,
  "root": ".",
  "domains": {
    "eslint": {
      "targets": ["./src", "./scripts"],
      "tsconfigPaths": [
        "./tsconfig.base.json",
        "./packages/core/tsconfig.json"
      ],
      "forceInclude": ["scripts", "src/overrides"],
      "tailwind": "auto"
    },
    "shell": { "targets": ["./scripts"] },
    "markdown": { "targets": ["./docs", "./README.md"] },
    "svg": { "targets": ["./assets/**/*.svg"] },
    "nix": { "targets": ["./nix", "./flake.nix"] },
    "sql": { "targets": ["./db", "./migrations/**/*.sql"] }
  }
}
```

| Field                          | Type       | Description                                                                                |
| ------------------------------ | ---------- | ------------------------------------------------------------------------------------------ |
| `version`                      | `2`        | Required schema version marker                                                             |
| `root`                         | `string`   | Optional lint root (defaults to `.`); domain targets and tsconfig paths are relative to it |
| `domains.<domain>.targets`     | `string[]` | Optional files, directories, or globs defining that domain's scope                         |
| `domains.eslint.tsconfigPaths` | `string[]` | One or more paths to `tsconfig.json` files                                                 |
| `domains.eslint.forceInclude`  | `string[]` | Paths to include despite tsconfig excludes; each must be included by at least one tsconfig |
| `domains.eslint.tailwind`      | `string`   | Tailwind lint mode: `auto` (default), `enabled`, or `disabled`                             |

Tailwind linting defaults to `auto`. It is enabled when the configured root's
`package.json` directly declares `tailwindcss` or an `@tailwindcss/*` package,
or when the root contains a recognized `tailwind.config.*` file. Installed
transitive dependencies do not activate it. Use `enabled` for configless
Tailwind projects and `disabled` to override detection explicitly.

Target precedence is: a domain-specific CLI target option, then
`domains.<domain>.targets`, then that domain's built-in default search scope.
Config targets affect scope but do not make a domain an explicit CLI request.

Note: If a path in `forceInclude` is not included in any of the `tsconfigPaths`,
TypeScript will throw a parsing error.

### Native downstream tool configuration

Rule configuration remains owned by each underlying tool:

| Domain           | Downstream rule configuration                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| ESLint           | Keep rules in `eslint.config.js` (or another flat-config file) and pass its path with `--eslint-config`           |
| Markdown and SVG | Prettier discovers native project configs and `.editorconfig`; the shared config is a fallback when none is found |
| Shell            | ShellCheck discovers `.shellcheckrc`, `shellcheckrc`, and inline shell directives naturally                       |
| Nix              | nixfmt currently has no project rule configuration layer                                                          |
| SQL              | SQLFluff discovers `.sqlfluff`, `pyproject.toml`, `setup.cfg`, and `tox.ini` naturally                            |

`--user-config` is a deprecated ESLint-only compatibility alias. Existing
scripts continue to work, but emit a warning. Migrate to
`--eslint-config ./eslint.config.js`; keep domain targets in
`matrixai-lint-config.json`. Neither ESLint option alters configuration for the
other domains.

### Public API

Supported imports:

- `@matrixai/lint`: named exports `config` and `createConfig({ root })`; types
  `MatrixAILintCfg`, `RawMatrixCfg`, `CLIOptions`, and `TailwindMode`.
- `@matrixai/lint/configs/eslint.js`: default export of the ESLint Flat Config
  array (same shape as `config`) and named `createConfig` factory.
- `@matrixai/lint/configs/prettier.config.js`: reusable Prettier options object.

The exported `config` is intended as a composable base preset for downstream
`eslint.config.js` files, not as an internal-only implementation detail.

Any package import path not listed above is internal and not a stable public
API.

## Prepared npm package from Nix

The flake exposes a prepared npm archive on `x86_64-linux`, the system provided
by its pinned MatrixAI package set:

```sh
nix build '.#npm-package'
nix build '.#npm-package-unpacked'
```

The default package and `npm-package` outputs are the archive file itself, not a
directory containing a tarball. `npm-package-unpacked` contains the exact
package contents directly at its root. The archive includes compiled modules,
declarations, runtime assets, metadata, README, and license, without bundling
dependencies or Node.js. Ordinary npm preparation remains supported.

The archive derivation exposes evaluation-visible `npmPackage` and
`npmDistribution` descriptors, both at schema version 1. `npmPackage` derives
identity and runtime declarations from the canonical manifest and includes
clean, dirty, or unknown source provenance. Its source snapshot hash is not an
archive checksum or complete toolchain attestation. `npmDistribution` selects
the `npm-package` output and currently advertises no runtime artifact providers;
this does not mean the package has no runtime dependencies. See the
[producer recipe](nix/npm-package.nix) for the descriptor fields.

## Contributing

The committed [flake](flake.nix) defines the integrated flake-parts/devenv
shell; [`.envrc`](.envrc) watches the flake and lockfile and activates it
through direnv. Run `direnv allow` after reviewing the configuration. The shell
provides Node 24 and domain tools, adds compiled/package executables to PATH,
and serializes npm installation. It does not load credentials. Run commands
directly once this environment is active; no additional `direnv exec` wrapper is
needed.

Golden commands:

- `npm run build`
- `npm run lint`
- `npm run lintfix`
- `npm test` (build, development-config typecheck, then Jest)

Tests mirror the exported domains in corresponding test directories, use
compiled package imports and retain the Jest/SWC ESM setup hooks. JUnit and
coverage artifacts are written under `tmp/junit` and `tmp/coverage`.

Canonical Nix checks are independent of direnv/devenv activation:

```sh
nix build '.#checks.x86_64-linux.default'
nix build '.#checks.x86_64-linux.unit-js'
```

Substitute the supported host system when appropriate. The default gate
aggregates the unit suite. Each output contains a machine-readable `report.json`
and an `artifacts` directory; the unit check preserves JUnit and coverage.
Benchmark checks are not defined because this package has no benchmark command.
See the [check adapters](nix/checks/default.nix).

Notes:

- `npm run lint` and `npm run lintfix` invoke `npm run prepare` first so the
  compiled CLI in `dist/bin/matrixai-lint.js` stays up to date while keeping
  TypeScript incremental rebuilds fast.

For the authoritative contributor guidance see [AGENTS.md](AGENTS.md).

Docs: https://matrixai.github.io/js-lint/

### Publishing

Releases are prepared on `staging` and distributed through immutable Git version
tags and Nix-prepared npm archives. GitHub workflows are no longer used and must
not publish packages indirectly. Npm registry publication is not part of this
Git-only release process.

Release 1.0.2 aligns the development environment and lint backend provisioning
with the library family. The common lint configuration covers maintained
Markdown and MDX without selecting hidden vendored trees. Run npm scripts
directly after environment activation; no devenv project tasks or standalone
flake formatter are required.

Before tagging a new version, synchronize the manifest and lockfile, regenerate
the lockfile-dependent [npm acquisition hash](nix/npm-deps-hash.nix), and build
the prepared archive. Commit the exact release inputs on `staging`, create a new
annotated version tag, and push the branch and tag. Never move an existing
release tag.
