# Release guide

## Prerequisites

- Node.js 24+ and pnpm 12+ (if `corepack enable` needs admin rights, use `npm install -g pnpm`).
- Google Chrome (for E2E; set `CHROME_PATH` if it isn't in a standard location).
- A clean working tree on the commit you want to release.

## Build a release

```bash
pnpm install --frozen-lockfile   # exact dependency versions from pnpm-lock.yaml
pnpm release                     # check + e2e + zip + release verification
```

`pnpm release` runs, in order:

1. `pnpm check`: typecheck, lint (incl. security rules), format check, unit tests, release build, secret scan.
2. `pnpm e2e`: journeys on a production E2E build and a development E2E build (React dev warnings fail the run), then a clean release build, the upgrade-path test, and release verification.
3. `pnpm zip`: writes `.output/job-application-assistant-<version>-chrome.zip` from the release build.
4. `pnpm release:verify`: checks the release build matches the disclosures (exact permissions, no host access, no content scripts, strict CSP, version, no source maps, docs mention every permission, secret scan).

The zip is the store upload. **Never upload an E2E build**: E2E builds add a test-only host permission, and `release:verify` fails on them.

Builds are reproducible: two clean builds from the same commit produce byte-identical files (verified for 0.1.0).

## Versioning

- Bump `version` in `package.json` (semantic versioning; the manifest version is taken from it).
- If a stored data format changes, bump that collection's schema version in `src/storage/repositories.ts`, add a migration, and extend `tests/e2e/upgrade.e2e.mjs`.

## Before publishing to the Chrome Web Store

- [ ] Fill in the contact field in `docs/PRIVACY.md` and publish it at a public URL (required: it contains the Limited Use statement).
- [ ] Store listing: single purpose "AI-assisted job discovery and truthful application drafting with user review"; permission justifications from `docs/SECURITY.md` §1.
- [ ] Data-use disclosures in the developer dashboard match `docs/PRIVACY.md` (data goes only to Anthropic, at the user's request; no sale, no ads).
- [ ] Re-check OnlineJobs.ph terms if anything about site interaction changes (read-only today).
- [ ] Manual smoke check: load the zip contents unpacked, click the icon on an OnlineJobs.ph search page, scan, open Saved jobs.

## Load for local testing

`pnpm build`, then `chrome://extensions` → Developer mode → **Load unpacked** → `.output/chrome-mv3`.
