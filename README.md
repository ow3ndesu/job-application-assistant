# Job Application Assistant

A Chrome extension (Manifest V3) for AI-assisted job discovery and truthful application drafting. It reads job pages you open, filters them by your keywords, estimates fit against your own profile, drafts applications using only facts from your profile, and helps you apply on the site yourself. **You review and submit every application.** It is not an autonomous application bot.

Version 0.1.0 (private beta). Supported site: OnlineJobs.ph (read-only).

## Getting started (users)

1. Load the extension (see "Load the build in Chrome" below).
2. Open **Settings** (popup → Open settings) and follow **Getting started**:
   1. Write or import your profile (`.md` / `.txt`).
   2. Add keywords and exclusions (optional).
   3. Open the OnlineJobs.ph job search, click the extension icon, then **Scan this tab**.
   4. For AI features, add your own Anthropic API key and click **Test key** (your account needs credits).
3. Open **Saved jobs** to check fit, draft an application, mark it ready, and apply on the site yourself.

Help: [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md). Privacy: [docs/PRIVACY.md](docs/PRIVACY.md).

## Development

Requirements: Node.js 24+, pnpm 12+ (if `corepack enable` fails without admin rights, run `npm install -g pnpm`), Google Chrome for E2E.

```bash
pnpm install --frozen-lockfile
pnpm dev            # WXT dev mode
pnpm build          # release build → .output/chrome-mv3/
```

### Load the build in Chrome

1. `pnpm build`
2. Open `chrome://extensions`, turn on **Developer mode**.
3. **Load unpacked** → `.output/chrome-mv3`.

### Checks

| Command               | What it does                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `pnpm check`          | Typecheck, lint (incl. security rules), format check, unit tests, build, secret scan                        |
| `pnpm e2e`            | Real-Chrome journeys (production + development builds), upgrade path, release verification. No live traffic |
| `pnpm release`        | `check` + `e2e` + zip + release verification. See [docs/RELEASE.md](docs/RELEASE.md)                        |
| `pnpm audit:secrets`  | Scan source and build output for keys                                                                       |
| `pnpm release:verify` | Check the release build matches the privacy/permission disclosures                                          |

Opt-in live tests (not run by default):

- `OLJ_LIVE_DIR=<folder of saved pages> pnpm vitest run src/sites/onlinejobs/adapter.live.test.ts`
- `ANTHROPIC_LIVE_TEST_KEY=<key> pnpm vitest run src/matching/match.live.test.ts` (costs a few cents)

## Privacy and security

- [docs/PRIVACY.md](docs/PRIVACY.md): what is stored, what is sent to Anthropic and when, deletion, Limited Use statement (draft).
- [docs/SECURITY.md](docs/SECURITY.md): permissions, CSP, data flow, threat model, known limitations.

## Layout

```text
src/
  entrypoints/      background.ts, popup/, options/, jobs/ (saved jobs page)
  core/             schemas, domain types, pure use cases (no browser APIs)
  sites/            site adapters (OnlineJobs.ph), page capture, dedupe
  scan/             scan orchestration
  matching/         fit check (prompt, evidence verification)
  drafting/         application drafts, sensitive questions, approval workflow
  profile-updates/  approval-gated profile proposals
  providers/ai/     provider interface + Anthropic implementation (background only)
  background/       message protocol + handler
  storage/          validated, versioned local storage
tests/e2e/          real-Chrome journeys and upgrade test
scripts/            secret scan, release verification, E2E runner
docs/               privacy, security, release, troubleshooting
```

Project plan and progress: `CLAUDE.md`, `PROGRESS.md`.
