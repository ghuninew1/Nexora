# Phase 9.4.1 — Selection Toolbar Actions and Favorites

## Scope

Connect actions for one selected object to the existing row action flows, repair the selection-toolbar Trash action, and replace the disconnected Favorites fixture page with the existing owner-scoped Favorites API/D1 data. Multi-selection remains limited to clearing the selection. No bulk mutation, share, SMB, deployment, remote D1 migration, or production storage changes were made.

## Findings and implementation

- The selection toolbar rendered a permanently disabled `Delete` button, while the working row action opened the shared `DeleteDialog` with `permanent={false}`. The toolbar now opens that same confirmation and calls the same `trashObject` mutation; selection clears only after success.
- For exactly one selected object, the toolbar now offers Preview for supported files, Favorite/Unfavorite, Copy, Move, Move to Trash, and Clear Selection. Copy/Move reuse the existing destination dialog and capabilities. Preview still loads only when requested. Multiple selection exposes no object mutation actions.
- Row and toolbar Favorite actions call the same authenticated service. The existing D1 `favorites` table and `/api/favorites` routes are reused; no table or duplicate endpoint was added.
- The existing GET route returned only IDs. It now hydrates favorites through the owner-scoped mount's existing storage project mapping, returns normalized logical object metadata, and removes stale references when the upstream object is confirmed missing. Provider project IDs and provider fields are not returned. Favorite listing does not write Recent history.
- Favorites page now shows loading, error/retry, empty and connected data states, with an action to remove an item. It has no demo fixture fallback.
- The earlier `useFiles` default import in `WorkspacePage.jsx` is retained so the Trash page hook can resolve correctly.

## Local validation

- `pnpm lint`: passed.
- `pnpm test`: 94/94 passed, including Favorites API hydration and frontend service request contracts.
- `git diff --check`: passed.
- Default `pnpm build`: blocked by `EPERM` while Vite writes `node_modules/.vite-temp`. Vite's `runner` config loader with output directed to `/tmp/nexora-phase-941-build` completed successfully after transforming 2,318 modules. The existing `dist/` output was not cleared or overwritten.
- Rendered browser QA and production Favorites/toolbar verification were not run. No production API, D1, storage, or deployment was touched.

## Files

`src/components/files/FileToolbar.jsx`, `src/components/files/FileBrowser.jsx`, `src/components/files/FileListItem.jsx`, `src/hooks/useFiles.js`, `src/hooks/useRemoteFilesState.js`, `src/services/storage.js`, `src/pages/WorkspacePage.jsx`, `functions/_lib/storage-api.js`, `tests/backend.test.js`, `tests/frontend-storage.test.js`, `README.md`, `PROJECT_HANDOFF.md`, `docs/DESIGN_SYSTEM.md`.
