import { z } from 'zod';
import { HttpUrlSchema, IdSchema, IsoDateTimeSchema } from './common';
import { JobPostingSchema } from './job';

/** A job as stored: the extracted posting plus when the user's scans saw it. */
export const SavedJobSchema = JobPostingSchema.extend({
  firstSeenAt: IsoDateTimeSchema,
  lastSeenAt: IsoDateTimeSchema,
  /** Include-keywords that matched when it was last saved (for display). */
  matchedKeywords: z.array(z.string().trim().min(1).max(100)).max(50),
});

export type SavedJob = z.infer<typeof SavedJobSchema>;

/** jobs v1 (plain JobPosting, never written by a released build) → v2 (SavedJob). */
export function migrateJobsV1toV2(data: unknown): unknown {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return data;
  return Object.fromEntries(
    Object.entries(data as Record<string, unknown>).map(([id, job]) => {
      if (typeof job !== 'object' || job === null) return [id, job];
      const j = job as { extractedAt?: unknown };
      return [
        id,
        { ...job, firstSeenAt: j.extractedAt, lastSeenAt: j.extractedAt, matchedKeywords: [] },
      ];
    }),
  );
}

export const ScanPageStatusSchema = z.enum([
  'ok',
  'no_results',
  'login_required',
  'blocked',
  'unsupported_page',
  'structure_changed',
  'site_not_enabled',
  'cannot_access',
  'cancelled',
  'error',
]);

export type ScanPageStatus = z.infer<typeof ScanPageStatusSchema>;

const Count = z.number().int().min(0);

export const ScanRecordSchema = z.object({
  id: IdSchema,
  startedAt: IsoDateTimeSchema,
  finishedAt: IsoDateTimeSchema,
  status: z.enum(['completed', 'cancelled', 'failed']),
  /** The page that was scanned (absent if the tab could not be read). */
  url: HttpUrlSchema.optional(),
  /** Configured target site the page belongs to, if any. */
  siteId: IdSchema.optional(),
  siteLabel: z.string().max(100).optional(),
  adapterId: z.string().max(100).optional(),
  pageStatus: ScanPageStatusSchema,
  message: z.string().max(500).optional(),
  keywords: z.object({
    include: z.array(z.string().max(100)).max(50),
    exclude: z.array(z.string().max(100)).max(50),
  }),
  counts: z.object({
    found: Count,
    saved: Count,
    new: Count,
    updated: Count,
    unchanged: Count,
    filteredOut: Count,
    skipped: Count,
  }),
});

export type ScanRecord = z.infer<typeof ScanRecordSchema>;

export const SCAN_HISTORY_LIMIT = 50;
