# Nexora — Project Handoff

อัปเดตล่าสุด: 2026-10-28

เอกสารนี้สรุปสถานะ Nexora หลัง implementation Phase 9.6; แยกผล local validation ออกจากสถานะ remote ที่ผู้ใช้/operator ยืนยัน

## สถานะปัจจุบัน

- Phase 1–6 เสร็จในขอบเขต frontend/demo: Liquid Glass foundation, app shell, File Browser และหน้า Dashboard, Recent, Favorites, Shared, Trash, Storage, Settings
- Phase 9.3 production operations และ Copy fix ผ่านตามที่ผู้ใช้ยืนยันใน brief วันที่ 2026-10-27; ไม่ได้ deploy หรือทดสอบ production ซ้ำใน Phase 9.3.1
- Codex workflow: [Nexora project skill](.agents/skills/nexora-project/SKILL.md); `AGENTS.md` remains the detailed source for repository rules.
- Phase 9.3.1 เพิ่ม bounded in-memory listing cache, stale-while-revalidate, cursor-aware dedupe, metadata breadcrumbs และ selective mutation invalidation. Final validation: `pnpm lint` passed; `pnpm test` 81/81; `pnpm build` passed; `git diff --check` passed. Local File Browser rendering was blocked at the auth gate because the local auth API is unavailable; no production endpoint or deploy was used.
- Phase 9.3.2 adds exact ancestor breadcrumb routing and on-demand safe preview through an authenticated inline endpoint. Local validation: `pnpm lint`, `pnpm test` (88/88), `pnpm build`, and `git diff --check` passed. Browser preview interaction remains unverified: Playwright is not installed, and the local Vite page stopped at the session gate because no local auth service is available. No production endpoint or deployment was used.
- Phase 9.4 connects File Browser Move to Trash and the Trash page to the existing mount-scoped Storage API. Trash has separate cursor-paginated state; Restore and Permanent Delete are capability/readOnly-gated, server-confirmed, and protected by per-object mutation state. Cache updates are targeted; folder subtree metadata is removed and a previewed trashed file closes/cancels preview. `pnpm test` passed 93/93 and `git diff --check` passed. `pnpm lint` and `pnpm build` did not complete because local ESLint/Tailwind dependency resolution stalled or failed; manifests remain unchanged. Browser/mobile QA was not run because Browser and Playwright are unavailable. No production endpoint or deployment was used.
- Phase 9.4.1 connects single-selection toolbar actions to the same callbacks/dialogs as row actions, repairs toolbar Trash, and reuses the existing Favorites D1/API. Favorites GET hydrates owner-scoped logical metadata and removes confirmed-stale records; Favorites page has real loading/error/empty/data states and no fixture fallback. `pnpm lint`, `pnpm test` (94/94), and `git diff --check` passed. Default Vite build is blocked writing `node_modules/.vite-temp`; Vite build with `--configLoader runner --outDir /tmp/nexora-phase-941-build` passed after transforming 2,318 modules. Browser and production QA were not run, and no production resources changed. See [Phase 9.4.1](docs/PHASE_9_4_1.md).
- Phase 9.5 replaces Dashboard/Recent fixtures with active StorageProvider state and the existing D1 `recent_access`/`/api/recent` contract. Explicit folder opens, Preview, and Download update one logical Recent row; hydration refreshes current safe metadata, removes only confirmed missing objects, and preserves rows during provider errors. Dashboard shows reported usage or “Not reported”, six Recent rows, independent section states, and quick links; Shared remains demo-only. No migration was added. `pnpm lint`, `pnpm test` (99/99), `pnpm exec vite build --configLoader runner --outDir /tmp/nexora-phase-95-build`, and `git diff --check` passed. Browser plugin/Playwright are unavailable, so browser/mobile and production QA remain unverified. See [Phase 9.5](docs/PHASE_9_5.md).
- Phase 9.7 adds upload retry/cancellation guards and bounded multi-selection Move/Move to Trash through existing per-object APIs. Each item is independent; successful IDs leave selection, failures remain actionable, and affected folder caches are selectively invalidated. The metrics audit found that Nexora `/usage` still returns unavailable/null and no authoritative aggregate provider source exists in this checkout; Dashboard and Storage continue to say “Not reported.” Local validation: `pnpm lint`, `pnpm test` (118/118), runner build (2,329 modules), and `git diff --check` passed. Browser and production QA were not run; no remote resources changed. See [Phase 9.7](docs/PHASE_9_7.md).
- Phase 6 เพิ่ม labels/focus, keyboard/touch behavior, duplicate-name validation, responsive breadcrumbs, progressbar semantics และ reduced-motion support
- Phase 7: `pnpm lint` และ `pnpm build` ผ่านหลังแก้ lint errors/warnings ใน preview lifecycle, FilesProvider restore helper และ hook dependencies
- Browser: ตรวจ route `/dashboard`, `/files`, `/recent`, `/favorites`, `/shared`, `/trash`, `/storage`, `/settings` และ unknown route ใน in-app browser ขนาดแคบประมาณ 576 px; ยืนยัน mobile navigation menu, search, list/grid, folder/breadcrumb, create folder, move to Trash, restore, preview sample state, theme Light/Dark/System, Tab focus ring และปิด preview dialog ได้
- Browser QA ที่ยังไม่ยืนยัน: desktop viewport, native file chooser/upload queue (เลือกไฟล์ไม่ได้ใน browser control นี้), permanent delete (ต้องให้ผู้ใช้ยืนยัน ณ เวลาลบ), reduced-motion system override และ console log
- UI follow-up mobile QA: ตรวจ File Browser ที่ `/files` ใน in-app browser บนหน้าจอมือถือ, สลับ List/Grid, กดดาวเพิ่ม Favorites แล้วตรวจสถานะปุ่มเปลี่ยนเป็น Remove, เปิด mobile Sidebar และตรวจ labels/โลโก้เต็ม; screenshot ยืนยัน layout ไม่มีการตัดแถวรายการใน viewport ที่ตรวจ
- Phase 8 backend foundation: Pages Functions, Nexora D1 schema, hashed-cookie sessions, origin checks, mount ownership และ server-only Shared Storage `/v3` client
- Operator ยืนยัน production D1/migration, admin, storage mount, Shared Storage app/project/access token และ production secrets พร้อมใช้งาน; `/v3` capabilities test ได้ HTTP 200. Phase 8.5 ไม่เชื่อมต่อ production และไม่เปลี่ยน records/secrets
- `pnpm db:migrate:local` apply Nexora migration กับ Wrangler local D1 ได้; `wrangler.jsonc` กำหนด D1 `nexora-db` พร้อม database ID
- Phase 9.1 เพิ่ม storage discovery/capabilities/usage client และ provider ผ่าน same-origin Nexora API; Storage page แสดง safe connection state. Production deploy/connection ยังไม่ได้ตรวจในงานนี้
- Phase 9.2 เปลี่ยน File Browser เป็น real listing/navigation ผ่าน Nexora API: root/child listing, cursor pagination, logical-ID breadcrumbs, refresh, loaded-item search/sort และ create-folder ตาม capability
- File Browser ไม่ใช้ fixture IDs และไม่เชื่อม demo mutations เข้ากับ mount. Phase 9.3 operations, Phase 9.3.2 preview, Phase 9.4 Trash lifecycle, Phase 9.4.1 Favorites, and Phase 9.5 Recent use Nexora same-origin APIs when authorized; Phase 9.6 adds owner-managed persistent public links.
- `FilesProvider` demo helpers เหลือสำหรับ legacy examples; Shared ใช้ public_shares ใน D1; Dashboard/Recent ใช้ remote storage state และ D1 Recent API, Favorites ใช้ remote D1/API state และ Trash ใช้ remote state แยกตาม active storage mount
- Upload queue ที่เหลือใน demo จำลอง progress ใน browser; ไม่ส่ง bytes ไป storage
- Shared แสดง persistent public links และ Share action เชื่อม API แล้ว (local). Storage page แสดง safe connection/capability state จาก Nexora API; usage ยัง not reported เพราะไม่มี authoritative metrics
- Theme เป็น browser preference ใน `localStorage`
- UI follow-up: Sidebar เต็มความสูงและ responsive; ใช้ `src/assets/logo_full.avif` ตอนขยายและ `src/assets/logo.avif` ตอนพับ; File Browser และการ์ด Recent/Favorites มี Liquid Glass hover; Favorites ใน File Browser ยังคงเป็น demo เฉพาะหน้าที่ใช้ demo state
- Phase 9.1 validation: lint, 45 tests, build and diff check passed; in-app browser mock QA verified the Storage connection panel and refresh at a narrow viewport. Production connection, desktop rendering, and production console/network inspection remain unverified.
- Phase 9.2 validation: `pnpm lint`, `pnpm test` (60/60), `pnpm build` and `git diff --check` passed. In-app browser with localhost mock API verified root/child/empty listing, folder navigation and breadcrumb, back/reload, invalid-link fallback, pagination, loaded-item search, refresh reset, duplicate-folder error and successful creation at a narrow viewport. No production endpoint was used.
- Production issue reported by operator: `/api/storage/v1/storages/:storageId/capabilities` returns 503 on both `nexora.bigbrain-studio.com` and `nexora-35p.pages.dev`, while `/storages` returns an active writable mount. `/storages` reads D1 only and does not verify upstream connectivity. The redacted production log showed `TypeError` in fetch with `redirect: 'error'`; Cloudflare Workers documents that mode as unsupported and throws before sending the request. The owner-scoped mount mapping, URL, server-only headers and S2 success schema match the local contract. The fix is not deployed, so recovery remains unverified.
- Production diagnostics confirmed Cloudflare Workers throws `TypeError` for `redirect: 'error'` before sending the upstream request. The Shared Storage client now uses `redirect: 'manual'`; capabilities GET follows up to three redirects only when the resolved target has the exact configured origin, while cross-origin redirects are blocked without forwarding credentials. Redacted diagnostics classify redirect status/origin only. Fix is local and not deployed; production recovery remains unverified. No production data, secrets or deployment were changed. See [Phase 9.2 report](docs/PHASE_9_2.md) for exact production verification steps.

## Phase 7 deliverables

- [`docs/STORAGE_API_AUDIT.md`](docs/STORAGE_API_AUDIT.md): routes/methods, payload/response, auth, authorization, size limits, filename handling, error behavior, Garage communication, streaming, CORS findings และ REUSE/EXTEND/REPLACE/NOT FOR NEXORA classifications
- [`docs/STORAGE_ARCHITECTURE.md`](docs/STORAGE_ARCHITECTURE.md): current and target architecture, provider behavior contract, registry/secrets, logical IDs, namespace, D1 table proposal, auth/security/streaming review, SMB readiness และ Phase 8 file-level sequence
- [`docs/STORAGE_API_V1_PROPOSAL.md`](docs/STORAGE_API_V1_PROPOSAL.md): proposed provider-neutral `/api/storage/v1/*` routes, request/response patterns, capability model, logical IDs, errors, retry/streaming behavior
- [`docs/PRODUCTION_PROVISIONING.md`](docs/PRODUCTION_PROVISIONING.md): exact manual commands/env, remote target behavior, and recovery guidance for admin and mount provisioning
- [`docs/PHASE_8_5.md`](docs/PHASE_8_5.md): frontend auth design, routes, session lifecycle, security review, validation and production smoke test
- Audit อ่านเฉพาะ source/config ที่เกี่ยวข้อง; ไม่อ่าน credentials, local Storage database/WAL/SHM หรือ object data และไม่แก้ IssueDesk/Shared Storage Service

## สถานะ frontend validation

- Checks ที่รันในรอบก่อน: `pnpm lint` ผ่าน, `pnpm build` ผ่าน, browser route/interaction checks ตามรายการด้านบน
- UI follow-up ล่าสุด: `pnpm lint`, `pnpm build` และ `git diff --check` ผ่านหลังเพิ่มปุ่ม Favorites inline; in-app browser mobile interaction/layout ผ่านตามรายการด้านบน
- Browser UI smoke tests สำหรับ Phase 8.5 ใช้ localhost Vite server กับ mock auth endpoint/QA identity; ตรวจ unauthenticated redirect, login/return route, Header identity, logout และ safe invalid-password message. ไม่ใช้ production account
- `pnpm exec playwright --version` ไม่มี Playwright ใน dependencies; ไม่มี React component test framework จึงเพิ่ม Node tests สำหรับ auth API contract และ safe return handling แทน; production login และ browser/device matrix ยังไม่ยืนยัน
- Phase 8 เพิ่ม `pnpm test`; backend และ auth-client/provisioning tests รันด้วย Node in-memory SQLite/mocks
- QA ที่ยังไม่ครบตามรายการด้านบนต้องตรวจแยกก่อนสรุปว่า UI ผ่านทุก flow/viewport

## Shared Storage Phase S1/S2 — 2026-10-27

Shared Storage S1/S2 เสร็จใน checkout แยก `issuedesk/garage/storage/`: `/v3` internal manager API, logical folder/file tree, migration/backfill, name policy, copy verification, Trash/restore/purge และ operation records; `/v2` auth/response contract คงเดิมหลัง migration. `pnpm test` 27/27 และ IssueDesk lint ผ่านด้วย memory SQLite/fake S3. เอกสาร S2 เป็น historical local snapshot; Phase 9.1 brief ล่าสุดรายงาน S1/S2 production deployment and direct `/v3` capabilities HTTP 200, not re-verified in this Nexora local work. [S1](docs/STORAGE_PHASE_S1.md), [S2](docs/STORAGE_PHASE_S2.md)

## Nexora Phase 8 — 2026-10-27

เพิ่ม Pages Functions API สำหรับ `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`; Storage mounts/list/capabilities/usage-unavailable, object list/stat, folder/upload/download/rename/move/copy/Trash/restore/permanent-delete/operations; Favorites และ bounded Recent. Mount/project mapping อยู่ D1 และ every operation derives the project from the current session-owned mount. Download passes `ReadableStream` with safe headers and cancellation. Upload body is bounded and forwarded as a stream, but Shared Storage S2 still buffers multipart; resumable/large-file upload is unsupported.

Auth uses PBKDF2-HMAC-SHA-256 at 100,000 iterations via the shared Web Crypto hash/verify helper, 32 random bytes per session, SHA-256 token hashes in D1, 14-day Secure/HttpOnly/SameSite=Lax cookies, inactive-user rejection and bounded login attempts. `pnpm admin:create:local` remains local-only and uses the same shared password helper. Added explicit `pnpm admin:create:remote` and `pnpm storage:mount:create:remote`, both hard-coded to Wrangler `--remote` against configured `nexora-db`; neither was run in this work. No public registration, share mutation API, or SMB support.

See [Phase 8 report](docs/PHASE_8.md), [production provisioning guide](docs/PRODUCTION_PROVISIONING.md), and [Phase 8.5 report](docs/PHASE_8_5.md). Production records/configuration are operator-confirmed. The operator reported a successful production auth smoke test followed by a password appearing in authentication logs. The current source audit found no auth-path logger; production log origin remains unconfirmed and requires checking the deployed revision/log source. Do not use a production password for local regression checks.

## Phase 8.5 — Frontend Authentication

เพิ่ม AuthProvider/useAuth, same-origin `/api/auth/*` client, `/login`, protected workspace routing, session restore และ Header sign out/user identity. `FilesProvider`, fixture state และ upload simulation ยังไม่เชื่อม Storage API; รายละเอียด QA และ manual production smoke test อยู่ใน `docs/PHASE_8_5.md`.

## Phase 9.1 — Storage Client + Mount Integration

เพิ่ม `src/services/storage.js`, `StorageProvider`, `useStorage` และ connection summary ใน Storage page. Bootstrap เรียก `/api/storage/v1/storages`, เลือก active mount แรกตาม backend order แล้วโหลด capabilities/usage; 401 ส่งต่อให้ AuthProvider หมด session. Usage failure ไม่ทำให้ connection ล้มเหลว. Local lint/test/build/UI mock QA ผ่าน; production deploy และ smoke test ยังรอ operator.

รายละเอียดและ smoke-test checklist อยู่ใน [docs/PHASE_9_1.md](docs/PHASE_9_1.md).

## Phase 9.2 — Real File Listing + Folder Navigation

`src/services/storage.js` เรียก `GET /api/storage/v1/storages/:storageId/objects` โดย root omit `parentId`; ส่ง `cursor`/`limit` สำหรับหน้าถัดไปและ normalize เฉพาะ public object fields. `POST /api/storage/v1/storages/:storageId/folders` ส่ง `{name,parentId}` และ server ตัดสิน authorization/capability/duplicate policy. `useRemoteFilesState` จัดการ abort/stale responses, storage/folder-scoped selection, breadcrumb route state, refresh, pagination และ root fallback สำหรับ unverified/404 folders. File Browser search/sort ใช้เฉพาะ loaded page set; Phase 9.3/9.3.1/9.3.2 add operation endpoints, metadata-only listing cache and safe on-demand preview.

Dashboard, Recent, Favorites, Shared, Trash และ local demo operations remain separate from connected mount state. ผู้ใช้ยืนยัน production smoke test ผ่านหลัง deploy fix `redirect: 'manual'`; รายงานและ trace อยู่ใน [docs/PHASE_9_2.md](docs/PHASE_9_2.md).

## Phase 9.3 — Real File Operations

File Browser adds capability-gated upload, streamed download, rename, move and copy through `/api/storage/v1/*`. The client sends only Nexora mount and logical object IDs; server derives the owner-scoped Shared Storage project and checks capabilities/readOnly before mutations. Upload queue runs at most two real transfers and reports state without fabricated byte progress. Rename/move retain IDs; copy returns new IDs and finishes synchronously under the Shared Storage S2 100-object limit. Folder destinations load lazily. Delete/Trash/restore/permanent delete, bulk operations, SMB and Phase 9.4 are out of scope.

At the time this phase report was written, production Copy returned `PROVIDER_UNAVAILABLE`; the supplied trace and source audit below describe that historical incident and remediation. A later user-provided brief dated 2026-10-27 confirms the Copy provider issue was fixed and verified in production along with upload/download/rename/move. The later confirmation supersedes the incident status; this checkout did not independently access production.

The Shared Storage S2 source implements copy synchronously: it validates source/destination and duplicate name, then copies file bytes through Garage Get → Put → Head → Get/checksum, then commits new logical IDs. Missing source/destination, duplicate names, oversized trees and database failures have distinct safe codes. Unknown Garage S3 failures normalize to `PROVIDER_UNAVAILABLE`; the source code alone cannot identify which Garage request failed in production. The full S2 `pnpm test` suite passed 27/27 and includes copy coverage for copied bytes, new IDs, source retention and nested folder copy. At the time, Nexora local validation passed `pnpm lint`, `pnpm test` (74/74), `pnpm build`, and `git diff --check`; browser mock QA had the prior isolated sign-in 500. See [docs/PHASE_9_3.md](docs/PHASE_9_3.md) for the historical incident and operator confirmation note.

## Phase 9.3.1 — File Browser Performance & Caching

`src/utils/remote-files-cache.js` owns session-memory listing and public breadcrumb metadata caches. Keys scope each logical folder by Nexora storage ID; root is explicit. Cache lifetime is 20 seconds, bounded to 60 listing folders with LRU eviction and up to 600 metadata entries per mount. Fresh entries render without network calls; stale entries render immediately and revalidate. First-page revalidation retains loaded cursor pages only if the first cursor remains stable. Request dedupe includes cursor; generation checks keep late results from replacing the active folder while allowing safe results to populate cache. Auth/user/storage changes clear the cache and abort its in-flight requests. Create/upload/rename/move/copy invalidate affected parents; upload refresh is coalesced over 120 ms. No provider data or binary is cached. See [docs/PHASE_9_3_1.md](docs/PHASE_9_3_1.md) for implementation policy and QA status.

## Phase 9.3.2 — On-Demand File Preview + Breadcrumb Navigation

Breadcrumb clicks now resolve the exact clicked ancestor ID and preserve query/history/router state; unknown IDs are ignored, and root returns to the root listing/cache. The preview menu is enabled only for supported formats when the authenticated mount has `download`. Preview bytes load only after a click through a new same-origin `/objects/:objectId/preview` endpoint. The server checks object metadata/MIME, requires download capability, keeps upstream `preview:false` unchanged, returns inline/no-store/nosniff bytes, and enforces 1 MiB text and 20 MiB image/PDF limits. HTML, SVG, office formats, and unknown types are excluded. The UI safely renders text/JSON source, sandboxed PDF, and images; request races, cancellation and object URL cleanup are handled. Listing cache remains metadata-only. Local checks passed (`pnpm lint`, `pnpm test` 88/88, `pnpm build`, `git diff --check`); in-app browser reached the local session gate, so the preview interaction was not rendered or verified. Playwright is not installed and no production endpoint/deploy was used. Details: [docs/PHASE_9_3_2.md](docs/PHASE_9_3_2.md).

## Phase 9.4 — Trash / Restore / Permanent Delete

The existing routes are reused: object `DELETE` means Move to Trash; `GET .../trash` is cursor-paginated; Restore uses the authoritative returned object and its parent; Permanent Delete uses its separate Trash route and synchronous `{deleted:true}` response. Shared Storage S2 retains IDs/original parents, moves folder subtrees, restores to the saved active parent, rejects name conflicts, and permanently deletes provider bytes before metadata finalization. The UI has explicit confirmation for both Trash and irreversible permanent deletion; Permanent Delete is available only from Trash. Server mutations check mount ownership, capability, and read-only policy. Trash state is separate from folder cache; only source/authoritative destination and safe subtree metadata are updated. Preview cancellation/revocation is retained. See [Phase 9.4 report](docs/PHASE_9_4.md).

Local checks and browser QA for Phase 9.4 are recorded in `docs/PHASE_9_4.md`. Production Trash/Restore/Permanent Delete remains unverified until approved production QA; this implementation pass did not deploy or modify production data.

## Phase 9.4.1 — Selection Toolbar Actions and Favorites

For one selected object, the File Browser toolbar offers the same Preview, Favorite, Copy, Move, and Move to Trash paths used by item actions; multi-selection supports clearing only. Toolbar Trash opens the same confirmation as the row action and never invokes Permanent Delete. Favorites reuses the existing D1 table and `/api/favorites` routes, with normalized object details hydrated from each owner-scoped storage mount. Missing objects are removed from favorites; provider project IDs remain server-side. The Favorites page has no demo fallback. Local checks and build/browser limitations are recorded in `docs/PHASE_9_4_1.md`; production verification remains outstanding.

## Acceptance criteria ก่อนเรียกว่าเชื่อม Storage จริง

- endpoint matrix และ architecture/security review อ้างอิง source ปัจจุบันและได้รับ approval
- metadata ของ Nexora แยกจาก IssueDesk; migrations ตรวจลำดับและ rollback ได้
- ทุก mutation ตรวจ session, ownership, permission และ provider capability ฝั่ง server
- logical IDs คงเดิมเมื่อ rename/move; frontend ไม่รู้ physical path หรือ provider credential
- upload/download เป็น streaming; failure, retry, size limits และ partial operations มี behavior ที่กำหนด
- Trash, restore, Favorites และ Share เป็น persistent และมี authorization checks
- lint/build, tests ที่เกี่ยวข้อง และ browser QA desktop/mobile ผ่าน; รายงานเฉพาะผลที่รันจริง
- เอกสารและสถานะ deploy/migration แยกชัดจาก local validation

## ขอบเขตและแนวทางที่ต้องรักษา

- IssueDesk เป็น reference ด้าน architecture/UI; Nexora ยังคงเป็น Private Cloud/File Management ไม่ copy business logic หรือ auth assumptions โดยไม่ตรวจสอบ
- ใช้ `cx()` กับ JSX `className` ทุกจุดที่สร้างหรือแก้; helper นี้รวม string/falsy values และไม่ได้ merge Tailwind conflicts
- ใช้ shared `Button` และ Liquid Glass styles ที่มีอยู่; sheen, pointer light และ inset rim ของปุ่มปรับตามสีตัวอักษรให้เห็นบนพื้นสว่างและมืด รักษา keyboard, focus-visible, reduced-motion และ responsive behavior
- ห้าม deploy, migrate remote D1, เปลี่ยน secrets, แก้ข้อมูล Storage หรือเปลี่ยน Shared Storage Service หากไม่ได้รับ authorization แยก
- รักษาไฟล์และการแก้ไขเดิมใน checkout; ไม่เปลี่ยน dependency เพียงเพื่อ workaround ปัญหา local environment

## แผนที่ไฟล์ปัจจุบัน

- `src/App.jsx`, `src/layouts/AppLayout.jsx`, `src/components/layout/`: route และ shared shell
- `src/context/FilesProvider.jsx`, `src/context/files-context.js`, `src/hooks/useFiles.js`: demo workspace state และ remote File Browser context
- `src/hooks/useRemoteFilesState.js`, `src/utils/storage-files.js`: remote listing/navigation/Favorites/Recent/Trash state and breadcrumb validation
- `src/components/files/`: connected File Browser listing, selection toolbar, item actions and folder dialog
- `src/pages/WorkspacePage.jsx`: Dashboard, Recent, Favorites, Shared, Trash, Storage, Settings
- `src/data/files.js`: fixtures; metadata ตัวอย่างไม่ใช่สถานะ Storage จริง
- `src/context/AuthProvider.jsx`, `src/hooks/useAuth.js`, `src/services/auth.js`: frontend authentication state/client
- `src/context/StorageProvider.jsx`, `src/hooks/useStorage.js`, `src/services/storage.js`: authenticated mount discovery, capabilities, object listing/pagination, Favorites, Recent, folder actions and Trash clients
- `README.md`, `AGENTS.md`, `docs/DESIGN_SYSTEM.md`: project status, working conventions และ UI foundation
- `docs/STORAGE_API_AUDIT.md`, `docs/STORAGE_ARCHITECTURE.md`, `docs/STORAGE_API_V1_PROPOSAL.md`, `docs/PHASE_8.md`, `docs/PHASE_8_5.md`, `docs/PHASE_9_1.md`, `docs/PHASE_9_2.md`, `docs/PHASE_9_5.md`, `docs/PRODUCTION_PROVISIONING.md`: source audit, API contract, phase reports and provisioning guide

## เริ่มงานต่อใน session ใหม่

อ่าน `PROJECT_HANDOFF.md`, `AGENTS.md`, `README.md`, phase reports ที่เกี่ยวข้อง แล้วตรวจ `git status --short`. Phase 9.5 local checks are recorded in `docs/PHASE_9_5.md`; Phase 9.6 mock browser QA is recorded in docs/PHASE_9_6.md; remaining live-provider and production QA must be completed before release. Phase 9.5 production behavior remains unverified. รอบนี้ไม่ได้ deploy หรือแก้ข้อมูล production.

## กติกาการดูแลเอกสาร

ทุกครั้งที่แก้ source หรือ behavior ให้ซิงก์ `README.md`, `AGENTS.md` และ `PROJECT_HANDOFF.md` ในงานรอบเดียวกัน โดยบันทึก scope, สถานะ demo/backend และผลตรวจจริง; แยกสิ่งที่ยังไม่ได้ตรวจหรือยังไม่ได้รับอนุมัติออกจากรายการที่เสร็จแล้ว

## Phase 9.6 — Current handoff (2026-10-28)

Implemented locally: owner `/api/shares` list/create/get/revoke, explicit secret rotation at `POST /api/shares/:id/replace`, anonymous `/api/public/shares/:id/:secret` metadata/objects/download/preview, Share dialog plus single-selection action, persistent `/shared`, and public `/s/:shareId/:secret` outside authentication/workspace providers.

Apply additive `0002_public_shares.sql` only under a separately approved deployment/migration request. One active owner/mount/object record; only token SHA-256 stored. User approved creation-session memory only with explicit Replace after refresh; old links stop working on replacement/revocation. No server plaintext token, browser persistent token, encryption/key setup, expiry, passwords, public writes, user invitations, or provider share capability was added.

Authorization checks mount ownership, stat/list/download capabilities, logical ancestry with 64-hop/cycle bounds and final revalidation. Public metadata omits parent/mount/owner/project/provider references. Preview reuses existing safe streaming policy and never writes Recent; owner Open in Files supplies validated abbreviated route state and is explicit owner access. No folder cache invalidation on sharing mutations.

Checks passed: lint, 117/117 tests, normal build, diff check. Browser QA used a temporary localhost Vite harness, real Nexora handlers, in-memory SQLite and mocked Storage, with file/folder sharing, Copy, public metadata/text Preview/Download, nested navigation, Replace/Revoke, refresh secret loss, Shared, Open in Files, focus/Escape and 390 × 844 wrapping/no horizontal overflow. A navigation-state bug found by QA was fixed and covered by a regression test. Fresh browser tab had no console warnings/errors. Large binaries, provider races, image/PDF rendering and live production remain pending; see [Phase 9.6](docs/PHASE_9_6.md).

## Phase 9.7 — Current handoff (2026-10-28)

Bulk Move and Move to Trash reuse the existing single-object API, run with concurrency 2, report progress and partial results, preserve failed selections, and invalidate only affected folder listings/subtree metadata. Upload Retry is manual and guarded against duplicate enqueue; queued Cancel prevents the request, while active Cancel aborts the request through `AbortController` without claiming upstream rollback. Upload concurrency remains 2 and byte progress remains indeterminate.

Metrics remain unavailable: Nexora `/usage` returns `status: unavailable` with null fields, and this source tree has no aggregate upstream metrics client. No recursive scan or capacity estimate was added. Dashboard/Storage share the same usage state and manual refresh behavior.

Checks passed: `pnpm lint`, `pnpm test` (118/118), `pnpm exec vite build --configLoader runner --outDir /tmp/nexora-phase-97-build`, and `git diff --check`. Browser/mobile and production verification are pending. No remote migration, deployment, D1, Storage data, secrets, or Cloudflare configuration was changed. See [Phase 9.7 report](docs/PHASE_9_7.md).

Pre-existing changes to package.json, pnpm-lock.yaml and pnpm-workspace.yaml were preserved. Dependencies were hydrated from the existing lockfile without changing versions. No commit/push/deploy/remote migration/secrets or production Storage changes occurred.
