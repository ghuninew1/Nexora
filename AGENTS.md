# AGENTS.md — Nexora

## Scope and current architecture

These instructions apply to the whole Nexora repository. Treat source and configuration as authoritative; docs and sample data do not prove remote credentials, deployed bindings, storage availability, or production behavior.

- React 19, Vite 8, Tailwind CSS v4, React Router 8, pnpm.
- `src/App.jsx` defines routes and keeps a shared `AppShell` around the route outlet.
- `src/components/layout/` contains responsive navigation, header, and app shell. `src/components/files/` contains file browser UI. `src/hooks/` owns reusable state. `src/services/` is the intended location for domain API clients as integrations are added.
- `src/index.css` owns design tokens and Liquid Glass primitives. Base UI/shadcn wrappers live in `src/components/ui/`.
- `src/data/files.js` remains demo data for legacy examples only; Dashboard, Recent, Favorites, File Browser, and Trash use authenticated Nexora data where implemented. Phase 9.5 uses the existing D1 `recent_access` store and `/api/recent` routes for bounded Recent history and current object hydration.
- `wrangler.jsonc` configures Pages output in `dist/` and Nexora-owned `DB` D1 binding `nexora-db`. Production provisioning and migration status are operator-confirmed; verify live state separately.
- `functions/_lib/activity.js` owns best-effort authenticated activity writes, retention, safe snapshots and cursor API; migration `0003_activity_events.sql` owns persistent history.
- `functions/_lib/` owns Pages API routing, shared PBKDF2-HMAC-SHA-256 password hashing/verification at 100,000 iterations, hashed-cookie sessions, mount authorization, response normalization/security headers, and the server-only Shared Storage client. The React app does not import this code.
- `storage_mounts.shared_storage_project_id` is an internal server mapping. Browser requests use Nexora mount/object IDs and cannot choose project IDs or receive provider references.
- Phase 9.1 adds authenticated storage discovery/capabilities through the Nexora same-origin API. Phase 9.2 connects File Browser listing, pagination, navigation, and capability-gated folder creation; Phase 9.3 adds capability-gated upload/download/rename/move/copy; Phase 9.3.1 adds an in-memory metadata-only listing cache; Phase 9.3.2 adds on-demand safe inline preview through the authenticated download path and fixes exact-ancestor breadcrumb navigation; Phase 9.4 connects Move to Trash, Trash listing, restore, and permanent delete; Phase 9.4.1 connects selection actions and Favorites; Phase 9.5 connects Recent tracking, Recent page, and Dashboard. Phase 9.6 connects Shared to persistent owner-scoped public links and adds independent public routes. Phase 9.7 adds upload Retry/Cancel guards and bounded multi-selection Move/Trash; authoritative usage is still unavailable because the Nexora usage route reports no provider metrics.
- IssueDesk and its Garage-backed Storage Service are separate projects. Do not add copied IssueDesk storage/business logic or imply that Nexora currently authenticates to or persists files in that service.

## Project map

- `src/App.jsx`, `src/components/layout/`: routing and persistent shared shell.
- `src/context/AuthProvider.jsx`, `src/hooks/useAuth.js`, `src/services/auth.js`: same-origin auth requests, session bootstrap, login/logout, and public user state.
- `src/context/StorageProvider.jsx`, `src/hooks/useStorage.js`, `src/services/storage.js`: authenticated same-origin storage mount discovery, public capabilities, optional usage, object listing/pagination, folder creation, Favorites, Recent, and Trash lifecycle requests.
- `src/components/auth/`, `src/pages/Login.jsx`: loading/error gates, protected-route handling, and sign-in page.
- `src/context/FilesProvider.jsx`, `src/context/files-context.js`: in-memory demo state plus remote File Browser state context.
- `src/pages/WorkspacePage.jsx`: Dashboard, Recent, Favorites, connected Trash, Storage, and Settings route views.
- `src/components/navigation/navigation.js`: route labels, icons, grouping, and page descriptions.
- `src/components/files/`, `src/hooks/useFiles.js`, `src/hooks/useRemoteFilesState.js`, `src/utils/storage-files.js`, `src/utils/remote-files-cache.js`: remote File Browser, Recent and Favorites state; bounded metadata-only folder cache and retained legacy demo helpers.
- `functions/api/[[path]].js`, `functions/_lib/`: Pages Functions entry, server-only auth/storage handlers, API security headers, and value-free capability/Copy-upstream diagnostics with manual trusted-origin redirect policy.
- `functions/_middleware.js`, `public/_headers`, `public/theme-init.js`, `index.html`: HTML CSP/security headers and the same-origin theme bootstrap. The middleware creates a fresh per-response nonce for HTML to support Cloudflare JavaScript Detections; preserve `script-src 'self'`, the Cloudflare Insights beacon host allowlist, and the blob frame allowance required for connected PDF previews. Never replace nonce support with `unsafe-inline` or a guessed dynamic hash.
- `migrations/0001_backend_foundation.sql`: Nexora D1 users, sessions, mounts, login throttling, Favorites, and bounded Recent metadata. Phase 9.5 reuses this schema; Phase 9.6 adds public shares in `0002`; `0004` adds public-share expiry.
- `scripts/create-admin.mjs`: local-only first-admin provisioning via Wrangler `--local`.
- `scripts/create-admin-remote.mjs`, `scripts/create-storage-mount-remote.mjs`: explicit production-only provisioning commands; both target `nexora-db` using Wrangler `--remote`.
- `scripts/lib/production-provisioning.js`: private SQL-file runner and SQL builders for the production provisioning commands.
- `tests/backend.test.js`: Node tests using in-memory SQLite and mocked Shared Storage, including Recent ownership, upserts, hydration, stale cleanup, and failure isolation.
- `src/hooks/useUploadQueue.js`: workspace upload queue with bounded concurrency, legacy indeterminate uploads and capability-gated multipart controls/server-acknowledged progress. File/controllers/session keys stay outside React state; lifecycle shutdown never cancels server sessions.
- `src/components/files/StorageFilePreviewDialog.jsx`, `src/utils/storage-preview.js`, `src/utils/preview-request.js`: safe on-demand connected-file previews, MIME allowlist, text-size limits, and request cancellation/race control.
- `src/components/files/FolderDestinationDialog.jsx`: lazy folder-only destination picker for move/copy.
- `src/data/files.js`: fixture entries.
- `src/components/ui/`, `src/utils/cx.js`, `src/utils/glass.js`, `src/index.css`: shared controls, classes, glass interactions, and tokens.
- `README.md` and `docs/DESIGN_SYSTEM.md`: project overview, setup, usage, and design guidance; detailed history and validation belong in the handoff and release notes.
- `docs/STORAGE_API_AUDIT.md`: source-derived IssueDesk and Shared Storage API endpoint/auth/streaming audit.
- `docs/STORAGE_ARCHITECTURE.md`: current/target provider architecture and Phase 8 implementation boundary.
- `docs/LARGE_FILE_TRANSFER_PLAN.md`: Phase 1 audit and proposed resumable upload/Range download contracts. No large-file runtime support or verified 10 GiB infrastructure is implied; Shared Storage changes require separate authorization.
- `docs/STORAGE_API_V1_PROPOSAL.md`: reviewed provider-neutral `/api/storage/v1/*` contract; implemented routes remain subject to later production review.
- `docs/PHASE_8.md`: backend/auth/API implementation report and local verification.
- `docs/PHASE_8_5.md`: frontend auth routes, session lifecycle, security review, validation, and manual production smoke test.
- `docs/PHASE_9_1.md`: storage client/provider, safe mount bootstrap, capability/usage state, validation, production smoke test, and Phase 9.2 boundary.
- `docs/PHASE_9_3.md`: real file operations, current Copy production incident, safe diagnostics, validation, and deployment smoke checklist.
- `docs/PHASE_9_3_1.md`: source-derived listing latency path, in-memory cache policy, invalidation, tests, and browser/production QA checklist.
- `docs/PHASE_9_3_2.md`: exact breadcrumb navigation, safe on-demand inline preview, size/MIME policy, request lifecycle, and validation boundary.
- `docs/PHASE_9_4.md`: connected Trash lifecycle, capability checks, cache invalidation, safe confirmation, local validation, and production QA checklist.
- `docs/PHASE_9_7.md`: aggregate usage audit, upload queue reliability, bounded bulk Move/Trash, validation, and production boundary.
- `docs/PHASE_9_2.md`: real File Browser listing, folder navigation, create-folder scope, local validation, QA and production boundary.
- `docs/PRODUCTION_PROVISIONING.md`: operator commands, environment variables, and rollback/recovery guidance for production admin and mount creation.
- `docs/STORAGE_PHASE_S1.md` and `docs/STORAGE_PHASE_S2.md`: Shared Storage implementation in the separate IssueDesk checkout. The historical S2 report predates the Phase 9.1 brief's operator-reported production deployment; Nexora must not infer live state from source docs.
- `PROJECT_HANDOFF.md`: verified Phase 7/S1/S2, Phase 8 backend, Phase 8.5 frontend auth, and remaining Phase 9 scope.
- `docs/V1.0.1_RELEASE.md`: source changes and validation/production boundaries for v1.0.1.
- `docs/PHASE_10_0.md`, `docs/PHASE_10_0_1.md`, `docs/PHASE_10_1.md`, `docs/PHASE_10_1_1.md`: operator-confirmed production-readiness result, DNS/network verification limitation, CSP fix, and production security gates. Phase 10.1.1 records the 2026-10-28 post-CSP all-functions smoke check as operator-confirmed, not tool-verified; it is a read-only audit, and unresolved infrastructure gates require operator action. Local source evidence does not prove Cloudflare deployment, remote bindings, Access policy, or secret configuration.
- `.agents/skills/nexora/SKILL.md`: project-scoped Codex workflow, supplementing the detailed repository rules here.

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
9. After every project change, review `README.md` and `AGENTS.md` for current project information, and record every change and checks actually completed in `PROJECT_HANDOFF.md`. Keep README focused on the project, setup, and usage rather than change history. Keep pending QA and unapproved backend work clearly marked; do not claim a check passed before running it.
10. Production readiness reports must distinguish source-derived configuration from live platform state. Never print or read secret values for inventory; do not deploy, migrate, rotate, or modify production resources without explicit authorization.

## React, JSX, and styling conventions

- Follow existing React/JSX patterns and prefer state derived during render over redundant effects.
- Keep route-level concerns in route/layout components, file behavior in file hooks/services, and presentation in file components.
- Use the existing Base UI and shadcn wrappers before adding new primitives.
- Every JSX `className` prop written or modified must use `cx()` from `src/utils/cx.js`, including static classes and callback return values. Do not use templates, concatenation, arrays, or object maps inside `cx()`; it only filters falsy values and joins strings and does not merge Tailwind conflicts.
- Keep Tailwind class fragments static and semantic. Follow the existing theme tokens, glass utilities, reduced-motion behavior, and mobile-first patterns.
- Dark mode uses near-black blue-charcoal surfaces (`#090d12`) with a mint primary accent in `src/index.css`; preserve Light mode tokens when changing the palette.
- Keep keyboard access, focus-visible styling, accessible labels, and dialog titles. Clean up effects, listeners, object URLs, and timers introduced by code.
- Show duplicate-name validation inline and associate input errors with the relevant field using `aria-invalid`, `aria-describedby`, and a live alert.
- Use semantic progressbar values and labels for progress indicators, polite status announcements for completion, and sufficiently large touch targets for row actions.
- Keep long breadcrumbs usable on narrow screens and honor `prefers-reduced-motion` for animation and transitions.
- Preserve `Button` Base UI semantics, variants, `ref`, render/slot composition, state-based className callbacks, and caller event handlers when extending the shared component.
- Use the shared `Button` for actions and retain its IssueDesk-referenced Liquid Glass hover behavior; button sheen and pointer light should contrast with light and dark button surfaces; avoid one-off button styling that bypasses the shared variants.
- Header spans the viewport; the desktop Sidebar begins below it, while mobile navigation remains a drawer.
- Sidebar NavLinks use the shared Liquid Glass hover treatment like the Collapse button in Light and Dark themes, with a separate active state.
- Never log auth request bodies, credentials, passwords, password hashes, salts, cookies, session tokens, authorization headers, or raw secrets. Use the shared password helper for all user creation and verification.
- Storage diagnostics may log only binding presence, request stage, HTTP status, allowlisted error type/result, and redirect origin classification; never log storage/project IDs, upstream/redirect URL, provider references, headers/values, or response bodies.

## File Browser behavior

- Fixture IDs and object URLs are not stable server file IDs. File Browser uses only public logical object IDs returned by Nexora APIs; never accept a provider project ID or physical reference from the browser.
- Dashboard uses public StorageProvider state and the shared authenticated Recent/Favorites data sources. Recent entries are created only by explicit object access; passive listing, render, cache revalidation, and Dashboard/Recent/Favorites reads do not write Recent. Shared uses its own owner-scoped D1 public-share records. Connected Trash has separate mount-scoped remote state; do not make demo mutations appear to update the connected mount.
- Recent folder actions must navigate to the `/files` pathname with the logical `folder` query and validated breadcrumb state; changing search parameters alone leaves the user on `/recent`.
- Recent and Dashboard Recent panels must mount the shared preview dialog when exposing Preview; hide Preview for unsupported MIME types and objects larger than their preview limit.
- Favorites folder rows use the same validated File Browser navigation; file rows can open their containing folder when the hydrated parent ID is available.
- The connected File Browser upload queue sends bytes through the Nexora API with user-configured concurrency of 1, 2, 3 or 5 (fallback 3 while preferences are unavailable); do not invent byte progress. Download remains streamed through the same-origin API. Rename/move retain IDs and copy creates new IDs. Preview is on-demand through the authenticated inline route. Normal Delete means Move to Trash; restore and permanent delete use separate Trash-only actions.
- The Copy/Move destination picker places New folder at the lower left opposite Cancel and can create a folder in the displayed destination when createFolder is permitted, invalidating its parent listing cache.
- Folder navigation uses the `folder` query parameter on `/files`; validate logical IDs and breadcrumb history state, and safely return to root for unverified or deleted folders.
- File Browser Modified shows Asia/Bangkok date and 24-hour time with seconds; sorting still uses the original timestamp.
- List column headings sort loaded items by Name, Modified, or Size; clicking the active heading reverses its direction and stays synchronized with the sort menu.
- Keep folder navigation and breadcrumbs consistent. Use backend cursors and merge pages by logical object ID; root requests omit `parentId`. Search/sort apply only to loaded items and use normalized fields (name, `modifiedAt`, `sizeBytes`), never display strings such as `"2.4 MB"` as numeric sizes.
- Preserve selection across supported view changes; clear or reconcile it on storage/folder changes and filtering where appropriate.
- Revoke object URLs and release upload references when previews or local queue items are removed.
- Trash listing and lifecycle operations are mount-scoped and capability-gated. Server mutations also check mount ownership, capability, and read-only policy. Permanent Delete is available only from Trash and requires an explicit irreversible confirmation.
- Shared lists persistent owner public links. Sharing permits view/download only; no account-to-account sharing or public writes. Public routes must remain outside AuthProvider, StorageProvider and FilesProvider.
- Storage status comes from the authenticated Nexora storage API; usage/capacity must say unavailable or not reported unless authoritative metrics are returned. Never present fixture totals as live provider usage.
- File Browser grid uses equal square cards with responsive columns; preserve selection, Favorites, folder navigation and row actions. File Browser list/grid uses file type icons for images, videos, text and PDF based on MIME type or filename extension when MIME is unavailable; other files use the generic icon.
- File Browser listing cache is session-scoped in memory, keyed by storage plus logical parent (with an explicit root identity), bounded to 60 folders, and stale after 20 seconds. Keep request dedupe cursor-specific, clear on auth/storage scope changes, and selectively invalidate affected parents after mutations. Never cache bytes or provider internals.
- Trash uses a separate cursor-paginated in-memory collection, deduplicated by logical object ID. Move to Trash invalidates its source folder and removes cached subtree metadata/listings; restore removes the Trash row and invalidates only the response's authoritative parent; permanent delete removes the Trash row and safe subtree metadata. Do not clear unrelated folder listings.
- Connected File Browser preview is an app-level feature backed by the authenticated `download` capability; it does not assert provider `preview` support. Only allowlisted image/PDF/text/video content may preview, text is capped at 1 MiB, and preview bytes are fetched only after the user selects Preview. Listing cache remains metadata-only. Demo entries still have no source bytes.

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

`pnpm test` runs Node tests with in-memory SQLite and mocked services, then Vitest/Testing Library UI tests in jsdom; it never writes remote D1. `pnpm test:ui` runs the UI tests alone. `pnpm db:migrate:local` always uses Wrangler `--local`; never remove that flag for routine validation. `pnpm admin:create:local` remains local-only. The explicit `*:remote` provisioning commands target `nexora-db` with `--remote`; never run them during validation or without a reviewed operator request. `pnpm preview` builds and starts Wrangler Pages locally. `pnpm deploy` deploys; it is not a validation command and requires explicit authorization.

When dependencies appear incomplete, inspect the package manager/store and preserve `package.json` and `pnpm-lock.yaml`. Do not change dependency versions merely to work around a local `node_modules` hydration problem.

## Git and completion

- Inspect `git status --short` before editing; preserve pre-existing modifications and untracked work.
- Do not commit, push, deploy, rewrite remote services, or alter production data unless the user explicitly asks.
- Review the final diff for unintended files and `git diff --check` when appropriate.
- Report changes, verification actually performed, and limitations such as demo-only file data or missing backend integration.

## Phase 9.6 — Sharing boundary and validation

- `functions/_lib/shares-api.js`, `functions/_lib/share-secret.js`, `migrations/0002_public_shares.sql`, `migrations/0004_public_share_expiry.sql`, `migrations/0005_share_secret_encryption.sql`: owner list/create/get/revoke/replace and anonymous capability-checked metadata/list/download/preview. One active share per user/mount/logical object; expiration is enforced server-side, revoked and expired records remain unusable.
- `src/services/shares.js`, `src/context/SharesProvider.jsx`, `src/hooks/useShares.js`, `src/components/files/ShareDialog.jsx`, `src/pages/SharedPage.jsx`, `src/pages/PublicSharePage.jsx`: independent sharing state and public UI. Session-owned in-memory links clear when workspace unmounts or auth owner changes. No browser persistent secret storage.
- Shared expiry timers must clamp delays to the browser timer limit and recheck long-lived links.
- User-approved link strategy: random 256-bit secret, SHA-256 verification hash and AES-GCM encrypted secret in D1; the separate server-only SHARE_ENCRYPTION_KEY enables authenticated owner recovery across sessions and devices. Never persist plaintext capabilities in browser storage. Legacy hash-only links require explicit Replace for recovery; Replace invalidates the old capability via compare-and-swap. Never expose token hashes or log public capability paths.
- Public ancestry uses authoritative stat parent IDs, cycle detection and maximum 64 hops, checked again before releasing listing/stream response. Missing, trashed, foreign, unsupported, revoked and provider errors fail closed with generic public 404. No path-prefix or breadcrumb authorization. Already delivered/in-flight bytes cannot be recalled.
- Public requests never write Recent/Favorites; owner Open in Files is explicit authenticated folder access. Share status stays outside the folder cache. Shared list pages hydrate at most 20 records, in batches of four; public listing caps at 100 direct children.
- Static `/s/*` headers disable referrers/caching. Public API has no-store/nosniff/no-referrer; previews reuse MIME, byte limits and sandbox policy. Keep deployment access/request logs configured to avoid recording capability URLs; no logging infrastructure was changed locally.
- Local lint/test (117/117)/build/diff checks passed. In-app browser QA used in-memory SQLite and mocked Storage at desktop and 390 × 844; production migration/deployment/provider QA remains unverified. See `docs/PHASE_9_6.md` for exact limits.

## Phase 9.7 — Metrics, upload reliability, bulk operations

- Nexora's authenticated `/usage` route still returns `status: unavailable` with null values; the repository's Phase 8/9.1 API audit contains no aggregate provider metric source. Keep Dashboard and Storage at “Not reported”; do not estimate from listings or filesystem capacity. Usage failures remain independent from mount/capabilities.
- Upload queue holds File objects in page memory, supports manual retry of failed entries, queued cancellation, and AbortController cancellation for active requests. Successful entries are removed five seconds after completion when auto-clear is enabled; otherwise they remain until cleared. Failed and cancelled entries remain until cleared. Legacy progress stays indeterminate; legacy active cancellation stops the client request but does not promise upstream rollback. Phase4.2 adds explicit multipart server cancellation, Pause/Resume and verified progress; see the current frontend transfer section below.
- Multi-selection supports Move and Move to Trash through existing single-object APIs, maximum two simultaneous requests, independent results, selection retention for failures, and targeted source/destination cache invalidation. Server authorization/capability/readOnly checks run per object. Copy/Share and bulk Trash lifecycle actions remain out of scope.
- See `docs/PHASE_9_7.md` for validation and remaining QA. Production metrics integration, browser QA, and deployment are not claimed.


## Phase 9.8 — Activity boundary

- `/activity` and authenticated `GET /api/activity` show successful user-owned mutations only; keep Activity separate from Recent access and never record anonymous public-link usage, reads, previews, downloads, or failed mutations.
- `functions/_lib/activity.js` is the centralized writer. Event persistence is best effort after the primary mutation; safe logging must not fail that mutation. Keep allowlisted metadata bounded and never store share secrets/capability URLs or provider credentials.
- Retain at most 500 events per user and 180 days. Use session-derived ownership and stable cursor ordering; do not accept browser `userId`. Bulk Move/Trash produce per-object events from existing routes, without batch duplicates.
- See `docs/PHASE_9_8.md` for implementation, checks, and pending browser/production QA. Migration/deployment requires separately approved production rollout.


## Phase 9.9 — Backup and production safety

- Backup/recovery is an infrastructure/operator responsibility. Never run production export, restore, migration, service stop, QNAP/Docker command, secret rotation, cutover, or delete without explicit user authorization and verified target. Restore tests start in disposable infrastructure; never import over existing production data by default.
- Treat Nexora D1, Storage API SQLite metadata, Garage metadata and Garage object blocks as separate authoritative components with cross-system dependencies. Use SQLite Online Backup API for live WAL databases; never raw-copy a live `.db` as the default. Garage metadata and data must be a coordinated recovery set.
- Consult `docs/BACKUP_RECOVERY.md` before proposing operational commands and `docs/PHASE_9_9.md` for known findings. Do not repeat or persist secret values.


## Nexora v1 release baseline

- Current source scope is documented in `docs/V1_RELEASE.md`; the working-tree package version is 1.0.1. Phase 10.0 passed by operator confirmation on 2026-10-28; Phase 10.1 source audit/local hardening is complete with production/operator gates still open. Do not add deferred features. Read `docs/PHASE_10_0_1.md`, `docs/PHASE_10_1.md`, and `docs/PHASE_10_1_1.md` for operator-confirmed versus tool-verified results and open security gates. Never reapply migrations 0001–0003 solely for verification; operator confirmed them applied on production D1 `nexora-db` on 2026-10-28.
- Account creation is administrator-provisioned; do not describe a public self-service registration route. Keep production implementation, user-reported smoke tests, and local validation distinct.
- Backup/recovery design exists in `docs/BACKUP_RECOVERY.md`; automated backup and an isolated restore drill are not implemented/completed. Never claim recovery proven without an actual isolated restore.
- Runtime SQLite artifacts in adjacent IssueDesk are no longer tracked; do not read or delete local DB/WAL/SHM files during Git hygiene checks. `garage/garage.toml` has since been removed from the adjacent IssueDesk index while preserving its local ignored copy; its example template uses a placeholder. Changes are staged/uncommitted and history was not rewritten; historical RPC secret material remains a follow-up. Do not print it or rotate production credentials without a separately authorized task.


## Phase 10.0.1 — Live verification boundary

- Production migration 0001–0003 status is operator-confirmed on 2026-10-28. Never apply or rerun these migrations solely as a verification step.
- Current live checks are blocked when Cloudflare auth or network/DNS is unavailable. Report the exact failure and minimum operator action; do not workaround by editing source.
- Inspect only names/presence for production secrets and bindings. Never read, display, or log their values.
- No production deploy, secret rotation, configuration change, or data mutation without separate authorization. Begin with read-only checks; full smoke paths that create/update/delete production data require explicit approval.

## Phase 10.1 — Security Finalization boundary

- Keep Nexora service credentials server-only; use same-origin mutation checks, Secure/HttpOnly/SameSite=Lax sessions, hashed session/share tokens, owner/mount/capability checks, safe public errors, and value-free logging.
- The app and API emit restrictive CSP and browser security headers. Preserve the theme bootstrap's external script location unless its CSP hash/policy is deliberately reviewed. Test header changes against PDF/blob previews and production-like browser routes.
- Login has D1 throttling; public-share reads and costly upload/download/storage routes still need platform rate controls. Do not modify Cloudflare rate rules, Access policies, host firewall, Garage, or Storage without separate authorization.
- Treat public share URLs as bearer capabilities. `no-referrer` helps prevent onward leakage; platform access logs still need explicit path redaction. Never log capability URLs or tokens.
- Refer to `docs/PHASE_10_1.md` and `docs/PHASE_10_1_1.md` for MUST/OPTIONAL and production/operator gates. Record the 2026-10-28 post-CSP all-functions smoke check as operator-confirmed, not tool-verified. Preserve nonce CSP and `public/_headers`; never restore script `unsafe-inline` or `unsafe-eval`. Never read or print secret values or rewrite Git history.


## File Browser clipboard (local implementation)

The authenticated workspace keeps an in-memory file clipboard for multi-selection Copy and Cut. Paste uses the existing copy or move APIs; copy remains available for repeated paste, while successful cuts are removed and failed items remain. The toolbar supports Copy, Cut, Paste and Rename; selection count and Clear selection appear beside the search and sorting note. Cut items appear faded, the list header labels the Favorites column with a non-interactive star, and clipboard and operation messages can be dismissed individually. Ctrl/Command+C, X and V operate on files outside editable fields; Escape clears the clipboard. Paste requires a ready destination and matching storage; cross-storage transfers are unavailable. Folder cuts reject known descendants and destinations whose ancestry is unavailable. Existing provider errors, including name conflicts and missing items, are reported. The clipboard is discarded on workspace unmount, logout, expiry, account change or reload, and is never persisted.

Local validation: `pnpm lint` and focused clipboard utility tests passed. The full test suite has failing public-share tests (share creation returned HTTP 400 instead of 201); clipboard keyboard, session lifecycle, UI and live-provider flows still need browser/integration QA. No build, deployment, migration or production data changes were performed for this feature.

Activity displays distinct icon colors for Move, Create, Copy, Upload, public-link Replace, and permanent deletion in light and dark themes; action text remains the accessible label.

Dashboard, Recent, Favorites, Trash, and Shared use amber folder icons and primary-colored file icons; unavailable shared items use a neutral icon.

The mobile Sidebar slides in from the left and slides out to the left; reduced-motion preferences disable its transition.

Trash offers Delete permanently all after loading a snapshot of all pages and explicit irreversible confirmation. Deletions use existing per-item APIs; results can be partial, and newly added items are outside the snapshot. Browser and live-provider QA remain pending.

Connected and public file previews use a medium-width dialog on larger screens and retain the mobile layout.

The File Browser list keeps extra space between the Size column and row actions on wider screens.
List rows have a minimum height of 52px and the header uses compact vertical spacing while retaining the Favorites button's 44px touch target.

File preview supports MP4, WebM and Ogg video up to 20 MiB through the existing on-demand preview route. Playback depends on browser codec support; video bytes are buffered before playback, and larger files remain downloadable. Public shares use the same preview policy.

File Browser row action and New menus highlight enabled items on hover or keyboard focus, with a distinct destructive highlight for Move to Trash.

File Browser selection controls use a visible border and primary-colored hover indication in list and grid views; the grid Select all button uses contrasting primary colors on hover.

## Settings Phase 1

Migration `0006_user_preferences.sql` and authenticated preference GET/PATCH, change-password and logout-other-sessions endpoints support Phase 1. Settings applies account theme, default storage, sort, normal-delete confirmation, upload concurrency/auto-clear and share expiry. Explicit accessible route storage takes precedence over default storage; inaccessible defaults fall back to the first active mount. Password change uses existing hashing and an atomic D1 batch to preserve current session and revoke others. Duplicate uploads report conflicts; rename/replace are disabled and rejected because safe provider semantics are not established. See `PROJECT_HANDOFF.md` for validation and pending browser/production QA. Production migration and deployment require explicit authorization.

Phase 1.5 membership groundwork (`0008_storage_access.sql`, `0009_storage_access_defaults.sql`, `functions/_lib/storage-permissions.js`, `functions/_lib/storage-access.js`) includes standalone validation, route mapping, assignment lookup and preliminary capability intersection but is not connected to runtime authorization, discovery or UI. Storage remains owner-scoped; do not grant or advertise membership access until every route, public-share lifecycle, cache and permission intersection has been implemented and tested. The user reported 0008 and 0009 applied; this has not been independently verified.

## Settings Phase 2 — partial maintenance controls

The workspace maintenance message appears at the top with a yellow background and centered text.

Migration `0007_system_settings.sql` backs maintenance, public-share policy and session lifetime/limit settings. Authenticated admins use `GET/PATCH /api/admin/settings`; `GET /api/config` exposes only explicitly selected public values and excludes session policy. New logins apply configured lifetime and atomically retain the new session while removing older excess sessions; existing sessions keep their expiry when settings change. Expiration rules apply to newly created/replaced links; existing links are not altered. Disabling creation preserves existing links; disabling downloads blocks the public download endpoint but preserves allowed previews. Maintenance blocks normal users' storage, Favorites and owner share mutations server-side; admins remain subject to normal mount authorization. Settings are read from D1 on relevant requests, with no cross-isolate cache. Bytes already delivered cannot be recalled. Migration 0007 must exist before deploying this source, including login. Other requested Phase 2 policies and Phase 3 remain incomplete; see `PROJECT_HANDOFF.md`.

Admin-configurable password minimum (8/10/12/14/16 UTF-8 bytes) and optional lowercase/uppercase/number requirement are enforced for application user creation and password changes. Existing out-of-band admin provisioning scripts retain their own 12-byte baseline and do not read configured D1 policy; do not claim the policy covers those scripts. The user reported migration 0007 ready; this was not independently verified.

The Header account control opens `/account`, where the signed-in user can view identity, update their display name and sign out other sessions while keeping the current session. Profile images are not implemented. Admins can manage ordinary users at `/admin/users` using server-protected `/api/admin/users` routes; admin accounts remain provisioned separately. Creation does not provision storage. Deletion is blocked while any mount belongs to the user; account metadata and sessions otherwise cascade on deletion. Never delete a user without addressing ownership of their storage mounts and dependent records.

Runtime storage v1 requests resolve assignments for every route. Favorites, Recent and public-share handlers have separate authorization paths. See docs/PHASE_STORAGE_ASSIGNMENT.md.

Admin-only `GET /api/admin/storages` returns bounded safe storage catalog summaries (500 maximum plus truncation flag), without provider mapping. Assignment UI and remaining authorization migration are not complete.

Core storage v1 operations now enforce session-scoped storage assignments, including object reads, transfers, mutations, Trash lifecycle and operation status. See docs/PHASE_STORAGE_ASSIGNMENT.md for the route matrix. Favorites, Recent, Public Share and UI integration remain separate.

Admin Users includes storage assignment management using the existing admin catalog and assignment APIs. The UI supports presets, custom permissions, default selection and revoke confirmation; browser QA is pending.

File Browser assignment permission gating is partial and requires further UI and alternative-path verification. Admin assignment UI implementation exists; browser QA is pending.

## Storage Management Phase 1 — partial

Storage shows the current account's assigned active storages, search, details and capability-discovery status. Admins can reach the existing user-centric assignment editor from this page. The admin catalog is separate from assigned storage and is not a comprehensive health check; usage and quota are unreported. Storage-centric assignment management remains unimplemented. See `PROJECT_HANDOFF.md` for the audit and validation boundary.

## Storage Management Phase 1.1

Assigned storage discovery isolates upstream capability errors with at most four concurrent checks; failed mounts remain visible with all effective permissions false and an unavailable status. The response adds optional `connectionStatus`; connected means a valid capability response, not full health. Malformed capability payloads fail closed with 502. The Storage page supports per-mount retry and shows assignment, user preference and effective defaults without changing selection precedence. Admins see the existing admin-only catalog (maximum 500, truncation indicated); provider type and assignment counts are not reported. Admin catalog status is configuration, not connection health. See `PROJECT_HANDOFF.md` for remaining validation and authorization boundaries.

## Storage Management Phase 1.1.1 verification

Discovery isolates provider capability failures including upstream 4xx, after rechecking the session user's assignment; failed mounts have all effective permissions false. User authentication/authorization is checked before discovery and remains distinct. Invalid upstream capabilities and provider failures are both exposed as unavailable rather than revealing upstream details; unknown means no recognized check result. Local browser verification and remaining gaps are recorded in `PROJECT_HANDOFF.md`.

## Storage Management Phase 1.1.2 UI verification

Vitest and Testing Library exercise Storage page retry, role visibility, search/filter, default display, and StorageProvider stale/abort behavior in jsdom. Full-stack local browser QA uses an isolated temporary D1 and mock provider; it does not establish real-provider health or production behavior. See `PROJECT_HANDOFF.md` for the exact checks and limits.

## Storage metadata management

Migration `0010_storage_description.sql` adds an optional Nexora-owned description to `storage_mounts`; existing `name` is display metadata with owner-scoped uniqueness, while `id` and provider mapping remain unchanged. Admin-only `PATCH /api/admin/storages/:id` accepts trimmed `name` (1–100 characters) and `description` (0–500 characters), validates server-side, and preserves storage IDs and assignments. Assigned storage discovery exposes the safe description. Admin catalog details allow editing; users see descriptions only for assigned storage. Source requires migration 0010 before deployment; remote application and deployment require explicit authorization. See `PROJECT_HANDOFF.md`.

## Usage reporting audit

Phase 1.2.2 remains partial: the existing usage endpoint reports unavailable. Shared Storage metadata could support a project-scoped logical file-byte aggregate after a separately reviewed contract, but it is not per-user or physical capacity; project aliases, Trash, missing sizes, consistency and disclosure need explicit handling. No quota or unlimited semantics were found in the inspected schemas. See `docs/PHASE_1_2_2_USAGE_AUDIT.md` before implementing reporting.

Phase 1.2.2A proposes exact decimal-string logical metadata aggregates and explicit reporting authorization, but implements neither. Assignment alone does not authorize disclosure of project totals. Preserve the unavailable legacy usage fields until a reviewed compatible migration; do not infer quota or physical usage.

Phase 1.2.2A.1 specifies a proposed canonical project reporting owner or explicitly granted admin, each also requiring an active assignment; mount ownership and admin role alone do not establish project authority. No registry, grant or aggregate is implemented. See the usage audit for fail-closed checks and alias handling before implementation.

Phase 1.2.2A.2 found no authenticated service-instance/app identity available to Nexora for binding a reporting registry to its configured client. Do not implement authorization based on project ID, URL or self-asserted namespace alone; trusted provisioning authority also remains unresolved. See the usage audit.

## Phase 1.2.2 — read-only Storage Overview

The Storage page counts the current account’s active assigned mounts and shows capability discovery as Connected, Unavailable or Unknown; these are mount counts, not distinct project counts or a full health check. Usage, active/Trash bytes, file count and measurement time remain unavailable: the existing assigned-mount usage endpoint is a null placeholder and assignment alone does not authorize project aggregates. Do not add project totals, a reporting registry, grants, quotas or enforcement in this phase. No aggregate is calculated, so aliases cannot double-count usage. Migration 0010 was reported applied by the user on 2026-11-04; this is not independently verified and must not be reapplied for this work. Historical 1.2.2A proposals are not current scope.

## Large File Transfer — backend source

`docs/LARGE_FILE_TRANSFER_BACKEND.md` records opt-in resumable multipart API implementation and limits; migration `0011_transfer_sessions.sql` is required before enabling server-only `STORAGE_RESUMABLE_UPLOADS_ENABLED=true`. Default remains off. Shared Storage source is in the separate IssueDesk repository and requires its additive migration0002/flag. Browser uses only Nexora logical transfer IDs; no provider references/credentials. New parts stream through Pages; Shared buffers at most8 MiB/part with4 global leases and1 operation/session. Fixed7-day TTL, durable digest/idempotency journals, lease fencing and startup/hourly cleanup exist; realGarage/10GiB/Node22 verification, retention pruning and production verification of frontend integration remain pending. Creator-only cancellation intentionally survives grant revocation/maintenance/readOnly/flag disable, but cannot abort completed or completing sessions; keep this exception narrow. Ordinary upload/status/finalization continue checking current session/assignment/provider upload permissions. Preserve existing small-file uploads and preview limits. Never enable, apply remote migrations or deploy without explicit authorization.

## Large File Transfer — isolated acceptance

`scripts/acceptance/run.mjs` is opt-in and defaults to BLOCKED report generation without network access. See `docs/LARGE_FILE_TRANSFER_ACCEPTANCE.md`. Real runs require explicit test config, dedicated test-only credential environment names and a confirmed empty `nexora-acceptance-*` bucket. Never reuse production resources/credentials. The runner creates private disposable SQLite databases and uses actual Nexora/Shared routes; only fixture factories enable multipart. Cleanup is journal-bound and refuses unknown resources. Preserve private journals outside Git and distinguish local harness/mock tests from real-provider results. Proxy/Tunnel and production limits require separate evidence; do not change deployment flags or infrastructure to pass a test.

## Large File Transfer — frontend queue and lifecycle

The capability normalizer retains validated public resumable-upload limits when explicitly advertised, and `src/services/multipart-upload.js` implements the isolated Phase4.1 session/part/reconciliation client. Phase4.2 connects it to the existing workspace Upload Queue for files exceeding the effective legacy limit, only with compatible advertised capabilities. Phase4.3 adds metadata-only IndexedDB recovery and original-file reselection; Phase4.4 adds same-origin Web Locks ownership and bounded automatic network recovery; Phase4.5 adds global Transfer Manager presentation. Use stable caller-retained create keys, verify all receipt pages/source digests, serialize per-session work and reconcile uncertain writes before retrying. See `docs/LARGE_FILE_TRANSFER_FRONTEND.md`; keep the existing small-file queue and default-disabled feature boundary until the remaining recovery, coordination, UI and verification work is complete.


Phase4.2 queue invariants: preserve legacy25MiB maximum/fallback and1/2/3/5 concurrency preferences; one sequential operation/session and bounded queue retries, no multipart-to-legacy fallback after failure. Pause/Cancel stop local scheduling and confirm server state; uncertain controls require explicit retry. Retry reuses the original create key/transfer ID. Progress uses verified receipts, capped at99% until completed. Auth initiation/owner/mount teardown abort requests and discard scope without server cancellation; use `AuthProvider.signingOut` to stop before logout returns. Preserve epoch guards against late responses. Transient discovery keeps the last confirmed upload mount; known permission changes stop writes but preserve creator cancellation. Keep File/controllers in refs, never React state or persistent browser storage. Phase4.3 persists only allowlisted owner-scoped session metadata/keys in IndexedDB; see the durable recovery boundary below. See frontend docs/handoff for tests, mocked browser evidence and unresolved real-provider gates.


## Large File Transfer — Phase4.3 durable recovery

- `src/services/upload-recovery.js` owns only native IndexedDB `nexora-upload-recovery` v1/`uploads`, `[userScope,id]` primary keys and owner-indexed reads. Store only validated primitive session/file metadata and explicit intent; never bytes, Blobs, auth tokens, provider IDs/ETags/paths or credentials. No persistent handles are used in this implementation.
- Durable scope is the authenticated public user ID retained by `src/services/auth.js`, never email; existing backend already supplies this ID. Phase4.4 requires a valid public ID for multipart ownership; missing identity blocks multipart, while small-file uploads remain unchanged. Restore the current mount after authentication, never across owner epochs; other assigned mounts restore when selected. Suppress duplicate queue IDs/transfer IDs/create keys.
- Commit key/body before first create, transfer ID before parts; serialize terminal deletes after older writes. Startup known sessions use status/all receipts only, never create. Unknown-create identity can replay the exact original key only after explicit Resume/Cancel. Pending cancel intents cannot resume. Always reselect original bytes, compare name/size/lastModified, then server geometry and verified-part SHA-256; mismatch never mutates the server. Selection alone never uploads.
- Retain at most50 valid v1 records per owner across mounts; durable completed history is0. Remove confirmed cancelled/expired/completed metadata; preserve unavailable/inaccessible sessions for explicit reconciliation. Never infer completion/expiration from last UI state. Quota/corruption/blocked APIs fall back to memory with a notice. Failed local deletion may reappear and must be reported. Do not delete future schema data or unknown databases/stores.
- Logout/owner change/unmount release local references/abort requests without server cancellation or deleting durable owner records. Clear local history forgets only inactive local metadata and never cancels server sessions. Preserve Phase4.2 small-file/concurrency/permission guards and backend default-off flag. Phase4.4 implements same-origin Web Locks coordination; Phase4.5 provides global Transfer Manager presentation; FileSystemFileHandle reuse and Range Download remain deferred; native/browser mocks do not establish real Garage acceptance.


## Large File Transfer — Phase4.4 ownership and network recovery

- `src/services/upload-coordination.js` is the cross-tab authority: native exclusive Web Locks keyed by public user ID and logical transfer ID, plus the stable create key before ID recovery. Probe contention then queue with AbortSignal; never use steal, timestamps or BroadcastChannel as locking authority. Unsupported/rejected Web Locks or missing public identity must block multipart with Waiting for ownership; preserve small-file uploads.
- Acquire ownership before session reads/mutations; new sessions obtain the transfer lock before any parts/controls. Retain locks until local operations and pending persistence settle. A closed/crashed context releases natively; frozen live contexts are not forcibly evicted. Takeover always reconciles server receipts/geometry/source digests before parts; missing File requires reselection and explicit Resume. Keep epoch/signal guards, server version CAS and lease fencing. Logout/account/unmount never cancel the remote session.
- Five named origin-wide Web Locks bound cooperating multipart workers across tabs/owners to5; each queue also respects1/2/3/5 preferences. Different browsers/devices/partitions/old bundles still require server safety boundaries. Do not claim cross-device frontend exclusion.
- Offline stops multipart scheduling/aborts local requests, retaining original identity and acknowledged counters. Online is only a connectivity hint and triggers jittered same-session reconciliation. Only previously active uploads auto-resume; explicit Pause/Cancel intent, missing File, expiration/auth/permission blocks cannot become upload intent. Recheck online after aborted worker settlement; duplicate online events never create duplicate workers.
- Share two automatic attempts across ordinary transient retry and online recovery; explicit Retry/Resume resets the budget. Honor Retry-After deadlines across client replacement, suppress immediate cooldown requests, and stop automatic replay for delays over5 minutes instead of shortening them. Preserve uncertain write/control/finalization reconciliation; no new sessions for known transfers. No bytes/credentials/new schema in IndexedDB.
- Keep Waiting for network/Recovering connection/Active in another tab/Waiting for ownership/Resume available/Retry connection minimal within the existing queue. See frontend guide and PROJECT_HANDOFF.md for executed local/native browser evidence and real-provider/platform limitations. Do not enable production flags, deploy or migrate as validation.


## Large File Transfer — Phase4.5 global UI

`Header` renders `TransferManager`, a presentation-only Base UI dialog consuming `RemoteFilesContext`. `FilesProvider`/`useRemoteFilesState` remains the single queue owner; never call `useUploadQueue` from the panel or route pages. File Browser no longer renders a second queue presentation. Closing the dialog and authenticated route changes do not reset work; auth/signingOut/owner/mount teardown retains existing guards and owner-scoped durable recovery. Bulk Pause/Resume dispatch existing supported per-item controls only; legacy uploads never show Pause or measured progress. Measured speed uses positive server acknowledgement deltas over at least1 second of uninterrupted uploading, excludes reconciliation, and resets outside uploading; ETA estimates remaining acknowledgement time, not finalization. Keep progress capped99 until backend-confirmed success. Future Downloads get a separate presentation section when a real engine exists; no functional-looking placeholder. See frontend guide/handoff for checks and provider limitations.


## Large File Transfer — Phase 5.1 backend downloads

Authenticated object/file download aliases accept GET/HEAD and a bounded single byte Range/If-Range contract. `functions/_lib/range-download.js` validates opaque validators, exact206/416 geometry, lengths, inactivity and cancellation. Shared v3 uses authoritative S3 HEAD + conditional GetObject; v2 remains legacy. Explicit `rangeRead` requires upstream support plus effective download permission, independently from multipart flags. Preserve no-store, logical IDs and server-only auth; do not forward browser credentials/arbitrary headers or expose provider references. Malformed/multi-range falls back full200; unsatisfiable single-range416. Resume requires a matching opaque strong ETag; dates/weak/stale validators fall back200. Consumers must discard previous bytes on200 and reject truncated/error streams. HEAD/416 do not write Recent. Public-share/preview do not forward Range and retain their security checks; public full downloads use checked streams/idle deadlines. See `docs/LARGE_FILE_TRANSFER_DOWNLOAD.md` for local tests and required real Garage/browser/platform acceptance. No Download Manager/persistence or production changes are included.


## Large File Transfer — Phase 5.2 active-page downloads

`src/services/download-queue.js` owns the React-independent, bounded streaming disk client; `useDownloadQueue` is instantiated only in useRemoteFilesState/FilesProvider, alongside the single existing upload queue. Header TransferManager is presentation-only with Uploads/Downloads sections and independent download1/2/3/5 concurrency (default2). Managed downloads require explicit rangeRead + download permission and runtime secure-context save-picker support. Invoke picker in the original click before awaiting; unsupported paths use native download without fake progress/resume. Preserve logical IDs/same-origin auth/no-store/redirect rejection.

Only fulfilled positioned writes advance private contiguous offsets. When durable recovery is unavailable, keep the live temporary writer through active-page pauses; check fresh HEAD size/opaque ETag and exact206 geometry/length/If-Range on resume. Wrong200/version/geometry/416 and uncertain disk writes must never append; abort the current temporary writer. Durable recovery preserves its last committed checkpoint and requires explicit revalidation; active-page-only mode resets for explicit restart. Exact EOF plus successful truncate/close is success; percent caps99 until close. Pause/Cancel wait in-flight writes; close is an irreversible local commit boundary with controls disabled. Cancel aborts temporary bytes, not closes them. See docs/LARGE_FILE_TRANSFER_DOWNLOAD.md for exact416-at-EOF, retry/idle, cooldown and disk failure policies.

Keep handles/writers/bytes/controllers/readers outside React snapshots. Phase5.3 permits only destination handles and allowlisted download metadata in the dedicated version1 IndexedDB store; never persist file bytes or credentials. Owner/auth/signingOut/mount/pagehide teardown aborts/discards uncommitted writers while retaining owner-scoped recovery records; stale replies cannot cross accounts. Route/dialog changes preserve queues; transient storage discovery keeps the last confirmed scope, while resolved mount change discards downloads. Native transfers cannot be controlled after browser handoff. Known permission/capability loss stops managed work and requires explicit resume after recovery. Do not rewrite upload protocol/recovery/flags, infer real Garage acceptance from mocks, or claim native OS Save As QA from substituted picker/OPFS tests.


## Large File Transfer — Phase 5.3 durable download recovery

- `src/services/download-recovery.js` owns the separate version1 `nexora-download-recovery` database, owner compound keys, strict metadata normalization and full-prefix streamed byte comparison. Unknown schemas fail closed; schema1 has only an initial store/index creation, no legacy download records to migrate. Retain at most50 known records per owner; do not touch upload IndexedDB.
- `download-queue.js` remains the sole download scheduler. Runtime recovery requires public user/current storage IDs, IndexedDB and Web Locks plus an actually cloneable destination handle. Store failure is visible; never claim persistence based only on picker support. Global `nexora-download-writer` Web Lock grants one workspace tab managed-destination ownership while preserving same-tab concurrency. Hold through cleanup; never clear another owning tab's recovery history. No network/permission request or automatic writing occurs merely because a saved row was restored.
- Durable mode commits a contiguous partial file at geometrically spaced thresholds starting at32MiB (next at twice the last checkpoint; rounded to the next received chunk) and explicit Pause. The initial picker authorizes that destination; checkpoint close/truncate only operates on this session's own temporary writer. Recovery uses keepExistingData:true, refuses destination-size/checkpoint disagreement, verifies fresh authenticated HEAD against original size/opaque strong ETag, then compares every committed byte against an exact206 prefix response with If-Range before opening a writer. Nonzero continuation requires exact206/Content-Range; matching416 at verified full EOF is permitted. No size-only completion or silent restart/truncation.
- Recover is an explicit user action and requests original-handle readwrite permission in click activation. Missing/denied/deleted/changed destinations remain recoverable errors with Use browser for a separately initiated new download. Logout/mount changes/restarts retain scoped metadata but never resume automatically. Cancel removes metadata and aborts uncommitted writes; already committed prefixes remain on disk. Storage failures during cancellation are visible and require retry; if browser storage is unavailable, cancellation persistence cannot be guaranteed.
- Integrity: full saved-prefix byte equality against the authenticated original representation plus exact length/validator/EOF on new bytes; no independent provider cryptographic full-file checksum or fsync guarantee. Verification rereads/retransfers the prefix, using64KiB local slices and stream backpressure, never a whole-file Blob buffer.
- Completion is limited to tested Chrome native OPFS handles with substituted picker/mocked authenticated APIs, including actual profile-preserving browser process restart and reload. OS-visible destinations/permission prompts, Safari/Firefox/physical mobile, real Garage/large-file/platform acceptance remain unverified. See download guide and PROJECT_HANDOFF for exact PASS/BLOCKED evidence.


## Large File Transfer — Final Phase 6

`docs/LARGE_FILE_TRANSFER_PRODUCTION_READINESS.md` is the current consolidated integration/readiness/runbook. Independently implementable source/local work is complete; real-provider acceptance BLOCKED, controlled rollout and production NOT READY. D1 migration0011 target schema was verified read-only on2026-11-08 (zero writes); Shared0002 remains operator-reported and unverified. Do not reapply either merely to verify. Required Pages secret names are registered; values, active flags and deployed protocol are unverified.

Upload queue retains at most50 tasks/File references including recovered and finished rows; overflowing selections are rejected atomically and explained through existing operation feedback. Clearing finished frees capacity, never silently cancels remote sessions. Unchanged broker status pages no longer rewrite identical D1 mapping/state. Server authorization and all existing transfer semantics remain. Downloads have their separate50-row bound.

Acceptance includes streamed checksums, interrupted download/original If-Range recovery, stale-tag full200 and concurrent downloads, plus explicit manual BLOCKED rows. Default report generation has no provider network I/O. No real-provider100MiB/1GiB/10GiB or resource measurement exists for Phase6. Use only authorized empty disposable buckets/test-only keys. No account-scoped multipart flag exists: use an isolated test deployment, never invent a canary bypass or enable production globally. Multipart flags do not disable Range/managed downloads; rollback must account for this independent capability. No safe journal pruning policy is established; monitor retention/admission/backlog and do not delete retry evidence ad hoc.
