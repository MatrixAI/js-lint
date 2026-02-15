# Profiles index

This directory contains **repo profiles**.

A profile is selected by the downstream product repo via `.matrixai/repo-profile.yml`
(see template [`../../templates/.matrixai/repo-profile.yml.template`](../../templates/.matrixai/repo-profile.yml.template)).

Agents MUST:

1. Start from the product repo's `AGENTS.md` (repo root).
2. Read and enforce the universal contract: [`../HOTSET.md`](../HOTSET.md).
3. Read and enforce the selected profile doc: `<profile>.md` in this directory.

## Current profile keys

- `library-js` - published-style Node/TS library.
  - Doc: [`library-js.md`](library-js.md)

- `application-js` - Node/TS application/CLI.
  - Doc: [`application-js.md`](application-js.md)

- `worker-js-cloudflare` - Cloudflare Worker application (Wrangler), no Docusaurus assumptions.
  - Doc: [`worker-js-cloudflare.md`](worker-js-cloudflare.md)

- `docusaurus-js-cloudflare` - Docusaurus site deployed via Cloudflare (Wrangler) and backed by a Worker.
  - Doc: [`docusaurus-js-cloudflare.md`](docusaurus-js-cloudflare.md)
