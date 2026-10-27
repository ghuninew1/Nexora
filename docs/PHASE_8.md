# Nexora — Phase 8

สถานะ: implementation และ local validation เสร็จ 2026-10-27. ยังไม่มี production D1, production secret, Shared Storage mount, user provisioning หรือ deployment. `FilesProvider` และหน้า frontend ยังใช้ demo state ตามขอบเขต Phase 8.

## Architecture

```text
Nexora browser
  ├── existing React demo state (unchanged)
  └── future same-origin requests: /api/auth/*, /api/storage/v1/*
                     │
                     ▼
Cloudflare Pages Functions (`functions/api/[[path]].js`)
  ├── session and Origin checks
  ├── owner-scoped mount resolution from D1 binding `DB`
  └── server-only Shared Storage client
                     │ Access service identity + app Bearer credential
                     ▼
Shared Storage internal `/v3` → Garage provider
```

The browser supplies a Nexora `storageId` and logical `objectId`. The function loads `shared_storage_project_id` from the authenticated user's mount and sends it server-to-server. Nexora responses omit the project ID, bucket, Garage key, provider reference, host, and credentials. Admin role does not bypass mount ownership.

## Files added or changed

- `functions/api/[[path]].js`, `functions/_lib/`: file-routed Pages API, authentication, password/session helpers, authorization, response normalization, and Shared Storage `/v3` client.
- `migrations/0001_backend_foundation.sql`: independent Nexora schema.
- `scripts/create-admin.mjs`: explicit first-admin provisioning command; hard-coded to Wrangler `--local`.
- `tests/backend.test.js`: Node test suite with in-memory SQLite and mocked upstream Fetch.
- `wrangler.jsonc`: `DB` binding with an all-zero local placeholder ID and local migrations directory. Replace the placeholder only during separately reviewed production setup.
- `.dev.vars.example`: secret names only; no values. `.dev.vars` and `.wrangler/` are ignored.
- `package.json`: `test`, `db:migrate:local`, and `admin:create:local` scripts; no package versions changed.

## D1 schema

`users` stores normalized email, display name, PBKDF2 hash, `admin`/`user` role, active state and timestamps. `sessions` stores a random session ID, user ID, SHA-256 token hash, expiry, creation and last-seen timestamps. `login_attempts` stores hashes of email/IP identifiers and timestamp, prunes entries older than 24 hours and caps the table at 10,000 rows.

`storage_mounts` stores owner, label, `garage` provider, status, read-only policy and the server-only `shared_storage_project_id`. There is no credential or provider reference column. `favorites` references user, mount and logical object ID. `recent_access` upserts per user/mount/object, records only successful object stat/download (not list/render), retains 90 days and at most 100 rows per user. Shares are not implemented because the authorization model remains undefined.

## Authentication and bootstrap

- `POST /api/auth/login`: validates same-origin and JSON, verifies PBKDF2-HMAC-SHA-256 at 600,000 iterations using [Cloudflare Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/), rejects inactive users, and creates a 32-byte random session token. The work factor follows the [OWASP Password Storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html); production plan CPU behavior still needs validation.
- D1 stores only SHA-256(token); the raw token exists only in the Secure, HttpOnly, SameSite=Lax, Path=/ cookie. Session lifetime is 14 days; login removes expired sessions and caps active sessions to 10 per user.
- `POST /api/auth/logout` revokes the session and clears the cookie. `GET /api/auth/me` resolves the current active user from the session.
- Failed logins are rate-limited at eight per 15 minutes by hashed email or IP. Unknown-user and wrong-password paths both perform the password derivation.
- There is no public signup. To create the first **local** admin, apply the local migration, then set `NEXORA_ADMIN_EMAIL`, `NEXORA_ADMIN_DISPLAY_NAME`, and `NEXORA_ADMIN_PASSWORD` in a private shell environment and run `pnpm admin:create:local`. The script hashes the password and invokes `wrangler d1 execute nexora-local --local`; it cannot target remote D1. It was not run in this phase. Production bootstrap, admin identity, and mount provisioning require Phase 9 operator setup.

## API routes

All JSON success responses use `{ "data": ... }`; errors use `{ "error": { "code", "message" } }`. Upstream bodies are never passed through. Private JSON responses use `Cache-Control: private, no-store`.

| Method | Nexora route | Behavior |
| --- | --- | --- |
| POST | `/api/auth/login` | Establish session |
| POST | `/api/auth/logout` | Revoke session |
| GET | `/api/auth/me` | Return session user |
| GET | `/api/storage/v1/storages` | List active/inactive mounts owned by user |
| GET | `/api/storage/v1/storages/:storageId` | Read owned mount summary |
| GET | `/api/storage/v1/storages/:storageId/capabilities` | Normalize actual S2 flags and mount read-only policy |
| GET | `/api/storage/v1/storages/:storageId/usage` | Return `unavailable` with null values; no fabricated usage |
| GET | `/api/storage/v1/storages/:storageId/objects?parentId=&cursor=&limit=` | Bounded listing, limit 1–100 |
| GET | `/api/storage/v1/storages/:storageId/objects/:objectId` | Stat and record meaningful recent access |
| POST | `/api/storage/v1/storages/:storageId/folders` | Create folder |
| POST | `/api/storage/v1/storages/:storageId/files` | Forward bounded multipart stream |
| GET | `/api/storage/v1/storages/:storageId/files/:fileId/download` | Stream download, safe allowlisted headers and cancellation |
| GET | `/api/storage/v1/storages/:storageId/objects/:objectId/download` | Compatibility alias for object download |
| PATCH | `/api/storage/v1/storages/:storageId/objects/:objectId` | Rename |
| POST | `/api/storage/v1/storages/:storageId/objects/:objectId/move` | Move within the same mount; cross-mount returns capability unavailable |
| POST | `/api/storage/v1/storages/:storageId/objects/:objectId/copy` | Synchronous S2 copy; returns operation ID |
| DELETE | `/api/storage/v1/storages/:storageId/objects/:objectId` | Move to Trash |
| GET | `/api/storage/v1/storages/:storageId/trash` | List Trash |
| POST | `/api/storage/v1/storages/:storageId/trash/:objectId/restore` | Restore |
| DELETE | `/api/storage/v1/storages/:storageId/trash/:objectId/permanent` | Explicit permanent delete |
| GET | `/api/storage/v1/storages/:storageId/operations/:operationId` | Return public operation fields only |
| GET | `/api/favorites` | List current user's Favorites |
| POST/DELETE | `/api/favorites/:storageId/:objectId` | Verify mount; verify object before adding; remove stale favorite allowed |
| GET | `/api/recent` | List bounded recent object IDs and mount labels |

There is no preview, share mutation, range-read, SMB, cross-mount move, or direct provider route. Capability flags advertise only actual S2 support; preview/share/rangeRead remain false. Usage is unavailable until an authoritative API exists.

## Security and runtime choices

- Cloudflare Pages native file routing and D1 binding; no additional server framework or runtime dependency. The Pages Functions and D1 binding follow the [Cloudflare Pages routing](https://developers.cloudflare.com/pages/functions/routing/) and [Pages D1 binding](https://developers.cloudflare.com/pages/functions/bindings/) conventions.
- All cookie-authenticated mutations require an exact same-origin `Origin`; JSON mutations require `application/json`. Session cookies are always `Secure`.
- `requireUser`, `requireAdmin`, and `requireStorageMount` are reusable helpers. Unknown and foreign mounts return the same 404. Admin is not a storage ownership override.
- Shared Storage client requires `STORAGE_API_URL`, `STORAGE_APP_SECRET`, `CF_ACCESS_CLIENT_ID`, and `CF_ACCESS_CLIENT_SECRET`; it sends both Access service identity headers and the app Bearer token server-side, rejects unsafe URLs/redirects, applies a timeout (default 15 seconds, maximum 30 seconds), ties requests to cancellation, and normalizes errors.
- Names reject blank, path separator, control character, and >255 UTF-8 byte values before forwarding; S2 remains authoritative for NFC normalization, reserved names and duplicate detection.
- Download does not call `arrayBuffer`, `blob`, or buffer constructors; it streams the response body and propagates cancellation. Content type/length/disposition are allowlisted and `nosniff` is set.
- Upload is **not end-to-end streaming or resumable**. Nexora bounds the incoming multipart stream (default 25 MiB file plus 1 MiB parser overhead) and forwards chunks without building a full Nexora buffer; the current Shared Storage S2 handler still runs `formData()` and buffers the file before Garage. Set `STORAGE_MAX_UPLOAD_BYTES` no higher than the deployed S2 `MAX_FILE_SIZE_MB` (default 25 MiB). Large-file readiness is not claimed.
- The Pages API uses stable Nexora errors; internal SQLite, Garage, S3, Access, host, and stack details are not returned. No secrets are in Vite variables, JSX, or browser imports.

## Environment and migration safety

`.dev.vars.example` lists empty server-only names: `STORAGE_API_URL`, `STORAGE_APP_SECRET`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, `STORAGE_TIMEOUT_MS`, and `STORAGE_MAX_UPLOAD_BYTES`. Copy locally to `.dev.vars` and set secrets only in an approved local/secret store. No real values are committed or provisioned.

`wrangler.jsonc` uses D1 binding `DB`, database name `nexora-local`, an all-zero placeholder ID, and `migrations/`. Local operator commands:

```bash
pnpm db:migrate:local
pnpm admin:create:local
```

The migration was applied successfully to **local D1 only**. It was not applied remotely. Before production, an operator must create/choose a separate Nexora D1 database, replace the placeholder with its real ID after review, bind production secrets, configure Access and the Shared Storage app credential, provision an app/project/mount mapping, back up the database, and schedule a remote migration separately. Never run remote migration as part of Phase 8.

## Validation

- `pnpm test`: **25/25 passed**, Node `node:test`, in-memory SQLite, fake Shared Storage; covers sessions and hashing, inactive/expired users, logout, origin/content type, login throttling, mount ownership, no admin bypass, project isolation, pagination, capability flags, object/folder/mutation routes, upload size/streaming, download cancellation and headers, Favorites/Recent bounds, timeout and error redaction.
- `pnpm db:migrate:local`: **passed**; Wrangler applied `0001_backend_foundation.sql` to local D1 using the zero placeholder ID and `--local`.
- `pnpm lint`: passed.
- `pnpm build`: passed; existing React demo bundle builds.
- `wrangler pages functions build`: worker bundle compiled successfully. Wrangler could not write its user-level log under the sandbox, but the build command exited successfully and reported `Compiled Worker successfully`.
- `git diff --check`: run at final review.
- No browser-to-API flow was tested; no production account, production D1, Cloudflare Access, Shared Storage endpoint/credential, Garage, mount, or deployment was used.

## Next phase boundary

Phase 8 does not replace `FilesProvider`, fixtures, `useFiles`, upload queue or demo operations. Phase 9 review can plan production provisioning and connect frontend state incrementally. Do not enable shares, SMB, preview/range reads, resumable uploads, remote migration, or deployment without the relevant later review.
