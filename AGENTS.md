# AGENTS.md — Nexora

## Scope and current architecture

These instructions apply to the whole Nexora repository. Treat source and configuration as authoritative; docs and sample data do not prove remote credentials, deployed bindings, storage availability, or production behavior.

- React 19, Vite 8, Tailwind CSS v4, React Router 7, pnpm.
- `src/App.jsx` defines routes; `src/layouts/AppLayout.jsx` keeps a shared `AppShell` around the route outlet.
- `src/components/layout/` contains responsive navigation, header, and app shell. `src/components/files/` contains file browser UI. `src/hooks/` owns reusable state. `src/services/` is the intended location for domain API clients as integrations are added.
- `src/index.css` owns design tokens and Liquid Glass primitives. Base UI/shadcn wrappers live in `src/components/ui/`.
- `src/data/files.js` is demo data for Dashboard and other workspace views. `FilesProvider` keeps demo file state, favorites, recents, and Trash in memory across routes; these demo changes reset when the tab is refreshed. Phase 9.2 File Browser listing/navigation/folder creation use logical object metadata from the authenticated Nexora Storage API. Upload remains unavailable in that browser.
- `wrangler.jsonc` configures Pages output in `dist/` and Nexora-owned `DB` D1 binding `nexora-db`. Production provisioning and migration status are operator-confirmed; verify live state separately.
- `functions/_lib/` owns Pages API routing, shared PBKDF2-HMAC-SHA-256 password hashing/verification at 100,000 iterations, hashed-cookie sessions, mount authorization, response normalization, and the server-only Shared Storage client. The React app does not import this code.
- `storage_mounts.shared_storage_project_id` is an internal server mapping. Browser requests use Nexora mount/object IDs and cannot choose project IDs or receive provider references.
- Phase 9.1 adds authenticated storage discovery/capabilities through the Nexora same-origin API. Phase 9.2 connects File Browser listing, pagination, navigation, and capability-gated folder creation; Dashboard, Recent, Favorites, Shared, Trash and their fixtures remain demo-only.
- IssueDesk and its Garage-backed Storage Service are separate projects. Do not add copied IssueDesk storage/business logic or imply that Nexora currently authenticates to or persists files in that service.

## Project map

- `src/App.jsx`, `src/layouts/`: routing and persistent shared shell.
- `src/context/AuthProvider.jsx`, `src/hooks/useAuth.js`, `src/services/auth.js`: same-origin auth requests, session bootstrap, login/logout, and public user state.
- `src/context/StorageProvider.jsx`, `src/hooks/useStorage.js`, `src/services/storage.js`: authenticated same-origin storage mount discovery, public capabilities, optional usage, object listing/pagination and folder creation.
- `src/components/auth/`, `src/pages/Login.jsx`: loading/error gates, protected-route handling, and sign-in page.
- `src/context/FilesProvider.jsx`, `src/context/files-context.js`: in-memory demo state plus remote File Browser state context.
- `src/pages/WorkspacePage.jsx`: Dashboard, Recent, Favorites, Shared, Trash, Storage, and Settings route views.
- `src/components/navigation/navigation.js`: route labels, icons, grouping, and page descriptions.
- `src/components/files/`, `src/hooks/useFiles.js`, `src/hooks/useRemoteFilesState.js`, `src/utils/storage-files.js`: remote File Browser list/navigation/create-folder UI and isolated demo domain state for other workspace views.
- `functions/api/[[path]].js`, `functions/_lib/`: Pages Functions entry and server-only auth/storage handlers.
- `migrations/0001_backend_foundation.sql`: Nexora D1 users, sessions, mounts, login throttling, Favorites, and bounded Recent metadata.
- `scripts/create-admin.mjs`: local-only first-admin provisioning via Wrangler `--local`.
- `scripts/create-admin-remote.mjs`, `scripts/create-storage-mount-remote.mjs`: explicit production-only provisioning commands; both target `nexora-db` using Wrangler `--remote`.
- `scripts/lib/production-provisioning.js`: private SQL-file runner and SQL builders for the production provisioning commands.
- `tests/backend.test.js`: Node tests using in-memory SQLite and mocked Shared Storage.
- `src/hooks/useUploadQueue.js`: current local demo upload queue; it is not a network uploader.
- `src/data/files.js`: fixture entries.
- `src/components/ui/`, `src/utils/cx.js`, `src/utils/glass.js`, `src/index.css`: shared controls, classes, glass interactions, and tokens.
- `README.md` and `docs/DESIGN_SYSTEM.md`: current user-facing project status and design usage.
- `docs/STORAGE_API_AUDIT.md`: source-derived IssueDesk and Shared Storage API endpoint/auth/streaming audit.
- `docs/STORAGE_ARCHITECTURE.md`: current/target provider architecture and Phase 8 implementation boundary.
- `docs/STORAGE_API_V1_PROPOSAL.md`: reviewed provider-neutral `/api/storage/v1/*` contract; implemented routes remain subject to later production review.
- `docs/PHASE_8.md`: backend/auth/API implementation report and local verification.
- `docs/PHASE_8_5.md`: frontend auth routes, session lifecycle, security review, validation, and manual production smoke test.
- `docs/PHASE_9_1.md`: storage client/provider, safe mount bootstrap, capability/usage state, validation, production smoke test, and Phase 9.2 boundary.
- `docs/PHASE_9_2.md`: real File Browser listing, folder navigation, create-folder scope, local validation, QA and production boundary.
- `docs/PRODUCTION_PROVISIONING.md`: operator commands, environment variables, and rollback/recovery guidance for production admin and mount creation.
- `docs/STORAGE_PHASE_S1.md` and `docs/STORAGE_PHASE_S2.md`: Shared Storage implementation in the separate IssueDesk checkout. The historical S2 report predates the Phase 9.1 brief's operator-reported production deployment; Nexora must not infer live state from source docs.
- `PROJECT_HANDOFF.md`: verified Phase 7/S1/S2, Phase 8 backend, Phase 8.5 frontend auth, and remaining Phase 9 scope.

Check this map against actual files when changing the architecture; update README when any statement becomes stale.

## Working principles

1. Inspect current source, package scripts, git status, and the nearest instructions before editing. Preserve existing user changes.
2. Keep IssueDesk strictly a reference for architecture and design; Nexora remains a private-cloud/file-management product.
3. Keep each phase focused. Avoid adding framework layers, dependencies, or persistent backend contracts without a concrete need.
4. Preserve existing file navigation, selection, dialogs, and upload-queue behavior when improving the browser.
5. Clearly label local/demo-only behavior. Never describe local upload progress as transfer to Garage, QNAP, or a cloud API.
6. Never expose service credentials in `VITE_*`, JSX, client bundles, or browser requests. When integration begins, use a Nexora server-side domain API, ownership checks, and a separately reviewed shared Storage contract.
7. Do not modify or deploy remote infrastructure, D1 data, Storage data, or secrets without explicit authorization.
8. When work changes the UI or file behavior, keep README, this file, and design notes aligned with the resulting source.
9. After every project change, synchronize `README.md`, `AGENTS.md`, and `PROJECT_HANDOFF.md` with the resulting source, current scope, and checks actually completed. Keep pending QA and unapproved backend work clearly marked; do not claim a check passed before running it.

## React, JSX, and styling conventions

- Follow existing React/JSX patterns and prefer state derived during render over redundant effects.
- Keep route-level concerns in route/layout components, file behavior in file hooks/services, and presentation in file components.
- Use the existing Base UI and shadcn wrappers before adding new primitives.
- Every JSX `className` prop written or modified must use `cx()` from `src/utils/cx.js`, including static classes and callback return values. Do not use templates, concatenation, arrays, or object maps inside `cx()`; it only filters falsy values and joins strings and does not merge Tailwind conflicts.
- Keep Tailwind class fragments static and semantic. Follow the existing theme tokens, glass utilities, reduced-motion behavior, and mobile-first patterns.
- Keep keyboard access, focus-visible styling, accessible labels, and dialog titles. Clean up effects, listeners, object URLs, and timers introduced by code.
- Show duplicate-name validation inline and associate input errors with the relevant field using `aria-invalid`, `aria-describedby`, and a live alert.
- Use semantic progressbar values and labels for progress indicators, polite status announcements for completion, and sufficiently large touch targets for row actions.
- Keep long breadcrumbs usable on narrow screens and honor `prefers-reduced-motion` for animation and transitions.
- Preserve `Button` Base UI semantics, variants, `ref`, render/slot composition, state-based className callbacks, and caller event handlers when extending the shared component.
- Use the shared `Button` for actions and retain its IssueDesk-referenced Liquid Glass hover behavior; button sheen and pointer light should contrast with light and dark button surfaces; avoid one-off button styling that bypasses the shared variants.
- Never log auth request bodies, credentials, passwords, password hashes, salts, cookies, session tokens, authorization headers, or raw secrets. Use the shared password helper for all user creation and verification.

## File Browser behavior

- Fixture IDs and object URLs are not stable server file IDs. Phase 9.2 File Browser uses only public logical object IDs returned by Nexora APIs; never accept a provider project ID or physical reference from the browser.
- `FilesProvider` demo state backs Dashboard, Recent, Favorites, Shared and Trash. The File Browser has separate remote listing/navigation state; do not make those demo mutations appear to update the connected mount.
- The upload queue simulates progress and does not send bytes. Upload/download/preview and file mutations other than folder creation are unavailable in the connected File Browser.
- Folder navigation uses the `folder` query parameter on `/files`; validate logical IDs and breadcrumb history state, and safely return to root for unverified or deleted folders.
- Keep folder navigation and breadcrumbs consistent. Use backend cursors and merge pages by logical object ID; root requests omit `parentId`. Search/sort apply only to loaded items and use normalized fields (name, `modifiedAt`, `sizeBytes`), never display strings such as `"2.4 MB"` as numeric sizes.
- Preserve selection across supported view changes; clear or reconcile it on storage/folder changes and filtering where appropriate.
- Revoke object URLs and release upload references when previews or local queue items are removed.
- Trash restore/permanent delete in the workspace remain local demo operations; label them clearly and confirm permanent deletion. Connected File Browser delete/Trash is not implemented.
- Shared entries are illustrative fixture metadata. Do not claim that Nexora creates shares, permissions, or access links until a reviewed server API exists.
- Storage status comes from the authenticated Nexora storage API; usage/capacity must say unavailable or not reported unless authoritative metrics are returned. Never present fixture totals as live provider usage.
- Do not claim preview or download is available in the connected File Browser or for entries without source bytes. Uploaded browser `File` objects can support session-only local preview/download only in demo flows that explicitly expose them.

## Dependencies and commands

Use pnpm. The current root scripts are:

```bash
pnpm dev
pnpm lint
pnpm build
pnpm test
pnpm db:migrate:local
pnpm admin:create:local
pnpm admin:create:remote
pnpm storage:mount:create:remote
pnpm preview
pnpm deploy
pnpm cf-typegen
```

`pnpm test` uses Node's test runner with in-memory SQLite, mocked upstream calls, auth-client logic, and pure provisioning logic; it never writes remote D1. `pnpm db:migrate:local` always uses Wrangler `--local`; never remove that flag for routine validation. `pnpm admin:create:local` remains local-only. The explicit `*:remote` provisioning commands target `nexora-db` with `--remote`; never run them during validation or without a reviewed operator request. `pnpm preview` builds and starts Wrangler Pages locally. `pnpm deploy` deploys; it is not a validation command and requires explicit authorization.

When dependencies appear incomplete, inspect the package manager/store and preserve `package.json` and `pnpm-lock.yaml`. Do not change dependency versions merely to work around a local `node_modules` hydration problem.

## Git and completion

- Inspect `git status --short` before editing; preserve pre-existing modifications and untracked work.
- Do not commit, push, deploy, rewrite remote services, or alter production data unless the user explicitly asks.
- Review the final diff for unintended files and `git diff --check` when appropriate.
- Report changes, verification actually performed, and limitations such as demo-only file data or missing backend integration.
