---
name: nexora-project
description: Use when implementing, debugging, reviewing, or documenting the Nexora repository, especially its File Browser and Cloudflare Pages Storage integration. Keep IssueDesk and its Garage service as a separate system.
---

# Nexora repository workflow

Use this skill only for the Nexora checkout. Start with the current `AGENTS.md`, `git status --short`, and relevant source/configuration; preserve all pre-existing work. `AGENTS.md` is the detailed source for repository conventions and inventory. Keep `README.md`, `AGENTS.md`, and `PROJECT_HANDOFF.md` aligned when project behavior or scope changes.

## Architecture boundaries

- Nexora is a React/Vite app with Cloudflare Pages Functions and Nexora-owned D1. Browser Storage traffic goes through same-origin `/api/storage/v1/*`; Pages Functions own authentication, mount authorization, provider mapping, and the server-only Shared Storage client.
- Browser requests use Nexora storage/object IDs. Resolve an owned mount to its internal Shared Storage project on the server. Never send service credentials, project IDs, provider references, Garage keys, or bucket details to `VITE_*`, client code, browser requests, or ordinary logs.
- IssueDesk and its Garage-backed Storage API are separate systems. Treat their source as reference only; do not edit or copy their business logic during Nexora tasks. Keep Nexora's API provider-neutral.
- `FilesProvider` demo state and the connected File Browser are distinct. Check current source and phase reports before describing which operations are real; do not infer deployment, migrations, credentials, or production health from local docs.

## Implementation guidance

- Trace storage failures through the browser service, Pages route, D1 mount/ownership resolution, server-side provider client, and upstream result before making UI-only changes. Keep upstream diagnostics value-free and expose only safe normalized errors to the browser.
- Preserve File Browser navigation, pagination, selection, destination dialogs, cancellation, and upload queue behavior. Keep folder and object IDs logical and never treat fixture IDs as remote IDs.
- For JSX touched in this repo, use `cx()` for every `className`; use shared UI controls and existing Liquid Glass tokens. Consult `AGENTS.md` for detailed interaction and accessibility rules.
- Keep work phase-scoped. Do not start later-phase features from a handoff or roadmap unless the user asks. Remote deploys, D1 migrations, secrets, and Storage data changes require explicit authorization for that task.
- Use the repository's `pnpm` scripts and relevant tests. Report only checks actually run, and distinguish local validation from operator-confirmed production behavior.
