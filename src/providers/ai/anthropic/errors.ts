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

/**
 * Maps SDK errors to provider-neutral errors. Most specific classes first.
 * Never copies the SDK message: our messages are fixed and contain no secrets.
 */
export function mapAnthropicError(error: unknown, signal?: AbortSignal): AIError {
  if (error instanceof Anthropic.APIUserAbortError || signal?.aborted) {
    return aiError('cancelled');
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) return aiError('timeout');
  if (error instanceof Anthropic.APIConnectionError) return aiError('network');

  if (error instanceof Anthropic.APIError) {
    const requestId = error.requestID ?? undefined;
    const extra = requestId ? { requestId } : {};
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
    if (error instanceof Anthropic.BadRequestError) return aiError('bad_request', extra);
    if (error.status === 402) return aiError('permission_denied', extra);
    return aiError(
      error.status !== undefined && error.status >= 500 ? 'server_error' : 'bad_request',
      extra,
    );
  }
  // SDK parse failures (invalid JSON / schema mismatch in `.parse()`) and anything else.
  return aiError('malformed_response');
}
