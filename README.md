# Nexora

Nexora เป็นเว็บจัดการไฟล์บน private cloud โดยใช้ **React + Vite + Tailwind CSS v4 + React Router 7** และ Base UI components เป้าหมายด้านภาพและการจัดวางใช้ IssueDesk เป็น reference ส่วนข้อมูลและ business logic ยังเป็นของ Nexora

## Shared Storage S1/S2 and Nexora Phase 8

Shared Storage ใน checkout แยก `issuedesk/garage/storage/` มี File Manager API `/v3`, metadata สำหรับ folder/file, pagination, copy, Trash/restore/permanent delete และ operation state. S1/S2 tests 27/27 ผ่าน; migration ยังไม่ได้ apply กับ service runtime และไม่มี production verification. Nexora Phase 8 เพิ่ม Pages Functions, D1 schema, session auth และ same-origin `/api/storage/v1/*`; `FilesProvider` ยังใช้ demo state จนถึง Phase 9. ดู [S1](docs/STORAGE_PHASE_S1.md), [S2](docs/STORAGE_PHASE_S2.md), [Phase 8](docs/PHASE_8.md)

## สถานะปัจจุบัน

Frontend ทำงานด้วยข้อมูลตัวอย่างในหน่วยความจำ: เปิดโฟลเดอร์และย้อนผ่าน URL breadcrumbs, ค้นหา/เรียงรายการ, สลับ List/Grid, เลือกหลายรายการ, สร้าง/เปลี่ยนชื่อ/ย้ายไป Trash, restore/permanent delete, ทำเครื่องหมาย Favorites และดู Recent, Dashboard และ sharing records ตัวอย่างได้ ไฟล์ตัวอย่างมีเฉพาะ metadata; preview และ download ใช้ได้กับไฟล์ที่เลือกจากเครื่องและอยู่ใน session เท่านั้น

File Browser มีปุ่มรูปดาวสำหรับเพิ่ม/นำรายการออกจาก Favorites อยู่หน้าสัญลักษณ์ไฟล์หรือโฟลเดอร์ กดได้โดยตรงโดยไม่ต้องเปิดเมนู Actions; สถานะยังเป็น demo ใน memory และหายเมื่อ refresh เช่นเดิม Sidebar ใช้โลโก้เต็มเมื่อขยายและโลโก้ย่อเมื่อพับ พร้อมรองรับเมนูบนจอเล็ก

ข้อมูลจาก `src/data/files.js` เป็น fixture; frontend ยังไม่เรียก API และสถานะ files, Recent, Favorites, Trash และ upload demo อยู่ใน memory และหายเมื่อ refresh. Phase 8 มี auth/API ฝั่ง server. Production D1, Shared Storage app/project/access token และ secrets ได้รับการ provision และทดสอบตามที่ operator ยืนยัน; frontend ยังไม่เชื่อม mount/API. ไฟล์ที่อัปโหลดจากหน้าเว็บยังไม่ถูกส่งไป Garage/QNAP; ธีมเป็นการตั้งค่าฝั่ง browser และเก็บแยกใน localStorage

Dashboard, Recent, Favorites และ Trash ใน UI ยังใช้ข้อมูล demo ร่วมกับ File Browser; Shared แสดง fixture ส่วน Storage แสดงว่า provider ยังไม่เชื่อม. Phase 8 backend มี Favorites/Recent API แต่ UI ยังไม่เรียกใช้. Share, permissions, cross-device download, live capacity และ provider operations ยังไม่เปิดใน UI; ปุ่ม Share จึงปิดไว้

## เริ่มใช้งาน

ต้องติดตั้ง dependencies ของโปรเจกต์ด้วย `pnpm install` ก่อน:

```bash
pnpm dev
pnpm lint
pnpm build
pnpm preview
```

`pnpm preview` build ก่อนเปิด `wrangler pages dev`; `pnpm test` รัน backend/provisioning tests ใน memory; `pnpm db:migrate:local` apply เฉพาะ local D1; `pnpm admin:create:local` สร้าง admin ผ่านคำสั่ง local เดิม. `pnpm admin:create:remote` และ `pnpm storage:mount:create:remote` เป็น production write ที่ operator ต้องสั่งเองหลังยืนยัน environment และ D1 target; อ่าน [คู่มือ provisioning](docs/PRODUCTION_PROVISIONING.md). `pnpm deploy` ทำการ deploy จริงและไม่ได้ใช้ในงานนี้

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
functions/
├── api/[[path]].js   # Cloudflare Pages API routes
└── _lib/             # server-only auth, authorization, Storage adapter
migrations/           # Nexora-owned D1 SQL migrations
scripts/              # local-only admin provisioning
tests/                # backend security/contract tests
```

Pages ใช้ `AppLayout` ร่วมกับ `AppShell` และ `<Outlet />` เพื่อให้สถานะ navigation อยู่ต่อระหว่างเปลี่ยน route `FilesProvider` เก็บ demo files, favorites, recents และ trash ระหว่างเปลี่ยน route; `useFiles` จัดการ folder/search/view state และ local operations ส่วน `useUploadQueue` จำลอง progress และเพิ่ม browser `File` เข้า memory เท่านั้น การตั้งค่า design system อยู่ใน `src/index.css` และอธิบายใน [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md)

รายการงานถัดไป, Storage/API guardrails และ acceptance criteria อยู่ใน [`PROJECT_HANDOFF.md`](PROJECT_HANDOFF.md)

ผลตรวจ frontend, source audit, API contract, Phase 8 implementation และ provisioning CLI อยู่ใน [`docs/STORAGE_API_AUDIT.md`](docs/STORAGE_API_AUDIT.md), [`docs/STORAGE_ARCHITECTURE.md`](docs/STORAGE_ARCHITECTURE.md), [`docs/STORAGE_API_V1_PROPOSAL.md`](docs/STORAGE_API_V1_PROPOSAL.md), [`docs/PHASE_8.md`](docs/PHASE_8.md) และ [`docs/PRODUCTION_PROVISIONING.md`](docs/PRODUCTION_PROVISIONING.md). CLI ผ่าน local validation; ไม่มี remote write ในการพัฒนาหรือตรวจครั้งนี้

## แนวทางข้อมูลและ Storage

Phase 8 เพิ่ม Pages Functions และ same-origin Storage API แล้ว; Phase 9 จึงเพิ่ม domain API client ใน `src/services/` และเชื่อม File Browser. ห้ามใส่ Storage secrets ใน frontend หรือเรียก Garage โดยตรง; server ตรวจ session, mount ownership และ capabilities ก่อนส่งต่อ Shared Storage `/v3`

IssueDesk เชื่อมกับ Shared Storage Service แยกต่างหาก; source ของ Service ใช้ SQLite สำหรับ metadata และ S3-compatible API สำหรับ object bytes โดย Garage เป็น provider หลัง service ในการตั้งค่าปัจจุบัน แต่ checkout นี้ไม่ได้ยืนยัน remote Garage/QNAP availability. Nexora ต้องมี metadata database แยก และยึดผล audit/proposal ใน `docs/STORAGE_API_AUDIT.md`, `docs/STORAGE_ARCHITECTURE.md` กับ `docs/STORAGE_API_V1_PROPOSAL.md` ก่อนเริ่ม integration

## Phases

- **Phase 1 — Audit:** ตรวจ Nexora, IssueDesk และ Shared Storage API แล้ว
- **Phase 2 — Foundation:** เพิ่ม Liquid Glass tokens/utilities, theme behavior และปรับ UI primitives
- **Phase 3 — App Layout:** เพิ่ม shared layout, sidebar/header routes, mobile drawer และ Button hover แบบ IssueDesk
- **Phase 4 — File Browser:** toolbar, URL breadcrumbs, search/sort, list/grid, selection, context actions, local preview/download และ demo interactions — เสร็จใน frontend
- **Phase 5 — Remaining Pages:** Dashboard, Recent, Favorites, Shared, Trash, Storage และ Settings ในขอบเขต frontend/demo — เสร็จ
- **Phase 6 — Polish:** labels และ focus ที่ keyboard/screen reader ใช้ได้, validation ชื่อซ้ำ, select-all บนมือถือ, breadcrumb เลื่อนบนจอแคบ, upload progress semantics และ reduced-motion support — เสร็จใน frontend; ไม่มี network loading/error states เพราะยังไม่มี API
- **Phase 7 — Validation & Storage Proposal:** `pnpm lint` และ `pnpm build` ผ่าน; ตรวจทุก route และหลาย workflow ใน in-app browser ที่ mobile-size, สลับธีม Light/Dark/System ได้; desktop browser, upload file chooser, permanent delete, reduced-motion OS override และ console log ยังไม่ได้ยืนยัน — ทำ source audit และเอกสาร proposal ครบ แต่ยังไม่ implement backend
- **Phase 8 — Backend Foundation:** Pages Functions, D1 schema, session auth, mount ownership, server-only Shared Storage `/v3` client, `/api/storage/v1/*`, Favorites/Recent persistence และ backend tests เสร็จ; frontend demo ไม่ได้เปลี่ยน
- **UI follow-up:** ปรับ Sidebar ให้เต็มความสูงและ responsive, สลับโลโก้ตามสถานะพับ/ขยาย, เพิ่ม Liquid Glass hover ให้รายการ File Browser และปุ่มดาว Favorites แบบกดตรงหน้าไฟล์/โฟลเดอร์; ตรวจ interaction และ List/Grid/เมนู Sidebar บนหน้าจอมือถือแล้ว ส่วน desktop/console และ QA ที่ค้างให้ดูใน [`PROJECT_HANDOFF.md`](PROJECT_HANDOFF.md)
- **Production provisioning CLI:** เพิ่มคำสั่ง admin และ Storage mount แบบ explicit `--remote`, tests แบบไม่ต่อ remote และคู่มือ operator; production infra/migrations/secrets ตาม operator ยืนยันแล้ว แต่ CLI ไม่ได้ใช้สร้าง records. Frontend ยังเป็น demo จนถึง Phase 9

## Coding conventions

ใช้ `cx()` สำหรับ `className` ทุก JSX ที่สร้างหรือแก้ โดยส่ง string/falsy values; helper นี้ไม่ merge Tailwind conflicts อย่าคัดลอก business logic จาก IssueDesk และให้เอกสารนี้ตรงกับ source/config ปัจจุบันเสมอ
