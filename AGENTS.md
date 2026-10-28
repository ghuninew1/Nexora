# AGENTS.md — Nexora

## Scope and current architecture

These instructions apply to the whole Nexora repository. Treat source and configuration as authoritative; docs and sample data do not prove remote credentials, deployed bindings, storage availability, or production behavior.

- React 19, Vite 8, Tailwind CSS v4, React Router 7, pnpm.
- `src/App.jsx` defines routes; `src/layouts/AppLayout.jsx` keeps a shared `AppShell` around the route outlet.
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

- `src/App.jsx`, `src/layouts/`: routing and persistent shared shell.
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
- `src/hooks/useUploadQueue.js`: real File Browser upload queue with bounded concurrency, cancellation, retry, and status-only progress reporting.
- `src/components/files/StorageFilePreviewDialog.jsx`, `src/utils/storage-preview.js`, `src/utils/preview-request.js`: safe on-demand connected-file previews, MIME allowlist, text-size limits, and request cancellation/race control.
- `src/components/files/FolderDestinationDialog.jsx`: lazy folder-only destination picker for move/copy.
- `src/data/files.js`: fixture entries.
- `src/components/ui/`, `src/utils/cx.js`, `src/utils/glass.js`, `src/index.css`: shared controls, classes, glass interactions, and tokens.
- `README.md` and `docs/DESIGN_SYSTEM.md`: current user-facing project status and design usage.
- `docs/STORAGE_API_AUDIT.md`: source-derived IssueDesk and Shared Storage API endpoint/auth/streaming audit.
- `docs/STORAGE_ARCHITECTURE.md`: current/target provider architecture and Phase 8 implementation boundary.
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
- `docs/PHASE_10_0.md`, `docs/PHASE_10_0_1.md`, `docs/PHASE_10_1.md`, `docs/PHASE_10_1_1.md`: operator-confirmed production-readiness result, DNS/network verification limitation, CSP fix, and production security gates. Phase 10.1.1 records the 2026-10-28 post-CSP all-functions smoke check as operator-confirmed, not tool-verified; it is a read-only audit, and unresolved infrastructure gates require operator action. Local source evidence does not prove Cloudflare deployment, remote bindings, Access policy, or secret configuration.
- `.agents/skills/nexora-project/SKILL.md`: project-scoped Codex workflow, supplementing the detailed repository rules here.

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
10. Production readiness reports must distinguish source-derived configuration from live platform state. Never print or read secret values for inventory; do not deploy, migrate, rotate, or modify production resources without explicit authorization.

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
- Storage diagnostics may log only binding presence, request stage, HTTP status, allowlisted error type/result, and redirect origin classification; never log storage/project IDs, upstream/redirect URL, provider references, headers/values, or response bodies.

## File Browser behavior

- Fixture IDs and object URLs are not stable server file IDs. File Browser uses only public logical object IDs returned by Nexora APIs; never accept a provider project ID or physical reference from the browser.
- Dashboard uses public StorageProvider state and the shared authenticated Recent/Favorites data sources. Recent entries are created only by explicit object access; passive listing, render, cache revalidation, and Dashboard/Recent/Favorites reads do not write Recent. Shared uses its own owner-scoped D1 public-share records. Connected Trash has separate mount-scoped remote state; do not make demo mutations appear to update the connected mount.
- Recent folder actions must navigate to the `/files` pathname with the logical `folder` query and validated breadcrumb state; changing search parameters alone leaves the user on `/recent`.
- Recent and Dashboard Recent panels must mount the shared preview dialog when exposing Preview; hide Preview for unsupported MIME types and objects larger than their preview limit.
- Favorites folder rows use the same validated File Browser navigation; file rows can open their containing folder when the hydrated parent ID is available.
- The connected File Browser upload queue sends bytes through the Nexora API with at most two concurrent uploads; do not invent byte progress. Download remains streamed through the same-origin API. Rename/move retain IDs and copy creates new IDs. Preview is on-demand through the authenticated inline route. Normal Delete means Move to Trash; restore and permanent delete use separate Trash-only actions.
- Folder navigation uses the `folder` query parameter on `/files`; validate logical IDs and breadcrumb history state, and safely return to root for unverified or deleted folders.
- Keep folder navigation and breadcrumbs consistent. Use backend cursors and merge pages by logical object ID; root requests omit `parentId`. Search/sort apply only to loaded items and use normalized fields (name, `modifiedAt`, `sizeBytes`), never display strings such as `"2.4 MB"` as numeric sizes.
- Preserve selection across supported view changes; clear or reconcile it on storage/folder changes and filtering where appropriate.
- Revoke object URLs and release upload references when previews or local queue items are removed.
- Trash listing and lifecycle operations are mount-scoped and capability-gated. Server mutations also check mount ownership, capability, and read-only policy. Permanent Delete is available only from Trash and requires an explicit irreversible confirmation.
- Shared lists persistent owner public links. Sharing permits view/download only; no account-to-account sharing or public writes. Public routes must remain outside AuthProvider, StorageProvider and FilesProvider.
- Storage status comes from the authenticated Nexora storage API; usage/capacity must say unavailable or not reported unless authoritative metrics are returned. Never present fixture totals as live provider usage.
- File Browser listing cache is session-scoped in memory, keyed by storage plus logical parent (with an explicit root identity), bounded to 60 folders, and stale after 20 seconds. Keep request dedupe cursor-specific, clear on auth/storage scope changes, and selectively invalidate affected parents after mutations. Never cache bytes or provider internals.
- Trash uses a separate cursor-paginated in-memory collection, deduplicated by logical object ID. Move to Trash invalidates its source folder and removes cached subtree metadata/listings; restore removes the Trash row and invalidates only the response's authoritative parent; permanent delete removes the Trash row and safe subtree metadata. Do not clear unrelated folder listings.
- Connected File Browser preview is an app-level feature backed by the authenticated `download` capability; it does not assert provider `preview` support. Only allowlisted image/PDF/text content may preview, text is capped at 1 MiB, and preview bytes are fetched only after the user selects Preview. Listing cache remains metadata-only. Demo entries still have no source bytes.

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

## Phase 9.6 — Sharing boundary and validation

- `functions/_lib/shares-api.js`, `migrations/0002_public_shares.sql`, `migrations/0004_public_share_expiry.sql`: owner list/create/get/revoke/replace and anonymous capability-checked metadata/list/download/preview. One active share per user/mount/logical object; expiration is enforced server-side, revoked and expired records remain unusable.
- `src/services/shares.js`, `src/context/SharesProvider.jsx`, `src/hooks/useShares.js`, `src/components/files/ShareDialog.jsx`, `src/pages/SharedPage.jsx`, `src/pages/PublicSharePage.jsx`: independent sharing state and public UI. Session-owned in-memory links clear when workspace unmounts or auth owner changes. No browser persistent secret storage.
- User-approved link strategy: random 256-bit secret, SHA-256 only in D1, creation/replacement returns relative public path once. Keep Copy/Open visible for unexpired links while the secret is in session memory; refresh loses recoverable link and explicit Replace invalidates old capability via compare-and-swap. Never expose token hashes or log public capability paths.
- Public ancestry uses authoritative stat parent IDs, cycle detection and maximum 64 hops, checked again before releasing listing/stream response. Missing, trashed, foreign, unsupported, revoked and provider errors fail closed with generic public 404. No path-prefix or breadcrumb authorization. Already delivered/in-flight bytes cannot be recalled.
- Public requests never write Recent/Favorites; owner Open in Files is explicit authenticated folder access. Share status stays outside the folder cache. Shared list pages hydrate at most 20 records, in batches of four; public listing caps at 100 direct children.
- Static `/s/*` headers disable referrers/caching. Public API has no-store/nosniff/no-referrer; previews reuse MIME, byte limits and sandbox policy. Keep deployment access/request logs configured to avoid recording capability URLs; no logging infrastructure was changed locally.
- Local lint/test (117/117)/build/diff checks passed. In-app browser QA used in-memory SQLite and mocked Storage at desktop and 390 × 844; production migration/deployment/provider QA remains unverified. See `docs/PHASE_9_6.md` for exact limits.

## Phase 9.7 — Metrics, upload reliability, bulk operations

- Nexora's authenticated `/usage` route still returns `status: unavailable` with null values; the repository's Phase 8/9.1 API audit contains no aggregate provider metric source. Keep Dashboard and Storage at “Not reported”; do not estimate from listings or filesystem capacity. Usage failures remain independent from mount/capabilities.
- Upload queue holds File objects in page memory, supports manual retry of failed entries, queued cancellation, and AbortController cancellation for active requests. Progress stays indeterminate. Active cancellation stops the client request but does not promise upstream rollback.
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

- Current source scope is documented in `docs/V1_RELEASE.md`; package version is already 1.0.0. Phase 10.0 passed by operator confirmation on 2026-10-28; Phase 10.1 source audit/local hardening is complete with production/operator gates still open. Do not add deferred features. Read `docs/PHASE_10_0_1.md`, `docs/PHASE_10_1.md`, and `docs/PHASE_10_1_1.md` for operator-confirmed versus tool-verified results and open security gates. Never reapply migrations 0001–0003 solely for verification; operator confirmed them applied on production D1 `nexora-db` on 2026-10-28.
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
