# Nexora — Phase 9.1: Storage Client and Mount Integration

สถานะ: implementation พร้อม local validation; ยังไม่ได้ deploy หรือทดสอบ connection path กับ production. Phase 9.1 ทำ discovery และ connection state เท่านั้น. `FilesProvider`, `useFiles`, fixture data และ upload simulation ยังเป็น demo/in-memory.

The Phase 9.1 task brief reports that Shared Storage S1/S2 is deployed, Garage is the current provider, production Nexora storage credentials/mount are provisioned, and a direct Shared Storage `/v3` capabilities request returned HTTP 200. Those operator-reported facts were not re-verified by this local implementation; the Nexora browser-to-API production flow still needs the smoke test below.

## Architecture and provider composition

```text
BrowserRouter
└── AuthProvider
    └── ProtectedRoute (only renders workspace after authenticated bootstrap)
        └── StorageProvider
            └── FilesProvider (unchanged demo state)
                └── AppLayout / AppShell
```

`src/services/storage.js` calls only Nexora same-origin routes with `credentials: 'same-origin'`. `StorageProvider` owns the storage list, selected active mount, capabilities, optional usage, loading/empty/unavailable state, safe error and `refresh()`. `useStorage()` exposes this state to workspace pages. The provider is mounted only inside authenticated routes, and its bootstrap is deferred to a microtask so the development Strict Mode setup/cleanup cycle cancels the first scheduled start. Requests use `AbortController`; stale and replaced requests cannot update state.

## Bootstrap and API contract

1. After auth state is `authenticated`, call `GET /api/storage/v1/storages`.
2. Keep only valid public storage fields: `storageId`, `name`, `providerLabel`, `status`, and `readOnly`.
3. Choose the first active mount in backend order (the current server sorts by name and ID). No active mount produces `empty`; there is no demo fallback or selector.
4. In parallel, call `GET /api/storage/v1/storages/:storageId/capabilities` and `GET /api/storage/v1/storages/:storageId/usage`.
5. Capabilities are whitelisted and normalized to booleans for fields actually returned by Phase 8, plus a valid `maxUploadBytes`. No File Browser action is wired to these flags in this phase.
6. Usage is auxiliary. Phase 8 returns `status: unavailable` and null metrics; request/shape failure also becomes unavailable without failing a healthy capabilities connection.

No detail request is required because the storage list already returns the safe label/status/read-only fields used by the page. Frontend storage identity is only the public Nexora `storageId`.

## State, authentication, and errors

States are `loading`, `ready`, `empty`, and `unavailable`. A discovery or capabilities failure is unavailable and has an explicit retry. A usage failure does not fail `ready`. Safe errors classify 401, 403, 404, 429, 5xx, network, and malformed responses without presenting upstream bodies. A storage 401 invokes `AuthProvider.expireSession()`, clears public auth state, and lets the existing protected route redirect to `/login`. No automatic retry or polling is used.

## Storage page and security

The Storage page displays the selected public label, status, public provider label, read-only state, capabilities summary and reported usage (or “Not reported”). It includes an accessible status and manual refresh. The page explains that File Browser data and upload progress remain demo-only.

React does not call Shared Storage `/v3`, Garage, or another provider. No Shared Storage project ID, bucket, object key, provider reference, host, or credential is included in service state or UI. Both mount and capability responses are whitelisted; usage is normalized to its public numeric/time fields. New code does not log request/response data or error bodies.

## Tests and local validation

`tests/frontend-storage.test.js` covers same-origin endpoint/credentials, storage normalization, unsafe fields, encoded public IDs, capabilities, optional usage, 401/403/404/429/5xx, malformed responses, network failure and abort behavior. Existing backend/auth/provisioning tests remain enabled. Component test infrastructure is not installed. In-app browser QA used a local mocked API; the production account and connection path remain unverified.

Validation results for this implementation:

- `pnpm lint`: passed
- `pnpm test`: passed, 45/45
- `pnpm build`: passed (Vite reports a 503 kB JavaScript chunk warning)
- `git diff --check`: passed
- In-app browser mock QA: Storage page rendered at `http://127.0.0.1:4173/storage`; showed the safe test mount, connected state, capabilities, “Not reported” usage, and refresh returned to connected. This used a temporary local mock API, not production.
- Production smoke test: pending; no deployment or remote operation was performed.

## Production smoke test checklist

After an authorized deployment, sign in normally and confirm the workspace loads. Open Storage and confirm the provisioned mount's safe name/provider label/status and active capability results. Verify unavailable usage says “Not reported”. Use refresh and confirm it completes without a request loop. Reload while signed in and confirm auth restoration precedes storage discovery. In Network/Console, confirm the browser calls only Nexora `/api/storage/v1/*`, never Shared Storage or Garage; inspect payloads for project IDs/provider references and inspect console output for sensitive data. Confirm a Storage 401 returns the app to `/login`.

## Boundary and limitations

Phase 9.1 stops after authenticated mount discovery, capabilities, connection state and the Storage page. `FilesProvider`, `useFiles`, favorites/recent/trash demo state, fixtures, local previews and simulated uploads remain unchanged. Usage is unavailable because Phase 8 has no authoritative provider metrics. Production deployment, credentials, D1, and the production connection path have not been changed or verified here.

Phase 9.2 has **not** started. Real listing/navigation, create folder, upload/download actions, rename/move/copy, Trash, Favorites/Recent persistence, sharing, preview, range reads and all other File Browser migration work remain out of scope.
