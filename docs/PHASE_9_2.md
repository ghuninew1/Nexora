# Nexora — Phase 9.2: Real File Listing + Folder Navigation

สถานะ: implementation พร้อม local validation. งานนี้เพิ่มการแสดงรายการ object จริง การนำทางโฟลเดอร์ และการสร้างโฟลเดอร์ผ่าน Nexora same-origin API. ยังไม่ได้ deploy หรือทดสอบกับ production mount. Phase 9.3 ยังไม่เริ่ม.

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

## Local validation

- `pnpm lint`: passed.
- `pnpm test`: passed, 52/52, including backend, auth/provisioning, storage client and breadcrumb cases.
- `pnpm build`: passed.
- In-app browser QA used a temporary localhost mock API and fabricated QA objects, not a production account or mount. Verified root and child listing, nested empty folder, breadcrumbs, back navigation, deep-link fallback, reload of a folder route, cursor pagination, loaded-item search, refresh resetting to page one, duplicate-name error, successful create and a narrow/mobile-sized viewport. The UI showed file actions as unavailable.
- `git diff --check`: passed after the source and documentation updates.

## Remaining verification

- Production deployment and browser-to-deployed-Nexora API connection are unverified. Do not infer availability from code, the Phase 9.1 brief, or local mocks.
- Production capability policy, active-mount ordering, provider pagination consistency, and operator smoke test remain to be checked against the deployed revision after an authorized release.
- Desktop viewport, browser console/network inspection against the deployed API, and production data behavior remain unverified.

## Phase boundary

Phase 9.2 stops at listing, folder navigation, and create-folder. It does not implement upload/download/preview, rename, move/copy, Trash, persistent Favorites/Recent, Share, range reads, production deployment, or remote data changes. Continue only from a separately reviewed Phase 9.3 brief.
