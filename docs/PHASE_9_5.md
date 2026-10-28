# Phase 9.5 — Real Dashboard and Recent Activity

## Scope and existing schema

Phase 8 already created `recent_access` with columns `(user_id, storage_mount_id, object_id, accessed_at)`, primary key `(user_id, storage_mount_id, object_id)`, and index `recent_access_user_time(user_id, accessed_at DESC)`. Existing cleanup keeps at most 100 records per user and removes records older than 90 days. Phase 9.5 reuses this table and the existing `/api/recent` route; no migration or second Recent store was added.

## Recent contract and behavior

- `GET /api/recent?limit=N` returns at most 100 rows, newest `accessedAt` first. Omitting the limit keeps the existing bounded 100-row result. Dashboard requests only six entries; Recent requests the full bounded list.
- Each result joins the authenticated user's active mount and hydrates the current object using the server-owned Shared Storage project mapping. The response contains normalized logical object fields, `storageId`, public `storageName`, and authoritative D1 `accessedAt`. Project IDs, provider references, buckets, keys, URLs, and credentials are never serialized.
- Existing explicit object stat, successful Download, and successful on-demand Preview record access. Opening a folder now POSTs `/api/recent/:storageId/:objectId`; the server requires the current session, an owner-scoped active mount, the existing `stat` capability, and a successful object lookup before recording. The browser never supplies a user ID or project ID.
- Upsert identity stays `(user, mount, object)`. A repeated access within two seconds coalesces to the existing timestamp; later access updates the row and moves it to the top. This avoids duplicate rows and rapid duplicate D1 writes.
- Listing, rendering, Recent/Dashboard/Favorites reads, cache revalidation, search, destination selection, rename, move, Trash, and restore do not create Recent records. Copy is not recorded until the new object is explicitly opened, previewed, or downloaded.
- Recent hydration is bounded to batches of eight exact object lookups, not a recursive tree scan. Confirmed upstream `NOT_FOUND` removes the stale reference; temporary/provider failures keep the row and return an error. A trashed or permanently deleted object disappears on the next Recent refresh when its normal lookup confirms it is missing. Restore does not create Recent activity by itself.
- Recent writes for stat/download/preview are best-effort metadata: failure to write Recent does not fail a valid stat, Download stream, or Preview stream. Folder navigation proceeds even if its Recent POST fails.

## Recent and Dashboard UI

- `/recent` now uses the authenticated Recent client and has loading, ready, empty, error/retry, refresh, session-expiry, and no-active-storage states. There is no fixture fallback.
- Rows show safe name, type, size when reported, storage name, and an accessible relative timestamp backed by the D1 ISO timestamp. File actions reuse existing Preview, Download, Favorite, and File Browser navigation paths. Folder rows navigate to `/files?folder=<objectId>`; known breadcrumb cache is preserved, otherwise the path is explicitly abbreviated with an ellipsis rather than inventing parent names. A file can open its containing folder when `parentId` is available.
- Operations needing an active mount are available only for the active mount. Favorite/Unfavorite still uses the existing owner-scoped Favorites flow for any returned mount.
- Dashboard now reads the public active mount and optional usage from `StorageProvider`; usage displays only authoritative reported bytes or “Not reported.” It has no fixture totals, recursive scans, capacity estimates, or historical charts.
- Dashboard requests six Recent rows and shows the same Recent items/actions as `/recent`. Storage/usage and Recent have separate failure states. Quick links go to My Files, Recent, Favorites, and Trash. The optional Favorites widget is omitted; its shortcut remains.
- StorageProvider already starts capability and usage requests concurrently. The Dashboard starts Recent independently and does not wait for optional usage to render. There is no polling. Recent remains outside the folder listing cache, and preview bytes remain on-demand.

## Trash and access tracking

Recent is an access list, not a Trash or audit log. Trash mutations do not write Recent. When a later hydration confirms an object no longer exists in active storage, the Recent row is deleted; temporary failures never delete it. Restore only makes the object eligible for Recent again after a new explicit access.

## Validation and limits

- Recent preview follow-up: Recent and Dashboard Recent panels now mount the shared on-demand preview dialog. Preview is hidden when the active download capability is unavailable, the MIME type is unsupported, or a known file size exceeds the type-specific preview limit. Local lint/build verification is pending; browser and production preview behavior is unverified.

- Follow-up bug fix: Recent folder actions now navigate to the `/files` route with the logical folder query and validated breadcrumb state. Opening a file's containing folder from Recent uses the same route navigation. Local lint/build verification is pending for this follow-up; production behavior is unverified.

- Backend tests cover authenticated and unauthenticated explicit access, mount ownership, upsert/deduplication, repeated access, order/limit, metadata refresh after rename/move, no writes during GET hydration, stale cleanup, temporary provider failure, safe serialization, and Download success when D1 Recent tracking fails.
- Frontend service tests cover bounded Recent query and same-origin logical-ID access requests; route-state tests cover abbreviated Recent folder navigation.
- `pnpm lint` passed with no warnings; `pnpm test` passed 99/99; `git diff --check` passed. `pnpm exec vite build --configLoader runner --outDir /tmp/nexora-phase-95-build` passed after transforming 2,318 modules. Build output was kept outside the repository.
- Browser rendering/mobile/network QA and production verification were not performed in this implementation pass. Browser plugin is unavailable and `pnpm exec playwright --version` reports Playwright is not installed; dependency installation was not part of this phase. The user-provided phase brief reports Phases 9.2–9.4.1 production verified; that report is context, not a Phase 9.5 production result.
- StorageProvider exposes one active mount to the File Browser. Recent may include owner-owned entries from other active mounts; Preview/Download/navigation actions for those entries remain disabled until that mount is active. Favorites remains available through its existing mount-scoped API.

## Production QA checklist

After an approved deployment, verify: opening two folders, Preview, and Download move one Recent row per logical object to the top; repeated access updates rather than duplicates; rename/move show current metadata under the same object ID; Trash removes an object from active Recent only after confirmed absence; Restore does not add it until accessed; opening Dashboard makes no tree listing or preview-binary requests and fetches at most six recent entries; Recent reads at most 100; unavailable usage does not block either page; logout/session changes clear prior user state; and the 390 × 844 Dashboard/Recent layouts have no horizontal overflow.

Sharing and Public Sharing were not implemented or started.
