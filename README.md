# Nexora

Nexora เป็นเว็บจัดการไฟล์สำหรับ private cloud ให้ผู้ใช้จัดระเบียบไฟล์ เข้าถึงรายการล่าสุด และแชร์ไฟล์หรือโฟลเดอร์ผ่านลิงก์ได้จาก workspace เดียว รองรับหน้าจอมือถือและธีม Light / Dark

โปรเจกต์ใช้ React, Vite, Tailwind CSS, React Router และ Cloudflare Pages Functions โดยเก็บข้อมูลบัญชีและ metadata ของ Nexora ใน D1 และเชื่อมต่อ Shared Storage ผ่าน API ฝั่ง server

## ความสามารถ

- **Files:** เรียกดูไฟล์และโฟลเดอร์แบบ List หรือ Grid การ์ดสี่เหลี่ยมจัตุรัส พร้อมวันที่และเวลาแก้ไขตามเวลาไทยแบบ 24 ชั่วโมง, ค้นหาและเรียงลำดับรายการที่โหลดแล้วผ่านเมนูหรือหัวคอลัมน์, สร้างโฟลเดอร์, upload, download, rename, move และ copy ตามสิทธิ์ของ storage
- **Clipboard:** เลือกหลายรายการแล้ว Copy, Cut และ Paste ระหว่างโฟลเดอร์ใน storage เดียวกันได้ ด้วยปุ่มหรือ `Ctrl/⌘ + C`, `Ctrl/⌘ + X`, `Ctrl/⌘ + V` และ `Esc` ข้อมูล clipboard อยู่ในหน่วยความจำของ session เท่านั้น
- **Preview:** เปิดดูรูปภาพ, PDF, ข้อความ และวิดีโอ MP4, WebM หรือ Ogg ที่รองรับได้ตามต้องการ ข้อความจำกัด 1 MiB ส่วนรูปภาพ, PDF และวิดีโอจำกัด 20 MiB วิดีโอต้องโหลดก่อนเล่นและขึ้นอยู่กับ codec ที่ browser รองรับ
- **Favorites และ Recent:** เก็บรายการโปรดและเข้าถึงไฟล์หรือโฟลเดอร์ที่เปิดล่าสุดได้อย่างรวดเร็ว
- **Trash:** ย้ายรายการไป Trash, กู้คืน หรือลบถาวร รวมถึงลบรายการทั้งหมดหลังยืนยัน การลบหลายรายการอาจสำเร็จเพียงบางส่วน
- **Shared:** สร้างลิงก์สาธารณะสำหรับดูและดาวน์โหลดไฟล์หรือโฟลเดอร์ กำหนดวันหมดอายุ เปลี่ยนลิงก์ หรือเพิกถอนได้ และเจ้าของคัดลอกลิงก์ที่ยังใช้ได้จากอุปกรณ์อื่นได้เมื่อเปิดใช้การกู้คืนลิงก์ ผู้รับลิงก์ไม่สามารถแก้ไขไฟล์ผ่านลิงก์นั้น
- **Dashboard และ Activity:** ดูสถานะ storage, รายการล่าสุด และประวัติการเปลี่ยนแปลงที่สำเร็จของบัญชี
- **Account:** กดชื่อหรือไอคอนผู้ใช้ใน Header เพื่อดูข้อมูลบัญชี เปลี่ยนชื่อที่แสดง และออกจากระบบ session อื่น
- **Upload preferences:** ตั้งจำนวน upload พร้อมกันและเลือกให้ล้างรายการที่สำเร็จอัตโนมัติได้ใน Settings
- **File preferences:** ตั้งค่าเริ่มต้นการเรียงไฟล์ การยืนยันย้ายรายการเดี่ยวไป Trash และอายุ public link ที่สร้างใหม่ได้ใน Settings
- **Account settings:** ตั้งธีมและ storage เริ่มต้นตามบัญชี เปลี่ยนรหัสผ่าน และออกจาก session อื่นได้; การอัปโหลดชื่อซ้ำจะแจ้ง conflict โดยยังไม่รองรับ rename หรือ replace อัตโนมัติ
- **Storage:** ดู storage ที่กำหนดให้บัญชี ค้นหา ตรวจสถานะการตอบ capabilities และค่า default แต่ละประเภท; admin ดู catalog แก้ชื่อแสดงผลและคำอธิบายของ storage และไปจัดการสิทธิ์ผู้ใช้ได้ โดย catalog แสดงสูงสุด 500 รายการ; usage และ quota แสดงเมื่อ backend มีข้อมูลเท่านั้น
- **User management:** Admin สร้าง แก้ไข ระงับ และลบบัญชี user ได้จาก Settings; บัญชีที่มี storage mount ต้องจัดการ mount ก่อนลบ และ storage ของบัญชีใหม่ต้อง provision แยก
- **Administration:** ผู้ดูแลเปิด maintenance mode ควบคุม public link ตั้งอายุ/จำนวน session และ password policy สำหรับการสร้าง user ผ่านแอปและเปลี่ยนรหัสผ่านได้ การปิดสร้าง link ไม่ลบ link เดิม และอายุ session ใหม่ไม่เปลี่ยน session ที่มีอยู่

ความสามารถของไฟล์ขึ้นอยู่กับสิทธิ์และ capabilities ของ storage ที่เชื่อมต่อ การค้นหาและเรียงลำดับครอบคลุมเฉพาะรายการที่โหลดแล้ว ขนาดรวมของโฟลเดอร์และ storage usage จะแสดงว่าไม่พร้อมใช้งานเมื่อไม่มีข้อมูลจาก provider

Storage usage และ quota ยังไม่มีแหล่งข้อมูล aggregate ที่ API รายงานได้ จึงไม่ใช่ค่าความจุจริงของ NAS; ดูขอบเขตข้อมูลและแนวทางต่อใน [usage audit](docs/PHASE_1_2_2_USAGE_AUDIT.md)

หน้า Storage Overview แสดงจำนวน storage ที่กำหนดให้บัญชีและสถานะ Connected / Unavailable / Unknown พร้อมระบุว่า usage, active / Trash, file count และเวลาวัดยังไม่มีข้อมูลที่เชื่อถือได้ จำนวนนี้นับ storage assignment ไม่ใช่จำนวน project

นโยบายที่เสนอจำกัดยอดรวมระดับ project ให้เจ้าของที่ backend ยืนยันหรือ admin ที่ได้รับสิทธิ์เฉพาะ โดยทั้งคู่ต้องมี assignment; นโยบายนี้ยังไม่ได้เปิดใช้

การเข้าถึง storage ไม่ได้ให้สิทธิ์ดูยอดรวมของ shared project โดยอัตโนมัติ และไม่มีการรวม usage ข้าม storage ในขณะนี้

## เริ่มต้นพัฒนา

ต้องมี Node.js 22.22 ขึ้นไป, pnpm และ dependencies ของโปรเจกต์ จากนั้นติดตั้งและเปิด Vite development server:

```bash
pnpm install
pnpm dev
```

`pnpm dev` เปิด frontend ผ่าน Vite ส่วน API และ D1 ต้องใช้ Cloudflare Pages Functions runtime หากต้องการทดสอบแอปพร้อม Pages Functions ในเครื่อง ให้เตรียม local D1 และรัน:

```bash
pnpm db:migrate:local
pnpm preview
```

สำหรับการทดสอบแบบแยกข้อมูล สามารถใช้ Wrangler `--local --persist-to <temporary-directory>` กับ migrations และ Pages dev โดยใช้ไฟล์ตัวแปรและ provider จำลองสำหรับ local เท่านั้น; อย่าใช้ bindings ของ production ในการทดสอบ

`pnpm preview` จะ build ก่อนเปิด Wrangler Pages ในเครื่อง การเข้าสู่ระบบต้องมีบัญชีที่ผู้ดูแลสร้างไว้ คำสั่ง `pnpm admin:create:local` ใช้สร้าง admin ใน local D1; ดูข้อกำหนดตัวแปรและขั้นตอนใน [คู่มือ backend](docs/PHASE_8.md) การเชื่อมต่อ storage ต้องตั้งค่า server-only bindings ตาม [.dev.vars.example](.dev.vars.example) และมี mount ที่ตั้งค่าไว้ การเปิด frontend เพียงอย่างเดียวไม่ได้สร้างบัญชีหรือเชื่อม storage ให้อัตโนมัติ

## คำสั่งที่ใช้บ่อย

| คำสั่ง | การทำงาน |
| --- | --- |
| `pnpm dev` | เปิด Vite สำหรับพัฒนา frontend |
| `pnpm lint` | ตรวจโค้ดด้วย ESLint |
| `pnpm test` | รัน Node tests และ Vitest UI tests โดยใช้ in-memory database และ mocked services |
| `pnpm test:ui` | รัน Vitest UI tests ใน jsdom |
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

Storage discovery และทุก operation ใน Storage API v1 ตรวจ assignment ของผู้ใช้ ส่วน Favorites, Recent และ Public Share ยังอยู่ระหว่างการเชื่อมสิทธิ์

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
- [Isolated acceptance](docs/LARGE_FILE_TRANSFER_ACCEPTANCE.md) — test-only suite, resource report และ production readiness checklist; real-provider checks ยัง BLOCKED
- [Frontend transfer status](docs/LARGE_FILE_TRANSFER_FRONTEND.md) — capability groundwork; resumable uploader และ Transfer Manager ยังไม่เสร็จ
- [Multipart backend](docs/LARGE_FILE_TRANSFER_BACKEND.md) — server implementation แบบ opt-in; ต้องผ่าน migration และ infrastructure QA ก่อนเปิดใช้ ยังไม่มี frontend resumable queue
- [Large file transfer plan](docs/LARGE_FILE_TRANSFER_PLAN.md) — architecture audit และ roadmap; สถานะ backend ปัจจุบันอยู่ในเอกสาร Multipart backend ยังไม่ยืนยันการรองรับ 10 GiB
- [Backup and recovery](docs/BACKUP_RECOVERY.md) และ [production security gates](docs/PHASE_10_1_1.md)
- [AGENTS.md](AGENTS.md) — แนวทางทำงานใน repository

สถานะ source ใน repository ไม่ได้ยืนยันว่า revision นี้ deploy แล้วหรือ production ผ่านการตรวจล่าสุด ดูรายละเอียดและ QA ที่ยังค้างใน release notes และ handoff

## License

ดู [LICENSE](LICENSE)

Admin สามารถจัดการ storage assignment ของผู้ใช้ได้ใน Administration > Users

Core storage v1 operations now enforce session-scoped storage assignments, including object reads, transfers, mutations, Trash lifecycle and operation status. See docs/PHASE_STORAGE_ASSIGNMENT.md for the route matrix. Favorites, Recent, Public Share and UI integration remain separate.
