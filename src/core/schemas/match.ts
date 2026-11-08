import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './common';

const Point = z.string().trim().min(1).max(2_000);

/** A strength the applicant has, backed by verbatim quotes from their profile. */
export const EvidencedStrengthSchema = z.object({
  claim: Point,
  /** Exact profile text supporting the claim. Verified in code; never empty. */
  evidence: z.array(z.string().trim().min(1).max(2_000)).min(1).max(10),
});

export type EvidencedStrength = z.infer<typeof EvidencedStrengthSchema>;

export const JobMatchSchema = z.object({
  /** `${jobId}@v${profileVersion}`: one record per job per profile version. */
  id: IdSchema,
  jobId: IdSchema,
  profileId: IdSchema,
  /** Profile version the evaluation was based on. */
  profileVersion: z.number().int().min(1),
  /** 0–100 AI-assisted estimate, not an objective measure. */
  score: z.number().int().min(0).max(100),
  /** Only strengths whose evidence was found verbatim in the profile. */
  strengths: z.array(EvidencedStrengthSchema).max(50),
  /** Job requirements the profile does not show. */
  gaps: z.array(Point).max(50),
  uncertainties: z.array(Point).max(50),
  /** Claims the model made without verifiable profile evidence. Shown as unsupported, never as facts. */
  unsupportedClaims: z.array(Point).max(50),
  rationale: z.string().trim().min(1).max(5_000),
  /** True if instruction-like text aimed at an AI was found in the job text. */
  injectionSuspected: z.boolean(),
  /** The job description was only a search-page preview. */
  basedOnSnippet: z.boolean(),
  /** `contentHash` of the job when evaluated (detects a changed job). */
  jobContentHash: z.string().min(1).max(200),
  model: z.string().min(1).max(100),
  evaluatedAt: IsoDateTimeSchema,
});

export type JobMatch = z.infer<typeof JobMatchSchema>;

/**
 * matches v1 → v2. No released build wrote v1 matches; any v1 string
 * "strengths" lacked evidence, so they become unsupported claims, never facts.
 */
export function migrateMatchesV1toV2(data: unknown): unknown {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return data;
  return Object.fromEntries(
    Object.entries(data as Record<string, unknown>).map(([id, m]) => {
      if (typeof m !== 'object' || m === null) return [id, m];
      const v1 = m as { strengths?: unknown };
      return [
        id,
        {
          ...m,
          strengths: [],
          unsupportedClaims: Array.isArray(v1.strengths) ? v1.strengths : [],
          injectionSuspected: false,
          basedOnSnippet: false,
          jobContentHash: 'unknown',
          model: 'unknown',
        },
      ];
    }),
  );
}

export function matchId(jobId: string, profileVersion: number): string {
  return `${jobId}@v${profileVersion}`;
}
