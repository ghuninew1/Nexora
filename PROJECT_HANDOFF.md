# Nexora — Project Handoff

## Dark theme palette — 30 ตุลาคม 2026

- ปรับ `src/index.css` เฉพาะ Dark tokens ให้พื้นหลังและ surfaces เป็นดำอมฟ้า `#090d12` ใกล้ Sites ลดสีเขียวในพื้นที่กว้าง; คงมินต์ไว้ที่ primary/accent/chart และไม่เปลี่ยน Light mode
- ตรวจ `AGENTS.md`, `README.md` และ handoff ให้ตรงกับ source; `pnpm build` และ `git diff --check` รอบปรับเฉดนี้ผ่าน
- ยังไม่ได้ตรวจภาพใน browser หรือ deploy; โหมด Light และ production ยังไม่ได้ตรวจใน browser

อัปเดตล่าสุด: 2026-10-28

**Current status: Nexora v1 — Feature Complete.** ส่วนสรุป v1 ท้ายเอกสารเป็น handoff ปัจจุบัน; รายงาน phase ด้านล่างเป็นประวัติและแยก local validation จาก production evidence.

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
- UI follow-up: คิวอัปโหลดล้างรายการที่สำเร็จอัตโนมัติหลัง 5 วินาที; รายการผิดพลาดหรือยกเลิกยังคงอยู่จนกว่าจะล้างเอง.
- UI follow-up: หน้าต่างเลือกปลายทาง Copy/Move สร้างโฟลเดอร์ในตำแหน่งที่เลือกได้เมื่อมีสิทธิ์ โดยปุ่มอยู่ด้านล่างซ้ายในแถวเดียวกับ Cancel.
- UI follow-up: File Browser list/grid แสดงไอคอนตามชนิดไฟล์รูปภาพ วิดีโอ ข้อความ และ PDF โดยไฟล์อื่นใช้ไอคอนทั่วไป.
- UI follow-up: Header กว้างเต็มหน้าจอและ Sidebar desktop เริ่มใต้ Header; mobile Sidebar ยังเป็น drawer; Sidebar responsive; ใช้ `src/assets/logo_full.avif` ตอนขยายและ `src/assets/logo.avif` ตอนพับ; Sidebar NavLinks ใช้ Liquid Glass hover แบบเดียวกับปุ่ม Collapse ใน Light/Dark; File Browser และการ์ด Recent/Favorites มี Liquid Glass hover; Favorites ใน File Browser ยังคงเป็น demo เฉพาะหน้าที่ใช้ demo state
- Favorites navigation follow-up: folder rows now provide the same Open folder action as Recent, and file rows can open their containing folder when parent metadata is available.
- Recent navigation follow-up: Open folder and Open containing folder now navigate to `/files` with the target logical folder and breadcrumb route state. Local lint/build verification pending; production behavior remains unverified.
- Recent preview follow-up: Recent and Dashboard Recent now mount the shared preview dialog; Preview is hidden for unsupported types or known files over the preview limit. Local lint/build verification pending; browser/production behavior is unverified.
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

- `src/App.jsx`, `src/components/layout/`: route และ shared shell
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

- Phase 9.8 adds server-side Activity records for successful authenticated file, Favorites, and public-share mutations, an authenticated owner-scoped cursor API, 180-day/500-event retention, and protected `/activity` UI. Bulk actions log successful objects individually. See `docs/PHASE_9_8.md`; browser QA and production migration/deployment remain pending.

## Phase 9.6 — Current handoff (2026-10-28)

Implemented locally: owner `/api/shares` list/create/get/revoke, explicit secret rotation at `POST /api/shares/:id/replace`, anonymous `/api/public/shares/:id/:secret` metadata/objects/download/preview, Share dialog plus single-selection action, persistent `/shared`, and public `/s/:shareId/:secret` outside authentication/workspace providers.

Apply additive `0002_public_shares.sql` and `0004_public_share_expiry.sql` only under a separately approved deployment/migration request. One active owner/mount/object record; only token SHA-256 stored. User approved creation-session memory only with explicit Replace after refresh; old links stop working on replacement/revocation. Follow-up source adds expiry choices (1 hour, 1 day, 1 month/30 days, never) enforced by public routes and expiry reset on explicit replacement. Shared keeps Copy/Open visible for unexpired links while their secret remains in memory. Migration 0004 has not been applied to production. Local lint/build/diff checks passed; this follow-up's tests and browser QA were not run. No server plaintext token, browser persistent token, encryption/key setup, passwords, public writes, user invitations, or provider share capability was added.

Authorization checks mount ownership, stat/list/download capabilities, logical ancestry with 64-hop/cycle bounds and final revalidation. Public metadata omits parent/mount/owner/project/provider references. Preview reuses existing safe streaming policy and never writes Recent; owner Open in Files supplies validated abbreviated route state and is explicit owner access. No folder cache invalidation on sharing mutations.

Checks passed: lint, 117/117 tests, normal build, diff check. Browser QA used a temporary localhost Vite harness, real Nexora handlers, in-memory SQLite and mocked Storage, with file/folder sharing, Copy, public metadata/text Preview/Download, nested navigation, Replace/Revoke, refresh secret loss, Shared, Open in Files, focus/Escape and 390 × 844 wrapping/no horizontal overflow. A navigation-state bug found by QA was fixed and covered by a regression test. Fresh browser tab had no console warnings/errors. Large binaries, provider races, image/PDF rendering and live production remain pending; see [Phase 9.6](docs/PHASE_9_6.md).

## Phase 9.7 — Current handoff (2026-10-28)

Bulk Move and Move to Trash reuse the existing single-object API, run with concurrency 2, report progress and partial results, preserve failed selections, and invalidate only affected folder listings/subtree metadata. Upload Retry is manual and guarded against duplicate enqueue; queued Cancel prevents the request, while active Cancel aborts the request through `AbortController` without claiming upstream rollback. Upload concurrency remains 2 and byte progress remains indeterminate.

Metrics remain unavailable: Nexora `/usage` returns `status: unavailable` with null fields, and this source tree has no aggregate upstream metrics client. No recursive scan or capacity estimate was added. Dashboard/Storage share the same usage state and manual refresh behavior.

Checks passed: `pnpm lint`, `pnpm test` (118/118), `pnpm exec vite build --configLoader runner --outDir /tmp/nexora-phase-97-build`, and `git diff --check`. Browser/mobile and production verification are pending. No remote migration, deployment, D1, Storage data, secrets, or Cloudflare configuration was changed. See [Phase 9.7 report](docs/PHASE_9_7.md).

Pre-existing changes to package.json, pnpm-lock.yaml and pnpm-workspace.yaml were preserved. Dependencies were hydrated from the existing lockfile without changing versions. No commit/push/deploy/remote migration/secrets or production Storage changes occurred.


## Phase 9.8 — Current handoff (2026-10-28)

Local implementation adds `migrations/0003_activity_events.sql`, centralized best-effort writer/API in `functions/_lib/activity.js`, mutation/share integration, and protected `/activity` page. Events are session-owner scoped and success-only; metadata is action-allowlisted and excludes secrets. Retention is 500/user and 180 days. Bulk Move/Trash reuses per-object routes with no duplicate batch records. Dashboard activity panel was intentionally skipped.

`pnpm lint`, `pnpm test` (125/125), standard `pnpm build`, and `git diff --check` passed. Browser QA is not claimed. Production migration/deployment and live provider behavior remain unverified; no production state was touched.


## Phase 9.9 — Current handoff (2026-10-28)

Added `docs/BACKUP_RECOVERY.md` and `docs/PHASE_9_9.md`. Audit identifies Nexora D1 migrations 0001–0003, authoritative Storage API SQLite metadata and Garage metadata/object data, with project/bucket/reference dependencies. Inspected config pins Garage v2.1.0, SQLite metadata, and replication factor 1; actual production paths and current deployment remain operator-confirmed. D1 export syntax was checked using Wrangler v4.154.0 help; no remote command or backup was run.

Phase 9.9 originally reported HIGH findings in the adjacent IssueDesk repo: a tracked Garage RPC secret and tracked runtime SQLite/WAL/SHM artifacts under the Compose data mount. A later handoff records that the config/artifacts were removed from the index and the example secret replaced with a placeholder, with those changes staged/uncommitted at that time. Contents were not read; the adjacent checkout was not re-verified in Phase 10.1. Historical secret use and database-artifact classification remain unresolved; treat historical secret material as exposed and use a separately authorized operator process for any rotation or history cleanup. No production or IssueDesk changes were made in Phase 10.1.

Backup policy/runbook specifies 7 daily/4 weekly/3 monthly, off-device copy/3-2-1 target, checksums, isolated restore-first ordering, and end-to-end validation. No backup job, tooling, production change or restore drill exists yet. Rate limiting beyond login, published Compose port exposure, public capability-path log redaction, and production Access policy verification remain documented follow-ups; static and API security headers are implemented locally in Phase 10.1. RPO/RTO and deployment controls require operator decisions. The unstaged ActivityPage edit was preserved.


## Nexora v1 — Feature Complete (authoritative handoff, 2026-10-28)

The source baseline is feature-complete for v1. Package version is already `1.0.0`; no tag, commit, deploy, or release action was made. The product includes administrator-provisioned login/session routes (no public self-registration), protected connected File Browser with object lifecycle and safe preview, Favorites/Recent, partial-success Bulk Move/Trash, retry/cancel upload queue, owner-managed public view/download shares, separate Activity, and Dashboard/Storage with “Not reported” usage unless the provider returns authoritative metrics. See [docs/V1_RELEASE.md](docs/V1_RELEASE.md).

Final verification: `pnpm lint` passed; `pnpm test` passed 125/125; `pnpm build` passed; `git diff --check` passed. Browser QA was not run in this finalization. Source/local checks do not verify production deployment. User-reported 9.2/9.3 production smoke tests are historical; Phase 9.6/9.8 migrations and later local code were not deployed/verified here.

Backup/recovery design is documented in [docs/BACKUP_RECOVERY.md](docs/BACKUP_RECOVERY.md); automated backup is absent, isolated restore has not been drilled, and production restore was not performed. Garage replication factor 1 remains. In adjacent IssueDesk, Storage API runtime SQLite/WAL/SHM artifacts are no longer tracked and ignored; their historical data classification still needs operator confirmation. `garage/garage.toml` has been removed from the adjacent IssueDesk index while its local ignored operator copy was preserved. The tracked example was scrubbed to an explicit placeholder and verified without printing values. These changes are staged/uncommitted there. Prior history may contain RPC secret material; treat it as exposed, confirm production use, and rotate only in a separately approved Garage operation. No history rewrite was done. No secret rotation, remote D1, QNAP/Docker action, migration, deploy, or production data change was performed.

Deferred: Global Search, backup automation and isolated restore drill, optional sharing and bulk capabilities, version history, WebDAV/SMB, resumable upload, advanced metrics, and multi-node Garage. RPO/RTO, backup destination/schedule, platform rate-limits, direct service port exposure and edge log redaction remain operator decisions. Phase 10.0/10.0.1 are closed by operator confirmation; see the current handoff below.


## Phase 10.0 — Production Readiness (2026-10-28)

Production Readiness passed by operator confirmation on 2026-10-28. The operator confirmed production D1 `nexora-db` has migrations 0001–0003 applied and the smoke path for domain, login/Files/Storage, Upload/Download/Preview/Rename/Move/Copy, Public Share and Activity passed. These are not tool-verified results. Migrations must not be reapplied solely for verification. `wrangler.jsonc` configures Pages project `nexora` and D1 binding `DB` / `nexora-db`; current deployment revision, production binding presence and Access policy remain unknown. Source requires server-side `STORAGE_API_URL`, `STORAGE_APP_SECRET`, `CF_ACCESS_CLIENT_ID`, and `CF_ACCESS_CLIENT_SECRET`; optional timeout/upload-size bindings have defaults. Session cookie is Secure/HttpOnly/SameSite=Lax; API mutations enforce same-origin; no permissive CORS is present in source.

Read-only Wrangler checks for Cloudflare and HTTPS checks for both Nexora domains failed at DNS/network resolution. This is a Work environment limitation, not evidence of a production outage. The local `.dev.vars` was not opened; no secret values were read or disclosed. The phase performed no production config/data/deployment change. See [Phase 10.0](docs/PHASE_10_0.md) and [Phase 10.0.1](docs/PHASE_10_0_1.md) for operator-confirmed versus tool-verified details.


## Phase 10.0.1 — Live Production Verification (2026-10-28)

Phase 10.0 passed based on operator-confirmed production smoke checks and migrations 0001–0003 on 2026-10-28. The reported smoke checks are not tool-verified. DNS/network resolution prevented independent Cloudflare/domain checks; this does not indicate production outage. Current Pages revision, binding names/presence, Access service-token routing, and edge behavior remain unverified. No production request with credentials, data mutation, config change, migration, or deploy occurred during the verification. See `docs/PHASE_10_0_1.md`.

## Phase 10.1 — Security Finalization (2026-10-28)

Audit-first security review and local source hardening are complete; see [docs/PHASE_10_1.md](docs/PHASE_10_1.md). Production browser inspection identified the blocked inline bootstrap as Cloudflare JavaScript Detections, which loads `/cdn-cgi/challenge-platform/scripts/jsd/main.js`. Because the snippet is Cloudflare-injected and contains request-specific values, its hash is not a stable allowlist entry. `functions/_middleware.js` now creates a fresh nonce CSP for each HTML response and disables HTML caching; static asset security headers remain in `public/_headers`, and API responses retain their route CSP. Cloudflare documents support for parsing CSP nonces and attaching them to injected scripts. This source fix is local; it has not been deployed or production-verified. No Cloudflare configuration, production resource, feature, dependency, or UI design changed. Regression coverage is in `tests/security-headers.test.js`; checks and production follow-up are recorded in `docs/PHASE_10_1.md`.

MUST operator/production gates remain: confirm historical adjacent IssueDesk secret use and runtime DB artifact classification; verify direct Storage/Garage ingress controls; configure edge rate limits for login, public share, transfers and costly APIs; redact share capability paths from platform logs; independently verify Pages/Access/bindings before a future deployment. The repo handoff records adjacent IssueDesk cleanup staged/uncommitted and no history rewrite; this pass did not inspect its current checkout or secret values. No secret rotation, history rewrite, Cloudflare change, deploy, remote D1, Storage/Garage/Docker/QNAP action or production data change occurred.


## Phase 10.1.1 — Production Security Gates (2026-10-28)

Read-only audit report: [docs/PHASE_10_1_1.md](docs/PHASE_10_1_1.md). The operator reported checking every Nexora production function after the Phase 10.1 CSP fix and confirmed all worked without errors; record this as operator-confirmed, not tool-verified. Safe history metadata confirms the adjacent IssueDesk Garage RPC secret appeared in Git history, but production use is unknown; no value was read and no rotation/history rewrite was performed. IssueDesk Compose publishes Storage API and Garage ports on host interfaces; public reachability is unknown without firewall/router/QNAP/Tunnel evidence. Cloudflare rate controls, capability-path log redaction, and live Pages/Access/bindings/headers remain MUST operator gates. Production DNS checks could not resolve either Nexora hostname in this environment. No infrastructure, runtime, secret, deployment, or production data changed.


## File Browser clipboard (local implementation)

The authenticated workspace keeps an in-memory file clipboard for multi-selection Copy and Cut. Paste uses the existing copy or move APIs; copy remains available for repeated paste, while successful cuts are removed and failed items remain. The toolbar supports Copy, Cut, Paste and Rename; selection count and Clear selection appear beside the search and sorting note. Cut items appear faded, the list header labels the Favorites column with a non-interactive star, and clipboard and operation messages can be dismissed individually. Ctrl/Command+C, X and V operate on files outside editable fields; Escape clears the clipboard. Paste requires a ready destination and matching storage; cross-storage transfers are unavailable. Folder cuts reject known descendants and destinations whose ancestry is unavailable. Existing provider errors, including name conflicts and missing items, are reported. The clipboard is discarded on workspace unmount, logout, expiry, account change or reload, and is never persisted.

Local validation: `pnpm lint` and focused clipboard utility tests passed. The full test suite has failing public-share tests (share creation returned HTTP 400 instead of 201); clipboard keyboard, session lifecycle, UI and live-provider flows still need browser/integration QA. No build, deployment, migration or production data changes were performed for this feature.
