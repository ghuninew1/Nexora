# Large file transfer — frontend client

> Phase 5.1 follow-up (2026-11-08): backend streaming/Range contract and acceptance boundaries are documented in [LARGE_FILE_TRANSFER_DOWNLOAD.md](LARGE_FILE_TRANSFER_DOWNLOAD.md). Earlier phase statements below describe their historical scope. Phase5.2 now adds the active-page managed download queue in the same panel; see the download guide for its distinct disk/identity/lifecycle contract.

Phase **4.1–4.5 COMPLETE locally** (2026-11-08). Multipart uploads retain metadata in native IndexedDB, coordinate same-origin tabs using Web Locks, and recover bounded network interruptions through the original session. Phase4.5 supplies the global upload Transfer Manager; real-provider acceptance remains pending. See PROJECT_HANDOFF.md for executed checks and the Phase4.4 completion result. Server flags stay disabled by default; local tests and mocked browser checks do not imply production activation or10GiB acceptance.

## Durable recovery and original-file selection (Phase4.3)

### Storage contract

`src/services/upload-recovery.js` exports `createUploadRecoveryStore`, `uploadRecoveryStore`, `normalizeRecoveryRecord`, `matchesOriginalFile` and `UploadRecoveryError`. The default database is `nexora-upload-recovery`, version1, with only the `uploads` store, compound primary key `[userScope,id]` and owner index `userScope`. Public operations:

| API | Behavior |
| --- | --- |
| `save(record)` | Validate/copy the v1 allowlist, commit an ordered transaction and prune known owner records to50 |
| `list(userScope,storageId)` | Query the authenticated owner index, validate records, filter the active mount; invalid known-v1 rows are discarded |
| `remove(userScope,id)` | Delete that exact local owner record; never calls a server API |
| `close()` | Drain pending operations and close the connection; permits a later open attempt |

Records contain schema version, local queue ID, stable authenticated **public user ID**, logical transferId (nullable for uncertain creation), create idempotency key, logical storage/parent IDs, original filename/size/MIME/lastModified, negotiated part size/count, created/expiry/update timestamps, last UI state and explicit pause/cancel intent. Unknown properties are stripped. No File, Blob, file contents, auth tokens/cookies, credentials, provider IDs, ETags or physical paths are stored. This implementation always uses original-file reselection; optional FileSystemFileHandle persistence/reuse is not implemented and no permission prompts are requested automatically.

The existing backend already returns a public user ID. `src/services/auth.js` now retains that allowlisted ID instead of discarding it; no server auth contract changed. Durable recovery never falls back to email, preventing a replacement account with the same email from inheriting old metadata. A valid public ID is required for multipart ownership; missing identity blocks multipart with Waiting for ownership. Small-file uploads keep their existing behavior. IndexedDB failure permits memory-only multipart while Web Locks and public identity remain available.

### Commit and retention policy

The queue attempts to commit the original key/metadata **before the first create request**, then commits the recovered logical transfer ID before scheduling parts. Session/progress/control states update metadata in order. Explicit cancellation intent is saved before its server control. A terminal deletion is serialized after earlier writes, so old writes in the same store instance cannot reinsert a completed/cancelled record.

Confirmed completed history is retained for **zero durable records**; the existing in-memory success display/auto-clear preference remains. Confirmed cancelled/expired records are removed. Inaccessible/unavailable records are retained for explicit reconciliation or local forgetting, not treated as successful or automatically expired. Provisional creation expiry is replaced by authoritative server expiry; persisted timestamps never substitute for server status. Each owner retains at most50 known valid v1 records across mounts, newest-update first; exceeding the bound forgets only local metadata, not server sessions. Other owners are not loaded or pruned by the current owner, future record/database versions are preserved, and no unknown app database/store is cleared.

Native transactions have bounded timeouts. Blocked/open/corrupt/unavailable APIs and quota failures show a safe queue notice and permit memory-only uploads. Open failure is latched until close/reload to avoid repeated blocked opens; a task stops repeated saves after persistence failure, while terminal cleanup is still attempted. Failed deletion is reported even after its UI row is removed, since metadata may reappear on reload. Recovery cannot be guaranteed when browser storage is disabled, full, evicted or cleared; no large payload fallback is attempted.

### Startup, checks and reselection

Recovery starts only after authenticated public identity and a confirmed active mount are available. Other assigned mounts load when selected; this phase does not add a global multi-storage Transfer Manager. Owner/mount/epoch guards ignore stale IDB and server responses, and duplicate local IDs, logical transfer IDs and pending create keys are suppressed. Restored checks use the existing bounded worker scheduler, with no source File and no automatic part upload.

For known transfer IDs, startup calls authoritative status/all verified receipt pages; it never POSTs create. Completed objects are recovered without completion/create replay; cancelled/expired sessions become terminal and local metadata is cleaned. Authentication failures expire auth; denied/missing/unavailable/disabled sessions remain actionable recovery errors with **Retry reconciliation**. No false success is inferred from a persisted UI state.

Unknown creation (`transferId:null`) is shown waiting for the original file without a startup POST. Only an explicit Resume/Cancel can replay the same immutable create key/body to resolve its identity; if the original request never reached the server this can create that intended session, while an existing session remains idempotent. Lost creation plus revoked permissions/disabled access may still prevent ID recovery; preserve uncertainty and existing backend cleanup boundaries.

**Select original file** checks exact name, size and lastModified when available, then validates authoritative geometry and SHA-256 of every server-acknowledged part through the Phase4.1 client. Metadata alone is not cryptographic proof. A mismatch does not change or cancel the server session and another file can be selected. Successful selection leaves the row locally paused; the user must explicitly press **Resume**. Resume refreshes status/receipts again and uploads only verified missing parts. Unuploaded bytes cannot be proven by metadata alone; no whole-file hash or payload persistence is introduced.

A persisted cancel intent never offers file selection or Resume: it checks server state and offers explicit cancellation retry if still pending. Pause/Cancel/retry retain the same key/session and the Phase4.2 semantics. No HTTP abort is treated as provider rollback.

### Hook/UI integration

`useUploadQueue` adds `recoveryScope`, `recoveryStorageId`, optional injectable `recoveryStore`, and returns `restoring`, `persistenceWarning`, `selectOriginalFile(id,file)`, `retryReconciliation(id)` and `clearLocalHistory()`. `useRemoteFilesState` passes authenticated public identity and its confirmed upload mount. `UploadQueue` exposes Restoring/Checking server, Waiting for original file, File mismatch, Retry reconciliation, Select original file and Clear local history with existing Buttons/cx/themes/accessibility.

Clear local history forgets inactive UI/IDB entries without cancelling server sessions. Active/pending workers are retained. Logout/account switch/workspace teardown abort local work and release File/controller references but preserve durable metadata for its original owner. The next login restores only that ID's records. Phase4.4 supplies same-origin multi-tab ownership as described below; automatic handle reuse, persistent file bytes, Download Manager and HTTP Range remain outside scope.


## Multi-tab ownership and network recovery (Phase4.4)

### Authority, takeover and fallback

`src/services/upload-coordination.js` implements native exclusive Web Locks. Locks are scoped by authenticated public user ID plus logical transfer ID; a second lock on the stable create idempotency key protects unknown-create recovery before that ID exists. The queue acquires the transfer lock before any part/control/finalization work. A nonblocking probe discovers contention, then an abortable queued request waits for normal release. Locks are never stolen. BroadcastChannel is not used: notifications are unnecessary for lock handoff and would not establish authority. No timestamp/localStorage/IndexedDB lease is treated as a mutex. Lock acquisition/release uses the [W3C Web Locks contract](https://www.w3.org/TR/web-locks/), including separate ifAvailable probes and abortable queued requests.

The safe fallback when Web Locks or authenticated public identity is unavailable is **fail closed**: `waiting_ownership` / **Waiting for ownership**, with a clear explanation and no multipart API calls. Small-file uploads continue through their existing path. A lock API rejection also blocks safely; no weaker fallback silently enables writes.

`other_tab` / **Active in another tab** means another context holds the authority. Web Locks releases on context destruction, allowing a queued tab to acquire without polling. A frozen but still-live holder is not timed out or forcibly evicted. After acquisition, startup with no File checks authoritative receipt pages only and requires original-file reselection plus explicit Resume; an in-memory active transfer reconciles all receipts/source digests before scheduling more parts. A server-side orphaned operation may still hold its lease after tab closure: existing version/CAS checks and lease fencing remain required, and busy/version errors stay bounded.

Ownership is retained until local operations and queued persistence settle, then released on success, confirmed cancellation, pause/error/offline wait, or lifecycle teardown. Account/logout/unmount aborts pending lock requests and local HTTP, invalidates epochs and releases File references; it never DELETEs the server session. A late response cannot update a disposed task or emit completion. Closing an entire browser context is handled by the native lock lifecycle, not a heartbeat deadline. Completed callbacks remain once per local task; separate tabs may independently discover the same already-completed logical object, but do not POST completion again.

Five named Web Locks bound multipart workers across **all cooperating tabs/owners on the same origin** to5. Per-queue1/2/3/5 preferences still apply within that ceiling. This budget includes hashing, requests, controls and retry waits. Waiting for another tab consumes a local queue slot conservatively; it does not send backend requests. Locks do not coordinate different browsers/devices, isolated storage partitions or old bundles; server authorization/version/lease checks remain the final boundary.

### Offline and bounded reconnection

The workspace listens for `offline`/`online`, unregistering both on teardown. Offline stops new multipart operations, aborts current local requests/backoff, retains acknowledged counters, File and original identity, and displays `waiting_network` / **Waiting for network**. The transport also checks `navigator.onLine === false` before each request; true merely permits a probe and never proves backend connectivity. Legacy small-file behavior is preserved.

Online schedules `recovering_connection` / **Recovering connection** with jitter before reconciling the same session. Only an upload active before interruption can automatically continue sending parts. Work first queued while already offline becomes Resume available on reconnect and cannot create a session until explicit Resume. User-paused transfers stay paused; pending Pause/Cancel retain their original control intent and cannot become Resume. Reloaded transfers have no original File and always require reselection. Expired/authentication/permission/capability/validation failures cannot automatically restart. An online event racing abort settlement is rechecked after worker cleanup so it cannot strand a transfer indefinitely.

Offline reconnections and ordinary transient failures share **two automatic retry attempts per task**, until explicit Retry/Resume resets the budget. Repeated online events cannot reset it or enqueue duplicate work. Defaults use exponential1s/2s bases with50–150% jitter; waits are abortable. Timeout, offline, rate limit, provider unavailable, authentication and permission errors have distinct codes/policies. After exhaustion, show **Retry connection** for an explicit same-session retry. The global Web Locks worker ceiling and staggered recovery bound reconnect traffic across tabs.

The multipart error exposes `retryAfterMs` from valid Retry-After seconds/date values. The low-level client suppresses immediate uncertain-write status requests during that cooldown. The queue retains the deadline across replacement clients/manual Retry and waits at least the supplied delay. Delays over5 minutes disable automatic replay instead of shortening the server's delay; early manual retries remain blocked until within the bounded wait window or the deadline has passed. No server session is recreated to recover known identities. Uncertain part/control/completion results continue through authoritative status/receipts and existing version fencing.

### UI and validation boundary

Queue states add Waiting for network, Recovering connection, Active in another tab, Waiting for ownership, Resume available and Retry connection without a Transfer Manager redesign. Shared Button/cx/theme tokens, wrapping mobile controls, semantic acknowledged progress and reduced motion remain. The v1 IndexedDB primitive allowlist/schema is unchanged except for accepted UI state strings; no bytes, credentials or owner tokens are added.

Automated tests exercise shared lock authority, contention/release/abort, absent locks/identity, takeover with late old responses, account/lifecycle guards, offline parts, online reconciliation, explicit Pause/Cancel, missing File/expired sessions, permissions/authentication, retry exhaustion/jitter and Retry-After cooldown. Protocol doubles and mocked HTTP are not real provider acceptance; see PROJECT_HANDOFF.md for native Chrome evidence and untested platforms.

## Upload Queue integration (Phase4.2)

- `src/utils/upload-strategy.js` selects legacy upload for files at/below the effective small-file limit (advertised limit clamped to the existing25MiB maximum;25MiB fallback). Larger files use multipart only with explicit compatible capability:8MiB parts,1 parallel part/session, safe positive limits, <=10GiB, <=1280 parts and consistent geometry. Missing/disabled/malformed capability or excessive file size fails locally. Multipart failure never falls back to `/files`.
- `src/hooks/useUploadQueue.js` retains File, AbortController, immutable create key/metadata, transfer ID and client in refs/tasks, not React state. Display state contains safe queue metadata only. Existing preferences1/2/3/5 (fallback3) cap active file workers, including hashing, requests, backoff and controls. Each worker awaits each operation; multipart sessions can run concurrently, with one local operation/session. Lowering concurrency lets existing workers settle before starting more.
- `useRemoteFilesState` supplies authenticated owner/mount scope, current upload policy, negotiated capability and existing completion/cache-refresh callbacks. Transient storage discovery retains the last confirmed mount for existing work so ordinary navigation does not erase the queue; a resolved mount change, unavailable assignment, auth change or workspace destruction aborts and discards that scope. Current backend authorization remains authoritative on every request. Known permission/readOnly/maintenance denial stops new upload writes; creator cancellation stays available.
- `AuthProvider.signingOut` stops queue requests at logout initiation, before a slow logout request returns. A failed logout leaves the account UI available for retry; Phase4.3 restores retained metadata but requires original-file reselection. Epoch/mount/owner/task guards discard stale results and callbacks, including transports that ignore AbortSignal. Logout/unmount/assignment changes never issue automatic server cancellation.

### Queue hook contract

`useUploadQueue({uploadFile,onComplete,onUnauthorized,canUpload,scopeKey,maxConcurrency,autoClear,recoveryScope,recoveryStorageId})` extends the existing hook. `scopeKey` identifies the authenticated owner and resolved mount; `canUpload(storageId)` supplies the current write policy. `createClient` and `waitForRetry` are injectable for focused tests. Consumers enqueue with `addFiles(files,{storageId,parentId,maxUploadBytes,transfers})`, which returns queue IDs. Items expose `strategy`, `status`, `acknowledgedBytes`, `completedParts`, `partCount`, safe `error`, `errorCode`, `retryable` and `pendingAction`, without source/session secrets.

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

The queue uses Phase4.1 clients with `maxRetries:0` and owns a total budget of two automatic retries after the initial attempt, with1s exponential50–150% jitter (1s/2s bases within this budget). The client still reconciles uncertain writes before returning. Queue retry waits, then reconciles/reuses the same session/key. Explicit Pause/Cancel interrupts retry waits and has no automatic control replay; ambiguous control failures require explicit Retry pause/cancel. The queue never labels an uncertain cancel as cancelled. Cancellation racing completed publication recovers the confirmed object as success instead. Completed callbacks are emitted once per task, including after a lost completion response.

Transient network/timeout/provider/rate/version/ambiguous-complete errors are retryable. Authentication errors stop the whole queue and expire auth; permission/capability/validation/checksum errors never automatically retry. Expiration has a separate terminal label. Rejected grant/maintenance messages direct users to check storage access. Recoverable errors retain their File/key/session for explicit retry; no session metadata crosses authenticated scopes.

### Progress and presentation

Multipart progress uses all server-verified receipt pages and acknowledged bytes after each part, initial reconciliation and confirmed pause. Dispatching/hashing bytes does not increment progress. Verifying, retry_wait, reconciling, pausing/resuming/cancelling and finalizing are separate statuses. Display percentage is capped at99 until the server confirms completed, even when every byte is acknowledged; the row then says awaiting finalization. Count/byte updates occur at operation boundaries, not per network chunk. Legacy uploads retain indeterminate progress and have no Pause/Resume controls. Shared Button/cx/theme tokens,44px action targets, semantic progressbar labels and reduced-motion behavior are preserved.

### Lifecycle and remaining limitations

Phase4.3 adds metadata-only IndexedDB recovery and original-file reselection. Phase4.4 adds Web Locks ownership and automatic network recovery; background workers remain absent. Reload/logout/assignment change/workspace teardown release in-memory File references; durable keys/IDs stay owner-scoped and server sessions retain their existing TTL/operator cleanup. Clear finished explicitly discards failed-task recovery metadata without cancelling the server. Cancel first if cleanup is required. If create outcome is unknown and permission/feature access is revoked before its logical transfer ID can be recovered, cancellation cannot be confirmed from this client; show uncertainty and rely on authorized recovery or existing backend TTL cleanup. No new backend contract was introduced to bypass that boundary.

HTTP abort is local only: provider work may still finish or hold a lease. An immediate control can therefore return conflict/busy and require explicit retry. Backend completion/cleanup restrictions still apply. Paused/failed workers release queue slots; control requests re-enter the same bounded scheduler. Same-origin tabs running this implementation coordinate through Web Locks. Different browsers/devices, storage partitions and older uncoordinated clients still rely on server version checks and lease fencing. File bytes, server flags, credentials and remote data are never persisted or changed by this integration.

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

Every session method takes `transferId` as its first argument. The client rejects concurrent operations on the same session with `SESSION_BUSY` (including reads), matching the backend single-operation constraint; the low-level client alone does not coordinate tabs; use the queue/ownership wrapper in Phase4.4. No background loop is started. Pause/cancel should be scheduled after the current operation settles; aborting HTTP does not prove provider rollback.

Options: `fetchImpl`, `cryptoImpl`, lifetime `signal`, `timeoutMs` (285000, slightly above backend270s), `maxRetries` (default2, maximum5), and testable `sleep(ms, signal)` / `random`. Retry backoff is capped at10s with exponential growth and50–100% jitter. Transport uses same-origin cookies and `{data}` / `{error}` envelopes. No credentials/provider IDs/physical paths are accepted or returned. The server remains the feature/permission authority; Phase4.2 must also gate entry on normalized capabilities.

## Reconciliation and memory boundary

Server receipts are authoritative, never local counters. Every page is checked for ordered unique part numbers, exact lengths, base64 digests, advancing cursor, stable snapshot and total acknowledged bytes. Inconsistent or incomplete snapshots fail closed; caller may explicitly reconcile again. Missing receipts with consistent counters require retransmission of identical source bytes. No unverified provider parts are skipped. A changed/reselected file must pass every acknowledged digest before upload continues; matching name/size alone is insufficient.

Only a negotiated part (at most8MiB under the current contract) is materialized for Web Crypto, sequentially. Source reads use `Blob.slice(start,end)`; no whole-file `arrayBuffer`, byte cache or Promise.all hashing. Blob/File digest results alone are cached by immutable source identity and range in a WeakMap to avoid quadratic rehashing across part calls; every call still refetches and validates authoritative receipts. Custom slice sources are not cached. This is O(part-size) byte memory plus O(part-count) metadata, not a measured browser RSS guarantee. Web Crypto cannot abort an in-flight digest; lifecycle cancellation is checked before subsequent network work.

## Errors and safe recovery

Stable `.code` values include `NETWORK_INTERRUPTION`, `REQUEST_TIMEOUT`, `AUTHENTICATION_FAILURE`, `PERMISSION_REVOKED`, `SESSION_EXPIRED`, `VERSION_CONFLICT`, `CHECKSUM_MISMATCH`, `PROVIDER_UNAVAILABLE`, `RATE_LIMITED`, `AMBIGUOUS_COMPLETION`. Additional terminal codes: `SESSION_UNAVAILABLE`, `VALIDATION_FAILURE`, `INVALID_INPUT`, `INVALID_RESPONSE`, `FILE_MISMATCH`, `RECEIPT_CONFLICT`, `SESSION_CANCELLED`, `SESSION_NOT_ACTIVE`, `SESSION_BUSY`, `ABORTED`.

Only transient reads retry directly. Uncertain part/transition writes (including malformed success responses) reconcile first; create can only replay the exact retained key/body because no transfer ID may be known yet. Authentication, permission, checksum and validation errors never retry automatically. A409 triggers a fresh version/status, not blind reuse. Completion uncertainty must retain the transfer ID; do not start another upload. Cancellation after revoked status may require an explicit cleanup retry by the user.

## Remaining work after Phase4.5

1. Global upload Transfer Manager presentation is implemented. Same-origin Web Locks coordination and durable metadata/reselection are implemented; optional file-handle reuse and global multi-storage transfer UI remain deferred. Keep small-file fallback and explicit capabilities.
2. Expand browser lifecycle/mobile/offline/permission/late-provider-effect testing and isolated real Garage acceptance, including10GiB, memory and proxy budgets. Current mocked browser checks are not provider acceptance.
3. Keep default flags off until infrastructure gates pass and an operator authorizes activation; Range Download remains a separate phase.

## Validation boundary

Focused unit tests mock same-origin transport, covering create idempotency, SHA-256/headers/boundaries, pagination>100, verified resume, missing/conflicting receipts, stale versions, lost part/complete/cancel responses, terminal states/auth, invalid snapshots, timeout/abort/locking, retry budgets and bounded sequential source reads. These are not real Garage or10GiB verification. See PROJECT_HANDOFF.md for executed suite totals and [backend contract](LARGE_FILE_TRANSFER_BACKEND.md) / [acceptance report](LARGE_FILE_TRANSFER_ACCEPTANCE.md) for outstanding infrastructure gates. Phase4.2 adds queue/UI/lifecycle tests and mocked Chrome checks for26MiB multipart, Pause/Resume/Cancel,3-byte legacy routing and disabled capabilities. Phase4.3 adds native IndexedDB CRUD/schema/retention/failure tests, durable recovery/reselection hook tests (including real SHA-256 with mocked transport), and real IndexedDB/refresh/reopen browser assertions. No Range download or Shared Storage changes were made. Exact executed totals, browser environment, skips and limitations are recorded in PROJECT_HANDOFF.md.


## Unified Transfer Manager (Phase4.5)

Header → Transfers opens a responsive Base UI dialog on every authenticated route. It consumes the existing RemoteFilesContext upload queue: exactly one hook/owner remains in FilesProvider. File Browser no longer renders UploadQueue inline. Closing/unmounting dialog content does not touch the engine; route changes preserve the owner. Existing signingOut/auth/public-ID/mount epoch teardown and IndexedDB/Web Locks recovery remain authoritative. Storage switching still aborts and discards in-memory scope without cancelling server sessions; select the original mount to restore its durable records. This phase does not introduce simultaneous multi-mount uploads.

Uploads render filename/size, all existing states, verified bytes/parts, capped percentage and supported actions. Pause all/Resume all dispatch existing per-item methods to supported multipart states only. Clear finished retains the existing behavior (including forgetting inactive failed recovery metadata); Clear local history never cancels server sessions. The Header count is nonterminal work, including waiting and paused, with an attention label/dot for recovery errors/reselection/ownership issues.

The queue samples positive acknowledgement deltas over at least1 second within uninterrupted uploading, excluding status/recovery jumps. Speed/ETA reset when leaving uploading; absent measurements render no estimate. ETA covers remaining acknowledged bytes, excludes server finalization and is approximate, not instantaneous wire throughput. Legacy small uploads remain indeterminate. Only confirmed success displays100%. No protocol, Web Locks, IndexedDB schema or Shared Storage API rewrite.

The uploads container is an explicit composition boundary for a future real Downloads section. No Download tab, dummy queue or fake progress exists; Phase5/Range remain separate. Keyboard opening/Escape/focus return, multiple rows, supported bulk dispatch, recovery, completion cap and workspace teardown have automated coverage alongside existing lifecycle suites. Desktop/mobile mocked browser results and exact validation are recorded in PROJECT_HANDOFF.md. Production flags remain unchanged.


## Phase5.2 download integration

The global panel now includes Downloads backed by a separate, React-independent streaming disk service and one workspace hook. Upload protocol, IndexedDB, Web Locks, retries, source File ownership, preferences and acknowledgement progress remain unchanged. Download concurrency defaults2 and is independently configurable1/2/3/5 for the current scope; it does not write upload preferences. Download pause retains only the active-page native temporary writer; unload/logout/mount switch discard it. There is no durable download recovery yet. See [download guide](LARGE_FILE_TRANSFER_DOWNLOAD.md) for version/Range/disk validation, native fallback, browser evidence and remaining provider/platform/OS picker acceptance.
