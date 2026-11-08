// Critical user journeys, end to end, in real Chrome (no live traffic).
// Usage: node tests/e2e/journeys.e2e.mjs <builtExtensionDir>
// The build must include E2E host access (E2E_HOST_ACCESS=1), because headless
// Chrome cannot click the toolbar icon to grant activeTab.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  anthropicMessage,
  consoleProblems,
  CORS_HEADERS,
  createReporter,
  launchChrome,
  sleep,
} from './harness.mjs';

const extDir = resolve(process.argv[2] ?? '.output/chrome-mv3');
const fixtures = join(process.cwd(), 'src/sites/onlinejobs/fixtures');
const PAGES = {
  '/jobseekers/jobsearch': readFileSync(join(fixtures, 'listing.html')),
  '/jobseekers/job/virtual-assistant-for-online-store-1000001': readFileSync(
    join(fixtures, 'detail.html'),
  ),
  '/login': Buffer.from(
    '<!DOCTYPE html><html><head><title>Login | OnlineJobs.ph</title></head><body><form><div class="g-recaptcha"></div><button type="submit" name="login">Login</button></form></body></html>',
  ),
};
const JOB_ID = 'onlinejobs-ph:1000001';
const PROFILE = `# Test Applicant

## Experience
- 3 years as a virtual assistant for an online store
- Managed customer email inbox (Gmail, Zendesk)

## Skills
- Shopify product listings`;
const FAKE_KEY = 'fake-e2e-key-journeys';

const AI = {
  match: {
    score: 78,
    rationale: 'Strong VA and Shopify background.',
    strengths: [
      {
        claim: 'Virtual assistant experience',
        profileQuotes: ['3 years as a virtual assistant for an online store'],
      },
      { claim: 'Customer email', profileQuotes: ['Managed customer email inbox (Gmail, Zendesk)'] },
    ],
    gaps: ['Bookkeeping'],
    uncertainties: [],
    suspiciousInstructionsInJob: false,
  },
  draft: {
    coverLetter: [
      { text: 'Hello, I would love to help your store.', kind: 'courtesy', profileQuotes: [] },
      {
        text: 'I have 3 years as a virtual assistant for an online store.',
        kind: 'factual',
        profileQuotes: ['3 years as a virtual assistant for an online store'],
      },
    ],
    answers: [
      {
        questionNumber: 1,
        status: 'answered',
        text: 'Gmail and Zendesk.',
        profileQuotes: ['Gmail, Zendesk'],
      },
    ],
    postInstructions: [],
    suspiciousInstructionsInJob: false,
  },
};

const r = createReporter('Journeys');
const chrome = await launchChrome();
let ok = false;
try {
  const extId = await chrome.loadExtension(extDir);
  const ext = (p) => `chrome-extension://${extId}/${p}`;
  const apiCalls = [];

  // Intercept job-site documents for the site tab, and Anthropic for the service worker.
  chrome.onEvent((m) => {
    if (m.method !== 'Fetch.requestPaused') return;
    const { requestId, request, resourceType } = m.params;
    const url = new URL(request.url);
    if (url.hostname === 'api.anthropic.com') {
      if (request.method === 'OPTIONS') {
        void chrome.send(
          'Fetch.fulfillRequest',
          { requestId, responseCode: 204, responseHeaders: CORS_HEADERS },
          m.sessionId,
        );
        return;
      }
      const body = JSON.parse(request.postData ?? '{}');
      apiCalls.push(body);
      const output = /draft a truthful/i.test(body.system ?? '') ? AI.draft : AI.match;
      void chrome.send(
        'Fetch.fulfillRequest',
        {
          requestId,
          responseCode: 200,
          responseHeaders: [...CORS_HEADERS, { name: 'Content-Type', value: 'application/json' }],
          body: Buffer.from(anthropicMessage(output)).toString('base64'),
        },
        m.sessionId,
      );
      return;
    }
    const page = resourceType === 'Document' ? PAGES[url.pathname] : undefined;
    if (page) {
      void chrome.send(
        'Fetch.fulfillRequest',
        {
          requestId,
          responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
          body: page.toString('base64'),
        },
        m.sessionId,
      );
    } else {
      void chrome.send(
        'Fetch.failRequest',
        { requestId, errorReason: 'BlockedByClient' },
        m.sessionId,
      );
    }
  });

  const sw = await chrome.attachServiceWorker(extId);
  await sw.send('Fetch.enable', {
    patterns: [{ urlPattern: 'https://api.anthropic.com/*', requestStage: 'Request' }],
  });
  const options = await chrome.openPage(ext('options.html'));
  const popup = await chrome.openPage(ext('popup.html'));
  const site = await chrome.openPage(null, {
    intercept: [{ urlPattern: 'https://www.onlinejobs.ph/*', requestStage: 'Request' }],
  });
  const storage = (key) =>
    options.eval(
      `chrome.storage.local.get(${JSON.stringify(key)}).then((r) => r[${JSON.stringify(key)}] ?? null)`,
    );
  const setInput = (page, sel, value, proto = 'HTMLInputElement') =>
    page.eval(
      `(() => { const el = ${sel}; Object.getOwnPropertyDescriptor(${proto}.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`,
    );
  const clickText = (page, scope, text) =>
    page.eval(
      `(() => { const b = [...${scope}.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(text)}); if (!b) return 'missing'; if (b.disabled) return 'disabled'; b.click(); return 'clicked'; })()`,
    );
  const click = (page, sel) =>
    page.eval(`(() => { const el = ${sel}; if (!el) return false; el.click(); return true; })()`);

  // ---------------------------------------------------------------- 1. Clean install
  r.section('1. Clean install');
  r.check(
    'Default site is the public OnlineJobs.ph job search',
    (
      await options.eval(`document.querySelector('[data-testid=site-row]')?.textContent ?? ''`)
    ).includes('https://www.onlinejobs.ph/jobseekers/jobsearch'),
  );
  r.check(
    'Getting started checklist shown with nothing done',
    (await options.eval(
      `[...document.querySelectorAll('[data-testid=getting-started] li')].map((li) => li.dataset.done).join()`,
    )) === 'false,false,false,false',
  );
  r.check(
    'Popup shows profile not set up and no key',
    /not set up[\s\S]*API key: not set/.test(
      await popup.eval(`document.querySelector('[data-testid=popup-status]').textContent`),
    ),
  );
  r.check(
    'Privacy section lists permissions and Anthropic as the only recipient',
    /Active tab \+ scripting/.test(
      await options.eval(`document.querySelector('#privacy').textContent`),
    ) &&
      /api\.anthropic\.com/.test(
        await options.eval(`document.querySelector('#privacy').textContent`),
      ),
  );

  // ---------------------------------------------------------------- 2. Setup
  r.section('2. Setup: profile import, keywords, API key');
  const tmp = mkdtempSync(join(tmpdir(), 'jaa-e2e-files-'));
  const profileFile = join(tmp, 'my-profile.md');
  writeFileSync(profileFile, PROFILE.replace(/\n/g, '\r\n'));
  const { result: doc } = await options.send('DOM.getDocument', {});
  const { result: input } = await options.send('DOM.querySelector', {
    nodeId: doc.root.nodeId,
    selector: '[data-testid=profile-import]',
  });
  await options.send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [profileFile] });
  await sleep(700);
  r.check(
    'Imported profile fills the editor (not yet saved)',
    (await options.eval(`document.querySelector('textarea[name=profile]').value`)) === PROFILE &&
      (await storage('profile')) === null,
  );
  await clickText(options, 'document.querySelector("#profile")', 'Save profile');
  await sleep(700);
  r.check('Profile saved as version 1', (await storage('profile'))?.data?.current?.version === 1);
  for (const [kind, value] of [
    ['include', 'assistant'],
    ['exclude', 'cold calling'],
  ]) {
    await setInput(
      options,
      `document.querySelector('[data-testid=keywords-${kind}] input')`,
      value,
    );
    await clickText(options, `document.querySelector('[data-testid=keywords-${kind}]')`, 'Add');
    await sleep(500);
  }
  const kw = (await storage('searchKeywords'))?.data;
  r.check(
    'Keywords saved',
    JSON.stringify(kw?.include) === '["assistant"]' &&
      JSON.stringify(kw?.exclude) === '["cold calling"]',
    JSON.stringify(kw),
  );
  await setInput(options, `document.querySelector('input[name=api-key]')`, FAKE_KEY);
  await clickText(options, `document.querySelector('form[aria-label="Save API key"]')`, 'Save key');
  await sleep(600);
  r.check(
    'API key saved, masked, never shown in the page',
    /Key saved/.test(
      await options.eval(`document.querySelector('[data-testid=api-key-status]').textContent`),
    ) &&
      !(await options.eval(
        `document.documentElement.outerHTML.includes(${JSON.stringify(FAKE_KEY)})`,
      )),
  );

  // ---------------------------------------------------------------- 3. Scan
  r.section('3. Scan (keyword funnel, dedupe, detail upgrade, failures)');
  const scan = async (url) => {
    await site.goto(url);
    await site.activate();
    await clickText(popup, 'document', 'Scan this tab');
    for (let i = 0; i < 30; i++) {
      await sleep(200);
      const done = await popup.eval(
        `(() => { const r = document.querySelector('[data-testid=scan-result]'); const busy = [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Scanning…'); return r && !busy ? { status: r.dataset.status, text: r.textContent.replace(/\\s+/g, ' ') } : null; })()`,
      );
      if (done) return done;
    }
    return { status: 'timeout', text: '' };
  };
  const s1 = await scan('https://www.onlinejobs.ph/jobseekers/jobsearch');
  r.check(
    'Search page: 3 found, 1 saved, 2 filtered out by keywords',
    s1.status === 'ok' &&
      /Found 3 jobs, saved 1 \(1 new\)/.test(s1.text) &&
      /2 job\(s\) did not match your keywords/.test(s1.text),
    s1.text,
  );
  const s2 = await scan('https://www.onlinejobs.ph/jobseekers/jobsearch');
  r.check('Re-scan does not duplicate', /saved 1 \(1 already saved\)/.test(s2.text), s2.text);
  const s3 = await scan(
    'https://www.onlinejobs.ph/jobseekers/job/virtual-assistant-for-online-store-1000001',
  );
  r.check('Job post scan upgrades the saved job', /saved 1 \(1 updated\)/.test(s3.text), s3.text);
  const s4 = await scan('https://www.onlinejobs.ph/login');
  r.check('Login page reported clearly, nothing saved', s4.status === 'login_required', s4.text);
  r.check('Exactly one job stored', Object.keys((await storage('jobs'))?.data ?? {}).length === 1);

  // ---------------------------------------------------------------- 4. Match
  r.section('4. Fit check (AI, evidence-checked)');
  const jobs = await chrome.openPage(ext('jobs.html'));
  const row = `document.querySelector('[data-job-id="${JOB_ID}"]')`;
  await clickText(jobs, row, 'Details');
  await sleep(300);
  await click(jobs, `${row}.querySelector('[data-testid=check-fit]')`);
  for (
    let i = 0;
    i < 30 && !(await jobs.eval(`!!${row}.querySelector('[data-testid=match-result]')`));
    i++
  )
    await sleep(200);
  const matchText = await jobs.eval(
    `${row}.querySelector('[data-testid=match-result]')?.textContent ?? ''`,
  );
  r.check(
    'Estimated fit shown as an estimate with profile-quoted strengths',
    /Estimated fit: 78\/100/.test(matchText) &&
      /AI estimate/.test(matchText) &&
      /Your profile: “3 years as a virtual assistant/.test(matchText),
    matchText.slice(0, 120),
  );
  r.check(
    'Request kept data out of the system prompt',
    apiCalls.length === 1 &&
      !apiCalls[0].system.includes('Test Applicant') &&
      apiCalls[0].messages[0].content.includes('<applicant_profile'),
  );

  // ---------------------------------------------------------------- 5. Draft
  r.section('5. Application draft (sensitive questions never sent)');
  await setInput(
    jobs,
    `${row}.querySelector('textarea[name=draft-questions]')`,
    'Which tools do you use?\nWhat is your expected salary?',
    'HTMLTextAreaElement',
  );
  await sleep(100);
  await click(jobs, `${row}.querySelector('[data-testid=draft-generate]')`);
  for (
    let i = 0;
    i < 30 && !(await jobs.eval(`!!${row}.querySelector('[data-testid=draft-result]')`));
    i++
  )
    await sleep(200);
  r.check(
    'Draft created; salary question sensitive, tools answered from profile',
    JSON.stringify(
      await jobs.eval(
        `[...${row}.querySelectorAll('[data-answer-status]')].map((x) => x.dataset.answerStatus)`,
      ),
    ) === '["answered","sensitive"]',
  );
  r.check(
    'Salary question never sent to the API',
    apiCalls.length === 2 && !/salary/i.test(apiCalls[1].messages[0].content),
  );

  // ---------------------------------------------------------------- 6. Approval + cancellation
  r.section('6. Approval, final confirmation, cancellation');
  const panel = `${row}.querySelector('[data-testid=apply-panel]')`;
  const draftStatus = async () => Object.values((await storage('drafts'))?.data ?? {})[0]?.status;
  await click(jobs, `${panel}.querySelector('[data-testid=approve]')`);
  await sleep(300);
  r.check(
    'Approval refused without review acknowledgement',
    (await draftStatus()) === 'needs_review',
  );
  await click(jobs, `${panel}.querySelector('input[name=ack-reviewed]')`);
  await click(jobs, `${panel}.querySelector('input[name=ack-leave-blank]')`);
  await click(jobs, `${panel}.querySelector('[data-testid=approve]')`);
  await sleep(600);
  r.check('Marked ready to use', (await draftStatus()) === 'approved');
  await click(jobs, `${panel}.querySelector('[data-testid=mark-submitted]')`);
  await sleep(300);
  r.check('"I submitted" needs a second confirmation', (await draftStatus()) === 'approved');
  await click(jobs, `${panel}.querySelector('[data-testid=mark-submitted-confirm]')`);
  await sleep(600);
  r.check(
    'Recorded as user-reported and unconfirmed',
    (await draftStatus()) === 'submitted' &&
      /unconfirmed/.test(await jobs.eval(`${panel}.textContent`)),
  );
  await click(jobs, `${panel}.querySelector('[data-testid=undo-submitted]')`);
  await sleep(600);
  await click(jobs, `${panel}.querySelector('[data-testid=withdraw]')`);
  await sleep(600);
  r.check(
    'Cancel paths: undo submitted, withdraw approval',
    (await draftStatus()) === 'needs_review',
  );

  // ---------------------------------------------------------------- 7. Profile improvement
  r.section('7. Profile improvement (approval-gated)');
  await options.goto(ext('options.html'));
  const P = `document.querySelector('[data-testid=profile-suggestions]')`;
  await setInput(
    options,
    `${P}.querySelector('textarea[name=profile-notes]')`,
    'Canva for social media graphics',
    'HTMLTextAreaElement',
  );
  await setInput(options, `${P}.querySelector('input[name=proposal-section]')`, 'Skills');
  await sleep(100);
  await click(options, `${P}.querySelector('[data-testid=add-as-written]')`);
  await sleep(600);
  r.check(
    'Proposal created; profile untouched',
    (await storage('profile')).data.current.version === 1 &&
      Object.values((await storage('profileProposals'))?.data ?? {}).some(
        (p) => p.status === 'pending',
      ),
  );
  await click(options, `${P}.querySelector('[data-testid=accept-proposal]')`);
  await sleep(500);
  await click(options, `${P}.querySelector('[data-testid=review-changes]')`);
  await sleep(300);
  await click(options, `${P}.querySelector('[data-testid=apply-changes]')`);
  await sleep(900);
  const prof = (await storage('profile')).data;
  r.check(
    'Saved as version 2 after review; version 1 kept',
    prof.current.version === 2 &&
      prof.current.content.includes(
        '## Skills\n- Shopify product listings\n- Canva for social media graphics',
      ) &&
      prof.history[0]?.version === 1,
  );
  r.check(
    'Getting started checklist hidden once everything is done',
    !(await options.eval(`!!document.querySelector('[data-testid=getting-started]')`)),
  );

  // ---------------------------------------------------------------- 8. CSP
  r.section('8. Network lockdown (CSP)');
  const evil = await options.eval(
    `fetch('https://collector.example/x').then(() => 'fetched', (e) => 'blocked')`,
  );
  await sleep(300);
  r.check(
    'Requests to other hosts are blocked by the extension CSP',
    evil === 'blocked' &&
      chrome.events.some(
        (e) =>
          e.sessionId === options.sessionId &&
          e.method === 'Log.entryAdded' &&
          /Content Security Policy/.test(e.params.entry.text) &&
          /collector\.example/.test(e.params.entry.text),
      ),
  );

  // ---------------------------------------------------------------- 9. Delete everything
  r.section('9. Delete everything');
  await click(options, `document.querySelector('[data-testid=delete-everything]')`);
  await sleep(200);
  await click(options, `document.querySelector('[data-testid=delete-everything-confirm]')`);
  await sleep(900);
  const all = await options.eval(`chrome.storage.local.get(null)`);
  r.check(
    'All stored data removed, including the key',
    !JSON.stringify(all).includes(FAKE_KEY) &&
      !all.profile &&
      !all.jobs &&
      !all.drafts &&
      !all.secrets,
  );

  // ---------------------------------------------------------------- Console hygiene
  r.section('Console');
  const ids = [options.sessionId, popup.sessionId, jobs.sessionId, sw.sessionId];
  const problems = consoleProblems(chrome.events, ids).filter(
    // The deliberate CSP probe above is expected to log one CSP error.
    (e) => !(e.method === 'Log.entryAdded' && /collector\.example/.test(e.params.entry.text)),
  );
  r.check(
    'No console errors or warnings in extension pages or the service worker',
    problems.length === 0,
    problems.map((e) => JSON.stringify(e.params).slice(0, 200)).join(' | '),
  );

  ok = r.summary();
} catch (e) {
  process.stderr.write(`E2E ERROR: ${e.stack ?? e}\n`);
} finally {
  await chrome.close();
}
process.exit(ok ? 0 : 1);
