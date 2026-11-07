# Phase 3A — Isolated real-provider acceptance

วันที่: 2026-11-07 (Asia/Bangkok)

**สถานะ: suite พร้อมให้ operator รัน; real-provider acceptance BLOCKED** ไม่มีการติดต่อ Garage, สร้าง cloud resources, เปลี่ยน production configuration, apply remote migrations หรือ deploy ในงานนี้ Runtime feature flags ยังคง default off

## ผลรอบนี้และขอบเขตหลักฐาน

ตรวจ source/คำแนะนำของ Nexora และ Shared Storage ทั้งสอง repository รวมถึง architecture plan, backend report, `MULTIPART_UPLOADS.md`, AGENTS และ handoff แล้ว Shared backend เดิมเป็น uncommitted work ใน checkout ข้างเคียง จึงเก็บไว้โดยไม่แก้ runtime source ใน Phase 3A

สิ่งที่ตรวจได้จากเครื่องนี้:

- ไม่พบ `docker`, `podman` หรือ `garage` executable ใน PATH จึงไม่มีช่องทางเริ่ม disposable Garage ด้วยเครื่องมือเหล่านี้
- ไม่มี `NEXORA_ACCEPTANCE_CONFIG` หรือ test-only endpoint/credential bindings ที่ตรวจ presence เท่านั้น ไม่ได้ค้นหา/อ่าน `.env`, Garage config จริง, production secrets หรือ runtime DB
- ไม่มี isolated Garage endpoint, disposable bucket และ dedicated test credentials ที่ยืนยันไว้ จึงไม่ได้ลอง endpoint ของ production หรือเดาชื่อ resources
- Local harness tests ตรวจ safety guards, cleanup ownership, bounded retry, report sanitization, proxy handshake และ boot/stop worker ด้วย temporary SQLite โดยไม่มี S3 calls ทั้งหมดนี้เป็น **local test evidence** ไม่ใช่ real-provider PASS

ผลราย scenario ที่ machine อ่านได้อยู่ใน [results.json](acceptance/phase-3a-2026-11-07/results.json) และ [results.md](acceptance/phase-3a-2026-11-07/results.md) ทุก real-provider scenario เป็น **BLOCKED: NO_ISOLATED_PROVIDER_CONFIG** ไม่มี scenario ใดถูกให้ PASS จาก mocked tests

| Scenario | ผลรอบนี้ | สิ่งที่ suite จะตรวจเมื่อมี isolated provider |
| --- | --- | --- |
| isolated-provider-preflight | BLOCKED | HeadBucket, objects/MPU inventory ว่าง และ run ownership marker |
| upload-100MiB | BLOCKED | multipart geometry, exact size, full SHA-256, duplicate complete |
| upload-1GiB | BLOCKED | flow เดียวกันเมื่อ operator ยืนยัน capacity |
| upload-10GiB | BLOCKED | 1280 parts, paginated discovery และ full-file checksum |
| interruption-same-session | BLOCKED | ตัด HTTP socket กลาง part, ไม่ ack part ที่ขาด, retry logical session เดิม |
| shared-process-restart-resume | BLOCKED | pause, ปิด/เริ่ม Shared child จริงกับ DB ทดสอบเดิม, receipts คงอยู่, resume |
| lost-create-ack | BLOCKED | เรียก Garage จริงก่อนทิ้ง acknowledgement ใน test wrapper แล้ว recover key เดิม |
| lost-part-ack-retry | BLOCKED | real UploadPart สำเร็จก่อนทิ้ง response, journal/retry bytes เดิม |
| lost-complete-ack-duplicate-completion | BLOCKED | real complete สำเร็จก่อนทิ้ง response, HEAD marker/SQL recovery, provider complete เพียงครั้งเดียว |
| cancel-abort | BLOCKED | abort ผ่าน Nexora, ไม่มี MPU/object/partially published metadata เหลือ |
| expiration-cleanup-clock-advanced | BLOCKED | real provider cleanup ด้วย source manager และ injected clock +8 วัน; ไม่ใช่การรอ scheduler จริง 7 วัน |
| concurrent-files | BLOCKED | 2–4 ไฟล์, global provider-part concurrency ≤4, checksums ทุกไฟล์ |
| no-partial-publication | BLOCKED | ตรวจ SQL publication, nonterminal/orphaned session metadata และ provider inventory หลัง failure/recovery |
| final-provider-cleanup | BLOCKED | exact owned keys/MPUs ถูกลบ, final bucket ว่าง; ไม่ลบ bucket |
| resource-budgets | BLOCKED | sampled parent/Shared RSS ไม่เกิน operator budget |
| proxy-request-path | BLOCKED | test proxy/Tunnel identity handshake ตรงกับ child run ก่อนส่ง credentials/bytes |
| proxy-slow-part-timeout | BLOCKED | paced first part 30–210s ผ่าน test proxy ที่ operator เตรียมไว้ |
| production-resource-retention-gates | BLOCKED | platform rate/CPU/memory/capacity/retention/alert controls ต้อง operator ยืนยันแยก |

## Repeatable suite และ data path

ไฟล์:

- `scripts/acceptance/run.mjs`: CLI, local authenticated Nexora fixture, scenarios, measurements และ sanitized report
- `scripts/acceptance/provider-worker.mjs`: isolated child ใช้ Shared app factory, `@hono/node-server`, SQLite migrations และ Garage multipart adapter จริง ไม่ import production `src/index.js`
- `scripts/acceptance/support.mjs`: fail-closed config, deterministic bounded synthetic parts, private journal, local Node adapter และ report helpers
- `scripts/acceptance/isolation.mjs`: empty-bucket preflight, scoped inventory และ exact-key cleanup
- `scripts/acceptance/config.example.json`: non-secret config template
- `tests/acceptance-harness.test.js`: local harness safety tests; mock inventory tests ไม่ใช่ provider acceptance

```text
Synthetic bounded parts / HTTP client
  → loopback Nexora Node HTTP adapter → actual authenticated Nexora API handler
  → loopback Shared @hono/node-server → actual Hono routes / durable SQLite manager
  → actual AWS SDK transport → explicitly configured disposable Garage bucket
  → same-origin Nexora download → incremental size + full SHA-256 verification
```

Nexora API handler รันใน Node สำหรับ isolated fixture ไม่ใช่ Cloudflare workerd/Pages runtime จึงไม่ยืนยัน Workers CPU/body/memory/D1/platform behavior หรือ browser behavior แม้ source authorization routes จะถูกเรียกจริง

Shared ใช้ `serve` adapter เดียวกับ service จริง แต่ไม่ใช้ production entrypoint ไม่สตาร์ต background production jobs และไม่อ่าน DB/credentials ของ service เดิม Harness เปิด feature เฉพาะ fixture object/factory ใน process ทดสอบ ไม่แก้ flags ใน project config หรือ deployment

S3 `Head/List/Get/Delete/Abort` ที่ runner เรียกโดยตรงใช้สำหรับ preflight/ownership inventory/teardown เท่านั้น Upload/create/part/complete ของ scenario ผ่าน Nexora boundary และ Shared adapter ไม่มี direct browser upload bypass Provider keys/session refs อยู่ใน server-only private journal ไม่ส่งออก public report

## เตรียม isolated resources ก่อนรัน

1. ใช้ Node ที่รองรับ `node:sqlite` และ `node:module.registerHooks` (Nexora baseline ≥22.22; รอบนี้ใช้ Node26.13.0 บน macOS) บน POSIX filesystem ที่รองรับ fsync/owner-only permissions
2. ใช้ Shared source ที่มี multipart migration0002 และ dependencies ตาม `garage/storage/package.json` เตรียม dependencies ใน test workspace ได้; ไม่ต้องแก้ package versions หรือ production node_modules
3. Operator provision **test Garage และ bucket ใหม่ที่ว่าง** ด้วย dedicated test key เท่านั้น Bucket ต้องขึ้นต้น `nexora-acceptance-` และยืนยันชื่อซ้ำใน config Key ต้องเข้าถึง bucket ทดสอบนี้เท่านั้น พร้อม ListMultipartUploads/ListParts/Create/UploadPart/Complete/Abort/Head/Get/Put/Delete ที่ suite ต้องใช้
4. ยืนยัน logical workload capacity และ physical headroom/replication แยกกัน `maxLogicalBytes` เป็น budget ที่ operator อนุมัติ ไม่ใช่การค้นพบ free physical capacity หรือ quota อัตโนมัติ เริ่ม100 MiB และ200 MiB สำหรับ concurrency2 ก่อนเพิ่ม1/10 GiB
5. กำหนด private test-only environment variables ผ่านช่องทาง secret injection ของ operator: `NEXORA_ACCEPTANCE_S3_ACCESS_KEY_ID` และ `NEXORA_ACCEPTANCE_S3_SECRET_ACCESS_KEY` Suite ไม่ใช้ AWS default credential chain ไม่อ่าน production `.env` และไม่รับ credential values ใน JSON/arguments
6. คัดลอก `config.example.json` ไปนอก repository แล้วใส่ endpoint test จริง, bucket, `sharedStorageRoot`, capacity และ RSS budgets ที่อนุมัติ ตัวอย่าง `.invalid` ไม่ใช่ endpoint ที่รันได้ `dependencyRoot` เป็น optional absolute path ไป test workspace ที่ hydrate package dependencies ไว้แล้ว

ค่า `sizesMiB` เลือกจาก `[100,1024,10240]` และต้องมี100; size ที่ไม่ได้อนุญาตหรือเกิน `maxLogicalBytes` จะ BLOCKED ไม่แกล้งนับว่า PASS `concurrentFiles` เลือก2–4 และต้องมี budget พอ ถ้า provider identity/version ยังไม่ได้ตรวจจาก test operator ให้เก็บเป็น unresolved: SDK network success ไม่พิสูจน์ว่า endpoint เป็น Garage version ใด

## คำสั่ง

รันจาก Nexora root เพื่อสร้าง BLOCKED report โดยไม่มี network/credentials:

```bash
node scripts/acceptance/run.mjs \
  --report-dir /private/tmp/nexora-acceptance-report
```

คำสั่งนี้คืน exit2 โดยตั้งใจ แปลว่ายังมี BLOCKED scenarios

เมื่อ operator เตรียม test environment และ inject test credentials แล้ว:

```bash
node scripts/acceptance/run.mjs --run \
  --config /private/tmp/nexora-acceptance-config.json \
  --report-dir /private/tmp/nexora-acceptance-report
```

Exit codes:0 = ทุก scenario ผ่าน,1 = FAIL/setup/execution error,2 = ยังมี BLOCKED scenarios เนื่องจาก production controls เป็น manual gate ปกติ isolated run ที่ผ่าน transfer tests ก็ยังคืน2 จนกว่าจะ review manual gates ไม่แก้ JSON ให้กลายเป็น production PASS โดยไม่มีหลักฐาน

Runner สร้าง private temporary directory ใหม่ มี Nexora/Shared test DB, WAL/SHM และ `private-provider-journal.json` file mode0600 ต้องรักษา journal ไว้จนตรวจ cleanup สำเร็จ ห้ามนำข้อมูล private journal เข้า Git, share logs หรือแนบ public report

หลัง process crash/teardown fail ใช้ config เดิมและ private journal ของ run นั้น:

```bash
node scripts/acceptance/run.mjs --run \
  --config /private/tmp/nexora-acceptance-config.json \
  --cleanup-journal /private/tmp/nexora-acceptance-RUN/private-provider-journal.json \
  --report-dir /private/tmp/nexora-acceptance-cleanup-report
```

Cleanup ตรวจ endpoint/bucket fingerprint + ownership token ก่อน, ทำงานเฉพาะ exact UUID keys ที่ journal บันทึกก่อน S3 mutation และไม่ recursive-delete bucket หากพบ foreign resource จะ FAIL โดยไม่ลบสิ่งใด Marker mismatch/missing จะ fail closed เช่นกัน ต้องให้ operator ตรวจ ไม่ลองลบกว้างขึ้น Bucket ยังคงอยู่หลัง cleanup และต้องว่างก่อนเริ่ม run ใหม่ Private SQLite/journal เก็บไว้เพื่อ audit ไม่ถูกลบอัตโนมัติ

ระหว่าง run จะ teardown provider payloads หลังแต่ละ scenario เพื่อคุม capacity หลัง checksum/receipt assertions แล้วเท่านั้น Completed test SQL rows จึงอาจอ้าง object ที่ suite จงใจ teardown ไปแล้ว ไม่ใช่ corruption ของ runtime backend การตรวจ partially published rows นับเฉพาะ session ที่ยังไม่ completed และ final audit ต้องไม่เหลือ nonterminal/orphaned session metadata หาก scenario ก่อนหน้าล้มเหลว อาจทำให้ final audit FAIL ต่อเนื่อง; ให้ตรวจ first failure และ private journal แทนการตีความแต่ละ FAIL ว่าเป็นปัญหาแยกกัน

## Proxy / Tunnel acceptance

ไม่สร้างหรือแก้ Cloudflare Tunnel/Access/WAF rules ใน suite Operator ต้องชี้ **isolated test routes** มาที่ fixed loopback ports ของ runner เช่นกำหนด `sharedPort`/`nexoraPort` เป็น ports ว่างที่เลือกไว้ แล้วเติม `sharedProxyUrl`/`nexoraProxyUrl` เป็น test origins

ก่อนส่ง app credentials/session หรือ file bytes runner GET `/__acceptance__/identity` และต้องได้ random run identity/proof ของ child นี้ หากไปโดน service อื่นจะ fail closed ไม่มีการลอง mutation ที่ endpoint นั้น URL ต้องไม่มี userinfo/path/query/hash และ HTTPS ยกเว้น localhost ส่วน `.invalid` ใช้เป็น placeholder เท่านั้น

`slowPartSeconds: 30..210` จะ pace part แรกจริงพร้อม size/hash verification ไม่ใช่ progress simulation ถ้าไม่กำหนดจะ BLOCKED scenario นี้ ผลสำเร็จพิสูจน์เฉพาะ payload8 MiB/ช่วงเวลาที่ทดสอบ/เส้นทาง test นั้น ไม่พิสูจน์ exact maximum limit ของทุก platform plan หรือ production และไม่แทน workerd/browser QA

Access service-token protected test routes ยังต้องมี isolated authentication wiring ที่ตรวจต่างหาก Fixture placeholders ไม่ใช่ Cloudflare Access credentials และ suite ไม่ยืม tokens ของ production หาก test routeต้องการ Access policy ที่ยังไม่พร้อมให้ BLOCKED ห้ามลด production policy เพื่อให้ผ่าน

## Resource usage และ failure-recovery report

**ค่ารอบนี้: ไม่ได้วัด real-provider transfer**

| Metric | ค่า | หลักฐาน/ข้อจำกัด |
| --- | --- | --- |
|100 MiB /1 GiB /10 GiB size + SHA-256 | ไม่มี | BLOCKED เพราะไม่มี test Garage |
| Parent Nexora/client peak RSS | null | ยังไม่มี large transfer run; client และ Nexora อยู่ process เดียวกัน |
| Shared peak RSS/heap/external/ArrayBuffers | null | script เก็บ sampled peaks500ms และที่ SDK boundaries; ไม่ใช่ container maximum |
| Upload/download logical payload throughput | null | script แยกทิศทาง, รวม generation/hash/retry/finalize; ไม่ใช่ wire speed |
| Concurrent part high-water mark | null | worker นับ actual active UploadPart commands; ต้องเห็น≥2 และ≤4 |
| Retry/recovery success | ไม่มี | controlled failure scenarios ยังไม่รันกับ provider จริง |
| Post-failure MPU/object inventory | ไม่มี | ยังไม่มี provider resources ถูกสร้าง จึงอ้างว่า verified orphan-free ไม่ได้ |
| Garage disk/CPU/RAM/replication/network | ไม่มี | ต้องเก็บจาก isolated provider monitoring แยก; scriptไม่อ่านhostproduction |

Source-derived limitsที่ต้องเทียบ measurements:8 MiB/part,1 operation/session,4 global part leases,20 unfinished sessions/100 GiB pending bytes/project, Nexora10 unfinished sessions/user, Shared240s operation/900s lease, Nexora270s transfer timeout และ ordinary download deadlines15s/60s ตาม source ผล10 GiB download อาจ FAIL จาก deadlineเดิมบนเครือข่ายช้า ต้องเก็บเป็น finding ไม่ยก timeoutเพื่อให้ acceptanceผ่านโดยไม่ review

Fault boundaries:

- Socket interruption เป็นการตัด local client→Nexora HTTP socketจริง ยังไม่จำลอง mobile radio/Internet outage
- Lost create/part/complete ack เป็น fault injection **หลัง actual SDK requestสำเร็จ** ใน acceptance wrapper เพื่อพิสูจน์ ambiguous outcome ไม่ใช่ physical packet-drop ทุก hop
- Resume restart ปิด Shared child จริงและใช้ temporary DB เดิม ไม่ใช่การ restart production หรือ crash-kill ระหว่าง WAL commit
- Expiration ใช้source cleanup managerกับ clock+8days และ real provider I/O แต่ยังไม่ยืนยัน scheduler startup/hourly deploymentหรือเวลาจริง7วัน
- Orphan inventoryเป็น observationหลัง operation/teardown ไม่ใช่หลักฐานว่า future delayed server effectsจะไม่มี ต้องทดสอบ delayed effectsและmonitorซ้ำบน providerจริงก่อน production

## Cleanup scheduling / retention / resource review

ข้อค้นพบจาก source ไม่ใช่ live verification:

- Shared `src/index.js` เรียก sweepตอนstartupและทุกชั่วโมงเมื่อ schema0002มีอยู่ แม้featureoff แต่ถ้าทุก replicaหยุด cleanupจะรอrestart
- Sweep20 sessions/batch, durable leasesและretry; prioritizeunfinishedก่อนterminal tombstone rechecks ในserviceหนึ่งinstanceมีthroughputการตรวจ20rows/hour จึงต้องload-test backlog/multiple instances ไม่ถือว่าเพียงพอโดยอัตโนมัติ
- Session TTL fixed7days, ไม่มีjournal/tombstone pruning จึงมีmetadata growthและrecheck backlog ยังไม่มีalerts/retentionprocedureที่พิสูจน์แล้ว
- Budget100 GiB/projectไม่ใช่physical reservation; Garage replica/headroom/disk-full policy, global session admission และrate limitingยังต้องกำหนด/test
- Lease900sหลังprocesscrashอาจทำให้recoveryรอ ต้องทดสอบrealSDKabort/late provider effectsและOS/process pause ไม่ถือว่าmock race testsพิสูจน์distributedconsistencyทั้งหมด
- Freeze provider project/bucket mappingระหว่างactive sessions; ตรวจmigration/config/change proceduresและcross-system backupก่อนenable
- Cleanupไม่publish completing sessionsโดยอัตโนมัติ Userต้องretryfinalizeหรือรอexpirycleanup; productionต้องมีrunbookสำหรับuncertain completionและgrantrevocation

## Production readiness checklist — ยังไม่ผ่าน release gate

Required ก่อนenable:

- [ ] Isolated Garage version/image digest, Node/SDK/dependency versions และ source hashesที่ทดสอบถูกบันทึก
- [ ]100 MiB,1 GiB,10 GiBผ่านfullchecksumทั้งupload/downloadครบเส้นทาง หรือประกาศsupportedmaximumต่ำกว่าตามหลักฐาน
- [ ] Same-session interruption/restart/ack-loss/duplicate-completion/cancel/expiryผ่านโดยไม่มีpartialpublication/orphans
- [ ] Delayed-effect inventory rechecksและreal startup/hourly scheduler/clock-skew/crash-recoveryผ่าน
- [ ] Actual Cloudflare workerd/Pages runtimeและisolated proxy/Tunnel/Access/WAF tested;8 MiB bodiesและslow-part durationsผ่าน
- [ ] Provider/storage/client/Pages/container CPU/RSS/FD/socket/disk/network/rate/cost limitsมีheadroomและalerts
- [ ] Physical capacity/reservationและdisk-full behaviorแยกจากlogicalbudgetsได้รับการreview
- [ ] Retention/pruning/tombstones/idempotency guarantees/cleanup backlogและorphan runbookพร้อม
- [ ] Source/version compatibilityและmigrations0011/0002 target review พร้อมauthorized rollout/rollback แยก ไม่applyในacceptanceนี้
- [ ] Authorization/revocation/maintenance/readonlyและcredential/log privacy checksผ่านในrealplatform
- [ ] Browser/mobileและfrontend Transfer Manager ผ่านphaseที่เกี่ยวข้องก่อนโฆษณาbrowser resumability

Optional improvementsหลังมีmeasurement: OS/container high-water monitoring, longer soak tests, process-killระหว่างprovider/SQLcommit, controlled packet-lossnetworknamespace และbroader cross-device tests ไม่เพิ่มinfrastructure/dependenciesหรือเปลี่ยนproductionในPhase3Aนี้
