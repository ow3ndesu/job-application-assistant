// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_TARGET_SITE_ID, SCAN_HISTORY_LIMIT, ScanRecordSchema } from '@/core/schemas';
import { parseHtml, type CaptureResult } from '@/sites/capture';
import { LOGIN_PAGE } from '@/sites/onlinejobs/fixtures/other-pages';
import { extractPage } from '@/sites/registry';
import { createRepositories, type Repositories } from '@/storage';
import { MemoryKeyValueStore } from '@/storage/kv';
import { fixedClock, sequentialIds } from '../../tests/helpers';
import { runScan, type ScanDeps, type ScanPhase } from './run-scan';

const fixture = (name: string) =>
  readFileSync(join(process.cwd(), 'src/sites/onlinejobs/fixtures', name), 'utf8');
const LISTING_URL = 'https://www.onlinejobs.ph/jobseekers/jobsearch';
const DETAIL_URL =
  'https://www.onlinejobs.ph/jobseekers/job/virtual-assistant-for-online-store-1000001';

describe('runScan', () => {
  let repos: Repositories;
  let ids = sequentialIds('scan');
  const clock = fixedClock('2026-11-08T03:00:00.000Z');

  const page = (url: string, html: string) => (): Promise<CaptureResult> =>
    Promise.resolve({
      ok: true,
      snapshot: { url: new URL(url), document: parseHtml(html), capturedAt: clock.now() },
    });
  const deps = (
    capture: ScanDeps['capture'],
    extract: ScanDeps['extract'] = extractPage,
  ): ScanDeps => ({
    capture,
    extract,
    repos,
    clock,
    ids,
  });

  beforeEach(() => {
    repos = createRepositories(new MemoryKeyValueStore(), { clock });
    ids = sequentialIds('scan');
  });

  it('saves jobs from a listing, records the scan, and reports progress', async () => {
    const phases: ScanPhase[] = [];
    const { record, jobs } = await runScan(deps(page(LISTING_URL, fixture('listing.html'))), {
      onPhase: (p) => phases.push(p),
    });
    expect(phases).toEqual(['reading_page', 'reading_jobs', 'filtering', 'saving']);
    expect(record).toMatchObject({
      status: 'completed',
      pageStatus: 'ok',
      url: LISTING_URL,
      siteId: DEFAULT_TARGET_SITE_ID,
      siteLabel: 'OnlineJobs.ph',
      adapterId: 'onlinejobs-ph',
      counts: { found: 3, saved: 3, new: 3, updated: 0, unchanged: 0, filteredOut: 0, skipped: 1 },
    });
    expect(ScanRecordSchema.safeParse(record).success).toBe(true);
    expect(jobs.map((j) => j.id)).toEqual([
      'onlinejobs-ph:1000001',
      'onlinejobs-ph:1000002',
      'onlinejobs-ph:1000003',
    ]);
    const stored = (await repos.jobs.list()).items;
    expect(stored).toHaveLength(3);
    expect(stored[0]).toMatchObject({
      firstSeenAt: clock.now().toISOString(),
      lastSeenAt: clock.now().toISOString(),
    });
    expect((await repos.scans.list()).items).toEqual([record]);
  });

  it('does not add duplicates on a re-scan; counts them as already saved', async () => {
    await runScan(deps(page(LISTING_URL, fixture('listing.html'))));
    clock.advance(60_000);
    const { record } = await runScan(deps(page(LISTING_URL, fixture('listing.html'))));
    expect(record.counts).toMatchObject({ found: 3, new: 0, updated: 0, unchanged: 3 });
    const stored = (await repos.jobs.list()).items;
    expect(stored).toHaveLength(3);
    expect(stored[0]?.firstSeenAt).toBe('2026-11-08T03:00:00.000Z');
    expect(stored[0]?.lastSeenAt).toBe('2026-11-08T03:01:00.000Z');
  });

  it('a job post scan updates the saved snippet with the full description', async () => {
    await runScan(deps(page(LISTING_URL, fixture('listing.html'))));
    const { record } = await runScan(deps(page(DETAIL_URL, fixture('detail.html'))));
    expect(record.counts).toMatchObject({ found: 1, new: 0, updated: 1 });
    const job = await repos.jobs.get('onlinejobs-ph:1000001');
    expect(job?.descriptionSource).toBe('detail_page');
    expect(job?.postedAt).toBe('2026-11-08 10:00:02');
    expect((await repos.jobs.list()).items).toHaveLength(3);
  });

  it('applies the keyword funnel: only matching jobs are saved', async () => {
    await repos.searchKeywords.set({ include: ['bookkeeping', 'shopify'], exclude: ['handmade'] });
    const { record, jobs } = await runScan(deps(page(LISTING_URL, fixture('listing.html'))));
    // VA job matches "shopify" but is excluded by "handmade"; bookkeeper matches; gig matches neither.
    expect(jobs.map((j) => j.id)).toEqual(['onlinejobs-ph:1000002']);
    expect(jobs[0]?.matchedKeywords).toEqual(['bookkeeping']);
    expect(record.counts).toMatchObject({ found: 3, saved: 1, filteredOut: 2 });
    expect(record.keywords).toEqual({ include: ['bookkeeping', 'shopify'], exclude: ['handmade'] });
    expect(record.message).toContain('2 job(s) did not match your keywords.');
  });

  it('respects the max jobs per scan setting', async () => {
    await repos.settings.update((s) => ({ ...s, scan: { ...s.scan, maxJobsPerScan: 2 } }));
    const { record } = await runScan(deps(page(LISTING_URL, fixture('listing.html'))));
    expect(record.counts).toMatchObject({ saved: 2, skipped: 2 });
    expect(record.message).toContain('Limited to 2 jobs per scan');
  });

  it('does not save from a disabled or unconfigured site', async () => {
    const [site] = (await repos.targetSites.list()).items;
    if (!site) throw new Error('no default site');
    await repos.targetSites.upsert({ ...site, enabled: false });
    const disabled = await runScan(deps(page(LISTING_URL, fixture('listing.html'))));
    expect(disabled.record).toMatchObject({ status: 'failed', pageStatus: 'site_not_enabled' });
    expect(disabled.record.message).toContain('disabled');

    await repos.targetSites.clear();
    const unconfigured = await runScan(deps(page(LISTING_URL, fixture('listing.html'))));
    expect(unconfigured.record.message).toContain('not in your job sites list');
    expect((await repos.jobs.list()).items).toEqual([]);
  });

  it('records page-level failures without saving or throwing', async () => {
    const login = await runScan(deps(page('https://www.onlinejobs.ph/login', LOGIN_PAGE)));
    expect(login.record).toMatchObject({ status: 'failed', pageStatus: 'login_required' });

    const noTab = await runScan(
      deps(() => Promise.resolve({ ok: false, reason: 'cannot_access' })),
    );
    expect(noTab.record).toMatchObject({ status: 'failed', pageStatus: 'cannot_access' });
    expect(noTab.record.url).toBeUndefined();

    const crash = await runScan(
      deps(page(LISTING_URL, fixture('listing.html')), () => Promise.reject(new Error('boom'))),
    );
    expect(crash.record).toMatchObject({ status: 'failed', pageStatus: 'error' });
    expect((await repos.jobs.list()).items).toEqual([]);
    expect((await repos.scans.list()).items).toHaveLength(3);
  });

  it.each<ScanPhase>(['reading_page', 'reading_jobs', 'filtering'])(
    'cancelling during %s saves nothing',
    async (cancelAt) => {
      const ac = new AbortController();
      const { record, jobs } = await runScan(deps(page(LISTING_URL, fixture('listing.html'))), {
        signal: ac.signal,
        onPhase: (p) => {
          if (p === cancelAt) ac.abort();
        },
      });
      expect(record).toMatchObject({ status: 'cancelled', pageStatus: 'cancelled' });
      expect(jobs).toEqual([]);
      expect((await repos.jobs.list()).items).toEqual([]);
    },
  );

  it(`keeps only the ${SCAN_HISTORY_LIMIT} most recent scans`, async () => {
    const started: string[] = [];
    for (let i = 0; i < SCAN_HISTORY_LIMIT + 3; i++) {
      clock.advance(1000);
      started.push(clock.now().toISOString());
      await runScan(deps(() => Promise.resolve({ ok: false, reason: 'no_tab' })));
    }
    const scans = (await repos.scans.list()).items;
    expect(scans).toHaveLength(SCAN_HISTORY_LIMIT);
    const oldest = [...scans].sort((a, b) => a.startedAt.localeCompare(b.startedAt))[0];
    // The 3 oldest were pruned; the 4th scan is now the oldest kept.
    expect(oldest?.startedAt).toBe(started[3]);
  });
});
