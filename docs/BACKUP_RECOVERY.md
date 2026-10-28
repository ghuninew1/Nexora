# Nexora Backup & Recovery Runbook

Updated: 2026-10-28. This runbook is based on checked-in source/configuration only. It does not establish that the described repository deployment matches production. Confirm the actual deployment revision, mount paths, secrets, Cloudflare plan, backups, and recovery objectives with the operator before any production procedure.

## Safety and status

- Never make the live production database the first restore target. Restore into disposable local or isolated infrastructure, verify it, then plan a separate deliberate production cutover.
- Commands marked **operator / production** access production resources. None were run for this phase. They require an approved window, appropriate credentials, and an independently confirmed target.
- Do not overwrite a database or Garage volume in place from an unverified backup. Preserve the damaged state first. Do not use `docker compose down -v`, `wrangler d1 time-travel restore`, `wrangler d1 backup restore`, or `wrangler d1 execute ... --remote --file` as casual recovery commands.
- No backup destination, schedule, retention job, restore drill, or production path was present in the inspected repositories. The policy below is a recommended baseline, not an existing guarantee.

## Authoritative data inventory

| Component | Classification and authoritative contents | Location evidenced by source | Backup / recovery dependency |
| --- | --- | --- | --- |
| Nexora D1 | **AUTHORITATIVE**: users/password hashes, sessions, mounts and Shared Storage project mapping, login throttles, Favorites, Recent, public share token hashes/revocations, Activity | Wrangler `DB` binding points to D1 `nexora-db`; migrations `0001`–`0003` | Export schema + rows. Restore compatible schema and data; mount project IDs must match the recovered Storage API/Garage projects. Sessions can be invalidated if desired, but doing so logs everyone out. |
| Nexora migrations and app config | **CONFIGURATION / RECOVERY INPUT**: migration SQL, Pages routes, Wrangler binding name/database ID, static headers, source revision | `migrations/`, `functions/`, `src/`, `wrangler.jsonc`, `public/_headers` | Preserve source revision/build inputs and operator-controlled binding/secrets separately. A migration rebuild recreates schema only, never user data. |
| Storage API SQLite | **AUTHORITATIVE**: apps, app credential hashes/status, projects and bucket mapping, legacy file rows, logical `storage_objects`, provider references, trash/operations/name reservations, schema migration ledger | Adjacent IssueDesk checkout: `garage/storage/src/db.js` defaults to `data/storage.db`; Compose sets `/app/data/storage.db` and mounts `./storage/data:/app/data` | Consistent SQLite Online Backup API copy; restore before enabling API traffic. Confirm actual production host path with operator. Database and Garage objects are a coupled recovery set. |
| Garage metadata | **AUTHORITATIVE**: node identity/peer state, buckets/keys, object/version/block index and layouts | Adjacent `garage/garage.toml` sets `/var/lib/garage/meta`; Compose mounts `./data:/var/lib/garage` | Garage metadata snapshot plus a coordinated full-volume backup. Snapshot alone is not object data. Exact current production state requires operator confirmation. |
| Garage object blocks | **AUTHORITATIVE**: uploaded bytes | Adjacent Garage config sets `/var/lib/garage/data`; same Compose volume as metadata | Back up with metadata as a coordinated recovery set. Config says replication factor 1, so there is no second Garage node to rebuild missing data from. |
| Garage / Storage API configuration | **CONFIGURATION** plus **SECRET** values: pinned Garage image/config, Storage API image/source and env variable names, Compose topology, S3 region/bucket/credentials, API/admin/tunnel tokens | `garage/docker-compose.yml`, `garage/garage.toml`, `garage/storage/.env.example`; actual secret store and production checkout path are unknown | Back up non-secret config and source revision. Restore secret values from approved secret manager/offline escrow; never put values in this repo or a backup manifest. |
| Nexora listing cache / browser queue | **REGENERABLE / transient**: in-memory metadata cache and selected upload queue state | Browser session | Not backed up; rebuild from the source services and user re-selection. |

Storage API `projects.bucket` determines the Garage bucket for each project. Storage API `files.object_key` / Phase S1 `storage_objects.provider_reference` points to Garage data. Nexora D1 `storage_mounts.shared_storage_project_id` must map to the same recovered project IDs. Do not restore these databases independently and then assume objects still resolve.

The inspected Compose file publishes Garage S3 and Storage API ports on the host and runs cloudflared; actual firewall, tunnel, Cloudflare Access and QNAP configuration are not visible here. Host path and service exposure must be confirmed by the operator.

## Backup set, names, manifest, and retention

Create one dated set in UTC, for example:

```text
backup-set-2026-10-28T200000Z/
  d1/nexora-d1-2026-10-28T200000Z.sql
  storage-api/storage-api-2026-10-28T200000Z.sqlite
  garage/garage-node-2026-10-28T200000Z/   # metadata snapshot + data + required layout/config
  manifest.json
  SHA256SUMS
```

A small manifest can use this shape (populate only artifact metadata):

```json
{
  "createdAt": "2026-10-28T20:00:00Z",
  "setId": "backup-set-2026-10-28T200000Z",
  "sources": {
    "nexoraRevision": "<git-revision>",
    "nexoraMigrations": ["0001", "0002", "0003"],
    "storageApiRevision": "<git-revision>",
    "storageApiSchema": "<migration-ledger-version>",
    "garageImage": "dxflrs/garage:v2.1.0"
  },
  "artifacts": [
    { "component": "nexora-d1", "path": "d1/nexora-d1-2026-10-28T200000Z.sql", "bytes": 0, "sha256": "<digest>" },
    { "component": "storage-api", "path": "storage-api/storage-api-2026-10-28T200000Z.sqlite", "bytes": 0, "sha256": "<digest>" },
    { "component": "garage", "path": "garage/garage-node-2026-10-28T200000Z/", "sha256Manifest": "SHA256SUMS" }
  ]
}
```

Each manifest should include `createdAt` (UTC), component, backup type, source Git revision, schema/migration versions, Garage image tag, file relative paths, byte sizes, and SHA-256 checksums. It must not include secret values, credential hashes, object names, public capability URLs, or database contents. Keep backup artifacts encrypted at rest and access-controlled: D1 and Storage API exports contain private account/file metadata and hashes.

Recommended baseline retention for each component: 7 daily, 4 weekly, 3 monthly recovery points. For large Garage data, use a tested deduplicating/incremental backup system if needed, but preserve immutable dated recovery points; do not use mirror/sync semantics that propagate accidental deletion as the sole backup. Apply the same retention to a complete Garage recovery set, not just metadata snapshots.

Use at least one backup copy outside the QNAP/device failure domain, with a 3-2-1 target (three copies, two storage/media locations, one off-device/off-site). A second folder or disk in the same NAS enclosure is not an off-device copy. The actual destination/provider is an operator decision; none is configured in source.

Example local checksum workflow after artifacts exist:

```bash
cd /path/to/backup-set-2026-10-28T200000Z
shasum -a 256 d1/nexora-d1-2026-10-28T200000Z.sql storage-api/storage-api-2026-10-28T200000Z.sqlite > SHA256SUMS
shasum -a 256 -c SHA256SUMS
```

Include every Garage snapshot/archive/config artifact in the checksum list. SHA-256 verification detects artifact changes; it does not prove that the application can recover from the artifacts.

## Nexora D1 export and recovery

Wrangler installed in this checkout is 4.154.0. Its local help confirms `wrangler d1 export <name> --remote --output <path>`, `--no-data`, and `--no-schema`; the supported export is SQL. Cloudflare documents `wrangler d1 execute <name> --file=<path>` for import. Export is data-bearing and sensitive. Export may block database queries while Cloudflare produces the dump; schedule and assess impact before a production export. See [Cloudflare D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/).

**Operator / production export (read-only; not run here):**

```bash
pnpm exec wrangler d1 export nexora-db --remote --output=/secure/offsite/nexora-d1-2026-10-28T200000Z.sql
shasum -a 256 /secure/offsite/nexora-d1-2026-10-28T200000Z.sql > /secure/offsite/nexora-d1-2026-10-28T200000Z.sql.sha256
```

Replace the UTC timestamp and secure destination for each run. Confirm Cloudflare account/profile and intended D1 binding before execution. Copy the verified export off-device and encrypt it. Do not store it in this repository.

Two distinct paths:

1. **Migration-based empty rebuild**: create a new empty D1 target, apply this repository's migrations `0001_backend_foundation.sql`, `0002_public_shares.sql`, and `0003_activity_events.sql` in order, then perform operator-controlled first-admin/mount provisioning. This restores no existing accounts, session, favorites, recent entries, shares, or activity and cannot recover files.
2. **Data recovery**: use a full D1 SQL export. First import it into a disposable local/isolated D1 and verify schema, migration ledger, row counts, user ownership, mounts, shares, Favorites/Recent/Activity, and login behavior. A full export includes schema and rows; do not reapply the migration chain over it. Only after a reviewed recovery/cutover plan may an operator import into a separately created new D1 target and update the deployment binding. Never import over the current production D1 by default.

For a local disposable validation target, use a newly created empty persistence directory and the project's explicitly local Wrangler mode; do not use the configured local state used by normal development if it contains anything valuable:

```bash
pnpm exec wrangler d1 execute nexora-db --local --persist-to /private/tmp/nexora-d1-restore-check --file=/secure/offsite/nexora-d1-2026-10-28T200000Z.sql
```

Confirm the exact flags with the installed Wrangler before use. This command is local-only; it was not run because no backup artifact exists. A migration-only test target uses `wrangler d1 migrations apply nexora-db --local --persist-to /private/tmp/nexora-d1-empty-rebuild` and contains no production data.

D1 Time Travel may provide a short rollback window, but it restores in place and is not an off-device export. Cloudflare currently documents 7 days on Workers Free and 30 days on Workers Paid, subject to account/database support; the actual Nexora plan is unknown. Treat `wrangler d1 time-travel restore` as destructive, break-glass production recovery only after separately approved backup/target review. See [Cloudflare D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) and [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

## Storage API SQLite backup and restore

The Storage API database uses `better-sqlite3` and WAL mode (`journal_mode = WAL`). Compose maps the host-relative `./storage/data` directory to `/app/data`; the runtime path is `/app/data/storage.db`. The absolute production checkout/volume path is **operator confirmation required**. The repository includes tracked runtime database and WAL/SHM artifacts; their contents were not inspected. Treat them as sensitive until an operator determines whether they contain real data.

Do not use `cp storage.db backup.db` against a live WAL database. Do not separately copy `.db`, `-wal`, or `-shm` files at arbitrary times. The service package includes `better-sqlite3`; its `Database#backup()` uses SQLite's Online Backup API and emits a standalone SQLite database. See [better-sqlite3 Database#backup](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#backupdestination-options---promise) and [SQLite Online Backup API](https://www.sqlite.org/backup.html).

Recommended procedure after confirming the deployment checkout and a backup staging destination:

1. Announce a maintenance window; prevent new upload/copy/move/trash/restore/delete mutations and drain in-flight `storage_operations` so the SQLite metadata and Garage content can represent one recovery point.
2. Use the installed Storage API package's `better-sqlite3` `db.backup(destination)` against `/app/data/storage.db` to create a standalone `.sqlite` artifact. A vetted operator script/one-off container command must preserve errors and await completion; do not copy the live database file. Put the temporary result in a staging location with enough space, then encrypt and copy it off-device.
3. Record the source revision and migration ledger (`storage_schema_migrations`) without exporting credentials into the manifest. Verify a copy with SQLite `PRAGMA integrity_check` and expected table/schema/row-count checks in an isolated copy.
4. Resume writes only after Garage and Storage API snapshots for the same window are complete and checksummed.

Restore only into a new isolated Storage API volume first. Restore the verified standalone SQLite file to the confirmed runtime path, restore the compatible Storage API image/source/config, then test queries and known project/object metadata against the restored Garage. Preserve the old/damaged volume; never replace it in place as the first attempt.

The SQLite snapshot alone is insufficient: provider references must resolve to Garage data. The Storage API and Garage are not one transaction, so the write pause/drain and coordinated recovery point are required. Exact production scripts, actual host path, ability to gate writes, and operation-drain process remain operator-confirmation items; no Storage API script or service was changed in Phase 9.9.

## Garage backup and recovery

Inspected source config pins `dxflrs/garage:v2.1.0`, uses SQLite metadata, `/var/lib/garage/meta`, `/var/lib/garage/data`, and replication factor `1`. Both directories are under the Compose host mount `./data:/var/lib/garage`. The configuration does not set `metadata_auto_snapshot_interval`. Project-to-bucket mapping is in Storage API SQLite; Garage holds bucket/key/object metadata and object blocks. Garage documentation distinguishes metadata and block data and recommends metadata snapshots; a metadata snapshot is not a full object backup. With replication factor 1, the documented peer-resynchronization path cannot restore missing blocks from another Garage node.

For each recovery point, while application writes are paused/drained:

1. Record the exact deployed Garage version and reviewed non-secret configuration. Do not change versions as part of a disaster restore; follow the version-specific upgrade procedure separately.
2. Run Garage's documented metadata snapshot command (`garage meta snapshot`) and preserve the snapshot, node/layout identity files, and the complete data directory. The command creates a consistent metadata DB snapshot; it does not back up object blocks. Current config does not enable recurring snapshots, so manual snapshot scheduling would need to be established by the operator.
3. Capture metadata and object data as one coordinated set. Prefer a tested filesystem/storage snapshot that captures the whole Garage volume at a consistent point after quiescing writes, or stop Garage under an approved maintenance window and make a cold copy. Do not manually copy the live metadata database. A live filesystem snapshot taken during writes may not be consistent; prove the chosen snapshot semantics first.
4. Include source version, layout and snapshot identity in the manifest, checksum artifacts, encrypt them, and copy the set off-device. Account for snapshot temporary disk use and Garage's available capacity.

For disaster recovery, provision an isolated Garage node with a compatible image, reviewed config and fresh/isolated volume; restore the paired metadata+data set and only then start it. Validate Garage status, S3 bucket/project access, and read a known disposable object. Restore Storage API SQLite against the matching project/bucket/object references, then Nexora D1 and its project mapping. Do not point live clients at the recovery node until checks pass and a separate cutover is approved.

Garage's official [recovery guide](https://garagehq.deuxfleurs.fr/documentation/operations/recovering/) describes different procedures for missing blocks, lost node metadata/data, and corrupted metadata; its metadata snapshot guidance is in the [configuration reference](https://garagehq.deuxfleurs.fr/documentation/reference-manual/configuration/). Those procedures assume knowledge of the live cluster and must not be copied blindly to this single-node layout. No exact restore command is prescribed for the combined Nexora/Storage API/Garage set because the production volume, snapshot mechanism and node identity are unconfirmed.

## Configuration and secret recovery inventory

| Category | Purpose | Restore requirement |
| --- | --- | --- |
| Cloudflare account/API or Wrangler authorization | D1 export, new target provisioning, Pages binding/deployment | Operator retrieves from approved account/profile/secret manager; never export credentials with the backup. |
| Nexora server secrets: `STORAGE_API_URL`, `STORAGE_APP_SECRET`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` | Server-to-server Storage API and Cloudflare Access authentication | Reinstall as server-side Pages/Worker secrets in approved environment. Confirm actual binding values/locations with operator. |
| Storage API env: `STORAGE_API_TOKEN`, `STORAGE_ADMIN_TOKEN`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, upload/timeout/legacy flags | API auth, Garage S3 access, defaults/policy | Restore from approved `.env` escrow/secret manager; only variable names/purpose belong in docs. `.env.example` is not a production record. |
| Garage `rpc_secret` and node/layout identity | Inter-node auth and node recovery identity | Secure config escrow and node-specific metadata/layout records are required. A literal `rpc_secret` is present in tracked `garage/garage.toml`; treat it as exposed and operator must confirm whether it was ever used in production, rotate via a separately planned Garage change, and remove the value from tracked history/config. No value is repeated here. |
| Cloudflare Tunnel token and Access policy/service credentials | Tunnel connectivity and protected service ingress | Restore only from operator-managed secret storage and verify current policy. Their live configuration is outside the Nexora checkout. |
| D1 user/session/public-share data | Account/password hashes, session hashes, share token hashes | Included in D1 data export; protect as sensitive. Public link plaintext secrets are intentionally not recoverable; owners must explicitly replace links after restore/refresh if the secret is lost. |

The adjacent IssueDesk checkout tracks the Storage API runtime SQLite DB and its WAL/SHM files under the directory mounted by Compose. Their contents were not opened or copied. Treat these tracked artifacts as potentially sensitive (app credential hashes, bucket/project mappings, object names/references); operator must establish whether they contain production data, remove runtime DB artifacts from source control, and handle any repository-history cleanup under that repository's own approval/change process. Do not assume the `.env` or `garage.toml` committed value matches the live deployment; do treat committed secret material as exposed.

## Restore ordering and validation checklist

Recovery order for a full consistent restore:

1. Preserve damaged disks/volumes and evidence; identify scope, last known good point, and the source revision.
2. Provision isolated infrastructure and restore reviewed non-secret config plus secrets through the approved secret manager. Confirm Garage version and exact volume paths.
3. Restore Garage metadata and object data together; validate Garage before exposing Storage API.
4. Restore Storage API SQLite metadata; verify it maps the restored Garage project/bucket/object references.
5. Restore Nexora D1 schema and data, verifying `storage_mounts.shared_storage_project_id` resolves to the recovered Storage API project. Build/deploy the matching Nexora source and bindings only after validation.
6. Validate end-to-end in isolation, create only disposable test objects, record results, then make a separate operator cutover decision. Preserve the previous target until cutover is proven.

Disaster checklist:

- [ ] Declare incident and pause affected writes if needed.
- [ ] Identify whether the failure is D1, Storage API SQLite, Garage metadata, Garage blocks, config/secret, or multiple components.
- [ ] Preserve damaged state before modifying anything.
- [ ] Select a complete, timestamp-matched, checksummed set; verify checksums and manifest.
- [ ] Restore first into disposable/isolated infrastructure.
- [ ] Restore dependencies in the order above; compare counts/schema/mappings.
- [ ] Validate Garage health, expected bucket/project and a known disposable object.
- [ ] Validate Storage API health, capabilities, listing, logical object resolution, and safe normalized errors.
- [ ] Validate Nexora login, mount/root listing, nested folder, preview, download, disposable upload/rename/move, Trash/Restore, Favorites, Recent, Activity and Public Share create/read/revoke with disposable data.
- [ ] Verify no provider references/credentials appear in browser responses or logs; verify public links fail after revocation.
- [ ] Decide cutover separately; monitor and retain the pre-cutover set.

A backup is not proven until this isolated restore checklist has passed. Never use irreplaceable objects for destructive tests.

## Recovery objectives and unresolved operator decisions

- **RPO — operator decision required** (acceptable data loss).
- **RTO — operator decision required** (acceptable time to service recovery).
- Confirm current D1 plan and Time Travel retention, export impact, backup schedule/destination/encryption, actual QNAP host paths, firewall/tunnel/Access policy, whether tracked Storage DB artifacts or Garage secret were used in production, Garage layout/node identity, and a consistent snapshot/restore drill.
- Recommended retention target is 7 daily / 4 weekly / 3 monthly; no automated jobs are implemented.
- Never run a production export, backup, restore, service stop, secret rotation, migration, or cutover based solely on this documentation.
