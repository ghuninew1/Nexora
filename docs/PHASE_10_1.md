# Phase 10.1 — Security Finalization

Updated: 2026-10-28

## Result

**Security audit and safe local source hardening are complete. Production and adjacent-service findings remain explicit operator gates; this pass did not change infrastructure.** Feature Freeze was preserved: no product capability, redesign, dependency, or unrelated refactor was added.

Phase 10.0 is closed as **Production Readiness passed — operator-confirmed** based on the operator's 2026-10-28 confirmation. Broad Phase 10.0 checks were not repeated here; command-line DNS was unavailable. The production browser was later reachable and used only to inspect the injected CSP script. This network limitation is not evidence of a production outage. See [Phase 10.0.1](PHASE_10_0_1.md).

## Audit results

### Logic and security

| Area | Source evidence | Result / remaining work |
| --- | --- | --- |
| Secret exposure and history | Nexora handoff records that the adjacent IssueDesk Garage config was removed from its index, its example changed to a placeholder, and runtime SQLite/WAL/SHM artifacts are no longer tracked. The Phase 9.9 report documents the earlier exposure. | History was not rewritten and secret values were not read. Current adjacent checkout state was not re-verified in this pass. Treat historical RPC secret material as exposed until the owner establishes whether it was ever used; production rotation and history cleanup are separate authorized work. Runtime DB artifact history may contain real metadata and needs owner classification. |
| Cloudflare Access boundary | `functions/_lib/storage-client.js` attaches `STORAGE_APP_SECRET` and Access service-token headers only server-side; the browser uses same-origin Nexora API calls and logical mount/object IDs. | Source boundary is intact. Production Access policy, endpoint, bindings, and service-token authorization remain unverified because of DNS/network limits. Confirm them read-only before a future infrastructure change. |
| Credentials and session | `functions/_lib/auth.js` stores only session token hashes and sends a `Secure; HttpOnly; SameSite=Lax` cookie; login checks same origin and JSON content type. | No source defect requiring a behavior change was found. Existing login throttling is bounded to eight failures per email or IP hash over 15 minutes, with bounded cleanup. |
| Origin, ownership, and capabilities | `functions/_lib/api.js`, `authorization.js`, storage routes, and share routes enforce same-origin mutations, authenticated ownership, mount/object scoping, read-only policy, and provider capabilities. There is no permissive CORS configuration. | Source protections are present. No production config was queried or changed. |
| Public-share capability | `functions/_lib/shares-api.js` stores a hash of the random bearer token, returns its path only on create/replace, restricts access to the logical shared subtree, and uses generic public errors. Static `/s/*` and public API responses use `no-referrer`; data responses are no-store and streamed responses retain restrictive CSP. | A share URL is intentionally a bearer capability. Platform request/access logs can still capture the path. Configure edge/platform logging to redact `/s/<share-id>/<token>` and `/api/public/shares/<share-id>/<token>`; never log the URL in application diagnostics. |
| Security headers and CSP | `public/_headers` applies one-year HSTS without `includeSubDomains`, frame denial, `nosniff`, and camera/microphone/geolocation restrictions to static assets. `functions/_middleware.js` applies CSP to HTML and creates a fresh nonce per response; API responses retain their route security headers and CSP. | Implemented locally. CSP permits same-origin app assets, Cloudflare Insights, a response nonce for Cloudflare JavaScript Detections, inline styles used by the UI, and blob frames used by PDF previews. HTML uses `Cache-Control: no-store`; script/eval `unsafe-inline` remain absent. Production behavior remains unverified until deployment. |
| Rate limiting | `functions/_lib/auth.js` rate-limits login attempts. No Nexora route limiter was found for anonymous public-share reads or authenticated high-cost operations. | **MUST before broad exposure:** configure reviewed edge controls for login, public-share metadata/list/download, upload/download/preview, and costly storage operations. Preserve legitimate sharing and avoid making per-user API throttling depend on an unverified client IP. This needs Cloudflare/edge changes and was not done. |
| Direct Storage/Garage exposure | Phase 9.9 and the later handoff describe adjacent IssueDesk Compose publishing Storage API and Garage S3 ports. Nexora source itself calls the Storage API server-to-server and does not call Garage. | **MUST verify with the service owner:** confirm host firewall/router policy blocks direct public access and that Storage API ingress requires its app credential and intended Access/Tunnel route. Production exposure is unknown; no Compose, firewall, Garage, or Storage change was made. |
| Logging and redaction | Storage upstream diagnostics allowlist operation/stage/status/error class and avoid URLs, headers, response bodies, IDs, and credential values. Activity metadata is bounded and allowlisted. API errors are normalized. | Source logging is value-safe by inspection. Platform/edge request logging still needs capability-path redaction. No secret values or local `.dev.vars` were read. |

### UI and product behavior

- No product feature, route, layout redesign, or visual change was introduced.
- The theme initialization code is the same logic moved from an inline script to `public/theme-init.js`. Production browser inspection found a Cloudflare-injected inline bootstrap containing `window.__CF$cv$params` and loading `/cdn-cgi/challenge-platform/scripts/jsd/main.js`, identifying Cloudflare JavaScript Detections as the source of the CSP violation. Its request-specific parameters make an exact hash a poor fit. Cloudflare documents that when a response CSP contains a nonce, it will add that nonce to its injected scripts; the HTML middleware now supplies a per-response nonce. See [Cloudflare JavaScript Detections and CSP](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/). The reported blocked hash is no longer used as an allowlist entry.
- CSP permits blob frames because the existing connected-file PDF preview uses an object URL. `style-src 'unsafe-inline'` remains for existing runtime/style attributes; tightening it is optional and should follow rendered browser validation.
- The production browser currently injects Cloudflare JavaScript Detections after the origin HTML. The old `1jHB...` hash was not a suitable durable authorization for that injected bootstrap. The middleware now sets a fresh `script-src` nonce on HTML responses; Cloudflare's documented behavior is to propagate the response nonce to its injected script. Keep `unsafe-inline`/`unsafe-eval` absent. Production verification must confirm the deployed Pages middleware is active and the Cloudflare script carries the same nonce.

## MUST and OPTIONAL actions

### MUST — security/operator gates

1. The IssueDesk owner must determine whether historical Garage RPC secret material was ever used in production. If use cannot be ruled out, plan rotation through a separately authorized maintenance task. History rewrite is separately prohibited unless explicitly authorized. No secret was rotated or history changed here.
2. Confirm the historical SQLite/WAL/SHM artifacts contained no real production or user metadata, or handle them under the adjacent repository's incident/retention process. Do not open or copy database artifacts for this Nexora task.
3. Have the service operator verify direct Storage API/Garage ingress is restricted by firewall/Tunnel/Access as intended.
4. Configure and review edge rate limits for authentication, public shares, transfers, and costly storage operations. Test thresholds against normal user workflows before enforcing them.
5. Configure platform access logs to redact public-share capability paths and verify no URL/token is emitted by application or edge diagnostics.
6. Before any future deployment, verify the intended Pages project/revision, required binding names/presence, Access authorization, and migration state. The production smoke results and migrations are operator-confirmed, not tool-verified. Never reapply migrations solely for verification.

### OPTIONAL — follow-up hardening

- Tighten the CSS CSP beyond `unsafe-inline` after browser/rendered-style compatibility review.
- Consider shorter or reauthentication-bound sessions if the operator's threat model requires it; changing current session behavior could invalidate user sessions and is outside this phase.
- Decide whether to add stronger origin-isolation headers after confirming popup, preview, and cross-origin resource requirements.
- Plan Garage redundancy and tested off-device backup separately; current source/config records single-node replication factor 1 and no completed restore drill.

## Production boundary

No secrets were read, printed, or rotated. No Git history rewrite, Cloudflare Access/rate-limit/firewall change, deployment, D1 operation, Garage/Storage/Docker/QNAP action, or production data change occurred. Work DNS/network failure remains an environment limitation, not a production outage finding.

## Local changes and validation

- `public/_headers`: retains HSTS, frame denial, `nosniff`, and Permissions-Policy for static assets. CSP moved to `functions/_middleware.js` so HTML responses can receive a per-response nonce for Cloudflare JavaScript Detections.
- `index.html` and `public/theme-init.js`: moved the existing theme initializer into an external same-origin script for `script-src 'self'`.
- `functions/_lib/api.js`: add safe baseline security headers to all API success/error responses while preserving route-specific sandbox CSP.
- `tests/backend.test.js`: regression test for API security headers.
- `functions/_middleware.js`: add response-specific nonce CSP to HTML, mark HTML uncacheable, and preserve existing static/API security boundaries.
- `tests/security-headers.test.js`: regression coverage for nonce CSP generation, unique nonces, HTML cache behavior, preserved security headers, pass-through of non-HTML responses, and absence of inline executable scripts in the app HTML template. It does not emulate Cloudflare edge injection.
- `pnpm lint`: passed.
- Initial Phase 10.1 baseline: `pnpm test` passed 126/126 before the CSP regression follow-up.
- `pnpm build`: default Vite command was blocked by host `EPERM` writing its temporary config under `node_modules/.vite-temp`. `pnpm exec vite build --configLoader runner --outDir /tmp/nexora-phase-101-build` passed (2,331 modules).
- `git diff --check`: passed after final documentation updates.
- Full app browser QA was not run because local Pages preview could not write to `.wrangler/tmp`; no browser dependency was added. Production browser access was used read-only to identify the injected script. Live CSP nonce propagation, rate-rule verification, and infrastructure checks remain unverified.
- CSP production follow-up: deploy the reviewed Pages source, then verify the response CSP nonce is unique per HTML response, the browser error is gone, Cloudflare JavaScript Detections still executes, and nonces are not reused through caching. Deployment and Cloudflare settings remain operator-controlled and were not changed here.
- Follow-up validation on 2026-10-28: `pnpm lint` passed; `node --test tests/security-headers.test.js` passed (4/4); Vite runner fallback build passed (2,331 modules) after default `pnpm build` hit host `EPERM` writing under `node_modules/.vite-temp`; `git diff --check` passed. `pnpm test` reports 13 failing share-related tests out of 130 (share creation returns HTTP 400 instead of expected 201); the new CSP tests pass. `wrangler pages dev` could not start because the host denied writes under the repository `.wrangler/tmp`. No changes were made to Sharing code. Production verification still requires deployment and browser checks; no deployment or Cloudflare configuration change was made.
