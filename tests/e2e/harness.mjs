// Minimal Chrome DevTools Protocol harness for extension E2E tests.
//
// Why not Playwright: Chrome 137+ ignores `--load-extension`, which Playwright's
// extension support relies on. Loading via CDP `Extensions.loadUnpacked`
// (pipe transport + --enable-unsafe-extension-debugging) works with the
// installed Chrome and needs no extra dependencies or browser downloads.
//
// Network safety: tests intercept www.onlinejobs.ph and api.anthropic.com and
// answer from fixtures; every other host is mapped to 0.0.0.0. No live traffic.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

export { sleep };

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
];

export function findChrome() {
  const found = CANDIDATES.find((p) => p && existsSync(p));
  if (!found) throw new Error('Chrome not found. Set CHROME_PATH to your Chrome executable.');
  return found;
}

/** Launches headless Chrome with an isolated temporary profile. */
export async function launchChrome() {
  const profileDir = mkdtempSync(join(tmpdir(), 'jaa-e2e-'));
  const proc = spawn(
    findChrome(),
    [
      '--headless=new',
      '--remote-debugging-pipe',
      '--enable-unsafe-extension-debugging',
      // Every host resolves nowhere. Intercepted requests (OnlineJobs.ph pages,
      // Anthropic API) are answered by the test before DNS, so nothing goes live.
      '--host-resolver-rules=MAP * 0.0.0.0',
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] },
  );
  let id = 0;
  const pending = new Map();
  const events = [];
  const listeners = new Set();
  let buf = '';
  proc.stdio[4].on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const msg = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      } else {
        events.push(msg);
        for (const l of listeners) l(msg);
      }
    }
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve) => {
      const n = ++id;
      pending.set(n, resolve);
      proc.stdio[3].write(
        JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0',
      );
    });
  await sleep(1500);

  const browser = {
    send,
    events,
    onEvent: (fn) => listeners.add(fn),
    async loadExtension(path) {
      const r = await send('Extensions.loadUnpacked', { path });
      if (r.error) throw new Error(`loadUnpacked failed: ${JSON.stringify(r.error)}`);
      return r.result.id;
    },
    /** Opens a page target and returns a session with helpers. */
    async openPage(url, { intercept } = {}) {
      const { result } = await send('Target.createTarget', { url: 'about:blank' });
      const sessionId = (
        await send('Target.attachToTarget', { targetId: result.targetId, flatten: true })
      ).result.sessionId;
      for (const d of ['Runtime', 'Log', 'Page']) await send(`${d}.enable`, {}, sessionId);
      if (intercept) await send('Fetch.enable', { patterns: intercept }, sessionId);
      const page = makeSession(send, sessionId, result.targetId);
      if (url) await page.goto(url);
      return page;
    },
    async attachServiceWorker(extId) {
      // The worker may still be starting right after the extension loads.
      let sw;
      for (let i = 0; i < 25 && !sw; i++) {
        const targets = (await send('Target.getTargets')).result.targetInfos;
        sw = targets.find((t) => t.type === 'service_worker' && t.url.includes(extId));
        if (!sw) await sleep(200);
      }
      if (!sw) throw new Error('Extension service worker not found');
      const sessionId = (
        await send('Target.attachToTarget', { targetId: sw.targetId, flatten: true })
      ).result.sessionId;
      await send('Runtime.enable', {}, sessionId);
      await send('Log.enable', {}, sessionId);
      return makeSession(send, sessionId, sw.targetId);
    },
    async pageTargets() {
      return (await send('Target.getTargets')).result.targetInfos.filter((t) => t.type === 'page');
    },
    async close() {
      try {
        await send('Browser.close');
      } catch {
        /* already closed */
      }
      await sleep(800);
      proc.kill();
      try {
        rmSync(profileDir, { recursive: true, force: true });
      } catch {
        /* Chrome may still hold files briefly; it's a temp dir */
      }
    },
  };
  return browser;
}

function makeSession(send, sessionId, targetId) {
  return {
    sessionId,
    targetId,
    async goto(url, waitMs = 1200) {
      await send('Page.navigate', { url }, sessionId);
      await sleep(waitMs);
    },
    /** Evaluates an expression (string) in the page; awaits promises; returns by value. */
    async eval(expression) {
      const r = await send(
        'Runtime.evaluate',
        { expression, awaitPromise: true, returnByValue: true, userGesture: true },
        sessionId,
      );
      if (r.result?.exceptionDetails) {
        throw new Error(
          r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text,
        );
      }
      return r.result?.result?.value;
    },
    async activate() {
      await send('Target.activateTarget', { targetId });
      await sleep(200);
    },
    send: (method, params = {}) => send(method, params, sessionId),
  };
}

/** Collects pass/fail checks and prints a summary. */
export function createReporter(title) {
  const results = [];
  return {
    check(name, cond, detail = '') {
      results.push({ name, pass: !!cond });
      process.stdout.write(
        `${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && detail ? ` — ${detail}` : ''}\n`,
      );
    },
    section(name) {
      process.stdout.write(`\n## ${name}\n`);
    },
    summary() {
      const failed = results.filter((r) => !r.pass);
      process.stdout.write(
        `\n${title}: ${results.length - failed.length}/${results.length} checks passed\n`,
      );
      return failed.length === 0;
    },
  };
}

/** Console errors/warnings (and exceptions) for the given sessions. */
export function consoleProblems(events, sessionIds, { includeWarnings = true } = {}) {
  const ids = new Set(sessionIds);
  return events.filter((e) => {
    if (!ids.has(e.sessionId)) return false;
    if (e.method === 'Runtime.exceptionThrown') return true;
    if (e.method === 'Runtime.consoleAPICalled')
      return e.params.type === 'error' || (includeWarnings && e.params.type === 'warning');
    if (e.method === 'Log.entryAdded') {
      const { level, url = '' } = e.params.entry;
      // Network failures to the 0.0.0.0-mapped hosts are expected in some checks.
      if (url && !url.startsWith('chrome-extension://')) return false;
      return level === 'error' || (includeWarnings && level === 'warning');
    }
    return false;
  });
}

export const CORS_HEADERS = [
  { name: 'Access-Control-Allow-Origin', value: '*' },
  { name: 'Access-Control-Allow-Headers', value: '*' },
  { name: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
];

/** Fake Messages API response whose text is the given JSON object. */
export function anthropicMessage(output) {
  return JSON.stringify({
    id: 'msg_e2e',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [{ type: 'text', text: JSON.stringify(output) }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    stop_details: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  });
}
