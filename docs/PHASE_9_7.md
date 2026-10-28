# Phase 9.7 — Storage Metrics, Upload Reliability & Bulk Operations

Updated: 2026-10-28

## Repository audit and metrics source

The authenticated Nexora `GET /api/storage/v1/storages/:storageId/usage` route in `functions/_lib/storage-api.js` returns `status: "unavailable"` and null metric fields. The current `storage-client.js` exposes capabilities and object operations, but no aggregate usage call. The Phase 9.1/API proposal documents usage as optional and unavailable until the provider can report it. There is no authoritative aggregate source in this Nexora checkout to expose for this phase. IssueDesk/Shared Storage was not modified, and no recursive folder listing, object scan, or filesystem capacity estimate was added.

StorageProvider continues to load usage independently from capabilities: usage request failure leaves an otherwise healthy mount connected. Dashboard and Storage consume the same normalized usage state and continue to show “Not reported” when values are absent. Their existing manual refresh reuses StorageProvider refresh. No polling or metrics migration was added.

Reported fields remain the existing optional API model (`usedBytes`, `quotaBytes`, `objectCount`, `measuredAt`). No fields are fabricated. Capacity/available bytes, file/folder counts, and Trash bytes remain unavailable because no authoritative response provides them.

## Upload reliability

- Queue entries retain the selected `File` only in page memory with their original storage and parent IDs.
- Retry is manual and accepts only a failed entry. An entry is changed back to queued before scheduling, preventing duplicate retries while queued or uploading.
- Queued cancellation removes the entry from pending work. Active uploads use the existing `AbortController` passed to the same-origin upload request.
- Cancellation is represented separately from failure. Since upstream acceptance/rollback is not atomic, active cancellation means the client request was aborted; it does not guarantee the provider discarded bytes already accepted.
- Existing concurrency remains two uploads. Progress remains indeterminate; no byte percentage is invented. Successful uploads continue to use returned metadata and targeted parent invalidation/refresh. Failed and cancelled uploads do not insert a file into the listing.

## Bulk operations

- The existing multi-selection state now exposes Move and Move to Trash. Single-selection actions, including Copy and Share, remain unchanged.
- Bulk Move reuses the existing destination folder picker and single-object move endpoint. The client rejects a destination that is a selected folder, the selected folder's descendant, or its current location.
- Bulk Trash uses one confirmation dialog and says folder contents move with the folder.
- Both operations run at most two per-object requests at a time. Each request still uses the existing server route and independently passes session, mount ownership, capability, read-only, and logical object checks. The batch is not atomic; successful objects are retained as successes if another object fails.
- The UI reports progress and final counts. Successful IDs leave selection; failed objects remain selected/actionable, with safe per-item error messages. Duplicate bulk execution and selection clearing are disabled while the action is active.
- Successful operations invalidate only affected source folders and (for Move) the chosen destination. Trashed folder subtree metadata/listings are removed using the existing cache policy. The current affected listing refreshes; unrelated cache entries are preserved.
- Bulk Copy, Share, Download, Restore, and Permanent Delete were not added.

## Files and verification

Changed implementation: `src/hooks/useUploadQueue.js`, `src/hooks/useRemoteFilesState.js`, `src/hooks/useFiles.js`, `src/utils/run-bounded.js`, `src/components/files/FileToolbar.jsx`, `src/components/files/FileBrowser.jsx`, `src/components/files/FolderDestinationDialog.jsx`, and the Storage page's status description. Added a bounded-runner test in `tests/frontend-storage.test.js`.

- `pnpm lint`: passed.
- `pnpm test`: passed, 118/118.
- Build: `pnpm exec vite build --configLoader runner --outDir /tmp/nexora-phase-97-build` passed (2,329 modules transformed). Build output stayed outside the repository.
- `git diff --check`: passed before documentation updates; rerun after final edits.
- Browser QA: not run. No in-app mock session/API harness was started for this pass.
- Production migrations, storage data, secrets, deployment, and live metrics/provider behavior: not touched or verified.

## Remaining limits

Authoritative metrics require a provider-backed aggregate contract and corresponding Nexora server mapping; until then usage remains unavailable. Active upload cancellation is best-effort at the request boundary. Bulk operation UI interactions and responsive rendering still need browser QA, and all production behavior remains pending a separately approved release/verification.
