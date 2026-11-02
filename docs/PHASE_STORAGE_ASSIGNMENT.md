# Storage assignment Phase 1.5 — incomplete groundwork

`0008_storage_access.sql` introduces an additive membership table with 13 explicit boolean permissions, a unique user/mount key, foreign keys and basic dependency checks. `functions/_lib/storage-permissions.js` validates a complete allowlisted boolean payload and rejects inconsistent combinations. Neither is wired into the request router or browser. Existing mounts remain owner-scoped, including public-share, Favorites and Recent hydration.

The standalone permission module now also includes a fail-closed storage-route permission map and a preliminary provider/read-only/maintenance intersection, with unit tests. These helpers are not used in request handling or capability responses; share ownership and per-object capability checks still need to be integrated before enabling assignments.

Before enabling assignments, implement and test admin assignment/revocation and UI, route-by-route authorization and effective provider/maintenance/read-only capability intersection, owner compatibility, safe cache invalidation and default-storage fallback. Public links created by an assignee must follow an explicit non-destructive revocation policy without implicitly requiring continued membership. Do not treat this table as an active permission system.

Migration 0008 is prepared but has not been applied locally or remotely. Existing migration 0007 was reported ready by the user and was not independently verified. No deployment or production data change was performed.
