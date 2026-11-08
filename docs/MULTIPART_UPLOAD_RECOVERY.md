# Multipart interruption and manual retry recovery

A subsequent production failure supplied explicit Cloudflare1102 evidence. The next investigation confirmed Nexora Pages CPU-limit errors and added native streaming, fewer status reads and manual-only resource-error recovery. See [resource-limit report](UPLOAD_RESOURCE_LIMIT.md); this document's original interruption remains historical.

## Findings and evidence boundary (2026-11-08)

The reported production failure was `garage 2.zip`, 182.7 MB as displayed by the UI, at 56%, 13/23 parts and 104.0 MB verified. These counters do **not** identify a failed request: the next PUT, receipt/status GET, reconciliation or another operation could fail while the last verified counter remains 13. `PROVIDER_UNAVAILABLE` covers several 5xx/transport failures and is not proof of a Garage outage.

The current production Chrome session was inspected read-only: `garage 2.zip` was present in the file list and Transfer Manager was empty. The operator then confirmed the upload succeeded later. The original failed request/body/status/request ID/timestamp and File reference were no longer available. No production Retry/upload, reload, mutation, service restart, migration, deployment, DB read, cleanup or environment change was initiated for this investigation. Historical Shared/Garage host logs were not accessible through a configured connection; no claim of correlating those original logs is made. Production object checksums were not measured.

**Confirmed source bug, reproduced before the fix:** `run()` publishes `status:error` while its owning worker can still be awaiting `task.persistenceTail` and releasing its Web Locks. `retryUpload()` resets `retryAttempts` (this already existed), changes the task to `reconciling`, then calls `enqueue()`. The original `enqueue()` silently rejected an active task. When the old worker finally released its active slot, there was no pending task and no further request. A deterministic test holding the error persistence promise failed on the old code with `Expected success / Received reconciling`; it passes after the fix. Resume/recovery controls can reach the same teardown window.

This bug explains a reproducible nonfunctional Retry path, but the vanished production event cannot be conclusively attributed to that race. The production interruption at part count 13 remains unverified. Do not describe the synthetic 503 below as a captured production response.

## Focused changes

- `src/hooks/useUploadQueue.js`: retain an enqueue intent during active worker teardown; enqueue exactly once after persistence/locks release. Rapid retry clicks do not schedule duplicate work. Epoch, auth, permission and cancellation guards remain; cancel or unmount wins over pending retry. Explicit normal Retry also requests resume if the server reports a valid paused session. Existing retry-budget reset and Retry-After deadlines remain. File/session identity and acknowledged counters are preserved.
- `src/services/multipart-upload.js`: continue reconciling receipts/source checksums before missing-part writes, including a lost acknowledgement. `NAME_CONFLICT` is permanent rather than a retried version conflict. HTTP/network errors now retain bounded safe diagnostics; a failed PUT and failed reconciliation retain two records. Ambiguous completion retains failed POST/status evidence and cooldown metadata. No new file-size, part geometry or concurrency policy.
- `src/components/files/UploadQueue.jsx`: collapsed **Upload diagnostics** details on failed rows using existing styling/cx. Diagnostics clear on success and workspace disposal; they are not persisted to IndexedDB. No File/controller/key enters React state.
- `functions/_lib/storage-client.js`, `functions/_lib/upload-sessions.js`: validate/forward the non-sensitive `X-Upload-Request-ID` correlation UUID to Shared, and emit safe `[upload-upstream]` failure lines with timestamp, stage, method, part, normalized response status, actual upstream HTTP status and failure kind (`http-error`, `fetch-error`, `timeout`, `invalid-response`). Credential values, IDs/provider references, URLs, raw headers/bodies and bytes are excluded. The header does not affect authorization or idempotency. Shared/Garage do not automatically log this header in current source; correlation beyond Nexora requires existing private proxy/service logs or separate reviewed instrumentation.

The file maximum remains **5,000,000,000 bytes**, the part size **8,388,608 bytes (8 MiB)**, and active file concurrency **one per browser tab**. No provider/service code or dependency changed. Existing session schema, IndexedDB version, cleanup scheduling and backend authorization are unchanged.

## Actionable diagnostics after deployment

Expand **Upload diagnostics** before reloading or clearing a failed row. The fields mean:

| Field | Meaning |
| --- | --- |
| `timestamp` | UTC time when the client observed the failure, ISO8601 with `Z` |
| `requestId` | Random UUID for this browser HTTP request, sent as `X-Upload-Request-ID` |
| `method`, `endpoint`, `partNumber` | Exact method/route pattern and part, with logical IDs intentionally replaced by placeholders |
| `stage` | `part-upload`, `reconciliation`, `verification`, `session-status`, `create`, `pause`, `resume`, `complete`, `cancel`, or local validation |
| `status`, `code` | HTTP status observed by the browser and safe classified code; status 0 means no HTTP response was received |
| `responseBody` | Allowlisted JSON error code only, or `{ "format": "non-json" }`; raw messages/HTML/other fields are deliberately omitted |
| `rayId` | Validated Cloudflare Ray ID, when present; not an auth token |
| `previousFailure` | At most one preceding failed request when recovery itself failed |
| `originalFileAvailable` | Whether this queue still holds the original File, excluding terminal/rejected-source states |
| `lastConfirmedSessionState` | Last successful status/create observation; not a current existence guarantee after a failing GET |

For source/lifecycle validation without a failed HTTP request, diagnostics report `local-validation` without inventing an endpoint/request ID. The UI progress represents server receipts, not bytes dispatched. A timeout after server acceptance can leave the progress counter behind until reconciliation completes.

For a future authorized real test, read Nexora's safe failure lines with:

```bash
pnpm exec wrangler pages deployment tail --project-name nexora --environment production --search '[upload-upstream]' --format pretty | rg '\[upload-upstream\]'
```

This is a live tail, not historical retrieval. Stop it with Ctrl+C after the test. Match `request=<UUID>` from the UI, then use the UTC timestamp and actual `upstreamStatus` to distinguish provider HTTP rejection from Pages→Shared fetch/timeout/response-format failure. Browser status can be normalized (for example upstream 504 becoming an availability response); the server line retains the upstream status. Keep full request metadata/credentials out of shared reports.

On the verified Shared host, bounded private log inspection commands are:

```bash
# Replace both UTC bounds with the diagnostic time window; read only.
docker compose logs --no-color --since '<start-UTC-ISO8601>' --until '<end-UTC-ISO8601>' storage-api garage

# Effective non-secret runtime settings only; no full env/inspect dump.
docker compose exec -T storage-api node --input-type=module -e 'console.log(JSON.stringify({resumableEnabled:process.env.STORAGE_RESUMABLE_UPLOADS_ENABLED === "true",providerTimeoutMs:Number(process.env.STORAGE_PROVIDER_TIMEOUT_MS || 60000)}))'
```

These commands were not run against production. Review logs privately and extract only safe error type/status/time/request correlation. Current Shared upload routes normalize exceptions to generic responses, so missing logs cannot establish a root cause. Do not increase timeouts, restart services or change Garage limits speculatively.

Source-derived timeout/cleanup policy is: browser request 285 seconds; Nexora upload-session upstream deadline 270 seconds; Shared operation 240 seconds; provider command timeout defaults to 60 seconds; session TTL seven days; operation lease 15 minutes. Shared sweeps at startup and hourly, at most 20 sessions, retaining active/unexpired sessions and retrying durable cleanup intent. These are source defaults, not verified live settings. A 13-part boundary is not configured in this policy.

## Existing interrupted sessions and deployment

No production configuration change or migration is required by this patch. Review and deploy Nexora using the existing command:

```bash
pnpm deploy
```

A still-valid interrupted session can resume if the owner/assignment/capability remain authorized and recovery metadata still exists. In the same live page, Retry retains its File and reconciles the same transfer. Loading the new bundle requires reload, which releases that File; keep local recovery metadata, then select the original file and explicitly Resume. The source digests must match existing receipts. Clear finished/local history removes local recovery metadata, so do not clear an interrupted entry you intend to recover. Expired, cancelled, denied or missing sessions fail safely; completed sessions are discovered as completed, not recreated. The operator's already-completed upload needs no recovery action.

This task does not authorize a production test that writes bytes. After deployment, an explicitly authorized real test should confirm end-to-end completion/download checksum and inspect new diagnostics if the failure recurs. No infrastructure change is currently justified by evidence.

## Validation

The flow under test is: My Files → 182.7 MiB multipart upload → fail part 14 after 13 acknowledged parts → exhaust automatic retries → Retry connection → reconcile same session → send missing parts → completed object.

- Before-fix race regression: **FAIL as expected**, stuck `reconciling` while delayed persistence released; same test passes with the fix.
- Focused tests cover temporary 503 PUT, accepted-then-timeout receipt recovery without second PUT, manual retry budget reset, 13/23 receipt recovery without resending parts 1–13, duplicate clicks, remote pause/resume, terminal expiry, cancellation/unmount during pending retry, permanent conflicts, diagnostic sanitization/correlation and ambiguous completion.
- Browser plugin unavailable; existing cached Playwright/Chrome used with a separate temporary profile at `http://127.0.0.1:5184/files`, 1280×900 and 390×844. The real client sliced/hashed a synthetic191,574,836-byte file (displayed182.7 MB) into23 parts. Mocked same-origin API returned503 for part14 three times; diagnostics showed PUT/part14/503/code/request ID/time, File available and last-confirmed active state. Manual Retry completed the same session. Part17 was accepted and its response deliberately lost; reconciliation found its checksum receipt and no second PUT occurred. Parts1–13 each sent once; part14 four attempts total; all other parts once; one create/complete. Native IndexedDB recovery metadata count returned0 after completion. No app/page errors or overlay;4 expected console network errors from injected503/timeouts; no other warnings/errors. Mobile page/dialog had no horizontal overflow. Screenshots visually inspected.
- Synthetic API faults are not evidence about production's original failure. Actual Shared bridge tests mock S3 and do not verify real Garage or host logs.
- All task-created browser/server processes closed in `finally` and the large temporary file was deleted. No 10 GiB, stress/load, real production retry/upload, migration, deploy, service restart, environment/secret change, commit or push.


| Required check | Final result |
| --- | --- |
| `pnpm lint` | **PASS** |
| `NEXORA_SHARED_STORAGE_ROOT=/Users/ghuninew/GitHub/issuedesk/garage/storage NEXORA_ACCEPTANCE_TEST_DEPENDENCIES=/Users/ghuninew/GitHub/issuedesk/garage/storage pnpm test` | **PASS237 Node +97 UI**, zero failures/skips; real Shared bridge with mocked S3 |
| `pnpm build` | **PASS** |
| `git diff --check` and final diff review | **PASS** |
| Browser target flow and diagnostics/receipt cleanup | **PASS** with mocked same-origin API; production failures not reproduced |
| Historical Shared/Garage runtime logs and original production HTTP failure | **NOT VERIFIED**; original failed row/request no longer present and no host log connection |

Evidence outside Git: `/private/tmp/nexora-retry-before.log` (expected before-fix failure), `/private/tmp/nexora-retry-tests-final.log`, `/private/tmp/nexora-retry-lint-final.log`, `/private/tmp/nexora-retry-build-final.log`, `/private/tmp/nexora-retry-browser.log`, `/private/tmp/nexora-retry-diagnostics.png`, `/private/tmp/nexora-retry-mobile.png`, `/private/tmp/nexora-retry-completed.png`.
