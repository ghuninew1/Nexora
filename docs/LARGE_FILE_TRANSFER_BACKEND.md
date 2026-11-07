# Large File Transfer — Backend multipart implementation

วันที่: 2026-11-07 · สถานะ: **implemented locally, disabled by default; infrastructure acceptance pending**

เอกสารนี้ต่อจาก `LARGE_FILE_TRANSFER_PLAN.md` โดยทำ backend scope ของ Phase3 และ contract groundwork จาก Phase2 เท่านั้น Phase2 real-provider/limits probes ยังไม่ผ่าน gate เพราะไม่ได้เชื่อม test Garage ที่ได้รับอนุญาต จึงไม่เปิดใช้งานหรืออ้าง production-ready10 GiB

## Implementation และไฟล์หลัก

### Nexora

- `migrations/0011_transfer_sessions.sql`: D1 metadata broker ผูก transferId กับ authenticated user, mount, immutable original project mapping, create key hash, fingerprint, expiry และ Shared logical session mapping; ไม่มี file bytes/provider credentials
- `functions/_lib/upload-sessions.js`: create/status/parts/list/pause/resume/complete/cancel; validate/normalize provider responses ผ่าน allowlist, same-origin API, current assignment/upload grants, readOnly/maintenance/provider capabilities และ recheck ก่อน complete; raw part stream นับ exact size โดยไม่ buffer ใน Pages
- `functions/_lib/api.js`, `storage-api.js`, `storage-permissions.js`: narrow route integration และ creator-only cancellation exception เพื่อ cleanup ได้หลัง grant revocation/maintenance; unknown routes เดิมยัง fail closed
- `functions/_lib/storage-client.js`: allowlist transfer headers, bounded response64 KiB, operation-specific270s deadline; metadata/small-file/download timeout เดิมไม่เปลี่ยน ไม่ forward browser Authorization หรือ arbitrary headers
- `functions/_lib/http.js`: normalized conflict/expired/busy/checksum errors
- `functions/_lib/activity.js`: optional trusted deterministic event ID กัน duplicate upload events หลัง complete retry โดยยัง best effort และใช้ retention เดิม; ปกติยังใช้ random ID
- `tests/upload-sessions.test.js`: broker/auth/bounds/idempotency และ optional bridge ผ่าน Shared Hono/SQLite/Garage adapterจริง โดย mock S3 transport เท่านั้น

### Separate Shared Storage checkout

Local path: `../issuedesk/garage/storage` แก้เฉพาะ source/tests/additive migration และเอกสารตามคำขอรอบนี้ ไม่ได้ย้าย backend มาไว้ใน Nexora

- `migrations/0002_resumable_uploads.sql`: sessions, immutable part digest/receipt journal, session leases, create cancellation tombstones และ service-wide part-buffer leases
- `src/storage/multipart-provider.js`: existing AWS SDK commands สำหรับ create/part/listParts/listUploads/complete/abort/head/delete; provider identifiers/ETags อยู่ภายใน ไม่มี direct browser/presigned Garage URLs
- `src/storage/uploads.js`, `upload-routes.js`: persistent manager + authenticated app/project routes, reservations, bounded part buffering/hash, lost acknowledgement recovery, serialized finalize/cancel, lease fencing ก่อน acknowledge/publish และ transactional logical-file publication
- `src/storage/providers/garage.js`, `manager.js`, `file-manager-routes.js`, `errors.js`, `app.js`, `index.js`: narrow integration, capabilities, disabled-default flag และ cleanup startup/hourly
- `tests/uploads.test.js` และ existing `tests/storage.test.js`: real SDK command mocks, normal multipart/interruption/retry/SQL failure/duplicate completion/auth/cancel/expiry/admission/lease takeover/pagination>1000 tests; existing small-file regressions retained
- `MULTIPART_UPLOADS.md`: service setup/contract/limits/recovery boundary; IssueDesk README/AGENTS/handoff synced

## Actual browser-facing contract

Base `B=/api/storage/v1/storages/:storageId`; responses ใช้ `{data: ...}` ตามเดิม

| Method/path | Input / behavior |
| --- | --- |
| `GET B/capabilities` | additive `transfers.resumableUpload`; true เฉพาะ flag+effective upload permission+exact compatible provider geometry; existing client ยังไม่ใช้ field นี้ |
| `POST B/uploads` | `{name,parentId,sizeBytes,mimeType}` + `Idempotency-Key` (1–128 allowlisted characters);201 logical transfer receipt; keyเดิม+metadataต่าง409 |
| `GET B/uploads?cursor&limit` | own broker snapshots, default20/max100; `statusSource: broker-snapshot` ชัดเจน ไม่ใช่ live provider status; GETรายsessionเพื่อ reconcile |
| `GET B/uploads/:transferId?partsCursor=0&limit=100` | state/version, geometry, expiry, unique acknowledged bytes, verified part digests และ nextCursor; provider ListParts reconciliation ทุกครั้งที่ active/paused |
| `PUT B/uploads/:transferId/parts/:n` | raw Blob slice, `Content-Type: application/octet-stream`, `X-Part-SHA256` base64 SHA-256; exact part bytes;200 durable receipt; digestเก่าต่าง409, checksumผิด422 |
| `POST B/uploads/:transferId/{pause,resume,complete}` | `{version}`; CAS pause/resume/first completion, serialized operations, duplicate completionคืน objectเดิม; complete retryหลัง uncertain outcomeใช้HEAD/session markerและ SQL journal |
| `DELETE B/uploads/:transferId` | creator-owned cancellation แม้ grantถูกถอน/mount readOnly/maintenance/featureปิด; original project mappingต้องเดิม; completing/completed409; transient cleanup failให้retry |

Session receipt มี `transferId,state,version,sizeBytes,partSizeBytes,partCount,expiresAt,acknowledgedBytes,parts,nextCursor` และ `object` เมื่อ completed ไม่ส่ง Shared session ID, providerUploadId, bucket/key/project ID หรือ S3 ETags ให้ browser

Nexora ใช้ Shared internal `/uploads` endpoints และ internal `DELETE /uploads/by-key/:key` เพื่อยกเลิก create ที่ response หาย โดยไม่เริ่ม MPUใหม่ การสร้างส่ง `expiresAt` จาก broker ไป serverภายในเพื่อให้ทั้งสองระบบมี absolute expiryเดียวกัน; browserเลือกexpiryไม่ได้

Errors:400 invalid input,401 auth,403 denied,404 unavailable/nonowner,409 conflict/busy operation,410 expired session,413 size,422 checksum/unsupported,429 admission busy และ502/503/504 incomplete/transient/unknown outcome การ complete ที่ผลไม่ชัดเจนไม่ได้ส่ง fake success/202; pollสถานะแล้วretryด้วย logical sessionเดิม

## Limits และ recovery ที่ implement จริง

- Max declared file10 GiB; fixed8 MiB parts,1280 parts; **1 part/operationต่อsession** ในรุ่นแรก หลายsession/fileทำงานพร้อมกันได้ สูงสุด4 leased part buffersรวมserviceบน SQLite DBเดียวกัน (32 MiB payload floor ไม่ใช่ peakRSS guarantee)
- Shared admission20 unfinished sessions/100 GiB declared pending bytesต่อproject; Nexora10 unfinished broker rowsต่อuser เป็น safety budgets ไม่ใช่ authoritative usage/physical quota และไม่เปลี่ยน usage-unavailable APIเดิม
- Fixed7-day TTL ไม่ต่ออายุอัตโนมัติ ไม่มี30-day rolling lifetimeในรุ่นนี้ Session/part journals persisted; file bytesมีเฉพาะ provider และ bufferไม่เกินpartใน Node
- Shared totaloperation4min/session lease15min; caller cancellationหยุดbodyread แต่ partที่ส่งถึงproviderแล้วอาจcompleteได้ ให้GETreconcile ไม่สรุปrollbackจากabort HTTP
- Operation lease/tokenตรวจซ้ำก่อน provider command, durable part acknowledgement และ SQL publish ป้องกัน stale worker ที่ตื่นหลัง lease takeoverเผยแพร่ไฟล์ ส่วน immutable digest journal ทำให้ part retryเขียนได้เฉพาะbytesเดิม
- Partsที่ไม่มี durable ETag receipt แม้ ListPartsพบจะไม่ถูกอ้างว่าตรวจแล้ว ต้องretrysame bytesเพื่อได้ verified receipt Lost receiptไม่ทำให้ committed counterนับซ้ำ
- Name reservationผูกกับsession expiry ตรวจparent/nameอีกครั้งก่อนfinalize และ published metadataอยู่ใน SQL transactionเดียวกับcompleted state
- Completeหลัง providercommitแต่response/SQLcommitล้มเหลวทิ้งstatecompleting; retryverifyHEAD size+session markerแล้วpublishlogicalobjectเดิม ไม่มี unattended finalize workerเมื่อผู้ใช้ไม่กลับมาretry
- Sweeper startup+hourly20rows/batch ใช้originalprojectmappingแม้projectdisabled; expire/abort, removeเฉพาะmatching unpublished completedobject, release reservationหลังconfirmed cleanup; retry failuresและ recheckcancelled/expired tombstones เพื่อเก็บlate provider effects
- การcancel sessionที่completingต้องรอresolve/expiry cleanup ไม่ลบcompleted file หากถูกถอนuploadgrantระหว่างuncertain completeและยังไม่publish ให้operator/expiry cleanupจัดการต่อ ห้ามbypassauthorizeเพื่อcomplete
- Journals/tombstonesยังไม่pruneโดยอัตโนมัติ เพื่อไม่ทำลายidempotency semantics ต้องมีretention/admission reviewและalertsก่อนproduction Recordsใน D1 cascadeเมื่อuser/mountถูกลบ; authoritativeShared sessions/reservationsยังอยู่จนcleanupTTL ไม่อ้างว่าการลบaccount abortremoteทันที
- เมื่อflagoffจะไม่รับcreate/parts/statusใหม่ แต่creator cancellationและSharedcleanupยังทำงานเมื่อschemaมีอยู่

## Compatibility และ activation gates

`POST /files` small uploadเดิม,25 MiB policy, preview20 MiB/text1 MiB, download behavior, frontendqueueและuserpreferences **ไม่เปลี่ยน** ยังไม่มีUpload UIที่เรียกmultipart endpoints, IndexedDB/file handles, real-byte progressหรือRange downloadในงานนี้

Feature flagชื่อ `STORAGE_RESUMABLE_UPLOADS_ENABLED` ค่าstring `true` ทั้ง Nexora serverและShared Node environment; defaultoff ไม่มี `VITE_*` setting และไม่ได้เพิ่มflagให้production config

ก่อนenableต้องreviewและapply migrations0011 (Nexora)/0002 (Shared) บนtargetที่อนุญาตอย่างชัดเจน, pin tested SDK/Node/Garage versionsและทดสอบGarage testproject: MPU commands, session metadata marker, abort/retry/late effects, checksums, complete recovery, proxy/Tunnel/Access4–4.5min deadlines, memory/rate/capacity budgets และ10 GiB checksumครบเส้นทาง ไม่มีขั้นตอนไหนถูกรันบนproductionในงานนี้

Local Shared dependency linksไม่ครบ จึงhydrate declared dependenciesในtemporary workspaceเท่านั้น (`@aws-sdk/client-s3`3.1163.0, Hono4.13.16, @hono/node-server2.1.6, better-sqlite3 13.0.3; within existing ranges) ไม่แก้package.json/lockในShared Test-only resolverโหลดdependenciesดังกล่าวให้testsบนcheckoutจริง ไม่มีresolverนี้ในappsource และไม่ถือว่าผ่านNode22/Garageที่deployจริง

## Validation และ next phase

ผลcommandสุดท้ายดู `PROJECT_HANDOFF.md` แยก Node/UI/Shared/bridge ชัดเจน Testsใช้in-memorySQLite+mockS3/controllednetwork ไม่ใช่หลักฐานrealGarageหรือ10 GiB Browser/mobile/refresh/restartและproductionไม่ได้ตรวจ

ลำดับถัดไปที่จำเป็น: **isolated real-provider/limits/recovery acceptance** ของPhase2 gateที่ยังค้าง ก่อนfeatureenable จากนั้นPhase4 frontenduploader/TransferManagerที่ใช้APIนี้ พร้อมboundedretry/progress/cleanup UX ส่วนRange downloadเป็นPhase5 แยก


## Phase 3A acceptance follow-up

ดู [LARGE_FILE_TRANSFER_ACCEPTANCE.md](LARGE_FILE_TRANSFER_ACCEPTANCE.md) สำหรับ runnable isolated-provider suite, resource/failure report และ production checklist ปัจจุบัน real Garage/100 MiB/1 GiB/10 GiB/proxy verification เป็น BLOCKED ไม่มี production flags หรือ backend runtime changes ใน Phase3A
