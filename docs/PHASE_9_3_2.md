# Phase 9.3.2 — On-Demand Preview and Breadcrumb Navigation

## Scope

This phase fixes File Browser breadcrumb ancestor navigation and adds explicit on-demand previews for connected files. It does not change production infrastructure, D1, Shared Storage, credentials, or the Phase 9.3.1 listing cache.

## Breadcrumb navigation

Breadcrumb clicks now resolve the clicked logical object ID against the verified breadcrumb path, then navigate to that exact ancestor with matching `folder` query and router state. Root navigation removes the query parameter. Unknown breadcrumb IDs are ignored. Navigation uses normal browser history behavior, and folder listings continue to use the existing fresh/stale cache policy.

## Preview behavior

- Preview bytes are requested only after a user chooses Preview. Listing, sorting, caching, and opening folders never fetch file bodies.
- The app uses `GET /api/storage/v1/storages/:storageId/objects/:objectId/preview`, an authenticated same-origin route. The route requires the existing `download` capability; upstream provider `preview` remains `false` when the provider reports it as unsupported.
- Server object metadata and upstream response MIME category must pass a strict allowlist. Supported content is JPEG, PNG, WebP, GIF, AVIF, PDF, and common plain-text, Markdown source, JSON, CSV, and source/config formats. HTML, SVG, office documents, and unknown types are rejected.
- Text is limited to 1 MiB. Image/PDF previews are limited to 20 MiB. The server checks declared metadata size and streamed byte count; the client checks the downloaded Blob size and response MIME again.
- Preview responses are separate from normal downloads. They use inline disposition, private/no-store caching, `nosniff`, and a restrictive sandbox CSP; the existing download endpoint keeps its attachment disposition.
- The UI renders text as text (JSON is pretty-printed when valid), Markdown as source text, PDFs in a sandboxed frame, and images in a contained image view. Preview requests abort on close, file switch, folder/storage navigation, route departure, logout, or unmount; stale responses are ignored and generated object URLs are revoked.
- Connected File Browser preview does not apply to demo fixtures. Trash/delete/restore and Phase 9.4 remain out of scope.

## Files changed

- Breadcrumb destination mapping: `src/utils/storage-files.js`, `src/hooks/useRemoteFilesState.js`.
- Preview policy/request lifecycle/UI: `src/utils/storage-preview.js`, `src/utils/preview-request.js`, `src/services/storage.js`, `src/hooks/useRemoteFilesState.js`, `src/components/files/FileListItem.jsx`, `src/components/files/StorageFilePreviewDialog.jsx`, `src/components/files/FileBrowser.jsx`.
- Authenticated inline stream and safe errors: `functions/_lib/storage-api.js`, `functions/_lib/http.js`.
- Tests: `tests/frontend-storage.test.js`, `tests/backend.test.js`.

## Validation

Passed: `pnpm lint`, `pnpm test` (88/88), `pnpm build`, and `git diff --check`. The in-app browser loaded the local `/files` route but stopped at the session gate because the local auth service is unavailable. Playwright is not installed, so the preview interaction and responsive preview dialog were not rendered or verified. No production endpoint or deployment was used.
