# Nexora — Project Handoff

อัปเดตล่าสุด: 2026-10-27

เอกสารนี้ใช้เริ่มงานต่อจาก Phase 6 โดยเก็บสถานะจริง ข้อจำกัด และลำดับงานที่ต้องทำก่อนเชื่อมระบบจัดเก็บไฟล์จริง

## สถานะปัจจุบัน

- Phase 1–6 เสร็จในขอบเขต frontend/demo: Liquid Glass foundation, app shell, File Browser และหน้า Dashboard, Recent, Favorites, Shared, Trash, Storage, Settings
- Phase 6 เพิ่ม labels/focus, keyboard/touch behavior, duplicate-name validation, responsive breadcrumbs, progressbar semantics และ reduced-motion support
- **ยังไม่ได้รัน lint, build หรือ browser QA หลัง Phase 6** จึงยังไม่มีหลักฐานยืนยันว่า frontend ล่าสุด build ผ่านหรือใช้งานได้ครบทุก viewport
- Nexora ยังไม่มี authentication, domain API, Pages Functions, D1 binding หรือ migrations; `wrangler.jsonc` ปัจจุบันตั้งค่า Pages output เป็น `dist/` เท่านั้น
- `FilesProvider` เก็บ files, Favorites, Recent และ Trash ใน memory ระหว่าง route; refresh จะคืนข้อมูล demo
- Upload queue จำลอง progress ใน browser; preview/download ทำได้กับไฟล์ที่ผู้ใช้เลือกและยังอยู่ใน session เท่านั้น
- Shared แสดง fixture records, Share action ยังปิดอยู่, Storage แสดงว่า provider ยังไม่ได้เชื่อม
- Theme เป็น browser preference ใน `localStorage`

## งานถัดไปตามลำดับ

### 1. ตรวจความพร้อมของ frontend ที่เพิ่งทำ

ก่อนเริ่ม backend ให้ตรวจสถานะล่าสุดจาก checkout นี้:

1. รัน `pnpm lint` และ `pnpm build`
2. เปิดแอปด้วย `pnpm dev` แล้วตรวจ route ทั้งหมดใน desktop และ mobile
3. ตรวจ keyboard/focus, light/dark/system, dialogs, file selection, Trash restore/permanent delete, upload queue, preview และ console errors
4. แก้ปัญหาที่พบและปรับ README/AGENTS ให้ตรงกับผลจริง

โปรเจกต์ไม่มี root test script ในปัจจุบัน; อย่าอ้างว่าผ่าน check ที่ยังไม่ได้รัน

### 2. ทำ Storage/API audit ให้เป็นเอกสารก่อนแตะ implementation

ตรวจ source ปัจจุบันของ IssueDesk และ Shared Storage Service (`garage/storage/` หากยังเป็นตำแหน่งปัจจุบัน) อีกครั้ง โดยระบุ:

- endpoints, methods, request/response, authentication, authorization และข้อจำกัดปัจจุบัน
- endpoints ที่ Nexora ใช้ซ้ำได้ และช่องว่างที่ต้องออกแบบเพิ่มสำหรับ File Manager
- การ map user/session ของ Nexora ไปยัง Storage Service โดยไม่เปิด secret ใน frontend
- security risks, ownership checks, namespace และ migration plan

README ระบุว่าเคยทำ audit แล้ว แต่ใน Nexora checkout นี้ยังไม่มี endpoint matrix หรือผล audit ที่ละเอียดพอสำหรับเริ่ม integration ให้ถือ source ปัจจุบันเป็นข้อเท็จจริงและตรวจซ้ำก่อนออกแบบ ห้ามเดา endpoint จากชื่อ operation

### 3. เสนอและทบทวน contract ก่อนแก้ shared service

ร่างแผนและขอ approval แยกก่อนเปลี่ยน IssueDesk/Shared Storage Service หรือ production infrastructure ตามข้อกำหนดในคำขอเดิม โดยข้อเสนอควรครอบคลุม:

- public, provider-agnostic API ภายใต้ `/api/storage/v1/*`; ห้ามสร้าง `/api/garage/*` หรือ `/api/smb/*` ให้ frontend เรียกโดยตรง
- การ authenticate/authorize ระหว่าง Nexora server กับ Storage API; ห้ามใส่ API key/secret ใน `VITE_*`, browser bundle หรือ browser request
- namespace แยก application และ user เช่น `nexora/users/{userId}/*`
- stable logical `fileId`, `folderId`, `storageId`, `parentId`; ห้ามใช้ physical path เป็น identity
- Nexora metadata database แยกจาก IssueDesk business data; พิจารณา D1 และ schema สำหรับ files/folders, favorites, shares, trash metadata และ storage usage metadata
- Storage Registry และ provider contract ที่รองรับ list/stat/createFolder/upload/download/rename/move/copy/delete/restore/getCapabilities
- provider capabilities ให้ frontend แสดง action ตาม capability ไม่ hard-code provider
- streaming สำหรับ upload/download และ contract ที่รองรับ cross-provider copy/move ในอนาคต
- Garage เป็น provider ที่ implement ก่อน; ออกแบบเผื่อ SMB โดยไม่ติดตั้ง dependency หรือทำ SMB connection ในงานรอบแรก
- threat/security review, failure behavior, limits, migrations, rollback และ test plan

**ห้าม duplicate Storage API implementation เข้า Nexora และห้ามแก้ Shared Storage Service จนกว่าจะมี approval ที่ครอบคลุมงานนั้น**

### 4. Implement backend ของ Nexora หลัง contract ได้รับ approval

แยก domain API ฝั่ง server ออกจาก frontend แล้วทำ authentication/authorization, ownership enforcement, validation, D1 migrations และ service-to-service access ตาม contract ที่ผ่านการทบทวน ใช้ logical IDs และ provider capabilities ตลอด flow; ห้าม expose provider credentials

### 5. เชื่อม frontend และแทน demo behavior

เพิ่ม `src/services/` domain client และเชื่อม File Browser/หน้าอื่นกับ Nexora server API:

- เปลี่ยน `FilesProvider` จาก in-memory records เป็น server state พร้อม loading/error/empty/retry states
- ทำ list/create folder, upload จริงแบบ streaming, rename, move/copy ตาม capabilities, download และ preview ด้วย authorization ที่ถูกต้อง
- ทำ Favorites, Recent, Trash/restore, sharing/permissions และ storage usage ให้ persistent ตาม API
- คง fallback/error messages ที่ไม่เปิดเผย secret หรือ physical path
- เก็บ sample data กับ demo UI ให้แยกจาก production operations อย่างชัดเจน

### 6. เตรียม SMB เป็น provider ในอนาคต

เริ่มหลัง Garage contract/API ทำงานและผ่าน QA แล้วเท่านั้น: เพิ่ม `SMBStorageProvider` หลัง provider contract โดยไม่เปลี่ยน public API, ห้ามเก็บ password เป็น plaintext, ใช้ server-side secret/credential storage และรองรับ read-only mounts/capabilities ก่อนเปิดใช้งาน

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

## เริ่มงานต่อใน session ใหม่

อ่าน `PROJECT_HANDOFF.md`, `AGENTS.md`, `README.md` และตรวจ `git status --short` ก่อนแก้ไฟล์ จากนั้นทำขั้นที่ 1 (frontend validation) และขั้นที่ 2 (audit source ปัจจุบันของ IssueDesk/Storage API) ก่อนเสนอ contract หรือเริ่ม backend
