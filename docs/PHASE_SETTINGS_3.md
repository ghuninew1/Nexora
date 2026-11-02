# Settings phases 1–3: source audit and work in progress

## Current Phase 2 partial implementation

Admin can enable/disable new public-share creation and public downloads, require expiration, and set a maximum link lifetime. Server checks policy on creation, replacement and public downloads, while existing links and supported previews remain available. Preview content is delivered to the browser and cannot be made unsaveable. Maintenance controls remain in place. Remaining Phase 2 policies and Phase 3 notifications/audit are not implemented; the older audit below remains historical.

Local checks: lint, build, diff check and 148 tests passed. Browser/device and live-provider QA were not performed. No new migration or production operation was performed.

## Current Phase 1 implementation

All rows below are stored in D1, loaded by the shared preference provider, exposed in Settings, consumed by the indicated behavior, server validated and have a fallback. These are source-level findings; browser/device and production verification remain pending.

| Preference | Behavior and fallback |
| --- | --- |
| theme | Existing theme system follows saved account value; dark while loading/unavailable. System follows browser media preference. |
| fileSort / fileSortDirection | File Browser initial sort; name/ascending fallback, temporary choices remain local. |
| confirmDelete | Controls confirmation for a single normal Trash action; true fallback, bulk/permanent deletion still confirm. |
| uploadConflictBehavior | `ask` reports the provider conflict; rename/replace are unavailable, disabled and rejected. Old unsupported values resolve to ask. |
| uploadConcurrency | Queue concurrency 1/2/3/5; 3 fallback. |
| autoClearUploads | Successful uploads clear after delay when enabled; true fallback; failed/cancelled remain. |
| defaultStorageId | Accessible route storage, then saved active mount, then first active mount. Null fallback. |
| shareExpiration | Initial share-dialog choice; 7 days when loaded, existing fallback while unavailable. |

Account provides password change and logout-other-sessions. Password change verifies the current password and retains the current session while revoking others. Phase 2 remains partial, Phase 3 has not started. Automatic duplicate rename/replace are deferred until the provider offers safe semantics. No new migration or environment variable was added in this Phase 1 work.

Local checks: `pnpm lint`, `pnpm test` (146/146), `pnpm build`, and `git diff --check` passed. Browser QA, production deployment and remote migration were not performed. Existing migrations 0006 and 0007 remain subject to operator verification and separately authorized rollout.

Source audit at start of this work (3 November 2026); production state is not inferred.

## Phase 1

- Implemented: authenticated preference GET/PATCH with defaults, validation and owned active mount validation; logout-other-sessions endpoint preserves the current session. Existing account display-name edit is separate.
- Partially implemented: preferences for theme, sort/direction, normal-delete confirmation, upload concurrency/auto-clear/conflicts, default storage and share expiration exist in D1/API only. Theme still uses local browser storage; queue uses concurrency 2 and clears successful uploads. Share API supports 1 hour, 1 day, 30 days and never, not the preference's 7 days. Storage selects the first active mount.
- Not implemented: preference UI/integration, password change and logout-other-sessions UI. Duplicate conflicts produce an upload error; no safe automatic rename or replace flow exists.
- Deferred intentionally: replacing an existing upload without an authoritative safe overwrite contract; no data-loss workaround.

## Phase 2

- Implemented: admin-authenticated maintenance settings and public maintenance config; storage and owner-share mutations are server-gated, admins retain normal mount authorization, existing public reads remain available.
- Partially implemented: maintenance leaves Favorites writable. Admin user management is separate from system policies. Existing environment upload ceiling is bounded by the 25 MiB server limit; this is not an admin-editable policy.
- Not implemented: application branding/default theme, configurable upload and extension policies, sharing restrictions/defaults, session lifetime/session count settings, password policy settings and other admin settings. No public registration route exists.
- Deferred intentionally: quota/usage warning without authoritative metrics; registration setting without registration; no evidence of mail provider or Resend configuration in current source.

## Phase 3

Not implemented at audit time: persistent notifications, user/admin notification preferences, email delivery, separate audit log, retention controls or audit UI. Existing Activity is bounded user-facing mutation history, not security/admin audit. Login attempts are bounded separately for throttling. No production migration, deployment, secret or storage changes are authorized by this task.

## Follow-up in this working tree

Account now exposes the existing logout-other-sessions endpoint with confirmation. Maintenance also gates normal-user Favorites writes. Settings saves upload concurrency and auto-clear through the existing preference API, and the real upload queue consumes these values; until preferences load it uses the previous limit of two and auto-clear behavior. Automatic rename/replace remains unavailable. The audit above is the pre-change baseline; all other Phase 1/2 and Phase 3 gaps listed there remain open. No Phase 3 migration or new email integration has been added.

Settings also saves default sort/direction, single-item Trash confirmation and share expiration; the File Browser and share dialog consume these values. Bulk and permanent deletion continue to require confirmation. Theme, default storage and password change remain incomplete. Phase 2 and Phase 3 remain incomplete.
