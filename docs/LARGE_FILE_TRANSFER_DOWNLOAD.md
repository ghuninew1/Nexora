# Nexora — Phase 5.1 Backend Streaming & Range Download

วันที่: 2026-11-08 (Asia/Bangkok). สถานะ local validation ดูผลสรุปท้ายเอกสาร; source ไม่ใช่หลักฐาน deployed Garage/Cloudflare behavior. ไม่มี Download Manager, browser persistence, deployment, production flag/config change หรือ migration ใน phase นี้

## เส้นทางและ authorization

Authenticated `GET|HEAD /api/storage/v1/storages/:storageId/objects/:objectId/download` และ alias `/files/:objectId/download` → Pages server-only client → Shared `GET|HEAD /v3/projects/:projectId/objects/:objectId/download` → Garage S3 HEAD/conditional GET.

- Nexora ตรวจ session, active mount/assignment, read+download grants และ provider download capability ใหม่ทุก request รวม HEAD/resume. Assignment removal/permission change ไม่ใช้ capability cache เพื่อ bypass authorization. ไม่สามารถเรียกคืน bytes ที่ส่งแล้ว; การเพิกถอนมีผลกับ request ถัดไป ไม่ใช่ตัด stream ที่ authorize แล้วโดยอัตโนมัติ
- Shared ตรวจ service app credential, active project และ logical object ownership/Trash visibility ก่อน provider access. Browser ไม่ได้รับ project/bucket/key/provider references หรือ credential
- ส่งเฉพาะ Range/If-Range ไม่เกิน256 characters และ server-owned auth/Access headers; ไม่ส่ง Cookie/browser Authorization/arbitrary headers. Request identity encoding; compressed upstream ถูก reject เพื่อไม่ให้ offset/length ผิด
- ไม่มี write session/schema ใหม่. HEAD และ416 ไม่เขียน Recent; GET access ใช้ Recent เดิม ไม่ใช่หลักฐาน download สำเร็จ

## HTTP contract

| Request | Response |
| --- | --- |
| GET ไม่มี Range | 200 full stream พร้อม authoritative Content-Length |
| HEAD (แม้มี Range) | 200 full representation metadata ไม่มี body และไม่เรียก S3 GET |
| `bytes=0-2`, `bytes=3-5` | 206 interval ที่ระบุ |
| `bytes=7-`, `bytes=-3` | 206 open-ended/suffix; end เกินขนาดถูก clip |
| single-range ถูก syntax แต่เริ่มเกิน EOF, end<start หรือ suffix0 | 416, `Content-Range: bytes */size`, `Content-Length: 0`, ไม่มี body |
| malformed/unsupported unit/multi-range/headerเกิน256 | ignore Range, full200 (ไม่มี multipart/byteranges) |
| empty object | full200 length0; single-range416 |
| If-Range เป็น current strong opaque ETag | พิจารณา Range ตามปกติ |
| stale/weak/malformed If-Range หรือ HTTP-date | full200; ผู้เรียกต้องทิ้ง partial bytes เดิมและเริ่มใหม่ |

HEAD ignore Range ตาม HTTP semantics. Last-Modified ส่งเมื่อ provider มี valid Date แต่ไม่ถือว่าเป็น **strong** validator: service ไม่รับประกันว่าไม่มีสองการแก้ไขภายในหนึ่งวินาที จึงไม่ใช้ HTTP-date ใน If-Range เพื่ออนุมัติ resume. ตาม RFC9110 §13.1.5 เมื่อ date ไม่เป็น strong validator ต้อง ignore Range. ใช้ opaque ETag เท่านั้นสำหรับ resume. ไม่มี checksum claim จาก S3 ETag

Private responses เป็น `private, no-store`, nosniff, sanitized MIME และ existing attachment filename policy.206 มี Content-Range/Content-Length ที่สอดคล้องกัน;416 เป็น empty response ไม่ผ่าน JSON error normalization. Pages ตรวจ status, safe integers, exact requested geometry, opaque ETag format และ matched If-Range ก่อนปล่อย bytes. Legacy Shared ที่ไม่ advertise ranges ยังตอบ full200ได้; ไม่มีการอนุมาน range support จาก download permission

## Identity, streams และ failure

- Garage adapter ใช้ HEAD metadata จริง ไม่ใช้ SQLite file size เป็น authoritative transfer size. ต้องได้ safe integer size และ quoted S3 ETag; สร้าง public SHA-256 opaque identity จาก server-only bucket/reference, optional VersionId, ETag, size, LastModified. Hash นี้เป็น validator ไม่ใช่ hash ของ file contents และไม่เปิด raw S3 ETag
- GET ส่ง `IfMatch` และ VersionId เมื่อมี;ตรวจ returned ETag/version/LastModified, exact ContentLength, HTTP200/206 และ ContentRange กับ HEAD/selected interval ก่อนคืน body. Provider ignore Range, race/412/416 หลัง HEAD หรือ metadata mismatch → sanitized failure; ไม่ retry/ต่อ stream ด้วย versionใหม่โดยเงียบ
- การยืนยันนี้อาศัย provider strong conditional-GET/snapshot semantics. ต้องตรวจ Garage จริงก่อน rollout. ไม่ได้สแกนหรือ hash bytes ทั้งไฟล์ และไม่ได้พิสูจน์ provider ที่ส่ง bytes ผิดทั้งที่ validators/length ถูกต้อง
- Byte counting ทั้ง Shared และ Pages ทำให้ EOFก่อนขนาดหรือ bytesเกินขนาดเป็น stream error ไม่ใช่ success. หลัง response headers ส่งแล้วไม่สามารถเปลี่ยน200/206เป็น502; connection/body ต้อง error และ consumer ต้องตรวจ stream completion/expected bytes ก่อนประกอบไฟล์
- Web ReadableStream/Node-to-Web adapter ส่งตาม backpressure ไม่มี arrayBuffer/Buffer.concat ทั้งไฟล์หรือ tee. เก็บเพียง chunks ที่ streams/runtime buffer; ไม่มี file-size-proportional application buffer. Concurrent requests แยก controller/reader/counters ไม่มี mutable global transfer state
- Browser cancel → Pages reader.cancel+AbortController → fetch signal/Hono request → Shared reader.cancel+S3 abort. ทดสอบ loopback @hono/node-server disconnect ด้วย actual adapter (mock S3). EOF cleanup เอา timers/listeners ออก; pending read error/idle/cancel ปิด upstream

## Timeouts และ capability

- Pages download: bounded connection/header wait จาก existing STORAGE_TIMEOUT_MS (default15s, valid100–30000ms); หลัง successful200/206/416 headers ยกเลิก total deadline. Response errors ยังคง bounded request deadline ระหว่างอ่าน sanitized error JSON
- Shared HTTP download: existing STORAGE_PROVIDER_TIMEOUT_MS (default60s) ใช้ต่อ HEAD/GET connection และ reset เป็น inactivity deadline ระหว่าง stream reads/chunks. ไม่มี fixed total deadline สำหรับ HTTP download
- Pages streamed download:60s inactivity timer reset ทุก read/chunk. Stalled upstream หรือ consumer ที่หยุดดึงข้อมูลเกิน idle window จะถูกยกเลิก; ไม่ใช่ guarantee ว่า download จะอยู่ได้ไม่จำกัดเมื่อ browser/network หยุดอ่าน. Upload/copy deadlines และ feature flags เดิมไม่เปลี่ยน
- Additive explicit `capabilities.rangeRead` ใช้ fieldเดิมที่เคย false. Shared Garage provider advertises true เมื่อใช้ adapter นี้; Nexora public capability ต้องได้ provider rangeRead===true, download===true และ current effective download permission. Upload `transfers` object/flags/limits ไม่เปลี่ยน ไม่เพิ่ม Download Manager controls
- v2/legacy provider download pathเดิมไม่ถูกเปิดรับ HTTP Range; v3 เท่านั้นเป็น contract นี้. Public-share download และ private/public preview ไม่ส่ง browser Range/If-Range ต่อ ยังมี ancestor/revocation/expiry rechecks, preview allowlist/limits/sandbox เดิม. Public full download ใช้ connection+idle timeout และ checked byte stream ใหม่ ไม่เปิด public Range route

## Tests และ local validation

Automated tests ใช้ in-memory SQLite, mocked S3 transport และ local loopback HTTP เท่านั้น ไม่อ่าน runtime DB/WAL/SHM, credentials หรือ Garage config จริง.

- Shared regression: full/HEAD, zero/nonzero/open/suffix/clipped/unsatisfiable/malformed/multi ranges, If-Range match/stale/weak/date, app/project scope/disabled project, parallel requests, HEAD→GET version race/conditional failure, wrong status/geometry/length, truncated/excess stream, cancel/request abort, idle versus active-long stream และ real Node adapter disconnect. Legacy v2/copy/upload/multipart regressions ยังรัน
- Nexora: exact206/416 metadata, full fallback, HEAD, permission revocation/unauthenticated requests, protocol header allowlist/server credentials, strict capability, truncation/oversize/cancel และ connection deadline removal. Preview/public-share regressionsยืนยัน Range/If-Range ไม่ถูก forward และ sandbox/ancestry/expiry checksยังอยู่
- Optional local bridge `NEXORA_SHARED_STORAGE_ROOT=/Users/ghuninew/GitHub/issuedesk/garage/storage pnpm test` เรียก actual Nexora handler→Shared Hono→SQLite manager→Garage adapter, mockเฉพาะS3. ตรวจ full/HEAD/ranges/416/fallback, identity change, concurrent responses, cancellation. ไม่ใช่ real-provider test

Final exact validation counts/status ถูกบันทึกใน PROJECT_HANDOFF.md หลังรัน final checks. Phaseนี้ COMPLETE ได้เฉพาะ local semantics/security/stream testsผ่าน; production acceptance แยกเสมอ

## Required acceptance ก่อน rollout

1. **Real Garage disposable resources:** ยืนยัน exact running version/SDK/Node22, HEAD size/ETag/LastModified, IfMatch412, GET snapshot/VersionId behavior,206/416 geometry, zero-byte/open/suffix/clipped ranges และ overwrite ระหว่าง HEAD→GET/ระหว่างresume. เปลี่ยน version แล้วต้องได้full200หรือerror ห้ามต่อbytesข้ามversion. ใช้ test-only bucket/app/project/credentialsที่อนุมัติแยก ไม่มี production writes
2. **Large streams:** full/resumed100MiB,1GiB,10GiB; independently SHA-256 assembled output เทียบ fixture, หลาย concurrent downloads, วัด Node/Worker RSS/buffer/backpressure ตลอด, network interruption/truncated upstream/consumer slowdown/idle, disconnect early/mid/late. ต้องไม่มี false success และ provider sockets/streamsต้องถูกปล่อย
3. **Production-like Pages/Tunnel/proxy:** authenticate cookies/Access, identity encoding/no content transformation, Range/If-Range/Content-Range/Content-Length preserved, long active connectionเกิน15/60s, idle timeoutและclient abort propagation, platform limits/rate controls. แยกหลักฐานlocal mocksจาก real chain;ไม่แก้ production configเพื่อผ่านโดยไม่ขออนุญาต
4. **Native browsers:** Chrome/Safari/Firefox desktop/mobile full native download, HEAD/API range requestsจากauthenticated origin, stale validators/permission revocation/session expiry. Preview PDF/blob/text/video และ public file/folder links/expiry/revoke/ancestry regression. ไม่มี frontend managed-resume UX ในphaseนี้
5. **Operator rollout:** review source/config/security, approved deploy targets และ feature capability behavior. ไม่มี schema migrationจำเป็นสำหรับRangeนี้ และห้าม reapply migrationsเก่าเพื่อverification

## References

- [RFC 9110 — HTTP semantics](https://www.rfc-editor.org/rfc/rfc9110.html), §§9.3.2,13.1.5,14 และ15.3.7/15.5.17
- [S3 GetObject API](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html): single-range, conditional request และ response fields; ใช้เป็นAPI contractไม่ใช่หลักฐาน Garage deployment

Final status: **Phase 5.1 COMPLETE locally**. PASS lint, build, both diff checks; full Nexora suite with explicit local Shared root:218 Node +74 UI passed,0 failures,1 optional acceptance-harness SKIPPED; final focused73/73 passed after final assertions/cleanup. Shared regression49/49 passed. Initial failing fixtures/lint/compatibility checks were fixed and rerun. Exact commands, logs, dependency/concurrent-work notes and plain `pnpm test` results are in PROJECT_HANDOFF.md. Real Garage/10GiB/Node22/platform/native-browser acceptance remains NOT RUN/BLOCKED; no production readiness claim.
