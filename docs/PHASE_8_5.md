# Nexora — Phase 8.5: Frontend Authentication

สถานะ: implement เสร็จใน local checkout; ยังไม่ได้ deploy หรือทดสอบ login กับ production. Phase นี้เพิ่ม auth UX ก่อน Phase 9 แต่ยังไม่เชื่อม FilesProvider กับ Storage API.

## Architecture

- `AuthProvider` อยู่ใต้ `BrowserRouter` และดูแล session restore, user identity, login, logout และ retry เมื่อ bootstrap ล้มเหลว.
- `src/services/auth.js` มีเฉพาะ auth requests และ safe return-path helper. Requests ใช้ same-origin credentials; browser ไม่อ่านหรือเก็บ HttpOnly cookie.
- `ProtectedRoute` ครอบทุก route ของ Nexora workspace. `FilesProvider` และ `AppLayout` อยู่ภายใน protected route จึงไม่ render demo/files shell ก่อนทราบ session state.
- `GET /api/auth/me` คืน user เมื่อ session ใช้ได้, 401 เปลี่ยนเป็น unauthenticated, ส่วน network/server/malformed response เป็นสถานะ unavailable พร้อมปุ่มลองใหม่ โดยไม่มี automatic retry loop.
- เมื่อกลับมาที่แท็บหรือหน้าต่าง foreground จะ re-check `/api/auth/me`; 401 จะล้าง frontend user state และ route จะพากลับ `/login`. Transient error ระหว่าง re-check จะคง UI ไว้; backend ยังคงเป็น authorization boundary.

## Routes and flows

All workspace routes are protected: `/`, `/files`, `/dashboard`, `/recent`, `/favorites`, `/shared`, `/trash`, `/storage`, `/settings`, and unknown workspace paths. `/login` is public. Loading state shows a small session-check screen; app shell/demo content is not mounted until authentication succeeds. An authenticated visit to `/login` redirects to its safe internal return path when present, otherwise `/files`.

Unauthenticated route redirects preserve only an internal pathname/search/hash in React Router state. External, protocol-relative, backslash-containing, and `/login` destinations are rejected. Successful login posts the exact Phase 8 JSON `{ email, password }`; the server performs email normalization. A generic message covers invalid/inactive accounts, with a separate rate-limit message and a generic temporary-service error. Password is cleared after success and is never logged.

The Header displays the API-provided display name with deterministic initials and a Sign out action. Logout makes a same-origin `POST /api/auth/logout`; it never edits the HttpOnly cookie. A failed logout keeps the user signed in and shows a safe retry message.

## Security review

- No session token is placed in React state, localStorage, sessionStorage, IndexedDB, or a URL. Auth context exposes only email, display name, and role, not the internal user ID.
- No production storage credentials or Shared Storage project ID are imported into frontend modules. `STORAGE_APP_SECRET` and `CF_ACCESS_CLIENT_SECRET` remain server-side.
- Route guards are UX only. Backend sessions, same-origin checks, and ownership checks remain authoritative; frontend does not grant access based on role.
- Return navigation uses an origin-checked internal path; no open redirect.
- Initial bootstrap gates all protected routes and mounts no AppShell while loading or unauthenticated.
- Login shows only safe messages selected from known error codes; it does not expose backend response text, stack traces, or account existence details.
- Existing demo file state remains local/in-memory and is not connected to Storage API.

## Unsupported features and production notes

There is no registration, password reset, verification, OAuth, admin UI, or Remember Me. Session validity is checked at app bootstrap and when the tab/window becomes active; without an API request or a focus/visibility change, the client cannot observe a server-side expiration immediately. Any later authenticated API client must clear auth state on an authentication 401.

The operator supplied that production D1, admin and mount records, Shared Storage app/project/access token and secrets are already provisioned and tested. The operator also reported a production provisioning CLI output-parser issue despite verifying the records directly. Phase 8.5 did not run provisioning, modify production records/secrets, or change the provisioning CLI. Do not rerun provisioning as part of this phase.

## Validation

- `pnpm lint`: passed.
- `pnpm test`: passed; Node tests cover auth request contract, unauthenticated vs unavailable session responses, safe messages, response filtering, logout behavior, and internal return-path validation alongside Phase 8 backend/provisioning tests.
- `pnpm build`: passed.
- `git diff --check`: passed.
- Local browser smoke test used a temporary localhost-only mock auth endpoint and a disposable QA identity: unauthenticated `/settings` redirected to sign in, successful login returned to `/settings`, workspace displayed `QA Operator`, authenticated `/login` redirected to `/files`, and sign out returned to `/login`. A wrong-password attempt displayed only “Email or password is incorrect.” A mocked 503 rendered the unavailable gate without workspace content and still allowed the user to reach the sign-in form. The login layout was checked at the default desktop viewport and 390 × 844. No production URL, account, or secret was used.
- No React component test framework exists in the project; no new dependency was added. Production login, expired-cookie behavior on the deployed app, mobile navigation/interaction, and supported browser matrix remain operator/manual smoke tests.

## Manual production smoke test

Using the deployed Nexora origin and an operator-approved provisioned account:

1. Open a protected route such as `/settings`; verify the login page appears before workspace content.
2. Enter the account email/password and sign in; verify the requested route opens and the Header shows the returned display name.
3. Reload; verify session restore keeps the user signed in. Confirm browser storage does not contain a session token.
4. Sign out; verify `/login` appears. Reopen `/settings`; verify it redirects to `/login`.
5. With an approved test session, expire/revoke it through the team's normal server-side process, then foreground the tab or reload; verify `/login` appears. Do not modify production account or session data merely to run this check.
6. Test a wrong password only if the operator approves that attempt; verify the generic error and avoid repeated attempts that could trigger rate limiting.

Do not report production authentication as verified until these checks have been completed by the operator on the deployed application.
