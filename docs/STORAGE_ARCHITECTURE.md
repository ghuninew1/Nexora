# Nexora Storage Architecture Proposal

สถานะ: This architecture proposal captured the Phase 8 implementation boundary. A user-provided Phase 9.3 brief dated 2026-10-27 later confirms Nexora production Storage operations and the Shared Storage Copy fix were verified. This repository does not independently verify current production bindings, migrations or deployment state; consult the phase reports for their dated evidence.

## Architecture ปัจจุบันจาก source

Nexora File Browser frontend now keeps a bounded in-memory cache of normalized public listings for the authenticated app session. Cache keys include public `storageId` plus logical `parentId` (root has a dedicated sentinel); the cache is not part of the provider contract and never holds provider references or object bytes. See [Phase 9.3.1](PHASE_9_3_1.md) for TTL, pagination, invalidation, and QA policy.

```text
IssueDesk browser
    │ same-origin /api/storage/* (session cookie; admin for list/upload/delete)
    ▼
IssueDesk Cloudflare Pages Functions + D1
    │ Cloudflare Access service token + Storage app Bearer credential
    ▼
Shared Storage Service (Hono / Node.js)
    ├── SQLite: apps, hashed credentials, projects, legacy files + logical file/folder metadata
    └── S3-compatible API
            ▼
          Garage
```

IssueDesk currently selects one fixed Storage project. Garage is the current object provider behind the service, while the Storage Service owns project/app credential enforcement and metadata. Nexora must treat Garage as the **first storage provider, not the storage architecture itself**.

## Phase 8 implementation

Current Nexora source now contains `functions/api/[[path]].js`, server-only modules under `functions/_lib/`, D1 schema `migrations/0001_backend_foundation.sql`, and a `DB` Wrangler binding using a placeholder local ID. The browser still runs the Phase 7 demo and does not import or call server modules. See [Phase 8 report](PHASE_8.md) for routes, tests and limitations.

The implemented Storage client sends Cloudflare Access service identity plus the Shared Storage app Bearer credential from server bindings, and derives the project ID from the current user's D1-owned mount. It proxies the actual S2 `/v3` File Manager, including pagination, folders, copy, Trash, restore and permanent deletion. It reports usage unavailable, preview/share/rangeRead false, and rejects cross-mount moves. Download streams; upload is bounded through Nexora but remains buffered inside Shared Storage S2.

## Target architecture

```text
Nexora browser
    │ same-origin /api/storage/v1/* + Nexora session
    ▼
Nexora Pages Functions / server API
    ├── Nexora D1: ownership, logical objects, mounts, favorites, trash, shares
    ├── Storage Manager: authz, registry, validation, capabilities, orchestration
    └── service-to-service auth (server secret only)
                ▼
        Shared Storage internal /v2 (compatible) / Storage Manager
                ▼
          Provider Contract
             ├── Garage provider (first)
             └── SMB provider (future)
```

Nexora server is the authority for user session and logical ownership. Provider code maps a logical object record to opaque provider reference; neither browser nor public API accepts or returns a physical path, S3 object key, SMB share path, mount credential, or provider secret.

## Provider behavior contract

The contract is behavioral and may be implemented as modules/functions or classes according to the owning service's conventions:

```ts
type StorageProvider = {
  list(input: { mount: Mount; parentRef: string | null; cursor?: string; limit: number }): Promise<Page<ProviderObject>>;
  stat(input: { mount: Mount; providerRef: string }): Promise<ProviderObject | null>;
  createFolder(input: { mount: Mount; parentRef: string | null; name: string }): Promise<ProviderObject>;
  upload(input: { mount: Mount; parentRef: string | null; name: string; mimeType: string; size?: number; body: ReadableStream }): Promise<ProviderObject>;
  download(input: { mount: Mount; providerRef: string; range?: string }): Promise<ProviderDownload>;
  rename(input: { mount: Mount; providerRef: string; name: string }): Promise<ProviderObject>;
  move(input: { mount: Mount; providerRef: string; parentRef: string | null }): Promise<ProviderObject>;
  copy(input: { mount: Mount; providerRef: string; targetMount: Mount; targetParentRef: string | null; body?: ReadableStream }): Promise<ProviderObject>;
  delete(input: { mount: Mount; providerRef: string }): Promise<void>;
  restore(input: { mount: Mount; providerRef: string; parentRef: string | null }): Promise<ProviderObject>;
  getCapabilities(input: { mount: Mount }): Promise<StorageCapabilities>;
};
```

Manager responsibilities:

- resolve `storageId` and opaque `provider_reference` only after checking session user, mount ownership, object ownership and requested permission;
- reject provider operations when mount is inactive/read-only or its capabilities do not allow the requested operation;
- translate provider-specific errors to stable v1 errors while keeping internal paths, hostnames and credentials out of client responses;
- update Nexora metadata atomically where possible and use operation IDs / reconciliation records where the provider and D1 cannot share a transaction;
- make native same-provider move/copy an optimization; keep public operation semantics provider-independent.

`copy` and `move` have different identity semantics: copy creates a new logical object; move keeps `fileId`/`folderId`. Same-provider operations may call provider-native methods. Cross-provider future transfer reads a stream, writes to the destination, verifies size and preferably a checksum, then on **move only** removes the source after destination verification; failures leave the source intact and expose a retryable/partial-operation state.

## Registry and secret boundaries

Suggested `storage_mounts` metadata:

| Field | Purpose |
| --- | --- |
| `id` | Stable opaque Nexora `storageId` |
| `owner_user_id` | User/team ownership enforced from session, never accepted from an untrusted client |
| `name` | User-facing mount label |
| `provider` | Registry key such as `garage` or future `smb` |
| `status` | `active`, `disabled`, `error`, or `provisioning` |
| `read_only` | Admin-controlled write guard |
| `root_reference` | Opaque provider root reference; not a physical path |
| `config_json` | Non-secret provider settings only; schema validated and versioned |
| `secret_ref` | Optional opaque reference to external server secret storage; no secret value |
| `created_at`, `updated_at` | UTC timestamps |

Do not store SMB passwords or Garage credentials in plaintext D1, `config_json`, `VITE_*`, `localStorage`, frontend bundles or browser requests. Keep secrets in server-side secret bindings/managed secret storage, limit which function reads them, and rotate them independently of mount metadata. `provider` selects a server adapter; UI action availability must be based on returned capabilities rather than `provider === "smb"`.

## Logical IDs and namespace

- `storageId`: opaque stable mount ID.
- `fileId` and `folderId`: opaque stable IDs backed by a Nexora metadata row; both may be represented as `storage_objects.id` and constrained by `type`.
- `parentId`: nullable logical folder ID; null means mount root. It must refer to a folder in the same mount owned by the same user.
- `provider_reference`: private adapter-only pointer to provider metadata; never a public ID, URL, S3 key or SMB path.
- Rename/move update `name`/`parent_id` and provider reference as needed but do not replace the logical object ID. Favorite, share, Trash and restore rows reference this logical ID.
- Server resolves provider root as `issuedesk/*` or `nexora/users/{userId}/*` using authenticated identity and registry data. Browser sends logical IDs only; it never composes namespace, bucket, share, path or object key.

Authorization requires both `storageId` and object ID on each operation; server queries ownership and relationship together. Unknown, deleted, cross-mount and cross-user IDs should return the same not-found response to reduce IDOR information leaks.

## D1 metadata proposal

Use a Nexora database binding separate from IssueDesk D1 and Storage Service SQLite. **Do not create migrations in Phase 7.** Initial schema proposal:

```text
storage_mounts
  id PK, owner_user_id, name, provider, status, read_only,
  root_reference, config_json, secret_ref, created_at, updated_at

storage_objects
  id PK, storage_id FK, parent_id nullable self-FK,
  type CHECK(file|folder), name, normalized_name,
  provider_reference, mime_type nullable, size_bytes nullable,
  checksum nullable, created_at, updated_at, deleted_at nullable,
  created_by, row_version

favorites
  user_id, object_id FK, created_at, PK(user_id, object_id)

recent_access
  user_id, object_id FK, last_accessed_at, PK(user_id, object_id)

trash_entries
  id PK, user_id, object_id FK, original_parent_id nullable,
  deleted_at, deleted_by, restore_state

shares
  id PK, owner_user_id, object_id FK, token_hash nullable,
  expires_at nullable, revoked_at nullable, created_at

share_permissions
  share_id FK, subject_type, subject_id, permission, created_at,
  PK(share_id, subject_type, subject_id)

storage_usage
  storage_id PK/FK, known_bytes nullable, known_objects nullable,
  measured_at nullable, status, provider_cursor nullable
```

### Unified object vs split files/folders

| Choice | Benefits | Costs |
| --- | --- | --- |
| Unified `storage_objects` with `type` | One ID/parent/name/ownership/trash/favorite/share model; easy folder traversal and mixed listings; fewer polymorphic joins | Nullable file-only metadata; CHECK constraints and API validation must keep file/folder fields coherent; recursive folder deletion needs bounded traversal or job handling |
| Separate `files` and `folders` tables | Stronger type-specific columns and constraints; easier file-only indexes | Shared references from favorite/share/trash need polymorphic IDs or duplicate tables; moves/children/favorites need unions; risk of inconsistent semantics |

**Proposal:** one `storage_objects` table initially because the Nexora UI, stable IDs and lifecycle operations apply to both files and folders. Keep file-only provider fields nullable and enforce `type`/column consistency with SQL checks and server validation. Add child-name uniqueness scoped to storage and parent using a normalized-name key; account for root `parent_id IS NULL` with a non-null root key or expression index rather than relying on SQLite NULL uniqueness. Trash must preserve original parent and descendant relationships; subtree restore/delete should be transactional in metadata and safely resumable for large trees.

Shares and permissions are optional tables for a later capability. Do not present share links or permission management until an explicit share policy and server authorization rules are reviewed. `storage_usage` is a cache of provider-reported values, not a source of truth when the provider cannot report them; return unavailable instead of a fixture number.

## Authentication and request flow

```text
Browser
  └─ same-origin `/api/storage/v1/*` + Nexora HttpOnly session cookie
       └─ Nexora Pages Function verifies session, CSRF/origin on mutation,
          derives userId, verifies mount/object ownership and capabilities
             └─ server-only service authentication + Cloudflare Access policy
                 └─ Storage API v1 validates service identity and namespace
                    └─ provider adapter accesses Garage / future SMB
```

- Nexora currently has no auth session or Pages Functions; design/approve its identity and account lifecycle before using D1 ownership rows. Do not copy IssueDesk users/roles or assume admin is the correct Nexora policy.
- Browser requests never contain `STORAGE_API_KEY`, Garage credentials, SMB username/password or service credential. Use same-origin session cookie with `HttpOnly`, `Secure`, appropriate `SameSite`; mutation endpoints also validate origin/CSRF token.
- Nexora API derives `userId` only from verified server session. Ignore/reject client-supplied owner/user/namespace fields. Check mount and object ownership for list/stat/download/preview and every mutation.
- Server-to-server auth is independent of end-user auth. Use Cloudflare Access service identity plus a dedicated scoped app credential (or a reviewed signed service assertion) and rotateable server-only secret. The downstream service must scope each request to Nexora's app/mount and reject arbitrary project IDs. Never forward an end-user cookie as a service credential.
- Cross-user share access, if approved later, is a separate explicit authorization path bounded by share permission, expiry and revocation; it must not weaken normal owner checks.

## Security and failure review

| Risk | Required guard |
| --- | --- |
| Path traversal / forged provider refs | Accept logical IDs only; server-side registry lookup; provider refs never client-controlled; strict names reject separators, control characters, dot segments and platform-reserved forms |
| IDOR / cross-user access | Bind user, mount and object in each ownership query; same 404 for unknown/out-of-scope identifiers; check descendants on folder operations |
| MIME spoofing / active content | Treat browser MIME/name as hints; inspect signatures where practical; store detected and declared MIME separately; `nosniff`; force attachment for unsafe/unknown types; isolate preview origin/sandbox HTML/PDF policy |
| Oversized upload / exhaustion | Configured per-plan file and quota limits; streaming byte counter; per-user/mount quotas; rate limits; concurrent upload caps; reserve/check quota before accepting bytes |
| Duplicate names | Normalize Unicode and case policy consistently per provider; enforce scoped uniqueness transactionally; return field-level conflict without leaking cross-user names |
| Share escalation | Explicit permission enum; no client-chosen owner; short-lived hashed tokens, expiry/revoke, audit and least privilege; deny share when capability false |
| Deleted-object access | Exclude trashed descendants from normal lookup/list; restore checks original parent still exists and same owner; permanent delete requires separate confirmation UI and server policy |
| Provider credential exposure | Server secret store only, no config/body/log/client echo; least-privilege Garage app credential; separately provision/rotate SMB service account; audit access |
| Partial/interrupted writes | Upload operation state/idempotency key, temp object + finalize, cleanup worker/TTL, checksum/size verification; cross-provider move deletes source only after verified target |
| Timeout/retry duplication | Bounded connect/read/total deadlines; retry only idempotent phases; stable operation ID; exponential backoff with limits; surface recoverable partial state |
| Large-folder operations | Cap synchronous child count; use job records for recursive delete/move/copy; checkpoint and resume; retain source until full verification |

## Streaming review and Cloudflare fit

Before S1 the Storage Service buffered both directions. S1 now streams downloads through the Garage Provider with cancellation and a total provider deadline; upload still uses `formData` -> `arrayBuffer` -> `Buffer`. IssueDesk generic upload also parses `request.formData()` before forwarding. Upload therefore remains unsuitable for arbitrarily large files; true upload streaming needs a separately reviewed multipart parser/protocol path in both layers. See the S1 report for tested behavior and production verification limits.

Target should count bytes as streams pass through and enforce limits before commit; use provider-native streaming/multipart operations and verify checksum/size at finalize. For downloads, return upstream `ReadableStream` directly with sanitized headers and handle range requests only if each provider implements them. Avoid an API design that requires a complete file in Worker heap.

Cloudflare's current Workers limits list 128 MiB memory per isolate and account-plan HTTP request body ceilings of 100 MB Free/Pro, 200 MB Business, with Enterprise adjustable up to 5 GB; Pages Functions share Workers runtime behavior [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/). These are request/platform ceilings, not a recommendation to buffer a file of that size. Actual account plan, zone upload limit and Pages bindings remain unverified. A stream may still be bounded by provider and proxy limits, execution duration and network timeouts; acceptance requires checking the actual configured deployment.

## SMB readiness

SMB is future-only. Keep public endpoints provider-neutral and make adapters consume the same behavior contract. Before implementing SMB, decide share discovery/mount lifecycle, SMB protocol/client library support in the chosen runtime, credential vault, SMB ACL-to-Nexora permission mapping, read-only behavior, case/Unicode naming rules, symlink handling, file locking, stale handles, offline/error semantics, server reachability and backup strategy. Do not install a client or attempt a connection in Phase 7. SMB capabilities may be narrower than Garage and the UI must hide/disable unsupported actions from capability response.

## Phase 8 implementation and Phase 9 follow-up

Phase 8 implemented `wrangler.jsonc`, the Nexora D1 schema, Pages API routing/auth helpers, the server-side `/v3` client, bounded Favorites/Recent state, and local security/contract tests. The D1 migration was applied only to local D1. `FilesProvider`, `useFiles`, demo fixtures and simulated uploads remain unchanged.

Phase 9 review can provision a real Nexora D1, server secrets, Cloudflare Access service identity, Shared Storage app/project/mount, and connect the UI incrementally. Confirm deployed upload ceilings before configuring `STORAGE_MAX_UPLOAD_BYTES`. No production secrets, user, mount, migration, or deployment was made in Phase 8.
