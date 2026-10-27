# Nexora

Nexora เป็นเว็บจัดการไฟล์บน private cloud โดยใช้ **React + Vite + Tailwind CSS v4 + React Router 7** และ Base UI components เป้าหมายด้านภาพและการจัดวางใช้ IssueDesk เป็น reference ส่วนข้อมูลและ business logic ยังเป็นของ Nexora

## Shared Storage Phase S1

เตรียม foundation ในโปรเจกต์แยก `issuedesk/garage/storage/` แล้ว: Storage Manager/registry/Garage Provider, download streaming พร้อม deadline/cancellation และ regression tests 12/12 ผ่านใน workspace แยก Upload ยัง buffered; `/v2` และ ownership เดิมยังคงอยู่ ยังไม่ deploy หรือยืนยัน Garage/Access จริง ดู [รายงาน S1](docs/STORAGE_PHASE_S1.md) หยุดรอ review และคำสั่ง Phase S2 ก่อนเริ่มงานต่อ; Nexora Phase 8 ยังไม่เริ่ม

## สถานะปัจจุบัน

Frontend ทำงานด้วยข้อมูลตัวอย่างในหน่วยความจำ: เปิดโฟลเดอร์และย้อนผ่าน URL breadcrumbs, ค้นหา/เรียงรายการ, สลับ List/Grid, เลือกหลายรายการ, สร้าง/เปลี่ยนชื่อ/ย้ายไป Trash, restore/permanent delete, ทำเครื่องหมาย Favorites และดู Recent, Dashboard และ sharing records ตัวอย่างได้ ไฟล์ตัวอย่างมีเฉพาะ metadata; preview และ download ใช้ได้กับไฟล์ที่เลือกจากเครื่องและอยู่ใน session เท่านั้น

File Browser มีปุ่มรูปดาวสำหรับเพิ่ม/นำรายการออกจาก Favorites อยู่หน้าสัญลักษณ์ไฟล์หรือโฟลเดอร์ กดได้โดยตรงโดยไม่ต้องเปิดเมนู Actions; สถานะยังเป็น demo ใน memory และหายเมื่อ refresh เช่นเดิม Sidebar ใช้โลโก้เต็มเมื่อขยายและโลโก้ย่อเมื่อพับ พร้อมรองรับเมนูบนจอเล็ก

ข้อมูลจาก `src/data/files.js` เป็น fixture ไม่มีการเชื่อม authentication, API, Cloudflare D1 หรือ Storage Service สถานะไฟล์, Recent, Favorites, Trash และ upload demo อยู่ใน memory และหายเมื่อ refresh; ไฟล์ที่อัปโหลดจะไม่ถูกส่งไป Garage/QNAP ธีมเป็นการตั้งค่าฝั่ง browser และเก็บแยกใน localStorage

Dashboard, Recent, Favorites และ Trash ใช้ข้อมูล demo ร่วมกับ File Browser; Shared แสดงรายการตัวอย่างที่ระบุไว้ใน fixtures ส่วน Storage แสดงว่า provider ยังไม่เชื่อม และ Settings ให้ปรับธีมได้ Share, permissions, cross-device download, persistent metadata, live capacity และ provider operations ยังไม่มี backend ปุ่ม Share จึงปิดไว้จนกว่าจะเชื่อม Storage/API จริง

## เริ่มใช้งาน

ต้องติดตั้ง dependencies ของโปรเจกต์ด้วย `pnpm install` ก่อน:

```bash
pnpm dev
pnpm lint
pnpm build
pnpm preview
```

`pnpm preview` build ก่อนเปิด `wrangler pages dev`; `pnpm deploy` ทำการ deploy จริง โปรเจกต์ยังไม่มี root test script

## โครงสร้าง

```text
src/
├── components/
│   ├── files/       # toolbar, breadcrumbs, list/grid, dialogs, preview
│   ├── layout/      # AppShell, Sidebar, Header
│   ├── navigation/  # route/navigation metadata
│   └── ui/          # Base UI components และ variants
├── data/            # file browser demo fixtures
├── context/         # shared in-memory file state across routes
├── hooks/           # useFiles (demo domain state) และ upload queue
├── layouts/         # shared React Router layouts
├── pages/           # route pages
├── theme/           # theme control
└── utils/            # cx, names, glass pointer effects
```

Pages ใช้ `AppLayout` ร่วมกับ `AppShell` และ `<Outlet />` เพื่อให้สถานะ navigation อยู่ต่อระหว่างเปลี่ยน route `FilesProvider` เก็บ demo files, favorites, recents และ trash ระหว่างเปลี่ยน route; `useFiles` จัดการ folder/search/view state และ local operations ส่วน `useUploadQueue` จำลอง progress และเพิ่ม browser `File` เข้า memory เท่านั้น การตั้งค่า design system อยู่ใน `src/index.css` และอธิบายใน [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md)

รายการงานถัดไป, Storage/API guardrails และ acceptance criteria อยู่ใน [`PROJECT_HANDOFF.md`](PROJECT_HANDOFF.md)

ผลตรวจ frontend หลัง Phase 6 และข้อเสนอ Storage สำหรับ Phase 8 อยู่ใน [`docs/STORAGE_API_AUDIT.md`](docs/STORAGE_API_AUDIT.md), [`docs/STORAGE_ARCHITECTURE.md`](docs/STORAGE_ARCHITECTURE.md) และ [`docs/STORAGE_API_V1_PROPOSAL.md`](docs/STORAGE_API_V1_PROPOSAL.md) เอกสารเหล่านี้เป็น source audit/proposal; ยังไม่ได้เชื่อม service หรือเปลี่ยน production

## แนวทางข้อมูลและ Storage

เมื่อเริ่มเชื่อมข้อมูลจริง ให้เพิ่ม domain API client ใน `src/services/` และหน้า Pages Functions ตามแผน File Management ห้ามใส่ Storage secrets ใน frontend หรือสร้าง Garage endpoint เฉพาะ UI ต้องเรียก unified Storage API ที่ server ตรวจ session, ownership และ capabilities ก่อนส่งต่อ

IssueDesk เชื่อมกับ Shared Storage Service แยกต่างหาก; source ของ Service ใช้ SQLite สำหรับ metadata และ S3-compatible API สำหรับ object bytes โดย Garage เป็น provider หลัง service ในการตั้งค่าปัจจุบัน แต่ checkout นี้ไม่ได้ยืนยัน remote Garage/QNAP availability. Nexora ต้องมี metadata database แยก และยึดผล audit/proposal ใน `docs/STORAGE_API_AUDIT.md`, `docs/STORAGE_ARCHITECTURE.md` กับ `docs/STORAGE_API_V1_PROPOSAL.md` ก่อนเริ่ม integration

## Phases

- **Phase 1 — Audit:** ตรวจ Nexora, IssueDesk และ Shared Storage API แล้ว
- **Phase 2 — Foundation:** เพิ่ม Liquid Glass tokens/utilities, theme behavior และปรับ UI primitives
- **Phase 3 — App Layout:** เพิ่ม shared layout, sidebar/header routes, mobile drawer และ Button hover แบบ IssueDesk
- **Phase 4 — File Browser:** toolbar, URL breadcrumbs, search/sort, list/grid, selection, context actions, local preview/download และ demo interactions — เสร็จใน frontend
- **Phase 5 — Remaining Pages:** Dashboard, Recent, Favorites, Shared, Trash, Storage และ Settings ในขอบเขต frontend/demo — เสร็จ
- **Phase 6 — Polish:** labels และ focus ที่ keyboard/screen reader ใช้ได้, validation ชื่อซ้ำ, select-all บนมือถือ, breadcrumb เลื่อนบนจอแคบ, upload progress semantics และ reduced-motion support — เสร็จใน frontend; ไม่มี network loading/error states เพราะยังไม่มี API
- **Phase 7 — Validation & Storage Proposal:** `pnpm lint` และ `pnpm build` ผ่าน; ตรวจทุก route และหลาย workflow ใน in-app browser ที่ mobile-size, สลับธีม Light/Dark/System ได้; desktop browser, upload file chooser, permanent delete, reduced-motion OS override และ console log ยังไม่ได้ยืนยัน — ทำ source audit และเอกสาร proposal ครบ แต่ยังไม่ implement backend
- **UI follow-up:** ปรับ Sidebar ให้เต็มความสูงและ responsive, สลับโลโก้ตามสถานะพับ/ขยาย, เพิ่ม Liquid Glass hover ให้รายการ File Browser และปุ่มดาว Favorites แบบกดตรงหน้าไฟล์/โฟลเดอร์; ตรวจ interaction และ List/Grid/เมนู Sidebar บนหน้าจอมือถือแล้ว ส่วน desktop/console และ QA ที่ค้างให้ดูใน [`PROJECT_HANDOFF.md`](PROJECT_HANDOFF.md)
- **Storage API implementation:** แยก approval/แผน backend จาก UI; ปัจจุบันยังไม่มี endpoint implementation ใน Nexora

## Coding conventions

ใช้ `cx()` สำหรับ `className` ทุก JSX ที่สร้างหรือแก้ โดยส่ง string/falsy values; helper นี้ไม่ merge Tailwind conflicts อย่าคัดลอก business logic จาก IssueDesk และให้เอกสารนี้ตรงกับ source/config ปัจจุบันเสมอ
