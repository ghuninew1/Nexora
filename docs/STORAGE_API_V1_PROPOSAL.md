# `/api/storage/v1/*` Contract Proposal

สถานะ: ออกแบบเพื่อ review เท่านั้น ไม่ได้ implement ใน Phase 7 และไม่ใช่ endpoint ที่ deploy แล้ว

## Principles

1. Browser เรียก Nexora same-origin server API เท่านั้น ห้ามเรียก `/api/garage/*`, `/api/smb/*`, Garage S3 หรือ Shared Storage internals โดยตรง
2. Public contract ใช้ `storageId`, `fileId`, `folderId`, `parentId` แบบ logical ID เท่านั้น; ห้ามรับ/ส่ง physical path, bucket, S3 object key, SMB share/path หรือ provider secret
3. Server derives `userId` from authenticated Nexora session; client ส่ง owner ID, namespace หรือ `provider_reference` ไม่ได้
4. ทุก list/stat/preview/download/mutation ตรวจ user → mount → object ownership, parent relation, object state, provider status และ capability ฝั่ง server
5. JSON API errors use one stable envelope; binary download/preview are documented exceptions. All private responses are `Cache-Control: no-store`.
6. Default delete moves metadata/object to Trash when provider supports it. Permanent delete is a distinct explicit operation, never silently implied by normal `DELETE`.

## Authentication and error envelope

Browser sends same-origin session cookie established by Nexora. Mutation requires origin/CSRF validation. The Pages Function authenticates user, derives identity and checks access. It then authenticates server-to-server using Cloudflare Access service identity plus a dedicated Nexora app credential (or another reviewed service assertion). Credentials exist only in server-side secret storage and are not forwarded to browser.

Suggested error response:

```json
{
  "success": false,
  "error": {
    "code": "NAME_CONFLICT",
    "message": "An item with that name already exists.",
    "requestId": "opaque-correlation-id",
    "retryable": false
  }
}
```

Use stable codes such as `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_INPUT`, `NAME_CONFLICT`, `CAPABILITY_UNAVAILABLE`, `QUOTA_EXCEEDED`, `UPLOAD_TOO_LARGE`, `PROVIDER_UNAVAILABLE`, `TRANSFER_INCOMPLETE`, `RATE_LIMITED`, and `INTERNAL_ERROR`. Do not return physical paths, hostnames, upstream response bodies, credential hints, SQL errors or raw provider error messages.

## Proposed endpoints

| Method | Endpoint | Purpose / request | Response |
| --- | --- | --- | --- |
| GET | `/api/storage/v1/storages` | List mounts visible to session user; cursor/limit optional | `{ success, storages: [{ storageId, name, providerLabel, status, readOnly }] }` |
| GET | `/api/storage/v1/storages/:storageId` | Get one owned mount summary | `{ success, storage }` |
| GET | `/api/storage/v1/storages/:storageId/capabilities` | Read current provider and mount capabilities | `{ success, capabilities }` |
| GET | `/api/storage/v1/storages/:storageId/usage` | Read reported usage; unknown values nullable/status=`unavailable` | `{ success, usage: { usedBytes, quotaBytes, objectCount, measuredAt, status } }` |
| GET | `/api/storage/v1/storages/:storageId/objects?parentId=&type=&cursor=&limit=` | List root or folder children; `parentId` absent/null selects root; cursor opaque; server caps `limit` | `{ success, items, nextCursor }` |
| GET | `/api/storage/v1/storages/:storageId/objects/:objectId` | `stat` an owned object | `{ success, object }` |
| POST | `/api/storage/v1/storages/:storageId/folders` | Create folder `{ parentId: string|null, name }` | `201 { success, folder }` |
| POST | `/api/storage/v1/storages/:storageId/files` | Multipart streaming upload with `file`, optional `parentId`, idempotency key header; validated quota/name/size | `201 { success, file }`; large/resumable upload may later use create/upload-part/complete operations |
| GET | `/api/storage/v1/storages/:storageId/files/:fileId/download` | Authorized binary stream; optional `Range` only where capability permits | Binary stream, safe `Content-Disposition`, `nosniff`, no-store |
| GET | `/api/storage/v1/storages/:storageId/files/:fileId/preview` | Authorized safe preview; `Accept` negotiates metadata/content, unsafe types are attachment/denied | Binary stream or `{ success, preview: { url? } }` only if using a short-lived same-origin URL; never a raw provider URL |
| PATCH | `/api/storage/v1/storages/:storageId/objects/:objectId` | Rename `{ name }`; server validates uniqueness and calls provider if required | `{ success, object }`, stable ID unchanged |
| POST | `/api/storage/v1/storages/:storageId/objects/:objectId/move` | Move within or across mounts `{ targetStorageId, parentId }`; target parent null means root | `{ success, operationId, object }`; same object logical ID remains after successful move |
| POST | `/api/storage/v1/storages/:storageId/objects/:objectId/copy` | Copy to `{ targetStorageId, parentId }` | `202` for async transfer or `201` sync; new logical ID |
| DELETE | `/api/storage/v1/storages/:storageId/objects/:objectId` | Move object/subtree to Trash; require idempotency key for retried provider effects | `{ success, trashEntryId, deletedAt }`; logical IDs remain reserved |
| GET | `/api/storage/v1/trash?storageId=&cursor=&limit=` | List the current user's Trash | `{ success, items, nextCursor }` |
| POST | `/api/storage/v1/trash/:trashEntryId/restore` | Restore object/subtree to original or requested `{ parentId }`; verify name conflict, mount and ownership | `{ success, object }`; same logical ID |
| DELETE | `/api/storage/v1/trash/:trashEntryId` | Permanently remove from provider and metadata after retention/policy checks | `{ success, operationId }`; separate UI confirmation required |
| GET | `/api/storage/v1/operations/:operationId` | Poll copy/move/delete/upload finalization when async | `{ success, operation: { status, progress?, error? } }` |

All object mutation routes include `storageId` in the path, and their JSON body carries explicit `parentId`/`targetStorageId` where needed. The source/target object IDs must belong to the supplied mounts and caller. For file routes the file ID is not resolved outside that mount. Folder operations apply to descendants with server-side bounds and resumable jobs for large trees.

## Data shapes

```json
{
  "storageId": "stg_opaque",
  "object": {
    "fileId": "obj_opaque",
    "folderId": null,
    "parentId": "folder_opaque_or_null",
    "type": "file",
    "name": "report.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 2457600,
    "createdAt": "2026-10-27T00:00:00.000Z",
    "modifiedAt": "2026-10-27T00:00:00.000Z",
    "deletedAt": null
  }
}
```

For folders, `folderId` is populated, `fileId` is null, and `sizeBytes` is null unless provider gives a meaningful aggregate. Keep one canonical `objectId` if preferred by implementation; the API may expose type-specific `fileId`/`folderId` aliases for UI clarity. IDs are opaque and stable across rename, move, favorite, share, Trash and restore. Copy creates a new ID. `provider_reference`, root physical location, provider name if it reveals infrastructure, and credentials are absent from public response.

## Capabilities

```json
{
  "upload": true,
  "download": true,
  "preview": true,
  "createFolder": true,
  "rename": true,
  "move": true,
  "copy": true,
  "trash": true,
  "restore": true,
  "permanentDelete": true,
  "share": false,
  "rangeRead": false,
  "maxUploadBytes": 26214400,
  "readOnly": false
}
```

Capabilities combine provider support, mount state, user permission, quota and server policy. UI hides/disables actions based on capability response and still handles server-side `CAPABILITY_UNAVAILABLE`; it must not branch on `provider === "smb"`. Capabilities are not authorization: server rechecks them on each operation.

## Provider registry contract

Provider adapter receives a trusted mount plus opaque provider refs and implements `list`, `stat`, `createFolder`, `upload`, `download`, `rename`, `move`, `copy`, `delete`, `restore`, `getCapabilities`. It returns normalized metadata and stream handles; it never returns physical path to the API serializer. A provider may report false for a capability. The manager maps provider outcomes to stable errors and manages operation records, idempotency, metadata and reconciliation.

## Streaming and large files

- Do not call `request.formData()`, `arrayBuffer()`, `Blob.arrayBuffer()`, `Buffer.from(fullFile)` or `transformToByteArray()` for full uploads/downloads in a path that claims streaming.
- Stream browser upload body through Nexora API to Storage Manager with a streaming byte counter, cancellation propagation and bounded buffering. The downstream Node service must accept stream and write to S3/Garage using multipart/resumable upload; do not collect into one Buffer.
- Download returns upstream `ReadableStream` with safe headers; range is advertised only if provider honors it. Abort/close cancels provider read.
- Choose a product max below the actual Cloudflare account-plan request-body cap and upstream limit; use resumable/chunked operations for larger files. Check the deployed account limits before declaring a max. Enforce per-user quotas and available-space behavior.
- Use an operation/idempotency key, temporary upload state, checksum/size verification and cleanup expiry so an interrupted or duplicated request does not leave orphan objects. Cross-provider move verifies target before deleting source.
- Proposed endpoint contract permits multipart v1 for normal sized streaming upload; if runtime/parser cannot preserve streaming, use a server-created short-lived upload session with provider credentials kept server-side and the same logical ownership checks.

## Status and retry semantics

- `401`: no/expired Nexora session.
- `403`: authenticated but policy denies action (do not reveal whether a foreign object exists).
- `404`: unknown, foreign, wrong-mount or deleted normal object.
- `409`: duplicate name, stale version, or operation conflict.
- `413`: account/provider configured upload ceiling exceeded.
- `422`: valid request shape that provider/capability cannot perform.
- `429`: rate/quota/concurrency policy; return `Retry-After` only when bounded and useful.
- `502/503/504`: provider unavailable, upstream failure or bounded timeout; include opaque request/operation ID, never provider payload.
- Retry is safe only when request carries idempotency key and API can identify prior operation. Do not auto-retry non-idempotent delete/move without operation state.

This contract is ready for review only. Phase 8 implementation, migrations, Shared Storage Service changes, secrets and deploy all require explicit approval.
