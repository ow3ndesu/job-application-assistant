// @vitest-environment happy-dom
/**
 * LIVE check against real saved OnlineJobs.ph pages (not fixtures). Skipped
 * unless OLJ_LIVE_DIR points to a folder with any of:
 *   jobsearch.html   – a saved /jobseekers/jobsearch page
 *   job-detail.html  – a saved /jobseekers/job/<slug>-<id> page
 *   login.html       – the page /jobseekers shows when logged out
 * Save pages yourself (browser "Save page as… HTML only"); real pages are not
 * committed. Results are recorded separately from fixture tests in PROGRESS.md.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JobPostingSchema } from '@/core/schemas';
import { parseHtml } from '../capture';
import { onlineJobsAdapter } from './adapter';

const dir = process.env.OLJ_LIVE_DIR;
const read = (name: string) =>
  dir && existsSync(join(dir, name)) ? readFileSync(join(dir, name), 'utf8') : null;
const at = new Date();

describe.skipIf(!dir)('LIVE OnlineJobs.ph pages', () => {
  it.skipIf(!read('jobsearch.html'))('job search page', async () => {
    const r = await onlineJobsAdapter.extract({
      url: new URL('https://www.onlinejobs.ph/jobseekers/jobsearch'),
      document: parseHtml(read('jobsearch.html') ?? ''),
      capturedAt: at,
    });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    for (const job of r.jobs) expect(JobPostingSchema.safeParse(job).success).toBe(true);
    const withPay = r.jobs.filter((j) => j.compensation).length;
    const withType = r.jobs.filter((j) => j.employmentType).length;
    process.stdout.write(
      `\n[LIVE] listing: jobs=${r.jobs.length} candidates=${r.diagnostics.candidates} skipped=${r.diagnostics.skipped.length} dupes=${r.diagnostics.duplicatesOnPage} withPay=${withPay} withType=${withType} notes=${JSON.stringify(r.diagnostics.notes)}\n` +
        `[LIVE] sample: ${JSON.stringify(r.jobs[0] && { id: r.jobs[0].id, title: r.jobs[0].title, type: r.jobs[0].employmentType, pay: r.jobs[0].compensation, posted: r.jobs[0].postedAt, tags: r.jobs[0].requirements })}\n`,
    );
    expect(r.diagnostics.skipped).toEqual([]);
    for (const job of r.jobs) {
      expect(job.description).not.toMatch(/See More/);
      expect(job.description).not.toMatch(/\n{3,}/);
      expect(job.description.length).toBeGreaterThan(0);
    }
  });

  it.skipIf(!read('job-detail.html'))('job detail page', async () => {
    const html = read('job-detail.html') ?? '';
    const id = /data-jobid="(\d+)"/.exec(html)?.[1] ?? '0';
    const r = await onlineJobsAdapter.extract({
      url: new URL(`https://www.onlinejobs.ph/jobseekers/job/live-${id}`),
      document: parseHtml(html),
      capturedAt: at,
    });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    const job = r.jobs[0];
    process.stdout.write(
      `\n[LIVE] detail: ${JSON.stringify(job && { id: job.id, title: job.title, type: job.employmentType, pay: job.compensation, attributes: job.attributes, skills: job.requirements, descriptionChars: job.description.length })}\n`,
    );
  });

  it.skipIf(!read('login.html'))('logged-out /jobseekers (login page)', async () => {
    const r = await onlineJobsAdapter.extract({
      url: new URL('https://www.onlinejobs.ph/login'),
      document: parseHtml(read('login.html') ?? ''),
      capturedAt: at,
    });
    expect(r.status).toBe('login_required');
  });
});
