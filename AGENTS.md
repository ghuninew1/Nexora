# AGENTS.md — Nexora

## Scope and current architecture

These instructions apply to the whole Nexora repository. Treat source and configuration as authoritative; docs and sample data do not prove remote credentials, deployed bindings, storage availability, or production behavior.

- React 19, Vite 8, Tailwind CSS v4, React Router 7, pnpm.
- `src/App.jsx` defines routes; `src/layouts/AppLayout.jsx` keeps a shared `AppShell` around the route outlet.
- `src/components/layout/` contains responsive navigation, header, and app shell. `src/components/files/` contains file browser UI. `src/hooks/` owns reusable state. `src/services/` is the intended location for domain API clients as integrations are added.
- `src/index.css` owns design tokens and Liquid Glass primitives. Base UI/shadcn wrappers live in `src/components/ui/`.
- `src/data/files.js` is demo data. `FilesProvider` keeps file state, favorites, recents, and Trash in memory across routes; these demo changes reset when the tab is refreshed. Uploaded browser `File` objects remain local to the current page session.
- `wrangler.jsonc` configures Pages output in `dist/`; it currently has no D1/database binding. The repository currently has no `functions/` or `migrations/` directory.
- IssueDesk and its Garage-backed Storage Service are separate projects. Do not add copied IssueDesk storage/business logic or imply that Nexora currently authenticates to or persists files in that service.

## Project map

- `src/App.jsx`, `src/layouts/`: routing and persistent shared shell.
- `src/context/FilesProvider.jsx`: in-memory file, favorite, recent, and trash state shared across routes.
- `src/pages/WorkspacePage.jsx`: Dashboard, Recent, Favorites, Shared, Trash, Storage, and Settings route views.
- `src/components/navigation/navigation.js`: route labels, icons, grouping, and page descriptions.
- `src/components/files/`, `src/hooks/useFiles.js`: File Browser UI and browser-only domain state/operations. No file API service exists yet.
- `src/hooks/useUploadQueue.js`: current local demo upload queue; it is not a network uploader.
- `src/data/files.js`: fixture entries.
- `src/components/ui/`, `src/utils/cx.js`, `src/utils/glass.js`, `src/index.css`: shared controls, classes, glass interactions, and tokens.
- `README.md` and `docs/DESIGN_SYSTEM.md`: current user-facing project status and design usage.
- `PROJECT_HANDOFF.md`: ordered follow-up plan, current integration boundaries, and acceptance criteria; verify source and git status before continuing.

Check this map against actual files when changing the architecture; update README when any statement becomes stale.

## Working principles

1. Inspect current source, package scripts, git status, and the nearest instructions before editing. Preserve existing user changes.
2. Keep IssueDesk strictly a reference for architecture and design; Nexora remains a private-cloud/file-management product.
3. Keep each phase focused. Avoid adding framework layers, dependencies, or persistent backend contracts without a concrete need.
4. Preserve existing file navigation, selection, dialogs, and upload-queue behavior when improving the browser.
5. Clearly label local/demo-only behavior. Never describe local upload progress as transfer to Garage, QNAP, or a cloud API.
6. Never expose service credentials in `VITE_*`, JSX, client bundles, or browser requests. When integration begins, use a Nexora server-side domain API, ownership checks, and a separately reviewed shared Storage contract.
7. Do not modify or deploy remote infrastructure, D1 data, Storage data, or secrets without explicit authorization.
8. When work changes the UI or file behavior, keep README, this file, and design notes aligned with the resulting source.

## React, JSX, and styling conventions

- Follow existing React/JSX patterns and prefer state derived during render over redundant effects.
- Keep route-level concerns in route/layout components, file behavior in file hooks/services, and presentation in file components.
- Use the existing Base UI and shadcn wrappers before adding new primitives.
- Every JSX `className` prop written or modified must use `cx()` from `src/utils/cx.js`, including static classes and callback return values. Do not use templates, concatenation, arrays, or object maps inside `cx()`; it only filters falsy values and joins strings and does not merge Tailwind conflicts.
- Keep Tailwind class fragments static and semantic. Follow the existing theme tokens, glass utilities, reduced-motion behavior, and mobile-first patterns.
- Keep keyboard access, focus-visible styling, accessible labels, and dialog titles. Clean up effects, listeners, object URLs, and timers introduced by code.
- Show duplicate-name validation inline and associate input errors with the relevant field using `aria-invalid`, `aria-describedby`, and a live alert.
- Use semantic progressbar values and labels for progress indicators, polite status announcements for completion, and sufficiently large touch targets for row actions.
- Keep long breadcrumbs usable on narrow screens and honor `prefers-reduced-motion` for animation and transitions.
- Preserve `Button` Base UI semantics, variants, `ref`, render/slot composition, state-based className callbacks, and caller event handlers when extending the shared component.
- Use the shared `Button` for actions and retain its IssueDesk-referenced Liquid Glass hover behavior; avoid one-off button styling that bypasses the shared variants.

## File Browser behavior

- Logical browser identity is local demo state until a reviewed API exists. Do not pretend fixture IDs or object URLs are stable server file IDs.
- Keep file and collection state in `FilesProvider` so File Browser, Dashboard, Recent, Favorites, and Trash reflect the same in-memory records.
- The upload queue simulates progress; it does not send bytes to a server. A selected browser `File` supports temporary local preview/download only.
- Folder navigation uses the `folder` query parameter on `/files`; validate IDs and safely return to the root for deleted or unknown folders.
- Keep folder navigation and breadcrumbs consistent. For URL folder state, validate IDs and handle deleted or unknown folders safely.
- Search and sort should use normalized fields (name, `modifiedAt`, `sizeBytes`); do not compare display strings such as `"2.4 MB"` as numeric sizes.
- Preserve selection across supported view changes; clear or reconcile it on folder changes, deletion, and filtering where appropriate.
- Revoke object URLs and release upload references when previews or local queue items are removed.
- File Browser delete moves items to in-memory Trash, including folder descendants. Trash restore/permanent delete are local demo operations; label them clearly and confirm permanent deletion.
- Shared entries are illustrative fixture metadata. Do not claim that Nexora creates shares, permissions, or access links until a reviewed server API exists.
- Storage status and capacity must say unavailable when no provider API is connected; never present fixture totals as live provider usage.
- Do not claim preview or download is available for entries without source bytes. Uploaded browser `File` objects can support session-only local preview/download.

## Dependencies and commands

Use pnpm. The current root scripts are:

```bash
pnpm dev
pnpm lint
pnpm build
pnpm preview
pnpm deploy
pnpm cf-typegen
```

There is no root test script. Do not add tests that mirror implementation details. Choose checks appropriate to the requested change and report only commands that were actually run. `pnpm preview` builds and starts Wrangler Pages locally. `pnpm deploy` deploys; it is not a validation command and requires explicit authorization.

When dependencies appear incomplete, inspect the package manager/store and preserve `package.json` and `pnpm-lock.yaml`. Do not change dependency versions merely to work around a local `node_modules` hydration problem.

## Git and completion

- Inspect `git status --short` before editing; preserve pre-existing modifications and untracked work.
- Do not commit, push, deploy, rewrite remote services, or alter production data unless the user explicitly asks.
- Review the final diff for unintended files and `git diff --check` when appropriate.
- Report changes, verification actually performed, and limitations such as demo-only file data or missing backend integration.
