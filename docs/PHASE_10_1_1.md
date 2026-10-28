# Phase 10.1.1 — Production Security Gates

Updated: 2026-10-28

## Result

This was a read-only audit and documentation pass. No runtime source, production service, secret, Cloudflare setting, firewall, Garage/Storage/Docker/QNAP resource, deployment, or data was changed. Nexora remains in Feature Freeze.

**Operator-confirmed regression/smoke verification:** On 2026-10-28, the operator reported that after the Phase 10.1 CSP regression fix they checked and tested every Nexora production function and all worked without errors. This is operator-confirmed, not tool-verified. It does not independently verify deployed revision, response headers, platform configuration, or infrastructure exposure.

No HIGH/CRITICAL newly confirmed production-reachable vulnerability was established. The historical RPC secret remains a high-priority exposure question; actual production use and current public reachability are unknown. The MUST gates below remain open for operator action.

## Evidence and findings

### 1. Historical Garage RPC secret — MUST operator decision

- Nexora Phase 9.9, Phase 10.1, and handoff records report the adjacent IssueDesk `garage/garage.toml` contained a literal RPC secret, was removed from the index, and the example was replaced with a placeholder. The Phase 9.9 report says the historical value must be treated as exposed.
- Safe IssueDesk history metadata confirms commits adding and later removing `garage/garage.toml`; no secret value was read, searched for, or printed. Git history was not rewritten. The current IssueDesk checkout reports clean status, but its history contains an unreadable tree object, so this is not a complete history audit.
- There is not enough evidence to establish whether that value was ever configured or used in production. Its appearance in source history alone does not prove production use.
- **Decision:** Have the IssueDesk/service owner establish production use from deployment/configuration records without exposing the value. If production use is confirmed, or cannot be ruled out, treat it as compromised and plan RPC secret rotation with a separate authorized maintenance procedure. Rotation and history cleanup were not performed. Rotation can disrupt Garage RPC clients and requires coordinated config rollout; history rewrite has separate clone/audit implications and needs its own authorization.

### 2. Direct Storage API and Garage exposure — MUST operator verification

- Read-only Compose inspection in the adjacent IssueDesk checkout shows host port mappings for Storage API `3900:3900` and Garage S3 `3000:3000`, with no loopback-only host address in those mappings. This means the services are published on host interfaces. Application credentials do not by themselves prove the intended network boundary.
- This establishes local host-interface publication, not public Internet reachability. Host firewall, router/NAT, QNAP policy, Tunnel/Access routing, and actual host state were not available. Nexora production domains did not resolve from this environment, and no production host or port probe was made.
- Nexora source calls the Storage API server-to-server with server-side app and Cloudflare Access service-token headers; the browser calls Nexora same-origin APIs. Nexora does not call Garage directly. This source boundary does not establish the adjacent service's live ingress policy.
- **Required operator evidence:** confirm the host bind/listener, firewall and router/NAT rules, QNAP policy, and Tunnel/Access route. Keep Storage API and Garage unreachable from unsolicited public ingress; permit only the intended service path. If a public path is necessary, document its authentication and source restrictions. Do not edit Compose/firewall/Garage as part of this audit.

### 3. Cloudflare edge rate limiting — MUST before broad exposure

Nexora source has login throttling: at most 8 failed attempts per email hash or source-IP hash in 15 minutes, with bounded cleanup. No source-level limiter was found for anonymous public-share reads or authenticated high-cost storage operations. These suggested rules are a starting policy for operator review, not deployed configuration:

| Route class | Suggested initial threshold/response | Notes |
| --- | --- | --- |
| `POST /api/auth/login` | 10 requests per source IP per 10 minutes; managed challenge or temporary block for 10 minutes after threshold | Keep existing account/IP-hash D1 throttle. Avoid counting successful login attempts as failed guesses if the edge can distinguish only the route. Consider shared NAT and allow recovery paths. |
| Public share metadata and folder listing (`/api/public/shares/<id>/<token>` and `/objects`) | 120 requests per source IP per 5 minutes; challenge/throttle for 5 minutes | Browser navigation and pagination make these more frequent. Do not key solely on capability token, which can itself be sensitive. |
| Public share preview and download | 20 requests per source IP per 5 minutes per route class; throttle or challenge for 5 minutes | Count request starts, not response bytes. A single legitimate download should not be interrupted mid-stream. Account for households/NAT and shared links. |
| Authenticated upload/download/preview | 60 requests per source IP per 5 minutes per transfer class as an initial alert threshold; challenge/throttle only after observing normal use | Two concurrent uploads are client-bounded; uploads have a 25 MiB source hard limit. Avoid IP-only hard blocks that penalize shared networks. |
| Costly storage mutations and traversal (`copy`, recursive/bulk-adjacent operations, Trash lifecycle, share creation/replacement) | 30 requests per source IP per 5 minutes per operation class; alert first, then temporary throttle after observing normal usage | Preserve legitimate multi-selection workflows; use narrower route/method matches. Bulk operations invoke per-object routes. |

Roll out in log/count or challenge mode first, review actual production request patterns, tune per route, and only then enforce. Add emergency bypass/allow rules only for well-defined trusted callers. Ensure the selected Cloudflare product supports the desired counting characteristics and response action. These thresholds are provisional and should be load- and workflow-checked before enforcement.

### 4. Public-share capability URL log redaction — MUST

A public URL is a bearer capability. Application source creates `/s/<share-id>/<token>` and `/api/public/shares/<share-id>/<token>`; inspected application diagnostics do not log request URLs or share tokens. Platform/edge request logs can still capture them. `no-referrer` limits browser referrer leakage but does not redact request logs.

Exact requirements for Cloudflare, Pages/Workers, reverse-proxy, analytics, and support logs:

- Match the path segments `/s/<share-id>/<token>` and `/api/public/shares/<share-id>/<token>` (including encoded or normalized path forms); replace the complete capability path with a fixed marker such as `/s/[REDACTED]` or `/api/public/shares/[REDACTED]` before persistence/export.
- Do not retain either identifier or token segment, full URL, query string, Referer, or a reconstructable fragment alongside those requests. Never hash the token into logs as a substitute for redaction.
- Apply the same policy to request-line, URL, edge trace, error, sampled, analytics, and exported logs; validate with synthetic test paths only, never a real share link.
- Preserve safe operational fields such as method, status, edge action, and duration if policy permits. Verify the emitted record after the rule is enabled.

No platform logging configuration was changed or verified.

### 5. Access, bindings, headers, and CSP — source verified; production unverified

- `wrangler.jsonc` names Pages project `nexora` and D1 binding `DB` / `nexora-db`. Source requires server-side `STORAGE_API_URL`, `STORAGE_APP_SECRET`, `CF_ACCESS_CLIENT_ID`, and `CF_ACCESS_CLIENT_SECRET`; this is source-derived, not proof of live binding values or presence. Storage credentials and Access service-token headers are attached only in `functions/_lib/storage-client.js`.
- The Nexora production hostname and Pages hostname both failed DNS resolution from this environment. No Cloudflare account/config query was available. Current Pages revision, live bindings, Access policy/service-token routing, and deployed response headers are unknown.
- Source sets HTML CSP in `functions/_middleware.js` with a fresh response nonce, `script-src 'self' https://static.cloudflareinsights.com 'nonce-…'`, `style-src 'self' 'unsafe-inline'`, `frame-src blob:`, `connect-src 'self'`, and restrictive object/base/frame/form directives. HTML is `no-store`; script `unsafe-inline` and `unsafe-eval` are absent. Do not reintroduce either or remove `_headers`.
- Static `public/_headers` retains HSTS, frame denial, `nosniff`, and Permissions-Policy; middleware also applies these to HTML. API responses apply baseline headers and route-specific CSP. Public share paths and responses set `no-referrer`; API/stream routes use no-store and restrictive CSP as implemented.
- **Operator follow-up before a future deployment:** read-only confirm Pages project/revision, required binding presence, intended Access authorization for upstream Storage API, and production HTML/API/static headers. Confirm unique HTML nonces are not reused through caching and Cloudflare JavaScript Detections continues to work. The operator-reported all-functions smoke verification is positive workflow evidence, but not a header or binding inspection.

## MUST vs OPTIONAL

### MUST — open security gates

1. IssueDesk owner: determine historical Garage RPC secret production use; if used or uncertain, plan an explicitly authorized rotation. Do not rewrite history without separate authorization.
2. Service operator: verify host publication versus public reachability for Storage API/Garage using firewall/router/QNAP/Tunnel/Access evidence; restrict direct ingress to the intended path.
3. Cloudflare operator: review, stage, and tune route-specific edge rate controls using the strategy above; no rules were changed.
4. Platform logging operator: implement and validate complete capability-path redaction for both public URL forms; no logging settings were changed.
5. Before future deploy/config changes: verify Pages revision, bindings, Access route and production headers/CSP read-only.

### OPTIONAL — separately scoped hardening

- Tighten `style-src 'unsafe-inline'` only after rendered compatibility review; current Phase 10.1 fix and operator smoke verification should be preserved.
- Consider session lifetime or stronger origin-isolation headers only if the threat model warrants them and compatibility has been reviewed.
- Garage redundancy, backup automation, and isolated restore drill remain separate durability work.

## Validation and limits

- Read-only source/config/history metadata review; no secret values or database artifacts were opened.
- Read-only HEAD requests to the Nexora custom domain and Pages hostname could not resolve DNS. This is an environment limitation, not evidence of production outage.
- Compose establishes host-interface publication only. Internet reachability remains unknown without operator network-policy evidence.
- Operator-confirmed production function checks after CSP fix: all functions tested and reported working on 2026-10-28; not tool-verified.
- Documentation-only changes: run `pnpm lint` as primary check and `git diff --check`. No tests or build are required because runtime source is unchanged.
