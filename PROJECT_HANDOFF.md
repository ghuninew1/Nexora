# Nexora — Project Handoff

อัปเดตล่าสุด: 2026-10-27

เอกสารนี้สรุปสถานะ Nexora หลัง Phase 8 และ production provisioning CLI; แยกผล local validation ออกจากสถานะ remote ที่ operator ยืนยัน

## สถานะปัจจุบัน

- Phase 1–6 เสร็จในขอบเขต frontend/demo: Liquid Glass foundation, app shell, File Browser และหน้า Dashboard, Recent, Favorites, Shared, Trash, Storage, Settings
- Phase 6 เพิ่ม labels/focus, keyboard/touch behavior, duplicate-name validation, responsive breadcrumbs, progressbar semantics และ reduced-motion support
- Phase 7: `pnpm lint` และ `pnpm build` ผ่านหลังแก้ lint errors/warnings ใน preview lifecycle, FilesProvider restore helper และ hook dependencies
- Browser: ตรวจ route `/dashboard`, `/files`, `/recent`, `/favorites`, `/shared`, `/trash`, `/storage`, `/settings` และ unknown route ใน in-app browser ขนาดแคบประมาณ 576 px; ยืนยัน mobile navigation menu, search, list/grid, folder/breadcrumb, create folder, move to Trash, restore, preview sample state, theme Light/Dark/System, Tab focus ring และปิด preview dialog ได้
- Browser QA ที่ยังไม่ยืนยัน: desktop viewport, native file chooser/upload queue (เลือกไฟล์ไม่ได้ใน browser control นี้), permanent delete (ต้องให้ผู้ใช้ยืนยัน ณ เวลาลบ), reduced-motion system override และ console log
- UI follow-up mobile QA: ตรวจ File Browser ที่ `/files` ใน in-app browser บนหน้าจอมือถือ, สลับ List/Grid, กดดาวเพิ่ม Favorites แล้วตรวจสถานะปุ่มเปลี่ยนเป็น Remove, เปิด mobile Sidebar และตรวจ labels/โลโก้เต็ม; screenshot ยืนยัน layout ไม่มีการตัดแถวรายการใน viewport ที่ตรวจ
- Phase 8 backend foundation: Pages Functions, Nexora D1 schema, hashed-cookie sessions, origin checks, mount ownership และ server-only Shared Storage `/v3` client
- Operator ยืนยัน production D1/migration, admin, storage mount, Shared Storage app/project/access token และ production secrets พร้อมใช้งาน; `/v3` capabilities test ได้ HTTP 200. Phase 8.5 ไม่เชื่อมต่อ production และไม่เปลี่ยน records/secrets
- `pnpm db:migrate:local` apply Nexora migration กับ Wrangler local D1 ได้; `wrangler.jsonc` กำหนด D1 `nexora-db` พร้อม database ID
- `FilesProvider`, `useFiles`, fixtures และ upload simulation ยังเป็น demo และไม่เรียก backend; frontend integration อยู่ Phase 9
- Phase 8.5 เพิ่ม frontend auth/session restore, protected routes, login/logout และ Header identity; Storage/File Browser ยัง demo-only
- `FilesProvider` เก็บ files, Favorites, Recent และ Trash ใน memory ระหว่าง route; refresh จะคืนข้อมูล demo
- Upload queue จำลอง progress ใน browser; preview/download ทำได้กับไฟล์ที่ผู้ใช้เลือกและยังอยู่ใน session เท่านั้น
- Shared แสดง fixture records, Share action ยังปิดอยู่, Storage แสดงว่า provider ยังไม่ได้เชื่อม
- Theme เป็น browser preference ใน `localStorage`
- UI follow-up: Sidebar เต็มความสูงและ responsive; ใช้ `src/assets/logo_full.avif` ตอนขยายและ `src/assets/logo.avif` ตอนพับ; File Browser และการ์ด Recent/Favorites มี Liquid Glass hover; รายการใน File Browser มีปุ่มดาว Favorites กดตรงหน้าสัญลักษณ์ไฟล์/โฟลเดอร์ได้
- การเปลี่ยนแปลงล่าสุดครอบคลุม File Browser, Sidebar และ docs; lint/build ผ่านตามรายการ Validation ด้านล่าง ส่วน desktop/console ยังไม่ยืนยัน

## Phase 7 deliverables

- [`docs/STORAGE_API_AUDIT.md`](docs/STORAGE_API_AUDIT.md): routes/methods, payload/response, auth, authorization, size limits, filename handling, error behavior, Garage communication, streaming, CORS findings และ REUSE/EXTEND/REPLACE/NOT FOR NEXORA classifications
- [`docs/STORAGE_ARCHITECTURE.md`](docs/STORAGE_ARCHITECTURE.md): current and target architecture, provider behavior contract, registry/secrets, logical IDs, namespace, D1 table proposal, auth/security/streaming review, SMB readiness และ Phase 8 file-level sequence
- [`docs/STORAGE_API_V1_PROPOSAL.md`](docs/STORAGE_API_V1_PROPOSAL.md): proposed provider-neutral `/api/storage/v1/*` routes, request/response patterns, capability model, logical IDs, errors, retry/streaming behavior
- [`docs/PRODUCTION_PROVISIONING.md`](docs/PRODUCTION_PROVISIONING.md): exact manual commands/env, remote target behavior, and recovery guidance for admin and mount provisioning
- [`docs/PHASE_8_5.md`](docs/PHASE_8_5.md): frontend auth design, routes, session lifecycle, security review, validation and production smoke test
- Audit อ่านเฉพาะ source/config ที่เกี่ยวข้อง; ไม่อ่าน credentials, local Storage database/WAL/SHM หรือ object data และไม่แก้ IssueDesk/Shared Storage Service

## สถานะ frontend validation

- Checks ที่รันในรอบก่อน: `pnpm lint` ผ่าน, `pnpm build` ผ่าน, browser route/interaction checks ตามรายการด้านบน
- UI follow-up ล่าสุด: `pnpm lint`, `pnpm build` และ `git diff --check` ผ่านหลังเพิ่มปุ่ม Favorites inline; in-app browser mobile interaction/layout ผ่านตามรายการด้านบน
- Browser UI smoke tests สำหรับ Phase 8.5 ใช้ localhost Vite server กับ mock auth endpoint/QA identity; ตรวจ unauthenticated redirect, login/return route, Header identity, logout และ safe invalid-password message. ไม่ใช้ production account
- `pnpm exec playwright --version` ไม่มี Playwright ใน dependencies; ไม่มี React component test framework จึงเพิ่ม Node tests สำหรับ auth API contract และ safe return handling แทน; production login และ browser/device matrix ยังไม่ยืนยัน
- Phase 8 เพิ่ม `pnpm test`; backend และ auth-client/provisioning tests รันด้วย Node in-memory SQLite/mocks
- QA ที่ยังไม่ครบตามรายการด้านบนต้องตรวจแยกก่อนสรุปว่า UI ผ่านทุก flow/viewport

## Shared Storage Phase S1/S2 — 2026-10-27

Shared Storage S1/S2 เสร็จใน checkout แยก `issuedesk/garage/storage/`: `/v3` internal manager API, logical folder/file tree, migration/backfill, name policy, copy verification, Trash/restore/purge และ operation records; `/v2` auth/response contract คงเดิมหลัง migration. `pnpm test` 27/27 และ IssueDesk lint ผ่านด้วย memory SQLite/fake S3; S2 migration ยังไม่ได้ apply กับ service runtime และไม่มี deployment/production verification. Nexora Phase 8 เริ่มต่อแล้วและมีรายงานแยก [S1](docs/STORAGE_PHASE_S1.md), [S2](docs/STORAGE_PHASE_S2.md)

## Nexora Phase 8 — 2026-10-27

เพิ่ม Pages Functions API สำหรับ `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`; Storage mounts/list/capabilities/usage-unavailable, object list/stat, folder/upload/download/rename/move/copy/Trash/restore/permanent-delete/operations; Favorites และ bounded Recent. Mount/project mapping อยู่ D1 และ every operation derives the project from the current session-owned mount. Download passes `ReadableStream` with safe headers and cancellation. Upload body is bounded and forwarded as a stream, but Shared Storage S2 still buffers multipart; resumable/large-file upload is unsupported.

Auth uses PBKDF2-HMAC-SHA-256 at 600,000 iterations via Web Crypto, 32 random bytes per session, SHA-256 token hashes in D1, 14-day Secure/HttpOnly/SameSite=Lax cookies, inactive-user rejection and bounded login attempts. `pnpm admin:create:local` remains unchanged. Added explicit `pnpm admin:create:remote` and `pnpm storage:mount:create:remote`, both hard-coded to Wrangler `--remote` against configured `nexora-db`; neither was run in this work. No public registration, share mutation API, or SMB support.

See [Phase 8 report](docs/PHASE_8.md), [production provisioning guide](docs/PRODUCTION_PROVISIONING.md), and [Phase 8.5 report](docs/PHASE_8_5.md). Production records/configuration are operator-confirmed. The operator reported the production provisioning CLI can print an unexpected-response message after a successful write; admin and mount were verified directly in D1. Do not rerun provisioning or alter those records as part of Phase 8.5. Production login has not been tested here.

## Phase 8.5 — Frontend Authentication

เพิ่ม AuthProvider/useAuth, same-origin `/api/auth/*` client, `/login`, protected workspace routing, session restore และ Header sign out/user identity. `FilesProvider`, fixture state และ upload simulation ยังไม่เชื่อม Storage API; รายละเอียด QA และ manual production smoke test อยู่ใน `docs/PHASE_8_5.md`.

## งานถัดไป: Phase 9 (ยังไม่เริ่ม)

หลัง review Phase 8.5 ให้เริ่มวางแผนเชื่อม File Browser กับ Nexora Storage API เป็นงานใหม่; อย่าขยาย Phase 8.5 ไปเชื่อม FilesProvider หรือเปลี่ยน production.

## Acceptance criteria ก่อนเรียกว่าเชื่อม Storage จริง

- endpoint matrix และ architecture/security review อ้างอิง source ปัจจุบันและได้รับ approval
- metadata ของ Nexora แยกจาก IssueDesk; migrations ตรวจลำดับและ rollback ได้
- ทุก mutation ตรวจ session, ownership, permission และ provider capability ฝั่ง server
- logical IDs คงเดิมเมื่อ rename/move; frontend ไม่รู้ physical path หรือ provider credential
- upload/download เป็น streaming; failure, retry, size limits และ partial operations มี behavior ที่กำหนด
- Trash, restore, Favorites และ Share เป็น persistent และมี authorization checks
- lint/build, tests ที่เกี่ยวข้อง และ browser QA desktop/mobile ผ่าน; รายงานเฉพาะผลที่รันจริง
- เอกสารและสถานะ deploy/migration แยกชัดจาก local validation

## ขอบเขตและแนวทางที่ต้องรักษา

- IssueDesk เป็น reference ด้าน architecture/UI; Nexora ยังคงเป็น Private Cloud/File Management ไม่ copy business logic หรือ auth assumptions โดยไม่ตรวจสอบ
- ใช้ `cx()` กับ JSX `className` ทุกจุดที่สร้างหรือแก้; helper นี้รวม string/falsy values และไม่ได้ merge Tailwind conflicts
- ใช้ shared `Button` และ Liquid Glass styles ที่มีอยู่; sheen, pointer light และ inset rim ของปุ่มปรับตามสีตัวอักษรให้เห็นบนพื้นสว่างและมืด รักษา keyboard, focus-visible, reduced-motion และ responsive behavior
- ห้าม deploy, migrate remote D1, เปลี่ยน secrets, แก้ข้อมูล Storage หรือเปลี่ยน Shared Storage Service หากไม่ได้รับ authorization แยก
- รักษาไฟล์และการแก้ไขเดิมใน checkout; ไม่เปลี่ยน dependency เพียงเพื่อ workaround ปัญหา local environment

## แผนที่ไฟล์ปัจจุบัน

- `src/App.jsx`, `src/layouts/AppLayout.jsx`, `src/components/layout/`: route และ shared shell
- `src/context/FilesProvider.jsx`, `src/hooks/useFiles.js`: in-memory state และ file operations
- `src/components/files/`: File Browser, demo grid, dialogs, preview และ upload queue UI
- `src/pages/WorkspacePage.jsx`: Dashboard, Recent, Favorites, Shared, Trash, Storage, Settings
- `src/data/files.js`: fixtures; metadata ตัวอย่างไม่ใช่สถานะ Storage จริง
- `src/context/AuthProvider.jsx`, `src/hooks/useAuth.js`, `src/services/auth.js`: frontend authentication state/client; ยังไม่มี Storage API client
- `README.md`, `AGENTS.md`, `docs/DESIGN_SYSTEM.md`: project status, working conventions และ UI foundation
- `docs/STORAGE_API_AUDIT.md`, `docs/STORAGE_ARCHITECTURE.md`, `docs/STORAGE_API_V1_PROPOSAL.md`, `docs/PHASE_8.md`, `docs/PHASE_8_5.md`, `docs/PRODUCTION_PROVISIONING.md`: source audit, API contract, phase reports and provisioning guide

## เริ่มงานต่อใน session ใหม่

อ่าน `PROJECT_HANDOFF.md`, `AGENTS.md`, `README.md`, `docs/PHASE_8.md`, `docs/PHASE_8_5.md`, `docs/PRODUCTION_PROVISIONING.md` และตรวจ `git status --short`; Phase 8.5 frontend auth เสร็จแล้ว โดย Storage/File Browser ยังเป็น demo ก่อน Phase 9

## กติกาการดูแลเอกสาร

ทุกครั้งที่แก้ source หรือ behavior ให้ซิงก์ `README.md`, `AGENTS.md` และ `PROJECT_HANDOFF.md` ในงานรอบเดียวกัน โดยบันทึก scope, สถานะ demo/backend และผลตรวจจริง; แยกสิ่งที่ยังไม่ได้ตรวจหรือยังไม่ได้รับอนุมัติออกจากรายการที่เสร็จแล้ว
