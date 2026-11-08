import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './common';

export const DraftStatusSchema = z.enum([
  'draft',
  'needs_review',
  'approved',
  'submitted',
  'failed',
]);

export type DraftStatus = z.infer<typeof DraftStatusSchema>;

const QuestionKey = z.string().trim().min(1).max(2_000);

export const ApplicationDraftSchema = z.object({
  id: IdSchema,
  jobId: IdSchema,
  profileId: IdSchema,
  profileVersion: z.number().int().min(1),
  /** Question (or field label) → drafted answer. */
  answers: z.record(QuestionKey, z.string().max(20_000)),
  /** Question → profile statements supporting the answer. */
  evidence: z.record(QuestionKey, z.array(z.string().max(5_000))),
  unknownQuestions: z.array(QuestionKey),
  status: DraftStatusSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export type ApplicationDraft = z.infer<typeof ApplicationDraftSchema>;
