# Nexora

Nexora เป็นเว็บจัดการไฟล์บน private cloud โดยใช้ **React + Vite + Tailwind CSS v4 + React Router 7** และ Base UI components เป้าหมายด้านภาพและการจัดวางใช้ IssueDesk เป็น reference ส่วนข้อมูลและ business logic ยังเป็นของ Nexora.

## Nexora v1 — Feature Complete

ขอบเขต v1 ครอบคลุม authentication แบบ admin-provisioned, connected File Browser และ lifecycle, Favorites/Recent/Bulk operations, public read/download shares, Activity, Dashboard/Storage และ operational backup/recovery runbook. Package version ปัจจุบันคือ `1.0.0`. ดู capability, production boundary, limitations และ deferred roadmap ที่ [V1 Release Baseline](docs/V1_RELEASE.md). “Feature Complete” หมายถึง scope ใน source; ไม่ได้ยืนยัน production deployment หรือ recovery drill.

ธีม Dark ใช้พื้นหลังดำอมฟ้า `#090d12` พร้อมสีเน้นมินต์; Light mode คงชุดสีเดิมไว้

## Shared Storage S1/S2 and Nexora Phase 8

Shared Storage ใน checkout แยก `issuedesk/garage/storage/` มี File Manager API `/v3`, metadata สำหรับ folder/file, pagination, copy, Trash/restore/permanent delete และ operation state. S1/S2 local tests 27/27 ผ่าน; Phase 9.1 brief ที่ผู้ใช้ให้มารายงานว่า S1/S2 deploy แล้ว และ production `/v3` capabilities คืน HTTP 200. รายงาน S2 เก่ายังสะท้อน snapshot ก่อนยืนยันนั้น. Nexora Phase 8 เพิ่ม Pages Functions, D1 schema, session auth และ same-origin `/api/storage/v1/*`; Phase 9.5 เชื่อม Dashboard/Recent กับ mount และ `recent_access` เดิม Phase 9.6 เพิ่ม persistent public sharing (local implementation). ดู [S1](docs/STORAGE_PHASE_S1.md), [S2](docs/STORAGE_PHASE_S2.md), [Phase 8](docs/PHASE_8.md), [Phase 9.5](docs/PHASE_9_5.md)

## สถานะปัจจุบัน

Phase 10.0 Production Readiness **ผ่านตาม operator confirmation วันที่ 2026-10-28**: production domain, login/Files/Storage, Upload/Download/Preview/Rename/Move/Copy และ Public Share/Activity ผ่าน; operator ยืนยัน D1 `nexora-db` มี migrations 0001–0003 ครบ. ผลนี้เป็น operator-confirmed ไม่ใช่ tool-verified. Work ตรวจ Cloudflare/โดเมน production โดยตรงไม่ได้เพราะ DNS/network จึงยังไม่ทราบ deployment revision, binding presence และ Access policy; ข้อจำกัดนี้ไม่ใช่หลักฐานว่า production outage. ดู [Phase 10.0.1](docs/PHASE_10_0_1.md), [Phase 10.0](docs/PHASE_10_0.md) และ [Phase 10.1 Security Finalization](docs/PHASE_10_1.md).

Phase 10.1.1 — Production Security Gates เป็น read-only audit. Operator ยืนยันเมื่อ 2026-10-28 ว่าหลัง CSP fix ได้ตรวจและทดสอบทุกฟังก์ชัน production แล้วทำงานปกติ; ผลนี้เป็น operator-confirmed ไม่ใช่ tool-verified. Historical Garage RPC secret เคยอยู่ใน IssueDesk Git history แต่ยังไม่ทราบว่าใช้ใน production หรือไม่; Compose publish พอร์ต Storage API/Garage บน host interfaces แต่ public reachability ยังไม่ทราบ. Cloudflare rate limits, capability-path log redaction และ production Access/bindings/headers ยังเป็น MUST operator gates. ไม่มี runtime หรือ infrastructure เปลี่ยน; ดู [รายงาน Phase 10.1.1](docs/PHASE_10_1_1.md).

File Browser แสดงรายการจริงจาก mount ที่เลือกผ่าน Nexora same-origin API, เปิดโฟลเดอร์และ breadcrumb ด้วย logical object IDs, โหลดหน้าถัดไป, ค้นหา/เรียงรายการที่โหลดแล้ว, สลับ List/Grid และเลือกหลายรายการได้. ปุ่มเปิดโฟลเดอร์ใน Recent และ Favorites จะนำทางไป `/files` พร้อม logical folder ID และ breadcrumb state; แถวไฟล์มีปุ่มเปิดโฟลเดอร์ที่บรรจุไฟล์เมื่อมี parent ID. Recent และ Dashboard Recent เปิด preview ผ่าน shared dialog และซ่อนปุ่ม Preview สำหรับชนิดไฟล์ที่ไม่รองรับหรือไฟล์ที่เกินขนาดที่กำหนด. Listing cache อยู่ในหน่วยความจำของ authenticated app session, จำกัด 60 folders, ใช้ TTL 20 วินาที และแสดง stale rows ระหว่าง background revalidation. Refresh บังคับอ่านข้อมูลจริง; pagination ใช้ cursor ต่อเนื่องและ reset หน้าถัดไปเมื่อ first-page cursor เปลี่ยน. Search ครอบคลุมเฉพาะรายการที่โหลดแล้ว.

หน้าต่าง Copy/Move รองรับสร้างโฟลเดอร์ปลายทางเมื่อมีสิทธิ์ โดยปุ่ม New folder อยู่ด้านล่างซ้ายในแถวเดียวกับ Cancel. File Browser แสดงไอคอนตามชนิดไฟล์รูปภาพ วิดีโอ ข้อความ และ PDF ใน list/grid และรองรับ upload, download, rename, move, copy, on-demand preview, Favorite และ Move to Trash ผ่าน Nexora same-origin API เมื่อ mount และ capability อนุญาต. ผู้ใช้ยืนยันว่า Phase 9.3 operations รวม Copy ผ่าน production แล้ว; Phase 9.3.1–9.7 ใน checkout นี้ตรวจจาก source และ local validation เท่านั้น จนกว่าจะมี production QA แยก. Upload queue ทำงานพร้อมกันได้ 2 รายการ รองรับ Retry และ Cancel, ล้างรายการที่สำเร็จอัตโนมัติหลัง 5 วินาที และไม่แสดง progress ปลอม; download ใช้ streamed attachment response. Multi-selection รองรับ Bulk Move และ Bulk Move to Trash แบบ partial success โดยจำกัด 2 mutations พร้อมกัน. Preview แยก endpoint จาก download, ใช้ download capability โดยไม่เปลี่ยน provider `preview:false`, อนุญาตเฉพาะ image/PDF/text ที่ปลอดภัย และจำกัดข้อความที่ 1 MiB. Trash page แสดงข้อมูลจริงจาก active mount พร้อม cursor pagination, Restore และ Permanent Delete; Permanent Delete ต้องยืนยันใน dialog และใช้ได้จาก Trash เท่านั้น. Favorites ใช้ D1/API ที่ผูก user, mount และ logical object ID. Phase 9.5 ใช้ Recent upsert/hydration จาก D1/API เดิม และ Dashboard แสดง active mount, usage ที่รายงานจริง (หรือ “Not reported”) กับ Recent 6 รายการ; metrics ยัง “Not reported” เพราะ Nexora usage API ไม่มี authoritative aggregate source. Shared ใช้ D1-backed public links ใน Phase 9.6. Header กว้างเต็มหน้าจอและ Sidebar desktop เริ่มใต้ Header โดยใช้โลโก้เต็มเมื่อขยายและโลโก้ย่อเมื่อพับ พร้อมรองรับเมนูบนจอเล็ก

frontend ใช้ `/api/auth/*`, `/api/storage/v1/*`, `/api/shares` และ capability-scoped `/api/public/shares/*` ผ่าน Nexora same-origin API เท่านั้น; ไม่เรียก Shared Storage/Garage โดยตรง. Phase 10.1 เพิ่ม app/API security headers และ restrictive CSP. Production browser inspection พบว่า inline bootstrap มาจาก Cloudflare JavaScript Detections (`/cdn-cgi/challenge-platform/scripts/jsd/main.js`); source middleware สร้าง CSP nonce ใหม่สำหรับแต่ละ HTML response เพื่อให้ Cloudflare อนุญาต script ที่ inject โดยไม่ใช้ `unsafe-inline` หรือ hash ที่เปลี่ยนตาม request. Source fix ยังเป็น local และต้อง deploy แล้วตรวจ browser production. ดู [Phase 10.1](docs/PHASE_10_1.md). ผู้ใช้ยืนยัน production smoke tests ของ Phase 9.2/9.3 ผ่าน รวมถึง Cloudflare redirect fix และ Copy fix. Phase 9.7 local checks `pnpm lint`, `pnpm test` (118/118), Vite runner build และ `git diff --check` ผ่าน; bulk/upload browser QA และ production metrics/behavior ยังไม่ได้ตรวจ. Phase 9.8 เพิ่ม persistent authenticated Activity สำหรับ successful file/share mutations, owner-scoped cursor API และหน้า `/activity`; Local Phase 9.8 lint/test (125/125)/build/diff checks ผ่าน; browser QA และ production migration/deploy ยังไม่ได้ทำ. ดู [Phase 9.8](docs/PHASE_9_8.md). Storage usage เป็น “Not reported” จนกว่าจะมี authoritative aggregate metrics. ดู [Phase 9.3.1](docs/PHASE_9_3_1.md), [Phase 9.3.2](docs/PHASE_9_3_2.md), [Phase 9.4](docs/PHASE_9_4.md), [Phase 9.4.1](docs/PHASE_9_4_1.md), [Phase 9.5](docs/PHASE_9_5.md), [Phase 9.6](docs/PHASE_9_6.md), และ [Phase 9.7](docs/PHASE_9_7.md).

## เริ่มใช้งาน

ต้องติดตั้ง dependencies ของโปรเจกต์ด้วย `pnpm install` ก่อน:

```bash
pnpm dev
pnpm lint
pnpm build
pnpm preview
```

`pnpm preview` build ก่อนเปิด `wrangler pages dev`; `pnpm test` รัน backend, auth-client และ provisioning logic tests ใน memory; `pnpm db:migrate:local` apply เฉพาะ local D1; `pnpm admin:create:local` สร้าง admin ผ่านคำสั่ง local เดิม. `pnpm admin:create:remote` และ `pnpm storage:mount:create:remote` เป็น production write ที่ operator ต้องสั่งเองหลังยืนยัน environment และ D1 target; อ่าน [คู่มือ provisioning](docs/PRODUCTION_PROVISIONING.md). `pnpm deploy` ทำการ deploy จริงและไม่ได้ใช้ในงานนี้

## โครงสร้าง

```text
src/
├── components/
│   ├── files/       # toolbar, breadcrumbs, list/grid, dialogs, preview
│   ├── layout/      # AppShell, Sidebar, Header
│   ├── navigation/  # route/navigation metadata
│   └── ui/          # Base UI components และ variants
├── data/            # demo fixtures สำหรับตัวอย่าง legacy เท่านั้น
├── context/         # auth, storage connection state, demo และ remote file browser state
├── hooks/           # auth/storage hooks, demo state, remote browser state และ upload queue
├── services/        # same-origin auth, storage discovery, object listing และ folder creation clients
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

Pages ใช้ `AppShell` ครอบ `<Outlet />` โดยตรงเพื่อให้สถานะ navigation อยู่ต่อระหว่างเปลี่ยน route. `SharesProvider` เก็บสถานะ public links และ secret ในหน่วยความจำของ authenticated session; `/shared` ไม่ใช้ fixture. `FilesProvider` ยังมี legacy demo helpers; Dashboard/Recent ใช้ `recent_access` และ StorageProvider ส่วน Favorites, File Browser และ Trash ใช้ Nexora API/D1 state. `useRemoteFilesState` กับ `src/services/storage.js` เรียก Nexora API สำหรับ listing/pagination/folder operations, Favorites, Recent และ Trash lifecycle. Query `folder` ใช้ logical object ID; ชื่อ breadcrumb อยู่ใน React Router history state. Upload queue ส่ง bytes ผ่าน Nexora API โดยไม่รายงาน progress ที่ไม่ได้วัด. การตั้งค่า design system อยู่ใน `src/index.css` และอธิบายใน [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md)

รายการงานถัดไป, Storage/API guardrails และ acceptance criteria อยู่ใน [`PROJECT_HANDOFF.md`](PROJECT_HANDOFF.md)

ผลตรวจ frontend, source audit, API contract, phase implementation และ provisioning CLI อยู่ใน [`docs/STORAGE_API_AUDIT.md`](docs/STORAGE_API_AUDIT.md), [`docs/STORAGE_ARCHITECTURE.md`](docs/STORAGE_ARCHITECTURE.md), [`docs/STORAGE_API_V1_PROPOSAL.md`](docs/STORAGE_API_V1_PROPOSAL.md), [`docs/PHASE_8.md`](docs/PHASE_8.md), [`docs/PHASE_8_5.md`](docs/PHASE_8_5.md), [`docs/PHASE_9_1.md`](docs/PHASE_9_1.md), [`docs/PHASE_9_2.md`](docs/PHASE_9_2.md), [`docs/PHASE_9_3.md`](docs/PHASE_9_3.md), [`docs/PHASE_9_3_1.md`](docs/PHASE_9_3_1.md), [`docs/PHASE_9_3_2.md`](docs/PHASE_9_3_2.md), [`docs/PHASE_9_4.md`](docs/PHASE_9_4.md), [`docs/PHASE_9_4_1.md`](docs/PHASE_9_4_1.md), [`docs/PHASE_9_5.md`](docs/PHASE_9_5.md), [`docs/PHASE_9_6.md`](docs/PHASE_9_6.md), และ [`docs/PRODUCTION_PROVISIONING.md`](docs/PRODUCTION_PROVISIONING.md). Phase 8.5 ใช้ local mock สำหรับ UI; operator รายงาน production login smoke test และ password logging issue แต่ source ปัจจุบันยังระบุ origin ของ production log ไม่ได้

## แนวทางข้อมูลและ Storage

Phase 8 เพิ่ม Pages Functions และ same-origin Storage API; Phase 9.1 เพิ่ม mount discovery และ Phase 9.2 เชื่อม File Browser สำหรับ listing/navigation/folder creation ผ่าน `src/services/storage.js`. ห้ามใส่ Storage secrets ใน frontend หรือเรียก Garage โดยตรง; server ตรวจ session, mount ownership และ capabilities ก่อนส่งต่อ Shared Storage `/v3`

IssueDesk เชื่อมกับ Shared Storage Service แยกต่างหาก; source ของ Service ใช้ SQLite สำหรับ metadata และ S3-compatible API สำหรับ object bytes โดย Garage เป็น provider หลัง service ในการตั้งค่าปัจจุบัน แต่ checkout นี้ไม่ได้ยืนยัน remote Garage/QNAP availability. Nexora ต้องมี metadata database แยก และยึดผล audit/proposal ใน `docs/STORAGE_API_AUDIT.md`, `docs/STORAGE_ARCHITECTURE.md` กับ `docs/STORAGE_API_V1_PROPOSAL.md` ก่อนเริ่ม integration

## Phases

- **Phase 1 — Audit:** ตรวจ Nexora, IssueDesk และ Shared Storage API แล้ว
- **Phase 2 — Foundation:** เพิ่ม Liquid Glass tokens/utilities, theme behavior และปรับ UI primitives
- **Phase 3 — App Layout:** เพิ่ม shared layout, sidebar/header routes, mobile drawer และ Button hover แบบ IssueDesk
- **Phase 4 — File Browser:** toolbar, URL breadcrumbs, search/sort, list/grid, selection, context actions, local preview/download และ demo interactions — เสร็จใน frontend
- **Phase 5 — Remaining Pages:** Dashboard, Recent, Favorites, Shared, Trash, Storage และ Settings ในขอบเขต frontend/demo — เสร็จ
- **Phase 6 — Polish:** labels และ focus ที่ keyboard/screen reader ใช้ได้, validation ชื่อซ้ำ, select-all บนมือถือ, breadcrumb เลื่อนบนจอแคบ, upload progress semantics และ reduced-motion support — เสร็จใน frontend
- **Phase 7 — Validation & Storage Proposal:** `pnpm lint` และ `pnpm build` ผ่าน; ตรวจทุก route และหลาย workflow ใน in-app browser ที่ mobile-size, สลับธีม Light/Dark/System ได้; desktop browser, upload file chooser, permanent delete, reduced-motion OS override และ console log ยังไม่ได้ยืนยัน — ทำ source audit และเอกสาร proposal ครบ แต่ยังไม่ implement backend
- **Phase 8 — Backend Foundation:** Pages Functions, D1 schema, session auth, mount ownership, server-only Shared Storage `/v3` client, `/api/storage/v1/*`, Favorites/Recent persistence และ backend tests เสร็จ; frontend demo ไม่ได้เปลี่ยน
- **UI follow-up:** ปรับ Sidebar ให้เต็มความสูงและ responsive, สลับโลโก้ตามสถานะพับ/ขยาย, ให้ NavLink ใน Sidebar ใช้ Liquid Glass hover แบบเดียวกับปุ่ม Collapse ใน Light/Dark และเพิ่ม hover ให้รายการ File Browser กับการ์ด demo Recent/Favorites; glass effect ของ shared Button ใช้สีตัวอักษรเพื่อให้เห็นทั้งบนปุ่มพื้นขาวและพื้นเข้ม. File Browser Favorites action ถูกปิดหลังเชื่อม mount ใน Phase 9.2; ดูผล QA ตาม phase ใน [`PROJECT_HANDOFF.md`](PROJECT_HANDOFF.md)
- **Production provisioning CLI:** เพิ่มคำสั่ง admin และ Storage mount แบบ explicit `--remote`, tests แบบไม่ต่อ remote และคู่มือ operator; production infra/migrations/secrets ตาม operator ยืนยันแล้ว แต่ CLI ไม่ได้ใช้สร้าง records. Frontend ยังเป็น demo จนถึง Phase 9
- **Phase 8.5 — Frontend Authentication:** เพิ่ม AuthProvider, useAuth, session bootstrap, protected workspace routes, login/logout และ identity ใน Header; security follow-up ปรับการเก็บ password ระหว่าง login, error allowlist, tests ป้องกันข้อมูลลับรั่วใน response/logs และใช้ PBKDF2 100,000 รอบร่วมกัน. ดู [รายงาน Phase 8.5](docs/PHASE_8_5.md)
- **Phase 9.1 — Storage Client + Mount Integration:** เพิ่ม same-origin storage client, authenticated StorageProvider/useStorage, safe mount discovery, capability/usage state, session-expiry handling และ connection summary ใน Storage page; ตอนจบ 9.1 File Browser ยังเป็น demo. ดู [รายงาน Phase 9.1](docs/PHASE_9_1.md)
- **Phase 9.2 — Real File Listing + Folder Navigation:** File Browser ใช้ authenticated Nexora API สำหรับ real object listing, cursor pagination, folder navigation/breadcrumbs, refresh/search/sort ของรายการที่โหลดแล้ว และ create-folder ตาม capability. Production smoke test ผ่านตามที่ผู้ใช้ยืนยันหลังเปลี่ยน Workers fetch เป็น `redirect: 'manual'` และปิดกั้น redirect ข้าม origin. ดู [รายงาน Phase 9.2](docs/PHASE_9_2.md)
- **Phase 9.3 — Real File Operations:** File Browser เพิ่ม upload/download/rename/move/copy ด้วย Nexora same-origin endpoints, server-side capability enforcement, streamed upload/download, queue concurrency 2 และ destination picker. รายงานเดิมบันทึก Copy HTTP 502 incident; brief ผู้ใช้วันที่ 2026-10-27 ภายหลังยืนยันว่า Copy fix และทุก Phase 9.3 operation ผ่าน production. ดู [รายงาน Phase 9.3](docs/PHASE_9_3.md)
- **Phase 9.3.2 — On-Demand Preview and Breadcrumb Fix:** breadcrumb ไป ancestor ที่เลือกโดยตรงและคง route/cache state; preview โหลดเฉพาะเมื่อกด Preview ผ่าน authenticated inline endpoint ที่ใช้ `download` capability ไม่อ้าง provider preview, จำกัด text 1 MiB และรองรับ safe image/PDF/text. Listing cache เก็บ metadata เท่านั้น; Trash และ Phase 9.4 ยังอยู่นอก scope. ดู [รายงาน Phase 9.3.2](docs/PHASE_9_3_2.md)
- **Phase 9.4.1 — Selection Toolbar and Favorites:** toolbar ใช้ selection เดียวกับ row actions สำหรับ preview/favorite/copy/move/Move to Trash; Favorites เชื่อม D1 route เดิมและแสดง metadata จริงจาก storage. ดู [รายงาน Phase 9.4.1](docs/PHASE_9_4_1.md)
- **Phase 9.3.1 — Performance & Caching:** bounded session-memory listing cache, 20-second freshness, cursor-aware dedupe, stale-while-revalidate, selective mutation invalidation, and public breadcrumb metadata. See [implementation report](docs/PHASE_9_3_1.md).
- **Phase 9.3.2 — On-Demand Preview & Breadcrumb Fix:** exact ancestor navigation plus safe image/PDF/text previews through an authenticated inline endpoint. Text is capped at 1 MiB; provider `preview:false` remains unchanged. See [implementation report](docs/PHASE_9_3_2.md).

## Coding conventions

ใช้ `cx()` สำหรับ `className` ทุก JSX ที่สร้างหรือแก้ โดยส่ง string/falsy values; helper นี้ไม่ merge Tailwind conflicts อย่าคัดลอก business logic จาก IssueDesk และให้เอกสารนี้ตรงกับ source/config ปัจจุบันเสมอ

แนวทางทำงานของ Codex สำหรับ repo นี้อยู่ใน [`AGENTS.md`](AGENTS.md) และ [Nexora project skill](.agents/skills/nexora/SKILL.md).

## Phase 9.6 — Public links (local implementation)

File Browser มี Share ในเมนูรายการและ toolbar เมื่อเลือกหนึ่งรายการ; `/shared` อ่าน persistent records จาก D1 พร้อม bounded hydration/pagination, แสดง Copy/Open ต่อไปตราบใดที่ลิงก์ยังไม่หมดอายุและ secret ยังอยู่ใน memory, Manage/Replace/Revoke และ Open in Files. หน้า `/s/:shareId/:secret` แยกจาก auth/workspace รองรับ metadata, direct-child folder browsing, Preview และ streamed Download; ไม่มีสิทธิ์เขียนหรือ private sharing.

Migrations คือ `migrations/0002_public_shares.sql` และ `migrations/0004_public_share_expiry.sql` (ยังไม่ได้ apply production). ตอนสร้าง/เปลี่ยนลิงก์ เลือกหมดอายุได้ 1 ชั่วโมง, 1 วัน, 1 เดือน (30 วัน), หรือตลอดไป; public API ปฏิเสธลิงก์หมดอายุ. Token ใช้ random 256 bits และเก็บ SHA-256 hash เท่านั้น ผู้ใช้เลือกแนวทางให้ Copy/Open ใช้ secret ใน memory; หลัง refresh ให้ยืนยัน **Replace link** เพื่อออก secret ใหม่และหยุดลิงก์เก่า ไม่มีการเก็บ token ใน localStorage/sessionStorage หรือฐานข้อมูลแบบ plaintext.

Local checks: `pnpm lint`, `pnpm test` (117/117), `pnpm build`, `git diff --check` ผ่าน. ตรวจผ่าน in-app browser ด้วย D1 ในหน่วยความจำ/Storage จำลอง: Share file/folder, Copy, Preview, Download, Replace/Revoke, Shared/Open in Files, nested public navigation และ mobile 390 × 844 (ไม่ล้นแนวนอน); ไม่ใช่ production QA. ดูขอบเขตและ checklist ใน [Phase 9.6](docs/PHASE_9_6.md). ยังไม่ได้ deploy หรือ apply migration บน production.


## Phase 9.8 — Activity & Audit Log

เพิ่ม D1 migration `0003_activity_events.sql`, server-side best-effort logging หลัง successful authenticated file/Favorites/share mutations และหน้า protected `/activity` พร้อม refresh/load-more. API ใช้ session owner, cursor pagination, default 50/max 100; retention จำกัด 500 events/user และ 180 วัน. Bulk Move/Trash ยังคงบันทึกแยกต่อ object จาก single-object routes ไม่มี batch event. Browser QA และ production migration/deployment ยังไม่ได้ทำ. รายละเอียดและผล validation อยู่ใน [docs/PHASE_9_8.md](docs/PHASE_9_8.md).


## Phase 9.9 — Backup & Recovery

Added a source-derived data inventory and operator runbook for D1, Storage API SQLite, Garage metadata/object data, retention, checksums, restore order and validation. No backup/restore, QNAP, Docker, remote D1, deployment, or secret operation was run. The audit documents high findings in the adjacent IssueDesk checkout (tracked Garage RPC secret and tracked runtime SQLite/WAL/SHM artifacts); operator confirmation/remediation is required there. See [Phase 9.9](docs/PHASE_9_9.md) and [Backup & Recovery runbook](docs/BACKUP_RECOVERY.md).


Release baseline: [Nexora v1 — Feature Complete](docs/V1_RELEASE.md). Backup automation, isolated restore drill and production rollout remain operator work.


## File Browser clipboard (local implementation)

The authenticated workspace keeps an in-memory file clipboard for multi-selection Copy and Cut. Paste uses the existing copy or move APIs; copy remains available for repeated paste, while successful cuts are removed and failed items remain. The toolbar supports Copy, Cut, Paste and Rename; selection count and Clear selection appear beside the search and sorting note. Cut items appear faded, the list header labels the Favorites column with a non-interactive star, and clipboard and operation messages can be dismissed individually. Ctrl/Command+C, X and V operate on files outside editable fields; Escape clears the clipboard. Paste requires a ready destination and matching storage; cross-storage transfers are unavailable. Folder cuts reject known descendants and destinations whose ancestry is unavailable. Existing provider errors, including name conflicts and missing items, are reported. The clipboard is discarded on workspace unmount, logout, expiry, account change or reload, and is never persisted.

Local validation: `pnpm lint` and focused clipboard utility tests passed. The full test suite has failing public-share tests (share creation returned HTTP 400 instead of 201); clipboard keyboard, session lifecycle, UI and live-provider flows still need browser/integration QA. No build, deployment, migration or production data changes were performed for this feature.

Activity displays distinct icon colors for Move, Create, Copy, Upload, public-link Replace, and permanent deletion in light and dark themes; action text remains the accessible label.
