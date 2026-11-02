# Storage assignment Phase 1.5

`0008_storage_access.sql` introduces an additive membership table with 13 explicit boolean permissions, a unique user/mount key, foreign keys and basic dependency checks. `functions/_lib/storage-permissions.js` validates a complete allowlisted boolean payload and rejects inconsistent combinations. Neither is wired into the request router or browser. Existing mounts remain owner-scoped, including public-share, Favorites and Recent hydration.

The standalone permission module now also includes a fail-closed storage-route permission map and a preliminary provider/read-only/maintenance intersection, with unit tests. These helpers are not used in request handling or capability responses; share ownership and per-object capability checks still need to be integrated before enabling assignments.

Before enabling assignments, implement and test admin assignment/revocation and UI, route-by-route authorization and effective provider/maintenance/read-only capability intersection, owner compatibility, safe cache invalidation and default-storage fallback. Public links created by an assignee must follow an explicit non-destructive revocation policy without implicitly requiring continued membership. Do not treat this table as an active permission system.

The user reported migrations 0008 and 0009 applied; this was not independently verified. `0009_storage_access_defaults.sql` adds a single-default constraint and backfills full grants for existing mount owners, preserving pre-existing assignment rows. It does not activate assignment authorization. Existing user-selected defaults remain in `user_preferences` and are not modified.

`functions/_lib/storage-access.js` now provides an assignment lookup and a preliminary provider/policy permission gate, tested in isolation. It is not wired into request handling. Completing the change still requires the assignment API and UI, migration of every route and metadata hydration path, default selection, immediate revocation behavior and end-to-end authorization tests. In particular, public shares need a separately reviewed mount lookup that keeps previously issued links usable after assignment revocation; an owner must retain a safe revoke-only cleanup path. No deployment or production data change was performed in this work.


## Earlier runtime wiring checkpoint

Admin POST/PATCH/DELETE and GET assignment routes at `/api/admin/users/:userId/storages[/storageId]` now persist assignment records. Discovery uses assignments and returns effective permissions. Object listing requires assignment read permission. An API integration test covers assignment, member discovery/listing and revocation. Other routes retain owner authorization; this is not a completed assignment system.

| Feature | Status |
| --- | --- |
| Admin assign API | PARTIAL (dependency normalization pending) |
| Admin storage catalog | COMPLETE |
| Admin assign UI | PARTIAL (implementation added; browser flow not verified) |
| Discovery | COMPLETE |
| Core Storage v1 route authorization | COMPLETE |
| Default storage | PARTIAL (assignment uniqueness and revoke cleanup only) |
| Favorites | PARTIAL |
| Recent | PARTIAL |
| Public Share | PARTIAL |
| Browser QA | NOT RUN |
| Production | NOT VERIFIED |

Admin storage catalog is now implemented at `GET /api/admin/storages`: authenticated admins receive at most 500 safe storage summaries with a truncation flag. Provider identifiers and credentials are omitted. Capability retrieval remains in the existing storage access path. Assignment UI and remaining route integration are still pending.

Default preference writes validate an active readable assignment. Discovery parsing retains effective permissions and `isDefault`; selection prioritizes explicit route, user preference, admin initial default, then first active assigned storage. UI permission gating and all other integration work remain pending.


## Current core storage authorization

Every user-facing route below resolves the session user's assignment before accessing the mapped provider project. This also applies to admin accounts. Previously only discovery and object listing used assignments. Maintenance rejects normal-user mutations and mount/provider read-only restricts writes for all roles. Read routes remain subject to their effective grants. Capabilities returns the narrowed existing flags and an effective permissions object for app-level preview and share.

| Route under a storage | Assignment | Provider requirement |
| --- | --- | --- |
| Detail, usage | Membership | No object call |
| Capabilities | Membership | Capabilities |
| List, stat, operation status | read | list and stat |
| Preview | read, preview | read and download |
| Both download routes | read, download | read and download |
| Upload, create folder, rename, move | Corresponding grant | Corresponding capability |
| Copy | read and copy | read and copy |
| Move to Trash | delete | trash |
| Trash list | read and delete | read and trash |
| Restore | delete | trash and restore |
| Permanent delete | permanentDelete (depends on delete) | trash and permanentDelete |

The core route migration supersedes earlier partial-route checkpoints. Favorites, Recent, Public Share and UI integration remain separate work.

Files and Dashboard/Storage explain an empty assignment list. Default selection tests cover route, user preference, admin default and revoked default fallback. Admin assignment UI and complete permission gating remain partial. Browser QA has not been run.

Admin Users now provides assignment list, catalog, preset/custom editing, default selection and revoke confirmation using the existing admin APIs. Dependency controls enforce read/preview/download/favorite, delete/permanentDelete and share/manageShare relationships. The catalog reports when its 500-item limit truncates results. Browser flow and narrow-screen QA remain unverified. User action gating, Favorites, Recent and Public Share integration remain pending.
