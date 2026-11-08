# Job Application Assistant

A Chrome (Manifest V3) extension for AI-assisted job discovery and application drafting.
You review and submit every application yourself. See `CLAUDE.md` for the product spec and
`PROGRESS.md` for current status.

## Requirements

- Node.js 24+ (developed on v24.18.0)
- pnpm 12+. If `corepack enable` fails without admin rights, install pnpm with
  `npm install -g pnpm` instead.

## Local development

```bash
pnpm install        # installs deps and runs `wxt prepare`
pnpm dev            # starts WXT dev mode and opens Chrome with the extension loaded
pnpm build          # production build → .output/chrome-mv3/
```

### Load the unpacked build in Chrome

1. Run `pnpm build`.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select `.output/chrome-mv3`.

## Checks

| Command             | What it does                             |
| ------------------- | ---------------------------------------- |
| `pnpm typecheck`    | Strict TypeScript check                  |
| `pnpm lint`         | ESLint                                   |
| `pnpm format:check` | Prettier check (`pnpm format` fixes)     |
| `pnpm test`         | Vitest unit tests                        |
| `pnpm check`        | All of the above plus a production build |

## Layout

```text
src/
  entrypoints/   background.ts, popup/, options/
  core/          domain logic (no browser or UI APIs)
  styles/        shared CSS
public/          static assets (icons)
```
