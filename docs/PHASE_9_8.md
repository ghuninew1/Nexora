# Phase 9.8 — Activity & Audit Log

## Scope and implementation

Phase 9.8 adds a Nexora-owned, authenticated activity history for successful file and sharing mutations. It remains separate from Recent access history and does not log page views, public-link use, downloads/previews, failed mutations, IP/device data, or provider activity. No IssueDesk, Shared Storage, Garage, Docker, or Cloudflare configuration was changed.

`migrations/0003_activity_events.sql` creates `activity_events`, indexed by `(user_id, created_at DESC, id DESC)`. It stores the server-generated event ID, authenticated owner, optional mount/name snapshot, stable action, logical object snapshot, source/destination parent IDs, bounded allowlisted metadata, and timestamp. The schema has no provider references, public capability secrets, or credentials.

`functions/_lib/activity.js` is the centralized best-effort writer and authenticated list handler. It accepts the 13 stable actions: `upload`, `create_folder`, `rename`, `move`, `copy`, `trash`, `restore`, `delete_permanent`, `favorite`, `unfavorite`, `share_create`, `share_replace`, and `share_revoke`. Metadata is action-specific and allowlisted; names/IDs are bounded and control characters normalized. Share events store only the logical share ID. Failed event writes emit a safe action/stage diagnostic and do not turn a successful primary mutation into an API failure.

Storage and share routes record events only after successful mutation responses. D1 Favorites are logged only when a row is actually added/removed. Bulk Move/Trash continue to call the existing per-object routes, so each successful object receives one event and failed objects receive none; there is no batch event. No extra provider stat/list requests were added. Where available, previous event snapshots supply old names or destination folder names; older objects without a snapshot may have less descriptive labels. Permanent delete still records its logical object ID and uses an available prior snapshot.

Retention runs after insertion, deleting rows older than 180 days and retaining at most the newest 500 rows per user. Retention failure is also best effort. `GET /api/activity` derives ownership from the authenticated session, returns newest first, defaults to 50 and caps at 100, with an opaque stable `(created_at,id)` cursor.

The protected `/activity` page has loading, empty, error, refresh, and Load more states, a centralized safe action formatter, and no polling. The optional Dashboard latest-five panel was skipped to keep Phase 9.8 focused.

## Validation and limits

- `pnpm lint`: passed.
- `pnpm test`: passed, 125/125 tests, including writer sanitization/retention, API ownership/pagination, storage mutation integration, share lifecycle, and frontend client/formatter behavior.
- `pnpm build`: passed with the standard `vite build` command.
- `git diff --check`: passed.
- Browser QA: not run; no authenticated local mock app session was available in this work session.
- Production migration, deployment, D1 data, and provider behavior: not changed or verified. Apply `0003_activity_events.sql` only as a separately approved production rollout step.

Activity is best-effort secondary persistence: if D1 cannot accept an event, the successful file/share operation remains successful and the missing history record is not backfilled automatically. Names/destination labels for pre-Phase-9.8 objects may be incomplete when no prior event snapshot exists.
