# Nexora — Final Phase 6 production readiness

> **Historical Phase6 readiness snapshot.** The subsequent native-download simplification removes frontend managed download queues/recovery/controls. Current product behavior is [native browser downloads](LARGE_FILE_TRANSFER_DOWNLOAD.md#current-product-behavior--native-downloads-2026-11-08), with upload-only Transfers. Backend Range, upload implementation and production gates remain. The architecture/managed-browser evidence below belongs to the Phase6 snapshot, not the current UI.

วันที่ตรวจ: **2026-11-08, Asia/Bangkok**. รายงานนี้แทนสถานะรวมของ transfer guides รุ่นก่อน โดยคงรายละเอียด contract/history ของแต่ละ guide ไว้

| Deliverable | Decision |
| --- | --- |
| DEVELOPMENT COMPLETE | **Complete for independently implementable source integration, hardening, local validation and acceptance tooling**; not a claim that all acceptance gates passed |
| REAL-PROVIDER ACCEPTANCE | **BLOCKED** — operator confirmed no isolated resources/config/credentials are available |
| CONTROLLED ROLLOUT | **NOT READY** — target Shared schema/protocol, real-provider/platform/native browser and capacity gates remain open |
| PRODUCTION | **NOT READY** — local tests and D1 schema verification cannot establish deployed end-to-end readiness |

No deploy, production flag/configuration change, migration, production transfer/data mutation, secret rotation or infrastructure change was performed. Production D1 inspection was schema-only, read-only. No credentials or secret values were read/displayed. Both working trees were clean at the start; Shared Storage remains unchanged by Phase 6.

## Architecture and integrated behavior

```text
Browser / single authenticated FilesProvider
  ├─ Upload Queue (50 retained rows; 1/2/3/5 files)
  │    ├─ legacy small file: original multipart/form-data upload (effective cap ≤25 MiB)
  │    └─ large file: explicit compatible capability + native Web Locks
  │         → logical transfer / 8 MiB slices + SHA-256
  │         → metadata-only owner-scoped IndexedDB recovery / original-file reselection
  └─ Download Queue (50 rows; independent 1/2/3/5, default 2)
       ├─ supported picker + rangeRead → streamed positioned disk writes
       │    → native Web Lock / IndexedDB handle + geometric checkpoints / explicit Recover
       └─ unsupported capabilities → browser-native download, no app progress/resume claim
             │ same-origin, authenticated logical IDs only
             ▼
Nexora Pages Functions ── D1 sessions / assignments / transfer_sessions (0011)
  → current session, assignment, mount policy, capabilities, maintenance and ownership checks
  → bounded raw part / streaming download proxy; no file bytes in D1
             │ server-only app + Access credentials / internal project mapping
             ▼
Shared Storage Hono / Node / SQLite migration 0002
  → durable session/digest/idempotency journals / leases / exact sizes / publication
  → Garage S3 multipart commands / conditional HEAD + GetObject / abort cleanup
             ▼
Garage object data + metadata (separate backup/recovery responsibility)
```

Nexora caps new uploads at decimal 5 GB (5,000,000,000 bytes), with 8 MiB parts, up to 1,280 parts and one operation per session. Shared must advertise compatible geometry and a positive multipart maximum; Nexora uses the lower of that maximum and its 5 GB cap. See `UPLOAD_REJECTION_FIX.md` for the current rejection diagnosis and configuration checks. Each browser tab queues one file at a time; this is not a global concurrency limit. The 5 GB boundary has not been validated with real Garage. Multipart is disabled unless each server's `STORAGE_RESUMABLE_UPLOADS_ENABLED` is exactly the string `true`. A failed multipart transfer never silently falls back to legacy upload or starts a replacement logical session. Files, controllers and upload bytes stay out of React state and IndexedDB. Upload progress uses verified receipts and remains below 100% until completion.

Multipart recovery keeps the stable create key/session, reconciles all paginated receipts and verifies reselected source digests before writing. Web Locks exclude cooperating tabs; five origin budget locks are independent of Shared's four global part-buffer leases. Offline/online recovery has two automatic attempts, bounded jitter and Retry-After; explicit Pause/Cancel remains explicit. Logout/scope teardown releases local work without implicitly cancelling server sessions. Creator-only cancellation remains narrowly available after assignment revocation/flag disable; normal reads/parts/finalization still reauthorize. Existing bytes already delivered cannot be recalled.

Downloads require exact full/range geometry, opaque strong validator, Content-Length and EOF; a 200 response to a resumed request cannot be appended. Durable recovery is paused until user activation/permission, current authorization, matching local checkpoint size, current remote identity and full prefix comparison succeed. Checkpoints commit at geometrically increasing offsets from 32 MiB and on Pause. Cancel preserves previously committed prefixes. Browser locks do not protect against external OS edits. Byte comparison and acknowledged writes do not establish physical fsync or an independent provider full-file checksum. Final native close already submitted cannot be recalled on logout.

## Phase 6 changes and verified findings

| Finding | Resolution / boundary |
| --- | --- |
| Upload queue retained an unbounded number of File references and rows | Limit 50 including recovered/finished rows. An overflowing new selection is rejected atomically before task retention/network; existing operation feedback explains how to clear/retry. Restore never exceeds the bound. No automatic cancellation of existing sessions |
| Every status/receipt page rewrote identical D1 broker state | Conditional update changes only differing mapping/state. Trigger-based test proves unchanged reads do not update rows and changed state still persists. Auth/capability/D1 reads remain; no claim of constant-cost 10 GiB upload |
| Earlier acceptance runner omitted explicit download recovery/concurrency cases | Added interrupted HTTP response → original If-Range 206 → whole-file SHA-256, stale If-Range full-200 fallback, and concurrent streamed checksums on the 100 MiB test object |
| Runner imposed a five-minute total download deadline | Download acceptance now uses 30s connection/60s read inactivity deadlines; active streaming has no fixed total deadline. Application/backend deadlines unchanged |
| Some required acceptance gates were absent from machine report | Added explicit BLOCKED rows for native browser durability, real-platform logout/revocation, unavailable storage and provider CPU/disk. These require independent operator/browser evidence, not automatic PASS |
| Default-off setup was implicit in environment sample | `.dev.vars.example` now explicitly shows `STORAGE_RESUMABLE_UPLOADS_ENABLED=false`; deployment config remains unchanged |

Source audit covered current queues, hooks, capability normalizers, auth/scope cleanup, storage and multipart clients, upload broker, Range proxy, transfer UI, both migrations, Shared entrypoint/routes/manager/adapter, Docker/Compose and acceptance worker. Existing tests exercise small/multipart routing, stale/late lifecycle replies, cancel/ack uncertainty, ownership, paginated receipts, checksum mismatch, disk/handle/permission errors, Range fallback, concurrent scheduling and idempotency. No provider defect is inferred from mock success.

## Verification evidence

Final command results: **263 Node +82 UI tests, zero failures/skips; Shared49/49; lint/build/diff checks PASS**. Exact commands are recorded in PROJECT_HANDOFF.md and [local-validation.json](acceptance/phase-6-2026-11-08/local-validation.json). Local evidence files are outside Git under `/private/tmp/nexora-phase6-*.log` and `/private/tmp/shared-phase6-test.log`. Durable provider results are [results.json](acceptance/phase-6-2026-11-08/results.json) / [results.md](acceptance/phase-6-2026-11-08/results.md); all **25 scenarios are BLOCKED**, evidence `not-run`, measurements null. Generating this report intentionally exits 2 and performs no provider I/O.

| Check | Result / evidence type |
| --- | --- |
| Nexora lint / complete Node + UI tests / build / diff check | PASS; exact final counts in handoff |
| Shared `pnpm --dir garage/storage test` | PASS **49/49**, mocked S3/in-memory SQLite/real loopback transport; no real Garage |
| Nexora → Shared Hono/adapter bridge tests | PASS with explicit Shared source path, mocked S3; acceptance worker also boots/stops with no S3 commands |
| New streaming acceptance helper | PASS unit corruption/truncation/incorrect-200 checks and real loopback concurrent/Range/idle-abort checks; test bytes only |
| D1 migration 0011 target schema | PASS read-only live verification; details below |
| Shared migration 0002 target schema | BLOCKED; operator report retained as unverified for that target |
| Chrome desktop/mobile viewport | PASS local fixture APIs + native OPFS/IndexedDB/Web Locks; no native Save As claim |
| Safari/Firefox/physical mobile/OS permission UI | NOT RUN; unsupported picker/capability uses native fallback |
| Garage 100 MiB / 1 GiB / 10 GiB / real interruptions | BLOCKED, no authorized isolated resources; no payload was transferred to Garage |
| Provider CPU/disk/RSS/throughput, capacity and actual proxy/Access/Tunnel | BLOCKED / NOT RUN; no invented measurements |
| Deployment, production flags, migrations, production transfer mutations | NOT RUN, no authorization |

Browser environment: Chrome on `http://127.0.0.1:5180/files`, 1280×900 Dark and 390×844 Light. Browser plugin not available; used preinstalled Playwright/Chrome with an isolated temporary profile. First restricted launch failed with SIGABRT/EPERM; approved execution succeeded. Meaningful My Files title/content, no framework overlay, no page/console errors, no horizontal overflow. Actual OPFS handles were structured-cloned through native IndexedDB. Pause → checkpoint → reload → explicit Recover, simulated permission denial → no request/writer, browser process close/reopen → paused restore/no automatic network → prefix verification and Range recovery, lost handle → visible error/Cancel, native lock contention and byte-by-byte verification of 8 MiB output passed. 51-file admission rejection is also exercised. Screenshots `/private/tmp/nexora-phase6-desktop.png`, `...-mobile.png`, `...-upload-cap.png`. Substituted picker/mocked HTTP is explicitly weaker than OS-visible permissions, actual Internet loss or Garage.

## Migration and deployment configuration

**D1 0011: verified live.** `wrangler d1 execute nexora-db --remote` ran only SELECT/sqlite_master and PRAGMA metadata queries. Observed table/index SQL exactly matches `migrations/0011_transfer_sessions.sql`, including size/state constraints, foreign keys, owner index and unique `(user_id, storage_id, request_key_hash)`. Columns and cascade foreign keys were inspected. All remote responses reported zero writes and unchanged database. Sanitized durable evidence: [migration-verification.json](acceptance/phase-6-2026-11-08/migration-verification.json). The first invocation also reported local log-path EPERM; a repeat with `WRANGLER_LOG_PATH=/private/tmp/...` succeeded. This proves current schema, not who applied the migration or current deployed runtime revision.

Production Pages **secret names/presence only** were successfully listed: required `STORAGE_API_URL`, `STORAGE_APP_SECRET`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` are registered; optional timeout/legacy limit and share key names also exist. Values, validity, current plaintext vars, current flag setting and connectivity were **not** inspected or established. `wrangler.jsonc` binds `DB` to `nexora-db`; it contains no enabled multipart flag. Local environment absence of a Cloudflare API token did not prevent Wrangler's existing authenticated read-only access.

**Shared 0002: operator action required.** Do not assume target DB from a neighboring ignored runtime file. On the confirmed operator host/service, run the following read-only inspection (not run here):

```bash
cd /path/to/issuedesk/garage
docker compose exec -T storage-api node --input-type=module <<'JS'
import Database from 'better-sqlite3';
const db = new Database(process.env.DATABASE_PATH || '/app/data/storage.db', { readonly: true, fileMustExist: true });
try {
  console.log(JSON.stringify({
    migration: db.prepare('SELECT version,name FROM storage_schema_migrations WHERE version=2').all(),
    definitions: db.prepare("SELECT name,type,sql FROM sqlite_master WHERE name IN ('upload_sessions','upload_sessions_cleanup','upload_parts','upload_cancellations','upload_part_leases') ORDER BY name").all(),
    columns: Object.fromEntries(['upload_sessions','upload_parts','upload_cancellations','upload_part_leases'].map(name => [name, db.pragma(`table_info(${name})`)])),
    indexes: db.pragma('index_list(upload_sessions)'),
    foreignKeys: db.pragma('foreign_key_list(upload_parts)')
  }, null, 2));
} finally { db.close(); }
JS
```

Compare definitions, all columns, constraints, unique keys and cleanup index against `garage/storage/migrations/0002_resumable_uploads.sql`. Version row alone is insufficient. If target/schema differs, stop and review a backup/migration plan; **do not reapply or overwrite** data for verification. No Shared runtime DB/WAL/SHM or `.env` was opened during this task.

Required Shared names from production entrypoint: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `STORAGE_API_TOKEN`; DB path defaults to persistent service data path. `PORT`, `MAX_FILE_SIZE_MB`, `STORAGE_PROVIDER_TIMEOUT_MS`, `ENABLE_LEGACY_API` and multipart flag are optional controls. Shared app/project credentials and Nexora internal project mapping must also match; legacy API token is not a substitute for app credential authentication. Inspect presence only through approved operator tooling, never dump container environment.

Source deployment: Shared Dockerfile `node:22-alpine` with native better-sqlite3 compilation and nonroot node user; copies migrations but does not automatically apply them. Compose Garage image `dxflrs/garage:v2.1.0`; cloudflared uses `latest`. Neither is a verified running image/digest. Docker install uses `npm install --omit=dev` without copying a lockfile, so rebuilds can resolve different allowed package versions. Pin tested image/dependency artifacts through operator release controls before rollout; no dependency or image change was made here. Node26.13.0 local tests do not prove the Node22 image builds or that the deployed native addon loads. No Docker/Podman/Garage executable was available here.

## Platform, resources and monitoring requirements

Official [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) list 128 MB memory per isolate and zone request body limits of 100 MB for Free/Pro and 200 MB Business. Streaming responses have no enforced body-size maximum; CPU, request, connection and WAF policies still apply. 8 MiB parts are below those documented body ceilings; this does not verify the deployed plan, Access policy, proxy buffering or request budgets. The [Garage compatibility matrix](https://garagehq.deuxfleurs.fr/documentation/reference-manual/s3-compatibility/) lists MPU commands but requires deployment-specific testing; it does not certify this Garage version's conditional Range behavior. Documentation reviewed in this task, deployed values unverified.

| Source limit / operating rule | Measured result / rollout recommendation |
| --- | --- |
| Shared 4 global leased parts × 8 MiB | 32 MiB payload bound is not peak RSS; SDK/streams/hash/GC/addon memory add overhead. Real RSS/CPU null. Start isolated concurrency 2, downloads 2, no greater production claim |
| 10 unfinished broker rows/user; 20 Shared sessions and 100 GiB pending/project | Logical admission only. Physical capacity, replication, temp files, metadata/WAL and free-disk reserve must be operator measured. Expired untouched broker rows/metadata retention may consume admission/history until reconciliation; monitor and resolve explicitly |
| 50 retained uploads + 50 downloads | Bounds browser task/File references, not provider storage or total process memory; clear finished entries before admitting more |
| Upload 240s operation / 900s lease; Pages transfer deadline 270s | Proxy/origin must support the intended paced 8 MiB operation and disconnects. Crash recovery can wait a full lease; no force takeover |
| Download connection bounded; 60s inactivity in Pages/Shared defaults | Test long active streams beyond 60s, idle stalls, cancellation/backpressure, identity encoding and exact headers on the actual test chain |
| Two automatic client retries; cooldown respects Retry-After | Collect 429/5xx/timeouts/retry rates. Platform rate limits/admission across devices remain required; UI locks alone are insufficient |
| 1,280 parts for 10 GiB | Receipt/status reads and repeated provider reconciliation can grow superlinearly; cached source digests avoid repeated hashing, but no end-to-end D1/provider cost or 10 GiB latency budget is proven. Measure request/D1 rows/CPU under the authorized workload before rollout |
| Startup + hourly Shared sweep, 20 sessions/batch | Monitor cleaned/pending/failures, oldest unfinished/expired/completing age, MPU inventory and backlog drain. `/health` is a process route, not proof of writable storage or Garage health. Compose declares no explicit healthcheck or memory/CPU limit |
| Fixed 7-day session TTL, persistent journals/tombstones | No automatic safe pruning policy established. Retention review, DB/WAL growth alerts, backup/restore and bounded pilot duration are required; do not delete journals to free space and break retry/idempotency guarantees |

No real RSS, CPU, disk high-water or throughput measurements exist for this run. The runner samples parent RSS every250ms and Shared every500ms plus SDK boundaries; it cannot replace container/Garage OS monitoring or prove peak maxima. Prefix download recovery rereads/retransfers the saved prefix; geometric checkpoints can copy local prefixes. OS free-space requirements must cover temporary destination/checkpoint copying. Do not promise a 10 GiB file fits in only 10 GiB of local free space.

Logging policy: retain only stage/status/allowlisted error and cleanup counts; no credentials/provider IDs/capability URLs/request bodies. Audit Access/Tunnel/HTTP logs and public capability-path redaction independently. No logging infrastructure or rate policy was changed. Keep private acceptance journals outside Git until cleanup is verified; delayed provider effects require repeated orphan inventory checks.

## Exact first authorized real-provider test

This is a **future operator procedure**, not permission to run now. Operator must explicitly authorize a separate isolated Garage endpoint and a fresh empty bucket with restricted dedicated key. Real tests must never borrow production credentials, app bindings, D1 or storage data. The runner uses disposable local SQLite and source factories; it is not a Cloudflare workerd/deployed Pages test.

From Nexora root:

```bash
cp scripts/acceptance/config.example.json /private/tmp/nexora-acceptance-config.json
```

Edit the copied non-secret JSON with the actual test endpoint/source path and **initial** workload:

```json
{
  "isolatedTestResources": true,
  "endpoint": "https://OPERATOR-ISOLATED-GARAGE-HOST",
  "region": "garage",
  "bucket": "nexora-acceptance-OPERATOR-FRESH-SUFFIX",
  "confirmDisposableBucket": "nexora-acceptance-OPERATOR-FRESH-SUFFIX",
  "sharedStorageRoot": "/Users/ghuninew/GitHub/issuedesk/garage/storage",
  "maxLogicalBytes": 209715200,
  "sizesMiB": [100],
  "concurrentFiles": 2,
  "maxParentRssBytes": 536870912,
  "maxSharedRssBytes": 536870912,
  "sharedPort": 0,
  "nexoraPort": 0,
  "slowPartSeconds": 0
}
```

Replace uppercase placeholders with real authorized values (bucket suffix lowercase per template validation). 200 MiB is simultaneous logical payload budget for two100 MiB uploads, **not** physical free-space or total traffic: the suite repeats many100 MiB scenarios, checksums and concurrent downloads. 512 MiB RSS values are example **failure thresholds for the Node acceptance processes**, not measured requirements, container limits or a valid Workers allowance. Operator must approve physical/disk/egress and RSS budgets before the run.

Inject `NEXORA_ACCEPTANCE_S3_ACCESS_KEY_ID` and `NEXORA_ACCEPTANCE_S3_SECRET_ACCESS_KEY` through operator's private test secret channel; no credentials in JSON, command arguments or chat. Then:

```bash
node scripts/acceptance/run.mjs --run \
  --config /private/tmp/nexora-acceptance-config.json \
  --report-dir /private/tmp/nexora-phase6-real-acceptance
```

Multipart is enabled only in disposable fixture objects; no global production flag is needed to test100 MiB. Check per-scenario PASS/FAIL/BLOCKED, full SHA-256, original-session recovery/ack-loss/duplicate completion, four-part bound and final cleanup. Exit2 is expected when1/10 GiB, proxy and manual gates are unverified; it is not success. Do not change report statuses manually without separate evidence.

Later authorize `[100,1024]`, then `[100,1024,10240]` and adequate simultaneous logical/physical/RSS budgets, record image versions/digests and resource monitoring. No size is supported in production merely because it is present in source. Concurrent download tests verify the same original object through independent streams, while concurrent upload tests create distinct objects.

If an owned run crashes or cleanup fails, preserve its private journal and use the exact original config/endpoint/bucket:

```bash
node scripts/acceptance/run.mjs --run \
  --config /private/tmp/nexora-acceptance-config.json \
  --cleanup-journal /private/tmp/nexora-acceptance-RUN/private-provider-journal.json \
  --report-dir /private/tmp/nexora-phase6-cleanup
```

Cleanup refuses foreign resources/mismatched markers, touches only exact journal-owned keys/MPUs and never deletes the bucket. Missing ownership evidence requires operator investigation, not broad deletion. For proxy tests use fixed unused `sharedPort`/`nexoraPort`, explicitly configured isolated HTTPS origins and identity handshake, then `slowPartSeconds:30..210`. Access token wiring is a separate isolated configuration gate; never weaken production Access to run the fixture.

Manual required evidence: real browser Save As/permission revocation, upload original-file reselection/reload/multi-tab takeover, simultaneous upload+download, real Internet interruption, logout/session expiry and assignment revocation before subsequent parts/Range requests, provider unavailability, disk-full, Node22 container startup, long active streams and delayed orphan cleanup. Runner fault injection and Node loopback cannot establish all these conditions. Safari/Firefox lacking the picker must be tested as native fallback, not advertised as durable managed download.

## Controlled activation and rollback checklist

No safe account-scoped multipart flag exists. The two environment flags are service/deployment-wide; existing permissions are authorization, not canary flags. Do not invent an email/user flag, grant bypass or enable globally for a test. Use a separately isolated Nexora Pages test deployment + D1 + Shared app/project/service + disposable Garage mapping and operator/test account only. Restrict access through approved infrastructure. Do not point test aliases at production data or reuse browser origins/recovery stores across environments.

Before approval to activate isolated runtime:

- [ ] Verify both deployed source revisions/digests and protocol/capability geometry; verify target0011/0002 schemas without reapplying
- [ ] Verify private bindings, independent DB/storage mappings and backup/recovery; validate Node22 image and dependencies
- [ ] Authorize physical capacity/egress, container budgets, rate controls, retention/cleanup alerts and pilot duration
- [ ] Confirm empty disposable bucket/test-only key and run the harness; preserve sanitized reports and private cleanup journals separately
- [ ] Run actual workerd/Pages/Access/Tunnel and native-browser acceptance; all required gates and supported size policy approved
- [ ] Only then set `STORAGE_RESUMABLE_UPLOADS_ENABLED=true` in **both isolated server environments**, through separately approved deployment/config action; refresh capabilities and verify legacy small-file routing
- [ ] Confirm cancel/cleanup still works, identify the operator and abort thresholds, monitor first transfers; production multipart activation remains unauthorized

Rollback after separately authorized activation:

1. Stop new admission/pilot testing. Keep tested binaries/mappings/journals and unchanged schema available. Record uncertain/completing transfers.
2. Disable resumable flag on Nexora first, then Shared in the approved target. Do not assume this stops already executing requests or native downloads. Range/managed download support is **independent** of the multipart flag; stopping it requires a separately approved client/service rollback or access change. Do not claim upload flags disable downloads.
3. Keep creator cancellation and Shared cleanup reachable under existing authorization; resolve ambiguous completion using authoritative status/marker/journal, never force-republish or delete a published file.
4. Observe startup/hourly cleanup, lease expiry, exact owned MPU inventory and delayed effects. Preserve committed download prefixes and scope-specific browser recovery records as appropriate.
5. Roll back source to a tested compatible release only after review; do not drop0011/0002 tables, restore production DB in place, delete journals or rotate secrets as routine rollback. Follow `BACKUP_RECOVERY.md` for separately authorized isolated restore.
6. Recheck legacy upload/download/auth and no unauthorized activity; retain operator evidence and keep production rollout blocked until gaps are closed.

Required open blockers are target Shared schema/deployed protocol, authorized isolated Garage resources, actual container/provider/capacity and platform controls, native-browser/OS acceptance, and retention/rate/resource operating policy. Further runtime changes should follow an identified failure or reviewed policy; this task does not create another speculative development phase.
