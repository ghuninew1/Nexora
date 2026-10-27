# Nexora — Project Handoff

อัปเดตล่าสุด: 2026-10-27

เอกสารนี้สรุปสถานะ Nexora และเป็นจุดเริ่มงานหลัง Phase 7; แยก local validation, source audit และ proposal ออกจาก backend/production ที่ยังไม่ได้รับอนุมัติ

## สถานะปัจจุบัน

- Phase 1–6 เสร็จในขอบเขต frontend/demo: Liquid Glass foundation, app shell, File Browser และหน้า Dashboard, Recent, Favorites, Shared, Trash, Storage, Settings
- Phase 6 เพิ่ม labels/focus, keyboard/touch behavior, duplicate-name validation, responsive breadcrumbs, progressbar semantics และ reduced-motion support
- Phase 7: `pnpm lint` และ `pnpm build` ผ่านหลังแก้ lint errors/warnings ใน preview lifecycle, FilesProvider restore helper และ hook dependencies
- Browser: ตรวจ route `/dashboard`, `/files`, `/recent`, `/favorites`, `/shared`, `/trash`, `/storage`, `/settings` และ unknown route ใน in-app browser ขนาดแคบประมาณ 576 px; ยืนยัน mobile navigation menu, search, list/grid, folder/breadcrumb, create folder, move to Trash, restore, preview sample state, theme Light/Dark/System, Tab focus ring และปิด preview dialog ได้
- Browser QA ที่ยังไม่ยืนยัน: desktop viewport, native file chooser/upload queue (เลือกไฟล์ไม่ได้ใน browser control นี้), permanent delete (ต้องให้ผู้ใช้ยืนยัน ณ เวลาลบ), reduced-motion system override และ console log
- Nexora ยังไม่มี authentication, domain API, Pages Functions, D1 binding หรือ migrations; `wrangler.jsonc` ปัจจุบันตั้งค่า Pages output เป็น `dist/` เท่านั้น
- `FilesProvider` เก็บ files, Favorites, Recent และ Trash ใน memory ระหว่าง route; refresh จะคืนข้อมูล demo
- Upload queue จำลอง progress ใน browser; preview/download ทำได้กับไฟล์ที่ผู้ใช้เลือกและยังอยู่ใน session เท่านั้น
- Shared แสดง fixture records, Share action ยังปิดอยู่, Storage แสดงว่า provider ยังไม่ได้เชื่อม
- Theme เป็น browser preference ใน `localStorage`

## Phase 7 deliverables

- [`docs/STORAGE_API_AUDIT.md`](docs/STORAGE_API_AUDIT.md): routes/methods, payload/response, auth, authorization, size limits, filename handling, error behavior, Garage communication, streaming, CORS findings และ REUSE/EXTEND/REPLACE/NOT FOR NEXORA classifications
- [`docs/STORAGE_ARCHITECTURE.md`](docs/STORAGE_ARCHITECTURE.md): current and target architecture, provider behavior contract, registry/secrets, logical IDs, namespace, D1 table proposal, auth/security/streaming review, SMB readiness และ Phase 8 file-level sequence
- [`docs/STORAGE_API_V1_PROPOSAL.md`](docs/STORAGE_API_V1_PROPOSAL.md): proposed provider-neutral `/api/storage/v1/*` routes, request/response patterns, capability model, logical IDs, errors, retry/streaming behavior
- Audit อ่านเฉพาะ source/config ที่เกี่ยวข้อง; ไม่อ่าน credentials, local Storage database/WAL/SHM หรือ object data และไม่แก้ IssueDesk/Shared Storage Service

## สถานะ frontend validation

- Checks ที่รัน: `pnpm lint` ผ่าน, `pnpm build` ผ่าน, browser route/interaction checks ตามรายการด้านบน
- Project ไม่มี root test script
- ไม่ได้ยืนยัน upload queue, permanent delete, desktop viewport, reduced motion หรือ console logs; อย่าอ้างว่า QA ครบทุก flow/viewport

## งานถัดไป: Phase 8 (รอ approval)

เมื่อได้รับอนุมัติ Phase 8 ให้เริ่มจาก D1/schema/auth boundary และ server-side Storage Manager/Provider Contract ตามข้อเสนอ จากนั้นจึงเพิ่ม Garage adapter และค่อยเปลี่ยน frontend ออกจาก demo state

Phase 7 **ไม่ได้อนุญาต** backend implementation, D1 migrations, Shared Storage Service/Garage changes, credentials/secrets, SMB install/connection หรือ deployment. รอ approval สำหรับ **Phase 8 — Backend Foundation & Storage Contract Implementation** ก่อนเริ่ม

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
- ใช้ shared `Button` และ Liquid Glass styles ที่มีอยู่ รักษา keyboard, focus-visible, reduced-motion และ responsive behavior
- ห้าม deploy, migrate remote D1, เปลี่ยน secrets, แก้ข้อมูล Storage หรือเปลี่ยน Shared Storage Service หากไม่ได้รับ authorization แยก
- รักษาไฟล์และการแก้ไขเดิมใน checkout; ไม่เปลี่ยน dependency เพียงเพื่อ workaround ปัญหา local environment

## แผนที่ไฟล์ปัจจุบัน

- `src/App.jsx`, `src/layouts/AppLayout.jsx`, `src/components/layout/`: route และ shared shell
- `src/context/FilesProvider.jsx`, `src/hooks/useFiles.js`: in-memory state และ file operations
- `src/components/files/`: File Browser, demo grid, dialogs, preview และ upload queue UI
- `src/pages/WorkspacePage.jsx`: Dashboard, Recent, Favorites, Shared, Trash, Storage, Settings
- `src/data/files.js`: fixtures; metadata ตัวอย่างไม่ใช่สถานะ Storage จริง
- `src/services/`, `functions/`, `migrations/`: ยังไม่มี implementation ใน checkout ปัจจุบัน
- `README.md`, `AGENTS.md`, `docs/DESIGN_SYSTEM.md`: project status, working conventions และ UI foundation
- `docs/STORAGE_API_AUDIT.md`, `docs/STORAGE_ARCHITECTURE.md`, `docs/STORAGE_API_V1_PROPOSAL.md`: Phase 7 audit และ proposal

## เริ่มงานต่อใน session ใหม่

อ่าน `PROJECT_HANDOFF.md`, `AGENTS.md`, `README.md` และตรวจ `git status --short`; Phase 7 validation/audit/proposal เสร็จแล้ว เริ่ม Phase 8 เฉพาะหลังได้รับ approval แยก
