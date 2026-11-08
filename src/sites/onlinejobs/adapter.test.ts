// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JobPostingSchema } from '@/core/schemas';
import { parseHtml } from '../capture';
import { dedupeJobs, mergeJobPosting, partitionNewJobs } from '../dedupe';
import { extractPage, findAdapter } from '../registry';
import type { ExtractionResult, PageSnapshot } from '../types';
import { onlineJobsAdapter, parseJobUrl } from './adapter';
import {
  CHALLENGE_PAGE,
  DETAIL_CHANGED,
  LISTING_CHANGED,
  LISTING_EMPTY,
  LISTING_WITH_CAPTCHA_WIDGET_MARKER,
  LOGIN_PAGE,
  OTHER_PAGE,
} from './fixtures/other-pages';

// Resolved from the project root: under happy-dom, import.meta.url is not a file URL.
const fixture = (name: string) =>
  readFileSync(join(process.cwd(), 'src/sites/onlinejobs/fixtures', name), 'utf8');

const CAPTURED_AT = new Date('2026-11-08T03:00:00.000Z');
const snap = (url: string, html: string): PageSnapshot => ({
  url: new URL(url),
  document: parseHtml(html),
  capturedAt: CAPTURED_AT,
});

const LISTING_URL = 'https://www.onlinejobs.ph/jobseekers/jobsearch?jobkeyword=assistant';
const DETAIL_URL =
  'https://www.onlinejobs.ph/jobseekers/job/virtual-assistant-for-online-store-1000001';

function okJobs(result: ExtractionResult) {
  if (result.status !== 'ok') throw new Error(`expected ok, got ${result.status}`);
  return result.jobs;
}

describe('canHandle / routing', () => {
  it.each([
    ['https://www.onlinejobs.ph/jobseekers/jobsearch', true],
    ['https://onlinejobs.ph/jobseekers/job/x-1', true],
    ['http://www.onlinejobs.ph/jobseekers/jobsearch', false],
    ['https://www.onlinejobs.ph.evil.example/jobseekers', false],
    ['https://evil.example/www.onlinejobs.ph', false],
    ['https://www.upwork.com/jobs', false],
  ])('%s → %s', (url, expected) => {
    expect(onlineJobsAdapter.canHandle(new URL(url))).toBe(expected);
    expect(findAdapter(new URL(url)) !== undefined).toBe(expected);
  });

  it('builds a search URL the user can open (never fetched by the extension)', () => {
    expect(onlineJobsAdapter.searchUrl?.('virtual assistant').href).toBe(
      'https://www.onlinejobs.ph/jobseekers/jobsearch?jobkeyword=virtual+assistant',
    );
  });

  it('parses job URLs to a canonical URL and stable id', () => {
    const base = new URL(LISTING_URL);
    expect(parseJobUrl('/jobseekers/job/sample-teacher-role-1000099?ref=x#top', base)).toEqual({
      url: 'https://www.onlinejobs.ph/jobseekers/job/sample-teacher-role-1000099',
      id: 'onlinejobs-ph:1000099',
    });
    expect(parseJobUrl('https://evil.example/jobseekers/job/x-1', base)).toBeNull();
    expect(parseJobUrl('/jobseekers/jobsearch', base)).toBeNull();
  });
});

describe('listing page (normal + partial cards)', () => {
  it('extracts valid jobs with source URL, timestamp and visible fields only', async () => {
    const result = await onlineJobsAdapter.extract(snap(LISTING_URL, fixture('listing.html')));
    const jobs = okJobs(result);
    expect(jobs.map((j) => j.id)).toEqual([
      'onlinejobs-ph:1000001',
      'onlinejobs-ph:1000002',
      'onlinejobs-ph:1000003',
    ]);
    for (const job of jobs) {
      expect(JobPostingSchema.safeParse(job).success).toBe(true);
      expect(job.sourceUrl).toMatch(/^https:\/\/www\.onlinejobs\.ph\/jobseekers\/job\//);
      expect(job.extractedAt).toBe(CAPTURED_AT.toISOString());
      expect(job.descriptionSource).toBe('listing_snippet');
      // Not shown on the page → must stay absent, never fabricated.
      expect(job.company).toBeUndefined();
      expect(job.location).toBeUndefined();
    }

    const [va, bookkeeper, gig] = jobs;
    expect(va).toMatchObject({
      title: 'Virtual Assistant for Online Store',
      employmentType: 'Full Time',
      compensation: '$600 to $750/month',
      postedAt: '2026-11-08 10:00:02',
      requirements: ['Email Management', 'Shopify'],
    });
    expect(va?.description).toContain('order processing & customer email.');
    expect(va?.description).not.toContain('See More');
    expect(va?.description.split('\n')[0]).toBe('About Example Store Co');

    expect(bookkeeper?.compensation).toBeUndefined(); // "N/A" is not a value
    expect(bookkeeper?.employmentType).toBe('Part Time');
    expect(gig).toMatchObject({
      employmentType: 'Gig',
      compensation: '6 / hour',
      requirements: [],
    });
  });

  it('reports duplicates, skipped cards and page counts in diagnostics', async () => {
    const result = await onlineJobsAdapter.extract(snap(LISTING_URL, fixture('listing.html')));
    expect(result.diagnostics).toMatchObject({
      pageKind: 'listing',
      candidates: 5,
      duplicatesOnPage: 1,
      skipped: [{ index: 4, reason: 'Card has no title.' }],
    });
    expect(result.diagnostics.notes).toContain('Page reports 5 of 5 jobs.');
  });

  it('gives the same id and hash for the same job on a re-read', async () => {
    const a = okJobs(await onlineJobsAdapter.extract(snap(LISTING_URL, fixture('listing.html'))));
    const b = okJobs(await onlineJobsAdapter.extract(snap(LISTING_URL, fixture('listing.html'))));
    expect(b.map((j) => [j.id, j.contentHash])).toEqual(a.map((j) => [j.id, j.contentHash]));
  });
});

describe('detail page', () => {
  it('extracts the full description, labelled facts and skills', async () => {
    const [job] = okJobs(await onlineJobsAdapter.extract(snap(DETAIL_URL, fixture('detail.html'))));
    expect(job).toMatchObject({
      id: 'onlinejobs-ph:1000001',
      sourceUrl: DETAIL_URL,
      title: 'Virtual Assistant for Online Store',
      employmentType: 'Full Time',
      compensation: '$600 to $750/month',
      descriptionSource: 'detail_page',
      requirements: ['Email Management', 'Shopify'],
      attributes: {
        'TYPE OF WORK': 'Full Time',
        'WAGE / SALARY': '$600 to $750/month',
        'HOURS PER WEEK': '40',
        'DATE UPDATED': 'Nov 8, 2026',
      },
    });
    expect(job?.postedAt).toBeUndefined(); // "DATE UPDATED" is not a posting date
    expect(job?.company).toBeUndefined();
    expect(job?.description).toBe(
      'About Example Store Co\n\nWe sell handmade goods online and need help with order processing & customer email.\nRequirements:\n- 1+ year of e-commerce support experience\n- Good written English',
    );
  });

  it('partial post: missing facts stay absent, "N/A" pay is not a value', async () => {
    const url = 'https://www.onlinejobs.ph/jobseekers/job/social-media-helper-1000004';
    const result = await onlineJobsAdapter.extract(snap(url, fixture('detail-partial.html')));
    const [job] = okJobs(result);
    expect(job).toMatchObject({ title: 'Social Media Helper', requirements: [] });
    expect(job?.compensation).toBeUndefined();
    expect(job?.employmentType).toBeUndefined();
    expect(job?.attributes).toBeUndefined();
    expect(result.diagnostics.notes).toContain(
      'No labelled job facts (type, wage, hours) were found.',
    );
  });
});

describe('not found / could not access / structure unsupported', () => {
  const cases: [string, string, string, ExtractionResult['status']][] = [
    ['empty search', LISTING_URL, LISTING_EMPTY, 'no_results'],
    ['login page', 'https://www.onlinejobs.ph/login', LOGIN_PAGE, 'login_required'],
    [
      'login page shown at another URL',
      'https://www.onlinejobs.ph/jobseekers',
      LOGIN_PAGE,
      'login_required',
    ],
    ['bot challenge', LISTING_URL, CHALLENGE_PAGE, 'blocked'],
    ['changed listing markup', LISTING_URL, LISTING_CHANGED, 'structure_changed'],
    [
      'changed detail markup',
      'https://www.onlinejobs.ph/jobseekers/job/something-1000012',
      DETAIL_CHANGED,
      'structure_changed',
    ],
    [
      'other site page',
      'https://www.onlinejobs.ph/jobseekers/dashboard',
      OTHER_PAGE,
      'unsupported_page',
    ],
  ];

  it.each(cases)('%s → %s', async (_label, url, html, status) => {
    const result = await onlineJobsAdapter.extract(snap(url, html));
    expect(result.status).toBe(status);
    expect('jobs' in result).toBe(false);
  });

  it('a CAPTCHA widget on a normal listing does not count as blocked (and is never touched)', async () => {
    const html = fixture('listing.html').replace(
      '</body>',
      `${LISTING_WITH_CAPTCHA_WIDGET_MARKER}</body>`,
    );
    const result = await onlineJobsAdapter.extract(snap(LISTING_URL, html));
    expect(result.status).toBe('ok');
  });

  it('pages from unsupported sites are reported, not crashed on', async () => {
    const { adapter, result } = await extractPage(
      snap('https://example.com/jobs', '<html></html>'),
    );
    expect(adapter).toBeUndefined();
    expect(result.status).toBe('unsupported_page');
  });

  it('an adapter that throws is contained as structure_changed', async () => {
    const page = snap(LISTING_URL, fixture('listing.html'));
    const broken = { ...page, document: null as unknown as Document };
    const { result } = await extractPage(broken);
    expect(result.status).toBe('structure_changed');
  });
});

describe('dedupe and merge', () => {
  it('detail data enriches a listing snippet without losing fields or first-seen time', async () => {
    const [snippet] = okJobs(
      await onlineJobsAdapter.extract(snap(LISTING_URL, fixture('listing.html'))),
    );
    const later = {
      ...snap(DETAIL_URL, fixture('detail.html')),
      capturedAt: new Date('2026-11-09T00:00:00Z'),
    };
    const [detail] = okJobs(await onlineJobsAdapter.extract(later));
    if (!snippet || !detail) throw new Error('missing jobs');

    const merged = mergeJobPosting(snippet, detail);
    expect(merged.descriptionSource).toBe('detail_page');
    expect(merged.postedAt).toBe('2026-11-08 10:00:02'); // kept from listing
    expect(merged.attributes?.['HOURS PER WEEK']).toBe('40');
    expect(merged.extractedAt).toBe(snippet.extractedAt);

    // A later snippet must not overwrite the full description.
    const again = mergeJobPosting(merged, snippet);
    expect(again.descriptionSource).toBe('detail_page');
    expect(again.description).toBe(detail.description);
    expect(JobPostingSchema.safeParse(again).success).toBe(true);
  });

  it('detects already-stored jobs by id', async () => {
    const jobs = okJobs(
      await onlineJobsAdapter.extract(snap(LISTING_URL, fixture('listing.html'))),
    );
    const { fresh, known } = partitionNewJobs(new Set(['onlinejobs-ph:1000002']), jobs);
    expect(known.map((j) => j.id)).toEqual(['onlinejobs-ph:1000002']);
    expect(fresh).toHaveLength(2);
    expect(dedupeJobs([...jobs, ...jobs]).duplicates).toBe(3);
  });
});
