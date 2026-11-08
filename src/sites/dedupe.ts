import type { JobPosting } from '@/core/schemas';

/** Collapses duplicates (same id) within one batch; the later, richer record wins. */
export function dedupeJobs(jobs: readonly JobPosting[]): {
  jobs: JobPosting[];
  duplicates: number;
} {
  const byId = new Map<string, JobPosting>();
  for (const job of jobs) {
    const existing = byId.get(job.id);
    byId.set(job.id, existing ? mergeJobPosting(existing, job) : job);
  }
  return { jobs: [...byId.values()], duplicates: jobs.length - byId.size };
}

/**
 * Merges a newly extracted record into an existing one for the same job.
 *  - A detail-page record beats a listing snippet.
 *  - At the same level, the newer record wins, unless its description is
 *    shorter (a degraded duplicate card), in which case the existing one wins.
 *  - Fields missing from the preferred record are filled from the other;
 *    nothing is blanked out. The first `extractedAt` is kept.
 */
export function mergeJobPosting(existing: JobPosting, incoming: JobPosting): JobPosting {
  const level = (j: JobPosting) => (j.descriptionSource === 'detail_page' ? 1 : 0);
  const incomingPreferred =
    level(incoming) !== level(existing)
      ? level(incoming) > level(existing)
      : incoming.description.length >= existing.description.length;
  const [preferred, other] = incomingPreferred ? [incoming, existing] : [existing, incoming];

  const attributes = { ...other.attributes, ...preferred.attributes };
  const merged: JobPosting = {
    ...other,
    ...stripUndefined(preferred),
    extractedAt: existing.extractedAt,
    requirements: preferred.requirements.length ? preferred.requirements : other.requirements,
  };
  if (Object.keys(attributes).length) merged.attributes = attributes;
  else delete merged.attributes;
  return merged;
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** Splits incoming jobs into ones not seen before and ones already stored (by id). */
export function partitionNewJobs(
  existingIds: ReadonlySet<string>,
  incoming: readonly JobPosting[],
): { fresh: JobPosting[]; known: JobPosting[] } {
  const fresh: JobPosting[] = [];
  const known: JobPosting[] = [];
  for (const job of incoming) (existingIds.has(job.id) ? known : fresh).push(job);
  return { fresh, known };
}
