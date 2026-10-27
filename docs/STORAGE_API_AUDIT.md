# IssueDesk / Shared Storage API Audit

ตรวจ source ใน checkout IssueDesk ณ 2026-10-27 โดยอ้างอิง `functions/api/storage/`, `functions/api/storage-health.js`, `functions/api/qr-logos/` และ `garage/storage/src/` ไม่อ่าน `.env`, credential หรือไฟล์ฐานข้อมูล/ข้อมูล Storage ที่ runtime ใช้อยู่ เอกสารนี้เป็นผลจาก source code เท่านั้น ไม่ยืนยันว่า remote secrets, Cloudflare Access policy, container, Garage หรือ production deployment มีสถานะเดียวกับ checkout

## S1/S2 implementation delta (2026-10-27)

ตาราง audit ด้านล่างเก็บ baseline ก่อน S1: routes ย้ายไป `src/app.js`, download เป็น stream และ S2 เพิ่ม additive logical object/folder metadata พร้อม authenticated internal `/v3` routes กับ migration. `/v2` คง response/auth contract หลัง apply migration; Trash ซ่อนรายการปกติ, v2 DELETE ยัง permanent. Upload ยัง buffered; S2 migration ยังไม่ apply กับ service runtime. ดู [S1](STORAGE_PHASE_S1.md) / [S2](STORAGE_PHASE_S2.md)

## Nexora Phase 8 source implementation (2026-10-27)

Nexora now has local Pages Functions under `functions/`, migration `migrations/0001_backend_foundation.sql`, hashed-cookie session auth and a server-only client for Shared Storage S2 `/v3`. Same-origin `/api/storage/v1/*` derives project IDs from owner-scoped D1 mounts; browser-facing serializers omit project/provider references. `/api/auth/*`, Favorites and bounded Recent routes are also present. See [Phase 8 report](PHASE_8.md) for the endpoint matrix, security checks and test results.

Phase 9.5 wires Dashboard/Recent to the existing `recent_access` table and `/api/recent`: GET hydrates bounded logical references through owner-scoped mounts, and explicit access uses an authenticated POST; it adds no migration. Dashboard reads safe active-mount/optional-usage state and six Recent entries without recursive scans or preview prefetch. Shared remains demo-only. D1 migration has only run against Wrangler local D1; production D1, Access service identity, Shared Storage credentials/mount and deploy state are not verified by this source audit. Nexora upload remains bounded but S2 buffers multipart; downloads stream. See [Phase 9.5 report](PHASE_9_5.md).

## ภาพรวม API ที่พบ

- IssueDesk เป็น Cloudflare Pages Functions และมี D1 binding `DB` สำหรับ business metadata
- Shared Storage Service เป็น Hono/Node service; SQLite (`garage/storage/src/db.js`) เก็บ app, app credentials, projects และ file metadata ส่วน object bytes อยู่ใน S3-compatible Garage
- IssueDesk ชี้ไปยัง project ID คงที่ใน Shared Storage API v2 ด้วย server environment variables; browser เรียก same-origin IssueDesk routes ไม่ได้เรียก Garage
- Legacy `/api/*` ของ Storage Service ปิดโดย default เว้นแต่ `ENABLE_LEGACY_API=true`
- v2 มี list/upload/download/permanent delete ของ file เท่านั้น; ไม่มี folders, rename, move, copy, Trash/restore, capabilities หรือ usage endpoint

## IssueDesk Pages Functions

| Method | Endpoint | Current Purpose | Auth | Nexora Reusable | Gap / Risk |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/storage/files` | ดึงไฟล์ทั้งหมดของ project คงที่และ normalize เป็น `files[]` | Session + admin role | **REPLACE** | ไม่มี `parentId`, filter, cursor/limit, folder model หรือ user ownership; admin-specific |
| POST | `/api/storage/files` | รับ multipart field `file`, ตรวจ MIME allowlist, ไฟล์ไม่ว่างและไม่เกิน 10 MiB แล้วส่งต่อ v2 | Session + admin role | **EXTEND** | `request.formData()` และสร้าง FormData upstream; ทำให้ parse/materialize ใน runtime; limit ต่างจาก Storage Service 25 MiB default; ไม่สนับสนุน folder/namespace per user; MIME ตรวจจาก client header เท่านั้น |
| GET | `/api/storage/files/:fileId` | อ่าน file bytes เพื่อ inline preview รูปภาพที่ปลอดภัย หรือ download | Session user; non-image download จำกัด admin | **NOT FOR NEXORA** | GET ตรวจเพียง role/session แต่ไม่ตรวจว่า caller เป็นเจ้าของ ticket/attachment หรือมีสิทธิ์ใน file นั้น จึงมี IDOR risk หากทราบ ID; รองรับเฉพาะ inline image สำหรับ user; ไม่มี Nexora ownership |
| DELETE | `/api/storage/files/:fileId` | ลบไฟล์ใน Storage ถาวรและลบแถว `issue_attachments` ที่อ้าง ID | Session + admin role | **NOT FOR NEXORA** | ผูกกับ IssueDesk D1; ไม่มี Trash/restore; file อาจถูกลบแล้วแต่ cleanup D1 ล้มเหลว |
| GET | `/api/storage-health` | เรียก list project เพื่อรายงาน project name และ file count | ไม่พบ session/role check ใน handler | **NOT FOR NEXORA** | endpoint เปิดเผยข้อมูล operational/project; response บอก upstream status บางกรณี; ใช้ตรวจ health ภายในเท่านั้นและควรมี auth/จำกัดข้อมูลหากเปิดสาธารณะ |
| GET | `/api/issues/:ticketNumber/attachments` | list attachment metadata for a ticket | Session + admin role | **NOT FOR NEXORA** | ผูก IssueDesk ticket และ D1 `issue_attachments` |
| POST | `/api/issues/:ticketNumber/attachments` | upload attachment, associate it with ticket, and store Shared Storage file ID | No explicit session/role check in this handler; it checks ticket ID and server env | **NOT FOR NEXORA** | Ticket-linked business route; may be intentionally callable for public ticket workflows; checks 10 MiB and MIME list and samples HEIF magic bytes, but the handler itself has no `requireRole` or same-origin check |
| GET | `/api/issues/:ticketNumber/attachments/:attachmentId?inline=1` | read attachment through Storage and return inline/attachment binary | Session + admin role; attachment scoped to ticket in D1 query | **NOT FOR NEXORA** | Ticket ownership/schema specific; proxy streams response body but content safety depends on stored MIME; no explicit timeout |
| DELETE | `/api/issues/:ticketNumber/attachments/:attachmentId` | delete Storage object and linked D1 metadata | Session + admin role; attachment scoped to ticket | **NOT FOR NEXORA** | Permanent delete; external object and D1 are not one transaction |
| DELETE | `/api/issues/:ticketNumber` | delete issue, associated attachment objects, then D1 rows | Session + admin role | **NOT FOR NEXORA** | Ticket cascade can permanently delete Storage files; multiple upstream operations can partially complete |
| POST | `/api/qr-logos` | รับโลโก้ QR, ตรวจชนิดและ magic bytes, ส่งเข้า project เดิม, บันทึก owner ใน D1 | endpoint helper ตรวจ session; `user_id` จาก browser ถูกปฏิเสธ | **REUSE** เฉพาะ pattern การยืนยัน owner/cleanup | จำกัดรูป PNG/JPEG/WebP 2 MiB; QR-specific lifecycle ไม่ใช่ file manager API; request/form/file ถูกอ่านเข้า memory; upstream timeout 15s |
| GET | `/api/qr-logos/:id` | ให้เจ้าของ QR logo อ่านรูปจาก Storage | Session + owner row check | **REUSE** เฉพาะ ownership pattern | ผูก schema/permission กับ QR; ไม่ใช่ generic object authorization |

`/api/storage/files/:fileId` ตอบ binary สำหรับ success และ `{ success:false, message }` JSON สำหรับข้อผิดพลาด; เส้นทาง list/upload/delete ใช้ JSON envelope แบบ `{ success, files|file|message }`. Endpoint มี `Cache-Control: no-store` ใน helper; binary response ใช้ `private, no-store`, `nosniff` และ sanitize query filename ด้วยการแทน slash, CR/LF, NUL แล้วจำกัด 180 ตัวอักษร

## Shared Storage Service

`garage/storage/src/index.js` เป็นแหล่ง route ปัจจุบัน; Hono ใช้ app credential middleware สำหรับ v2 ส่วน `/health` และ `/admin/*` มี policy แยก รายการ admin เป็น operator management API ไม่ควรเปิดให้ Nexora browser หรือ end-user ใช้

| Method | Endpoint | Current Purpose | Auth | Nexora Reusable | Gap / Risk |
| --- | --- | --- | --- | --- | --- |
| GET | `/health` | ตรวจว่า service ตอบสนอง | Public | **NOT FOR NEXORA** | เปิดเผยเพียงชื่อ service; ไม่ตรวจ Garage/DB health end-to-end |
| GET | `/v2/projects/:projectId/files` | list metadata ทั้ง project เรียงใหม่ก่อน | Bearer app credential; project ต้อง active และเป็นของ app | **EXTEND** | ไม่มี pagination/cursor, folder hierarchy, provider capability หรือ usage; ใช้เป็น adapter ภายในได้หลังเพิ่ม scoped contract |
| POST | `/v2/projects/:projectId/files` | multipart upload; สร้าง file UUID และ object-key UUID; บันทึก metadata | Bearer app credential + app/project ownership | **EXTEND** | `bodyLimit` ตั้งจาก `MAX_FILE_SIZE_MB` (default 25 MiB) + 1 MiB; `formData()`, `file.arrayBuffer()` และ `Buffer.from()` buffer bytes ก่อน S3 PutObject; MIME/name จาก client ยังไม่ sniff/sanitize; ไม่มี partial/resumable upload |
| GET | `/v2/projects/:projectId/files/:fileId` | download object จาก Garage พร้อม metadata headers | Bearer app credential + ตรวจ app/project/file join | **EXTEND** | ใช้ `transformToByteArray()` จึงอ่าน object ทั้งก้อนเข้า memory; response มี `Content-Disposition: attachment`; ไม่มี preview/range/conditional request; ไม่มี explicit app-level timeout |
| DELETE | `/v2/projects/:projectId/files/:fileId` | ลบ Garage object แล้วลบ metadata row | Bearer app credential + project/file ownership | **EXTEND** | permanent delete; หาก Garage ลบสำเร็จแต่ SQLite ล้มเหลวเกิด orphan metadata; ไม่มี soft delete, restore หรือ compensation |
| GET | `/api/files` (legacy) | list object keys สูงสุด 100 พร้อม `isTruncated`, continuation token | Global `STORAGE_API_TOKEN`; route ถูกปิดหาก `ENABLE_LEGACY_API` ไม่เป็น `true` | **NOT FOR NEXORA** | ไม่แยก app/project; route ไม่รับ continuation token จาก query ใน implementation ที่ตรวจ; response เปิดเผย physical object keys |
| POST | `/api/files` (legacy) | multipart upload ตรง bucket | Global `STORAGE_API_TOKEN`; legacy gate | **NOT FOR NEXORA** | ไม่มี app/project metadata ownership; materialize body; API deprecated/ปิดโดย default |
| GET | `/api/files/:key` (legacy) | download by raw S3 key | Global token; UUID-shaped key validation; legacy gate | **NOT FOR NEXORA** | ใช้ physical key เป็น public route identifier; materialize body; ไม่มี scoped project authorization |
| DELETE | `/api/files/:key` (legacy) | ลบ object by raw key | Global token; UUID-shaped key validation; legacy gate | **NOT FOR NEXORA** | permanent delete และไม่มี metadata lifecycle/ownership ใน project |
| GET | `/admin/apps` | operator list apps and project/credential counts | Bearer `STORAGE_ADMIN_TOKEN` via constant-time compare | **NOT FOR NEXORA** | operator-only management surface |
| POST | `/admin/apps` | create a Storage client app | Bearer `STORAGE_ADMIN_TOKEN` | **NOT FOR NEXORA** | privileged provisioning |
| POST | `/admin/apps/:appId/credentials` | issue one-time app credential; store SHA-256 hash | Bearer `STORAGE_ADMIN_TOKEN` | **NOT FOR NEXORA** | secret must be captured securely and never sent to browser |
| DELETE | `/admin/credentials/:credentialId` | revoke credential | Bearer `STORAGE_ADMIN_TOKEN` | **NOT FOR NEXORA** | privileged credential lifecycle |
| GET | `/admin/apps/:appId/projects` | list an app's project metadata | Bearer `STORAGE_ADMIN_TOKEN` | **NOT FOR NEXORA** | operator provisioning |
| POST | `/admin/apps/:appId/projects` | create a project for app | Bearer `STORAGE_ADMIN_TOKEN` | **NOT FOR NEXORA** | privileged provisioning; project-to-provider bucket mapping is internal |

v2/legacy JSON errors โดยทั่วไปมี `{ success:false, message }` และสถานะ HTTP; successful download ตอบ binary ไม่ใช่ JSON. พบ status ที่ใช้จริง ได้แก่ 400 validation, 401 auth, 404 missing/disabled scope, 413 body/file limit, 500/502 internal/upstream และ 201 successful upload. ไม่พบ CORS middleware ใน `garage/storage/src/index.js`; IssueDesk เรียกจาก server-side Pages Function ผ่าน Cloudflare Access, browser เรียก same-origin endpoint จึงไม่ต้องพึ่ง CORS. การตั้งค่า CORS/Access ที่อยู่นอก checkout ยังตรวจไม่ได้

## Auth, ownership และ transport

- IssueDesk session ใช้ `issuedesk_session` cookie แบบ `HttpOnly; Secure; SameSite=Lax`; D1 เก็บ token hash; `requireRole` ตรวจ active user และ role; login/register/logout mutations ตรวจ same-origin
- IssueDesk Storage proxy ต้องใช้ `STORAGE_API_URL`, `STORAGE_APP_SECRET`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` ฝั่ง server; ไม่มี credential ใน service client `src/services/storage.js`
- Upstream requests ใส่ Cloudflare Access service-token headers และ `Authorization: Bearer <Storage app credential>`; ไม่มี explicit `AbortSignal`/timeout ใน list/upload/download/delete helper ปัจจุบัน
- Storage Service hash app credential ก่อนเทียบ SQLite; app ต้อง active, project ต้อง active และอยู่ใต้ app; query ของ file v2 ผูก `fileId` + `projectId` + `app_id`
- project ID ที่ IssueDesk ใช้ถูก hard-code ใน helper; ไม่มี Nexora project/user mapping ใน source
- IssueDesk `/api/storage/files` POST/DELETE use an admin session but do not call the existing `isSameOrigin()` helper; `SameSite=Lax` cookie helps but explicit origin/CSRF checks should be added in a reviewed Nexora contract implementation
- Storage Service เก็บ `object_key` ที่สุ่มแยกจาก `files.id`; `fileId` เป็น UUID ที่ใช้เป็น app-level record ID, แต่ไม่มี semantics ว่า stable ข้าม storage/provider
- ไม่มี route layer CORS; ไม่พบ path traversal ผ่าน key สำหรับ v2 เพราะ object key server-generated UUID; legacy validates UUID; original filename เก็บจาก client โดยไม่ normalize

## Upload/download และ limits

1. Browser -> IssueDesk: `POST /api/storage/files` ใช้ `FormData`; Pages Function เรียก `request.formData()`, ตรวจ file แล้วสร้าง `FormData` ใหม่ส่ง v2
2. Storage Service: Hono `c.req.formData()` -> `file.arrayBuffer()` -> `Buffer.from()` -> AWS SDK `PutObjectCommand`
3. Download: Storage Service `GetObjectCommand` -> `Body.transformToByteArray()` -> Hono body; IssueDesk proxy ใช้ `new Response(response.body)` ซึ่งไม่ได้อ่าน body เอง แต่ upstream ได้ buffer เนื้อหาไว้แล้ว
4. ดังนั้น upload และ download ของ Storage Service **ไม่ streaming end-to-end**; upload ยังมี memory copy หลายชั้น; download โหลด object ทั้งหมดก่อนตอบ
5. IssueDesk image/QR-logo routes มี limits แยก (IssueDesk generic upload 10 MiB; QR logo 2 MiB; Service default 25 MiB และ configurable) และ limits เหล่านี้ไม่ใช่ unified product contract
6. ไม่มี explicit timeout/retry/resumable or multipart-S3 configuration ใน inspected storage handlers; SDK/network/provider defaults are not a documented API guarantee

Cloudflare Workers runtime ปัจจุบันระบุ 128 MiB memory ต่อ isolate; account plan request-body cap อยู่ที่ 100 MB (Free/Pro), 200 MB (Business), และ Enterprise ปรับได้ถึง 5 GB ตามเอกสาร limits ปัจจุบัน [Workers limits](https://developers.cloudflare.com/workers/platform/limits/). Pages Functions ใช้ Workers runtime/limits; ตรวจ account zone limit จริงไม่ได้จาก checkout. Buffering copies ทำให้ practical ceiling ต่ำกว่าขนาด HTTP request cap ได้มาก จึงต้องกำหนด application limit ต่ำกว่า upstream/runtime constraints หรือออกแบบ streaming/resumable ก่อนรองรับไฟล์ใหญ่

## คำตัดสินสรุป

| Existing component | Classification for Nexora | Reason |
| --- | --- | --- |
| Shared v2 service-to-service app credential + project scoping | **REUSE** as an internal authentication building block, then **EXTEND** its API | Keeps secrets server-side and scopes projects to an app; still lacks user namespaces and file-manager operations |
| UUID logical row ID separate from Garage object key | **REUSE** as a provider implementation pattern | Useful boundary, but Nexora needs its own stable metadata IDs and registry |
| IssueDesk session, role and ticket-attachment routes | **NOT FOR NEXORA** | IssueDesk identity, admin policy and D1 business records are application-specific |
| IssueDesk generic storage proxy and QR-logo handlers | **REPLACE** for Nexora | Fixed project/admin/ticket assumptions, upload limits and ownership models do not match private-cloud file manager |
| Shared Service v2 list/upload/download/delete | **EXTEND** behind a provider adapter | Keep as first Garage provider internals; add stream, folders and lifecycle operations only under reviewed v1 manager contract |
| Shared Service legacy `/api/*` | **NOT FOR NEXORA** | Legacy, global token, direct keys, no project/user isolation |
| Shared Service operator `/admin/*` | **NOT FOR NEXORA** | Privileged provisioning surface |

No API was modified during this audit.
