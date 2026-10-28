# Nexora v1 — Feature Complete

## Status

**Nexora v1 — Feature Complete** describes the current product scope and local source baseline. The repository package version is already `1.0.0`; no versioning mechanism, Git tag, commit, or release was added by this finalization. Production rollout and live-service verification are separate operator work.

## Completed capabilities

- **Authentication and workspace:** PBKDF2-HMAC-SHA-256 password hashes, hashed 14-day Secure/HttpOnly/SameSite=Lax sessions, protected workspace routes, logout, owner-scoped data, and local/explicit remote admin provisioning commands. There is no self-service public registration route; accounts are provisioned by an administrator.
- **Connected File Browser:** owner storage mounts, logical-ID root/folder listing, cursors and breadcrumbs, metadata-only session cache with stale revalidation, create folder, upload/download, rename/move/copy, Trash/restore/permanent delete, and safe on-demand image/PDF/text preview.
- **Organization and reliability:** D1 Favorites and bounded Recent; multi-select Bulk Move/Move to Trash with concurrency 2 and partial-success handling; upload retry/cancel with concurrency 2 and indeterminate progress; targeted cache invalidation.
- **Sharing:** owner-managed public file/folder links, replace/revoke, subtree authorization, anonymous view/download only, hash-only share secrets and independent public routes. No public write or account-to-account sharing.
- **Dashboard, Storage, Activity:** authenticated mount/capability state, authoritative usage only (otherwise “Not reported”), Recent dashboard data, and a separate owner-scoped Activity page/API for successful supported mutations with cursor pagination and bounded retention.
- **Recovery baseline:** source-derived operator runbook for Nexora D1, Storage API SQLite, Garage metadata and object blocks, configuration/secrets, checksums, retention, restore order and validation.

## Validation

- `pnpm lint`: passed in this finalization.
- `pnpm test`: passed, 125/125.
- `pnpm build`: passed with the standard Vite build.
- `git diff --check`: passed.
- Repository artifact review: Nexora working tree was clean at start. No tracked runtime DB, SQLite, `.env`, backup, or log artifact was found in Nexora. In adjacent IssueDesk, Storage API DB/WAL/SHM artifacts are no longer tracked and are ignored by its current `.gitignore`; no database contents were read. The operator `garage.toml` was removed from that repository index while preserving the local ignored file. Its tracked example template was changed to a placeholder-only RPC secret; a non-disclosing check verified the placeholder and generator instruction. These IssueDesk changes are staged/uncommitted and were not committed or pushed. No backup artifacts exist in this checkout.
- Browser QA was not run in this finalization. Prior per-phase browser results and limits remain in their historical reports.

## Production status

**Implemented in source** does not mean **deployed**. User-reported production smoke tests cover Phase 9.2/9.3 storage operations, but this finalization did not access production. Phase 9.6 public shares, Phase 9.8 Activity/migration, backup procedures, and later local changes have not been production-migrated/deployed/verified here. No D1 migration/export/restore, QNAP/Docker operation, secret operation, deploy, or production data change was performed.

Security primitives verified in source include secure session cookie attributes, shared PBKDF2 password hashing, same-origin checks on mutations, owner/mount/object and read-only/capability authorization, server-only upstream credentials, normalized API errors, a 25 MiB server upload cap, public-link secret hashing, restrictive public-share headers, and value-free diagnostics. This is a bounded source review, not a penetration test or platform configuration audit.

## Known limitations and operator actions

- **Garage secret history remains a follow-up:** `garage/garage.toml` is now untracked and ignored in the adjacent IssueDesk working tree; the local operator file remains on disk and was not read. `garage.toml.example` now contains only an explicit placeholder plus the generation instruction, checked without printing any secret. Prior Phase 9.9 review found secret material in tracked history. Treat it as exposed; production use remains unknown. Operator must confirm whether it matches production and rotate only through a separate planned Garage change if needed. Git history was not rewritten, so older history may still contain the prior value.
- **Database artifact cleanup:** runtime Storage API SQLite/WAL/SHM files are no longer tracked in the adjacent IssueDesk checkout; current ignore patterns cover them. The local files may remain. Their historic contents and production use were not inspected; operator confirmation/history-cleanup decision remains.
- Current inspected Garage configuration uses replication factor 1; there is no peer replica for rebuilding missing blocks.
- Backup/recovery design is documented; automated backup is not implemented, no destination/schedule is configured, and no isolated restore drill has been completed. Production restore was not performed.
- RPO/RTO, production backup destination/retention, actual server paths, service port/firewall/Tunnel/Access policy, public-share and mutation rate limiting, global CSP/security headers, and runtime access-log redaction require operator decisions/verification.
- Usage remains unavailable without an authoritative provider aggregate. Search applies only to loaded File Browser items. Upload cancellation does not guarantee upstream rollback; there is no resumable/chunked upload. Share secrets are not recoverable after the create/replace response is lost; users must explicitly replace the link.

## Deferred roadmap

**Later — high value:** Global Search after a reviewed backend indexing/search contract; backup automation after production paths, destination, and consistency windows are chosen; an isolated restore drill using real backup artifacts.

**Later — optional:** public-link expiry/passwords, private user sharing, more bulk operations, file version history, WebDAV/SMB, resumable uploads, authoritative advanced metrics, higher-durability multi-node Garage.

Do not treat deferred work as part of v1 or start Phase 10 without a new request.
