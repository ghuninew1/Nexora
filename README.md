# Nexora

Nexora เป็นเว็บจัดการไฟล์สำหรับ private cloud ให้ผู้ใช้จัดระเบียบไฟล์ เข้าถึงรายการล่าสุด และแชร์ไฟล์หรือโฟลเดอร์ผ่านลิงก์ได้จาก workspace เดียว รองรับหน้าจอมือถือและธีม Light / Dark

โปรเจกต์ใช้ React, Vite, Tailwind CSS, React Router และ Cloudflare Pages Functions โดยเก็บข้อมูลบัญชีและ metadata ของ Nexora ใน D1 และเชื่อมต่อ Shared Storage ผ่าน API ฝั่ง server

## ความสามารถ

- **Files:** เรียกดูไฟล์และโฟลเดอร์แบบ List หรือ Grid, ค้นหาและเรียงลำดับรายการที่โหลดแล้ว, สร้างโฟลเดอร์, upload, download, rename, move และ copy ตามสิทธิ์ของ storage
- **Clipboard:** เลือกหลายรายการแล้ว Copy, Cut และ Paste ระหว่างโฟลเดอร์ใน storage เดียวกันได้ ด้วยปุ่มหรือ `Ctrl/⌘ + C`, `Ctrl/⌘ + X`, `Ctrl/⌘ + V` และ `Esc` ข้อมูล clipboard อยู่ในหน่วยความจำของ session เท่านั้น
- **Preview:** เปิดดูรูปภาพ, PDF, ข้อความ และวิดีโอ MP4, WebM หรือ Ogg ที่รองรับได้ตามต้องการ ข้อความจำกัด 1 MiB ส่วนรูปภาพ, PDF และวิดีโอจำกัด 20 MiB วิดีโอต้องโหลดก่อนเล่นและขึ้นอยู่กับ codec ที่ browser รองรับ
- **Favorites และ Recent:** เก็บรายการโปรดและเข้าถึงไฟล์หรือโฟลเดอร์ที่เปิดล่าสุดได้อย่างรวดเร็ว
- **Trash:** ย้ายรายการไป Trash, กู้คืน หรือลบถาวร รวมถึงลบรายการทั้งหมดหลังยืนยัน การลบหลายรายการอาจสำเร็จเพียงบางส่วน
- **Shared:** สร้างลิงก์สาธารณะสำหรับดูและดาวน์โหลดไฟล์หรือโฟลเดอร์ กำหนดวันหมดอายุ เปลี่ยนลิงก์ หรือเพิกถอนได้ และเจ้าของคัดลอกลิงก์ที่ยังใช้ได้จากอุปกรณ์อื่นได้เมื่อเปิดใช้การกู้คืนลิงก์ ผู้รับลิงก์ไม่สามารถแก้ไขไฟล์ผ่านลิงก์นั้น
- **Dashboard และ Activity:** ดูสถานะ storage, รายการล่าสุด และประวัติการเปลี่ยนแปลงที่สำเร็จของบัญชี

ความสามารถของไฟล์ขึ้นอยู่กับสิทธิ์และ capabilities ของ storage ที่เชื่อมต่อ การค้นหาและเรียงลำดับครอบคลุมเฉพาะรายการที่โหลดแล้ว ขนาดรวมของโฟลเดอร์และ storage usage จะแสดงว่าไม่พร้อมใช้งานเมื่อไม่มีข้อมูลจาก provider

## เริ่มต้นพัฒนา

ต้องมี Node.js, pnpm และ dependencies ของโปรเจกต์ จากนั้นติดตั้งและเปิด Vite development server:

```bash
pnpm install
pnpm dev
```

`pnpm dev` เปิด frontend ผ่าน Vite ส่วน API และ D1 ต้องใช้ Cloudflare Pages Functions runtime หากต้องการทดสอบแอปพร้อม Pages Functions ในเครื่อง ให้เตรียม local D1 และรัน:

```bash
pnpm db:migrate:local
pnpm preview
```

`pnpm preview` จะ build ก่อนเปิด Wrangler Pages ในเครื่อง การเข้าสู่ระบบต้องมีบัญชีที่ผู้ดูแลสร้างไว้ คำสั่ง `pnpm admin:create:local` ใช้สร้าง admin ใน local D1; ดูข้อกำหนดตัวแปรและขั้นตอนใน [คู่มือ backend](docs/PHASE_8.md) การเชื่อมต่อ storage ต้องตั้งค่า server-only bindings ตาม [.dev.vars.example](.dev.vars.example) และมี mount ที่ตั้งค่าไว้ การเปิด frontend เพียงอย่างเดียวไม่ได้สร้างบัญชีหรือเชื่อม storage ให้อัตโนมัติ

## คำสั่งที่ใช้บ่อย

| คำสั่ง | การทำงาน |
| --- | --- |
| `pnpm dev` | เปิด Vite สำหรับพัฒนา frontend |
| `pnpm lint` | ตรวจโค้ดด้วย ESLint |
| `pnpm test` | รัน Node tests โดยใช้ in-memory database และ mocked services |
| `pnpm build` | สร้าง production frontend ใน `dist/` |
| `pnpm preview` | Build และเปิด Cloudflare Pages ในเครื่อง |
| `pnpm db:migrate:local` | Apply migrations กับ local D1 |

คำสั่ง `admin:create:remote`, `storage:mount:create:remote` และ `deploy` เปลี่ยน production และต้องได้รับอนุญาตก่อนใช้งาน ดู [คู่มือ production provisioning](docs/PRODUCTION_PROVISIONING.md) ก่อนดำเนินการ

## สถาปัตยกรรม

```text
Browser (React)
    │ same-origin API
    ▼
Cloudflare Pages Functions ── Nexora D1
    │ server-side Storage API
    ▼
Shared Storage Service ── object storage
```

Browser ใช้ Nexora logical IDs และไม่รับ credentials หรือ provider references ส่วน Pages Functions ตรวจ session, ownership และ capabilities ก่อนเรียก Storage Service ซึ่งเป็นระบบแยกจาก Nexora ข้อมูลใน `src/data/files.js` เป็น fixture สำหรับตัวอย่าง legacy เท่านั้น

```text
src/                 React app, pages, components, hooks และ API clients
functions/           Pages Functions, auth และ server-side Storage client
migrations/          Nexora D1 migrations
scripts/             เครื่องมือ provisioning แบบ local และ remote
public/              static assets และ security headers
tests/               automated tests
```

## เอกสาร

- [Release notes v1.0.1](docs/V1.0.1_RELEASE.md) — การเปลี่ยนแปลง ข้อจำกัด และสถานะการตรวจ
- [Project handoff](PROJECT_HANDOFF.md) — ประวัติการทำงาน ผลตรวจ และงานที่ยังค้าง
- [Design system](docs/DESIGN_SYSTEM.md) — tokens และแนวทาง UI
- [Storage architecture](docs/STORAGE_ARCHITECTURE.md) และ [Storage API contract](docs/STORAGE_API_V1_PROPOSAL.md)
- [Backup and recovery](docs/BACKUP_RECOVERY.md) และ [production security gates](docs/PHASE_10_1_1.md)
- [AGENTS.md](AGENTS.md) — แนวทางทำงานใน repository

สถานะ source ใน repository ไม่ได้ยืนยันว่า revision นี้ deploy แล้วหรือ production ผ่านการตรวจล่าสุด ดูรายละเอียดและ QA ที่ยังค้างใน release notes และ handoff

## License

ดู [LICENSE](LICENSE)
