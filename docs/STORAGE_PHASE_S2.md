# Shared Storage — Phase S2

Local implementation completed 2026-10-27. Source is in `garage/storage/`. No production migration, deployment, secret change, SMB work, or Nexora backend was performed.

## Object and folder model

Additive migration `migrations/0001_file_manager.sql` adds `storage_objects`, `storage_operations`, `storage_name_reservations`, and indexes. `object_id` is the stable File Manager ID. `project_id` and optional `parent_id` scope hierarchy; null parent means project root. `type` is `file` or `folder`. `provider_reference` is nullable only for folders and remains internal. Garage receives object references only after scoped SQLite lookup. The migration backfills current `files.id` unchanged as `object_id`, `files.object_key` as its internal provider reference, and legacy files at root. It does not move bytes or alter the legacy files table.

New File Manager uploads/copies also mirror file metadata into `files`, so v2 list/download can continue to serve non-trashed files. Rename synchronizes `files.original_name`. V2 permanent delete still deletes provider bytes then metadata. V2 list/download omit objects that have been moved to File Manager Trash. Existing endpoint paths, methods, auth, and response shapes remain; S1 regression suite verifies list/upload/download/delete.

## Names and operations

New names are trimmed and NFC-normalized for display. The duplicate key uses JavaScript Unicode lowercase, scoped by project and parent. Names reject empty/dot segments, slash/backslash, controls, trailing dots, Windows device names and UTF-8 encodings over 255 bytes. Legacy file display names are preserved as-is for compatibility; collision checks normalize valid legacy names and assign an internal sentinel to invalid historical names. SQLite immediate transactions plus expiring name reservations serialize new uploads/copies and metadata changes.

Folder creation is metadata-only; it does not create zero-byte Garage objects. Rename and move update logical metadata in one SQLite transaction and preserve IDs, provider refs, and descendants. Move checks the complete bounded active subtree to prevent cycles. File copy streams the source from Garage to a new UUID reference, checks size and SHA-256 by reading the new object back, then inserts a new metadata tree with new IDs. Folder copy is breadth-first and synchronous only up to 100 objects. Larger trees return `OPERATION_TOO_LARGE`; no fake asynchronous job is returned.

DELETE `/v3/projects/:projectId/objects/:objectId` moves an object/subtree into Trash with stable IDs, original parents and deletion time. Already-trashed descendants are folded into the parent trash entry. Active object list/stat/download and v2 list/download hide trashed objects. Restore clears Trash for the tree in one transaction, uses the saved parent when active, accepts an explicit active fallback parent and rejects active-name conflicts. Permanent delete is a separate Trash route, removes file bytes before metadata, and retains metadata if any provider delete fails. Repeated deletes are safe; missing provider objects count as already deleted. SQLite finalization failure leaves a `partial` operation with metadata pending.

`storage_operations` stores opaque operation IDs, project/type/status, source and target, timestamps, counts, stable error code and private reconciliation details. Upload/copy records planned provider references before writes; permanent delete records completed/retry refs as it proceeds. Public operation responses never return details/provider references. `GET /v3/projects/:projectId/operations/:operationId` is project-scoped. There is no worker; pending/partial records and `pnpm backfill:legacy` support operator diagnosis/recovery. Name reservations expire after 15 minutes. Full automatic orphan cleanup/reconciliation is future work.

## Internal API and actual capabilities

All `/v3/projects/:projectId/*` routes use the existing app Bearer credential middleware plus project ownership checks and are for service-to-service callers behind the deployment's existing Cloudflare Access boundary. Responses use `Cache-Control: no-store`. Routes added:

- `GET /v3/projects/:projectId/capabilities`
- `GET /v3/projects/:projectId/objects?parentId=&cursor=&limit=` and `GET .../objects/:objectId`
- `GET .../objects/:objectId/download`
- `POST .../objects/folders`, `POST .../files`
- `PATCH .../objects/:objectId`, `POST .../objects/:objectId/move`, `POST .../objects/:objectId/copy`
- `DELETE .../objects/:objectId` (Trash)
- `GET .../trash`, `POST .../trash/:objectId/restore`, `DELETE .../trash/:objectId/permanent`
- `GET .../operations/:operationId`

Cursor is base64url-encoded normalized-name/object-ID ordering state, is not an authorization token, and never contains a provider reference. Limit defaults to 50 and caps at 100. Scope is rechecked on every route; foreign objects/parents return the same 404 as missing ones.

Garage/provider actual support: list/stat/upload/download/copy/permanent delete are true. The File Manager metadata layer supplies createFolder/rename/move/Trash/restore; those are reported true at the File Manager capability endpoint. Preview/share/rangeRead/readOnly remain false. Capabilities represent feature support, not authorization. Registry remains Garage-only.

## Migration and rollback

`pnpm migrate` applies numbered SQL migrations to `DATABASE_PATH` (default `garage/storage/data/storage.db` relative to service working directory). It was **not run** against the runtime database. Startup fails fast unless migration 0001 is recorded, so an operator must back up and apply it before starting this code. `pnpm backfill:legacy` idempotently indexes any files created by a prior v2-only binary after the initial migration.

The schema is additive and does not rewrite the existing `files` table or object bytes. No destructive down migration is provided. To roll back the binary, stop writes and keep all new tables; S1 can still read the legacy files table, but will not honor S2 folder/Trash state or new upload name reservations. Backfill v2-only writes before restarting S2. Do not drop S2 tables once any folder, Trash entry, operation or S2-created object exists; export/reconcile those records before considering schema removal.

## Validation

- Before implementation, the existing S1 `pnpm test` passed 12/12.
- After implementation, `pnpm test` in the actual Shared Storage checkout passed **27/27** (0 failed, 0 skipped). The suite uses `DATABASE_PATH=:memory:` and fake S3; the loopback test verifies real Node HTTP disconnect cancellation. Coverage includes S1 v2 behavior, legacy-root migration/backfill, folder/nested listing, duplicate/invalid names, file/folder rename and move, cycle checks, file/folder copy with byte verification, stable/new IDs, Trash/hidden objects/restore conflict and fallback, permanent-delete partial/retry, SQLite/provider failures, reservations, capabilities, authorization/scope, bounded operations and pagination.
- IssueDesk `pnpm lint` passed. `git diff --check` passed. No production database was opened by the test suite.
- Garage, production Cloudflare Access, deployment, real service environment and Node 22 Docker runtime remain unverified. The migration was not applied.

## Next work

S2 is complete locally; stop for review. Before any rollout, review the migration/backfill and rollback plan, take a database backup, then apply the additive migration separately before deploying the service binary. No deployment is included here. Recommended next review: Phase S3 upload streaming/resumable design; Nexora Phase 8 remains separate and still needs its own approval. No SMB dependencies or Nexora `/api/storage/v1/*` routes were added.
