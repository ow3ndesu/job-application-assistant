import { z } from 'zod';
import { HttpUrlSchema, IdSchema, IsoDateTimeSchema, NonEmptyTextSchema } from './common';

const OptionalText = z.string().trim().min(1).max(500).optional();

export const JobPostingSchema = z.object({
  id: IdSchema,
  /** Site adapter id, e.g. `onlinejobs-ph`. */
  source: IdSchema,
  sourceUrl: HttpUrlSchema,
  title: NonEmptyTextSchema.max(500),
  company: OptionalText,
  location: OptionalText,
  compensation: OptionalText,
  employmentType: OptionalText,
  description: z.string().max(100_000),
  requirements: z.array(z.string().trim().min(1).max(2_000)).max(200),
  /** As shown by the site (may be relative text such as "2 days ago"). */
  postedAt: OptionalText,
  extractedAt: IsoDateTimeSchema,
  contentHash: z.string().min(1).max(200),
});

export type JobPosting = z.infer<typeof JobPostingSchema>;
