# matrixai-standards

Agent-first standards for how MatrixAI structures repos and writes code - both
**coding-in-the-large** (architecture) and **coding-in-the-small**
(language/tooling). Humans can read these too, but the primary design goal is:
**agents can reliably find the right rules fast and apply them correctly**.

## Repository layout

```text
matrixai-standards/              # this repo (source)
  standards/
    HOTSET.md                    # universal MUST/MUST NOT rules (short)
    architecture/                # coding-in-the-large (boundaries, ontology, quality)
    coding/                      # coding-in-the-small (language + tooling)
    profiles/                    # repo-type keyed rules (application-js, etc.)
  templates/                     # copied into product repos

product-repo/                    # downstream repo consuming standards
  AGENTS.md                      # repo-root entrypoint for agents (repo-local)
  .matrixai/
    repo-profile.yml             # declares profile key for this repo
    matrixai-standards/          # vendored copy of this repo (git subtree)
      standards/
      templates/
```

## Core idea

Every product repo declares a single **repo profile key** (e.g.
`application-js`, `library-js`, `worker-js-cloudflare`, `docusaurus-js-cloudflare`). Agents then "key into":

1. **Universal contract** (always read): `standards/HOTSET.md`
2. **Profile contract** (read if relevant): `standards/profiles/<profile>.md` (see index `standards/profiles/README.md`)
3. **Deeper docs** (open on demand): `standards/architecture/*`,
   `standards/coding/*`

### Profile-key-first navigation for architecture overlays

Agents start from a single profile key, so any **profile-specific** architecture
variation SHOULD be discoverable by that same key.

- Shared architecture topics stay profile-agnostic (opened as needed):
  [`standards/architecture/repo-ontology.md`](standards/architecture/repo-ontology.md),
  [`standards/architecture/testing-quality.md`](standards/architecture/testing-quality.md),
  [`standards/architecture/security.md`](standards/architecture/security.md).
- When a profile introduces distinct external contracts or repo surfaces that
  require deeper reusable guidance (e.g. Cloudflare Wrangler deploy contract,
  Docusaurus content roots + LFS policy), create a **profile-key-named**
  architecture overlay and link to it from the profile doc:
  - Cloudflare Worker-only overlay:
    [`standards/architecture/worker-js-cloudflare.md`](standards/architecture/worker-js-cloudflare.md) ↔
    [`standards/profiles/worker-js-cloudflare.md`](standards/profiles/worker-js-cloudflare.md)
  - Cloudflare + Docusaurus overlay:
    [`standards/architecture/docusaurus-js-cloudflare.md`](standards/architecture/docusaurus-js-cloudflare.md) ↔
    [`standards/profiles/docusaurus-js-cloudflare.md`](standards/profiles/docusaurus-js-cloudflare.md)

This avoids creating redundant per-profile architecture files when the profile’s
architecture concerns are already covered by shared topics (e.g. `application-js`
and `library-js` primarily point to the shared ontology + testing/quality docs).

`repo-ontology` MAY still mention profile-specific surfaces, but MUST frame them
as conditional ontology rules (e.g. "When a repo uses profile X") so the document
remains a consistent map of repo boundaries rather than a platform cookbook:
[`standards/architecture/repo-ontology.md`](standards/architecture/repo-ontology.md).

Repo-local deviations live in the product repo's own `AGENTS.md` (short) and
optional override docs. `AGENTS.md` MUST also make command execution deterministic
in the repo's environment (e.g. by documenting a single execution prefix such as
`nix develop -c` for all golden commands).

## How product repos consume this

### Canonical downstream layout

Downstream repos MUST vendor this repository (as local files) under:

- `./.matrixai/matrixai-standards/`

Then downstream repos keep their own:

- `./.matrixai/repo-profile.yml` (profile selector)
- `./AGENTS.md` (repo-root entrypoint; points into the vendored standards)

### Install into an existing repo (recommended)

In a product repo:

0. Choose a profile key that exists under
   [`standards/profiles/`](standards/profiles) (e.g. `library-js`,
   `application-js`, `worker-js-cloudflare`, `docusaurus-js-cloudflare`). See the
   profile index [`standards/profiles/README.md`](standards/profiles/README.md)
   for the current list and deprecations.

1. Vendor this repo via **git subtree** (downstream-only history impact; squash yields one downstream commit, non-squash preserves upstream DAG inside downstream):

   ```sh
   git remote add matrixai-standards git@github.com:MatrixAI/matrixai-standards.git
   git subtree add --prefix .matrixai/matrixai-standards matrixai-standards master --squash
   ```

2. Declare the repo profile:

   ```sh
   mkdir -p .matrixai
   cp .matrixai/matrixai-standards/templates/.matrixai/repo-profile.yml.template .matrixai/repo-profile.yml
   # edit .matrixai/repo-profile.yml and set: profile: <profile-key>
   ```
   (Legacy path `templates/repo-profile.yml.template` is kept for backward compatibility.)

3. Add repo-root `AGENTS.md`:

   ```sh
   cp .matrixai/matrixai-standards/templates/AGENTS.md.template ./AGENTS.md
   # edit AGENTS.md and fill golden commands; you may specify a single execution prefix (e.g., "nix develop -c") if all commands run under it.
   ```

### Update vendored standards later

```sh
git subtree pull --prefix .matrixai/matrixai-standards matrixai-standards master --squash
```

### Example product-repo `AGENTS.md`

```md
# AGENT START

- Repo profile selector: `.matrixai/repo-profile.yml`
- Universal contract (always enforce): `.matrixai/matrixai-standards/standards/HOTSET.md`
- Profile contract (enforce for this repo type):
  - `.matrixai/matrixai-standards/standards/profiles/<profile>.md`
  - Profile index: `.matrixai/matrixai-standards/standards/profiles/README.md`

- Apply repo-local golden commands and overrides here (use `npm run lintfix` during active development; use `npm run lint` for non-mutating CI checks):
  - build: ___
  - test: ___
  - lintfix: ___
  - lint: ___
  - docs: ___
  - bench: ___
```

### Vendoring strategy

Standards must be available as **local files** for deterministic agent behavior.
Prefer one of:

- **git subtree** (low friction; downstream-only history is affected) to vendor this repo into product repos, or
- **copy/sync** via a simple script (optional), or
- **git submodule** (hard pinning, more operational friction)

Regardless of mechanism, the key requirement is: the relevant standards files
are present in the product repo working tree (or reliably synchronized) when
agents run.

This repo's documentation assumes `git subtree` into
`./.matrixai/matrixai-standards/`.

## Tool wiring

Tool wiring lives in templates so downstream repos can copy the minimal files they
need. Baseline includes a ready-to-copy aider config
([`.aider.conf.yml.template`](templates/.aider.conf.yml.template)) that points aider
at the repo-root `AGENTS.md`.

## Writing rules

### Normative style (agent-first)

- Rules use MUST / MUST NOT / SHOULD.
- Every rule has a stable ID (e.g. `[MXS-ARCH-001]`).
- Each doc begins with a **Rules** section (bullet list).
- Keep rationale short; only include what prevents repeated mistakes.
- Examples must be tiny; prefer pseudocode or small snippets.

### Hot set guidance

`standards/HOTSET.md` should stay small (target: 10-20 rules, 1-2 pages). The
hot set is what agents should keep "in mind" constantly; everything else is
opened as needed.

## Profiles

Profiles are the bridge between universal rules and repo-specific reality. A
profile doc should include:

- When it applies (what repo types match)
- Profile Rules (5-20)
- Expected layout (directory ontology)
- Golden commands (exact commands, exact spellings)
- Pointers to relevant `standards/architecture/*` and `standards/coding/*`

## Versioning

- `VERSION` is the human-visible version.
- `CHANGELOG.md` records meaningful changes in rules or profiles.
- Product repos should pin a standards snapshot (e.g. via subtree commit,
  submodule commit, or a lock file you generate during sync).

## Note: this repo is not a "product repo"

`matrixai-standards` is a standards **source** repo. It is not expected to match
any product repo profile. Product repos should declare their own profile in
`./.matrixai/repo-profile.yml`.

## Quick start for contributors (this repo)

1. Update `standards/HOTSET.md` first when introducing new universal invariants.
2. If a rule only applies to a class of repos, put it in
   `standards/profiles/<profile>.md`.
3. If it's "coding-in-the-large", put it in `standards/architecture/`.
4. If it's "coding-in-the-small", put it in `standards/coding/<lang>/` or
   `standards/coding/tooling/`.
5. Keep templates in sync with the taxonomy so new repos adopt the system
   easily.
