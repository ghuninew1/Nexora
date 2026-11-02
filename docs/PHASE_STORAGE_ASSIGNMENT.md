# Storage assignment Phase 1.5 — incomplete groundwork

`0008_storage_access.sql` introduces an additive membership table with 13 explicit boolean permissions, a unique user/mount key, foreign keys and basic dependency checks. `functions/_lib/storage-permissions.js` validates a complete allowlisted boolean payload and rejects inconsistent combinations. Neither is wired into the request router or browser. Existing mounts remain owner-scoped, including public-share, Favorites and Recent hydration.

The standalone permission module now also includes a fail-closed storage-route permission map and a preliminary provider/read-only/maintenance intersection, with unit tests. These helpers are not used in request handling or capability responses; share ownership and per-object capability checks still need to be integrated before enabling assignments.

Before enabling assignments, implement and test admin assignment/revocation and UI, route-by-route authorization and effective provider/maintenance/read-only capability intersection, owner compatibility, safe cache invalidation and default-storage fallback. Public links created by an assignee must follow an explicit non-destructive revocation policy without implicitly requiring continued membership. Do not treat this table as an active permission system.

The user reported migrations 0008 and 0009 applied; this was not independently verified. `0009_storage_access_defaults.sql` adds a single-default constraint and backfills full grants for existing mount owners, preserving pre-existing assignment rows. It does not activate assignment authorization. Existing user-selected defaults remain in `user_preferences` and are not modified.

`functions/_lib/storage-access.js` now provides an assignment lookup and a preliminary provider/policy permission gate, tested in isolation. It is not wired into request handling. Completing the change still requires the assignment API and UI, migration of every route and metadata hydration path, default selection, immediate revocation behavior and end-to-end authorization tests. In particular, public shares need a separately reviewed mount lookup that keeps previously issued links usable after assignment revocation; an owner must retain a safe revoke-only cleanup path. No deployment or production data change was performed in this work.


## Runtime wiring checkpoint

Admin POST/PATCH/DELETE and GET assignment routes at `/api/admin/users/:userId/storages[/storageId]` now persist assignment records. Discovery uses assignments and returns effective permissions. Object listing requires assignment read permission. An API integration test covers assignment, member discovery/listing and revocation. Other routes retain owner authorization; this is not a completed assignment system.

| Feature | Status |
| --- | --- |
| Admin assign API | PARTIAL (storage catalog and dependency normalization pending) |
| Admin assign UI | PARTIAL (not implemented) |
| Discovery | COMPLETE |
| Route authorization | PARTIAL (object list only) |
| Default storage | PARTIAL (assignment uniqueness and revoke cleanup only) |
| Favorites | PARTIAL |
| Recent | PARTIAL |
| Public Share | PARTIAL |
| Browser QA | NOT RUN |
| Production | NOT VERIFIED |
