import { z } from 'zod';
import type { AIErrorKind } from '@/providers/ai/types';

/** Requests UI pages may send to the background worker. */
export const BackgroundRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ai/validate-key') }),
]);

export type BackgroundRequest = z.infer<typeof BackgroundRequestSchema>;

export type BackgroundError = {
  kind: AIErrorKind | 'unauthorized_sender' | 'bad_message' | 'internal';
  message: string;
};

export type ValidateKeyResponse =
  { ok: true; model: string } | { ok: false; error: BackgroundError };

export type BackgroundResponse = ValidateKeyResponse;
