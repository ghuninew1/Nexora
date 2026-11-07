# Nexora — Large File Transfer Plan (Phase 1: Audit Only)

> **Final Phase 6 (2026-11-08):** สถานะรวมและ runbook ปัจจุบันอยู่ใน [Production readiness](LARGE_FILE_TRANSFER_PRODUCTION_READINESS.md). Source integration/local validation complete; real-provider acceptance BLOCKED, controlled rollout/production NOT READY. D1 schema0011 verified read-only on target; Shared schema0002 remains unverified. Earlier phase statements below retain their historical scope.

> Phase 5.1 follow-up (2026-11-08): backend streaming/Range contract and acceptance boundaries are documented in [LARGE_FILE_TRANSFER_DOWNLOAD.md](LARGE_FILE_TRANSFER_DOWNLOAD.md). Earlier phase statements below describe their historical scope; no frontend Download Manager is added.

วันที่ตรวจ: 2026-11-07 (Asia/Bangkok) · เป้าหมายเริ่มต้น: **10 GiB = 10,737,418,240 bytes**

สถานะ: ข้อเสนอสำหรับ implementation รอบถัดไป ยังไม่ใช่ความสามารถที่เปิดใช้งาน และยังไม่ยืนยันว่า infrastructure รองรับ 10 GiB จริง ไม่มี runtime changes, migration, deploy, production request หรือการแก้ Shared Storage ในงานนี้

**Implementation follow-up (2026-11-07):** Backend source และ local mocked validation อยู่ใน [LARGE_FILE_TRANSFER_BACKEND.md](LARGE_FILE_TRANSFER_BACKEND.md). แผนด้านล่างคงเป็น architecture proposal; actual limits/deviations และ incomplete infrastructure gates ให้ยึด follow-up ไม่ตีความว่า frontend/Range/10 GiB verification ทำแล้ว

## 1. ขอบเขตและระดับหลักฐาน

- **Verified / source:** ตรวจ Nexora checkout เริ่มต้น HEAD `d657076` (working tree สะอาด) และอ่าน source แยกที่ `../issuedesk/garage/storage` HEAD ของ IssueDesk `0452efb` (ไม่มี working-tree changes ภายใต้ `garage/storage` ตอนตรวจ) ไม่ได้แก้ repository นั้น ไม่ได้อ่าน `.env`, SQLite/WAL/SHM หรือ `garage.toml` จริง
- **Verified / documentation:** ตรวจ official Cloudflare limits, Garage compatibility/source, HTTP RFC และ browser compatibility ณ วันที่ข้างต้น ลิงก์อยู่ท้ายเอกสาร หลักฐานนี้ไม่ยืนยัน installed/deployed versions หรือการตั้งค่าของผู้ใช้
- **Proposed:** ทุก endpoint/schema/state/TTL/concurrency ใหม่ด้านล่าง ยังไม่ implement
- **Unverified / infrastructure:** Garage ที่รันจริง, reverse proxy/Tunnel/WAF/Access, Cloudflare plan, D1 quotas, disk/memory/IO, network throughput และ large-file recovery end-to-end
- อ่าน `AGENTS.md`, skill `.agents/skills/nexora/SKILL.md`, `PROJECT_HANDOFF.md`, `README.md`, package scripts และ reports ที่เกี่ยวข้องแล้ว เส้นทาง `.agents/skills/nexora-project/SKILL.md` ที่ project map อ้างไม่มีใน checkout นี้; ใช้ skill ที่มีอยู่จริง ไม่สร้างหรือแก้ skill ใน audit นี้

## 2. Current implementation audit

เส้นทางอ้างอิงในตารางเป็น source ของ checkout ที่ตรวจ ไม่ใช่หลักฐาน live deployment

| ชั้น | Source / หลักฐาน | พฤติกรรมปัจจุบันและผลต่อ large file |
| --- | --- | --- |
| Upload queue | `src/hooks/useUploadQueue.js:1`, `:48`, `:125`; `src/hooks/useRemoteFilesState.js:513` | เก็บ `File`, tasks และ AbortController ใน page memory; concurrency ตาม preferences (1/2/3/5, fallback 3), retry ทั้งไฟล์, cancel request, clear success หลัง 5 วินาทีตาม preference; unmount ยกเลิก ไม่มี pause, part retry, persistence หรือ auto recovery |
| Browser client | `src/services/storage.js:294` | ตรวจ positive safe-integer size และ advertised `maxUploadBytes`, สร้าง FormData `file`/`parentId`, ใช้ fetch; ไม่มี upload byte callback |
| Upload UI | `src/components/files/UploadQueue.jsx` | queued/uploading/success/error/cancelled, retry/cancel และ indeterminate progressbar ไม่มี %/speed/ETA จริง; ชื่อ KB/MB/GB ใช้ฐาน 1024 เป็น label เดิม ไม่ใช่ size policy |
| Public capability | `functions/_lib/storage-api.js:283`; `functions/_lib/storage-client.js:238` | maxUploadBytes ต่ำสุดระหว่าง provider advertised และ Nexora configuration ที่ clamp 25 MiB; `rangeRead: false` เสมอ |
| Server upload | `functions/_lib/storage-api.js:332` | multipart only; 25 MiB default/hard clamp + multipart overhead 1 MiB; ตรวจ Content-Length ถ้ามี และ limitStream จริง; forward body stream ไป `/v3/projects/:projectId/files` ไม่ parse ทั้งไฟล์ใน Nexora |
| Authorization | `functions/_lib/api.js`, `http.js:51`, `storage-api.js:253`, `storage-access.js`, `storage-permissions.js` | session และ same-origin mutation checks, maintenance policy, active assignment, grants, readOnly และ provider capability intersection; upload ต้อง upload permission; download ต้อง read+download; logical mount map ไป project ที่ server |
| Provider client | `functions/_lib/storage-client.js:3`, `:43`, `:92`, `:150` | service credential + Access service headers เฉพาะ server, manual trusted redirect policy; default total deadline 15 s, configurable 100–30,000 ms; timer อยู่ต่อจน body cleanup ไม่ใช่แค่เวลารอ headers |
| Download initiation | `src/services/storage.js:419` | เช็ค user แล้ว `window.location.assign` URL same-origin; browser จัดการ download; app ไม่รู้ bytes/success และไม่มี managed download queue |
| Download server | `functions/_lib/storage-api.js:148`, `:347`, `:377` | stream พร้อม cancellation, safe type/disposition/length; สร้าง status 200 เสมอ, ไม่ forward Range/If-Range ไป provider และไม่ส่ง ETag/Accept-Ranges/Content-Range กลับ; ไม่มี explicit download byte-size cap |
| Preview | `src/utils/storage-preview.js:1`, `src/services/storage.js:390`, `src/services/shares.js:76`, `functions/_lib/storage-api.js:185`, `:615` | รูป/PDF/video 20 MiB, text 1 MiB; server จำกัด declared metadata และ bytes ใน stream; browser โหลด Blob เต็มก่อนแสดง ไม่เหมาะเป็น large download path |
| Public downloads | `functions/_lib/shares-api.js:218` | ใช้ streamResponse เดียวกัน, recheck ancestry, share active/expiry/revoke และ publicDownloadEnabled ก่อนปล่อย response; ไม่เขียน Recent; ต้องรักษา checks เหล่านี้ทุก Range request |
| Storage upload | Shared `src/app.js:43`; `src/storage/file-manager-routes.js:99`; `src/index.js:35` | Hono bodyLimit = configured file maximum + 1 MiB; `MAX_FILE_SIZE_MB` default 25 แต่คำนวณเป็น MiB; formData → arrayBuffer → Buffer → manager → Garage PutObject |
| Storage metadata | Shared `src/storage/file-manager.js:375` | logical object UUID แยก provider UUID; name reservation 15 นาที, PutObject แล้ว transaction insert files/storage_objects; failure ลบ object ด้วย bounded independent request และบันทึก partial/orphan details; ไม่ใช่ persistent multipart session |
| Garage adapter | Shared `src/storage/providers/garage.js:7`, `:148`, `:156`; `src/index.js` | SDK `maxAttempts: 1`; provider total timeout default 60 s ครอบคลุม stream; upload PutObject, download GetObject; input.range ถูกปฏิเสธ ไม่ส่งออก ETag; ไม่มี multipart methods |
| Existing tests | `tests/backend.test.js:1000–1155`; Shared `tests/disconnect.test.js`, `tests/storage.test.js` | มี small multipart forwarding, cap, stream cancellation, preview และ permissions; mocks ไม่พิสูจน์ large-file, real Garage multipart/Range หรือ recovery |

### 2.1 Data flow และ buffering

```text
Upload:
Browser File → FormData/fetch → Nexora session/assignment/capability checks
 → bounded multipart ReadableStream → server-authenticated Shared Storage v3
 → Hono bodyLimit/formData [whole multipart/file materialization]
 → file.arrayBuffer [whole file] → Buffer.from(ArrayBuffer) [whole-file view]
 → file-manager name reservation → Garage PutObject → SQLite metadata commit
 → Nexora normalized logical file → best-effort Activity → queue success

Download:
Browser navigation → Nexora auth/read/download checks → Shared v3 app/project/stat
 → Garage GetObject → Web ReadableStream with length check/cancel/60 s default
 → Nexora streamResponse with 15 s default deadline → browser download manager

Preview:
Same authenticated/public-authorized download source → server bounded preview stream
 → response.blob [whole preview] → text decoding or object URL → UI
```

Full-content materialization ที่พบใน transfer paths:

1. Shared v3 `file-manager-routes.js:101–107` และ legacy/v2 ใน `src/app.js:132–167`, `:376–428`: form parser + ArrayBuffer ทั้งไฟล์ Buffer.from(ArrayBuffer) อาจ share backing memory จึงไม่กล่าวว่าคัดลอกเต็มอีกก้อนทุกครั้ง แต่หลาย representation/parser allocations และ concurrent requests ยังเพิ่ม peak RSS
2. Browser connected preview `src/services/storage.js:408` และ public preview `src/services/shares.js:86`: response.blob ทั้ง preview; text preview แปลงเป็น string เพิ่ม, image/video/PDF มี decoder/render memory เพิ่ม object URL ไม่ได้ทำให้ download เป็น streaming
3. Normal download ในเส้นทางที่ตรวจไม่มี `blob()`/`arrayBuffer()` ทั้งไฟล์ใน Nexora/Storage provider; `Buffer.from(chunk)` ใน provider Copy เป็น per-chunk ไม่ใช่ full-file aggregation ส่วน legacy IssueDesk Pages upload `functions/api/storage/files.js` มี formData อีกชั้น แต่ **ไม่อยู่ใน Nexora data path**
4. FormData ฝั่ง browser ถือ file reference; source ไม่ได้เรียกอ่านไฟล์ทั้งก้อนเอง จึงไม่สรุปว่า fetch ต้อง buffer ทั้ง File ใน JS heap ทั้งนี้ browser/runtime อาจมี internal buffering ต้องวัดจริง
5. JSON metadata/error reading เช่น `readBoundedJson` (16 KiB) ไม่ใช่ file-byte buffering ไม่มี persistent file bytes ใน folder cache

### 2.2 Inventory ของ 20 MB / MiB และ root causes

20 MiB = 20,971,520 bytes ต่างจาก decimal 20 MB = 20,000,000 bytes ไม่มี enforced decimal 20 MB upload/download cap ใน source ที่ตรวจ และไม่ได้ตรวจค่าของ deployment secrets/configuration

| พบที่ | ประเภท | ขอบเขต |
| --- | --- | --- |
| `src/utils/storage-preview.js:2` | Preview enforcement policy | media/PDF/video, shared โดย connected/public UI |
| `functions/_lib/storage-api.js:11`, previewSpec/previewObjectResponse | Preview enforcement | server size precheck + stream count, ทั้ง owner และ public |
| `tests/backend.test.js:1105` | Preview test fixture | ทดสอบเกิน 20 MiB ไม่ใช่ cap ใหม่ |
| `README.md:11`, `AGENTS.md` ส่วน preview, `docs/V1.0.1_RELEASE.md:12` | Advertised preview limit | เอกสาร current policy |
| `docs/PHASE_9_3_2.md:16`, `docs/PHASE_9_6.md:71`, historical preview entries ใน `PROJECT_HANDOFF.md` | Historical preview documentation | สอดคล้องกับ preview cap; report เก่าบางอันยังไม่กล่าวถึง video |

**Upload root causes:** independent Nexora hard clamp 25 MiB, upstream configurable default 25 MiB, whole-file parsing/PutObject ไม่มี resumable protocol, short total deadlines, queue ถือ File เฉพาะ memory การตั้ง env ให้ใหญ่ขึ้นอย่างเดียวไม่แก้ระบบ และไม่เปลี่ยน hard clamp Nexora

ข้อแตกต่างของ enforcement: Nexora limitStream นับ **multipart request รวม overhead** สูงสุด26 MiBเมื่อใช้ default ไม่ได้ parse เพื่อยืนยัน file bytes25 MiBเอง จึงมีช่วง slack ที่ client ซึ่ง bypass frontend อาจส่ง file เกิน advertised cap ได้ถ้า upstream ตั้งสูงกว่า; Shared file.size check เป็นตัวบังคับ file-byte cap จริงตามค่า upstream New raw-part contract ต้องนับ exact part bytes และ exact total server-side โดยไม่มี overhead ambiguity

**Download root causes:** ไม่มี 20/25 MiB explicit cap ใน download route แต่ deadlines, Range/validator contract ที่หายไป และ browser-only download control ขัดขวาง reliable large-file transfer; late stream errors เปลี่ยน HTTP status ที่ส่งไปแล้วไม่ได้ ผู้รับต้องตรวจ length/stream error

**Preview:** เก็บ 20 MiB/1 MiB ตามเดิม การรองรับ upload 10 GiB ไม่แปลว่า preview ได้ 10 GiB

### 2.3 Existing Multipart / Range support: แยกแต่ละชั้น

| ชั้น | Multipart | HTTP Range |
| --- | --- | --- |
| Browser/Nexora | ไม่มี S3 multipart หรือ resumable sessions; multipart/form-data เป็น request encoding คนละเรื่อง | ไม่ส่งต่อ Range/If-Range, normalize response เป็น 200, capability false |
| Shared Storage contract/adapter | ไม่มี create/uploadPart/listParts/complete/abort; manager interface ต้องเพิ่ม | `rangeRead: false`; adapter reject `input.range`, v3 route ไม่อ่าน Range |
| Garage official docs/upstream source | เอกสารระบุ Create/UploadPart/ListParts/ListMultipartUploads/Complete/Abort implement แล้ว | upstream `main-v2/src/api/s3/get.rs` มี Range handling, Accept-Ranges/ETag/Content-Range และ partial response logic |
| Garage deployment ของผู้ใช้ | **NOT VERIFIED** | **NOT VERIFIED**, รวม conditional request และ checksum compatibility |

Compose source ประกาศ `dxflrs/garage:v2.1.0`; ไม่พิสูจน์ running image/digest upstream main-v2 ไม่ใช่ pinned deployed source และยังไม่ยืนยัน If-Range behavior ของ Garage ต้อง implement HTTP semantics ใน Storage adapter/route พร้อม conditional provider GET ป้องกัน race ไม่พึ่ง header pass-through อย่างเดียว

## 3. Architecture proposal และ ownership

คง Browser → same-origin Pages → server-authenticated provider-neutral Shared API → Garage ไม่ใช้ direct/presigned Garage URL และไม่เปิดเผย bucket/key/provider upload ID

- **Nexora D1:** `transfer_sessions` ผูก opaque logical `transferId` กับ userId, mountId, server-only Shared logical session mapping, immutable name/parent/size/MIME, negotiated partSize/partCount, state/version, create idempotency key, created/expiry timestamps และ final logical objectId เก็บเฉพาะ metadata ไม่มี bytes ไม่ให้ browser ระบุ userId หรือ projectId
- **Shared SQLite:** authoritative provider-neutral upload session + per-part receipt (number, exact size, digest, internal ETag, lease/generation), app/project ownership, name reservation, completion receipt, expiry/cleanup jobs; provider UploadId/key อยู่เฉพาะที่นี่ ไม่ส่ง raw S3 ETag/UploadId ผ่าน browser contract
- **Browser IndexedDB:** account-scoped logical IDs, file identity manifest, optional permitted file handle, UI preference และ last checkpoint เท่านั้น ไม่ใช่ source of truth ไม่ persist cookies, public share secrets หรือ service credentials
- หลีกเลี่ยง D1 write ทุก progress event/part; provider เก็บ part receipts และ Pages อ่าน status แบบ bounded/paginated ไม่มี distributed transaction ระหว่าง D1/SQLite/Garage ต้องออกแบบ idempotency และ reconciliation ตั้งแต่แรก
- ไม่ใช้ long-running Pages background job เพื่อประกอบ 10 GiB; Garage ประกอบ multipart, Shared durable job ทำ finalize/cleanup; worker process/scheduled job ต้อง provision ใน phase ที่ได้รับอนุญาต

## 4. Proposed API endpoint contracts

ทุกอย่างในส่วนนี้ **PROPOSED**; รักษา existing response envelope `{ data: ... }` และ normalized errors ของ Nexora API Existing `/files` small-upload ยังอยู่ระหว่าง compatibility rollout ไม่เปลี่ยน maxUploadBytes เดิมให้หมายถึง resumable maximum

Base `B = /api/storage/v1/storages/:storageId` (IDs logical เท่านั้น)

| Method / path | Contract / response |
| --- | --- |
| `GET B/capabilities` | additive `transfers: { resumableUpload, rangeDownload, maxFileBytes, partSizeBytes, maxParts, maxParallelParts, sessionTtlSeconds }`; ส่ง enabled เฉพาะเมื่อทุกชั้นพร้อม; absence = unsupported, ไม่อนุมานจาก upload:true |
| `POST B/uploads` | JSON `{name,parentId,sizeBytes,mimeType,partSizeBytes?,fileManifestVersion}` + `Idempotency-Key`; server negotiate และตอบ 201 `{transferId,state,partSizeBytes,partCount,sizeBytes,expiresAt,version}` ไม่มี provider refs |
| `GET B/uploads?cursor&limit` | own sessions เท่านั้น default 20/max100, opaque scoped cursor, expired/terminal ตาม bounded retention; ไม่เปิด catalog ข้าม user |
| `GET B/uploads/:transferId?partsCursor&limit` | authoritative state, acknowledgedBytes, version, final object/operation ถ้ามี, receipts `{partNumber,sizeBytes,sha256}` paginated default100/max1000 และ nextCursor |
| `PUT B/uploads/:transferId/parts/:partNumber` | raw `application/octet-stream` Blob slice, expected bytes และ `X-Part-SHA256` (base64 SHA-256 32 bytes); server derive offset/size จาก session, นับ stream จริง ไม่เชื่อ client length; ตอบ 200 receipt หลัง durable provider acknowledgement เท่านั้น |
| `POST B/uploads/:transferId/pause` | CAS `{version}`; หยุดรับ parts ใหม่/เพิ่ม generation แล้ว reconcile in-flight ก่อนตอบ paused; acknowledged parts เก็บอยู่ |
| `POST B/uploads/:transferId/resume` | CAS `{version}`; reauthorize/expiry/parent/reservation แล้วตอบ uploading state; idempotent retry ด้วย action key |
| `POST B/uploads/:transferId/complete` | `{version}` + Idempotency-Key, client ไม่ส่ง S3 part manifest; server ตรวจ receipts ครบ/size/digest/order และ final parent/name/auth; 202 completing แล้ว poll status หรือ 200 completed receipt เมื่อเสร็จ |
| `DELETE B/uploads/:transferId` | idempotent abort; 202 cancelling ถ้ามี in-flight/cleanup แล้ว GET status จน cancelled; completed แล้ว 409 ห้ามแอบลบ completed file |
| `HEAD B/objects/:objectId/download` | same read+download auth, zero body; exact Content-Length ของ representation, strong opaque ETag, Last-Modified, Accept-Ranges: bytes เมื่อรองรับ |
| `GET B/objects/:objectId/download` | full 200 หรือ single-range 206 พร้อม Content-Range และ length ของช่วง; Range + If-Range ตามส่วน 6; legacy `/files/:id/download` ต้องมี semantics เดียวกันหรือย้าย caller อย่างชัดเจน |

Status/error proposal: 400 malformed size/part/range syntax; 401 reauthenticate; 403 revoked/readonly/policy; 404 unavailable/not-owned; 409 version/content conflict or missing parts; 410 expired owned session; 413 exceeded file/part bytes; 422 unsupported capability/checksum mismatch (ใช้ safe error code เพิ่มที่ reviewed allowlist); 429 พร้อม bounded Retry-After; 502/503/504 transient/unknown outcome ให้ reconcile ก่อน retry ห้าม normalize 416 ของ download เป็น generic 502

Shared API ภายในใช้ `/v3/projects/:projectId/uploads` และ `/:uploadSessionId/{parts/:n,pause,resume,complete}`/DELETE/status/list ที่ semantics เดียวกัน แต่ตรวจ bearer app identity + project ownership ทุกครั้ง ใช้ idempotency key ซึ่ง Nexora derive จาก user/mount/transfer/action เพื่อไม่ชนข้าม caller คืน logical provider-neutral session/object IDs และ receipts เท่านั้น Session ID ไม่ใช่ authorization token

Part retry semantics: unique `(session, partNumber)`; receipt เดิม+digest เดิมตอบเดิม, bytes/digest ต่างตอบ 409; serialize writes ต่อ part ด้วย durable lease/generation ไม่ให้ retry request เก่าทับใหม่ server คำนวณ digest จาก bytes ที่รับ ไม่เชื่อ client header ถ้า digest verify หลัง UploadPart ต้อง mark untrusted ก่อน และห้าม complete จน verify ผ่าน; อาจ buffer **เพียง 8 MiB part** เพื่อ hash ก่อนส่งเมื่อ SDK/provider ต้องการ replayable body ต้อง benchmark RSS และรวมอยู่ใน budget

Create/complete ต้อง recover เมื่อ timeout หลัง upstream commit: persist creating intent ก่อน call, upstream create ใช้ stable idempotency key, discover session เดิมด้วย key; complete receipt stable objectId และ durable finalization job; duplicate request ไม่สร้าง second object/activity event

## 5. Upload state machine และ progress

```text
Client: selected → queued → creating → uploading → completing → completed
                                    ↘ retry_wait → reconciling → uploading
uploading → pausing → paused → reconciling → uploading
any resumable state → needs_auth / needs_file / blocked → reconciling
nonterminal → cancelling → cancelled
nonterminal → expired / failed (terminal reason; retry may require new session)

Server: creating → active ↔ paused → completing → completed
                   ↓          ↓
                cancelling → cancelled
                   ↓
                 expired → cleanup_pending → cleaned
```

- Client pause หยุด scheduling และ abort active HTTP; server pause/generation barrier ตรวจผล in-flight ก่อนเรียก paused อย่าคิดว่า abort client = rollback upstream
- Shared complete ใช้ CAS state และ leases ปิดรับ part write, ListParts reconciliation, exact expected count/last part size, provider CompleteMultipartUpload, stat/size verification และ SQL commit เผยแพร่ logical file เฉพาะเมื่อพร้อม
- Complete response XML/provider status ต้อง parse ด้วย SDK และตรวจ operation สำเร็จ ไม่ถือ HTTP 200 เพียงอย่างเดียวเป็น success
- Cancel กับ complete ใช้ atomic transition: ถ้า completing ชนะ ให้ status ติดตามผล ไม่ลบ finalized object อัตโนมัติ; ถ้า cancel ชนะ ไม่ publish object และ cleanup ที่ bounded retry
- UI progress หลัก = unique durably acknowledged bytes / file size; มี sublabel in-flight transport bytes จาก XHR.upload.onprogress ของ raw Blob part ไม่มี fake byte animation การส่งถึง Pages ยังไม่ใช่ Garage committed
- Transport progress อาจเริ่มใหม่หลัง retry; committed counter ไม่ double count และไม่ครบ 100% completed ก่อน finalize ยืนยันสำเร็จ แสดง Finalizing แยกเมื่อ bytes ครบ
- XHR ใช้เฉพาะ upload part progress ไม่มี dependency ใหม่ speed ใช้ moving window ของ payload bytes ที่แยก retry traffic ออกจาก unique committed bytes, ETA = remaining/smoothed committed rate; ถ้าข้อมูลไม่พอ/paused/stalled ให้ unavailable และไม่มี ETA ระหว่าง finalize ที่ไม่ทราบระยะ
- Retry network/408/429/5xx แบบ exponential backoff+jitter (เสนอ 1/2/4/8/16 s, max5 ต่อ part, respect Retry-After ที่ clamp); offline ไม่กิน attempts, online เป็นเพียง hint; 401 หยุดทั้ง owner queue, 403/409/410/413 ไม่วน retry ไม่จำกัด; lost receipt ให้ GET/reconcile ก่อน resend

## 6. Download Range contract และ state machine

HTTP semantics อ้างอิง RFC 9110 §§13.1.5, 14 แต่ policy single-range เป็นข้อเสนอของ Nexora:

1. รองรับ `bytes=start-end`, `bytes=start-`, `bytes=-suffix`; parser ป้องกัน overflow, negative/inverted และ excessive header length; endpoint ยังตรวจ auth ก่อนเปิดเผย total length
2. `206` ส่ง `Content-Range: bytes start-end/total`, exact Content-Length, stable strong ETag และ Accept-Ranges; `200` เต็มไฟล์เมื่อไม่มี Range หรือ If-Range ไม่ match; `416` ส่ง `Content-Range: bytes */total` เมื่อไม่มีช่วงที่ satisfiable; หลายช่วงที่ valid ให้ ignore Range แล้ว 200 ตาม documented policy แทน multipart/byteranges ในรุ่นแรก
3. If-Range ใช้ **strong** opaque representation ETag; weak tag ห้ามใช้ resume; date validator ใช้ได้เฉพาะเมื่อยืนยัน strong date semantics จึงเลือก ETag สำหรับ managed client ไม่พึ่ง timestamp อย่างเดียว
4. Shared ส่ง conditional S3 GET (เช่น IfMatch ที่ adapter ตรวจรองรับจริง) ผูกกับ stat/version เพื่อป้องกัน object เปลี่ยนระหว่าง HEAD/GET; ถ้าเงื่อนไขเปลี่ยน re-evaluate เป็น full 200 หรือ fail safely ตาม HTTP preconditions ห้าม stitch คนละ representation ไม่มี blind forward ของ If-Range ไป Garage
5. Public ETag เป็น opaque app representation version ไม่มี physical key/project/hash credentials; ไม่สมมติ S3 multipart ETag = MD5 ของไฟล์ Validators ไม่ใช่ cryptographic file integrity proof
6. เก็บ original representation bytes ไม่มี compression/transformation ระหว่าง hop; strip unsafe upstream headers, no-store/nosniff/private ตามเดิม; propagate status/Range/ETag allowlist หลังตรวจความสอดคล้อง partial response อย่าใช้ streamResponse เดิมที่ hardcode 200
7. Resume local offset N ได้เฉพาะ 206 เริ่ม N, total และ ETag ตรง; ถ้าได้ 200 **ห้าม append** ให้แจ้ง restart/truncate หลังยินยอม, 416 ต้อง re-stat และตรวจ local complete ไม่สรุปว่า success จาก offset เท่าขนาดเพียงอย่างเดียว
8. ทุกรอบตรวจ session/assignment/read/download หรือ share ancestry/expiry/revoke/publicDownload policy ใหม่ การ revoke หยุด future requests แต่เรียกคืน bytes ที่ส่งแล้วไม่ได้ ระหว่าง active stream มีข้อจำกัดเดียวกับระบบเดิม

Public API ปัจจุบัน `functions/_lib/api.js` แปลง thrown error ของ public shares เป็น generic404 ทั้งหมด เมื่อต่อ Range ต้องออกแบบ safe authorized416 response โดยไม่ทำให้ total length รั่วก่อน share authorization; invalid/expired/foreign share ยังคง generic404 ไม่เปลี่ยน global error masking โดยไม่มี review ส่วน abort cleanup route ใหม่ต้องแยกอย่างเจาะจงจาก global maintenance mutation guard เดิม รักษา fail-closed ของ writes อื่น

```text
queued → needs_destination → authorizing → downloading → verifying_length
 → committing_local_file → completed
       ↓ interruption
retry_wait / paused → reauthorize → revalidate_ETag_and_local_checkpoint
 → downloading (206 only) / restart_required (200 or changed representation)
any active → cancelling → cancelled; auth failure → needs_auth
```

**Managed mode:** fetch response.body → sequential bounded stream writer ไป File System Access sink; real received bytes/speed/ETA, progress committed หลัง writer commit/checkpoint เท่านั้น ไม่มี Blob 10 GiB คิวหลายไฟล์ได้ แต่ single range stream ต่อไฟล์ในรุ่นแรก (ไม่ parallel range assembly)

**Checkpoint สำคัญ:** FileSystemWritableFileStream อาจ commit เฉพาะ close; เก็บ offset หลัง successful durable close เท่านั้น ออกแบบ download เป็น bounded Range segments (เสนอ 8 MiB) แล้ว close/checkpoint ก่อนเปิด keepExistingData/seek รอบถัดไป ต้อง benchmark เพราะ browser อาจ copy existing file ทำให้ต้นทุนสูง ถ้ายังพิสูจน์ประสิทธิภาพ/atomicity ไม่ได้ ให้ managed mode รองรับ resume เฉพาะ pause ที่ close สำเร็จ และหลัง crash ใช้ last verified durable checkpoint หรือ restart ห้ามถือ write() หรือ IDB counter ว่า bytes ลง disk แล้ว เก็บ chunk digests เพื่อยืนยัน local prefix ก่อน append และตรวจ local file ไม่ถูกแก้จากภายนอก

**Native mode:** navigation/anchor ผ่าน same-origin endpoint เหมือนเดิม; browser download manager เป็นผู้ควบคุม pause/progress/restart และอาจใช้ Range ได้หลัง server รองรับ UI Nexora แสดงได้เพียง “Handed to browser” ไม่อ้าง completed/ETA/controllable cancellation ไม่มี download session backend ใหม่ที่ไม่จำเป็น Public download เริ่มด้วย native mode; managed queue ไม่ persist capability URLs

## 7. Persistence, recovery และ cleanup

### Upload identity และ refresh/restart

IndexedDB เก็บ metadata/session manifest version, size, lastModified, name และ per-part SHA-256 ที่สร้างจาก source bytes แบบทีละ part (หรือ bounded worker) ไม่เก็บ File 10 GiB ชื่อ/size/mtime และ sampled hash เพียงอย่างเดียวพิสูจน์ว่าเป็นไฟล์เดิมไม่ได้

เมื่อ reselect/reopen handle: reauthorize owner, GET session/receipts, อ่านและ hash **ทุก acknowledged source part** เทียบ receipts ก่อน reuse (cost: อาจอ่านเกือบ 10 GiB); mismatch ห้ามผสม bytes ให้สร้าง session ใหม่ ไม่คำนวณ whole-file digest ด้วย API ที่โหลดทั้งไฟล์ ขณะอ่านต้องตรวจ source identity ซ้ำก่อน complete ป้องกัน external modification

Account namespace + session owner ตรวจทั้ง client/server; logout/account switch ยกเลิก requests และลบ metadata/handles ของ account จาก device ตาม privacy policy ไม่ resume ใต้ user ใหม่; session expiry หยุด scheduler รอ login user เดิมและตรวจ grants ใหม่ Backend sessions survive cookie expiry จน TTL แต่ไม่ใช่สิทธิ์แทน cookie

Client ตายหลัง UploadPart แต่ก่อน ack: reconcile ListParts+verified receipt journal; receipt ที่ไม่มี verified digest ต้อง verify/reupload ก่อน complete Provider upload ไม่มีแต่ DB active ให้ mark failed ไม่ประดิษฐ์ success Browser IDB ถูก evict ได้และไม่ใช่ backup; server session list ใช้ recover แล้วผู้ใช้เลือกไฟล์ใหม่

### Cross-system failure matrix

| Failure window | Required recovery |
| --- | --- |
| Shared create MPU สำเร็จ แต่ SQL receipt หาย | durable intent/provider identity journal + reconcile incomplete upload; sweeper abort orphan ตาม ownership prefix/mapping ที่เชื่อถือได้ |
| Nexora create timeout หลัง Shared commit | retry key เดิม, lookup session; ไม่ create ซ้ำ |
| Part succeeded/response lost | reconcile receipt/ListParts ภายใต้ per-part lease; ไม่บวก committed bytes สองครั้ง |
| Garage complete สำเร็จ แต่ SQLite commit ล้ม | durable completing record เก็บ intended object/key; HEAD/checksum/size แล้ว retry SQL publish เดิม; ไม่ Complete ใหม่แบบสุ่มหรือ delete object ที่อาจ publish แล้ว |
| SQLite finalized แต่ D1 ยัง completing | poll/reconcile เติม stable logical final receipt, Activity dedupe และ targeted folder cache invalidation |
| Abort fail หรือ process restart | cleanup_pending job พร้อม attempts/nextRun/lease; retry จน confirm, terminal tombstone ยังคงกัน stale request |
| Parent ถูก trash/delete, name conflict, assignment revoke | fail closed ก่อน finalize; abort unpublished MPU; ห้ามเปลี่ยน parent/name โดยเงียบ ๆ |

### Proposed retention และ resource policy

- Initial inactive TTL 7 วัน, hard lifetime 30 วัน เป็นค่าเสนอที่ต้องให้ operator อนุมัติ; renew เฉพาะ authenticated useful activity ไม่ปล่อย paused session อยู่ตลอดไป
- name reservation ปัจจุบัน 15 นาทีใช้ตรง ๆ กับ multi-day session ไม่ได้ ต้องขยายแบบ lease-bound หรือ re-reserve ตอน finalize; เลือก session-bound reservation พร้อม expiry/cleanup และตรวจ parent/name อีกครั้ง ไม่อนุญาต replace ในรุ่นแรก
- Sweeper ทุกชั่วโมงแบบ bounded batches (เสนอ 100 sessions), durable lease ป้องกันหลาย instance, mark expiring → stop new parts → drain/fence active writes → AbortMultipartUpload → verify ListParts/MPU state → release reservation/quota → tombstone retention เสนอ 7 วัน; cancellation race อาจต้อง abort ซ้ำ
- Garage lifecycle abort-incomplete เป็น defense-in-depth หลังตรวจ version/API/config จริง ไม่ถือว่าตั้งอยู่แล้ว Sweep ต้องอยู่ Shared runtime/scheduler ที่ durable; Pages waitUntil ไม่ใช่ cron หรืองาน cleanup ที่รับประกัน
- quotas ปัจจุบัน unavailable จึง **ไม่อ้างว่ามี quota enforcement** รุ่นใหม่ต้องมี explicit admission limits/reservation ledger atomic ข้าม aliases ของ project, ไม่ใช้ mount counter ที่หลบได้ด้วยหลาย assignment; reserve expected bytes/session แล้ว release ตาม confirmed abort/complete พร้อม reconciliation

## 8. Browser support และข้อจำกัดของการปิดหน้า

ตารางนี้เป็น design support tiers อ้างอิง MDN browser-compat-data ณ วัน audit ไม่ใช่ browser QA; ตรวจ feature จริง, secure context, user gesture และ permissions ทุกครั้ง

| Browser | Upload ขณะหน้าเปิด | Refresh / restart upload | Managed download/resume | Background / mobile |
| --- | --- | --- | --- | --- |
| Chrome/Edge desktop ที่รองรับ picker | slice + XHR parts | optional persisted file handle, repermission + receipt/hash validation; fallback reselect | File System Access writer ถ้าผ่าน checkpoint/performance tests; native fallback | ไม่รับประกันหลังปิดหน้า/browser; OS sleep หยุดได้ |
| Firefox desktop | slice + XHR parts | IDB metadata + reselect source file | ไม่มี showSaveFilePicker ตาม BCD; native browser download | ปิดหน้าไม่โอนต่อ ไม่มี app progress ของ native download |
| Safari macOS | slice + XHR parts | IDB + reselect; persistence อาจถูก evict | native download fallback | tab suspension/OS lifecycle ต้อง recover เมื่อกลับมา |
| Chrome Android รุ่นรองรับ / Edge Android ต้องตรวจ runtime | foreground parts, concurrency เริ่มต่ำ | source reselect หรือ handle ถ้ามีและ permission ยังใช้ได้ | BCD ระบุ Chrome Android picker ตั้งแต่ 132; **อย่าเหมารวมว่าทุก Android ไม่มี** เปิด managed mode เฉพาะผ่าน device tests, native fallback | OS อาจฆ่า process, scoped storage/disk/battery restrictions; ไม่มี unattended guarantee |
| Safari iOS / other iOS browsers / WebViews | foreground best effort, device/file-provider test | reselect source เป็น baseline | native fallback จน feature detection+device tests ยืนยัน | lock screen/background/app switch อาจหยุด; 10 GiB ไม่รับประกัน |

IDB/OPFS ไม่เท่ากับ durable user-selected disk file ไม่มีการเก็บ duplicate 10 GiB ใน origin storage เป็น default เพราะ quota/eviction/private mode OPFS หรือ Service Worker ไม่ได้แก้ guaranteed background execution/automatic final save จึง defer จนมี use case และ verification จริง Browser restart รองรับ **การกลับมาทำต่อหลังผู้ใช้เปิดแอป** ไม่ใช่ transfer ต่อระหว่างปิด browser

## 9. Security, performance และ limits

- ทุก endpoint ใหม่ต้องเพิ่มใน fail-closed `requiredStoragePermissions` route mapping: upload create/status/part/pause/resume/complete = active assignment + upload (และ read เมื่อเปิดเผย object metadata), managed download HEAD/GET = read+download; cleanup DELETE ต้อง owner-bound safety path ที่ยกเลิก unfinished session ได้แม้ upload grant ถูกถอน โดยห้ามเปิดให้อ่าน bytes หรือ abort session คนอื่น; maintenance/readOnly ต้องหยุด writes ใหม่แต่อนุญาต trusted cleanup
- Recheck owner/mount/access/current provider capability/maintenance ต่อ request และก่อน final commit ไม่เอา snapshot permissions วันที่ create มาใช้ตลอด session; inactive project/provider mapping เปลี่ยนให้ block ห้าม resume ลง project ใหม่ด้วย mount เดิม
- Cookie sessions, Origin checks และ CSRF protections เดิม; no public upload endpoint, no cross-storage transfer, no overwrite/replace assumption, validate names/MIME/IDs/size/part count/digest และ SQL parameters server-side
- Log เฉพาะ stage/status/allowlisted result/binding presence ห้าม body, credentials, session tokens, public capability path, provider IDs/references; metrics แบบ aggregate active/retry/latency/cleanup age ไม่มี secret labels
- Suggested initial 8 MiB part = 8,388,608 bytes; 10 GiB = **1,280 parts** ต้อง paginate ListParts (S3 docs limit 1,000/page), completion manifest ไม่มาจาก browser
- S3 standard non-final part min 5 MiB, max10,000 parts; Garage deployment compatibility ต้อง test แยก ไม่ใช้ Amazon maximum object size แทน Garage limits Part size อาจ negotiate larger เมื่อเพิ่ม maxFileBytes แต่ยังต้องต่ำกว่า smallest verified request body limit ทุก hop
- เริ่ม 2 active files × 2 parts แต่มี **global 4 upload requests ต่อ account/browser**, download managed 2 files × 1 stream, mobile default1–2 uploads; existing preference 5 files เป็น file scheduling limit ไม่คูณโดยไร้ global budget server enforce per-user/per-project quotas/rate/session caps ข้าม tabs/devices ไม่พึ่ง UI
- ถ้า buffer 4 × 8 MiB payload = 32 MiB เป็นเพียง payload floor ไม่ใช่ peak RSS; parser/SDK copies/hashing/socket buffers/concurrent downloads ต้องวัด บน Pages streaming/backpressure ไม่มี full-file read; Hono new raw-part route เลี่ยง legacy whole-file parser; ไม่เพิ่ม AWS SDK ใน browser/Pages
- Proposed admission cap 10 GiB/file, max10 active sessions/user, hard global service budgets และ expected-byte reservations; ค่าเหล่านี้ยังไม่ใช่ production config ต้อง derive จาก measured capacity และ authorization ของ reporting แยกจาก existing unavailable usage endpoint
- เปลี่ยน default total15s/60s ใน transfer routes เป็น connect/header deadline + idle-byte deadline + bounded per-part operation timeout ที่สัมพันธ์ slow-network target; slow 1 Mbit/s ใช้ ~67s ต่อ 8 MiB จึงเสนอ part total180s/idle30s สำหรับ benchmark ไม่ใช้30s hard ceiling เดิมอย่างเดียว ทั้งหมดต้องต่ำกว่า verified proxy timeout และมี minimum-rate policy กัน slowloris
- Existing metadata calls เก็บ short bounded timeout; retries ไม่เพิ่มพร้อมกันทั้ง SDK+client จนเกิด retry amplification Complete ที่เกิน request deadline ให้ durable202 job แล้ว poll
- Cloudflare official runtime memory128 MB/isolate และ zone body limit ตาม plan (Free/Pro100 MB, Business200 MB, Enterprise adjustable) ทำให้ chunking จำเป็น การ stream response ไม่ติด explicit body cap ไม่แปลว่าไม่มี CPU/request/connection/subrequest/egress/cost constraints
- 1,280 part requests/file บวก status/auth/capability/D1 operations และ retries ต้อง cost/load-test; avoid unbounded poll และ per-progress D1 writes, fair scheduling กัน starvation rate-limit expensive routes และ pending session creation
- ไม่เพิ่ม Durable Objects, queue service, parser package หรือ storage subsystem ใหม่โดยอัตโนมัติ ใช้ D1/Shared SQLite durable CAS+jobs ก่อน; ถ้า measured contention ไม่ผ่านค่อยเสนอ architecture เพิ่มพร้อมเหตุผล

## 10. Infrastructure constraints ที่ยังไม่ปิด

ต้องตรวจโดย operator/isolated integration environment ก่อนเปิด feature; **ไม่รัน production commands ใน Phase 1**:

1. ระบุ deployed source/image digest/Garage version และ confirm API multipart/Range/conditional GET/checksum support บน disposable bucket/project ที่ได้รับอนุญาต
2. Cloudflare Pages/Workers plan, request+CPU+daily quotas, concurrent connections, D1 read/write/storage limits, Access session/service-token behavior, WAF request/body/rate policy และ Tunnel/reverse proxy buffering/timeouts จริงตลอดทั้งสอง hops
3. Docker Node memory/CPU limits, RSS ขณะ many parts, open file/socket limits, HTTP disconnect propagation, SQLite WAL contention/disk sync, metadata backup/recovery และ disk full behavior ไม่อ่าน runtime DB เพื่อ inventory
4. Garage free physical capacity/replication/headroom/MPU overhead/unfinished retention, filesystem max file/object policy, disk write/read throughput, network/egress และ 10 GiB completion latency; logical usage ยังไม่ใช่ physical space/quota
5. Cleanup scheduler owner, restart policy, alert/runbook, trusted app/project identity และ alias-aware admission; no cleanup command ที่ลบ MPU ของ service อื่น
6. Multi-device auth expiry, permissions change, logout and account deletion/mount remapping while sessions exist; backup ของ D1 + SQLite + Garage ต้องมี reconciliation ไม่แค่ snapshot แยก
7. Local disk space และ browser/file provider ทำงานกับ 10 GiB จริง รวม writer close/keepExistingData costs, mobile suspension และ private storage quota

## 11. Implementation phases และ dependency order

| Phase | Nexora | Shared Storage / infrastructure | Exit gate |
| --- | --- | --- | --- |
| 1 (งานนี้) | audit/contract/plan เท่านั้น | read-only source inspection | findings vs unknowns ชัดเจน |
| 2: contract + isolated probe | finalize permission matrix, schemas, capability/error compatibility | **ต้อง explicit authorization แยกก่อนแก้ repo**; pin environment, disposable MPU/Range/IfMatch/abort/limits probe | ยืนยัน provider path, budget และ 10 GiB feasibility; contract review |
| 3: durable upload core | additive D1 session broker/idempotency/authorization, raw-part streaming API และ mocks | provider-neutral methods + Garage multipart adapter, SQL parts/reservations/jobs, crash reconciliation+cleanup | retry/complete/cancel races และ orphan recovery tests ผ่านก่อนเปิด UI |
| 4: uploader + Transfer Manager | hook/service separation, file+part scheduler, XHR progress, pause/resume/cancel, bounded retries, workspace-level shared panel | load/backpressure/budget metrics | small/large interrupted uploads, accurate committed counters, accessibility |
| 5: Range downloads | preserve 200/206/416+HEAD/validators, native fallback แล้ว managed writer/queue | Range+conditional GET adapter/route และ stream timeout policy | no corrupt append + sink crash recovery และ browser support tier ผ่าน |
| 6: persistence + hardening | account-scoped IDB/file handles, cross-tab lease, reselect hash verification; public Range review แยก | TTL sweeper/alerts, quotas, rolling-version compatibility | refresh/restart/multi-device/security tests ผ่าน |
| 7: controlled rollout | disabled-by-default capability gates, manual test evidence, rollback docs | operator-approved migrations/config/deploy เท่านั้น | production smoke และ monitored 10 GiB success ก่อนโฆษณา support |

เริ่มจาก Shared contract/proof ไม่ยก cap UI ก่อน dependency พร้อม แต่ละ phase merge ได้แบบ feature ปิดอยู่ รักษา legacy small upload/preview/native download และ UI conventions (`cx`, shared Button, aria labels, reduced motion) Transfer Manager อยู่ระดับ authenticated workspace เพื่อไม่สูญคิวเมื่อเปลี่ยน route; public routes ไม่ mount private providers

## 12. Automated และ manual test plan

### Automated (ต้องเพิ่มใน implementation phases; ยังไม่ได้สร้างใน audit)

- Contract/permissions: owner/nonowner, assignment Viewer/Contributor/Editor/Full, grant revoke ระหว่าง parts/finalize, readOnly/maintenance/inactive mount, project/app spoof, CSRF, ID tampering, provider ref leakage และ public ancestry expiry/revoke policy ทุก Range
- Size/framing: 1 byte, last part <5 MiB, exact8 MiB, 8 MiB+1, exact10 GiB, 10 GiB+1, invalid/overflow, absent/false Content-Length, overrun/truncation stream, checksum mismatch, too many parts และ ListParts >1,000 pagination ใช้ generated streams/virtual file ไม่ allocate10 GiB ใน unit test
- Idempotency/races: duplicate same/different body, same part concurrent writers, lease expiry/stale generation, two tabs, complete-vs-part/cancel/pause/expiry, create/part/complete ack lost, SDK success+DB fail, process deathทุก checkpoint, GC retry, session remap และ duplicate activity event
- Recovery: offline/online, Retry-After caps, max retries, 401/relogin same/different account, server authoritative receipts vs stale IDB, wrong file same name/size/mtime, source modified, denied handle, IDB eviction/quota/private mode
- Download: full/HEAD, valid open/end/suffix ranges, multi-range policy, malformed/unsatisfiable/empty file, ETag stable/change/weak, If-Range match/mismatch/date, conditional GET race,200-on-resume no append,206 wrong offset/length/tag,416, disconnect/cancel, corrupted prefix และ disk/writer fail-close/reopen checkpoints
- Performance invariants: actual max active requests across files/tabs/server identity; backpressure, aborted upstream readers, no full-file concatenation, no per-byte D1 writes, fair scheduling and queue cleanup; integration measure RSS/heap แทน assert memory จาก mock อย่างเดียว
- UI (Vitest/Testing Library existing setup): progressbar real values/status, finalizing vs completed, native handed-off label, bounded ETA/no fake results, keyboard/focus/pause/resume/retry/cancel, route changes/account isolation และ reduced motion

### Manual / isolated integration acceptance

1. ใช้ synthetic non-sensitive data ขนาด25 MiB boundary, 1 GiB, **10 GiB exact และไฟล์เกิน target** บน disposable storage ผ่าน Browser→Pages→Shared→Garage ครบ ห้าม bypass Pages แล้วถือว่าผ่าน
2. ตรวจ full source/output SHA-256 ด้วย streaming tools, exact size, stable logical object และ single visible file, no bytes exposed before finalize
3. ตัด network ที่ต้น/กลาง/ท้าย part และก่อน/หลัง complete response, throttle1 Mbit/s/high latency/loss, expire cookie/Access, restart Node/Tunnel และ retry/reconcile; เลือก source ใหม่หลัง refresh/browser restart และ verify ไม่อัปโหลด part ที่ acknowledged ซ้ำโดยไม่จำเป็น
4. Concurrent files (including preference5), upload+download พร้อมกัน, two tabs/devices, low disk, queue cancel+pause race; ตรวจ CPU/RSS/FD/SQLite locks/connection count/request charges และ cleanup inventory ด้วย tooling ที่ redact secrets
5. Download stop/resume กับ strong ETag เดิม, เปลี่ยน representation ระหว่าง resume, truncate/edit local destination, kill browser ก่อน writer.close และหลังcloseก่อนIDB checkpoint ตรวจว่าห้าม append ผิดไฟล์
6. Chrome/Edge desktop, Firefox, Safari macOS, Chrome Android supported version และ Safari iOS บนอุปกรณ์จริง: foreground, lock screen/background, app switch, refresh/restart, denied permission, native download behavior, responsive Transfer Manager และ assistive labels
7. TTL expire+restart cleanup, missing provider session, failed abort retries และ orphan complete reconciliation ตรวจ incomplete parts/space กลับคืนจริง ไม่สรุปจาก UI cancelled อย่างเดียว
8. บันทึก versions/plan/topology/file sizes/throughput/time/peak memory/requests/checksum/remaining MPU โดยไม่ log credentials หรือ capability URLs; staging sign-off ก่อน separately approved production rollout

Acceptance: อย่างน้อย10 GiB upload+download checksumตรง, interrupted part recovery, safe resume200/206 behavior, verified cleanup, bounded resource use และ explicit browser tiers ถ้า mobile ไม่ผ่าน ห้ามโฆษณาว่ารองรับทุก browser

## 13. Known trade-offs และ implementation proposal

**ข้อเสนอหลัก:** เพิ่ม persistent provider-neutral upload sessions ใน Shared Storage ก่อน เชื่อม Nexora authorization/session broker และ 8 MiB part proxy จากนั้นเพิ่ม Transfer Manager และ Range download โดยคง preview limits เดิม ไฟล์10 GiB คือ release gate หลัง isolated end-to-end evidence ไม่ใช่เพียงแก้ constants

- Same-origin proxy รักษา security boundary แต่เพิ่ม bandwidth/latency/request cost ทั้งสอง hops; direct S3 URLs อยู่นอกข้อกำหนดนี้
- 8 MiB ลด replay cost แต่10 GiBมี1,280 parts และ metadata operations มากขึ้น slow network ต้องใช้ per-part timeout ที่วัดแล้ว
- Correct recovery ต้องใช้ durable coordination across D1/SQLite/Garage ไม่มี atomic transaction ข้ามระบบ complexity นี้จำเป็นเพื่อไม่ให้ duplicate/corrupt/orphan files
- Strict reselect verification อาจต้องอ่าน acknowledged bytes ทั้งหมดและเสียเวลา; sampled fingerprintsเร็วกว่าแต่ไม่เพียงพอสำหรับรับประกันไฟล์เดิม
- Managed download progress/pause/resume มีได้เฉพาะ browser+sink ที่พิสูจน์แล้ว native fallback รองรับ download แต่แอปไม่รู้ผลสำเร็จ การรับประกัน identical Transfer Manager capabilities ทุก browser ยังทำไม่ได้ภายใต้ข้อจำกัดนี้
- **Required before implementation enabled:** reviewed contract/permission mapping, separately authorized Shared changes, durable session+cleanup, Range validators, measured limits, test evidence และ rollout approval
- **Optional/deferred:** parallel rangesต่อไฟล์, whole-file checksumworker ใหม่, OPFS duplicate payload storage, Service Worker background transfer, cross-device source-byte continuity, direct provider links และ infrastructure framework ใหม่

## 14. Official references และ validation ของ Phase 1

- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/): runtime memory, body limits, request duration/CPU/connection budgets ต้องตรวจ plan จริง แยก wall time จาก CPU
- [Cloudflare streaming API](https://developers.cloudflare.com/workers/runtime-apis/streams/): stream/backpressure แทน whole-body materialization
- [Garage S3 compatibility](https://garagehq.deuxfleurs.fr/documentation/reference-manual/s3-compatibility/): multipart endpoint support ระดับ documentation ไม่ใช่ installed-cluster test
- [Garage upstream Range implementation](https://raw.githubusercontent.com/deuxfleurs-org/garage/main-v2/src/api/s3/get.rs): Range/ETag headers และ partial GET; main-v2 ไม่ใช่ pinned deployment
- [Amazon S3 multipart limits](https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html): part geometry/ListParts pagination ใช้เป็น interoperability reference ไม่อนุมาน Garage maximum size
- [RFC 9110 If-Range](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.5) และ [Range requests](https://www.rfc-editor.org/rfc/rfc9110.html#section-14): validator และ200/206/416 semantics
- [MDN browser compatibility source: Window pickers](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Window.json): desktop/mobile picker support ตรวจ runtime อีกครั้ง
- [Chrome File System Access](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access): serialized handles, repermission, user gesture และ writable file behavior
- [Browser quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria): persistence ไม่เท่ากับ unlimited/durable payload storage

Phase 1 validation: source audit และ official-document review **PASS**; diff/เอกสาร checks บันทึกผลจริงใน `PROJECT_HANDOFF.md` ไม่ได้รัน upload/download10 GiB, browser/provider tests, production probes หรือ remote operations runtime test/lint/build ไม่จำเป็นสำหรับ documentation-only change และไม่ใช้ผลเก่ามาอ้างว่าผ่านรอบนี้
