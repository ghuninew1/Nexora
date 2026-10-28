# Phase 9.6 — Real Sharing & Public Links

Date: 2026-10-28. Implemented locally; production not deployed, migrated or verified.

## Repository audit

Reviewed AGENTS, README, handoff, Phase 9.5 and relevant 9.3–9.4.1 reports; existing migration, Pages router/auth/mount/client/storage handlers; StorageProvider/service, FilesProvider, remote file hook, Shared view, item/selection actions and routing. Search for share/shares/shared/public_share/public_shares/share_token found no suitable persistent sharing table or token-recovery infrastructure. Shared was the remaining fixture route, menus had no connected Share action, and normalizeCapabilities explicitly reported provider `share:false`.

Existing foundation supplied owner-scoped mounts, stable logical IDs, stat parentId, bounded direct-child cursor listing, download streaming, hashed random session-token primitives and safe inline preview. Read-only inspection of the separate IssueDesk Shared Storage File Manager confirmed active-object stat excludes Trash, parent relationships are logical, Trash marks the subtree, and Restore retains IDs. That source does not establish production behavior. No IssueDesk files were changed or copied.

Initial unrelated modifications to package.json, pnpm-lock.yaml and pnpm-workspace.yaml were preserved. Dependencies initially lacked executable links; pnpm attempted hydration and failed DNS. A frozen-lockfile install with network access then reused all 370 packages without changing versions. No new dependency was added.

## D1 model and token decision

`0002_public_shares.sql` adds id, user_id, storage_mount_id, object_id, token_hash, created_at, updated_at and revoked_at. Foreign keys cascade on owner/mount removal. A partial unique index permits one active owner/mount/object share; a second index supports owner-created ordering. No duplicated authoritative name/type/size or physical/provider paths. Existing Phase 9.5 schema is unchanged. Tests apply both migrations to isolated in-memory SQLite; no deployed D1 migration was run.

Follow-up migration `0004_public_share_expiry.sql` adds nullable `expires_at` (NULL means never) and an expiry index. Creation and explicit replacement accept only `1h`, `1d`, `1month` (30 days), or `never`; the API returns an ISO expiry timestamp or null. Public metadata, listing and streaming reject an expired capability with the same generic 404 as other unavailable links. Expired owner records remain manageable and can be replaced to issue a new secret. The migration is local source only; production migration/deployment is not authorized or claimed.

The initial audit documented that even `shareId + secret` cannot recover a hash-only secret for later Copy Link. The user explicitly selected option 1: keep the full URL in current authenticated in-memory state only, then offer explicit **Replace link** after refresh. No encryption/key-management layer or recoverable server secret was introduced.

- URL: `/s/:shareId/:secret`; id is an independent random UUID, secret is 32 Web Crypto random bytes encoded base64url (256-bit entropy).
- D1 stores SHA-256(secret) only. Verification queries by share id/hash/revoked state; no plaintext secret comparison or reconstructable token payload. IDs for owners, mounts, objects and provider projects are absent from the secret.
- Create returns publicPath once. Duplicate create returns the existing share with no secret and does not rotate it. Atomic partial-index conflict handling prevents duplicate active records.
- Replace is an explicitly confirmed owner action. A compare-and-swap against the current hash rejects concurrent replacements/revocation conflicts; the old URL immediately fails subsequent requests.
- Copy/Open use a session-memory map separate from storage listing cache. Refresh, workspace unmount or owner/session transition discards it. No localStorage/sessionStorage/IndexedDB token persistence. An owner who saved an old link may keep using it until revoke/replace; after memory loss this UI requires replacement to copy a new link.
- Shared keeps Copy Link and Open visible for links whose expiry has not passed while the capability is still available in session memory; expired or revoked links hide those actions.
- Owner list/get never returns token_hash. No capability values, request bodies or URLs are added to diagnostics/logging.

## Authenticated API

All routes require an active Nexora session; mutations preserve exact same-origin checks.

| Route | Behavior |
| --- | --- |
| GET /api/shares | Unrevoked owner records, including expired records, 20 per page, nextCursor by owner-scoped share ID; hydrate current safe object metadata in batches of four |
| GET /api/shares?storageId=&objectId= | Exact owner-scoped active record lookup for Share dialog; avoids scanning all shares |
| POST /api/shares | Body storageId/objectId/expiresIn; active owned writable mount, stat plus file download or folder list; server object metadata; create or reuse active record |
| GET /api/shares/:id | Owned record and current object hydration; unavailable object remains manageable |
| DELETE /api/shares/:id | Idempotent owner revocation, including unavailable/read-only mounts |
| POST /api/shares/:id/replace | Body expiresIn; active owned writable mount and object/capability checks, atomic secret/expiry rotation; 409 if revoked or concurrently changed |

Owner output is explicitly serialized share id, storageId/name, logical object id/metadata, createdAt, expiresAt and active/expired/unavailable/revoked state. Provider failures during owner hydration retain records as unavailable rather than deleting them. Owner 401 expires the session; 409 prompts refresh; provider/network failures use safe messages; AbortError remains cancellable.

Nexora sharing is metadata layered over authorized stat/list/download reads. It does not assert provider `share` support; Storage capability display keeps provider share false. Read-only mounts cannot create/replace; owners can still revoke links.

## Anonymous API and subtree boundary

The router dispatches public APIs before authenticated routes. Public pages do not mount AuthProvider, StorageProvider, FilesProvider or SharesProvider. Public service calls omit cookies and keep independent abortable state; no public listings enter remote-files-cache.

| Route | Behavior |
| --- | --- |
| GET /api/public/shares/:id/:secret | Safe root metadata and whether file download is available |
| GET .../objects?parentId=&cursor=&limit= | Folder-only direct children; default parent is shared root, limit 1–100 (default 50), bounded cursor |
| GET .../objects/:objectId/download | Authorize subtree/file and download capability, proxy streamed attachment bytes |
| GET .../objects/:objectId/preview | Same authorization, existing safe preview policy, no Recent writes |

Every request resolves the hash and unrevoked share, active owner, owner-scoped active mount and private provider project server-side, then checks capabilities and active root stat. Public metadata excludes parentId, storage/mount name/id, user identity and all project/provider internals.

For descendants, stat the target and walk authoritative logical parent IDs until reaching shared root. Reject null/unproved parents, malformed metadata, cycles, non-folder ancestors and paths longer than 64 hops. A file share permits only the exact file. Folder listing validates its parent against this boundary and checks each returned item's authoritative direct parent. No filenames, path-prefixes or client breadcrumbs authorize anything; provider project identity is never accepted from browser input.

Before releasing listing results or an upstream download/preview response, re-stat root and recheck target ancestry plus share hash/revocation. A revoked link or concurrent move observed during that interval cancels the response stream. Tests cover revocation/move during upstream fetch. Authorization is request-time: already delivered/in-flight bytes cannot be recalled. Shared Storage does not offer a transactional stat/list/download snapshot, so this is not a lock spanning arbitrary concurrent owner mutations; live concurrency behavior remains a production QA item.

Invalid tokens, missing/foreign/trashed/deleted objects, inactive owner/mount, revoked links, unsupported formats, invalid ancestry and provider failures return the same 404 SHARE_UNAVAILABLE and generic UI text: “This shared item is unavailable.” No public write, Favorite, Recent, Trash, user invitation or private-sharing route exists. Anonymous activity never updates Recent or Favorites; share owner API operations also do not write either. **Open in Files** is explicit authenticated owner access to a folder and uses the existing Recent contract.

## Rename, move, Trash and restore

Shares reference stable logical object IDs and stat fresh metadata on access, so rename/move preserve links. Root Trash causes stat failure; subtree access also requires active root. Permanent deletion fails stat; IDs are assumed not reused by the provider. Restore can make the same unrevoked link available again under current stable-ID semantics; no new share is created. Moving a child outside the shared subtree removes public access on subsequent authorization checks. Existing Trash/listing caches are untouched by share mutations.

## Preview, downloads and HTTP review

Extracted the existing preview response helper in storage-api so public/owner routes share server MIME allowlists and stream size enforcement; owner routes retain their existing Recent recording. Supported image/PDF/text formats remain unchanged; HTML, SVG, Office and unknown active content are rejected. Text limit 1 MiB; image/PDF 20 MiB, with declared size and streamed byte bounds. Client validates MIME/category and Blob limit before rendering. Text renders as escaped text, image uses object URL, PDF uses sandboxed iframe. Requests abort and object URLs revoke on close, navigation, capability changes or unmount. No preview bytes load from listing/metadata/render alone.

Downloads preserve streaming and sanitize response headers, force attachment with encoded authoritative filename, nosniff, no-store and restrictive sandbox CSP. Preview uses inline disposition, existing sandbox CSP and no-store. Public responses use no-referrer; static `/s/*` headers add no-referrer/no-store/nosniff, and public layout installs a matching referrer meta tag for local development. No upstream URL/headers/body/internal error passes through public JSON. Error codes/messages are normalized. No existing auth/origin protection was relaxed.

Infrastructure request/access logs may record request paths independently of application code. Operators must ensure capability URLs are redacted or excluded in their existing edge/access logging policy before production exposure; no logging infrastructure/configuration was changed here.

## Frontend and design

- Focused shares service normalizes owner/public responses, URLs and errors. SharesProvider owns abortable owner listing/mutations and memory-only links; it remounts under auth-owner scope.
- File Browser row and one-item selection toolbar offer capability-gated Share. No bulk share. Dedicated shared Dialog/Button controls handle loading, unshared/create, shared, copy status, errors, replacing and revoking, with explicit confirmations.
- `/shared` uses D1 records only, bounded current-metadata hydration, refresh, pagination, loading/error/empty/no-active-storage states, storage/type/created/expiry/public-access display, Copy/Open when secret is in memory, Manage/Replace/Revoke and Open in Files. Manage lets owners choose 1 hour, 1 day, 1 month (30 days), or never when creating/replacing; no recursive scan/file bytes. Other mounts' navigation stays disabled until active, matching the existing mount selection boundary.
- Open in Files carries validated abbreviated route state, preserving navigation guards without inventing ancestors. Browser QA found and fixed the initial missing-state fallback; a regression test covers file-parent and folder targets.
- Public minimal layout uses existing Nexora logo/glass/Button/Dialog, safe name wrapping, 44px public primary controls and shared-root-only breadcrumbs. It has no sidebar, workspace links or identity. Folder listing paginates/merges by logical ID; nested navigation stays independent of workspace state.
- Existing shared UI wrappers were reused. shadcn Button/Dialog docs were checked; a Base UI warning from an anchor rendered as a Button was fixed using nativeButton=false. No UI dependency or unrelated redesign was added.

## Validation

- `pnpm lint`: passed with no warnings after final code edits.
- `pnpm test`: 117/117 passed, no skips (99 pre-existing tests plus 18 new tests).
- `pnpm build`: passed with the normal config loader; no fallback/dependency version change needed after frozen-lockfile hydration.
- `git diff --check`: passed.
- Tests cover session/origin/mount ownership, missing/capability/read-only rejection, hash-only storage, duplicate behavior, owner isolation, safe serialization, bounded owner paging/exact lookup, public file metadata/download/preview, root/nested folder listing, parent/sibling/foreign rejection, malformed ancestry/cycle, invalid tokens, replace/revoke, Trash/restore/delete semantics, inactive owner/mount, provider failure, zero anonymous Recent/Favorites, revalidation during fetch, client contracts/error/abort handling, preview policy and Open in Files route state. Structural route regression tests complement browser checks; they do not simulate DOM interaction.

## Browser QA (local mocks only)

Browser plugin/standalone Playwright was unavailable (`pnpm exec playwright --version`: command not found); no browser package was installed. Used available in-app browser via computer-use tools against a temporary localhost Vite harness with actual Nexora handlers, in-memory SQLite/D1 adapter and mocked Storage. The fixture session/objects/bytes are test-only; this is not deployed auth/D1/Storage evidence. No test harness or screenshot was added to repository source.

Verified: file Share/Create/Copy, public file metadata, text Preview, successful Download of fixture bytes, Replace with old-link unavailable/new-link usable, Revoke with public unavailable, Shared records, post-refresh missing-secret/Replace state, malformed public route without login redirect, folder Share via single-selection toolbar, Open in Files target, nested public folder navigation and preview, Escape close/focus return, long filename wrapping. Final fresh owner browser tab showed no console errors/warnings; earlier warning and a transient editing syntax error were fixed. No blank page or framework overlay remained.

Public nested folder checked at 1280 × 900 and 390 × 844. DOM viewport width equaled document scroll width (1280 and 390 respectively); mobile primary controls measured 44px height. Screenshots saved outside repository at `/tmp/nexora-96-public-desktop.png` and `/tmp/nexora-96-public-mobile.png`. Shared cards and Revoke confirmation were also checked at 390 × 844 without horizontal overflow. Viewport overrides were reset after QA.

Remaining browser/provider QA: large streamed binaries, real image/PDF previews, reduced-motion emulation, all network/loading/session-expiry failure states, multi-tab rotation conflicts, multi-page public cursor interaction, production auth and concurrent provider operations. Server/client tests cover several of these contracts but do not replace rendered/live verification.

## Production boundary and operator checklist

No commit/push/deploy, remote migration, secret/configuration or production D1/Storage change was made. This phase requires separately approved migration/deployment and smoke tests. Before release:

Expiry follow-up local verification: `pnpm lint`, `pnpm build`, and `git diff --check` passed. Tests and browser QA were not run for this follow-up; migration 0004 and server behavior remain unverified against production.

1. Review/apply `0002_public_shares.sql` and additive `0004_public_share_expiry.sql` to the intended Nexora D1; deploy the reviewed app/Functions together using approved operator workflow. `0004` is new local source and has not been applied to production.
2. Verify edge/access logging excludes/redacts capability URLs and public page referrer/cache headers are applied.
3. Share disposable real file/folder; test anonymous stat/list/nested Preview/Download, pagination, long names and mobile layout. Confirm no provider/internal information appears in browser network responses.
4. Attempt parent/sibling/foreign logical IDs, malformed cursor, revoked/replaced capability and inactive/read-only mount cases. Verify generic public rejection and correct owner errors.
5. Rename/move root, move child out, Trash/restore root and permanently delete a disposable object through approved operator testing. Verify logical identity and public lifecycle; test concurrent changes/requests.
6. Verify reload/logout/user switching loses in-memory links, old URLs remain usable only until explicit revoke/replace, and anonymous activity does not alter owner Recent/Favorites.

Non-goals remain public upload/edit/write/delete, private account sharing, passwords/expiry, analytics/counters, invitations/QR, WebDAV/SMB, ZIP download, provider redesign and resumable uploads.
