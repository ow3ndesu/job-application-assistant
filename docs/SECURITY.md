# Security review (T11)

_Reviewed 2026-11-08 against the code on `feat/t11-security-review`. Keep this document current when permissions, storage, or data flows change._

## 1. Permissions (least privilege)

| Permission  | Install warning | Why it is needed                                                            | Narrower alternative considered                                   |
| ----------- | --------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `storage`   | None            | Local persistence of settings, profile, jobs, drafts, key                   | None needed                                                       |
| `activeTab` | None            | Read the tab the user explicitly invoked the extension on                   | Host permissions were rejected: broader and always-on             |
| `scripting` | None            | Run the read-only snapshot function in that tab (`scripting.executeScript`) | Static content scripts were rejected: always-on on matching sites |

- **No host permissions** in release builds (verified on every build: `grep -c host_permissions` = 0). The Anthropic API is reached via CORS (verified in T04). A test-only `E2E_HOST_ACCESS=1` build flag adds `https://www.onlinejobs.ph/*` for headless E2E only; it must never be used for release.
- No content scripts, no `tabs`/`history`/`cookies`/`webRequest`, no `<all_urls>`, no `externally_connectable`.
- No background activity: no alarms or timers; the worker only answers messages from extension pages.

## 2. Content Security Policy (extension pages + service worker)

```
script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none';
frame-src 'none'; connect-src 'self' https://api.anthropic.com
```

Verified in Chrome 157 (`csp-probe`): requests to other hosts are blocked from both extension pages and the service worker; `api.anthropic.com` is allowed; injected inline `<script>` is refused. MV3 additionally forbids remote code and `unsafe-eval`.

## 3. Data flow

```
Job page (tab user opened) --activeTab+scripting--> sanitized HTML snapshot
  --> extension page: DOMParser (inert) --> site adapter --> Zod-validated JobPosting --> storage
Profile / jobs / drafts (storage, Zod-validated on every read and write)
UI page --runtime message (Zod-validated, sender = own extension page)--> background worker
  background reads API key --> @anthropic-ai/sdk --> https://api.anthropic.com
  <-- model JSON --> schema validation --> evidence verification in code --> storage --> UI (rendered as text)
```

Exactly what is sent per action is listed in `docs/PRIVACY.md` and in Settings → Privacy & permissions.

## 4. API key handling (BYOK)

- Stored under its own `secrets` storage key, separate from settings; never exported, never shown again after saving (password input, cleared after save).
- Read only in the background worker (`getAnthropicApiKeyForProvider`); never sent to UI pages, content, the DOM, or job sites; responses to UI never include it (tested).
- `dangerouslyAllowBrowser: true` is acceptable only because the key is the user's own and stays in the background worker; a shared developer key must never ship.
- No logging: ESLint `no-console`; SDK `logLevel: 'off'`. Provider error details shown to the user are redacted (the user's key and any `sk-ant-…` string removed).
- **Limitation:** `chrome.storage.local` is unencrypted on disk. Anyone with access to the OS account, or malware on the machine, can read it. Disclosed in UI and privacy policy.

## 5. Untrusted input

| Source                        | Treatment                                                                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Job page HTML                 | Captured from a detached clone with `<script>`, `<style>`, frames, objects, all `on*` handlers and `javascript:` URLs removed; parsed with `DOMParser` (inert); only text is extracted; capture size-limited and Zod-validated              |
| Extracted jobs                | Zod schema (URLs must be http(s); lengths bounded); "N/A" values absent; nothing fabricated                                                                                                                                                 |
| AI output                     | Structured-output schema + our own Zod validation; `stop_reason` checked first (refusal, truncation)                                                                                                                                        |
| AI claims about the applicant | **Verified in code**: kept only with verbatim profile quotes; otherwise shown as unsupported, never as facts; score capped when nothing verifies                                                                                            |
| Prompt injection in job text  | Data kept in tagged blocks in the user message, never in `system`; tag spoofing neutralized; deterministic detector + model flag shown as a warning; verification makes injected "facts" ineffective (tested with a simulated fooled model) |
| Sensitive questions           | Classified in code; never sent to the AI; never auto-answered                                                                                                                                                                               |
| Messages to the background    | Zod-validated; only accepted from the extension's own pages (content scripts, web pages, other extensions rejected)                                                                                                                         |
| Stored data                   | Versioned envelopes, Zod-validated on read and write; corrupt data quarantined, never silently dropped                                                                                                                                      |

Rendering: React text rendering only. ESLint forbids `dangerouslySetInnerHTML`, `innerHTML`/`outerHTML` assignment, `insertAdjacentHTML`, and `document.write` in shipped code; external links open only `https:` URLs via `tabs.create`.

## 6. Threat model

| Threat                                                            | Mitigation                                                                                                                 | Residual risk                                                                             |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Malicious job post tries to steer the AI (prompt injection)       | Data blocks, neutralized tags, code-side evidence checks, score cap, warning                                               | Model wording in rationale/gaps may still be influenced; never presented as profile facts |
| Malicious job post tries to run code in the extension             | Sanitized snapshot, inert parsing, text-only rendering, strict CSP, lint rules                                             | Low                                                                                       |
| Exfiltration of profile or key by injected code                   | No eval/remote code, CSP `connect-src` limited to Anthropic                                                                | Low                                                                                       |
| Web page or other extension triggers AI calls with the user's key | Sender checks; no `externally_connectable`; no content scripts                                                             | Low                                                                                       |
| AI invents qualifications in drafts or profile                    | Verbatim-quote verification, credential/number checks, sensitive-question blocking, user approval for every profile change | Paraphrase quality depends on the model; the user reviews all text before use             |
| Account/ToS harm on job sites                                     | Read-only, user-initiated, no automation, no form filling (OnlineJobs.ph ToS §7.4)                                         | User remains responsible for how they apply                                               |
| Local attacker reads stored key/profile                           | Disclosed; delete controls; revocable key                                                                                  | Not mitigated (unencrypted browser storage)                                               |
| Supply chain                                                      | Production deps: `@anthropic-ai/sdk`, `react`, `react-dom`, `zod`; lockfile committed; `pnpm audit --prod` clean           | See section 8                                                                             |

## 7. Deletion

Settings → Your data: delete profile (+ versions + suggestions), jobs (+ fit checks + scan history), drafts, reset settings/sites/keywords, remove API key, or delete everything (`chrome.storage.local.clear()`). Uninstalling removes all data. Covered by unit tests and the T03 E2E walkthrough.

## 8. Dependency and build hygiene

- `pnpm audit --prod` (2026-11-08): **no known vulnerabilities** in shipped dependencies.
- `pnpm audit` (dev tooling, not shipped): `minimatch` (moderate, ReDoS-style DoS via glob patterns; through ESLint) and `deepmerge` (low, prototype poisoning; through `web-ext`'s addons-linter; no patch available). Accepted: dev-only, never bundled, only affect the developer machine with untrusted input. Revisit on toolchain upgrades.
- `pnpm check` runs typecheck, lint (incl. security rules), format, tests, build, and **`pnpm audit:secrets`**, which scans tracked files and the build output for API keys, private keys, cloud tokens, and `.env` files (verified to fail on a planted key).
- No source maps in release builds.

## 9. Store policy notes (Chrome Web Store)

- Single purpose: AI-assisted job discovery and truthful application drafting, with user review.
- Permissions justification: see section 1 (narrowest available; `activeTab` instead of host access).
- User data: privacy policy with a Limited Use statement is required (draft: `docs/PRIVACY.md`); data goes only to Anthropic at the user's request.
- No remote code (MV3), no obfuscation.

## 10. Known limitations

- Unencrypted local storage of the API key and profile (browser limitation; disclosed).
- Real model behaviour (quality, injection resistance) has only been tested with mocked responses; opt-in live tests exist (`ANTHROPIC_LIVE_TEST_KEY`).
- Logged-in OnlineJobs.ph markup was not inspected; extraction there is unverified.
- Injection detection is heuristic and only informational; protection relies on structure and verification.
- `looksFactual` and the sensitive-question classifier are keyword heuristics; they are conservative but can miss unusual phrasings, so the user reviews every draft.
