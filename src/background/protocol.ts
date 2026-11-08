import { z } from 'zod';
import { IdSchema, type JobMatch } from '@/core/schemas';
import type { AIErrorKind } from '@/providers/ai/types';

/** Requests UI pages may send to the background worker. */
export const BackgroundRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ai/validate-key') }),
  z.object({ type: z.literal('ai/match-job'), jobId: IdSchema }),
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
    | 'busy';
  message: string;
};

type Failure = { ok: false; error: BackgroundError };

/** Success payload per request type. */
export interface BackgroundPayloads {
  'ai/validate-key': { model: string };
  'ai/match-job': { match: JobMatch };
}

export type ResponseFor<T extends BackgroundRequest['type']> =
  ({ ok: true } & BackgroundPayloads[T]) | Failure;

export type BackgroundResponse = ResponseFor<BackgroundRequest['type']>;
