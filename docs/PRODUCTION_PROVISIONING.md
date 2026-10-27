# Production provisioning — Nexora D1

สถานะ ณ 2026-10-27: operator แจ้งว่า production D1 สร้างและ apply migration แล้ว และ Shared Storage Nexora App, credential, project, Cloudflare Access Service Token และ production environment secrets ผ่านการทดสอบ `/v3` ด้วย HTTP 200 แล้ว ข้อมูลนี้เป็นสถานะที่ operator ยืนยัน; รอบ implementation นี้ไม่ได้เชื่อมต่อหรือเขียน production

CLI ด้านล่างเป็นคำสั่งแบบ manual และ explicit เท่านั้น โดยส่ง SQL ผ่านไฟล์ชั่วคราว permission `0600` ให้ Wrangler และระบุ `--remote` ทุกครั้ง ใช้ D1 ชื่อ `nexora-db` จาก `wrangler.jsonc`; หาก config หรือ Wrangler account ชี้ไปคนละ production account/database ให้หยุดและตรวจสอบก่อนสั่งงาน ไม่มี provisioning ระหว่าง build, deploy หรือ startup

## Create production admin

ต้องตั้งค่าทั้งสามตัวใน private process environment ก่อนเรียกคำสั่ง:

- `NEXORA_ADMIN_EMAIL`
- `NEXORA_ADMIN_DISPLAY_NAME`
- `NEXORA_ADMIN_PASSWORD`

ตัวอย่าง shell แบบ interactive โดยไม่ใส่รหัสผ่านใน command history หรือ CLI arguments:

```bash
export NEXORA_ADMIN_EMAIL='admin@example.com'
export NEXORA_ADMIN_DISPLAY_NAME='Nexora Administrator'
read -s NEXORA_ADMIN_PASSWORD
export NEXORA_ADMIN_PASSWORD
pnpm admin:create:remote
unset NEXORA_ADMIN_EMAIL NEXORA_ADMIN_DISPLAY_NAME NEXORA_ADMIN_PASSWORD
```

`read -s` รับรหัสผ่านจาก terminal แบบไม่ echo; กด Enter หลังพิมพ์เสร็จ รหัสผ่านต้องยาว 12–1024 UTF-8 bytes ตาม Phase 8. CLI ใช้ email normalization, display-name/password validation และ `hashPassword` ของ authentication implementation เดิม, สร้าง UUID, แล้ว insert user ที่ role `admin` และ active. Email ซ้ำหลัง normalize จะไม่สร้าง record. CLI จะแสดงเฉพาะ ID, normalized email, display name และ role.

คำสั่ง local เดิม `pnpm admin:create:local` ไม่ได้เปลี่ยน และ production CLI ไม่ fallback ไป local D1.

## Create production Storage mount

ต้องตั้งค่าทั้งสามตัวใน private process environment:

- `NEXORA_USER_EMAIL`
- `NEXORA_STORAGE_PROJECT_ID`
- `NEXORA_STORAGE_NAME`

```bash
export NEXORA_USER_EMAIL='owner@example.com'
export NEXORA_STORAGE_PROJECT_ID='shared-storage-project-id'
export NEXORA_STORAGE_NAME='Primary Storage'
pnpm storage:mount:create:remote
unset NEXORA_USER_EMAIL NEXORA_STORAGE_PROJECT_ID NEXORA_STORAGE_NAME
```

Email ถูก normalize ด้วย helper เดียวกับ login และ resolve กับ active user ภายใน D1 statement. CLI สร้าง UUID mount ID และกำหนด `provider='garage'`, `status='active'`, `read_only=0` พร้อม project ID ที่ให้มา. จะปฏิเสธกรณีไม่พบ/inactive user หรือ owner มี mount ที่ชื่อ (case-insensitive) หรือ project ID ซ้ำ. Output มี mount ID, owner email, storage name, provider และ status เท่านั้น.

`shared_storage_project_id` เป็น Nexora server-side mapping ไม่ใช่ credential. CLI ไม่รับ owner ID และไม่เขียน app secret, Cloudflare credentials, Garage object key, provider reference, physical path หรือ bucket credentials. ตรวจ project ID และ owner ให้ตรงกันก่อนสั่ง; คำสั่งนี้ไม่ได้ตรวจสอบ project กับ Shared Storage API.

## Validation and failure handling

ตรวจค่า env ทั้งหมดก่อน remote write. Wrangler ถูกเรียกด้วย `pnpm exec wrangler d1 execute nexora-db --remote --json --file=<private-temp-file>`; ไม่ใช้ `--local`, migration, build/deploy hook หรือ SQL ที่ส่งผ่าน process arguments. Child process ไม่ได้รับค่า provisioning จาก environment หลัง validation. Output จาก Wrangler ถูกเก็บไว้ภายในและไม่พิมพ์ออก; error ถูกแทนด้วยข้อความทั่วไป. ถ้า command ขัดข้องหลัง remote write แต่ก่อนแสดงผล ให้ตรวจ D1 ด้วย email หรือ mount ID ก่อน retry เพื่อหลีกเลี่ยงความสับสน.

## Rollback and recovery

- ก่อนเริ่ม ให้ยืนยัน Cloudflare account, `nexora-db`, email และ Shared Storage project ID จากแหล่ง operator ที่เชื่อถือได้; สำรองข้อมูล D1 ตามกระบวนการ production ของทีมก่อนงาน provisioning.
- Admin ที่สร้างผิด: ปิดบัญชีด้วย `active=0` และ revoke sessions ของ user นั้นใน D1. อย่าลบ admin คนสุดท้าย; รักษา active admin อย่างน้อยหนึ่งบัญชีเพื่อ recovery. การปิดบัญชีจะทำให้ login ใหม่ถูกปฏิเสธ.
- Mount ที่สร้างผิด: ตั้ง `status='inactive'` หรือ `read_only=1` ทันทีระหว่างตรวจสอบ. หลังยืนยัน dependencies แล้วจึงลบเฉพาะ mount row ตามกระบวนการ production; foreign-key cascade ลบ Favorites/Recent ของ mount นั้น แต่ไม่ลบ project หรือ objects ใน Shared Storage.
- หากใช้ project ID ผิด ให้แก้ mapping หลังตรวจ project กับ operator/Shared Storage ก่อน. อย่าลบหรือแก้ข้อมูล Shared Storage ด้วย CLI นี้.
- ไม่มี migration หรือ rollback migration ในงานนี้. หากผลคำสั่งกำกวม ให้ query D1 แบบ read-only เพื่อตรวจ record ก่อน retry; อย่ารันคำสั่งซ้ำโดยคาดเดา.

## Scope and checks

CLI นี้เพิ่มเฉพาะการ bootstrap admin และ Storage mount ลง Nexora D1 ที่มี schema Phase 8 อยู่แล้ว. ไม่เปลี่ยน migration, Shared Storage, frontend demo state, secrets, deploy หรือ production records. Automated tests ใช้ pure SQL builders/parsers และไม่เชื่อมต่อ remote D1.
