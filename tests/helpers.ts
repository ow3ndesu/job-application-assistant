import type { Clock, IdGenerator } from '@/core/domain';
import type { JobPosting, SavedJob } from '@/core/schemas';

export function fixedClock(
  iso = '2026-11-08T00:00:00.000Z',
): Clock & { advance(ms: number): void } {
  let t = new Date(iso).getTime();
  return {
    now: () => new Date(t),
    advance: (ms) => {
      t += ms;
    },
  };
}

export function sequentialIds(prefix = 'id'): IdGenerator {
  let n = 0;
  return { newId: () => `${prefix}-${++n}` };
}

export function sampleJob(overrides: Partial<JobPosting> = {}): JobPosting {
  return {
    id: 'job-1',
    source: 'onlinejobs-ph',
    sourceUrl: 'https://www.onlinejobs.ph/jobseekers/job/123',
    title: 'Virtual Assistant',
    description: 'Help with admin tasks.',
    requirements: ['Good written English'],
    extractedAt: '2026-11-08T00:00:00.000Z',
    contentHash: 'abc123',
    ...overrides,
  };
}

export function sampleSavedJob(overrides: Partial<SavedJob> = {}): SavedJob {
  const job = sampleJob();
  return {
    ...job,
    firstSeenAt: job.extractedAt,
    lastSeenAt: job.extractedAt,
    matchedKeywords: [],
    ...overrides,
  };
}
