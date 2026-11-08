# Development Progress

## Current pointer
T03 — Settings and profile management UI

## Overall status
IN PROGRESS — T00–T02 complete. Validated data layer exists; no user-facing features yet.

## Completed tasks
- T00 — Repository reconnaissance and implementation plan
- T01 — Bootstrap extension shell (2026-11-08)
- T02 — Domain models, schemas, and storage (2026-11-08)

## Current task notes
- T03 not started.
  - UI must use `getRepositories()` from `@/storage`. ESLint blocks `browser.storage`, `chrome.storage`, `localStorage`, `sessionStorage` and `indexedDB` outside `src/storage/`.
  - The API key is not stored yet. T03 or T04 must add it as its own storage key (not inside `settings`) so it can be masked and cleared on its own.
- T02 result:
  - Schemas (Zod 4.6.7) live in `src/core/schemas/`: settings, target site, search keywords, applicant profile and profile state (current + history), job posting, job match, application draft. Domain types are inferred from the schemas (`src/core/domain`).
  - Changes from the CLAUDE.md contracts:
    - `JobMatch` gained `id`, `profileId`, `profileVersion` and `evaluatedAt`.
    - `ApplicationDraft` gained `profileId` and `profileVersion`.
    - Optional job fields reject empty strings, so a missing field stays absent instead of becoming a blank value.
  - Storage in `src/storage/`:
    - A `KeyValueStore` interface, with an in-memory implementation and a `browser.storage.local` adapter.
    - Each stored value is wrapped in a versioned envelope `{ schemaVersion, data }`, with step-wise `migrations[n]` (n→n+1) and write-back after migrating.
    - Data with a newer schema version than the app supports raises `unsupported_version` and is never overwritten.
    - A typed `StorageError`: `corrupt`, `unsupported_version`, `migration_failed`, `invalid_input`, `not_found`, `io`. Messages never include stored values.
    - Recovery: `recover()` moves the raw value to a `quarantine:<key>:<ts>` key, then the item reverts to defaults.
    - Collections validate each record separately. Invalid records are reported, kept through unrelated writes, and removed only via `discardInvalid()`, which quarantines them first.
    - Profile history: each content change creates a new version and the previous one is kept (cap 20). `restore(v)` re-saves an old version as the newest one, so nothing is lost.
    - First run seeds and persists the OnlineJobs.ph default site. Removing it does not bring it back.
  - Manifest now requests `permissions: ["storage"]`. Chrome shows no install warning for it.
  - Known limitation: the write lock only covers one JS context (popup, options page or background worker on its own). Simultaneous writes from the popup and the background could race; route writes through the background in T06 if that becomes real.
  - Dependency added: `zod` (runtime validation, named in the CLAUDE.md stack).
- T01 result:
  - Scaffolded with `pnpm dlx wxt@0.21.5 init wxt-scaffold -t react --pm pnpm --no-git` in a scratch dir, then merged by hand.
  - Template demo files dropped: the sample content script (which matched `*://*.google.com/*`), `react.svg`/`wxt.svg` and the demo CSS.
  - Layout: `srcDir: 'src'` → `src/entrypoints/{background.ts,popup/,options/}`, `src/core/`, `src/styles/`; `public/icon/` stays at root (per WXT project-structure docs).
  - Manifest: MV3, `permissions: []`, no host permissions, no content scripts, `options_ui.open_in_tab: true`.
  - Strict TS adds `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride` and `noFallthroughCasesInSwitch` on top of WXT's base tsconfig.
  - ESLint flat config: `@eslint/js` + `typescript-eslint` strict + `react-hooks` + `eslint-config-prettier`, plus `no-eval`/`no-implied-eval`/`no-new-func` as errors.
  - Vitest uses `WxtVitest` from `wxt/testing/vitest-plugin`.
  - `pnpm check` runs typecheck → lint → format:check → test → build.
  - `.gitignore` replaced with WXT/Node entries; `/graphify-out` kept.
  - The dev guide is in `README.md`.
- Dependencies added in T01 (all dev tooling, none at runtime beyond react/react-dom):
  - vitest (unit tests)
  - eslint, @eslint/js, typescript-eslint, eslint-plugin-react-hooks, globals (lint)
  - prettier, eslint-config-prettier (formatting)
  - web-ext (WXT's dev-mode browser runner; it was in the template)
- Chrome load verification:
  - Chrome 157 ignores `--load-extension` (the service worker the first attempt found was Chrome's built-in `thunk.js`, not ours).
  - Verified instead with a throwaway Node script in the session scratchpad (not committed): headless Chrome with `--remote-debugging-pipe --enable-unsafe-extension-debugging`, isolated temp profile, CDP `Extensions.loadUnpacked`.
  - The pages were opened as tabs, not as the toolbar popup. A manual "Load unpacked" check by the user is still recommended.
  - Formal browser E2E (Playwright) is T12.

## Repository state (verified 2026-11-08)
- Git: branch `master`, remote `origin` = https://github.com/ow3ndesu/job-application-assistant.git, working tree clean.
- Commits: `0e1daff chore: initial` (adds `.gitignore`, `CLAUDE.md`, `PROGRESS.md`), `a7d85c1 chore: add /graphify-out to .gitignore`.
- Tracked files: `.gitignore`, `CLAUDE.md`, `PROGRESS.md`. Untracked/ignored: `graphify-out/`.
- No `package.json`, source, tests, or project-level `.claude/` directory.

## Environment (verified 2026-11-08)
- OS: Windows 10 Pro 10.0.19045. Shells: PowerShell 5.1 and Git Bash.
- Node: v24.18.0 · npm: 11.16.0 · pnpm: 12.18.0. pnpm was installed via `npm install -g pnpm` because `corepack enable` failed with EPERM (no admin rights). Corepack 0.35.0 is present but not enabled.
- yarn: not installed (not needed).
- Python: not on PATH (the `python` command is the Microsoft Store alias stub). Graphify runs on its own uv-managed Python at `%APPDATA%\uv\tools\graphifyy\Scripts\python.exe`, so the project needs no system Python.
- uv: 0.13.7 · git: 2.55.0.windows.2.

## Graphify (G01 status: mostly verified, not yet signed off)
- Project: Graphify by Graphify-Labs, https://github.com/Graphify-Labs/graphify. Package `graphifyy` v0.9.104, installed via `uv tool install` (`uv tool list` shows `graphifyy v0.9.104` with `graphify` and `graphify-mcp` executables). CLI path: `~/.local/bin/graphify`.
- Claude Code integration: user-wide skill at `~/.claude/skills/graphify/SKILL.md`, referenced from the global `~/.claude/CLAUDE.md`. No project-scoped install (`graphify install --project` not used). No MCP server configured.
- Existing graph: `graphify-out/` built 2026-11-08 from `CLAUDE.md` and `PROGRESS.md` only (49 nodes, 44 edges, 12 communities). It is gitignored, so it stays local only.
- Validation: `graphify explain "T05"` returned the correct node and neighbours. `graphify path` ran (no directed path between the chosen nodes, which is expected).
- Privacy: the indexed files are only the two docs, so no secrets or profile data. `cost.json` records 88,776 output tokens, meaning the semantic extraction of the Markdown docs went through an LLM.
- Remaining for G01 sign-off (after T01 has code):
  - Run `graphify update .` and check that it indexes code.
  - Confirm the build and tests work without Graphify.
  - Add a `.graphifyignore` (or equivalent; check the docs) excluding `.env*`, profiles, fixtures with personal data, and `.output/`.

## Official documentation checked (2026-11-08)
- WXT: https://wxt.dev/guide/installation.html. Command `pnpm dlx wxt@latest init`. The version selector shows v0.21.5. No Node version requirement is stated on that page.
- Claude API: https://platform.claude.com/docs/en/api/overview (docs.anthropic.com now 301-redirects to platform.claude.com).
  - Base URL `https://api.anthropic.com`, Messages endpoint `POST /v1/messages`.
  - Headers: `anthropic-version` (example `2026-10-21`), `content-type: application/json`, and either `Authorization: Bearer <key>` or the legacy `x-api-key`.
  - Models API `GET /v1/models` can supply the model allow-list.
- Claude models: https://platform.claude.com/docs/en/about-claude/models/overview. Current IDs are `claude-fable-5-1`, `claude-opus-5-5`, `claude-sonnet-5-5` and `claude-haiku-5-5`.
  - **Correction:** the previous note said `claude-sonnet-5` was "current". It is a legacy model (still available). Re-check at T04.
- OnlineJobs.ph robots.txt (https://www.onlinejobs.ph/robots.txt): asks all crawlers for a 5-second delay, blocks some minified-asset and job-seeker-picture paths, and fully blocks SEMrush bots.
- OnlineJobs.ph Terms (https://v2.onlinejobs.ph/terms, which www.onlinejobs.ph/terms-of-service redirects to):
  - §7.4 requires personal use "without the use of any automated means including but not limited to the use of robotic tools" unless OnlineJobs expressly permits it.
  - §4.6: the account is exclusive to the user.
  - §7.5: no unauthorized access.
  - §10.3: breach can lead to termination.
  - These are summaries of the fetched text, not legal advice.
- Not yet verified (check at T04): whether direct browser/service-worker calls to the Messages API need a CORS opt-in header, and its exact name. Do not hardcode one from memory.

## Decisions
- Target: Chrome Manifest V3 (Edge-compatible).
- Stack: WXT + TypeScript + React, Zod, Vitest, ESLint + Prettier, pnpm. Matches CLAUDE.md; no material deviation, so no user re-confirmation needed.
- AI provider: Anthropic Claude behind an `AIProvider` interface. The model is user-selectable from a list populated or validated via `GET /v1/models`, defaulting to a current ID chosen at T04.
- Initial job site: https://www.onlinejobs.ph/jobseekers
- Profile format: user-editable Markdown/plain text.
- Application submission: human approval required.
- **OnlineJobs.ph interaction mode (user decision, 2026-11-08, Q1 = option a):**
  - Read only. The extension extracts job data only from OnlineJobs pages the user has opened in their own tab.
  - No background fetching, crawling or automatic pagination of OnlineJobs pages.
  - No form filling or submission on OnlineJobs. The user applies manually using copy/export of the generated draft.
  - Reason: ToS §7.4 bans "automated means". This narrows T05 (current-page extraction only), T06 ("scan" means the user-opened page(s), not crawling) and T09 (the manual copy/export path only, for OnlineJobs).
  - Revisit only if OnlineJobs grants written permission.
- **API credentials (user decision, 2026-11-08, Q2):** BYOK only. The user enters their own Anthropic API key, stored locally with a clear disclosure. No hosted backend for the MVP.

## Architecture review — issues identified in T00
1. **OnlineJobs.ph ToS §7.4 vs. automated discovery and form filling (material; affects T05, T06, T09).** Background scanning, pagination crawling and assisted form fill may count as "automated means". The safest compatible design:
   - The extension only reads pages the user has opened themselves (user-initiated, per-tab, `activeTab` / optional host permission).
   - No background fetching of OnlineJobs pages.
   - Requests no faster than the robots.txt 5 s delay.
   - Copy/export as the default application path; form fill only if the user accepts the risk.
   - Needs a user decision before T05.
2. **MV3 service worker lifetime.** The background worker can be terminated while idle, so long scans and AI calls must be resumable and keep their state in storage, not in memory. Use `chrome.alarms` for pacing; don't rely on `setTimeout` loops.
3. **Permissions.** Use `optional_host_permissions` for each job site and for `https://api.anthropic.com/*`, requested at runtime. Avoid `<all_urls>`.
4. **BYOK key storage.** `storage.local` is plain on-disk storage and unencrypted for practical purposes. Disclose this in the UI. Keep the key only in the background context and never pass it to content scripts.
5. **Model IDs change.** Don't hardcode model IDs in the domain layer. Keep a configurable default plus a validated list from the API.
6. **Profile data volume.** Sending the full profile for every job match is costly and is a privacy cost. Consider caching (prompt caching) and an explicit disclosure of what is sent. Decide at T07.
7. **`.gitignore`** is a Next.js template. Fix it in T01.

## Blockers / questions
- None open.
- Note: `corepack enable` needs admin rights here. The dev guide (T01) should document `npm install -g pnpm` as the fallback.

## Last completed task
- T02 — Domain models, schemas, and storage (2026-11-08)

## Last validation — T02 (2026-11-08)
- `pnpm check` exit 0. Vitest: 6 files, 57 tests passed. Coverage:
  - schema accept/reject cases
  - CRUD for settings, sites, keywords, profile and jobs
  - corrupt envelopes and corrupt records
  - error messages do not leak stored values
  - migrations (success, missing, throwing)
  - newer-version protection
  - quarantine/recover, IO failure wrapping
  - serialized concurrent updates
  - persistence across fresh repository instances via WXT `fakeBrowser`
- ESLint isolation rule checked: `browser.storage` and `localStorage` in `src/entrypoints/popup/*` → 2 errors; the same code in `src/storage/` → clean.
- Real browser-restart persistence (headless Chrome 157, persistent temp profile, extension loaded via CDP): wrote a `settings` envelope from `options.html`, closed Chrome completely, relaunched and read back the same value; the extension id was unchanged.
  - This checks the platform's persistence for this extension. Repository behaviour on top of `storage.local` is covered by the `fakeBrowser` tests.
- Popup and options still render with 0 console errors (smoke re-run). Built manifest `permissions: ["storage"]`.

## Validation — T01 (2026-11-08)
- Repo: `pnpm typecheck` exit 0; `pnpm lint` exit 0; `pnpm format:check` exit 0; `pnpm test` exit 0 (1 file, 1 test passed); `pnpm build` exit 0 (`.output/chrome-mv3`, about 232 kB).
- Clean copy (tracked and unignored files only, copied to the scratchpad): `pnpm install --frozen-lockfile` succeeded, then `pnpm check` exit 0.
- Built `manifest.json`: `manifest_version: 3`, `permissions: []`, `background.service_worker`, `action.default_popup: popup.html`, `options_ui.page: options.html`.
- Headless Chrome 157.0.8103.38 smoke check:
  - Extension loaded and its service worker `background.js` was present.
  - `popup.html` rendered its `<h1>`, with 0 console errors and 0 warnings.
  - `options.html` rendered its `<h1>`, with 0 console errors and 0 warnings.

## Validation — T00 (2026-11-08)
- `git status` / `git log` / `git ls-files` / `git remote -v`: clean tree, 2 commits, 3 tracked files, GitHub remote.
- `node --version` v24.18.0; `npm --version` 11.16.0; `pnpm --version` 12.18.0; `corepack --version` 0.35.0.
- `python --version`: not found (Store alias). `uv --version` 0.13.7; `uv tool list` shows graphifyy v0.9.104.
- `graphify --version` 0.9.104; `graphify explain "T05"` succeeded; `graphify path ...` ran.
- WebFetch of the WXT installation docs, the Claude API overview, the Claude models overview, OnlineJobs.ph robots.txt and the OnlineJobs.ph Terms (contents summarized above).
