# Upload rejection: diagnosis and real-test preparation

Later on 2026-11-08, the operator confirmed the capability issue was resolved and a real multipart upload started; the same file later completed after an interruption. The false-capability response below is a historical observation, not a claim about the current deployment. See [multipart interruption/retry findings](MULTIPART_UPLOAD_RECOVERY.md) for the subsequent investigation.

## Verified findings (2026-11-08, Asia/Bangkok)

The authenticated **production** Nexora capabilities response was inspected read-only in the user's Chrome session:

```json
{
  "upload": true,
  "maxUploadBytes": 26214400,
  "transfers": { "resumableUpload": false }
}
```

This is the confirmed immediate blocker for `garage 2.zip`: the queue cannot select multipart. `selectUploadStrategy` previously converted missing/disabled/incompatible multipart support into `UPLOAD_TOO_LARGE`, so the Transfer Manager said “This file is too large for the connected storage.” before any byte request. This response does not establish a Garage object-size limit, a quota failure, or a 100 MiB limit.

The operator reports both flags set to `true`. The deployed result still reports false. Source shows that, with upload permission true, this happens if **either** Nexora's active environment value is not exactly the string `true` **or** the Shared process reached by Nexora does not advertise `transfers.resumableUpload: true`. Missing/incompatible transfer geometry with an asserted true capability would instead fail capability negotiation with a provider error. The exact server with stale/incorrect effective configuration remains unverified; do not infer it from a saved dashboard value or local `.env`.

Read-only Wrangler checks found the required production secret names present (encrypted, values not read), a recent production deployment with source label `d4e878d`, and the Nexora D1 `transfer_sessions` table, all 14 expected column names/types and its three indexes. All D1 statements reported `rows_written: 0` / `changed_db: false`. This is a schema-presence check, not a full constraint/deployment audit. Shared migration 0002, the active Shared image/source version, Garage capacity and service permissions were not remotely verified.

## Limits and runtime flow

| Value | Meaning | Current policy |
| --- | --- | --- |
| `maxUploadBytes` / Nexora `STORAGE_MAX_UPLOAD_BYTES` | Direct file/request-path budget | At most 26,214,400 bytes (25 MiB), may be lower |
| Direct form-data overhead | Extra request bytes around the file | Separately bounded by the existing Pages handler; not usable file capacity |
| `transfers.maxFileBytes` | Multipart file maximum | `min(provider advertised maximum, 5_000_000_000)` |
| `transfers.partSizeBytes` | Bytes in each raw part request | 8,388,608 (8 MiB), final part may be shorter |
| Multipart geometry | Protocol bounds | Up to 1,280 parts, one part operation per session, 604,800-second TTL |
| Queue concurrency | Active file in this browser tab | 1; not a cross-tab/user limit |
| Quota/capacity | Available provider space/admission budget | Independent; never estimated from file limits or folder listings |

Small files within the direct limit use the existing form-data route. Larger files require negotiated multipart and use Browser → Nexora `/uploads` broker → Shared `/v3/projects/.../uploads` → Garage multipart adapter. Each 8 MiB part is streamed through Pages, independently checksummed, and acknowledged before progress advances. There is no large direct-request fallback.

The patch separates local multipart readiness errors from actual size errors. It also preserves multipart API quota, capability and size errors instead of treating quota as retryable rate limiting or reducing known errors to generic validation. A provider supporting less than 5 GB can now negotiate its actual file ceiling; new sessions and further writes/resume/complete enforce that ceiling server-side. Existing status and creator-owned cancellation remain available under the existing authorization/flag rules. No dependency, migration, architecture, concurrency, recovery store, retry identity, cleanup or provider code was changed.

## Operator checks before real upload

These commands are provided for review; production mutations below were **not executed**.

1. In the authenticated production session, inspect `GET /api/storage/v1/storages/<logical-storage-id>/capabilities`. Use the application's actual hostname/session, not a different preview deployment. Confirm `upload: true` and `transfers.resumableUpload: true`, with the geometry above and `maxFileBytes >=` the exact local file byte size. The response is safe logical metadata; do not share cookies, auth headers or internal provider references.
2. Nexora Pages **Production** must have `STORAGE_RESUMABLE_UPLOADS_ENABLED` set to exactly `true` (lowercase, no quotes/whitespace). The registered secret name alone proves no value. A configuration edit must be used by the active deployment; redeploy after the reviewed setting change. If the correct value is already deployed, do not rotate/rewrite it speculatively. To explicitly set the known non-sensitive flag if needed:

   ```bash
   printf '%s' true | pnpm exec wrangler pages secret put STORAGE_RESUMABLE_UPLOADS_ENABLED --project-name nexora
   ```

3. On the verified Shared host, from the existing `garage` Compose directory, check only the effective boolean in the running service (no secrets or full environment dump):

   ```bash
   docker compose exec -T storage-api node --input-type=module -e 'console.log(JSON.stringify({resumableEnabled:process.env.STORAGE_RESUMABLE_UPLOADS_ENABLED === "true"}))'
   ```

   The current Compose source loads `./storage/.env` into `storage-api`. Its `STORAGE_RESUMABLE_UPLOADS_ENABLED=true` must reach the running container. A restart alone does not reload changed Compose environment. If a reviewed config/source change needs activation, the operator command is:

   ```bash
   docker compose up -d --build --force-recreate storage-api
   ```

   This recreates a production service and is **not** a read-only check. Confirm the host, image/source, backup and migration state before using it. Current Shared source requires the migrated schema and does not apply migrations at startup; perform any missing migration only under a separately reviewed operator request. Ensure the deployed source includes `src/storage/upload-routes.js`, `src/storage/uploads.js`, the Garage multipart adapter and `migrations/0002_resumable_uploads.sql`. Compare the host's reviewed source/image with the running image; a true environment flag cannot add missing multipart routes to an older image.
4. Shared requires migration 0002; Nexora requires migration 0011. Do not reapply either solely to verify it. A read-only Shared presence check against the running container is:

   ```bash
   docker compose exec -T storage-api node --input-type=module -e 'import Database from "better-sqlite3"; const db=new Database(process.env.DATABASE_PATH,{readonly:true,fileMustExist:true}); try { console.log(JSON.stringify({migration2:!!db.prepare("SELECT 1 FROM storage_schema_migrations WHERE version=2").get(),tables:db.prepare("SELECT name FROM sqlite_master WHERE type=? AND name IN (?,?,?,?)").all("table","upload_sessions","upload_parts","upload_cancellations","upload_part_leases")})); } finally { db.close(); }'
   ```

   A version row or a table name does not prove all constraints/indexes. If missing/mismatched, stop for a separately reviewed migration plan. Do not copy/read DB files, WAL/SHM or credentials.
5. Keep `STORAGE_MAX_UPLOAD_BYTES=26214400` for Nexora's direct path and Shared's `MAX_FILE_SIZE_MB=25` unless an independently reviewed smaller direct policy is intended. Setting either to 5 GB does not enable multipart. Existing server-only `STORAGE_API_URL`, `STORAGE_APP_SECRET`, Access service credentials, mount/project mapping, active assignment and upload grant must remain valid. The observed production response already indicates effective upload permission; no grant modification is required by this patch.
6. After review, deploy Nexora with the existing command (not executed here):

   ```bash
   pnpm deploy
   ```

   Reload the workspace to refresh capabilities, clear the old rejected local row and select the file again. Confirm session creation, 8 MiB part PUTs, server-acknowledged progress and completion. A file of 182,700,000 bytes uses 22 parts; 182.7 MiB uses 23. Never send the full file as one direct request.

If capabilities remain false, stop at checks 2–3 and verify the actual target/deployed version. If session creation returns quota, permission, busy or provider failure, resolve that specific cause; do not bypass authorization, increase limits blindly, or infer available capacity. For the isolated real test, verify the resulting Garage-backed object by download/checksum and check cancellation/cleanup as appropriate. This task did not upload to production or claim end-to-end Garage success.

## Validation

- `pnpm lint`: PASS.
- `pnpm test` with existing `NEXORA_SHARED_STORAGE_ROOT` and `NEXORA_ACCEPTANCE_TEST_DEPENDENCIES` pointing to the adjacent Shared checkout: PASS, 231 Node + 91 UI, zero skips/failures. Bridges use actual Shared Hono/SQLite/adapter code with mocked S3, not real Garage.
- One intermediate full rerun failed two existing `storage-provider` tests with timeouts; that file passed 3/3 in isolation, then the final full rerun passed all 231 Node + 91 UI tests without source/test changes for those failures. Their intermittent timing sensitivity remains a test limitation.
- `pnpm build`: PASS.
- `git diff --check`: PASS.
- Regression coverage: small/direct thresholds, 182.7 MB and MiB admission, multipart selection, exact 5,000,000,000-byte maximum and one byte over, smaller real provider maximum, invalid/disabled capability, quota/permission errors, existing session/recovery/cancel tests. Large boundaries are metadata tests, not allocated 5 GB uploads.
- Chrome at `http://127.0.0.1:5183/files`, 1280×900 and 390×844: PASS with mocked same-origin API. The real UI/client read a synthetic 182,700,000-byte local file, sent 22 raw parts with SHA-256 checked by the mock, and completed once. Small 3-byte file used direct upload. Disabled multipart produced the specific readiness message and zero upload calls. Title/content, no Vite overlay, zero relevant console/page errors, and no mobile document/dialog overflow verified; screenshots visually inspected. This does not exercise deployed Pages, Shared or Garage.
- Browser plugin unavailable; cached Playwright/Chrome used with a separate temporary profile. npm wrapper cache and sandbox Chrome launch initially failed; direct cached runtime plus approved local browser execution resolved those environment issues. No dependencies installed or user profile controlled for local QA. Task-created browser/server closed in `finally`, large temporary fixture deleted.
- No 10 GiB, load/stress, production upload, deployment, migration, secret change, infrastructure change, commit or push was performed.
