# Nexora — Phase 9.2: Real File Listing + Folder Navigation

สถานะ: implementation พร้อม local validation; production smoke test ถูกบล็อกด้วย `PROVIDER_UNAVAILABLE` จาก capabilities endpoint. เพิ่ม safe server-side diagnostics สำหรับ request ถัดไปแล้ว แต่ยังไม่ได้ deploy diagnostics หรือพิสูจน์ production root cause. Phase 9.3 ยังไม่เริ่ม.

## ขอบเขตที่ทำ

- File Browser ใช้ active storage mount จาก `StorageProvider`; ไม่มี fallback ไป fixture เมื่อ API ล้มเหลวหรือไม่มี mount.
- โหลด root และ child objects ผ่าน `GET /api/storage/v1/storages/:storageId/objects`. Root ไม่ส่ง `parentId`; child ส่ง logical `parentId`. ใช้ cursor ที่ backend ส่งกลับและ page limit 50.
- Normalize object IDs, parent IDs, name, type, size, MIME type, created time และ modified time เป็น public fields ที่ UI ต้องใช้เท่านั้น; ไม่เก็บ provider references.
- เปิด folder ด้วย `?folder=<logical objectId>` และใช้ React Router history state สำหรับชื่อ breadcrumbs. Back/forward และ reload สามารถคืนเส้นทางที่ยืนยันได้จาก history state. Deep link ที่ไม่มี breadcrumb state ซึ่งตรวจรูปแบบได้กลับไป root; folder ที่ API ตอบ 404 ก็กลับ root พร้อมข้อความ.
- แสดง loading, empty, unavailable, error, refresh และ load-more states. Abort requests และละทิ้งผลจาก request เก่าเมื่อเปลี่ยน storage/folder.
- Search/sort จำกัดอยู่ที่ objects ที่โหลดแล้วใน folder ปัจจุบัน. Refresh โหลดหน้าแรกใหม่. Pagination merge/deduplicate ด้วย logical `objectId`.
- สร้าง folder ผ่าน capability `createFolder`, mount writable state และ `POST /api/storage/v1/storages/:storageId/folders` ด้วย `{name,parentId}`. Client ตรวจชื่อว่าง, UTF-8 byte limit, slash/control characters และชื่อซ้ำในรายการที่โหลดแล้ว; server ยังคงเป็นผู้ตัดสิน conflict/authorization ขั้นสุดท้าย. ข้อผิดพลาดแสดง inline และไม่เปิดเผย upstream body.
- `401` ส่งให้ AuthProvider หมด session; `404` สำหรับ folder ที่หายจะพากลับ root. ปุ่ม upload, preview, download, rename, delete/Trash, Favorites และ Share ถูกปิดไว้ใน File Browser.
- `Dashboard`, `Recent`, `Favorites`, `Shared` และ `Trash` ยังคงใช้ demo/fixture state แยกจาก remote File Browser. การสร้าง/แก้ demo records ไม่เปลี่ยน mount.

## Files ที่เปลี่ยน

- `src/services/storage.js`: same-origin listing and create-folder methods, public object normalization, page merge helper, safe conflict/input errors.
- `src/hooks/useRemoteFilesState.js`: authenticated browser list/navigation/pagination/create lifecycle, abort and stale response guards, folder route recovery.
- `src/utils/storage-files.js`: logical object ID and breadcrumb route-state validation.
- `src/context/files-context.js`, `src/context/FilesProvider.jsx`: separate demo context from remote browser context.
- `src/hooks/useFiles.js`: retain demo hook as `useDemoFiles`; default `useFiles` maps active remote metadata into File Browser items.
- `src/components/files/`, `src/pages/WorkspacePage.jsx`: connected listing/navigation UI, capability-gated new-folder dialog, disabled later-phase actions, and demo route links no longer pass fixture IDs into the connected browser.
- `tests/frontend-storage.test.js`: API contract, safe normalization, cursor, folder creation errors and breadcrumb validation cases.

## Contract and security boundary

The browser calls only `/api/storage/v1/*` with same-origin credentials. It submits Nexora `storageId`, logical `parentId`, opaque cursor, and folder name. It never supplies `shared_storage_project_id`, provider URLs, credentials, bucket names, physical keys or upstream routes. Existing Phase 8 server handlers remain responsible for session, mount ownership, capability checks and provider response normalization.

No upload body or object bytes are sent in Phase 9.2. File rows cannot preview or download; later-phase file actions are explicitly disabled. Storage usage remains governed by the Phase 9.1 `Not reported` state when authoritative metrics are unavailable.

## Production capabilities 503 audit

Static trace for `GET /api/storage/v1/storages/:storageId/capabilities`:

1. `functions/api/[[path]].js` exports the Pages `onRequest` handler from `functions/_lib/api.js`.
2. `_lib/api.js` authenticates the Nexora session through the runtime `env` binding, then routes to `handleStorageApi`.
3. `_lib/storage-api.js` resolves `storage_mounts` using both `id = storageId` and `owner_user_id = user.id`. It requires an active mount and passes the row's `shared_storage_project_id` to `callJson`; the browser-facing `storageId` is not used as the upstream project ID.
4. `_lib/storage-client.js` validates the HTTPS base URL and constructs `new URL('/v3/projects/<encoded projectId>/capabilities', base)`. A leading slash resets any path component on the base URL; a trailing slash does not duplicate `/v3` or the route. Project IDs are restricted to letters, digits, `_` and `-` before encoding.
5. The client reads `STORAGE_API_URL`, `STORAGE_APP_SECRET`, `CF_ACCESS_CLIENT_ID`, and `CF_ACCESS_CLIENT_SECRET` from the Cloudflare Pages Function `env` object (the same runtime object used for `DB`). It sends `Authorization: Bearer <app secret>`, `CF-Access-Client-Id`, `CF-Access-Client-Secret`, and `Accept: application/json`; it does not forward browser cookies or request headers.
6. A new `AbortController` relays the incoming request signal and is bounded by `STORAGE_TIMEOUT_MS` (default 15 seconds). Fetch uses `redirect: 'error'`; redirects therefore become fetch exceptions. Timeout maps to 504; other fetch exceptions map to 503.
7. Successful upstream JSON is unwrapped only if it has a `data` object, otherwise passed through. The inspected Shared Storage S2 `/v3/projects/:projectId/capabilities` route returns `{success:true, capabilities:{...}}`, which matches this path. Nexora whitelists capability booleans and returns `{data:{capabilities}}`.

`GET /api/storage/v1/storages` only queries D1 and returns the active mount's public label/status/read-only fields; it does not call Shared Storage and does not confirm upstream connectivity. The migration constrains `provider` to `garage`, and ownership/status lookup occurs before the outbound request.

Current error mapping: missing/invalid upstream configuration, unsupported mount provider, fetch/network exception, and upstream 5xx can yield `PROVIDER_UNAVAILABLE`/503. Timeout yields 504. Upstream 404 stays 404; 413 maps to 413; 422 maps to 422; other upstream 4xx (including 401/403) currently map to safe `INTERNAL_ERROR`/500. Invalid JSON after upstream 200 maps to 502. A JSON 200 without a `capabilities` object is currently normalized to all-false capabilities and remains HTTP 200; it cannot explain the reported 503.

The only static request-option difference that could matter relative to a curl invocation is `redirect: 'error'`; the exact curl flags were not provided, so redirect behavior cannot be compared conclusively. The direct authenticated curl result proves the service path from the operator machine, not the Pages Function's fetch outcome. Static source review did not prove which production 503 branch occurred.

Safe temporary logs now classify capabilities requests without logging values or identifiers:

- `stage=bindings` records only `present`/`missing` for the four required bindings.
- `stage=config result=invalid-url|missing-binding`, `stage=mount result=unsupported-provider`, and `stage=request-build result=header-error type=...` identify pre-fetch failures.
- `stage=request`, `result=fetch-error type=... redirect=error`, and `result=timeout` classify outbound fetch outcomes.
- `result=http-error status=...`, `result=parse-error status=...`, `result=http-ok status=200`, and `result=schema-error status=200` distinguish response and parsing/schema outcomes.

Logs intentionally omit the storage ID, project ID, URL, secret values, request headers, upstream bodies, and provider references. Remove or reduce these temporary diagnostics after identifying the production branch.

## Local validation

- `pnpm lint`: passed.
- `pnpm test`: passed, 57/57, including backend, auth/provisioning, capability request construction, server-only headers, safe diagnostic classification, storage client and breadcrumb cases.
- `pnpm build`: passed.
- In-app browser QA used a temporary localhost mock API and fabricated QA objects, not a production account or mount. Verified root and child listing, nested empty folder, breadcrumbs, back navigation, deep-link fallback, reload of a folder route, cursor pagination, loaded-item search, refresh resetting to page one, duplicate-name error, successful create and a narrow/mobile-sized viewport. The UI showed file actions as unavailable.
- `git diff --check`: passed after the source and documentation updates.

## Remaining verification

- Production deployment and browser-to-deployed-Nexora API connection are unverified. Do not infer availability from code, the Phase 9.1 brief, or local mocks.
- Production root cause for the reported 503 is not yet proven; the redacted diagnostic log branch must be observed after an operator deploys the diagnostic revision.
- Production capability policy, active-mount ordering, provider pagination consistency, and operator smoke test remain to be checked against the deployed revision after an authorized release.
- Desktop viewport, browser console/network inspection against the deployed API, and production data behavior remain unverified.

## Phase boundary

Phase 9.2 stops at listing, folder navigation, and create-folder. It does not implement upload/download/preview, rename, move/copy, Trash, persistent Favorites/Recent, Share, range reads, production deployment, or remote data changes. Continue only from a separately reviewed Phase 9.3 brief.

## Production verification after authorized deployment

1. Deploy the reviewed diagnostic revision through the operator's existing release process; verify it is active for both `nexora.bigbrain-studio.com` and `nexora-35p.pages.dev`.
2. Start `pnpm log` (Wrangler Pages deployment tail) and issue one authenticated request to `/api/storage/v1/storages/<storageId>/capabilities` from each host, recording the request time and timezone.
3. Read only the `[storage-upstream] operation=capabilities` classification. Check presence fields and the stage/result/status. Do not copy secrets, project IDs, complete headers, or raw upstream bodies into tickets/chat.
4. If logs report `result=http-ok status=200` and no schema error, confirm the browser receives HTTP 200 with a safe normalized `data.capabilities` payload and StorageProvider reaches ready. If the stage is `fetch-error`, compare redirect behavior and Pages-to-Storage reachability; if `http-error`, use only the status to investigate the upstream/access path.
5. Confirm both custom domain and `pages.dev` return HTTP 200. Do not claim production success until the operator completes this check. No production request was made as part of this local audit.
