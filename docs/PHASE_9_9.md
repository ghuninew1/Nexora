# Phase 9.9 — Backup, Recovery & Production Hardening

Updated: 2026-10-28

## Audit scope and data architecture

Read Nexora repo instructions/status, migrations `0001`–`0003`, Wrangler config, auth/storage/share/activity APIs, relevant phase reports and Storage Architecture/API audits. Read the adjacent IssueDesk repository's Compose, Garage config, Storage API SQLite initializer/migrations/provider wiring and env example without modifying that checkout. Did not open SQLite database contents, `.env`, or copy data. No QNAP, Docker, remote Cloudflare, D1 or Storage commands were executed.

Nexora D1 is authoritative for user accounts/password hashes, sessions, owner-scoped storage mounts and Shared Storage project IDs, login throttling, Favorites, Recent, public-share token hashes/revocation, and Activity. Current migration chain is `0001_backend_foundation.sql`, `0002_public_shares.sql`, `0003_activity_events.sql`. Migrations are configuration/recovery inputs, not a data backup.

Storage API SQLite is authoritative for app/credential-hash/project/bucket mapping, legacy file records, logical file/folder rows and Garage provider references, operations, Trash state and name reservations. Garage metadata stores bucket/key/object/block mapping and node/layout state; Garage data stores object blocks. Garage config evidence is image `dxflrs/garage:v2.1.0`, SQLite metadata engine, metadata/data directories under `/var/lib/garage`, and `replication_factor = 1`. Compose maps one host data directory to those paths, which means the inspected config is single-node with no second Garage replica. Actual production paths/layout must be verified by the operator.

## Backup design and recovery

Created [BACKUP_RECOVERY.md](BACKUP_RECOVERY.md) with data classifications, component dependencies, D1 SQL export and local isolated import guidance, Storage API SQLite Online Backup API procedure (not raw `.db` copy), paired Garage metadata+object-data snapshot requirements, retention/naming/manifest/SHA-256, config/secret inventory, restore ordering, validation checklist, 3-2-1 target and RPO/RTO operator decisions. Cloudflare export uses the installed Wrangler v4.154.0 documented syntax, but no remote export was run. Garage exact full-volume restore is intentionally not prescribed until the operator confirms actual host paths and snapshot semantics.

Recommended retention: 7 daily, 4 weekly, 3 monthly; no scheduler, script, backup destination, or restore automation was added. Full backup copies should include both Garage metadata and data at a coordinated recovery point. D1 Time Travel is supplemental and destructive in-place recovery, not an off-device backup. All restore testing starts in a disposable environment.

## Production hardening findings

**HIGH — tracked Garage RPC secret in adjacent IssueDesk checkout.** `garage/garage.toml` is tracked and contains a literal RPC secret. Its production use is unknown; treat it as exposed, do not repeat the value, and have the owner confirm use/rotate it through a separately planned Garage change and clean the tracked config/history. Not modified because this phase prohibits Garage changes and the checkout is outside the writable Nexora scope.

**HIGH — tracked Storage API runtime database artifacts in adjacent IssueDesk checkout.** The Compose bind mount points to `garage/storage/data`, and its runtime SQLite database plus WAL/SHM artifacts are tracked. Contents were not inspected. They may contain app credential hashes, project/bucket mapping and file/object metadata. Operator must establish whether any real data is present, remove runtime artifacts from source control, and handle history cleanup under that repo's change process. Not modified because Phase 9.9 forbids Shared Storage/Docker changes and production data handling.

**MEDIUM — single-node Garage durability.** Checked-in config sets replication factor 1. This gives no peer copy/rebuild path; off-device, paired metadata+object-data backups and tested restore are essential. Operator decides whether to change topology in a separate architecture project.

**MEDIUM — API rate controls are incomplete.** Login has bounded D1 throttling (8 failures per email or IP hash in a 15-minute window; capped/cleaned records). No Nexora route-level rate limiter was found for unauthenticated public-share reads or authenticated high-cost storage mutations. No distributed limiter was added; inspect/configure platform edge controls with the operator.

**MEDIUM — adjacent Compose publishes Garage S3 and Storage API ports on host interfaces.** Both still require application credentials, but direct exposure could bypass the intended Tunnel/Access path. Verify firewall/router policy with the operator.

**MEDIUM — global response headers are limited.** `public/_headers` sets no-referrer, no-store and nosniff only for `/s/*`; API JSON uses no-store, and public API/stream paths apply restrictive headers. A general app-wide CSP/frame/permissions policy is not configured in repository source. CSP needs rendered compatibility review, so no blanket policy was added. Confirm HTTPS/HSTS and edge headers at deployment separately.

Reviewed Nexora cookie security (Secure/HttpOnly/SameSite=Lax, 14-day session), PBKDF2-HMAC-SHA-256 password hashes, same-origin mutation checks, server-only storage credentials, normalized API errors, upload hard limit of 25 MiB, mount/object ownership and read-only/capability checks, share token hash-only storage, restrictive public headers, and value-free upstream diagnostics. No additional CRITICAL finding was established from Nexora source. Platform access/request logs can still capture public capability paths; Phase 9.6 already records that operators must redact them.

## Validation and production status

> Follow-up recorded in the later Nexora handoff: the adjacent IssueDesk Garage config was removed from its index, the tracked example was replaced with a placeholder, and runtime SQLite/WAL/SHM files were no longer tracked. Those changes were recorded as staged/uncommitted at handoff time; Git history was not rewritten. This does not close the historical secret exposure question or establish whether the value was used in production. The adjacent checkout was not re-verified during Phase 10.1. Do not read or repeat values; see [Phase 10.1](PHASE_10_1.md) for the remaining operator gates.

- Wrangler v4.154.0 and `d1 export` help were checked locally; Wrangler emitted a log-file permission warning in this sandbox, but help/version returned. No network command ran.
- No backup artifact existed, so no checksum or restore test was claimed.
- No scripts or runtime code were changed by Phase 9.9; no tests were added to simulate infrastructure recovery.
- `pnpm lint`: passed.
- `pnpm test`: passed, 125/125.
- `pnpm build`: passed with standard Vite build.
- `git diff --check`: passed.
- Browser QA and actual backup/restore drill: not run; no backup artifacts or isolated recovery environment were available.
- No production data modified; no remote D1 access/export/restore, migration, deployment, QNAP or Docker operation, Garage change, secret rotation, or cutover performed.

The user's existing unstaged edit in `src/pages/ActivityPage.jsx` was preserved unchanged. See [BACKUP_RECOVERY.md](BACKUP_RECOVERY.md) for operator actions and limits.
