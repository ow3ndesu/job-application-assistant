import type { Clock, IdGenerator } from '@/core/domain';
import type { SavedJob, ScanPageStatus, ScanRecord, TargetSite } from '@/core/schemas';
import { SCAN_HISTORY_LIMIT } from '@/core/schemas';
import { applyKeywordFunnel } from '@/core/use-cases/keyword-funnel';
import { CAPTURE_FAILURE_TEXT, type CaptureResult } from '@/sites/capture';
import { mergeJobPosting } from '@/sites/dedupe';
import {
  EXTRACTION_STATUS_TEXT,
  type ExtractionResult,
  type PageSnapshot,
  type SiteAdapter,
} from '@/sites/types';
import type { Repositories } from '@/storage';

export type ScanPhase = 'reading_page' | 'reading_jobs' | 'filtering' | 'saving';

export const SCAN_PHASE_TEXT: Record<ScanPhase, string> = {
  reading_page: 'Reading the page in this tab…',
  reading_jobs: 'Finding job posts…',
  filtering: 'Applying your keywords…',
  saving: 'Saving jobs…',
};

export interface ScanDeps {
  capture: () => Promise<CaptureResult>;
  extract: (page: PageSnapshot) => Promise<{ adapter?: SiteAdapter; result: ExtractionResult }>;
  repos: Pick<Repositories, 'jobs' | 'scans' | 'targetSites' | 'searchKeywords' | 'settings'>;
  clock: Clock;
  ids: IdGenerator;
}

export interface ScanOptions {
  signal?: AbortSignal;
  onPhase?: (phase: ScanPhase) => void;
}

export interface ScanOutcome {
  record: ScanRecord;
  /** Jobs saved or refreshed by this scan, in page order. */
  jobs: SavedJob[];
}

const hostKey = (url: URL | string) => new URL(url).hostname.toLowerCase().replace(/^www\./, '');

/** Finds the configured target site for a page by host. */
export function findTargetSite(
  sites: readonly TargetSite[],
  url: URL,
): { enabled?: TargetSite; disabled?: TargetSite } {
  const host = hostKey(url);
  const matching = sites.filter((s) => hostKey(s.url) === host);
  const enabled = matching.find((s) => s.enabled);
  const disabled = matching.find((s) => !s.enabled);
  return { ...(enabled ? { enabled } : {}), ...(disabled ? { disabled } : {}) };
}

const PAGE_STATUS_TEXT: Partial<Record<ScanPageStatus, string>> = {
  cancelled: 'Scan cancelled. Nothing was saved.',
  error: 'Something went wrong while scanning. Nothing was saved.',
};

/**
 * One user-initiated scan of the page in the active tab:
 * read → extract → keyword funnel → merge/save → record history.
 * Never fetches, navigates, or runs in the background. Cancelling before the
 * save step saves nothing.
 */
export async function runScan(deps: ScanDeps, options: ScanOptions = {}): Promise<ScanOutcome> {
  const { repos, clock, ids } = deps;
  const startedAt = clock.now().toISOString();
  const keywords = await repos.searchKeywords.get();
  const counts = {
    found: 0,
    saved: 0,
    new: 0,
    updated: 0,
    unchanged: 0,
    filteredOut: 0,
    skipped: 0,
  };
  let base: Partial<ScanRecord> = {};

  const finish = async (
    status: ScanRecord['status'],
    pageStatus: ScanPageStatus,
    message: string | undefined,
    jobs: SavedJob[] = [],
  ): Promise<ScanOutcome> => {
    const record: ScanRecord = {
      id: ids.newId(),
      startedAt,
      finishedAt: clock.now().toISOString(),
      status,
      pageStatus,
      keywords: { include: [...keywords.include], exclude: [...keywords.exclude] },
      counts,
      ...base,
      ...(message ? { message: message.slice(0, 500) } : {}),
    };
    await repos.scans.upsert(record);
    await pruneHistory(repos.scans);
    return { record, jobs };
  };
  const cancelled = () => finish('cancelled', 'cancelled', PAGE_STATUS_TEXT.cancelled);

  try {
    options.onPhase?.('reading_page');
    const capture = await deps.capture();
    if (options.signal?.aborted) return await cancelled();
    if (!capture.ok)
      return await finish('failed', 'cannot_access', CAPTURE_FAILURE_TEXT[capture.reason]);

    const url = capture.snapshot.url;
    base = { url: url.href };
    const sites = (await repos.targetSites.list()).items;
    const site = findTargetSite(sites, url);
    if (!site.enabled) {
      const message = site.disabled
        ? `${site.disabled.label} is disabled in Settings → Job sites. Enable it to scan this page.`
        : 'This site is not in your job sites list. Add it in Settings → Job sites to scan it.';
      if (site.disabled)
        base = { ...base, siteId: site.disabled.id, siteLabel: site.disabled.label };
      return await finish('failed', 'site_not_enabled', message);
    }
    base = { ...base, siteId: site.enabled.id, siteLabel: site.enabled.label };

    options.onPhase?.('reading_jobs');
    const { adapter, result } = await deps.extract(capture.snapshot);
    if (adapter) base = { ...base, adapterId: adapter.id };
    if (options.signal?.aborted) return await cancelled();
    if (result.status !== 'ok') {
      const message = 'reason' in result ? result.reason : EXTRACTION_STATUS_TEXT[result.status];
      return await finish(
        result.status === 'no_results' ? 'completed' : 'failed',
        result.status,
        message,
      );
    }

    counts.found = result.jobs.length;
    counts.skipped = result.diagnostics.skipped.length;

    options.onPhase?.('filtering');
    const passing = result.jobs
      .map((job) => ({ job, funnel: applyKeywordFunnel(job, keywords) }))
      .filter(({ funnel }) => funnel.passes);
    counts.filteredOut = result.jobs.length - passing.length;

    const { scan } = await repos.settings.get();
    const limited = passing.slice(0, scan.maxJobsPerScan);
    const overLimit = passing.length - limited.length;
    counts.skipped += overLimit;

    if (options.signal?.aborted) return await cancelled();

    options.onPhase?.('saving');
    const now = clock.now().toISOString();
    const existing = new Map((await repos.jobs.list()).items.map((j) => [j.id, j]));
    const toSave: SavedJob[] = limited.map(({ job, funnel }) => {
      const prior = existing.get(job.id);
      if (!prior) {
        counts.new++;
        return {
          ...job,
          firstSeenAt: now,
          lastSeenAt: now,
          matchedKeywords: funnel.matchedInclude,
        };
      }
      const merged = mergeJobPosting(prior, job);
      if (
        merged.contentHash === prior.contentHash &&
        merged.descriptionSource === prior.descriptionSource
      ) {
        counts.unchanged++;
      } else {
        counts.updated++;
      }
      return {
        ...merged,
        firstSeenAt: prior.firstSeenAt,
        lastSeenAt: now,
        matchedKeywords: funnel.matchedInclude,
      };
    });
    const saved = toSave.length ? await repos.jobs.upsertMany(toSave) : [];
    counts.saved = saved.length;

    const notes: string[] = [];
    if (counts.filteredOut) notes.push(`${counts.filteredOut} job(s) did not match your keywords.`);
    if (overLimit)
      notes.push(`Limited to ${scan.maxJobsPerScan} jobs per scan (Settings → Scan limits).`);
    return await finish('completed', 'ok', notes.join(' ') || undefined, saved);
  } catch {
    try {
      return await finish('failed', 'error', PAGE_STATUS_TEXT.error);
    } catch {
      // Storage itself failed; report without persisting.
      return {
        record: {
          id: ids.newId(),
          startedAt,
          finishedAt: clock.now().toISOString(),
          status: 'failed',
          pageStatus: 'error',
          message: PAGE_STATUS_TEXT.error,
          keywords: { include: [...keywords.include], exclude: [...keywords.exclude] },
          counts,
        },
        jobs: [],
      };
    }
  }
}

async function pruneHistory(scans: Repositories['scans']): Promise<void> {
  const { items } = await scans.list();
  if (items.length <= SCAN_HISTORY_LIMIT) return;
  const oldest = [...items]
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .slice(0, items.length - SCAN_HISTORY_LIMIT);
  for (const record of oldest) await scans.remove(record.id);
}
