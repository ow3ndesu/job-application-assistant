import { z } from 'zod';
import { JobPostingSchema, type JobPosting } from '@/core/schemas';
import { dedupeJobs } from '../dedupe';
import { blockText, inlineText, sha256Hex } from '../dom-text';
import type { ExtractionDiagnostics, ExtractionResult, PageSnapshot, SiteAdapter } from '../types';
import { OLJ } from './selectors';

export const ONLINEJOBS_ADAPTER_ID = 'onlinejobs-ph';

type Draft = Omit<JobPosting, 'contentHash'>;

function present(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return OLJ.emptyValues.has(value.trim().toLowerCase()) ? undefined : value;
}

/** Resolves a job link to its canonical URL and stable id, or null if it is not a job link. */
export function parseJobUrl(href: string, base: URL): { url: string; id: string } | null {
  let u: URL;
  try {
    u = new URL(href, base);
  } catch {
    return null;
  }
  if (!(OLJ.hosts as readonly string[]).includes(u.hostname)) return null;
  const m = OLJ.paths.detail.exec(u.pathname);
  if (!m?.[1] || !m[2]) return null;
  return {
    url: `${OLJ.origin}/jobseekers/job/${m[1]}`,
    id: `${ONLINEJOBS_ADAPTER_ID}:${m[2]}`,
  };
}

async function finalize(draft: Draft): Promise<{ job?: JobPosting; error?: string }> {
  const contentHash = await sha256Hex(
    JSON.stringify([
      draft.title,
      draft.compensation ?? null,
      draft.employmentType ?? null,
      draft.description,
      draft.requirements,
      draft.attributes ?? null,
    ]),
  );
  const parsed = JobPostingSchema.safeParse({ ...draft, contentHash });
  return parsed.success ? { job: parsed.data } : { error: z.prettifyError(parsed.error) };
}

function newDiagnostics(): ExtractionDiagnostics {
  return {
    adapterId: ONLINEJOBS_ADAPTER_ID,
    candidates: 0,
    skipped: [],
    duplicatesOnPage: 0,
    notes: [],
  };
}

function isChallenge(doc: Document): boolean {
  const title = doc.title.trim();
  return (
    OLJ.challenge.titles.some((re) => re.test(title)) ||
    doc.querySelector(OLJ.challenge.markers) !== null
  );
}

function isLogin(doc: Document, url: URL): boolean {
  return (
    url.pathname.replace(/\/+$/, '') === '/login' ||
    (OLJ.login.titlePrefix.test(doc.title.trim()) && doc.querySelector(OLJ.login.marker) !== null)
  );
}

async function extractListing(page: PageSnapshot): Promise<ExtractionResult> {
  const diagnostics: ExtractionDiagnostics = { ...newDiagnostics(), pageKind: 'listing' };
  const doc = page.document;
  const cards = [...doc.querySelectorAll(OLJ.listing.card)];
  diagnostics.candidates = cards.length;

  const countMatch = OLJ.listing.countText.exec(doc.body?.textContent ?? '');
  if (countMatch) diagnostics.notes.push(`Page reports ${countMatch[1]} of ${countMatch[2]} jobs.`);

  if (cards.length === 0) {
    if (countMatch?.[2] === '0') return { status: 'no_results', pageKind: 'listing', diagnostics };
    return {
      status: 'structure_changed',
      reason: 'No job cards matched the known listing layout.',
      diagnostics,
    };
  }

  const extractedAt = page.capturedAt.toISOString();
  const jobs: JobPosting[] = [];
  for (const [index, card] of cards.entries()) {
    // Usually inside the card (after Chrome restructures nested anchors); a card
    // with no nested links keeps the server form, where the link wraps the card.
    const linkEl = card.querySelector(OLJ.listing.jobLink) ?? card.closest(OLJ.listing.jobLink);
    const link = linkEl?.getAttribute('href') ?? '';
    const ids = parseJobUrl(link, page.url);
    if (!ids) {
      diagnostics.skipped.push({ index, reason: 'Card link is not a job URL.' });
      continue;
    }
    const titleEl = card.querySelector(OLJ.listing.title);
    const titleClone = titleEl?.cloneNode(true) as Element | undefined;
    titleClone?.querySelectorAll('.badge').forEach((b) => b.remove());
    const title = inlineText(titleClone);
    if (!title) {
      diagnostics.skipped.push({ index, reason: 'Card has no title.' });
      continue;
    }
    const posted = inlineText(card.querySelector(OLJ.listing.posted))?.replace(
      /^posted on\s*/i,
      '',
    );
    const requirements = [...card.querySelectorAll(OLJ.listing.tags)]
      .map((a) => inlineText(a))
      .filter((t): t is string => !!t);

    const draft: Draft = {
      id: ids.id,
      source: ONLINEJOBS_ADAPTER_ID,
      sourceUrl: ids.url,
      title,
      employmentType: present(inlineText(card.querySelector(OLJ.listing.titleBadge))),
      compensation: present(inlineText(card.querySelector(OLJ.listing.compensation))),
      description:
        blockText(card.querySelector(OLJ.listing.description), OLJ.listing.descriptionMore) ?? '',
      descriptionSource: 'listing_snippet',
      requirements: [...new Set(requirements)],
      postedAt: present(posted),
      extractedAt,
    };
    const { job, error } = await finalize(stripUndefinedFields(draft));
    if (job) jobs.push(job);
    else diagnostics.skipped.push({ index, reason: `Failed validation: ${error ?? 'unknown'}` });
  }

  const deduped = dedupeJobs(jobs);
  diagnostics.duplicatesOnPage = deduped.duplicates;
  if (deduped.jobs.length === 0) {
    return {
      status: 'structure_changed',
      reason: 'Job cards were found but none could be read.',
      diagnostics,
    };
  }
  return { status: 'ok', pageKind: 'listing', jobs: deduped.jobs, diagnostics };
}

async function extractDetail(page: PageSnapshot): Promise<ExtractionResult> {
  const diagnostics: ExtractionDiagnostics = { ...newDiagnostics(), pageKind: 'detail' };
  const doc = page.document;
  const ids = parseJobUrl(page.url.href, page.url);
  const titleEl = doc.querySelector(OLJ.detail.title);
  const title = inlineText(titleEl);
  const descriptionEl = doc.querySelector(OLJ.detail.description);
  diagnostics.candidates = titleEl ? 1 : 0;

  if (!ids || !title || !descriptionEl) {
    return {
      status: 'structure_changed',
      reason: !title
        ? 'The job title was not found in the known layout.'
        : 'The job description was not found in the known layout.',
      diagnostics,
    };
  }

  const attributes: Record<string, string> = {};
  for (const block of doc.querySelectorAll(OLJ.detail.factBlocks)) {
    const label = inlineText(block.querySelector(OLJ.detail.factLabel));
    const value = present(inlineText(block.querySelector(OLJ.detail.factValue)));
    if (label && value) attributes[label] = value;
  }
  const skills = [...doc.querySelectorAll(OLJ.detail.skills)]
    .map((a) => inlineText(a))
    .filter((t): t is string => !!t);

  const draft: Draft = {
    id: ids.id,
    source: ONLINEJOBS_ADAPTER_ID,
    sourceUrl: ids.url,
    title,
    employmentType: attributes['TYPE OF WORK'],
    compensation: attributes['WAGE / SALARY'],
    description: blockText(descriptionEl) ?? '',
    descriptionSource: 'detail_page',
    requirements: [...new Set(skills)],
    // "DATE UPDATED" is not a posting date, so it stays in `attributes` only.
    attributes: Object.keys(attributes).length ? attributes : undefined,
    extractedAt: page.capturedAt.toISOString(),
  };
  if (Object.keys(attributes).length === 0) {
    diagnostics.notes.push('No labelled job facts (type, wage, hours) were found.');
  }
  const { job, error } = await finalize(stripUndefinedFields(draft));
  if (!job) {
    diagnostics.skipped.push({ index: 0, reason: `Failed validation: ${error ?? 'unknown'}` });
    return { status: 'structure_changed', reason: 'The job post could not be read.', diagnostics };
  }
  return { status: 'ok', pageKind: 'detail', jobs: [job], diagnostics };
}

/** Removes keys whose value is undefined (exactOptionalPropertyTypes-friendly). */
function stripUndefinedFields<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

export const onlineJobsAdapter: SiteAdapter = {
  id: ONLINEJOBS_ADAPTER_ID,
  label: 'OnlineJobs.ph',

  // ToS §7.4 requires personal use "without the use of any automated means";
  // the user chose read-only use (Q1 = a, 2026-11-08).
  formAssistance: {
    allowed: false,
    reason:
      "OnlineJobs.ph's terms don't allow automated use, so the extension never fills in or submits forms there. Copy your draft and apply on the site yourself.",
  },

  canHandle(url) {
    return url.protocol === 'https:' && (OLJ.hosts as readonly string[]).includes(url.hostname);
  },

  async extract(page) {
    if (!this.canHandle(page.url)) {
      return {
        status: 'unsupported_page',
        reason: 'Not an OnlineJobs.ph page.',
        diagnostics: newDiagnostics(),
      };
    }
    const doc = page.document;
    // Login first: the real login form embeds a CAPTCHA widget (observed 2026-11-08).
    if (isLogin(doc, page.url)) return { status: 'login_required', diagnostics: newDiagnostics() };
    if (isChallenge(doc)) return { status: 'blocked', diagnostics: newDiagnostics() };
    if (OLJ.paths.detail.test(page.url.pathname)) return extractDetail(page);
    if (OLJ.paths.listing.test(page.url.pathname)) return extractListing(page);
    return {
      status: 'unsupported_page',
      reason: 'Open the OnlineJobs.ph job search page or a job post, then try again.',
      diagnostics: newDiagnostics(),
    };
  },

  searchUrl(keyword) {
    const u = new URL(OLJ.paths.search, OLJ.origin);
    if (keyword.trim()) u.searchParams.set(OLJ.searchKeywordParam, keyword.trim());
    return u;
  },
};
