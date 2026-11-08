# Development Progress

## Current pointer
T10 — Profile improvement proposals

## Overall status
IN PROGRESS — T00–T09 complete. You can scan pages, filter by keywords, check AI fit, draft evidence-checked applications, approve them, apply on the site yourself, and track the outcome. (`master` holds T01–T07; T08 is on `feat/t08-application-drafts`; T09 is on `feat/t09-application-assistance`.)

## Completed tasks
- T00 — Repository reconnaissance and implementation plan
- T01 — Bootstrap extension shell (2026-11-08)
- T02 — Domain models, schemas, and storage (2026-11-08)
- T03 — Settings and profile management UI (2026-11-08)
- T04 — AI provider abstraction and Claude integration (2026-11-08)
- T05 — Site adapter framework and OnlineJobs.ph discovery (2026-11-08)
- T06 — Search orchestration and results UI (2026-11-08)
- T07 — Job matching and explanation (2026-11-08)
- T08 — Application draft generation (2026-11-08)
- T09 — Human-approved application assistance (2026-11-08)

## Current task notes
- T10 not started. Building blocks:
  - The profile repo already keeps versions and supports restore (T02/T03).
  - T07/T08 already collect `unsupportedClaims` / `removedStatements`. These are candidates to *ask the user about*, never facts to add.
  - Proposals must be diffs the user accepts, rejects or edits, with source notes. Nothing is written without approval (CLAUDE.md T10).
- T09 result (scope confirmed by the user, 2026-11-08). Read-only on OnlineJobs.ph means no form filling or submission; T09 is the human-approved manual workflow:
  - **`src/drafting/workflow.ts`** (pure, tested). States:
    - `needs_review`/`draft` → **approve** → `approved` → **user reports submitted** → `submitted`
    - plus withdraw (back to review), undo submitted (back to approved), couldn't apply (`failed` + note), reopen
  - **Approval** (the first confirmation):
    - requires a "reviewed" acknowledgement, plus explicit "leave N unanswered" when answers are blank (including sensitive ones)
    - records `approvedAt` and `approvedContentHash` (FNV-1a over the message and Q&A)
    - `isApprovalCurrent` checks the text is unchanged; any edit saved via `applyDraftEdits` revokes the approval
  - **Submission** (the separate final confirmation):
    - a two-step "I submitted this on the site" → "Yes, I submitted it myself"
    - requires a current approval; records `submittedAt` and `submissionReportedBy: 'user'`
    - shown as **"Applied: reported by you, unconfirmed"** with an explanation that the extension can't see the site; the extension never claims success
    - a submitted draft is read-only
  - **Per-site policy:** `SiteAdapter.formAssistance { allowed, reason }`. OnlineJobs.ph is `allowed: false` (ToS §7.4 + the user's read-only decision), and a test asserts no supported site allows form filling. No form-filling code exists.
  - `ApplicationDraft` gained optional `approvedAt`, `approvedContentHash`, `submittedAt`, `submissionReportedBy`, `outcomeNote`. They're optional, so no migration was needed.
  - **UI** (Saved jobs → Details → Application draft → **Apply**):
    - status badge; the site's form-help policy text
    - checklist + "Mark ready to use"
    - manual steps + "Copy all" + "Open job post to apply" (new tab)
    - "I submitted this on the site" (two-step confirm), "Withdraw approval", "Undo: I didn't submit it", "Couldn't apply?" with a note, "Reopen draft"
    - a warning when an unsaved edit would withdraw the approval
    - job rows show an application-status badge; new **Application** filter (any / no draft / draft / ready / applied / couldn't apply)
- T08 result:
  - **Question source:** you paste the application form's questions (one per line). The OnlineJobs.ph apply form needs a login and was not inspected, so no form fields are guessed. Instructions found in the job post (e.g. a required first word) are extracted by the AI as `postInstructions`, shown with a caution, and never applied automatically.
  - `src/drafting/`:
    - **`sensitive.ts`:** deterministic classifier for legal declarations or consent, demographics, work authorization, criminal history or clearance, health, pay expectations or history, and ID or financial details. **Sensitive questions are never sent to the AI and never answered**; they're forced blank with a notice.
    - **`prompt.ts`:** rules only in `system`; profile, job and questions in data blocks (`neutralizeTags` now also covers `<application_questions>`). The rules forbid inventing or inflating anything, require verbatim quotes for factual paragraphs and answers, and allow "unknown".
    - **`verify.ts`:**
      - Cover-letter paragraphs marked factual, or that look factual (numbers, years, experience, credentials, skills, results, availability; the `looksFactual` heuristic), are kept only with at least one verified profile quote. Others are removed and listed in `removedStatements`.
      - Answers: verified, or non-factual wording (kept with a "check it reflects you" note), or else `unknown` and blank. Sensitive answers are always blank.
    - **`draft-application.ts`:** cleans questions (≤ 20, ≤ 500 chars, deduped); sends only non-sensitive questions, numbered, and maps answers back to the original order; verifies; sets the status (`needs_review` while anything needs you) and `injectionSuspected`. Never touches the profile.
    - **`edit.ts`:**
      - `applyDraftEdits`: everything is editable; changed answers become `user_written` (sensitive ones keep their category); cleared answers go back to needing an answer.
      - `draftToText` / `draftFilename` for copy and download; unanswered questions are clearly marked.
  - **`ApplicationDraft` v2:**
    - `coverLetter`, `coverLetterEvidence[{paragraph, evidence[min 1]}]`, `removedStatements`, `answers[{question, answer, status, evidence, sensitiveCategory?, note?}]`, `postInstructions`, `injectionSuspected`, `editedByUser`, `status`, `jobContentHash`, `model`.
    - Id is `jobId@vN`, linking the draft to the job and the profile version.
    - `drafts` storage moved to v2 with a migration (v1 answers become `user_written`).
  - **Background:** `ai/draft-application {jobId, questions ≤ 50, replaceEdited?}`. Errors: `no_profile`, `job_not_found`, `missing_key`, `busy`, and **`draft_edited`** (a draft you edited is never overwritten without explicit confirmation).
  - **Saved jobs → Details → Application draft panel:**
    - questions box (warns how many sensitive questions won't be sent); Draft / Draft again; "Replace my edited draft" with a two-step confirm
    - status line; profile-changed and injection warnings; job post instructions with a caution
    - editable message, with "Profile facts used" and "Removed: not supported by your profile"
    - editable answers with status badges, notes and evidence
    - Save changes, Copy message, Copy all, Download .txt; "Nothing is sent to the employer…"
- T07 result:
  - `src/matching/`:
    - **`ai-output.ts`:** the model's structured-output schema (`score`, `rationale`, `strengths[{claim, profileQuotes}]`, `gaps`, `uncertainties`, `suspiciousInstructionsInJob`). The SDK turns it into a strict JSON schema and moves unsupported constraints into descriptions; our own Zod check runs afterwards.
    - **`prompt.ts`:**
      - Trusted rules live only in `system`. The profile and job go in `<applicant_profile version=N>` / `<job_posting description_complete=…>` data blocks in the user message.
      - `neutralizeTags` removes those tag names from the data, so job text can't close its block or fake a profile.
      - The rules require verbatim profile quotes for every strength and ban invented qualifications.
    - **`verify.ts` (the enforcement, in code):**
      - A strength is kept only if at least one of its quotes (at least 4 characters, after normalising case, whitespace, typographic quotes, dashes and bullets) appears in the actual profile text. Everything else goes to `unsupportedClaims` and is never shown as a fact.
      - If no strength can be verified, the score is capped at 30 and an uncertainty explains why.
    - **`injection.ts`:** a deterministic detector for instruction-like text aimed at AI. It only flags; protection comes from the prompt structure plus verification.
    - **`match-job.ts`:** builds the prompt, calls `provider.generateStructured`, verifies, adds a "short preview only" uncertainty for snippet jobs, sets `injectionSuspected` (model flag OR detector), and validates the final `JobMatch`.
  - **`JobMatch` v2:**
    - `strengths: [{claim, evidence[] (min 1)}]`, plus `unsupportedClaims`, `injectionSuspected`, `basedOnSnippet`, `jobContentHash`, `model`.
    - Id is `jobId@vN`: one record per job per profile version, so re-checking after a profile edit adds a new record and keeps the old one.
    - `matches` storage moved to v2 with a migration; any v1 string strengths become unsupported claims.
  - **Background:** `ai/match-job {jobId}` loads the job, the current profile and the key, then calls `matchJob` (overall timeout 5 min) and saves the result.
    - Errors: `no_profile`, `job_not_found`, `missing_key`, `busy` (one check per job at a time), plus the provider errors.
    - Only extension pages are accepted.
    - `sendToBackground` is now typed per request.
  - **Saved jobs page:**
    - **Check fit with AI** is in Details, with a disclosure: "Sends this job's text and your profile (version N) to Anthropic."
    - The result shows "Estimated fit: N/100 (band)" with the line "An AI estimate based only on what your profile says…"; strengths with "Your profile: “quote”"; Missing requirements; Uncertain; and "Not supported by your profile" with guidance.
    - Warnings: suspicious post (injection), preview-only, profile changed (vN → vM), job changed.
    - Footer: checked time, profile version, model. The row shows an "Estimated fit" badge.
  - **Opt-in live test** `src/matching/match.live.test.ts`: skipped unless `ANTHROPIC_LIVE_TEST_KEY` is set (deliberately not `ANTHROPIC_API_KEY`). It runs a normal job and an injection job against the real API. **Not run by me** (no key).
- T06 result. How T06 was interpreted under the read-only decision (ToS §7.4):
  - A **scan** is one user click on "Scan this tab" for the page the user opened. There is no crawling or auto-pagination, and nothing runs in the background (no alarms or timers).
  - "Configured sites and keywords" are honoured three ways:
    - the page must belong to an **enabled** target site;
    - the keyword funnel decides what is saved;
    - popup **search shortcuts** open `adapter.searchUrl(keyword)` for each enabled site and include-keyword, for you to scan.
  - Concurrency is 1 (the scan button is disabled while a scan runs). Pacing comes from you, since every page load is yours.
- T06 pieces:
  - `src/core/use-cases/keyword-funnel.ts`:
    - Case-insensitive phrase matching with word boundaries ("va" matches "VA/Admin" but not "Java"; "c++" and "e-commerce" work).
    - Matches title, type, pay, skills and description. Exclusions always win. With no include keywords, everything not excluded passes.
  - `src/scan/run-scan.ts`, `runScan()` with all dependencies injected:
    - read → check site enabled → extract → funnel → max-jobs limit → merge/save → record history.
    - Phases are reported for the UI. `AbortSignal` is checked before saving; a cancelled scan saves nothing and is recorded as `cancelled`.
    - Counts: found, saved, new, updated, unchanged, filteredOut, skipped. Unchanged means same `contentHash` and same description source.
    - Errors are contained as a `failed`/`error` record.
    - History keeps the 50 most recent scans.
  - Schemas: `SavedJob` (= `JobPosting` + `firstSeenAt`, `lastSeenAt`, `matchedKeywords`) and `ScanRecord`. `jobs` storage moved to v2 (migration v1→v2 adds the seen fields; no released build had written v1 jobs). New `scans` collection.
  - Popup `ScanPanel` (replaces the T05 preview):
    - search shortcuts, "Scan this tab" with phase text and **Cancel**
    - a summary ("Found 30 jobs, saved 30 (30 new)" / "(30 already saved)" / "(1 updated)"), notes for filtered-out jobs and the per-scan limit
    - job links, "Show all", and "Open saved jobs →"
  - New **Saved jobs** page (`jobs.html`, unlisted; linked from the popup and Settings):
    - filters: text, type, site, and "Only jobs matching my current keywords"
    - rows show a title link to the source, site, pay, type, posted date, first seen, matched or excluded keyword chips, and a snippet
    - **Details** shows the full text, skills, labelled facts, source URL and first/last seen, with a "this is the short preview" note for listing-only jobs
    - **Remove** with confirmation
    - **Scan history** shows status labels for every page-level failure
  - Settings → Your data: "Delete jobs" now also clears scan history; the label says so.
  - **Default `maxJobsPerScan` changed from 25 to 100.** An OnlineJobs.ph search page shows 30 jobs, so 25 silently cut full pages short (found by E2E). Stored user values are unchanged.
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

## Bug fix — "The request was rejected as invalid" on Check fit (reported by user, 2026-11-08)
- **Symptom:** "Check fit with AI" failed with `bad_request` (HTTP 400); Test key worked.
- **Most likely cause:**
  - Generation requests on Opus and Sonnet carried the server-side refusal-fallback beta (`anthropic-beta: server-side-fallback-2026-07-01` + `fallbacks: "default"`).
  - Anthropic's error reference says a beta not enabled for the organization returns a 400 ("Unexpected value(s) … for the `anthropic-beta` header").
  - Test key (`GET /v1/models/{id}`) doesn't send the beta, which explains the difference.
  - **Unconfirmed:** the old error mapping discarded Anthropic's message, so the exact cause wasn't visible.
- **Fix** (`AnthropicProvider` / `errors.ts`):
  1. If a request carrying the fallback beta gets a 400, retry once without it (a 400 isn't billed) and skip the beta for the rest of the service-worker session.
  2. API errors now keep Anthropic's own status, type and message as `detail` (any key redacted, max 400 chars). It's passed through the background protocol and shown under **"Technical details"** in the fit check, the draft panel and Test key. The user-facing `message` is still our own text.
- **Validation:**
  - New provider tests:
    - beta 400 → retry without it → success, and later calls skip the beta
    - an unrelated 400 → `bad_request` with redacted detail; the key and `sk-ant-…` strings are removed
    - Haiku is not retried
  - State is reset per test; the suite passes when shuffled. `pnpm check` exit 0 (241 passed).
  - Chrome scenario `e2e-t07b` (the intercepted API rejects the beta like an org without it): **14/14**. Check fit succeeded after one 400 plus a retry; a persistent 400 showed Anthropic's message in Technical details without the key.
  - Regressions: `e2e-t07` 18/18, `e2e-t08` 16/16.
- **Confirmed cause (user, 2026-11-08):** the Anthropic account had no credits. Anthropic reports that as a 400 ("Your credit balance is too low…").
  - Follow-up: that 400 now maps to a new `insufficient_credits` kind with a clear message pointing to Claude Console billing.
  - The retry-without-beta now runs only for 400s about the beta (`isFallbackBetaRejection`), not for credit or other 400s.
  - Test added; `pnpm check` 242 passed; `e2e-t07b` 14/14.

## Last completed task
- T09 — Human-approved application assistance (2026-11-08)

## Last validation — T09 (2026-11-08)
- `pnpm check` exit 0. Vitest: 257 tests passed, 5 skipped (live).
  - New workflow tests:
    - review ack required; leave-blank ack required; an empty message can't be approved
    - approval fingerprints the text; an edit revokes it; a tampered text is not current
    - submit requires approval and is user-reported; a submitted draft can't be edited; undo works
    - withdraw; couldn't apply with a note, then reopen; couldn't apply is blocked while submitted
    - OnlineJobs.ph `formAssistance.allowed === false`, and no supported site allows it
- Headless Chrome 157 end-to-end (`e2e-t09`, release build; www.onlinejobs.ph mapped to 0.0.0.0 via `--host-resolver-rules`, so **no live traffic**; no AI calls): **17/17 passed**.
  - Policy text shown.
  - Approval refused without the review ack, then without the leave-blank ack, then approved with a fingerprint.
  - "Open job post to apply" opened the correct URL in a new tab.
  - An unsaved edit warned; saving revoked the approval.
  - "I submitted" needed a second click: the first changed nothing, the second recorded it as user-reported and showed "unconfirmed"; the submitted draft became read-only.
  - Undo, withdraw, couldn't apply (with note) and reopen all worked.
  - Row badge and "No draft yet" filter correct; 0 console errors.
- Regressions on the release build: T03 33/33, T04 7/7, T07 18/18, T07b 14/14, T08 16/16. T06 19/19 on the E2E build. Release manifest: `storage`, `activeTab`, `scripting`; no host permissions.

## Validation — T08 (2026-11-08)
- `pnpm check` exit 0. Vitest: 17 files passed + 2 skipped (live); 238 tests passed, 5 skipped.
  - Sensitive classifier: 13 sensitive phrasings across all 7 categories caught; 5 normal questions not flagged.
  - `looksFactual` heuristic.
  - `verifyDraft`:
    - courtesy and evidence-backed paragraphs kept; unsupported and disguised-as-courtesy claims removed
    - answers: verified, unsupported-removed, non-factual, sensitive and unknown
    - post instructions deduped
  - `draftApplication`:
    - sensitive questions are not in the prompt, and answers are remapped to the original order
    - linked to the job, the profile version and the job hash; schema-valid; `needs_review`
    - **prompt injection:** a fooled model's "PhD" paragraph is removed, its answer becomes unknown, the background-check question stays sensitive, and `injectionSuspected` is set
    - **the profile is byte-identical after drafting**
    - provider errors pass through; question cleaning; job text can't fake the questions block
  - Edits and export: every part is editable; edited answers become `user_written`; clearing an answer reverts it; no-op edits change nothing; the text export marks unanswered questions; filename slug.
  - Background `draft-application`: creates and stores a draft; no profile, unknown job or no key don't call the AI; **an edited draft is not overwritten without `replaceEdited`**; oversized question lists are rejected.
- Headless Chrome 157 end-to-end (`e2e-t08`, release build; the service worker's Anthropic API calls intercepted with canned model output; **no real API call**): **16/16 passed**.
  - Sensitive-question warning shown; the API request contained no salary question.
  - The message kept only courtesy and evidence-backed text. Answers: tools answered, salary sensitive, unsupported degree blank; removed statements listed; post instructions shown with a caution; profile facts listed; draft stored with the job and profile version.
  - Edit and save: the sensitive answer became `user_written`. "Copy all" put the full text on the clipboard; "Download .txt" saved the file.
  - Drafting again was blocked until "Replace my edited draft" was confirmed, then a fresh draft was written.
  - Injection job: warning, the fabricated PhD removed, an empty message.
  - **The stored profile was unchanged**; 0 console errors.
- Regressions: T03 33/33, T04 7/7, T07 18/18 (release); T06 19/19 (E2E build). Release manifest: `storage`, `activeTab`, `scripting`; no host permissions.
- Not verified: real model output quality. The opt-in live test from T07 covers matching only; a live draft test wasn't added, to keep costs down, and could be added on request.

## Validation — T07 (2026-11-08)
- `pnpm check` exit 0. Vitest: 16 files passed + 1 skipped; 198 tests passed, 3 skipped (2 live files skipped without env vars).
  - Prompt tests: rules only in `system`; data only in the user blocks; snippet marking; job text can't close or fake data blocks.
  - Injection detector: 6 attack phrasings flagged, 3 normal phrasings not.
  - Verification: tolerant quote matching; fabricated, empty or too-short quotes go to unsupported claims; mixed quotes keep only the verified one; score capped when nothing is verified.
  - `matchJob`:
    - schema-valid, with profile version, model and job hash
    - **prompt-injection case:** a "fooled" model answering score 100 with claims quoted from the job text gives 0 strengths, 2 unsupported claims, score 30 and `injectionSuspected` true (detected in code although the model said false)
    - the model's own flag is respected
    - a snippet job gets an uncertainty
    - **re-evaluation after a profile change creates separate v1 and v2 records**
    - provider errors are passed through
  - Background `match-job`: success saves the match; no profile, unknown job or no key don't call the provider; concurrent duplicates are rejected; a web-page sender is rejected.
  - Schema: a strength without evidence (or a plain string) is rejected.
- Headless Chrome 157 end-to-end (`e2e-t07`, release build; the service worker's `api.anthropic.com` calls intercepted with canned model output, including CORS preflight; **no real API call**): **18/18 passed**.
  - Honest job: "Estimated fit: 78/100" with the estimate wording; 2 strengths with profile quotes; gaps and uncertainties; profile version and model; the row badge persists after reload.
  - Injection job (the canned model said score 100 with a quote from the job text): warning shown; 0 strengths; "Has a PhD" under "Not supported by your profile"; score capped at 30.
  - After editing the profile: the "profile changed" notice appears; re-check stores v1 and v2 matches; the notice clears.
  - Requests: 3 calls from the background worker to `POST https://api.anthropic.com/v1/messages` with `anthropic-dangerous-direct-browser-access: true`, `Authorization: Bearer <key>`, `anthropic-version: 2026-10-21` and `anthropic-beta: server-side-fallback-2026-07-01`. The rules are in `system`; job and profile only in data blocks; `output_config.format` is `json_schema`; `fallbacks: "default"`.
  - 0 console errors; the key never appears in the page.
- Regressions: T03 33/33, T04 7/7 (release); T06 19/19 (E2E build). Release manifest: no host permissions.
- Not verified: real model behaviour (quality and injection resistance with the live model). Run the opt-in live test with your key.

## Validation — T06 (2026-11-08)
- `pnpm check` exit 0. Vitest: 15 files passed + 1 skipped (live); 169 tests passed, 3 skipped.
  - Keyword-funnel tests: boundaries, phrases, exclusions win, no-keywords case.
  - `runScan` tests (real adapter on the fixtures):
    - phase order; save and record
    - re-scan gives 0 new / 3 unchanged, keeps `firstSeenAt` and updates `lastSeenAt`
    - a job post upgrades its snippet
    - funnel counts and matched keywords
    - max-jobs limit
    - disabled and unconfigured sites
    - login page, unreadable tab and adapter crash are recorded, nothing saved
    - cancel during each of 3 phases saves nothing
    - history pruned to 50
- Headless Chrome 157 end-to-end (`e2e-t06`, E2E build; www.onlinejobs.ph intercepted with the saved raw server HTML; **no live traffic**): **19/19 passed**.
  - Scans: first scan found 30, saved 30 new. Re-scan: 30 already saved, storage still 30. Job post: 1 updated. Keywords (`english`, `ecommerce`; exclude `sales`): 6 saved, 24 filtered out.
  - Search shortcuts: 2 shown; clicking one opens `…/jobsearch?jobkeyword=english`.
  - Failures: login page shows a clear message; a disabled site shows "disabled in Settings" and saves nothing. No scans in 4 s idle.
  - Saved jobs page: 30 rows with link and metadata. Details: full text plus 4 facts for the scanned post; "short preview" note for a listing-only job. The "matching" filter shows 6 rows; text search narrows the list. History shows 6 entries, including the 2 failures.
  - 0 console errors on the popup and the saved jobs page.
  - The first run found the 25-job default limit cutting pages (15/19); fixed (default now 100), then 19/19.
- Regressions on the release build: T03 33/33, T04 7/7. Release manifest: `storage`, `activeTab`, `scripting`; no host permissions.
- Not covered end-to-end: clicking **Cancel** mid-scan in the UI (a real scan finishes in well under a second, so it can't be timed reliably). Cancellation is covered by unit tests for each phase.

## Validation — T05 (2026-11-08)
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
