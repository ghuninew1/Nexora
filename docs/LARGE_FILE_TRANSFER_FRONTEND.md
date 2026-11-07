# Large file transfer — frontend client

Phase **4.1 COMPLETE locally** (2026-11-07). Phase 4 overall remains incomplete: Upload Queue integration, Transfer Manager, persistence, browser and real-provider acceptance are pending. Server feature flags remain disabled by default; no production activation is implied.

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

## Phase4.2 required integration

1. Own the client and AbortController at authenticated workspace scope; abort and discard clients, keys, source references and digest metadata on logout, expiry/account change/unmount. Gate multipart on explicit capabilities, retain the current small-file API and queue fallback.
2. Serialize operations per transfer across UI actions and tabs. Await in-flight work before pause/cancel; reconcile after interruption, visibility/network recovery and before resuming. Never infer rollback from HTTP cancellation.
3. Retain key plus immutable metadata before create and logical transfer ID once known. Durable account-scoped persistence/reselection is a separately reviewed step; this phase adds no IndexedDB or handles. Never persist provider fields or file bytes by default.
4. Use authoritative acknowledged bytes for progress, not bytes sliced/hashed/dispatched. Refresh status to update counters after successful part receipt. Handle completed result from any recovery path and invalidate destination listing only once the object is confirmed.
5. Show explicit auth/permission/expiry/conflict/ambiguous-complete states. Offer safe manual recovery without creating duplicate sessions. Test browser lifecycle, mobile, cross-tab coordination, reselect and real-provider interruption before enabling.

## Validation boundary

Focused unit tests mock same-origin transport, covering create idempotency, SHA-256/headers/boundaries, pagination>100, verified resume, missing/conflicting receipts, stale versions, lost part/complete/cancel responses, terminal states/auth, invalid snapshots, timeout/abort/locking, retry budgets and bounded sequential source reads. These are not real Garage or10GiB verification. See PROJECT_HANDOFF.md for executed suite totals and [backend contract](LARGE_FILE_TRANSFER_BACKEND.md) / [acceptance report](LARGE_FILE_TRANSFER_ACCEPTANCE.md) for outstanding infrastructure gates. No UI, IndexedDB, Range download or Shared Storage changes were made.
