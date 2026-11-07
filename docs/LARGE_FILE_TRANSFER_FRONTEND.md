# Large file transfer — frontend client

Phase **4.1 and 4.2 COMPLETE locally** (2026-11-08). The multipart client is integrated into the existing workspace Upload Queue. Phase4 overall remains incomplete: persistent recovery, full cross-tab ownership, Transfer Manager and real-provider acceptance remain pending. Server flags stay disabled by default; source implementation and mocked browser checks do not imply production activation or10GiB acceptance.

## Upload Queue integration (Phase4.2)

- `src/utils/upload-strategy.js` selects legacy upload for files at/below the effective small-file limit (advertised limit clamped to the existing25MiB maximum;25MiB fallback). Larger files use multipart only with explicit compatible capability:8MiB parts,1 parallel part/session, safe positive limits, <=10GiB, <=1280 parts and consistent geometry. Missing/disabled/malformed capability or excessive file size fails locally. Multipart failure never falls back to `/files`.
- `src/hooks/useUploadQueue.js` retains File, AbortController, immutable create key/metadata, transfer ID and client in refs/tasks, not React state. Display state contains safe queue metadata only. Existing preferences1/2/3/5 (fallback3) cap active file workers, including hashing, requests, backoff and controls. Each worker awaits each operation; multipart sessions can run concurrently, with one local operation/session. Lowering concurrency lets existing workers settle before starting more.
- `useRemoteFilesState` supplies authenticated owner/mount scope, current upload policy, negotiated capability and existing completion/cache-refresh callbacks. Transient storage discovery retains the last confirmed mount for existing work so ordinary navigation does not erase the queue; a resolved mount change, unavailable assignment, auth change or workspace destruction aborts and discards that scope. Current backend authorization remains authoritative on every request. Known permission/readOnly/maintenance denial stops new upload writes; creator cancellation stays available.
- `AuthProvider.signingOut` stops queue requests at logout initiation, before a slow logout request returns. A failed logout leaves the account UI available for retry but does not restore discarded transfer metadata. Epoch/mount/owner/task guards discard stale results and callbacks, including transports that ignore AbortSignal. Logout/unmount/assignment changes never issue automatic server cancellation.

### Queue hook contract

`useUploadQueue({uploadFile,onComplete,onUnauthorized,canUpload,scopeKey,maxConcurrency,autoClear})` extends the existing hook. `scopeKey` identifies the authenticated owner and resolved mount; `canUpload(storageId)` supplies the current write policy. `createClient` and `waitForRetry` are injectable for focused tests. Consumers enqueue with `addFiles(files,{storageId,parentId,maxUploadBytes,transfers})`, which returns queue IDs. Items expose `strategy`, `status`, `acknowledgedBytes`, `completedParts`, `partCount`, safe `error`, `errorCode`, `retryable` and `pendingAction`, without source/session secrets.

Use `pauseUpload(id)`, `resumeUpload(id)`, `cancelUpload(id)`, `retryUpload(id)` and `clearFinished()` from the same instance. `cancelAll()` means explicit per-task cancellation; `reset()` means local lifecycle disposal only. Never use cancelAll on logout. `onComplete(task,{file})` is called once with the confirmed logical file and existing destination metadata, suitable for targeted listing invalidation. Failed cache refresh must not change confirmed success.

### Controls and state transitions

```text
queued -> uploading -> verifying -> uploading -> finalizing -> success
uploading/verifying/reconciling/retry_wait -> pausing -> paused
paused -> resuming -> reconcile -> uploading
uploading/paused/error -> cancelling -> cancelled (only server-confirmed)
uploading -> retry_wait -> reconciling -> uploading
expired -> terminal (select the file again for an explicit new upload)
```

Queued multipart work can pause/cancel locally before a server session exists. Once creation starts, Pause/Cancel abort local work, await its settlement, and recover the transfer ID with the exact original create key if needed before invoking server control. Pause refreshes all verified receipt pages after server confirmation. Resume reconciles source digests and authoritative status before resume/parts; an ambiguous pause never becomes an automatic resume. During finalization only Cancel is exposed, because backend publication may already be in progress.

The queue uses Phase4.1 clients with `maxRetries:0` and owns a total budget of two automatic retries after the initial attempt, with500ms exponential50–100% jitter (up to1s base in this budget). The client still reconciles uncertain writes before returning. Queue retry waits, then reconciles/reuses the same session/key. Explicit Pause/Cancel interrupts retry waits and has no automatic control replay; ambiguous control failures require explicit Retry pause/cancel. The queue never labels an uncertain cancel as cancelled. Cancellation racing completed publication recovers the confirmed object as success instead. Completed callbacks are emitted once per task, including after a lost completion response.

Transient network/timeout/provider/rate/version/ambiguous-complete errors are retryable. Authentication errors stop the whole queue and expire auth; permission/capability/validation/checksum errors never automatically retry. Expiration has a separate terminal label. Rejected grant/maintenance messages direct users to check storage access. Recoverable errors retain their File/key/session for explicit retry; no session metadata crosses authenticated scopes.

### Progress and presentation

Multipart progress uses all server-verified receipt pages and acknowledged bytes after each part, initial reconciliation and confirmed pause. Dispatching/hashing bytes does not increment progress. Verifying, retry_wait, reconciling, pausing/resuming/cancelling and finalizing are separate statuses. Display percentage is capped at99 until the server confirms completed, even when every byte is acknowledged; the row then says awaiting finalization. Count/byte updates occur at operation boundaries, not per network chunk. Legacy uploads retain indeterminate progress and have no Pause/Resume controls. Shared Button/cx/theme tokens,44px action targets, semantic progressbar labels and reduced-motion behavior are preserved.

### Lifecycle and remaining limitations

No IndexedDB, reload/reselect UI, background worker or cross-tab recovery is implemented. Reload/logout/assignment change/workspace teardown lose local keys/IDs/File references; server sessions remain for their existing TTL/operator cleanup. Clear finished explicitly discards failed-task recovery metadata without cancelling the server. Cancel first if cleanup is required. If create outcome is unknown and permission/feature access is revoked before its logical transfer ID can be recovered, cancellation cannot be confirmed from this client; show uncertainty and rely on authorized recovery or existing backend TTL cleanup. No new backend contract was introduced to bypass that boundary.

HTTP abort is local only: provider work may still finish or hold a lease. An immediate control can therefore return conflict/busy and require explicit retry. Backend completion/cleanup restrictions still apply. Paused/failed workers release queue slots; control requests re-enter the same bounded scheduler. Multiple tabs/clients remain uncoordinated and rely on server fencing/conflicts. File bytes, server flags, credentials and remote data are never persisted or changed by this integration.

## Public API

`src/services/multipart-upload.js` exports `createMultipartUploadClient`, `MultipartUploadError`, `classifyMultipartError` and `hashUploadPart`.

Create one client per storage and authenticated owner lifecycle:

```js
const controller = new AbortController();
const client = createMultipartUploadClient({ storageId, signal: controller.signal });
const key = client.newIdempotencyKey(); // retain BEFORE first request
const session = await client.createSession({ name: file.name, sizeBytes: file.size,
  mimeType: file.type || 'application/octet-stream', parentId: null }, key);
let current = await client.reconcile(session.transferId, file);
// Resume is explicit; reconcile does not change paused state.
if (current.state === 'paused') current = await client.resumeSession(current.transferId);
if (current.state === 'active') {
  for (let n = 1; n <= current.partCount; n++) {
    await client.uploadPart(current.transferId, file, n);
  }
  current = await client.completeSession(current.transferId);
}
// completed returns current.object; never create another session to recover it.
```

| Method | Contract |
| --- | --- |
| `newIdempotencyKey()` | Web Crypto UUID; caller must retain the key and exact create metadata for the whole attempt |
| `createSession(metadata, key)` | Allowlisted name/parentId/sizeBytes/mimeType; stable caller-owned key, bounded same-key/body replay after uncertain create; returns normalized session |
| `getSession(transferId)` | Authoritative status and first page (100 receipts); not a broker-list snapshot |
| `getCompletedParts(transferId)` | All pages; returns session with combined verified `parts`, `nextCursor: null`; validates consistent state/version/geometry/expiry/counters |
| `reconcile(transferId, file)` | All pages plus exact file size and SHA-256 verification of every acknowledged part; completed returns original normalized object; no writes |
| `uploadPart(transferId, file, number)` | Reconciles first, validates geometry, skips verified identical receipts only, hashes one Blob slice and sends raw bytes; returns receipt or completed session |
| `pauseSession` / `resumeSession` | Fresh status and CAS version; returns target session or already-completed session |
| `completeSession` | Fresh status and CAS; uncertain outcomes re-read the same session before bounded retry; returns same completed object, or AMBIGUOUS_COMPLETION when transient resolution is exhausted |
| `cancelSession` | DELETE first to preserve creator cleanup after grant revocation/flag disable; returns `{transferId,state:'cancelled'}`. Uncertain DELETE reads status before retry; if status is denied it stops without blind replay |

Every session method takes `transferId` as its first argument. The client rejects concurrent operations on the same session with `SESSION_BUSY` (including reads), matching the backend single-operation constraint; different clients/tabs still require coordination in Phase4.2. No background loop is started. Pause/cancel should be scheduled after the current operation settles; aborting HTTP does not prove provider rollback.

Options: `fetchImpl`, `cryptoImpl`, lifetime `signal`, `timeoutMs` (285000, slightly above backend270s), `maxRetries` (default2, maximum5), and testable `sleep(ms, signal)` / `random`. Retry backoff is capped at10s with exponential growth and50–100% jitter. Transport uses same-origin cookies and `{data}` / `{error}` envelopes. No credentials/provider IDs/physical paths are accepted or returned. The server remains the feature/permission authority; Phase4.2 must also gate entry on normalized capabilities.

## Reconciliation and memory boundary

Server receipts are authoritative, never local counters. Every page is checked for ordered unique part numbers, exact lengths, base64 digests, advancing cursor, stable snapshot and total acknowledged bytes. Inconsistent or incomplete snapshots fail closed; caller may explicitly reconcile again. Missing receipts with consistent counters require retransmission of identical source bytes. No unverified provider parts are skipped. A changed/reselected file must pass every acknowledged digest before upload continues; matching name/size alone is insufficient.

Only a negotiated part (at most8MiB under the current contract) is materialized for Web Crypto, sequentially. Source reads use `Blob.slice(start,end)`; no whole-file `arrayBuffer`, byte cache or Promise.all hashing. Blob/File digest results alone are cached by immutable source identity and range in a WeakMap to avoid quadratic rehashing across part calls; every call still refetches and validates authoritative receipts. Custom slice sources are not cached. This is O(part-size) byte memory plus O(part-count) metadata, not a measured browser RSS guarantee. Web Crypto cannot abort an in-flight digest; lifecycle cancellation is checked before subsequent network work.

## Errors and safe recovery

Stable `.code` values include `NETWORK_INTERRUPTION`, `REQUEST_TIMEOUT`, `AUTHENTICATION_FAILURE`, `PERMISSION_REVOKED`, `SESSION_EXPIRED`, `VERSION_CONFLICT`, `CHECKSUM_MISMATCH`, `PROVIDER_UNAVAILABLE`, `RATE_LIMITED`, `AMBIGUOUS_COMPLETION`. Additional terminal codes: `SESSION_UNAVAILABLE`, `VALIDATION_FAILURE`, `INVALID_INPUT`, `INVALID_RESPONSE`, `FILE_MISMATCH`, `RECEIPT_CONFLICT`, `SESSION_CANCELLED`, `SESSION_NOT_ACTIVE`, `SESSION_BUSY`, `ABORTED`.

Only transient reads retry directly. Uncertain part/transition writes (including malformed success responses) reconcile first; create can only replay the exact retained key/body because no transfer ID may be known yet. Authentication, permission, checksum and validation errors never retry automatically. A409 triggers a fresh version/status, not blind reuse. Completion uncertainty must retain the transfer ID; do not start another upload. Cancellation after revoked status may require an explicit cleanup retry by the user.

## Remaining work after Phase4.2

1. Review account-scoped durable metadata/file reselection and cross-tab ownership before implementing persistence or a full Transfer Manager. Keep small-file fallback and explicit capabilities.
2. Expand browser lifecycle/mobile/offline/permission/late-provider-effect testing and isolated real Garage acceptance, including10GiB, memory and proxy budgets. Current mocked browser checks are not provider acceptance.
3. Keep default flags off until infrastructure gates pass and an operator authorizes activation; Range Download remains a separate phase.

## Validation boundary

Focused unit tests mock same-origin transport, covering create idempotency, SHA-256/headers/boundaries, pagination>100, verified resume, missing/conflicting receipts, stale versions, lost part/complete/cancel responses, terminal states/auth, invalid snapshots, timeout/abort/locking, retry budgets and bounded sequential source reads. These are not real Garage or10GiB verification. See PROJECT_HANDOFF.md for executed suite totals and [backend contract](LARGE_FILE_TRANSFER_BACKEND.md) / [acceptance report](LARGE_FILE_TRANSFER_ACCEPTANCE.md) for outstanding infrastructure gates. Phase4.2 adds queue/UI/lifecycle tests and mocked Chrome checks for26MiB multipart, Pause/Resume/Cancel,3-byte legacy routing and disabled capabilities. No IndexedDB, Range download or Shared Storage changes were made. Exact executed totals, browser environment, skips and limitations are recorded in PROJECT_HANDOFF.md.
