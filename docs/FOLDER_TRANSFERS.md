# Folder transfers

## Phase 1 — Folder upload

Upload Folder uses `webkitdirectory`; dropped folders use `webkitGetAsEntry` with paged directory readers. Browser APIs expose different information: the picker supplies files and relative paths, not empty directories. Dropping folders preserves empty directories when entries are exposed. Unsupported browsers show a fallback message; individual Upload remains available. Names are preserved, including Thai, spaces and file extensions.

The existing queue admits a bounded manifest of at most 50 files **and folders**, counting implicit ancestors, with maximum depth 32. It rejects the whole selection before mutations on malformed paths, duplicate file paths, conflicting file/folder paths or capacity exhaustion. No file contents are read during discovery. Absolute paths, dot segments, backslashes, control characters and overlong names are rejected. Storage validation/authorization remains authoritative.

Folder tasks create parents before children using the existing authenticated folder API. File tasks use unchanged Direct/Multipart clients, the decimal 5 GB ceiling, checksum verification, single-file concurrency, ownership and resource-error behavior. No backend, migration or dependency changes. Each mutation is authorized server-side. Existing folders are never automatically merged or overwritten. Name conflicts require resolving the conflict before Retry. A lost create response can leave a folder behind; retry may report a conflict rather than guessing which remote folder belongs to the batch.

Transfers retains batch rows until explicitly cleared, with relative paths, folder status, completed/failed/pending counts, acknowledged byte totals, current filename and aggregate verified-byte progress. Direct upload bytes become known only on confirmed success; the display does not invent network progress. Cancel folder upload issues existing per-task cancellation controls and stops queued folder creation; already created folders/published files remain. An in-flight folder creation may complete remotely after abort. Retry incomplete items reuses successful parent IDs and retries in dependency order; completed files are not resubmitted. Parent failures block descendants explicitly.

Folder-batch state and File references are page-memory only. Reload/logout/mount change drops the manifest; existing per-file multipart recovery remains available for sessions that already started, using resolved logical destination IDs. There is no persistent atomic folder transaction or automatic batch replay. Storage authority rechecks the destination/permissions on every create/upload and multipart resume. Do not clear rows if you still need batch recovery. Zero-byte files retain the existing upload API limitation (rejected); empty directories are a separate supported case.

## Phase 2 — Folder ZIP download

My Files folder action **Download Folder as ZIP** uses existing authenticated `stat`, paginated `list` and per-object `download` routes. It requires read/download grants plus list/stat/download capabilities. Each request rechecks server ownership, assignment and capabilities; the client receives logical IDs and same-origin URLs only. The root is refreshed through stat before discovery. A read grant change, missing object or storage failure stops the operation; no partial ZIP is published.

The repository has no ZIP or cross-browser streaming filesystem library. This implementation adds no dependencies or backend endpoint: a small ZIP32 STORE writer produces UTF-8 entries with CRC32, explicit directory entries, data descriptors and a central directory. It downloads one file at a time, incrementally checks actual body length and CRC, and retains bounded chunks for the final Blob. **Limits: 64 MiB of total file bytes, 500 entries including folders/root, depth 32.** Directory headers and the final Blob add memory overhead (browser copies can approach twice payload size). This is bounded small-folder packaging, not multi-GB streaming. These limits are below ZIP64 thresholds, so ZIP64 is unnecessary. Stored ZIP preserves bytes without compression. All entries use a single local modification timestamp captured when ZIP byte generation starts, including nested/empty directories. Both local headers and central-directory records encode the same DOS local date/time, with seconds rounded down to a two-second boundary and out-of-range clocks clamped to 1980-01-01 00:00:00 or 2107-12-31 23:59:58. Backend object metadata, file bytes, CRC32 and entry order are unchanged. DOS timestamps carry local calendar fields without a timezone offset; extractors control how those fields appear on disk.

Discovery enforces direct-parent identity, unique object IDs/paths, safe single-segment names, bounded pagination, repeated-cursor detection, depth and total entry limits. Names with colon or trailing dot/space are rejected for archive extraction safety; names are never silently changed. File bodies exceeding listed size or the byte ceiling are cancelled; short bodies fail. A same-size edit between listing and a later GET may be included: folder downloads are not an atomic provider snapshot. Already authorized/in-flight bytes cannot be revoked retroactively.

My Files shows discovery/received-byte progress, current path, success/error and Cancel. One ZIP runs per workspace; existing single-file/native and public downloads remain independent. Cancel aborts discovery/fetch, discards partial chunks and publishes no archive. Account/mount/permission changes and workspace unmount abort work; final object URLs are revoked after 60 seconds or on teardown. Navigating workspace routes does not cancel the workspace-owned operation; return to My Files to inspect/cancel it. ZIPs have no persistent recovery; retry the folder action from the beginning after failure. After preparation, the browser owns saving/cancellation of the complete Blob download.

Directory picker and folder drop support depend on browser/OS APIs. Safari/Firefox and physical mobile devices have not been acceptance-tested. Blob downloads may prompt, open a preview, or require browser save controls on some browsers. The size policy is the same across browsers and does not depend on File System Access API, service workers or a new CSP allowance.

References: [directory picker](https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/webkitdirectory), [directory drop API](https://developer.mozilla.org/en-US/docs/Web/API/DataTransferItem/webkitGetAsEntry), [ZIP format](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT).

## Multi-selection ZIP download

Select two or more My Files items and choose **Download ZIP** in the existing bulk toolbar. Multiple files, multiple folders and mixed selections use `Selected-Files.zip`, with every selected item at the archive root under its original name. No additional wrapper directory is added. The selection is retained after success, failure or Cancel; Move/Trash and single-item Rename behavior stay unchanged. On narrow screens the existing action toolbar scrolls horizontally.

The existing `folder-download.js` service refreshes every selected root through stat, then `collectSelectedZip` traverses folders and adds file roots to one bounded manifest. All roots share the same ZIP32 STORE/CRC32 writer, authorized same-origin file reads, and a single combined **64 MiB / 500 entries / depth 32** budget. Duplicate logical IDs, overlapping roots and duplicate archive paths fail closed before file content requests; the app does not rename, merge or silently omit selected items. Each backend endpoint remains responsible for current session/assignment/ownership/capability authorization.

The existing workspace ZIP hook accepts either one folder or an array of selected items, and retains one active ZIP operation. Progress includes selected file/folder counts, discovered entries, received content bytes and current path, with completion/error/cancellation states. Success byte counts exclude archive headers. Cancel aborts active requests and explicitly cancels a pending stream reader; scope/permission teardown prevents late publication and releases URLs/timers. Only complete archives reach the native Blob save link. Single-file actions still use native streaming downloads; a single folder retains `FolderName.zip`.

The bulk action is disabled without read/download grants and list/stat/download capabilities, while a ZIP is running, or while selected items are being mutated. Local tests cannot establish real-provider permissions or browser/OS saving behavior. The user reports the preceding single-folder ZIP implementation working in production; multi-selection production acceptance has not been performed by this task. Existing memory, snapshot, unsafe-name, browser and recovery limits above still apply. No deployment configuration, API or migration changes are required.

Changed source: `src/utils/folder-zip.js`, `src/services/folder-download.js`, `src/hooks/useFolderDownload.js`, `src/hooks/useRemoteFilesState.js`, `src/components/files/FileBrowser.jsx`, `src/components/files/FileToolbar.jsx`. Tests: extended `tests/folder-zip.test.js`, `tests/ui/folder-download.spec.jsx`, `tests/ui/native-downloads.spec.jsx`; added `tests/ui/multi-download-toolbar.spec.jsx`.

## Changed source and tests

| Phase | Files and responsibilities |
| --- | --- |
| 1 | `src/utils/folder-upload.js`: bounded discovery/path validation; `src/hooks/useUploadQueue.js`: folder dependencies/recovery guards; `src/components/files/UploadButton.jsx`, `FileToolbar.jsx`, `UploadQueue.jsx`: picker/admission/status/controls |
| 1 + 2 | `src/hooks/useRemoteFilesState.js`, `src/components/files/FileBrowser.jsx`: workspace integration, drop scope, authorization gates, ZIP status |
| 2 | `src/utils/folder-zip.js`: traversal and ZIP32 writer; `src/services/folder-download.js`, `src/services/storage.js`: existing authorized API access; `src/hooks/useFolderDownload.js`: lifecycle/cancel/save/URL cleanup; `src/components/files/FileListItem.jsx`: folder action; `TransferManager.jsx`: control-location guidance |
| Tests | `tests/folder-upload.test.js`, `tests/folder-zip.test.js`, `tests/ui/folder-upload.spec.jsx`, `tests/ui/folder-download.spec.jsx`; updated `tests/ui/native-downloads.spec.jsx` and `tests/ui/transfer-manager.spec.jsx` regressions |
| Documentation | `README.md`, `AGENTS.md`, `PROJECT_HANDOFF.md`, this document, `docs/LARGE_FILE_TRANSFER_FRONTEND.md`, `docs/LARGE_FILE_TRANSFER_DOWNLOAD.md` |

## Deployment requirements

Normal reviewed frontend deployment only; no new migrations, environment variables, remote API contracts or infrastructure changes. Existing folder/list/stat/download grants and capabilities must be available. Large uploads still need the existing compatible multipart feature configuration. Real authorized test Storage acceptance remains required before production readiness claims. Do not rerun 10 GiB/stress suites for this feature.

## Verification boundary

Local tests use mocks and in-memory resources, not real Garage. No production readiness, deployment, migration or infrastructure changes are implied. See PROJECT_HANDOFF.md for executed checks and browser evidence.
