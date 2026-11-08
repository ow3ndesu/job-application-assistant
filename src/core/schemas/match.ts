import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './common';

const Point = z.string().trim().min(1).max(2_000);

export const JobMatchSchema = z.object({
  id: IdSchema,
  jobId: IdSchema,
  profileId: IdSchema,
  /** Profile version the evaluation was based on. */
  profileVersion: z.number().int().min(1),
  /** 0–100 heuristic/AI-assisted estimate, not an objective measure. */
  score: z.number().int().min(0).max(100),
  strengths: z.array(Point).max(50),
  gaps: z.array(Point).max(50),
  uncertainties: z.array(Point).max(50),
  rationale: z.string().trim().min(1).max(5_000),
  evaluatedAt: IsoDateTimeSchema,
});

export type JobMatch = z.infer<typeof JobMatchSchema>;
