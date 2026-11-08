# Multipart Cloudflare 1102: CPU reduction and recovery policy

## Production evidence, read only — 2026-11-08

The operator supplied HTTP503/Cloudflare1102 (`worker_exceeded_resources`) for PUT part8, after7/23 parts/56 MiB verified, at `2026-11-08T15:35:40.303Z` (22:35:40 Asia/Bangkok), Ray `a575a617fd8491b4-SIN`.

The authenticated Cloudflare **nexora → Metrics → Production** dashboard was inspected read-only around22:41 Bangkok. The30-minute range covering the incident showed207 successes,27 errors, **27 Exceeded CPU Time Limits and0 Exceeded Memory**. The prior24-hour view showed45 CPU errors and0 memory errors. Minute buckets included15:34–15:37UTC. This identifies Nexora Pages CPU exhaustion during the incident window; it does not constitute a per-Ray invocation trace or production line-level profile. The plan/CPU budget was not changed or independently inventoried. Do not quote the dashboard's ambiguous percentile units as measured CPU milliseconds.

The open production upload row also showed a later failed reconciliation GET at `2026-11-08T15:37:12.830Z`, request ID `7a34268e-bad7-48a1-b68b-5f1efa0f7d83`, Ray `a575a85b5e1291b4-SIN`. This explains why repeated recovery requests can also fail without transferring bytes. No production Retry/upload/cancel/reload, configuration change, DB operation, migration, service restart or deploy was performed. Historical invocation details for the original Ray and Shared/Garage host logs were not available through the configured tools. The precise share of production CPU consumed by each function remains unmeasured.

Cloudflare documents1102 as CPU or memory exhaustion, with network wait excluded from CPU accounting: [1102 troubleshooting](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1102/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

## Audited flow and focused reductions

1. Browser slices/hashes one8 MiB part, then sends its base64 SHA-256 header through the authenticated same-origin route.
2. Pages authenticates the session with a small token hash, checks mount/assignment/read-only/maintenance/provider capabilities and streams the part to Shared. No password PBKDF2 runs on upload requests. No full-part/file `arrayBuffer`, `formData`, `text`, part SHA-256, app Request.clone/tee or global byte cache exists in this multipart branch. Bounded response JSON is at most64 KiB; error inspection is at most16 KiB. Wrangler's generated Pages dispatch clones Requests; that runtime-owned behavior was inspected but not patched in node_modules or replaced by a new architecture.
3. The **old** exact-part wrapper crossed into JavaScript for every `reader.read` / `pull` / `enqueue`. It was bounded in memory, but incurred avoidable CPU for the payload. `exactPartStream` now uses Cloudflare's native `FixedLengthStream(expected)` and native `pipeTo`. Too few/many bytes still fail; pipe rejection reaches the readable side/fetch. The JS bounded implementation remains only as a fallback outside Cloudflare. Native exact-length behavior is documented in [FixedLengthStream](https://developers.cloudflare.com/workers/runtime-apis/streams/transformstream/#fixedlengthstream).
4. Pages previously resolved the same owned mount twice before the upstream call. It now reuses access freshly resolved **within this request**; no cross-request cache. A new request still reads current grants, and completion still reauthorizes immediately before publication. Regression checks confirm one access lookup for status/part and two for completion, including the final fresh check.
5. The queue previously did an extra status GET after every successful PUT, in addition to the client's reconciliation before the next part. It now advances progress from the returned receipt after validating part number/length (the client already verifies its SHA-256), combined with the reconciled baseline. Reconciliation before every missing-part write, manual retry, pause and completion remains. No dispatched-but-unacknowledged bytes count as progress.
6. Shared runs in Node, allocates one bounded8 MiB buffer per admitted part, validates exact length and SHA-256 **before** writing to Garage, journals immutable digests and commits receipts. Its four global part leases bound these buffers. This is not Pages memory. Moving that verification after a streamed provider write would change the guarantee; it was neither needed for the observed Pages CPU failures nor implemented. No adjacent Shared/Garage source changed.

The fixed file cap remains5,000,000,000 bytes, part size8 MiB, one active file per browser tab, and the existing multipart architecture/authorization/receipt/cancellation/cleanup contracts remain.

## Measurements and limits

| Observation | Before | After | Evidence boundary |
| --- | --- | --- | --- |
| Pages incident30-minute CPU/memory failures |27 CPU /0 memory | Not deployed/measured | Actual dashboard, aggregate; no per-Ray profile |
| JS CPU-profile samples in stream `read` / `pull` / `enqueue` |57 /49 /4 |0 /0 /0 | One warmed8 MiB local workerd probe, CPU sampling100µs; not charged production CPU time |
| Stream probe wall duration |101.27ms |29.40ms | Same instrumented local probe; includes IPC/network/profiler overhead, not full API/auth and not a benchmark guarantee |
| Initial owned-access queries per status/PUT |2 |1 | Source + executed regression; completion retains fresh recheck |
| Status GETs for a clean23-part transfer |48 |25 | Protocol-derived count: initial + pre-part + post-part + completion vs initial + pre-part + completion |
| Actual focused browser run with resource interruption plus lost acknowledgement | n/a |28 status GETs, one create/complete | Executed assertion, mocked same-origin API |

Local profiling identified a removable CPU contributor, not a proof that every production invocation now fits its CPU quota. Memory peak and production before/after CPU milliseconds were not measurable here. The local inspector's forced-GC request timed out; no heap reduction is claimed. Production acceptance must verify the full Pages path after deployment.

## Resource error classification

Both client and upstream normalization recognize bounded JSON error codes `worker_exceeded_resources`,1102 or `WORKER_RESOURCE_LIMIT`, and bounded Cloudflare HTML/plain1102 markers. Raw error pages/messages are never exposed or logged. Only the canonical safe code enters diagnostics. Generic503 remains a bounded transient error; explicit resource exhaustion does not.

`WORKER_RESOURCE_LIMIT` is excluded from automatic retry/reconciliation loops. A failed part does not trigger an immediate recovery GET for that deterministic error. The queue retains its File, session identity and verified receipts, shows a resource-specific explanation and **Retry after fix**. Explicit Retry reconciles the same session and checks source digests; it does not create a replacement identified session or resend confirmed parts. Cancel and existing control intent/epoch guards remain. Repeated manual clicks cannot be represented as a fix for an unchanged resource failure.

When Nexora itself is terminated, application code cannot intercept/rewrite that platform response; the browser recognizes the platform error directly. Upstream Worker errors can be normalized by the still-running Nexora server. The supplied Ray is not a Garage request ID.

## Validation and deployment

Focused regressions cover native workerd exact8 MiB streaming without JS reader callbacks, whole-stream checksum, under/overflow rejection, request-scoped authorization with final fresh reauthorization, bounded resource-error inspection/cancellation, JSON/HTML/plain1102 normalization, no automatic resource retries, manual same-session recovery, receipt-based progress, no duplicated confirmed parts and existing expiry/cancel/resume/cleanup suites. Expected workerd stream exceptions in malformed-body tests demonstrate rejection, not unresolved failures.

Browser plugin unavailable; existing cached Playwright/Chrome used an isolated profile at `http://127.0.0.1:5185/files`,1280×900 and390×844. The actual client sliced/hashed191,574,836 bytes/23 parts against a mock API. Part8 returned resource-limit503 after7 acknowledged parts; it was attempted once until explicit manual retry. The UI showed resource-specific diagnostics and Retry after fix. After the simulated fix, the same session completed23/23, parts1–7 were never resent. Part17's acknowledgement was lost after acceptance and reconciled without another PUT. Total28 status GETs; native IndexedDB recovery count0 on success. Two expected injected network console errors, no app/page errors or overlay; mobile document/dialog had no horizontal overflow. Screenshots visually inspected. This was not a real upload through deployed Pages/Shared/Garage.

No resource-limit/plan increase, production variable, migration or service restart is required by the code change. After review, deploy Nexora only using the existing `pnpm deploy` command (not run here). Preserve interrupted recovery metadata; loading the new bundle releases the live File, so reselect the exact original file and explicitly Resume. Retain both server multipart flags and the existing geometry/permissions.

For the next separately authorized real upload, verify:
- same session resumes from confirmed receipts and final download checksum matches;
- Nexora Production metrics/invocation outcome shows neither exceededCpu nor exceededMemory for the PUT/status requests;
- correlate diagnostic UTC/request ID/Ray with the new invocation, rather than treating the entire30-minute aggregate as a per-request measurement;
- use the bounded safe live-tail/host log commands in [recovery diagnostics](MULTIPART_UPLOAD_RECOVERY.md); do not auto-retry resource failures or raise limits speculatively.

If CPU failures persist, stop writes and obtain a full invocation CPU trace for the remaining authorization/runtime overhead. Actual production completion without1102 is still pending. No10 GiB, stress/load run, production upload/retry, deployment, migration, restart, secret/configuration change, commit or push was performed. Task-created local servers/runtimes/browser profiles were closed and the large fixture removed.

| Required check | Final result |
| --- | --- |
| `pnpm lint` | **PASS** |
| `NEXORA_SHARED_STORAGE_ROOT=/Users/ghuninew/GitHub/issuedesk/garage/storage NEXORA_ACCEPTANCE_TEST_DEPENDENCIES=/Users/ghuninew/GitHub/issuedesk/garage/storage pnpm test` | **PASS242 Node +98 UI**,0 failures/skips; includes native workerd and actual Shared bridge with mocked S3 |
| `pnpm build` | **PASS** |
| `git diff --check`, final review | **PASS** |
| Local browser/resource recovery | **PASS** with synthetic faults/mock API |
| Post-fix production resource usage/full upload/checksum | **NOT RUN** |

Evidence outside Git: `/private/tmp/nexora-resource-profile.json`, `/private/tmp/nexora-resource-legacy.cpuprofile`, `/private/tmp/nexora-resource-native.cpuprofile`, `/private/tmp/nexora-1102-test-final.log`, `/private/tmp/nexora-1102-lint-final.log`, `/private/tmp/nexora-1102-build-final.log`, `/private/tmp/nexora-1102-browser.log`, `/private/tmp/nexora-1102-diagnostics.png`, `/private/tmp/nexora-1102-mobile.png`, `/private/tmp/nexora-1102-completed.png`.
