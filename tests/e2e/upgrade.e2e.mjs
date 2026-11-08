// Upgrade path: storage written in older schema versions (v1) must migrate
// cleanly when the current build loads, with no data loss and no errors.
// Usage: node tests/e2e/upgrade.e2e.mjs <builtExtensionDir>
import { resolve } from 'node:path';
import { consoleProblems, createReporter, launchChrome, sleep } from './harness.mjs';

const extDir = resolve(process.argv[2] ?? '.output/chrome-mv3');
const now = '2026-11-01T00:00:00.000Z';
const JOB = 'onlinejobs-ph:7000001';
const V1 = {
  settings: {
    schemaVersion: 1,
    data: { ai: { provider: 'anthropic' }, scan: { maxJobsPerScan: 25, requestDelayMs: 5000 } },
  },
  targetSites: {
    schemaVersion: 1,
    data: {
      'onlinejobs-ph': {
        id: 'onlinejobs-ph',
        url: 'https://www.onlinejobs.ph/jobseekers',
        label: 'OnlineJobs.ph',
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
    },
  },
  profile: {
    schemaVersion: 1,
    data: {
      current: { id: 'p1', version: 1, content: '# Me\n- 3 years as a VA', updatedAt: now },
      history: [],
    },
  },
  jobs: {
    schemaVersion: 1,
    data: {
      [JOB]: {
        id: JOB,
        source: 'onlinejobs-ph',
        sourceUrl: 'https://www.onlinejobs.ph/jobseekers/job/old-7000001',
        title: 'Old Saved Job',
        description: 'Old description.',
        requirements: [],
        extractedAt: now,
        contentHash: 'h',
      },
    },
  },
  matches: {
    schemaVersion: 1,
    data: {
      [`${JOB}@v1`]: {
        id: `${JOB}@v1`,
        jobId: JOB,
        profileId: 'p1',
        profileVersion: 1,
        score: 60,
        strengths: ['Has VA experience'],
        gaps: [],
        uncertainties: [],
        rationale: 'Old estimate.',
        evaluatedAt: now,
      },
    },
  },
  drafts: {
    schemaVersion: 1,
    data: {
      [`${JOB}@v1`]: {
        id: `${JOB}@v1`,
        jobId: JOB,
        profileId: 'p1',
        profileVersion: 1,
        answers: { 'Why us?': 'Because I like it.' },
        evidence: {},
        unknownQuestions: ['Expected salary?'],
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      },
    },
  },
};

const r = createReporter('Upgrade');
const chrome = await launchChrome();
let ok = false;
try {
  const extId = await chrome.loadExtension(extDir);
  const ext = (p) => `chrome-extension://${extId}/${p}`;
  const options = await chrome.openPage(ext('options.html'));
  await options.eval(
    `chrome.storage.local.clear().then(() => chrome.storage.local.set(${JSON.stringify(V1)})).then(() => true)`,
  );
  await options.goto(ext('options.html'));
  const jobs = await chrome.openPage(ext('jobs.html'));
  const row = `document.querySelector('[data-job-id="${JOB}"]')`;
  await jobs.eval(
    `(() => { const b = [...${row}.querySelectorAll('button')].find((b) => b.textContent === 'Details'); b?.click(); return !!b; })()`,
  );
  await sleep(500);
  const get = (k) =>
    options.eval(
      `chrome.storage.local.get(${JSON.stringify(k)}).then((r) => r[${JSON.stringify(k)}])`,
    );

  r.check(
    'Untouched old default site moved to the public job search URL',
    (await options.eval(`document.querySelector('[data-testid=site-row]').textContent`)).includes(
      '/jobseekers/jobsearch',
    ),
  );
  r.check(
    'Stored settings kept (no silent reset)',
    (await options.eval(`document.querySelector('[name=max-jobs]').value`)) === '25',
  );
  r.check('Old job still listed after migration', !!(await jobs.eval(`!!${row}`)));
  const matchText = await jobs.eval(
    `${row}.querySelector('[data-testid=match-result]')?.textContent ?? ''`,
  );
  r.check(
    'Old unverified strength shown as unsupported, never as a fact',
    /Not supported by your profile/.test(matchText) &&
      /Has VA experience/.test(matchText) &&
      /No strengths could be confirmed/.test(matchText),
    matchText.slice(0, 160),
  );
  const statuses = await jobs.eval(
    `[...${row}.querySelectorAll('[data-answer-status]')].map((x) => x.dataset.answerStatus)`,
  );
  r.check(
    'Old draft answers kept as your own text; unknown question kept',
    JSON.stringify(statuses) === '["user_written","unknown"]',
    JSON.stringify(statuses),
  );

  const versions = Object.fromEntries(
    await Promise.all(
      ['targetSites', 'jobs', 'matches', 'drafts'].map(async (k) => [
        k,
        (await get(k))?.schemaVersion,
      ]),
    ),
  );
  r.check(
    'Migrated collections written back at the current schema version',
    versions.targetSites === 2 &&
      versions.jobs === 2 &&
      versions.matches === 2 &&
      versions.drafts === 2,
    JSON.stringify(versions),
  );
  const job = (await get('jobs')).data[JOB];
  r.check(
    'Migrated job gained first/last-seen dates from its extraction time',
    job.firstSeenAt === now && job.lastSeenAt === now,
  );
  r.check(
    'No quarantined data (nothing was unreadable)',
    !Object.keys(await options.eval('chrome.storage.local.get(null)')).some((k) =>
      k.startsWith('quarantine:'),
    ),
  );

  const problems = consoleProblems(chrome.events, [options.sessionId, jobs.sessionId]);
  r.check(
    'No console errors or warnings',
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
