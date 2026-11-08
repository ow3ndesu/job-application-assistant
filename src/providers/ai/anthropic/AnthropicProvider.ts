import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { anthropicModelSupportsServerFallback } from '@/core/schemas';
import { aiFail, type AIProvider, type AIResult, type StructuredRequest } from '../types';
import { isFallbackBetaRejection, mapAnthropicError } from './errors';

export interface AnthropicProviderOptions {
  apiKey: string;
  model: string;
  /** Per-attempt timeout. */
  timeoutMs?: number;
  /** SDK retries 408/409/429/5xx and connection errors with backoff (honours retry-after). */
  maxRetries?: number;
  /** Injected in tests. */
  fetch?: typeof fetch;
}

export const ANTHROPIC_DEFAULTS = {
  timeoutMs: 120_000,
  maxRetries: 2,
  maxTokens: 16_000,
} as const;

const SERVER_FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/**
 * Set when Anthropic rejected a request carrying the fallback beta (e.g. the
 * beta is not enabled for the organization). Lives for the service-worker
 * session; later requests skip the beta.
 */
let serverFallbackRejected = false;

/** Test hook. */
export function resetServerFallbackState(): void {
  serverFallbackRejected = false;
}

/**
 * Claude via the official SDK. Background service worker only.
 *
 * `dangerouslyAllowBrowser`: this is a bring-your-own-key extension. The key is
 * the user's own and is used from their own browser's background context; it is
 * never bundled, never sent to content scripts or pages, and never logged.
 * A shared developer key must never be used this way.
 */
export class AnthropicProvider implements AIProvider {
  readonly id = 'anthropic';
  readonly model: string;
  private readonly client: Anthropic;
  private readonly apiKey: string;

  constructor(options: AnthropicProviderOptions) {
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.client = new Anthropic({
      apiKey: options.apiKey,
      dangerouslyAllowBrowser: true,
      // No SDK logging at all: logs could otherwise include request details.
      logLevel: 'off',
      timeout: options.timeoutMs ?? ANTHROPIC_DEFAULTS.timeoutMs,
      maxRetries: options.maxRetries ?? ANTHROPIC_DEFAULTS.maxRetries,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  }

  async validateCredentials(signal?: AbortSignal): Promise<AIResult<{ model: string }>> {
    try {
      const model = await this.client.models.retrieve(
        this.model,
        {},
        signal ? { signal } : undefined,
      );
      return { ok: true, value: { model: model.id } };
    } catch (error) {
      return { ok: false, error: mapAnthropicError(error, signal, this.apiKey) };
    }
  }

  private send<T>(request: StructuredRequest<T>, withFallback: boolean) {
    return this.client.beta.messages.create(
      {
        model: this.model,
        max_tokens: request.maxTokens ?? ANTHROPIC_DEFAULTS.maxTokens,
        system: request.system,
        messages: [{ role: 'user', content: request.userContent }],
        output_config: {
          format: betaZodOutputFormat(request.schema),
          ...(request.effort ? { effort: request.effort } : {}),
        },
        // Server-side fallback: a policy decline is retried on Anthropic's
        // recommended fallback model inside the same call.
        ...(withFallback ? { betas: [SERVER_FALLBACK_BETA], fallbacks: 'default' as const } : {}),
      },
      request.signal ? { signal: request.signal } : undefined,
    );
  }

  async generateStructured<T>(request: StructuredRequest<T>): Promise<AIResult<T>> {
    const fallback = anthropicModelSupportsServerFallback(this.model) && !serverFallbackRejected;
    try {
      let response: Awaited<ReturnType<AnthropicProvider['send']>>;
      try {
        response = await this.send(request, fallback);
      } catch (error) {
        // The fallback beta may not be enabled for this organization; Anthropic
        // then rejects the request with a 400 (not billed). Retry once without
        // it and stop requesting it for the rest of this session.
        if (!fallback || !isFallbackBetaRejection(error)) throw error;
        serverFallbackRejected = true;
        response = await this.send(request, false);
      }

      if (response.stop_reason === 'refusal') return aiFail('refused');
      if (response.stop_reason === 'max_tokens') return aiFail('truncated');

      // stop_reason is checked first; only then is the text parsed and validated
      // with our own schema (provider output is never trusted blindly).
      const text = response.content
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('');
      let candidate: unknown;
      try {
        candidate = JSON.parse(text);
      } catch {
        return aiFail('malformed_response');
      }
      const validated = request.schema.safeParse(candidate);
      if (!validated.success) return aiFail('malformed_response');

      return {
        ok: true,
        value: validated.data,
        usage: {
          model: response.model,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    } catch (error) {
      return { ok: false, error: mapAnthropicError(error, request.signal, this.apiKey) };
    }
  }
}
