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

const Question = z.string().trim().min(1).max(500);
const Quote = z.string().trim().min(1).max(2_000);
const Point = z.string().trim().min(1).max(2_000);

export const SENSITIVE_CATEGORIES = [
  'legal_attestation',
  'demographic',
  'work_authorization',
  'criminal_history',
  'health',
  'compensation',
  'identity_or_financial',
] as const;

export const SensitiveCategorySchema = z.enum(SENSITIVE_CATEGORIES);
export type SensitiveCategory = z.infer<typeof SensitiveCategorySchema>;

/**
 * answered:     drafted from verified profile facts (or non-factual wording)
 * unknown:      the profile has no supporting facts; left blank for the user
 * sensitive:    never auto-answered; the user must answer it themselves
 * user_written: the user wrote or changed this answer
 */
export const DraftAnswerStatusSchema = z.enum(['answered', 'unknown', 'sensitive', 'user_written']);
export type DraftAnswerStatus = z.infer<typeof DraftAnswerStatusSchema>;

export const DraftAnswerSchema = z.object({
  question: Question,
  answer: z.string().max(20_000),
  status: DraftAnswerStatusSchema,
  /** Verbatim profile quotes supporting the drafted answer (verified in code). */
  evidence: z.array(Quote).max(10),
  sensitiveCategory: SensitiveCategorySchema.optional(),
  note: z.string().max(500).optional(),
});

export type DraftAnswer = z.infer<typeof DraftAnswerSchema>;

export const ApplicationDraftSchema = z.object({
  /** `${jobId}@v${profileVersion}` */
  id: IdSchema,
  jobId: IdSchema,
  profileId: IdSchema,
  profileVersion: z.number().int().min(1),
  /** Editable final text. */
  coverLetter: z.string().max(20_000),
  /** Each factual paragraph as generated, with the profile quotes that support it. */
  coverLetterEvidence: z
    .array(z.object({ paragraph: z.string().max(5_000), evidence: z.array(Quote).min(1).max(10) }))
    .max(30),
  /** Generated statements removed because no profile evidence could be verified. */
  removedStatements: z.array(Point).max(30),
  answers: z.array(DraftAnswerSchema).max(30),
  /** Things the job post asks applicants to do (untrusted; shown with caution, never auto-applied). */
  postInstructions: z.array(Point).max(20),
  injectionSuspected: z.boolean(),
  /** True once the user has edited any text. */
  editedByUser: z.boolean(),
  status: DraftStatusSchema,
  jobContentHash: z.string().min(1).max(200),
  model: z.string().min(1).max(100),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export type ApplicationDraft = z.infer<typeof ApplicationDraftSchema>;

export function draftId(jobId: string, profileVersion: number): string {
  return `${jobId}@v${profileVersion}`;
}

/**
 * drafts v1 → v2. No released build wrote v1 drafts. v1 answers had no
 * verifiable evidence, so they are kept as the user's own text.
 */
export function migrateDraftsV1toV2(data: unknown): unknown {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return data;
  return Object.fromEntries(
    Object.entries(data as Record<string, unknown>).map(([id, d]) => {
      if (typeof d !== 'object' || d === null) return [id, d];
      const v1 = d as { answers?: Record<string, string>; unknownQuestions?: string[] };
      const answers = [
        ...Object.entries(v1.answers ?? {}).map(([question, answer]) => ({
          question,
          answer,
          status: 'user_written',
          evidence: [],
        })),
        ...(v1.unknownQuestions ?? []).map((question) => ({
          question,
          answer: '',
          status: 'unknown',
          evidence: [],
        })),
      ];
      return [
        id,
        {
          ...d,
          coverLetter: '',
          coverLetterEvidence: [],
          removedStatements: [],
          answers,
          postInstructions: [],
          injectionSuspected: false,
          editedByUser: true,
          jobContentHash: 'unknown',
          model: 'unknown',
        },
      ];
    }),
  );
}
