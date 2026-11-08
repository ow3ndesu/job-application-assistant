import { z } from 'zod';
import {
  IdSchema,
  type ApplicationDraft,
  type JobMatch,
  type ProfileProposal,
} from '@/core/schemas';
import { MAX_NOTES_CHARS } from '@/profile-updates/propose';
import type { RejectedAddition } from '@/profile-updates/verify';
import type { AIErrorKind } from '@/providers/ai/types';

/** Requests UI pages may send to the background worker. */
export const BackgroundRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ai/validate-key') }),
  z.object({ type: z.literal('ai/match-job'), jobId: IdSchema }),
  z.object({
    type: z.literal('ai/draft-application'),
    jobId: IdSchema,
    questions: z.array(z.string().max(2_000)).max(50),
    /** Required to overwrite a draft the user has edited. */
    replaceEdited: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('ai/propose-profile-additions'),
    /** The user's own words describing facts to add. */
    notes: z.string().max(MAX_NOTES_CHARS),
  }),
]);

export type BackgroundRequest = z.infer<typeof BackgroundRequestSchema>;

export type BackgroundError = {
  kind:
    | AIErrorKind
    | 'unauthorized_sender'
    | 'bad_message'
    | 'internal'
    | 'no_profile'
    | 'job_not_found'
    | 'busy'
    | 'draft_edited';
  message: string;
  /** Provider's redacted technical error text, for diagnosis. */
  detail?: string;
};

type Failure = { ok: false; error: BackgroundError };

/** Success payload per request type. */
export interface BackgroundPayloads {
  'ai/validate-key': { model: string };
  'ai/match-job': { match: JobMatch };
  'ai/draft-application': { draft: ApplicationDraft };
  'ai/propose-profile-additions': { proposals: ProfileProposal[]; rejected: RejectedAddition[] };
}

export type ResponseFor<T extends BackgroundRequest['type']> =
  ({ ok: true } & BackgroundPayloads[T]) | Failure;

export type BackgroundResponse = ResponseFor<BackgroundRequest['type']>;
