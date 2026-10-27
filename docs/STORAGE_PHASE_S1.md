# Shared Storage — Phase S1

Implementation lives in the separate `issuedesk/garage/storage/` checkout. This report records local source work; Nexora remains frontend/demo-only.

Source implementation: 2026-10-27. Local validation only; no deployment or remote verification.

## Re-audit and flow

Before edits both Nexora and IssueDesk checkouts were clean. Read current service source, root instructions/scripts, service package/Dockerfile, authentication/schema, IssueDesk Storage proxy and Nexora Phase 7 design inputs. Service had only `start`/`dev`, no tests, Hono 4 + Node adapter, AWS SDK v3 and better-sqlite3. No dependency version was changed.

Before: `index.js` routed directly to SQLite/S3. v2 list checks active app-owned project then lists SQLite metadata. Upload checks project, buffers multipart file, creates distinct file/object UUIDs, PutObject, then inserts SQLite; insert failure attempts object cleanup. Download/delete join file + project + app before reading/deleting Garage. Delete removes Garage object before SQLite metadata. These ordering/ownership checks remain.

After: `index.js` wires production DB/S3 and starts server; `app.js` is an injectable app factory. Routes preserve auth, project/file SQL and serializers; object operations call Storage Manager → provider registry → Garage Provider → AWS SDK. v2 list still reads authoritative SQLite metadata, rather than listing a bucket (which would bypass project metadata). Provider `list`/`stat` are internal physical inventory operations, not public logical file APIs. SQL/schema and `app-auth.js` are unchanged. No IssueDesk identity is hard-coded into the new boundary.

## Files

- `src/index.js`: production wiring, bounded timeout, `maxAttempts: 1` to avoid automatic mutation retry.
- `src/app.js`: extracted existing routes; provider calls and streaming binary responses.
- `src/storage/manager.js`: operation dispatch, capability guards and normalized errors.
- `src/storage/providers/index.js`: Garage-only registry, unknown provider fails closed.
- `src/storage/providers/garage.js`: SDK commands, normalized internal metadata/streams, deadline/cancellation.
- `src/storage/capabilities.js`, `errors.js`, `validation.js`: support flags, stable codes, trusted refs and safe response header encoding.
- `tests/storage.test.js`, `tests/disconnect.test.js`, `package.json`: `pnpm test`, isolated SQLite and fake S3 tests, real loopback Node adapter disconnect test.
- `.env.example`: optional provider timeout; no production secret/config changes.
- `.gitignore`: narrow exceptions ensure service regression tests are included despite the existing `test*` ignore.
- Repository README/AGENTS/handoff and this report document resulting scope.

## Compatibility and security

Existing `/v2/projects/:projectId/files` GET/POST and `/:fileId` GET/DELETE remain; multipart `file`, JSON field names, status/error messages, attachment behavior, ordering, app credentials and ownership checks remain. Cloudflare Access remains an external ingress requirement, not a new in-process validator; its deployed policy was not checked or modified. Existing legacy API is still disabled by default; its opt-in routes use the provider without removing the old physical-key response contract. New v2 serializers never expose bucket, endpoint, object key or credentials.

Malformed v2 IDs still safely query with bound SQL and return 404; stricter UUID rejection would change the existing status contract, so it was not added. Stored original names remain unchanged; attachment header encoding now percent-encodes RFC 5987 apostrophe/parenthesis/star characters and safely handles malformed Unicode. CR/LF/control or invalid MIME header values fall back to `application/octet-stream`; valid media types including parameters remain supported. Existing `nosniff` and private/no-store download headers remain. Provider exceptions are normalized; SQLite/provider errors are never echoed into public JSON. Service logs remain operator-only and must not be exposed to callers.

File/request limits remain default 25 MiB + 1 MiB multipart overhead, with configurable file ceiling. Upload multipart parsing/buffering occurs within existing bodyLimit. No new MIME sniffing, filename persistence normalization, origin policy, CORS, schemas or credentials were introduced; behavior changes to stored names would require separate compatibility review.

## Actual capabilities

True: `list`, `stat`, `upload`, `download`, `permanentDelete`.
False: `preview`, `createFolder`, `rename`, `move`, `copy`, `trash`, `restore`, `share`, `rangeRead`, `readOnly`.

Flags describe feature support only and never replace authorization. Registry contains only Garage. Unsupported operations fail internally with `CAPABILITY_UNAVAILABLE`; there is no new capabilities HTTP endpoint or SMB implementation. Provider refs are trusted server-resolved inputs and remain distinct from public file IDs. Internal errors include INVALID_INPUT, NOT_FOUND, CAPABILITY_UNAVAILABLE, NAME_CONFLICT, UPLOAD_TOO_LARGE, PROVIDER_UNAVAILABLE, TRANSFER_INCOMPLETE and INTERNAL_ERROR; declaring a code does not imply the associated feature exists.

## Streaming, deadlines and remaining limitations

Downloads use SDK Node/Web Readable bodies with bounded buffering; no `transformToByteArray()` remains. The wrapper counts bytes and detects advertised-length mismatch, cancels the source on client cancellation, request abort or total provider deadline, and removes timers/listeners on success/failure/cancel. `STORAGE_PROVIDER_TIMEOUT_MS` defaults to 60000, must be a positive safe integer, and covers SDK request plus download body lifetime. A slow transfer exceeding the deadline fails. Once response headers have been sent, failure terminates/errors the stream rather than changing to a JSON error status; HTTP consumers must detect incomplete content. Loopback test verifies real Node adapter disconnect propagation. Actual Garage/proxy behavior still requires deployment QA.

Upload is **buffered**, not streaming: `formData()` → `arrayBuffer()` → `Buffer.from(fullFile)` remains in both legacy/v2 routes. Hono's existing form parser materializes the multipart file; a true streaming multipart ingestion path needs parser/protocol review. The provider accepts an SDK-compatible body (including a Node readable with known size), but S1 does not add multipart-S3, resumable protocol or new parser dependencies. The timeout bounds provider calls, not client multipart parsing or synchronous SQLite operations. Cleanup after failed SQLite insert uses a fresh bounded call even if caller signal is already aborted.

Remaining: SQLite/object writes are not atomic; compensation may fail, delete may leave metadata after an object is removed, and interrupted upload may leave an object. No idempotency/reconciliation worker, quotas, pagination for v2 metadata, range reads, folder lifecycle or user-level Nexora ownership exists. No production credential, data, Access policy, SMB connection, Nexora backend, D1 migration or deployment was created.

## Validation

- Temporary workspace dependency install with `pnpm install --lockfile=false --ignore-scripts`, existing version ranges unchanged. Resolved AWS SDK 3.1156.0, Hono 4.13.14, Node adapter 2.1.5, better-sqlite3 13.0.3 on Node 26.12.1. Offline install lacked metadata; sandbox network lookup failed; approved network retry succeeded. No service lockfile existed; none was added.
- `pnpm test` in isolated temporary service workspace: **12/12 passed**, real SQLite `:memory:` with production schema, fake S3 (no Garage calls), plus loopback HTTP disconnect. Loopback needed sandbox escalation. Covers v2 lifecycle, invalid credential, wrong/foreign project and same-app wrong file relation, malformed IDs, multipart/empty/file/request limits, provider error redaction, missing object, insert compensation, registry/capabilities/SDK mapping, streaming first chunk, cancellation/abort/deadline/truncation/source failure, safe headers and timer cleanup.
- `pnpm test` rerun from the actual Shared Storage checkout using a temporary dependency link (removed afterward): **12/12 passed**, including the final MIME newline guard.
- IssueDesk root `pnpm lint` passed; both checkouts `git diff --check` passed. `node --check garage/storage/src/index.js` passed.
- Production Node 22 Docker image, real Garage, Cloudflare Access and IssueDesk end-to-end paths have not been exercised. Frontend build is not meaningful for this service-only change.

## Phase S2 handoff

This is the S1 completion snapshot. S2 has since been implemented locally; see `PHASE_S2.md` in the Shared Storage checkout and `docs/STORAGE_PHASE_S2.md` in Nexora. Phase S2 does not start Nexora Phase 8.
