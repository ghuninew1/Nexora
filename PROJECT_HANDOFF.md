# Nexora — Project Handoff

## Phase 1.2.2A.2 registry and grants — partial, 4 November 2026

- Source audit found that Shared Storage project IDs are scoped to a service database and apps, while Nexora's client has no authenticated stable service-instance/app identity to bind a project registry to the current URL and credential. A URL or self-declared namespace alone cannot verify this binding. Trusted project-reporting provisioning authority is also unresolved.
- No migration, authorization helper, provisioning endpoint or grant was added because an unverified namespace could authorize a different project after configuration changes. The existing usage response remains unavailable, and no aggregate, Shared Storage, preset or production behavior was changed. See `docs/PHASE_1_2_2_USAGE_AUDIT.md` for the minimum identity and authority work required; requested reporting authorization tests remain outstanding.
- Validation: `pnpm lint`, `pnpm test` (166 Node tests and 11 UI tests), `pnpm build`, and `git diff --check` passed. Existing tests use in-memory SQLite and mocks; no new registry tests were possible because no registry was implemented.

## Phase 1.2.2A.1 usage authorization policy — design complete, 4 November 2026

- Audited roles, assignment, mount/project ownership, app credentials and IssueDesk consumers. The policy in `docs/PHASE_1_2_2_USAGE_AUDIT.md` requires an active assignment plus a canonical, explicitly provisioned project reporting owner or an active admin with an explicit project grant. Mount ownership and admin role alone are insufficient; no preset changes are proposed.
- Documented proposed additive registry/grants, no automatic backfill, session and authorization rechecks, legacy unavailable compatibility, alias deduplication, Shared Storage app/project checks, race limitations and security test plan. This is design only: no policy schema, enforcement, aggregate API, UI, shared-service modification, migration or production work was performed. Real reporting remains unavailable.
- Validation: `git diff --check` passed. No executable changes were made in this phase; lint, tests and build were not rerun. The prior phase's existing test changes remain in the working tree.

## Phase 1.2.2A usage contract — partial, 4 November 2026

- Inspected Nexora assignment/usage paths and the separate Shared Storage service source. Documented proposed exact decimal-string logical recorded bytes, Trash, incomplete data, consistent aggregation, authorization, deduplication, error semantics and existing-client compatibility in `docs/PHASE_1_2_2_USAGE_AUDIT.md`.
- No explicit project-total reporting permission exists and Shared Storage has no aggregate endpoint. Usage remains unavailable; no Shared Storage changes, API implementation, UI, quota enforcement, migration, deployment or production access. Added a local test of the existing placeholder's auth, aliases and absence of upstream requests; it is not an aggregation test. Aggregate, precision, authorization-policy and consumer compatibility tests remain blocked on implementation.
- Validation: `pnpm lint`, `pnpm test` (166 Node tests and 11 UI tests), `pnpm build`, and `git diff --check` passed. Tests use in-memory SQLite and mocks; no real-provider or production QA was run.

## Phase 1.2.2 storage usage — partial, 4 November 2026

- Audited Nexora's existing usage endpoint, assignment and catalog paths, and the separate Shared Storage service's schemas, routes and Garage adapter without reading runtime data. Findings and proposed contract are in `docs/PHASE_1_2_2_USAGE_AUDIT.md`.
- No trustworthy aggregate API, quota definition or per-user accounting is available. Project-scoped logical metadata totals would need a reviewed shared-service change and explicit handling of missing sizes, Trash, shared access, duplicate project mappings and consistency. No reporting API, overview, enforcement, file behavior, migration or deployment was changed. Real-provider, browser and production QA remain outstanding.
- Validation: `pnpm lint`, `pnpm test` (165 Node tests and 11 UI tests), `pnpm build`, and `git diff --check` passed. No new reporting tests were added because reporting was not implemented; temporary-D1 browser QA was not run.

## Storage assignment — partial follow-up, 3 November 2026

- The user reports migration 0009 applied; this was not independently verified. Added an isolated assignment lookup and permission gate intersecting grants with provider capabilities, mount read-only, maintenance and sharing policy. It is not wired into runtime routes, discovery or UI; existing owner-only behavior remains in force. Public share lifecycle and all assignment integration remain outstanding.
- `pnpm lint`, `pnpm test` (156/156) and `git diff --check` passed. The new test uses in-memory SQLite and a mocked provider. No build, browser QA, deployment or remote migration was performed.

## Storage assignment — partial, 3 November 2026

- The user reports migration 0008 applied; this was not independently verified. Added `0009_storage_access_defaults.sql` to enforce one assignment default per user and backfill existing mount owners without overwriting existing assignments. This migration has not been applied. Existing user preferences and provider mappings are unchanged.
- Assignment APIs, UI, discovery and runtime permission enforcement remain unimplemented. Owner-only authorization remains in force. Do not deploy this as a completed assignment system.
- `pnpm lint`, `pnpm test` (155/155, including an in-memory migration test) and `git diff --check` passed. Build and browser QA were not run; no deployment or remote migration was performed.

## Storage permission mapping — groundwork only, 3 November 2026

- Added and tested a standalone fail-closed storage-route permission map and a preliminary intersection of grants, provider capabilities, read-only and maintenance. These helpers are not wired into runtime authorization or the UI. Phase 1.5 assignment remains incomplete; owner-scoped routes and public-share behavior are unchanged. No migration, deployment or production change was performed.
- `pnpm lint`, `pnpm test` (154/154) and `git diff --check` passed. No browser or provider QA was performed.

## Storage assignment Phase 1.5 — groundwork only, 3 November 2026

- Added additive `0008_storage_access.sql` with per-user/mount permission columns, uniqueness and dependency constraints, plus a standalone strict permission validator. Neither is connected to discovery, authorization or UI. Existing owner-scoped storage behavior remains authoritative; no assignment can be made or exercised yet. No owner backfill or remote migration was performed.
- Remaining work: design and implement admin assignment/revoke endpoints and UI, permission mapping at every storage/Trash/Favorites/Recent/share endpoint, effective capability intersection, default selection and revoked-access behavior. Existing share links need a deliberate public authorization path independent of a former assignee's membership. Preserve provider mappings and protect existing owners. Do not claim Phase 1.5 complete or deploy this schema as a functioning permission system.
- `pnpm lint`, `pnpm test` (152/152) and `git diff --check` passed; the migration test used in-memory SQLite. Browser, provider and production verification were not performed. See `docs/PHASE_STORAGE_ASSIGNMENT.md`.

## Password policy — partial Settings Phase 2, 3 November 2026

- Admin can set minimum password size to 8/10/12/14/16 UTF-8 bytes and require lowercase, uppercase and a number. App user creation and password change enforce the policy server-side; forms retrieve and show the current requirements. Existing passwords are not changed. Explicit admin provisioning scripts remain out-of-band and retain their 12-byte baseline, without consulting D1; this is a remaining policy gap.
- The user reported that migration 0007 is ready; this was not independently verified. No deploy, migration or production data change was performed. Phase 2 and Phase 3 remain incomplete.
- `pnpm lint`, `pnpm test` (150/150), `pnpm build`, and `git diff --check` passed. Browser/device and live D1 QA remain pending.

## Session policy — partial Settings Phase 2, 3 November 2026

- Admin can configure lifetime of new sessions (1, 7, 14, 30 days) and max active sessions (1, 3, 5, 10, unlimited). Login applies the selected lifetime to cookie and server expiry and inserts the session plus revokes oldest excess sessions in one D1 batch while preserving the new session. Existing sessions retain their expiry when the setting changes. Default lifetime is 14 days and max is 10; current source had no session ENV fallback. The public config endpoint explicitly excludes session settings.
- Other Phase 2 work and Phase 3 remain incomplete. No migration, deploy or production data change was performed. Browser and live D1 verification remain pending.
- `pnpm lint`, `pnpm test` (149/149), `pnpm build`, and `git diff --check` passed, including session policy and public config tests.

## Public share expiry policy — partial Phase 2, 3 November 2026

- Added admin settings to require expiration and cap new or replacement public-link lifetimes at 1, 7, 30 or 90 days. The server rejects `never` when expiration is required and clamps longer lifetimes to the configured maximum. The owner dialog adjusts choices to the effective policy. Existing links are not altered.
- `pnpm lint`, `pnpm test` (148/148), `pnpm build`, and `git diff --check` passed. Browser/device and live-provider QA remain pending. Phase 2 and 3 remain incomplete; no migration, deployment or production change was made.

## Public sharing controls — partial Phase 2, 3 November 2026

- Added admin-only switches for new public-share creation and public downloads in the existing system settings table. Disabled creation leaves existing links intact; disabled downloads block the public download API while metadata and supported preview remain available. The public UI hides download controls and shows previews independently. Already delivered bytes and preview content cannot be recalled or technically prevented from being saved by recipients.
- Phase 2 remains incomplete: branding, upload/extension, expiry and session/password policies are not implemented. Phase 3 notifications, audit and email remain unimplemented. No migration, deploy or production change was performed.
- `pnpm lint`, `pnpm test` (147/147), `pnpm build` and `git diff --check` passed. Tests cover role/validation and existing-link, creation, download and preview behavior. Browser/device and live-provider verification remain pending.

## Settings Phase 1 — source implementation, 3 November 2026

- Added account-backed theme synchronization, validated default storage selection (explicit accessible route, then preference, then first active mount), and Change Password using the existing PBKDF2 helper. Password change commits hash update and revocation of other sessions in one D1 batch, keeping the current session. Unsupported duplicate rename/replace are disabled in UI and rejected by the API; pre-existing unsupported values resolve to conflict reporting.
- Phase 1 behavior and its deferred conflict modes are inventoried in `docs/PHASE_SETTINGS_3.md`. No Phase 2/3 work, migration, deploy or production change was made. Browser/device and live-provider verification remain pending.
- Local validation: `pnpm lint`, `pnpm test` (146/146), `pnpm build`, and `git diff --check` passed. Tests cover password verification/session revocation, password confirmation and storage selection; UI interactions and live D1 behavior were not browser-tested.

## File preferences — partial, 3 November 2026

- Settings now saves default file sort/direction, single-item Move to Trash confirmation, and public-share expiry alongside upload preferences. File Browser uses the default until a temporary sort choice is made, preserves it across folder navigation, and supports type sorting. Skipping confirmation applies only to a single normal Move to Trash; bulk and permanent deletion still confirm. Share creation/replacement accepts 7d and 30d as well as existing choices.
- Theme, default storage, upload conflict behavior and password change are not integrated; Phase 2 and Phase 3 are unfinished. No migration or production changes were made. Browser/device and live-provider QA remain pending.
- `pnpm lint`, `pnpm test` (143/143, including 7d/30d share expiry), and `git diff --check` passed. The new preference UI and queue behavior have not been browser-tested.

## Upload preferences — 3 November 2026

- Added shared authenticated preference loading and a Settings form for upload concurrency (1, 2, 3, 5) and automatic clearing of completed uploads. The real queue consumes both values; before the request completes or if it fails, the previous two-upload/auto-clear behavior remains. Already active transfers are not cancelled when the limit is reduced. Disabling auto-clear cancels pending dismissal timers. Existing unsupported rename/replace behavior is not presented as functional.
- Phase 1 remains incomplete: theme, sort, deletion, conflict behavior, default storage, share expiration and password change are not integrated. Phase 2 and Phase 3 remain incomplete. No migration or remote operation was performed.
- `pnpm lint`, `pnpm test` (142/142, including upload preference API validation) and `git diff --check` passed. Browser interaction, queue timing and live-provider QA were not performed.

## Settings audit and partial follow-up — 3 November 2026

- Audited Settings phases 1–3 against current source in `docs/PHASE_SETTINGS_3.md`. Connected the existing logout-other-sessions API to Account with a confirmation dialog; the current session is retained. Maintenance now blocks normal-user Favorites mutations server-side as well as storage and share mutations.
- Most Phase 1 preference integrations, Phase 2 policies and all Phase 3 notifications/audit remain incomplete. No mail provider was found in source; no provider secrets or remote infrastructure were inspected. No migration, production deployment or data change was performed.
- `pnpm lint`, `pnpm test` (142/142) and `git diff --check` passed; browser and production QA were not performed.

## Administrator user management — 3 November 2026

- Admin Settings links to `/admin/users`, backed by admin-authenticated `GET/POST /api/admin/users` and `PATCH/DELETE /api/admin/users/:id`. Admins can create ordinary users, edit name/email, activate/deactivate and delete; new accounts do not automatically receive storage. Admin accounts cannot be edited or deleted through these routes, and user deletion is blocked when any mount remains. Passwords use the existing 12-byte minimum and hash helper.
- User list is limited to 500, and account creation and deletion are local application features; no production data was touched. Profile images remain unimplemented.
- `pnpm lint`, `pnpm test` (142/142) and `git diff --check` passed. Tests cover admin authorization, origin validation, duplicate emails, activation, deletion and mount safeguards. Browser/device and live D1/provider QA were not performed; no migration or deployment was run.

## Account page — partial, 3 November 2026

- Header account control opens `/account`, showing the current email and role and allowing display-name edits. `PATCH /api/auth/me` checks authentication, same origin and a strict field allowlist; it updates only the session owner. No migration is needed for this portion.
- Profile images remain unimplemented. User deletion is now blocked for accounts with storage mounts; see the later user-management entry above.
- `pnpm lint` and `pnpm test` (141/141) passed, including session ownership, origin and input validation. Browser and device QA were not performed. No production change was performed.

## Settings Phase 2 — partial maintenance controls, 3 November 2026

- Added `0007_system_settings.sql`, admin-only `GET/PATCH /api/admin/settings`, public `GET /api/config`, and a maintenance control in Settings. Only `maintenanceMode` and `maintenanceMessage` are implemented. The server checks the current D1 policy on user storage/share mutations; admins still pass ordinary ownership and capability checks. Public reads and existing shares remain available; in-flight operations are not cancelled. Config banner reloads on window focus and when this tab changes the setting.
- Phase 2 remains incomplete: branding, upload/file type, sharing, session/password and other requested policies are not implemented. Phase 1 is also incomplete as described below. Quota and registration controls are not advertised; Nexora has no public registration and no authoritative quota enforcement. Existing upload limits remain in force.
- `pnpm lint` and `pnpm test` (140/140) passed, including admin authorization, mutation blocking and existing public reads. Browser, device and live-provider QA were not performed. No local or production migration, deployment, or production data changes were performed. Apply migration 0007 before deploying code that gates writes; coordinate this separately with an authorized operator.

## Settings Phase 1 — work in progress, 3 November 2026

- Added migration `0006_user_preferences.sql` and authenticated `GET/PATCH /api/settings/preferences` with server defaults, strict field validation, owner-scoped active mount validation and same-origin mutation protection. `POST /api/settings/logout-other-sessions` revokes only the current user's other sessions.
- This is backend groundwork, not a completed Settings feature: the existing Settings page and client behaviors do not consume these preferences; change password, safe duplicate rename, share expiry integration, and all other requested UI integrations remain to be implemented. The existing theme remains browser-local. Do not present Phase 1 as complete.
- `pnpm lint` passed; `pnpm test` passed 138/138 including preference and session checks. Browser/regression QA, local migration application, production migration and deployment were not performed. Review README and AGENTS for current source; no user-facing Settings behavior changed.

## Sidebar Liquid Glass hover — 1 พฤศจิกายน 2026

- คืน Liquid Glass hover ให้ NavLink แต่ละรายการเหมือนปุ่ม Collapse รวมแสงตามเมาส์ ขอบและเงา พร้อมคง active และ focus state เดิม
- ตรวจ `README.md` แล้ว ยังคงตรงกับ source; ปรับ `AGENTS.md` และ design notes ให้ตรงกัน `pnpm lint` และ `git diff --check` ผ่าน; ยังไม่ได้ตรวจ browser หรือ deploy

## Sidebar hover color — 31 ตุลาคม 2026

- ปรับ highlight ที่เลื่อนใน Sidebar ให้ใช้ `--glass-hover` ตามพื้นหลัง hover ของปุ่มในแต่ละธีม โดยคง animation และ active state เดิม
- ตรวจ `README.md` แล้ว ยังคงตรงกับ source; ปรับ `AGENTS.md` และ design notes ให้ตรงกัน `pnpm lint` และ `git diff --check` ผ่าน; ยังไม่ได้ตรวจ browser หรือ deploy

## Sidebar navigation highlight — 30 ตุลาคม 2026

- เพิ่มพื้นหลังสีตามธีมที่เลื่อนระหว่างเมนู Sidebar เมื่อ hover หรือ focus โดยคงสถานะ active แยกไว้ และรองรับ reduced motion
- ตรวจ `AGENTS.md` และ `README.md` แล้ว; `pnpm lint` ผ่าน ยังไม่ได้ตรวจ browser หรือ deploy

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

Activity displays distinct icon colors for Move, Create, Copy, Upload, public-link Replace, and permanent deletion in light and dark themes; action text remains the accessible label.

Dashboard, Recent, Favorites, Trash, and Shared use amber folder icons and primary-colored file icons; unavailable shared items use a neutral icon.

The mobile Sidebar slides in from the left and slides out to the left; reduced-motion preferences disable its transition.

Trash offers Delete permanently all after loading a snapshot of all pages and explicit irreversible confirmation. Deletions use existing per-item APIs; results can be partial, and newly added items are outside the snapshot. Browser and live-provider QA remain pending.

Connected and public file previews use a medium-width dialog on larger screens and retain the mobile layout.

The File Browser list keeps extra space between the Size column and row actions on wider screens.

File preview supports MP4, WebM and Ogg video up to 20 MiB through the existing on-demand preview route. Playback depends on browser codec support; video bytes are buffered before playback, and larger files remain downloadable. Public shares use the same preview policy.

File Browser row action and New menus highlight enabled items on hover or keyboard focus, with a distinct destructive highlight for Move to Trash.

Current working-tree package version is 1.0.1; see [v1.0.1 release notes](docs/V1.0.1_RELEASE.md) for source changes and unresolved validation and production gates. Earlier version statements describe their historical phase.

The README is a project overview and development guide; detailed implementation history, validation, and outstanding operational gates remain in this handoff and the release notes.

Documentation preference: README contains project information, setup and usage; record all changes, validation and follow-up in PROJECT_HANDOFF.md.

## Shared expiry timer follow-up — 30 ตุลาคม 2026

- จำกัดเวลารอของ timer หน้า Shared ไม่ให้เกินขอบเขต browser แล้วตรวจเวลาหมดอายุซ้ำสำหรับลิงก์อายุยาว; secret ยังคงอยู่ในหน่วยความจำ session เท่านั้น การคง Copy Link หลัง reload/login ต้องเลือกแนวทางจัดเก็บเพิ่มเติม
- ตรวจ `pnpm lint`, `node --test tests/share-expiry.test.js` และ `git diff --check` ผ่าน; ยังไม่ได้ทำ browser QA หรือ deployment

## Shared link recovery — 30 ตุลาคม 2026

- ลิงก์ใหม่/Replace เก็บ secret เข้ารหัส AES-GCM ใน D1 พร้อม hash สำหรับตรวจ capability และส่งคืนเฉพาะ owner ที่เข้าสู่ระบบ เมื่อยัง active และไม่หมดอายุ; ไม่เก็บ secret ใน browser storage. Revoke ล้าง ciphertext และ Replace ใช้ compare-and-swap. ลิงก์เก่าที่มีแต่ hash ต้อง Replace เพื่อกู้คืนข้ามอุปกรณ์ โดยลิงก์เดิมจะใช้ไม่ได้หลัง Replace
- ต้องตั้ง `SHARE_ENCRYPTION_KEY` เป็น base64 ของ random 32 bytes แบบ server-only และคง key เดิมข้าม deployment; key หายหรือเปลี่ยนทำให้กู้คืน secret เก่าไม่ได้ ต้อง Replace. ต้อง apply migration `0005_share_secret_encryption.sql` ก่อนใช้ revision นี้; ยังไม่ได้ตั้ง secret, migrate หรือ deploy production. ห้ามเผยแพร่ค่าคีย์หรือ bearer URLs ใน logs
- Timer ในหน้า Shared จำกัด delay ภายใน browser limit สำหรับ expiry 30 วัน. Browser/live-provider QA ยังไม่ทำ
- ตรวจ `pnpm lint` และ `git diff --check` ผ่าน; `pnpm test` ผ่าน 135 tests ก่อนเพิ่มการทดสอบ encryption แยก ซึ่งผ่านเพิ่มเติม 1 test. การทดสอบ share fixtures เดิมถูกปรับให้ใช้ expiry และ migrations ปัจจุบัน

## File Browser grid cards — 30 ตุลาคม 2026

- ปรับ Grid view ให้ใช้การ์ดสี่เหลี่ยมจัตุรัสและจำนวนคอลัมน์ตามหน้าจอ โดยคง selection, Favorites, การเปิดโฟลเดอร์ และเมนูรายการ; List view คงเดิม
- ตรวจ `pnpm lint` และ `git diff --check` ผ่าน; Browser QA ยังไม่ทำ และไม่ได้ deploy หรือเปลี่ยนข้อมูล production

## File Browser column sorting — 30 ตุลาคม 2026

- หัวคอลัมน์ Name, Modified และ Size ใช้เรียงรายการที่โหลดแล้ว กดซ้ำเพื่อสลับทิศทางและแสดงลูกศรตาม state เดียวกับ sort menu; Modified/Size ใช้เมนูได้บนจอแคบ
- ตรวจ `pnpm lint` และ `git diff --check` ผ่าน; Browser QA ยังไม่ทำ และไม่มี deployment หรือ production change

## File Browser Modified timestamp — 30 ตุลาคม 2026

- แสดงเวลาโดยไม่แสดงวินาทีตามหลังวันที่ Modified ตาม locale ของ browser และขยายคอลัมน์ให้รองรับข้อความ; sorting ยังคงใช้ timestamp เดิม
- ตรวจ `pnpm lint` และ `git diff --check` ผ่าน; Browser QA ยังไม่ทำ และไม่มี deployment หรือ production change

## File Browser Modified timezone — 30 ตุลาคม 2026

- เปลี่ยน Modified เป็นเขตเวลา Asia/Bangkok แบบ 24 ชั่วโมงพร้อมวินาที; sorting ใช้ timestamp เดิม
- ตรวจ `pnpm lint`, `git diff --check` และตัวอย่างแปลงเวลา UTC เป็น 18:00:00 ผ่าน; Browser QA ยังไม่ทำ และไม่มี deployment หรือ production change

## File Browser compact list — 2 พฤศจิกายน 2026

- ลดช่องว่างแนวตั้งของแถวและหัวตารางใน List view และจัดปุ่มเมนูกึ่งกลางแถวบนจอแคบ โดยคงปุ่ม Favorites ขนาด 44px; Grid view คงเดิม
- ตรวจ `pnpm lint` และ `git diff --check` ผ่าน; Browser QA และ deployment ยังไม่ได้ทำ

## File Browser row height — 2 พฤศจิกายน 2026

- เพิ่มความสูงขั้นต่ำของแถว List view เป็น 52px โดยคงการจัดกึ่งกลางและขนาดปุ่ม Favorites
- ตรวจ `pnpm lint` และ `git diff --check` ผ่าน; Browser QA และ deployment ยังไม่ได้ทำ

## Assignment API wiring checkpoint

Connected admin assignment CRUD, assignment-based discovery and object-list read authorization. API integration covers assign → member discovery/list → revoke → denied list. Other storage routes and frontend remain pending; do not claim complete. No deploy, remote migration or production verification performed.

## Admin storage catalog

Added admin-only GET /api/admin/storages with safe, bounded catalog fields and truncation flag. Added integration coverage for normal-user denial and omission of provider mapping. Remaining storage assignment integration and UI are not complete. No deployment or remote migration performed.

Validation: lint, tests (158/158), build and diff check passed. Browser QA was not run.

Default storage follow-up: preference writes now validate an active assignment with read grants rather than mount ownership. Discovery parsing retains permissions and assignment defaults; selection uses the admin initial default after an explicit route and user preference. Broad route wiring was attempted and withdrawn after regressions in redirect/diagnostic/capability tests; other routes remain owner-only. Lint/build/diff and the 158-test suite passed after withdrawing that wiring; no browser QA or production operation was performed.

Core storage v1 operations now enforce session-scoped storage assignments, including object reads, transfers, mutations, Trash lifecycle and operation status. See docs/PHASE_STORAGE_ASSIGNMENT.md for the route matrix. Favorites, Recent, Public Share and UI integration remain separate.

Verified locally with in-memory D1 and mocked storage: Viewer, Contributor, Editor and Full Access operations, provider denial, maintenance, read-only, and revoked requests. All 158 tests passed, as did lint, build and diff check. No production operations performed.

## Storage assignment UI checkpoint

Files and Dashboard/Storage empty states now explain when no storage is assigned. Added default-selection coverage for admin initial default, user preference, route override and revoked-default fallback. Admin assignment UI and complete action gating remain outstanding. Lint, 159 tests, build and diff check passed. Browser QA was not run. No production operations were performed.

## Admin storage assignment UI

Users page now includes assigned storage listing and assignment/edit/revoke dialogs using admin APIs. Preset and custom permission dependencies, default badge, loading/error/retry and catalog truncation states are included. User changes cancel or ignore stale requests. Lint, 161 tests, build and diff check passed. Browser and mobile QA were not run, including interactive submit flow. User permission gating, Favorites, Recent and Public Share integration remain pending. No deployment, migration or production mutation was performed.

## User permission gating checkpoint

File Browser capability checks intersect discovery permissions for mutations and download, Preview checks its own permission, Favorite and Share controls use the active assignment, and queued upload starts and retries are guarded. UI gating remains partial: action visibility, all alternate paths, refresh behavior and browser flow need further verification. Admin UI implementation exists but browser QA is not run. Lint, 161 tests, build and diff check were run locally; no production work was performed.

## React Router v8 migration

- Replaced `react-router-dom` 7.18.5 with `react-router` 8.5.1 and updated imports; the declarative route hierarchy, paths, and auth/navigation code were retained. React Router v8 requires Node.js 22.22+ and React/React DOM 19.2.7+; local validation used Node 26.13.0 and React/React DOM 19.3.1.
- Validation: `pnpm lint`, `pnpm test` (161 passed), and `pnpm build` passed. Browser QA was not completed: the Browser plugin is unavailable and Playwright is not installed. Login/logout, protected and public routes, history, query parameters, direct access, refresh, and deployment remain unverified in a browser.

## Public share text wrapping

- Removed conflicting overflow-wrap utilities from two public share headings, retaining `break-words`, which won in the previously generated CSS. `pnpm lint` passed; browser verification was not performed.

## File Browser selection hover

- Improved the selection checkbox border and hover indication across list and grid views, including the list Select all checkbox and grid Select all button. `pnpm lint` and `git diff --check` passed; browser verification remains pending.

## Maintenance message appearance

- The workspace maintenance message retains its top position and now uses a yellow background with centered, dark text. `pnpm lint` and `git diff --check` passed; browser verification remains pending.

## Storage Management Phase 1 — partial (2026-11-04)

The Storage page now lists active storages assigned to the signed-in account, with search, connection filter, details, capability information for the current storage, refresh/error/empty states, and an admin shortcut to the existing Users assignment editor. It uses existing `/api/storage/v1/storages`, capabilities and usage responses via StorageProvider; no schema, API or file data was changed. The assignment default shown is the administrator's assignment default; a user preference may override it. Discovery checks upstream capabilities for each mount and fails as a whole if one fails; a successful response indicates capability discovery, not comprehensive health. Usage remains unavailable from the current API.

Audit: `/api/admin/storages` provides a bounded administrator catalog; user-scoped assignment CRUD and presets already exist on Admin Users. The storage-centric assigned-users view, counts and management are not implemented here. The backend has no storage metadata update, description, connection-test or health-history API. No fabricated settings or health data were added. Admin-wide overview, unavailable/unknown per-storage counts, aggregate usage/quota/percentage, storage-centric assignment CRUD, editable metadata and detailed health require further backend/API design; existing discovery cannot isolate a failed mount. Default preference can be changed in Settings and assignment defaults in Admin Users. Follow-up must also audit the separate Favorites, Recent and public-share authorization paths before assuming full membership enforcement.

Changed: `src/pages/WorkspacePage.jsx`, `README.md`, `AGENTS.md`, `PROJECT_HANDOFF.md`. Local lint and build passed; test results and remaining QA are recorded below. No deployment, remote migration or production validation was performed.

Validation: `pnpm lint`, `pnpm test` (161/161), `pnpm build`, and `git diff --check` passed locally. Existing tests cover storage discovery, permission and assignment APIs and file-operation contracts; no new browser interaction tests were added. Browser, responsive, authenticated admin/user and live-provider QA remain pending.

## Storage Reliability and Admin Overview — Phase 1.1 (2026-11-04)

Supersedes the Phase 1 discovery limitation above. `functions/_lib/storage-api.js` checks assigned mounts independently with a maximum of four concurrent upstream requests. A provider failure preserves that mount with effective permissions set to false, while successful mounts remain available; the list adds `connectionStatus` (`connected` or `unavailable`), with unknown fallback for older responses. A malformed capabilities payload now fails with 502 rather than returning a successful all-false response. This is an additive list field and a deliberate error-handling change for malformed upstream data; consumers must not interpret connection as comprehensive provider health. Existing authenticated assignment and route authorization continue to apply.

`src/pages/WorkspacePage.jsx` shows individual status and retry, plus assignment default, user preference, and effective default using the existing selector. Explicit Files route selection still takes precedence. Retry checks the chosen mount then refreshes discovery so permissions are recalculated; aborts protect the page after unmount and StorageProvider already guards refresh sequence/account scope. `src/components/storage/AdminStorageOverview.jsx` uses the existing admin-protected `GET /api/admin/storages`; it displays counts for returned entries and warns if the 500-row catalog is truncated. This API does not provide provider type, per-storage assignment counts or pagination. Admin assignment edits remain in Users. `src/services/storage.js` retains the safe status field.

Tests cover mixed success/failure and retry through discovery, fail-closed permissions, malformed capability response, and client normalization; existing tests cover admin endpoint authorization and default selection. Browser visit to local Vite reached the session-service error state because Pages Functions/auth were not running; authenticated admin/user screens, retry interaction, stale-response behavior, responsive layout and live provider remain unverified in browser. No schema, production data, Garage configuration, deployment or remote migration was changed.

Final local checks: `pnpm lint`, `pnpm test` (163/163), `pnpm build`, and `git diff --check` passed. Dedicated automated UI tests for admin/user rendering, retry cancellation and displayed defaults remain outstanding; existing tests exercise admin authorization and default resolution rather than those rendered interactions.

## Phase 1.1.1 — Verification and hardening (2026-11-04)

Discovery previously isolated 5xx/429 but an upstream 404 (or another normalized 4xx) could still fail the entire list. `functions/_lib/storage-api.js` now rechecks session-scoped access for any API error from an individual check, omits revoked/inactive assignments, and preserves remaining failed assignments with all permissions false. Session authentication is performed before this handler; admin catalog remains server-protected. No API fields or schema were added. An invalid capability payload continues to produce 502 on the capability route; the public list deliberately classifies both provider errors and invalid responses as unavailable, while missing/unrecognized status is unknown. This avoids exposing provider internals and does not distinguish those causes to the browser.

`tests/backend.test.js` covers mixed provider results for 503, 404, 403 and malformed responses, all-false failed permissions, recovery on subsequent discovery, and maximum four concurrent provider calls. Existing tests cover malformed capability 502, auth and admin catalog authorization, and default resolution. There is no component test framework in the existing Node test setup; automated UI retry failure/success, rapid navigation, stale response, unmount and rendered role/default assertions remain outstanding.

Full-stack browser verification used an isolated temporary Wrangler Pages instance, isolated local D1 with migrations 0001–0009, fictitious admin/user and two mounts, and a localhost mock provider. At the default desktop viewport: admin login showed both catalog entries and mixed assigned statuses; search filtered the list, a failed Retry displayed an error, and admin navigation reached Users. After logout, user login was denied Users and Storage showed no admin catalog. This verifies only those interactions against a mock provider; mobile layout, filter interaction, successful retry, rapid navigation and stale/unmount handling were not browser-tested. Wrangler emitted local file-watcher EMFILE warnings; the server nevertheless started and served the tested flows. No production resources or credentials were used for requests, and no deployment occurred.

Manual QA remaining: run Pages with a separate `--local --persist-to` directory and test-only variables/provider; sign in as each test role, verify filter and retry success/failure, navigate away during delayed responses, switch accounts, and check mobile and desktop layouts. Follow with separately authorized real-provider QA when appropriate.

Final local validation: `pnpm lint`, `pnpm test` (164/164), `pnpm build`, and `git diff --check` passed. Phase 1.1 remains PARTIAL until the outstanding automated UI and browser scenarios above are verified.

## Phase 1.1.2 — UI regression and local browser QA (2026-11-04)

Added Vitest, jsdom and Testing Library as dev dependencies; `pnpm test` retains the Node suite and then runs the UI suite, and `pnpm test:ui` runs the latter alone. `tests/ui/storage-page.spec.jsx` covers user/admin visibility and assignment navigation, assignment/preferred/effective defaults, search/status filter, retry failure, successful refresh and pending-retry unmount. `tests/ui/storage-provider.spec.jsx` covers stale discovery after preference or rapid route changes, and abort/late completion on unmount. Network responses are controlled mocks; the retry-success component test rerenders with the refreshed state. Existing backend tests cover provider 403/404/503, malformed capability data, fail-closed permissions, concurrency and authorization. No production code, API, schema or infrastructure changes were required by Phase 1.1.2.

Browser QA used Wrangler Pages Functions, a separate temporary local D1 and a localhost mock provider. At default desktop size, user Storage showed mixed connection results and default values; the Unavailable filter isolated the failed provider, Retry failure displayed an error, and after the mock provider recovered Retry changed it to Connected and removed it from the unavailable filter. Admin login showed the catalog. At 390 × 844, admin catalog and user Storage were visually inspected, admin navigation reached Users, and a signed-in user was denied that route and did not see the admin catalog. Search was also checked in the prior Phase 1.1.1 local browser run. Full-stack testing did not use a real Storage provider; mock responses do not validate actual provider permissions, networking, object operations or production deployment. Wrangler reported local watcher EMFILE warnings while serving these flows.

Phase 1.1 local UI verification is complete for these scenarios; real-provider integration and production validation remain pending separately.

Final checks: `pnpm lint`, `pnpm test` (164 Node tests and 8 UI tests), `pnpm build`, and `git diff --check` passed. Desktop and 390 × 844 browser layouts were inspected. No real-provider integration was exercised.

## Phase 1.2.1 — Storage metadata management (2026-11-04)

Audit: Nexora `storage_mounts.name` is display metadata and is unique per owner; storage access routes use logical `id` and server-only provider mapping, not the name as a bucket/key identifier. Additive migration `0010_storage_description.sql` adds a non-null description defaulting to empty, preserving existing records. `functions/_lib/admin-storages.js` implements admin-only same-origin PATCH on `/api/admin/storages/:id` with trimmed bounded values, control-character rejection, parameterized updates and owner-scoped duplicate handling. Admin catalog and assigned discovery include description; `src/components/storage/AdminStorageOverview.jsx` provides an edit form with loading, validation, errors, cancellation, duplicate-submission guard, abort on unmount and refreshed lists; assigned users can read description in details. No provider, file, assignment or identifier is mutated.

Backend tests cover admin success, forbidden/unauthenticated requests, invalid input, missing mount, duplicate name, unchanged identifier/mapping/assignment and assigned description. UI tests cover open/cancel, validation, conflict, loading and successful save; existing tests cover user/admin visibility. Local browser QA used an isolated Pages instance, mock provider and temporary D1 with migration 0010 applied: admin edited a test mount and saw the updated name, description and unchanged ID. Browser user, mobile, error and stale-request QA and real-provider/production validation remain pending. Wrangler emitted local EMFILE watcher warnings but served the verified flow.

Deployment of this source requires migration 0010 applied to its target D1 first; production migration and deploy were not performed and require explicit authorization and a reviewed rollout.

Final local checks: `pnpm lint`, `pnpm test` (165 Node tests and 11 UI tests), `pnpm build`, and `git diff --check` passed.

## Phase 1.2.2 — read-only Storage Overview (2026-11-04)

The current user's active assigned mounts now have separate Connected, Unavailable and Unknown counts, a searchable/filterable list, discovery retry, and an explicit usage-unavailable explanation. Counts represent mount assignments, not distinct Shared Storage projects; capability success is not a full health check. The details dialog no longer implies an unavailable description. The existing endpoint returns only null usage and assignments do not authorize project totals, so the page calculates no aggregate and displays no invented bytes, counts, timestamps, quota, percentage or capacity. The separate admin catalog and existing access checks are unchanged. Earlier reporting registry/grant proposals in the audit are historical and outside this phase.

The user reported migration 0010 already applied; this has not been independently verified and it was not rerun. No remote migration, deployment, production data change, Storage/Garage change or file-operation change was performed.

Validation: `pnpm lint` passed; `pnpm test` passed (166 Node tests and 13 UI tests); `pnpm build` passed. UI tests cover counts, unknown/unavailable, admin/user visibility and loading/error/retry with mocks; existing backend tests cover assignment/alias usage boundaries. The available-usage path cannot be exercised against the current placeholder. Responsive classes were reviewed, but mobile layout and real browser/provider/production behavior were not verified. Usage reporting is not complete.

## Large File Transfer — Phase 1 architecture audit (2026-11-07)

- Added `docs/LARGE_FILE_TRANSFER_PLAN.md`: current Browser → Pages → Shared Storage → Garage path, source references, size-limit/buffering inventory, existing Multipart/Range gaps, proposed logical upload sessions/API contracts, state machines, idempotency/reconciliation, cleanup, quotas/resource budgets, browser persistence tiers, download ETag/If-Range and durable sink checkpoints, dependency order and test plan. Updated README and AGENTS document indexes; project runtime behavior remains unchanged.
- Verified from local source: Nexora legacy upload hard-clamps at 25 MiB; upstream default is 25 MiB and still parses/buffers complete uploads. The 20 MiB limit belongs to image/PDF/video preview (text 1 MiB), not ordinary download. Current download streams but lacks end-to-end Range/ETag forwarding and has Nexora default15s/upstream default60s total deadlines. Queue retries whole files in memory and has no persisted resumable sessions or managed download completion visibility.
- Read separate IssueDesk Shared Storage source only (`garage/storage`, starting repository HEAD `0452efb`); did not edit that repository or read secrets/runtime databases. Official Garage documentation/upstream source describe multipart/Range support, but installed version and production behavior were not tested. Source compose image tag does not prove running image. Browser support includes capability detection and Chrome Android picker availability in recent versions, with explicit mobile/background limits.
- Proposal only: 8 MiB parts (1,280 for10 GiB), durable provider-neutral sessions, server authorization on every request/finalize, bounded retries/concurrency, accurate committed-byte progress and native-download fallback. No API/schema implementation or dependency changes. Shared Storage edits, migrations, deployment and production operations require a separately authorized phase. No production requests were made.
- Validation: source/official-reference review PASS; documentation relative-link/source-reference existence checks PASS; `git diff --check` PASS. README/AGENTS reviewed and indexed. Runtime lint/test/build NOT RUN because changes are documentation-only; browser, real provider, interrupted10 GiB transfer, cleanup and production verification NOT RUN. Target support remains unverified until isolated end-to-end and resource/compatibility gates in the plan pass.


## Large File Transfer — Backend resumable multipart (2026-11-07)

- Implemented backend source for the next multipart phase, default disabled. Nexora adds `functions/_lib/upload-sessions.js`, metadata-only `migrations/0011_transfer_sessions.sql`, and `tests/upload-sessions.test.js`; integrates API dispatch, explicit permission mapping, capability negotiation, bounded raw-part streaming, transfer-only headers/deadline, normalized errors and deterministic best-effort upload Activity IDs. Preserved previous Phase1 docs and the existing branch (`main`); no commit/push.
- Nexora exposes logical session create/list/status/verified parts/pause/resume/complete/cancel endpoints. It rechecks authenticated user/current assignment/upload grants, readOnly/maintenance and provider support, pins the original project mapping and strips provider internals. Creator-only cancellation intentionally survives revoked grants/maintenance/readOnly/flag disable. A lost create acknowledgement cancels by stable internal key rather than creating another MPU. Existing small uploads, preview and download routes/UI remain unchanged.
- The user explicitly authorized accessible Shared backend work in this turn. Updated the actual adjacent `../issuedesk/garage/storage` source/tests/docs (not a replacement backend): additive migration0002, real AWS SDK multipart provider, durable SQLite sessions/immutable part-digest journals, reservations, leases and fencing before S3/ack/publication, status/ListParts reconciliation including pagination, serialized completion and idempotent final receipts, fixed7-day expiry, and startup/hourly bounded cleanup including late effects. No Shared dependency version or lockfile change. See its MULTIPART_UPLOADS.md and project handoff.
- Limits in this source:10 GiB declared maximum,8 MiB parts,1280 maximum parts,1 operation/session and4 globally leased part buffers/service DB; Shared20 active sessions/100 GiB pending bytes/project, Nexora10 unfinished sessions/user. These are admission budgets, not physical quota/usage claims. Shared buffers only one bounded part per operation to hash before sending; Pages streams. Multipart/response deadline270s in Nexora and operation240s/lease900s in Shared are isolated-test defaults, not verified proxy compatibility.
- Updated `docs/LARGE_FILE_TRANSFER_BACKEND.md`, linked the implementation from the original plan, and synced README/AGENTS. Actual deviations from the proposal are explicit: fixed7-day TTL, one part operation/session, no unattended finalize worker/fake202, journal pruning deferred. Completing sessions require explicit finalize retry or expiry cleanup; cancellation never deletes a completed file. D1 broker rows cascade on account/mount deletion, while authoritative Shared journals retain pending cleanup until TTL.
- Validation PASS: `pnpm lint`; `pnpm test` with optional bridge enabled (171/171 Node +13/13 UI, no skips); `pnpm build`; Shared `pnpm --dir /Users/ghuninew/GitHub/issuedesk/garage/storage test` (39/39); both repositories `git diff --check`, new-file whitespace/source-copy/documentation-link checks. Tests exercise normal/interrupted uploads, part retry, owner/assignment/CSRF denial, cancellation/expiration, repeated completion, lost create/complete acknowledgement, failed SQL finalize, global admission, stale-worker fencing, remote receipt reconciliation and >1000 provider part discovery. Existing small-file regressions passed.
- Test environment: Shared checkout dependency links were incomplete. Hydrated only a temporary copy using existing declared package ranges; an external temporary Node module-resolution hook let direct-checkout tests and the Nexora→Shared Hono→real adapter bridge use those packages, without editing application dependency files or starting a service. Exact temporary versions: AWS SDK3.1163.0, Hono4.13.16, @hono/node-server2.1.6, better-sqlite3 13.0.3. SQLite was in memory; S3 transport was mocked. This does not verify deployed Node22/Garage/platform behavior. An earlier lint run caught a missing test Buffer import; it was fixed and final lint passed. Initial documentation reference checks in Phase1 needed separate-repository path scoping; final scoped checks passed.
- Unrelated `package.json`/`pnpm-lock.yaml` dependency updates appeared concurrently during this task; they were not authored or reverted here. Final lint/tests/build used the resulting current workspace (Vite8.3.6). Preserve those user/concurrent changes separately from multipart review.
- NOT RUN: real Garage/provider probes, 10 GiB end-to-end checksums, browser/mobile/refresh/restart, resource/load/retention/alert validation, Node22 verification and production operations. No runtime database opened, local/remote migration command, deploy, service start, secret/infrastructure change or production data mutation was performed; migration SQL ran only against disposable in-memory test databases.
- Remaining gates/next: Phase2 isolated real-provider/limits/recovery acceptance is still pending, so keep `STORAGE_RESUMABLE_UPLOADS_ENABLED` off. Review both additive migrations before an authorized target rollout; verify provider marker/checksum/abort/late effects, capacity/rate/timeouts/cleanup backlog/retention. Then implement Phase4 frontend multipart uploader/Transfer Manager and persistence; Range download remains a separate Phase5. No claimed production10GiB readiness.

## Large File Transfer — Phase 3A isolated acceptance preparation (2026-11-07)

- Reviewed `docs/LARGE_FILE_TRANSFER_PLAN.md`, backend report, both AGENTS/handoffs and Shared MULTIPART_UPLOADS.md. Nexora working tree was clean at start on existing `main`; preserved the adjacent Shared Storage backend’s pre-existing uncommitted implementation. Phase3A adds test tooling/documentation only; no runtime application or production-default change.
- Added `scripts/acceptance/{run,provider-worker,support,isolation}.mjs`, non-secret `config.example.json`, and `tests/acceptance-harness.test.js`. The opt-in runner creates new private disposable Nexora/Shared SQLite fixtures, uses real Nexora authorization/routes and actual Shared Hono/@hono-node-server/Garage adapter, and requires an explicitly confirmed empty `nexora-acceptance-*` bucket plus dedicated test-only credentials before any S3 mutation. Default command only writes a BLOCKED report, exit2. It does not discover production credentials or read existing .env/config/DB files.
- Runnable scenarios cover100MiB/1GiB/10GiB when capacity is confirmed, exact size/full streamed SHA-256 through Nexora download, interrupted HTTP socket, same-session resume after Shared child restart, controlled acknowledgements dropped after real SDK success, duplicate completion, cancel/abort, expiry cleanup with explicitly advanced clock, concurrent files, partial-publication/orphan checks, sampled process memory/throughput/retry metrics and optional isolated proxy/slow-part probes. SDK commands are real only when operator supplies a real test provider; none were run against S3 in this task.
- Safety: private journal writes exact provider-key ownership intent before mutation; cleanup verifies scope/marker and refuses foreign resources, deletes only journal-owned exact keys/MPUs, verifies final inventory and leaves the bucket itself. Worker uses only its acceptance-created DB and loopback port; test fixture flags never alter production flags. Parent and child are closed after run, while recovery journal/test DBs are intentionally retained for operator audit. No new dependencies/package changes.
- Actual real-provider result:18/18 scenarios BLOCKED (`NO_ISOLATED_PROVIDER_CONFIG`) in `docs/acceptance/phase-3a-2026-11-07/results.{json,md}`. No docker/podman/garage executable in PATH and no acceptance config/test-only bindings available; only binding presence was checked, no secret values read or printed. No Garage test endpoint/bucket/key was supplied or guessed. Memory/throughput/checksum/retry/orphan/proxy measurements remain null/unverified; mocked regressions are not provider PASS.
- Added `docs/LARGE_FILE_TRANSFER_ACCEPTANCE.md`: repeatable run/config/recovery commands, per-scenario matrix, resource/failure report, source-derived limits and production readiness checklist. Updated backend report link and Nexora README/AGENTS. Synced IssueDesk README/AGENTS/PROJECT_HANDOFF and Shared multipart guide by guarded documentation-only writes; prior runtime source/migrations/test implementation remained unchanged.
- Review findings still open: cleanup startup/hourly20rows/batch and900s lease are source-derived, not deployed scheduler proof; paused/uncertain completion can persist until retry/expiry; journals/tombstones have no pruning and may create recheck backlog; logical budgets are not physical reservations. Need verified rate/CPU/RSS/disk/replication/timeout/alerts/retention controls, delayed-effect rechecks and mapping-freeze procedures. Ordinary15s/60s download deadlines may fail large downloads on slow links; no workaround was applied to mask acceptance failures.
- Validation PASS: `pnpm lint`; explicit recommended ESLint check for acceptance `.mjs` scripts (root config does not apply its recommended-rule block to .mjs); `pnpm test` with optional Shared bridge/worker checks enabled (181/181 Node +13/13 UI,0 skips); `pnpm build`; Shared `pnpm --dir /Users/ghuninew/GitHub/issuedesk/garage/storage test` (39/39); documentation links, both diff checks and new-file whitespace/report-safety checks. Local10-test harness suite covers fail-closed config, reproducible bounded bytes, empty-bucket/cleanup refusal, pagination, bounded retries, sanitized reports, proxy identity and private file permissions. Worker lifecycle test uses actual Shared source and fresh temporary SQLite, observes zero S3 commands, then closes server/child and removes only its own test directory.
- Test environment: reused existing temporary hydrated Shared dependencies via external test-only module resolver and `NEXORA_ACCEPTANCE_TEST_DEPENDENCIES`; no dependency hydration/change in either checkout. `NEXORA_SHARED_STORAGE_ROOT` enables the existing mock-S3 bridge. Tests run on Node26.13.0; Node22/deployed Garage/workerd/browser/mobile verification remain pending. A development-only explicit script lint caught an unused Buffer import, fixed before final checks. Default report command returned expected exit2, not a test failure.
- NOT RUN/BLOCKED: real Garage/S3 calls,100MiB/1GiB/10GiB acceptance, real resource/throughput/failure metrics, full-file provider checksums, real orphan inventories, proxy/Tunnel limits, deployed scheduler/retention/rate controls and production readiness. No remote migrations/deployments/config/secrets, production data or existing runtime DB changes. Only new disposable local SQLite schemas were initialized for the worker test; no persistent service was left running.
- Next: operator prepares isolated Garage/bucket/key, confirms capacity/RSS budgets and optional isolated proxy routes, then runs the documented suite and resolves FAIL/BLOCKED gates with real evidence. Keep feature flags off. Frontend Transfer Manager and Range download remain subsequent phases, not implemented here.

Final audit hardening: the acceptance worker also reports nonterminal and orphaned session metadata, and final no-partial-publication assertions require both counts to be zero; empty physical inventory alone does not prove session cleanup. The focused10-test harness suite and explicit script lint were rerun after this change. All remain local evidence; real-provider18-scenario matrix remains BLOCKED.
