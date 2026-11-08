# Development Progress

## Current pointer
T01 — Bootstrap extension shell

## Overall status
IN PROGRESS

## Completed tasks
- T00 — Repository reconnaissance and implementation plan

## Current task notes
- T01 not yet started. Next step: `pnpm dlx wxt@latest init` (or equivalent) to scaffold the extension, then configure Manifest V3, popup/options entrypoints, TypeScript strict mode, ESLint+Prettier, Vitest, and build scripts per CLAUDE.md section 3.

## Decisions
- Initial target: Chrome Manifest V3.
- Initial framework proposal: WXT + TypeScript + React. Confirmed against current WXT docs (wxt.dev / github.com/wxt-dev/wxt) on 2026-11-08 — no deviation from CLAUDE.md needed. Scaffold command: `npx wxt@latest init` / `pnpm dlx wxt@latest init`.
- Initial AI provider: Anthropic Claude. Current model id confirmed: `claude-sonnet-5` (also `claude-sonnet-5-5`, `claude-haiku-4-5-20251001` available). Use docs.anthropic.com and the local `claude-api` skill as the source of truth when implementing T04 — do not hardcode a model id without re-checking at that time.
- Initial job site: https://www.onlinejobs.ph/jobseekers
- Profile format: user-editable Markdown/plain text.
- Application submission: human approval required.
- Package manager: pnpm. `corepack enable` failed on this machine with `EPERM` writing to `C:\Program Files\nodejs\pnpm` (no admin rights in this shell). Installed pnpm instead via `npm install -g pnpm` (user-level npm global prefix `C:\Users\ow3ndesu\AppData\Roaming\npm`) — pnpm 12.18.0 now available on PATH. No admin/elevated action was taken.

## Environment (recorded 2026-11-08)
- OS: Windows 10 Pro, shell = Git Bash / PowerShell available.
- Node: v24.18.0
- npm: 11.16.0 (global prefix: `C:\Users\ow3ndesu\AppData\Roaming\npm`)
- pnpm: 12.18.0 (installed this session via `npm install -g pnpm`)
- corepack: 0.35.0 present but `corepack enable` is blocked without admin rights on this machine — not required since pnpm is already on PATH.
- Repository: git initialized, branch `master`, no commits yet. Only tracked/untracked file before this session: `CLAUDE.md` (untracked).

## Blockers / questions
- Confirm current OnlineJobs.ph automation rules and page structure before implementing the adapter (T05) — not yet investigated.
- Decide whether the first release is BYOK-only or will use a hosted backend. Default MVP assumption: BYOK-only, with clear security disclosure. (Not yet asked to user — only relevant starting T04.)
- `corepack enable` cannot run without admin rights in this environment. Not currently blocking (pnpm works via global npm install), but if a clean-checkout setup step later assumes `corepack enable`, document the npm-global-install fallback in the dev guide (T01) instead.

## Last completed task
- T00 — Repository reconnaissance and implementation plan

## Last validation
- `git status` — confirmed clean repo, no commits, only `CLAUDE.md` untracked.
- `node --version` → v24.18.0
- `npm --version` → 11.16.0
- `pnpm --version` → 12.18.0 (after install)
- Web search confirming WXT bootstrap command and docs location (wxt.dev).
- Web search confirming current Anthropic model id (`claude-sonnet-5`) and docs location (docs.anthropic.com).
