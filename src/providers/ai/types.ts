import type { z } from 'zod';

/**
 * Provider-neutral AI contract. Use cases (matching, drafting) depend only on
 * this interface, so swapping providers does not touch domain or UI code.
 * Implementations run in the background service worker only.
 */
export interface AIProvider {
  readonly id: string;
  readonly model: string;
  /** Cheap credential + model check (no tokens generated). */
  validateCredentials(signal?: AbortSignal): Promise<AIResult<{ model: string }>>;
  /** One request whose output must match `schema`; validated before returning. */
  generateStructured<T>(request: StructuredRequest<T>): Promise<AIResult<T>>;
}

export interface StructuredRequest<T> {
  /** Trusted instructions. */
  system: string;
  /** Untrusted data (job text, profile) goes here, never in `system`. */
  userContent: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
  effort?: 'low' | 'medium' | 'high';
  signal?: AbortSignal;
}

export type AIErrorKind =
  | 'missing_key'
  | 'invalid_key'
  | 'permission_denied'
  | 'model_unavailable'
  | 'rate_limited'
  | 'overloaded'
  | 'server_error'
  | 'network'
  | 'timeout'
  | 'cancelled'
  | 'bad_request'
  | 'refused'
  | 'truncated'
  | 'malformed_response';

export interface AIError {
  kind: AIErrorKind;
  /** User-facing, actionable, never contains the API key or request content. */
  message: string;
  retryAfterSeconds?: number;
  requestId?: string;
}

export interface AIUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export type AIResult<T> = { ok: true; value: T; usage?: AIUsage } | { ok: false; error: AIError };

const MESSAGES: Record<AIErrorKind, string> = {
  missing_key: 'No API key is saved. Add your Anthropic API key in Settings → AI provider.',
  invalid_key: 'The API key was rejected. Check that it is correct and has not been revoked.',
  permission_denied:
    'This API key is not allowed to make this request. Check your Anthropic Console workspace settings.',
  model_unavailable:
    'The selected model is not available for this API key. Choose another model in Settings.',
  rate_limited: 'Rate limit reached. Wait a moment and try again.',
  overloaded: 'Anthropic is temporarily overloaded. Try again in a minute.',
  server_error: 'Anthropic returned a server error. Try again later.',
  network: 'Could not reach Anthropic. Check your internet connection.',
  timeout: 'The request took too long and was stopped. Try again.',
  cancelled: 'The request was cancelled.',
  bad_request: 'The request was rejected as invalid. This is likely a bug in the extension.',
  refused: 'The model declined this request.',
  truncated: 'The response was cut off before it finished. Try again.',
  malformed_response:
    'The response was not in the expected format, so it was discarded. Try again.',
};

export function aiError(
  kind: AIErrorKind,
  extra: Partial<Omit<AIError, 'kind' | 'message'>> = {},
): AIError {
  let message = MESSAGES[kind];
  if (kind === 'rate_limited' && extra.retryAfterSeconds !== undefined) {
    message = `Rate limit reached. Try again in about ${Math.ceil(extra.retryAfterSeconds)} seconds.`;
  }
  return { kind, message, ...extra };
}

export const aiFail = <T>(kind: AIErrorKind, extra?: Partial<AIError>): AIResult<T> => ({
  ok: false,
  error: aiError(kind, extra),
});
