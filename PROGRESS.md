# Development Progress

## Current pointer
T06 — Search orchestration and results UI

## Overall status
IN PROGRESS — T00–T05 complete. The extension can read jobs from an OnlineJobs.ph page you have open (preview only; nothing saved yet).

## Completed tasks
- T00 — Repository reconnaissance and implementation plan
- T01 — Bootstrap extension shell (2026-11-08)
- T02 — Domain models, schemas, and storage (2026-11-08)
- T03 — Settings and profile management UI (2026-11-08)
- T04 — AI provider abstraction and Claude integration (2026-11-08)
- T05 — Site adapter framework and OnlineJobs.ph discovery (2026-11-08)

## Current task notes
- T06 not started. Building blocks from T05:
  - `captureActiveTab()` and `extractPage()` produce validated `JobPosting[]` plus a status.
  - `mergeJobPosting` / `dedupeJobs` / `partitionNewJobs` handle duplicates.
  - `jobs` collection repo (T02) for persistence.
  - Under the read-only decision, a "scan" means: you open the search page (or each result page) yourself, possibly via `adapter.searchUrl(keyword)` opened in a tab, then click "Read jobs from this tab". The extension never fetches pages or follows pagination by itself.
- T05 result:
  - **Site inspection (live):** four public, logged-out requests on 2026-11-08, each more than 5 s apart, using a descriptive user agent: `robots.txt`, `llms.txt`, `/jobseekers`, `/jobseekers/jobsearch`, plus one job post. No more automated requests were made. Raw copies are kept only in the session scratchpad, never committed.
    - `robots.txt`: crawl delay 5 s; disallows only `/min/` and `/jobseekers_pictures/`.
    - `/jobseekers` **redirects to `/login` when logged out**. The public job list is `/jobseekers/jobsearch` (also listed in the site's own `llms.txt`). Search is `GET /jobseekers/jobsearch?jobkeyword=…`; pagination uses offset paths (`/jobsearch/30`).
    - The company name is not shown to logged-out visitors, so it is never extracted (left absent).
    - **Chrome restructures the listing markup.** The server sends each card as `<a><div.jobpost-cat-box>…<a>See More</a>…<a class=badge>…</a></div></a>`. Nested anchors are invalid, so the parser rebuilds it with `div.jobpost-cat-box` as the container. Selectors target Chrome's DOM, which is what the extension captures. happy-dom parses the raw form differently, so fixtures are **Chrome-serialized** (raw synthetic markup run through Chrome 157's parser).
    - The real login form embeds a reCAPTCHA widget, so login detection runs before challenge detection, and a CAPTCHA widget alone never means "blocked".
  - **Framework** (`src/sites/`):
    - `SiteAdapter` with a pure `extract(snapshot)` that never fetches, clicks or navigates; `searchUrl()` only builds a link for the user to open.
    - Typed `ExtractionResult` statuses map to the three categories: `no_results` (not found); `login_required` / `blocked` (could not access); `unsupported_page` / `structure_changed` (structure unsupported).
    - Diagnostics: cards seen, skipped with reasons, duplicates, notes.
    - The registry contains adapter exceptions (they become `structure_changed`); unknown sites become `unsupported_page`.
  - **Capture** (`src/sites/capture.ts`):
    - Uses `activeTab` + `scripting` (no install warnings). There are **no host permissions** in the release build.
    - The in-page function clones the DOM and strips scripts, styles, frames, objects, `on*` handlers and `javascript:` URLs before returning HTML. It does not modify the live page.
    - The result is Zod-validated (size limit 8M characters) and parsed with `DOMParser` (inert).
    - Fix found in E2E: without the stripping, Chrome logged CSP violations for the page's inline handlers while parsing in the popup.
  - **OnlineJobs adapter:**
    - Id `onlinejobs-ph:<numericId>`; canonical source URL; "N/A"-style values are treated as absent.
    - "DATE UPDATED" is kept in `attributes` and is not treated as a posting date.
    - The listing snippet is marked `descriptionSource: listing_snippet`; the detail page as `detail_page`.
    - `contentHash` is SHA-256 of the visible fields.
  - **Schema change** (`JobPosting`): added optional `descriptionSource` and `attributes`. Backwards-compatible, so no storage migration was needed.
  - **Popup:** "Read jobs from this tab" shows the status, the job count, a preview of up to 8 jobs, and diagnostics. It says "Jobs are not saved yet" (saving is T06).
    - Follow-up from your testing: job titles are now links that open the job post in a new tab (https only, via `tabs.create`). "Show all N jobs" expands the list.
    - Verified in the T05 end-to-end run, now 11/11: "Show all" lists 30 jobs, and clicking a title opens the correct job URL in a new tab.
  - **Test-only build flag:** `E2E_HOST_ACCESS=1` adds `host_permissions: ["https://www.onlinejobs.ph/*"]`, because headless Chrome can't click the toolbar to grant `activeTab`. Release builds verified without it.
  - Dependency added: `happy-dom` (dev only; DOM environment for Vitest).
- T04 result:
  - `src/providers/ai/types.ts`: provider-neutral contract.
    - `AIProvider` has `validateCredentials()` and `generateStructured<T>()`.
    - `StructuredRequest` keeps the trusted `system` text separate from untrusted `userContent`.
    - `AIResult<T>` / `AIError`, with fixed, key-free messages for 14 error kinds.
  - `src/providers/ai/anthropic/AnthropicProvider.ts`: official `@anthropic-ai/sdk` 1.6.0 (dependency added).
    - Created with `dangerouslyAllowBrowser: true` because the key is the user's own (BYOK), used only in the background worker. The SDK sends `Authorization: Bearer <key>`, `anthropic-version: 2026-10-21` and `anthropic-dangerous-direct-browser-access: true`.
    - Structured output: `beta.messages.create` with `output_config.format = betaZodOutputFormat(schema)`. `stop_reason` is checked first (`refusal` → refused, `max_tokens` → truncated); then the text is `JSON.parse`d and validated with our own Zod schema.
    - Opus 5.5 and Sonnet 5.5 requests opt into server-side refusal fallback (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`). Haiku 5.5 does not support it, so it is not sent.
    - Timeout 120 s per attempt. `maxRetries: 2`: the SDK retries 408/409/429/5xx and connection errors with backoff and honours `retry-after`. Cancellation via `AbortSignal`.
    - Key validation is `GET /v1/models/{model}` (no tokens generated).
  - `src/providers/ai/anthropic/errors.ts`: maps SDK error classes to kinds, most specific first. SDK messages are never copied; only the `request-id` is kept.
  - `src/providers/ai/index.ts`: `createAIProvider(settings, key)` is the only place that knows the concrete provider.
  - `src/background/`: Zod-validated message protocol plus a handler.
    - Only the extension's own pages are accepted (`sender.id` and `sender.url` must match the extension origin). Content scripts, other extensions and unknown senders are rejected.
    - The key is read in the background and never returned in a response.
  - Options page: a **Test key** button sends `ai/validate-key` through the background and shows a success or error message.
  - ESLint `no-restricted-imports` stops `src/ui/**` and `src/entrypoints/**` (except `background.ts`) from importing `@/providers/*` or `@anthropic-ai/*`. The build confirms the SDK is only in `background.js`.
  - **No host permission is needed.** Probe in headless Chrome: with `permissions: ["storage"]` only, both the options page and the service worker read a cross-origin `401 authentication_error` from `api.anthropic.com` (fake key). The manifest is unchanged and has no install warning.
  - **Default model changed to `claude-opus-5-5`.** This follows the official Claude API guidance to default to the current Opus unless the user chooses otherwise. Sonnet 5.5 (about half the cost) and Haiku 5.5 can still be chosen in Settings.
- T03 result:
  - Options page sections (`src/entrypoints/options/sections/`):
    - **Profile:** edit, save as a new version, import .md/.txt (fills the editor; you save it yourself), export the saved version as `applicant-profile-vN.md`, view and restore previous versions.
    - **Job sites:** add, edit, enable/disable, remove. https only; duplicates are detected after URL normalization.
    - **Keywords and exclusions:** add and remove. Case-insensitive duplicates are rejected, including across the two lists.
    - **AI provider:** Anthropic plus a model picker; the API key field is a password input.
    - **Scan limits:** the delay is at least 5 s.
    - **Your data:** separate controls to delete the profile, delete jobs and matches, delete drafts, reset settings/sites/keywords, remove the key, and delete everything. Each uses a two-step confirm.
  - The popup shows status: profile version, number of enabled sites, and whether a key is set (yes/no only).
  - **API key handling:**
    - Stored under its own `secrets` storage key, separate from `settings` (`SecretsRepository`).
    - The UI can only check whether a key exists, save one or remove one. The key is never read back into the UI, and the input is cleared after saving.
    - The disclosure in the UI says: stored unencrypted in the Chrome profile; sent only to `api.anthropic.com`; job details and profile are sent to Anthropic when an AI action runs; no own server; no analytics.
  - ESLint `no-console: error` across `src/` stops anything (including the key or profile text) from being logged.
  - Logic in `src/core/use-cases/` (target-sites, keywords, profile-file, api-key) is pure and unit-tested; the UI only wires it to repositories.
  - Fixes found by the walkthrough:
    - Success messages are now kept in the parent section, so they survive the form remount after a save.
    - Forms use `noValidate`, so the app's own validation messages show instead of the browser's bubbles.
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
- **Default job site URL (user decision, 2026-11-08, Q3):** `https://www.onlinejobs.ph/jobseekers/jobsearch`, replacing the CLAUDE.md default `/jobseekers`, which redirects to the login page for logged-out users.
  - Storage migration `targetSites` v1→v2 (`migrateTargetSitesV1toV2`) updates an existing default site only if it still has the old URL. Sites you edited or added are untouched, and a removed default is not re-added.
  - 4 tests cover this; `pnpm check` exit 0 (145 passed, 3 live skipped).
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
- **Unverified (needs your help):**
  - Logged-in OnlineJobs.ph markup has not been inspected.
  - The real "no results" page has not been observed; `no_results` currently requires "Displaying 0 out of 0".
  - Bot-challenge detection is a generic heuristic.
  - To verify with real pages: save the pages yourself ("Save page as… → HTML only") as `jobsearch.html` / `job-detail.html` / `login.html` in a folder, then run `OLJ_LIVE_DIR=<folder> pnpm vitest run src/sites/onlinejobs/adapter.live.test.ts`.
- Note: `corepack enable` needs admin rights here. The dev guide (T01) should document `npm install -g pnpm` as the fallback.

## Last completed task
- T05 — Site adapter framework and OnlineJobs.ph discovery (2026-11-08)

## Last validation — T05 (2026-11-08)
### Fixture tests (synthetic text, Chrome-serialized markup)
- `pnpm check` exit 0. Vitest: 12 files passed + 1 skipped (live); 141 tests passed, 3 skipped (the live tests, which need `OLJ_LIVE_DIR`).
- Adapter fixture tests:
  - activation: https only, exact host, look-alike hosts rejected
  - canonical URL and id
  - listing: 3 valid jobs out of 5 cards, with 1 duplicate collapsed and 1 card without a title skipped with a reason
  - every job passes `JobPostingSchema` and has a source URL and extraction time
  - company and location stay absent; "N/A" pay is absent
  - "See More" removed; `<br>` gives line breaks with browser whitespace rules
  - detail: full description, labelled `attributes`, skills; "DATE UPDATED" is not used as `postedAt`
  - partial detail: missing fields stay absent
  - status cases: empty search → `no_results`; login (with reCAPTCHA widget) → `login_required`; challenge page → `blocked`; changed listing or detail markup → `structure_changed`; other page → `unsupported_page`; unknown site → `unsupported_page`; a throwing adapter is contained
  - a CAPTCHA widget on a normal listing still gives `ok`
  - merge: detail enriches a snippet, a snippet never overwrites the detail text, the first `extractedAt` is kept; `partitionNewJobs`
- Capture tests: the snapshot strips scripts, styles, iframes, `on*` handlers and `javascript:` links, and leaves the live page untouched.
### Live results (real OnlineJobs.ph pages saved 2026-11-08, Chrome-serialized; not committed)
- `OLJ_LIVE_DIR=<scratch> pnpm vitest run src/sites/onlinejobs/adapter.live.test.ts`: **3/3 passed**.
  - `/jobseekers/jobsearch`: 30 of 30 cards extracted, 0 skipped, 0 duplicates. 28 have pay (2 show "N/A", correctly absent); all 30 have an employment type. Page reports "30 of 276 jobs". No description contains "See More" or stray blank lines.
  - a public job post (`/jobseekers/job/<slug>-<id>`): title, pay "$150 a week", attributes (type, wage, hours 30, date updated) and 2 skills extracted.
  - Logged-out `/jobseekers` (login page): `login_required`.
- **Headless Chrome 157 end-to-end** (`e2e-t05`, E2E build; www.onlinejobs.ph requests intercepted and answered with the saved raw server HTML; sub-resources blocked; **no live traffic**): **9/9 passed**.
  - The real popup button read: the listing (30 jobs, preview of 8 + "22 more", "not saved yet"); the job post (1 job, pay shown); the login page (`login_required`); and an inaccessible tab (clear message).
  - 0 popup console errors.
- Regressions: T03 walkthrough 33/33 and T04 end-to-end 7/7 on the release build.
- Release manifest: `permissions: ["storage","activeTab","scripting"]`, no `host_permissions`.
- Not verified:
  - Real `activeTab` grant by clicking the toolbar icon (headless can't do it). This is a quick manual check: open an OnlineJobs.ph job search page, click the extension icon, then "Read jobs from this tab".
  - Logged-in pages.

## Validation — T04 (2026-11-08)
- `pnpm check` exit 0. Vitest: 10 files, 113 tests passed. No real API key is used: the real SDK runs against a mocked `fetch`.
  - Provider tests:
    - success, plus the documented endpoint, headers and body (`fallbacks`, `output_config.format` json_schema, effort)
    - no fallback on Haiku
    - non-JSON and schema-invalid output → `malformed_response`
    - refusal and truncation
    - 401/403/404/400/500/529 mapped to the right kinds, with a request id and no key in the message
    - 429 + `retry-after` gives the wait time
    - a 529 is retried then succeeds; a 401 is not retried; persistent 429 stops after `maxRetries`
    - network failure, timeout (50 ms) and `AbortSignal` cancellation
    - `validateCredentials` sends GET `/v1/models/{id}`, and distinguishes an invalid key from an unknown model
  - Background handler tests: the key comes from storage and is never in a response; missing key; senders that are a web page, another extension or unknown are rejected; malformed messages are rejected.
- Headless Chrome 157 end-to-end (`e2e-t04`, scratchpad): **7/7 passed**.
  - Test key is disabled until a key is saved.
  - A real request through options page → background worker → Anthropic with a fake key returned a 401, shown as "The API key was rejected."
  - The key never appeared in the DOM or the console; 0 console errors.
  - Web pages cannot message the background.
- T03 regression walkthrough: 33/33 passed.
- Build: the SDK is only in `background.js`; the popup and options chunks don't contain it. Manifest permissions: `["storage"]`, no host permissions.
- Not verified: a successful generation with a real, valid key. That needs your own key and costs tokens; only the error paths were exercised live.

## Validation — T03 (2026-11-08)
- `pnpm check` exit 0. Vitest: 8 files, 84 tests passed. New: use-case tests (sites, keywords, profile file, API key input) and secrets/data-management tests.
- Headless Chrome 157 walkthrough of the built options page: **33/33 checks passed**. The script is a throwaway in the session scratchpad, not committed; T12 adds Playwright E2E. Checks:
  - Default OnlineJobs.ph site on first run.
  - Sites: add, disable, edit, remove; non-https URL rejected.
  - Keywords and exclusions: add, remove.
  - Profile: save v1, then v2; import .md (BOM stripped, CRLF normalized, not auto-saved); save v3.
  - Export downloads `applicant-profile-v3.md` with the exact saved content.
  - API key: input is `type=password`; after saving, the key appears nowhere in the page DOM and the input is cleared; it is stored under `secrets`, not `settings`.
  - Scan delay under 5 s is rejected; valid limits save.
  - **Full browser restart:** profile v3 and its 2 previous versions, sites, keywords, key status and scan limits all persisted.
  - Restore v1 creates v4.
  - Delete profile, delete jobs/matches, delete drafts, reset settings (keeps the key), delete everything (storage emptied, key gone).
  - 0 console errors after the restart, and the key never appeared in console output.
- Popup and options smoke check: 0 console errors or warnings.

## Validation — T02 (2026-11-08)
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
