# Exhibit conventions (non-normative)

Purpose: Provide portable, minimal exhibit/snippet guidance for standards docs; exhibits are optional and non-normative.

## Definition
- An Exhibit is a concise, non-normative snippet, configuration fragment, or mini artifact that illustrates how to satisfy a rule without changing normative requirements.
- Exhibits MUST be portable: do not depend on private repos, internal non-vendored synthesis materials, or environment-specific assets.

## Naming and labeling
- Number exhibits per document using `Exhibit <DOC>-<n>` where `<DOC>` is the uppercase basename (e.g., `HOTSET`) and `<n>` starts at 1.
- Use a level-3 heading: `### Exhibit <DOC>-<n> - <title>`.
- Keep titles short (<=60 chars) and focused on the subject the snippet demonstrates.

## Sizing rules
- Prefer snippets <=30 lines or <=300 words; trim to the minimal fragment that demonstrates the rule.
- Use ellipses (`...`) or placeholders to avoid large boilerplate, but retain enough context to be runnable or readable.

## Inline vs shared
- Inline the exhibit inside the hosting doc when it is specific to that doc and fits the sizing rules.
- Create a shared exhibit file when the same snippet supports multiple docs, or when inlining would materially bloat the hosting doc.
- Shared exhibits live under [`exhibits/`](exhibits/README.md); name files `<topic>-exhibit-<n>.md` with a top-level heading `Exhibit <TOPIC>-<n> - <title>`.

## Referencing exhibits
- From a rule, reference the exhibit inline parenthetically, e.g., `(see Exhibit HOTSET-1)` with a clickable link to the exhibit heading in the same file.
- When referencing a shared exhibit, link directly to the shared file with its line number, e.g., `[Exhibit TOOLING-1](exhibits/tooling-exhibit-1.md)`.
- Do not reference internal, non-vendored synthesis materials or any non-portable sources; keep references relative and inside this repo.

## Maintenance
- Keep exhibits aligned with the rules they support; update both together.
- Remove stale exhibits when the supported rule is removed or significantly changed.
