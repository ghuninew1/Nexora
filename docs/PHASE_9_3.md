# Nexora — Phase 9.3: Real File Operations

สถานะ: implementation เสร็จใน source; `pnpm lint`, `pnpm test` (68/68), `pnpm build` และ `git diff --check` ผ่าน. Local API contract tests ผ่าน. Browser end-to-end mock QA ยังไม่ผ่าน: runtime แยกใน `/private/tmp` compile และ provision temporary D1 ได้ แต่ sign-in ตอบ HTTP 500 จึงไม่อ้างว่า UI-to-Storage flow ผ่าน. ยังไม่ได้ deploy และยังไม่มี production verification สำหรับ operations ใน Phase นี้.

## ขอบเขต

- File Browser เชื่อม upload, download, rename, move และ copy ผ่าน Nexora same-origin `/api/storage/v1/*` endpoints ที่มีอยู่แล้ว.
- ทุก operation ตรวจ capability และ mount/capability read-only state ใน UI; server ตรวจ capability ซ้ำก่อนเรียก Shared Storage. Mount ownership/session และ project mapping คงอยู่ใน server.
- Upload ใช้ `FormData` และ browser กำหนด multipart boundary เอง. Queue ส่งงานจริงสูงสุด 2 ไฟล์พร้อมกัน, ยกเลิก/ลองใหม่ได้, จำกัดขนาดตาม `maxUploadBytes` และแสดงสถานะโดยไม่สร้างเปอร์เซ็นต์/ความเร็วปลอม.
- Download เริ่มจาก authenticated same-origin Nexora URL และปล่อยให้ browser รับ response stream; ไม่ materialize object ทั้งก้อนเป็น Blob ใน React.
- Rename และ move รักษา logical object ID; copy ต้องคืน ID ใหม่. Move/copy เลือก folder ปลายทางด้วย lazy folder picker และไม่ preload tree ทั้งหมด.
- S2 copy ทำงาน synchronous และรองรับได้สูงสุด 100 objects; operationId ใช้ยืนยันผลตอบรับและไม่มี polling ใน Nexora.
- Session ที่หมดอายุจัดการผ่าน AuthProvider. Stale responses ไม่เปลี่ยน listing ของ storage/folder ปัจจุบัน. Operation ที่ซ้ำบน object เดียวกันถูกป้องกันขณะ request ทำงาน.

## ขอบเขตที่ยังไม่เปิด

Delete, Trash, restore, permanent delete, preview, bulk operations, SMB, persistent Favorites/Share และ Phase 9.4 ไม่ได้เริ่ม. Dashboard, Recent, Favorites, Shared และ Trash ยังใช้ demo state แยกจาก connected mount. Phase 9.2 list/navigation/create-folder behavior ยังคงเดิม.

## Files ที่เปลี่ยน

- `src/services/storage.js`: multipart upload, rename/move/copy request helpers, response identity validation, safe error mapping, capability gates, authenticated streamed-download navigation.
- `src/hooks/useUploadQueue.js`, `src/hooks/useRemoteFilesState.js`: bounded real queue, cancellation/retry, storage/folder scoped refresh and operation lifecycle.
- `src/components/files/`: connected operation actions, upload queue, rename dialog and folder-only destination picker.
- `functions/_lib/storage-api.js`, `functions/_lib/http.js`: server-side capability enforcement and safe synchronous-copy size error mapping.
- `tests/frontend-storage.test.js`, `tests/backend.test.js`: mocked client/server contract and permission/error coverage.

## Security and contract

Browser ส่งเพียง Nexora `storageId`, logical object ID, logical parent ID, file body และชื่อ object. Browser ไม่ส่งหรือรับ `shared_storage_project_id`, provider reference, bucket/key หรือ Storage credentials. Server resolve mount แบบ owner scoped, derive project ID จาก D1 และตรวจ capability/read-only ก่อน proxy ไป Shared Storage. Upstream download เป็น stream และ upload body ถูกจำกัด/ส่งต่อผ่าน server contract. ไม่มี production credentials ใน tests หรือ fixtures.

## Local verification

- `pnpm lint`: passed.
- `pnpm test`: 68 passed, 0 failed.
- `pnpm build`: passed.
- `git diff --check`: passed after documentation updates.
- Browser mock QA: blocked at local sign-in. The temporary Pages runtime used a separate `/private/tmp` project config, D1 database, fake credentials and loopback-only Storage mock; it did not load repository `.dev.vars`. Pages compiled with the temporary DB binding, but login returned HTTP 500. The local temporary QA files and servers were cleaned up after recording this limitation. This result is not production evidence.

## Production smoke test after operator deployment

Use an authorized test account and a non-production test folder/file in the deployed environment. Do not test Trash/Delete in this phase.

1. Confirm `GET /api/storage/v1/storages/:storageId/capabilities` returns 200 and includes expected capability flags. Browser must not receive provider project IDs or credentials.
2. Upload a small test file at the root and inside a folder. Confirm it appears in refreshed listing and reject a file above `maxUploadBytes` before transfer. Confirm queue concurrency is at most 2 and status has no invented percentage.
3. Download the uploaded test file; verify name and bytes match. Confirm transfer goes through same-origin Nexora route.
4. Rename it; verify content remains and logical ID is unchanged. Move it into a test folder; verify the same ID appears only at the destination.
5. Copy it into another test folder; verify the copy has a new logical ID and source remains.
6. Try each operation when its capability is false and with a read-only mount; confirm UI disables it and direct same-origin API calls are rejected server-side.
7. Verify duplicate-name, missing source/destination, oversized upload/copy, network failure, cancellation/retry and expired-session messages remain safe and do not expose upstream response bodies or credentials.

Production success must be reported only after the operator deploys and confirms these checks. No deployment, remote D1 change, Storage mutation, or secret change was done for this implementation.
