# AGENTS

- Read the repo profile selector at
  [`.matrixai/repo-profile.yml`](.matrixai/repo-profile.yml).
- Standards are expected at `./.matrixai/matrixai-standards/` from private
  submodule sync; if access is unavailable, standards and skill updates cannot
  be refreshed.
- Enforce the universal hotset
  [`.matrixai/matrixai-standards/standards/HOTSET.md`](.matrixai/matrixai-standards/standards/HOTSET.md).
- When editing Markdown/prose artifacts, enforce
  [`.matrixai/matrixai-standards/standards/prose-markdown.md`](.matrixai/matrixai-standards/standards/prose-markdown.md).
- Enforce the profile doc under
  [`.matrixai/matrixai-standards/standards/profiles/`](.matrixai/matrixai-standards/standards/profiles)
  matching `profile:` in `.matrixai/repo-profile.yml` (e.g., `library-js`,
  `application-js`, `worker-js-cloudflare`, `docusaurus-js-cloudflare`).
- Profile index (for discovery):
  [`.matrixai/matrixai-standards/standards/profiles/README.md`](.matrixai/matrixai-standards/standards/profiles/README.md)
- Tooling contract reference:
  [`.matrixai/matrixai-standards/standards/coding/tooling/tooling-contract.md`](.matrixai/matrixai-standards/standards/coding/tooling/tooling-contract.md)
  (commands, artifacts, expectations per profile).
- Materialize skills from canonical `./.matrixai/matrixai-standards/skills/**`
  using collection defaults from
  `./.matrixai/matrixai-standards/skills-collections/**` into
  `./.agents/skills/**` for runtime discovery, and rematerialize after standards
  submodule updates.
- When using `nix run` with a flake ref, quote the full flake ref argument (for
  example, `'./.matrixai/matrixai-standards#skills-materializer'`).
- For routine Nix flake evaluation, build, check, and develop operations, review
  `git status --short`, use ordinary Git-backed flake refs, and stage exact new
  or rename-destination inputs with `git add -- path/to/new-input` when
  visibility requires it. Already tracked edits and deletions are visible
  without re-staging. Use broad staging only after reviewing the complete
  pending set. If staging is temporary, preserve pre-existing index state and
  unstage only paths staged by the current operation. Do not use `path:` refs or
  `builtins.getFlake` merely to avoid staging; reserve them for audited, bounded
  source roots with no secret exposure or large generated/dependency trees,
  acceptable hashing and store-copy cost, and a subsequent Git-backed parity
  run.
- When the current process already inherited this repo's activated direnv
  environment, run project commands directly; do not wrap them with
  `direnv exec .`. Reserve `direnv exec` for a caller that has not inherited the
  environment and intentionally needs an activation boundary.
- Profile-driven materialization is the default fast path: run
  `nix run './.matrixai/matrixai-standards#skills-materializer' -- --standards-root ./.matrixai/matrixai-standards`
  and it resolves profile+ecosystem collection defaults into
  `./.agents/skills/**`.
- Explicit selectors remain optional additive overrides: use `--collection ...`
  and/or `--root-skill ...` only when narrowing or extending selection behavior.
- Content under `./.matrixai/matrixai-standards/standards/**` and
  `./.matrixai/matrixai-standards/skills/**` MUST NOT reference raw
  `exhibits/...` intake paths; use stable standards paths (for example
  `./.matrixai/matrixai-standards/standards/exhibits/...`) or source-repo
  identifiers instead.
- Prefer ASCII punctuation/symbols when an equivalent exists (see
  [`.matrixai/matrixai-standards/standards/HOTSET.md`](.matrixai/matrixai-standards/standards/HOTSET.md)
  [MXS-GEN-006]).
- Ensure edits comply with [`.editorconfig`](.editorconfig) (LF line endings,
  2-space indent, final newline, trim trailing whitespace).
- Line-reference policy (applies to all agent-generated repository content:
  Markdown, docs, templates, and code comments):
  - Never emit `path:line` (e.g. `foo.ts:1`, `README.md:126`) into repository
    files.
  - Do NOT put `:number` inside Markdown link destinations: `[x](path:123)` is
    banned.
  - If a line reference is needed, use either:
    - `[x](path#heading-anchor)` (if possible), or
    - `[x](path) (line 123)` (preferred, portable), or
    - `[x](path#L123)` only when explicitly targeting a renderer that supports
      `#L` anchors.
  - If you would have emitted `:1`, drop it entirely: use `path` with no line
    info.

## Project local configuration

- This package uses the `library-js` profile and provides the MatrixAI lint CLI,
  composable ESLint presets and domain adapters.
- Node.js 24 is the minimum supported runtime and the development/check
  baseline.
- Use the committed [flake](flake.nix) and [direnv configuration](.envrc) for
  the integrated flake-parts/devenv environment. Direnv activates the
  environment; it does not define a second one.
- Keep canonical Nix checks runnable without direnv or devenv activation.
- Keep TypeScript on ES2022 with NodeNext module resolution and the ES2022 and
  ESNext.Disposable libraries. Tests import compiled library code through the
  package's `#*` alias.
- Use these canonical commands:
  - Build: `npm run build`.
  - Test: `npm test` (build and development-config typecheck before Jest).
  - Active development: `npm run lintfix` first.
  - Non-mutating lint verification: `npm run lint`.
  - Documentation: `npm run docs`.
  - Benchmarks: not defined in this package.
- Keep domain tests under matching directories in [`tests`](tests), retain
  Jest/SWC ESM transforms and setup hooks, and emit JUnit/coverage under `tmp`.
- Keep each tool's native consumer rule configuration separate from the
  orchestration/scope configuration.
- Tailwind integration targets v4 CSS-first configuration. Mixed styling systems
  are supported by default; do not add framework-specific dependencies,
  stylesheet-scanning allowlists or variable-name exceptions.
- Preserve unrelated lint rules when updating an adapter, and exercise actual
  diagnostics and fixes in regressions.
- For completed implementation slices, provide a conventional commit command as
  a suggestion, but do not execute Git commits, tags, pushes, versioning or
  publication without authorization.
