# Phase 9.4 — Trash, Restore, Permanent Delete

อัปเดต: 2026-10-28

## Scope and architecture

Phase 9.4 connects File Browser deletion and the Trash page to the existing Nexora same-origin Storage API. The browser sends only the active Nexora `storageId` and logical `objectId`; Pages Functions resolve the session-owned mount and its private Shared Storage project. No new endpoint, database contract, or Trash provider was added.

Routes used:

- `DELETE /api/storage/v1/storages/:storageId/objects/:objectId` moves an active file or folder into Trash.
- `GET /api/storage/v1/storages/:storageId/trash?limit=&cursor=` lists safe public metadata in backend order.
- `POST /api/storage/v1/storages/:storageId/trash/:objectId/restore` restores an item.
- `DELETE /api/storage/v1/storages/:storageId/trash/:objectId/permanent` permanently deletes an item.

The backend's existing `GET .../operations/:operationId` remains available, but the S2 Trash, restore, and permanent-delete contracts confirm completion synchronously. This phase does not add polling.

## Capabilities and authorization

The File Browser action requires `trash`; Trash rows independently gate Restore on `restore` and Permanent Delete on `permanentDelete`. Writable mounts also require the capability response not to be read-only. A read-only mount may list Trash but cannot mutate it. The server independently checks session, mount ownership, writable state, and the operation-specific Shared Storage capability before each mutation; UI state is not an authorization boundary.

Trash is available when the mount is read-only (for browsing) or reports support for at least one Trash lifecycle mutation. If none apply, the page shows an unsupported state. No-storage, loading, empty, unavailable/error, and session-expiry flows use the existing StorageProvider/AuthProvider lifecycle; 401 expires the session and clears remote state.

## Data and operation semantics

- Normal File Browser action is named **Move to Trash** for files and folders and opens an explicit confirmation dialog. It calls the object `DELETE` route; it never calls Permanent Delete.
- The Trash page reads the active mount only. It renders normalized logical IDs, name, type, size, MIME metadata if present, and `deletedAt` if returned. It does not sort or fabricate unavailable metadata.
- Shared Storage S2 moves a folder and its active subtree to Trash while retaining logical IDs and original parent relationships. Already-trashed descendants are folded into the parent Trash entry.
- Restore sends no reconstructed object or destination; S2 restores to the saved parent when it remains active. The authoritative returned object supplies `parentId` for cache invalidation. A conflicting active name is rejected with `NAME_CONFLICT`; the row remains visible and the user sees a safe restore-location message. There is no overwrite or silent rename.
- Permanent Delete is available only in Trash. The dialog includes the item name and says the action cannot be undone. For folders it says the trashed contents are also deleted, matching S2 subtree behavior. The row is removed only after the server confirms `{ deleted: true }`.
- S2 permanent deletion removes provider bytes before metadata and can leave a partial operation when a provider or finalization step fails. Nexora preserves the row on an API error and does not claim it was deleted.

## Pagination, races, and cache behavior

Trash uses a dedicated in-memory state, separate from the Phase 9.3.1 folder listing cache. It requests 50 items per page, preserves server ordering, uses the returned cursor, and merges by logical `objectId`. Refresh is authoritative. Requests are aborted and generation-guarded on route departure, storage change, logout, session expiry, or unmount; a late response cannot replace the current mount's Trash. A per-object mutation map prevents duplicate submissions across Trash actions.

| Operation | Folder listing cache | Safe metadata | Trash state |
| --- | --- | --- | --- |
| Move to Trash | Invalidate source parent; remove cached listing entries for the trashed subtree | Remove trashed ID and known descendants | Re-fetch on entering Trash; never use folder-cache keys |
| Restore | Invalidate only response `object.parentId` when known | Remember the authoritative returned object | Remove the row after confirmed success |
| Permanent Delete | Keep unrelated folders; remove cached subtree listings if present | Remove target and known descendants | Remove the row after confirmed success |

Trash does not clear all folder caches. The folder cache still stores metadata only; preview binaries are not added to it. When a previewed file is moved to Trash, the preview coordinator is cancelled, the dialog closes, and its object URL is revoked. If a trashed folder is in the currently validated breadcrumb path, navigation returns to its nearest known ancestor; a route change during the request is respected.

## Security review

- All browser calls are same-origin and use same-origin credentials.
- Object IDs are validated logical IDs; the browser cannot supply a Shared Storage project ID or provider reference.
- Mount ownership and operation capability/read-only checks remain server-side. Trash list output and mutation responses are normalized to public metadata; permanent-delete operation IDs are allowlisted.
- Provider paths, references, credentials, raw response bodies, and stack traces are not exposed. No new storage data, logs, remote D1 writes, or secrets were changed.
- Permanent Delete has no route from the normal File Browser action; the Trash-only UI invokes its separate API route after explicit confirmation.

## Validation and production QA

- `pnpm test`: passed, 93/93 (including backend capability/ownership/safe-response coverage, same-origin client routes, Trash pagination, and targeted subtree metadata invalidation).
- `git diff --check`: passed.
- `pnpm lint`: not completed. Both `pnpm lint` and direct ESLint execution stalled without output; ESLint package loading also failed to return. No lint pass is claimed.
- `pnpm build`: not completed. The normal command stalled; a debug run reported `ERR_MODULE_NOT_FOUND` for `tailwindcss/dist/lib.mjs` from the local `@tailwindcss/node` package, although that file was present and directly importable from the pnpm store path. `pnpm install --offline --frozen-lockfile` also stalled and was interrupted. `package.json` and `pnpm-lock.yaml` remain unchanged. This appears to be local dependency-link/hydration inconsistency, not a verified source build result.
- Browser/mobile QA: not run. The Browser plugin is not available in this session and `pnpm exec playwright --version` reported that Playwright is not installed. No screenshots or interaction checks are claimed.
- No deploy or production mutation is part of this phase.

Production checklist after an approved deployment:

1. Create a disposable file, Move to Trash, verify removal from its source listing, then verify it appears in Trash.
2. Restore it and verify it leaves Trash and returns to the response-confirmed parent. Repeat with a same-name conflict and verify the original active file is not overwritten.
3. Permanent-delete a disposable trashed file, refresh Trash, and verify it does not return.
4. Repeat Trash/Restore and Trash/Permanent Delete with a disposable folder and child file; verify subtree behavior.
5. Verify source/restored folders refresh while unrelated cached folders remain available.
6. At approximately 390 × 844, verify long names, row actions, dialogs, focus/keyboard behavior, and empty/error states.
7. Recheck upload, download, rename, move, copy, preview, breadcrumbs, Back/Forward, refresh, and pagination.

## Limitations

Dashboard, Recent, Favorites, and Shared remain demo/fixture state. No bulk operations, Trash retention or expiration, offline/persistent cache, scheduled cleanup, or conflict-resolution UI was added. Resolve local dependency hydration, then rerun lint/build and browser QA before release; visual Trash interaction and production behavior must not be inferred from source tests.
