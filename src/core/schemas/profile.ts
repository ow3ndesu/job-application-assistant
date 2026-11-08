import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './common';

/** Keeps profile versions well inside the 10 MB `storage.local` quota. */
export const PROFILE_LIMITS = { maxChars: 100_000, historyLimit: 20 } as const;

export const ApplicantProfileSchema = z.object({
  id: IdSchema,
  version: z.number().int().min(1),
  /** User-maintained plain text / Markdown. */
  content: z.string().max(PROFILE_LIMITS.maxChars),
  updatedAt: IsoDateTimeSchema,
});

export type ApplicantProfile = z.infer<typeof ApplicantProfileSchema>;

/** Persisted profile state: the current version plus recoverable previous versions. */
export const ProfileStateSchema = z.object({
  current: ApplicantProfileSchema.nullable(),
  /** Previous versions, newest first. */
  history: z.array(ApplicantProfileSchema),
});

export type ProfileState = z.infer<typeof ProfileStateSchema>;

export function emptyProfileState(): ProfileState {
  return { current: null, history: [] };
}
