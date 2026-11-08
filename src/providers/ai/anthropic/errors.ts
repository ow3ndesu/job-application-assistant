import Anthropic from '@anthropic-ai/sdk';
import { aiError, type AIError } from '../types';

function retryAfterSeconds(headers: Headers | undefined): number | undefined {
  const raw = headers?.get('retry-after');
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(raw);
  return Number.isNaN(date) ? undefined : Math.max(0, (date - Date.now()) / 1000);
}

export const DETAIL_MAX_CHARS = 400;

/** True when a 400 is about the server-side fallback beta (not enabled, unknown value, …). */
export function isFallbackBetaRejection(error: unknown): boolean {
  return (
    error instanceof Anthropic.BadRequestError &&
    /anthropic-beta|fallback/i.test(error.apiMessage ?? '')
  );
}

/**
 * Builds a short technical detail from Anthropic's own error body (status,
 * type, message) so failures can be diagnosed. Any API key, including the
 * caller's key and anything shaped like one, is redacted.
 */
export function errorDetail(
  error: InstanceType<typeof Anthropic.APIError>,
  secret?: string,
): string | undefined {
  const parts = [
    error.status !== undefined ? String(error.status) : undefined,
    error.type ?? undefined,
    error.apiMessage ?? undefined,
  ].filter(Boolean);
  if (parts.length === 0) return undefined;
  let text = parts.join(' · ');
  if (secret) text = text.split(secret).join('[redacted]');
  text = text.replace(/sk-ant-[A-Za-z0-9_-]+/g, '[redacted]');
  return text.length > DETAIL_MAX_CHARS ? `${text.slice(0, DETAIL_MAX_CHARS - 1)}\u2026` : text;
}

/**
 * Maps SDK errors to provider-neutral errors. Most specific classes first.
 * The user-facing `message` is always our own fixed text; Anthropic's message
 * is only kept, redacted, in `detail`.
 */
export function mapAnthropicError(error: unknown, signal?: AbortSignal, secret?: string): AIError {
  if (error instanceof Anthropic.APIUserAbortError || signal?.aborted) {
    return aiError('cancelled');
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) return aiError('timeout');
  if (error instanceof Anthropic.APIConnectionError) return aiError('network');

  if (error instanceof Anthropic.APIError) {
    const requestId = error.requestID ?? undefined;
    const detail = errorDetail(error, secret);
    const extra = { ...(requestId ? { requestId } : {}), ...(detail ? { detail } : {}) };
    if (error instanceof Anthropic.AuthenticationError) return aiError('invalid_key', extra);
    if (error instanceof Anthropic.PermissionDeniedError)
      return aiError('permission_denied', extra);
    if (error instanceof Anthropic.NotFoundError) return aiError('model_unavailable', extra);
    if (error instanceof Anthropic.RateLimitError) {
      const after = retryAfterSeconds(error.headers);
      return aiError(
        'rate_limited',
        after === undefined ? extra : { ...extra, retryAfterSeconds: after },
      );
    }
    if (error instanceof Anthropic.OverloadedError) return aiError('overloaded', extra);
    if (error instanceof Anthropic.InternalServerError) return aiError('server_error', extra);
    if (error instanceof Anthropic.BadRequestError) {
      // Anthropic reports an empty credit balance as a 400.
      if (/credit balance/i.test(error.apiMessage ?? ''))
        return aiError('insufficient_credits', extra);
      return aiError('bad_request', extra);
    }
    if (error.status === 402) return aiError('permission_denied', extra);
    return aiError(
      error.status !== undefined && error.status >= 500 ? 'server_error' : 'bad_request',
      extra,
    );
  }
  // SDK parse failures and anything else.
  return aiError('malformed_response');
}
