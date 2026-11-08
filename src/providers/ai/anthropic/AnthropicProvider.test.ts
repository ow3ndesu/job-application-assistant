import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AnthropicProvider, resetServerFallbackState } from './AnthropicProvider';

const FAKE_KEY = 'test-key-not-real-123';
const Schema = z.object({ score: z.number().int().min(0).max(100), reasons: z.array(z.string()) });

interface Call {
  url: string;
  method: string;
  headers: Headers;
  body: Record<string, unknown> | null;
}

type Responder = (call: Call, index: number) => Response | Promise<Response>;

function mockFetch(responder: Responder) {
  const calls: Call[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const call: Call = {
      url,
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body:
        typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null,
    };
    calls.push(call);
    const signal = init?.signal;
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return responder(call, calls.length - 1);
  }) as typeof fetch;
  return { fn, calls };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'request-id': 'req_test', ...headers },
  });

const apiError = (status: number, type: string, headers: Record<string, string> = {}) =>
  json(
    status,
    { type: 'error', error: { type, message: 'test error' }, request_id: 'req_test' },
    headers,
  );

function message(text: string, stop_reason = 'end_turn', model = 'claude-opus-5-5') {
  return json(200, {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model,
    content: text ? [{ type: 'text', text }] : [],
    stop_reason,
    stop_sequence: null,
    stop_details: null,
    usage: { input_tokens: 12, output_tokens: 7 },
  });
}

function provider(
  responder: Responder,
  opts: { model?: string; maxRetries?: number; timeoutMs?: number } = {},
) {
  const mock = mockFetch(responder);
  const p = new AnthropicProvider({
    apiKey: FAKE_KEY,
    model: opts.model ?? 'claude-opus-5-5',
    maxRetries: opts.maxRetries ?? 0,
    timeoutMs: opts.timeoutMs ?? 5_000,
    fetch: mock.fn,
  });
  return { p, calls: mock.calls };
}

const req = { system: 'Rate the fit.', userContent: 'job + profile', schema: Schema };

// The fallback-rejected flag is module state; isolate every test.
beforeEach(() => resetServerFallbackState());

describe('AnthropicProvider.generateStructured', () => {
  it('returns schema-validated output and usage', async () => {
    const { p } = provider(() =>
      message(JSON.stringify({ score: 72, reasons: ['VA experience'] })),
    );
    const r = await p.generateStructured(req);
    expect(r).toEqual({
      ok: true,
      value: { score: 72, reasons: ['VA experience'] },
      usage: { model: 'claude-opus-5-5', inputTokens: 12, outputTokens: 7 },
    });
  });

  it('sends the documented endpoint, headers and structured-output body', async () => {
    const { p, calls } = provider(() => message(JSON.stringify({ score: 1, reasons: [] })));
    await p.generateStructured({ ...req, effort: 'low', maxTokens: 2000 });
    const call = calls[0];
    expect(call?.url).toMatch(/^https:\/\/api\.anthropic\.com\/v1\/messages(\?|$)/);
    expect(call?.method).toBe('POST');
    // SDK 1.x sends the key as a Bearer token (x-api-key is the legacy header).
    expect(call?.headers.get('authorization')).toBe(`Bearer ${FAKE_KEY}`);
    expect(call?.headers.get('anthropic-version')).toBe('2026-10-21');
    expect(call?.headers.get('anthropic-dangerous-direct-browser-access')).toBe('true');
    expect(call?.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    expect(call?.body).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 2000,
      system: 'Rate the fit.',
      messages: [{ role: 'user', content: 'job + profile' }],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema' } },
    });
  });

  it('does not request server-side fallback on Haiku', async () => {
    const { p, calls } = provider(
      () => message(JSON.stringify({ score: 1, reasons: [] }), 'end_turn', 'claude-haiku-5-5'),
      {
        model: 'claude-haiku-5-5',
      },
    );
    await p.generateStructured(req);
    expect(calls[0]?.body).not.toHaveProperty('fallbacks');
    expect(calls[0]?.headers.get('anthropic-beta') ?? '').not.toContain('server-side-fallback');
  });

  it('treats non-JSON text as malformed_response', async () => {
    const { p } = provider(() => message('Sure! Here is the answer: 72'));
    const r = await p.generateStructured(req);
    expect(r).toMatchObject({ ok: false, error: { kind: 'malformed_response' } });
  });

  it('treats schema-invalid JSON as malformed_response', async () => {
    const { p } = provider(() => message(JSON.stringify({ score: 500, reasons: 'nope' })));
    const r = await p.generateStructured(req);
    expect(r).toMatchObject({ ok: false, error: { kind: 'malformed_response' } });
  });

  it('reports refusals and truncation instead of partial output', async () => {
    const refused = provider(() => message('', 'refusal'));
    expect(await refused.p.generateStructured(req)).toMatchObject({
      ok: false,
      error: { kind: 'refused' },
    });
    const truncated = provider(() => message('{"score": 7', 'max_tokens'));
    expect(await truncated.p.generateStructured(req)).toMatchObject({
      ok: false,
      error: { kind: 'truncated' },
    });
  });

  it.each([
    [401, 'authentication_error', 'invalid_key'],
    [403, 'permission_error', 'permission_denied'],
    [404, 'not_found_error', 'model_unavailable'],
    [400, 'invalid_request_error', 'bad_request'],
    [500, 'api_error', 'server_error'],
    [529, 'overloaded_error', 'overloaded'],
  ])(
    'maps HTTP %i (%s) to %s with a request id and no key in the message',
    async (status, type, kind) => {
      const { p } = provider(() => apiError(status, type));
      const r = await p.generateStructured(req);
      expect(r).toMatchObject({ ok: false, error: { kind, requestId: 'req_test' } });
      if (!r.ok) expect(r.error.message).not.toContain(FAKE_KEY);
    },
  );

  it('maps 429 with retry-after to rate_limited with the wait time', async () => {
    const { p } = provider(() => apiError(429, 'rate_limit_error', { 'retry-after': '17' }));
    const r = await p.generateStructured(req);
    expect(r).toMatchObject({ ok: false, error: { kind: 'rate_limited', retryAfterSeconds: 17 } });
    if (!r.ok) expect(r.error.message).toContain('17 seconds');
  });

  it('retries transient errors (529) conservatively and then succeeds', async () => {
    const { p, calls } = provider(
      (_c, i) =>
        i === 0
          ? apiError(529, 'overloaded_error', { 'retry-after-ms': '1' })
          : message(JSON.stringify({ score: 5, reasons: [] })),
      { maxRetries: 2 },
    );
    expect((await p.generateStructured(req)).ok).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it('does not retry non-retryable errors (401)', async () => {
    const { p, calls } = provider(() => apiError(401, 'authentication_error'), { maxRetries: 2 });
    await p.generateStructured(req);
    expect(calls).toHaveLength(1);
  });

  it('gives up after maxRetries on persistent 429', async () => {
    const { p, calls } = provider(
      () => apiError(429, 'rate_limit_error', { 'retry-after-ms': '1' }),
      {
        maxRetries: 2,
      },
    );
    expect(await p.generateStructured(req)).toMatchObject({
      ok: false,
      error: { kind: 'rate_limited' },
    });
    expect(calls).toHaveLength(3);
  });

  it('maps network failures to network', async () => {
    const { p } = provider(() => {
      throw new TypeError('Failed to fetch');
    });
    expect(await p.generateStructured(req)).toMatchObject({
      ok: false,
      error: { kind: 'network' },
    });
  });

  it('times out a hanging request', async () => {
    const hang: Responder = (call) =>
      new Promise(() => {
        void call; // never resolves; the SDK aborts via its own timeout signal
      });
    const mock = mockFetch(hang);
    // Wrap so the SDK's abort signal rejects the pending promise.
    const fetchWithAbort = ((input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
        void mock.fn(input, init).then(resolve, reject);
      })) as typeof fetch;
    const p = new AnthropicProvider({
      apiKey: FAKE_KEY,
      model: 'claude-opus-5-5',
      maxRetries: 0,
      timeoutMs: 50,
      fetch: fetchWithAbort,
    });
    expect(await p.generateStructured(req)).toMatchObject({
      ok: false,
      error: { kind: 'timeout' },
    });
  });

  it('supports cancellation via AbortSignal', async () => {
    const controller = new AbortController();
    const fetchWithAbort = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
        controller.abort();
      })) as typeof fetch;
    const p = new AnthropicProvider({
      apiKey: FAKE_KEY,
      model: 'claude-opus-5-5',
      maxRetries: 0,
      fetch: fetchWithAbort,
    });
    expect(await p.generateStructured({ ...req, signal: controller.signal })).toMatchObject({
      ok: false,
      error: { kind: 'cancelled' },
    });
  });
});

describe('AnthropicProvider.validateCredentials', () => {
  it('calls GET /v1/models/{model} and returns the model id', async () => {
    const { p, calls } = provider(() =>
      json(200, {
        id: 'claude-opus-5-5',
        type: 'model',
        display_name: 'Claude Opus 5.5',
        created_at: '2026-01-01T00:00:00Z',
      }),
    );
    expect(await p.validateCredentials()).toEqual({
      ok: true,
      value: { model: 'claude-opus-5-5' },
    });
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.url).toMatch(/\/v1\/models\/claude-opus-5-5(\?|$)/);
  });

  it('reports an invalid key and an unavailable model distinctly', async () => {
    expect(
      await provider(() => apiError(401, 'authentication_error')).p.validateCredentials(),
    ).toMatchObject({
      ok: false,
      error: { kind: 'invalid_key' },
    });
    expect(
      await provider(() => apiError(404, 'not_found_error')).p.validateCredentials(),
    ).toMatchObject({
      ok: false,
      error: { kind: 'model_unavailable' },
    });
  });
});

describe('server-side fallback beta rejected (HTTP 400)', () => {
  beforeEach(() => resetServerFallbackState());

  const betaError = () =>
    json(400, {
      type: 'error',
      error: {
        type: 'invalid_request_error',
        message:
          'Unexpected value(s) `server-side-fallback-2026-07-01` for the `anthropic-beta` header.',
      },
      request_id: 'req_test',
    });

  it('retries once without the beta, succeeds, and skips the beta afterwards', async () => {
    const { p, calls } = provider((call) =>
      call.headers.get('anthropic-beta')?.includes('server-side-fallback')
        ? betaError()
        : message(JSON.stringify({ score: 9, reasons: [] })),
    );
    expect((await p.generateStructured(req)).ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.body).not.toHaveProperty('fallbacks');
    expect(calls[1]?.headers.get('anthropic-beta') ?? '').not.toContain('server-side-fallback');

    // Later requests in the same session go straight to the plain request.
    const second = provider(() => message(JSON.stringify({ score: 1, reasons: [] })));
    await second.p.generateStructured(req);
    expect(second.calls).toHaveLength(1);
    expect(second.calls[0]?.body).not.toHaveProperty('fallbacks');
  });

  it('an empty credit balance (400) is reported clearly, without a retry', async () => {
    const { p, calls } = provider(() =>
      json(400, {
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message:
            'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.',
        },
      }),
    );
    const r = await p.generateStructured(req);
    expect(calls).toHaveLength(1);
    expect(r).toMatchObject({ ok: false, error: { kind: 'insufficient_credits' } });
    if (!r.ok) expect(r.error.message).toMatch(/no remaining credits/);
  });

  it('a 400 unrelated to the beta still reports bad_request with redacted technical detail', async () => {
    const { p, calls } = provider(() =>
      json(400, {
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: `output_config.format: schema invalid near ${FAKE_KEY} and sk-ant-abc123-XYZ`,
        },
        request_id: 'req_test',
      }),
    );
    const r = await p.generateStructured(req);
    expect(calls).toHaveLength(1); // not about the beta: no retry
    expect(r).toMatchObject({ ok: false, error: { kind: 'bad_request', requestId: 'req_test' } });
    if (r.ok) return;
    expect(r.error.detail).toContain(
      '400 · invalid_request_error · output_config.format: schema invalid',
    );
    expect(r.error.detail).not.toContain(FAKE_KEY);
    expect(r.error.detail).not.toContain('sk-ant-abc123');
    expect(r.error.message).not.toContain('schema invalid');
  });

  it('does not retry 400s on models without the fallback (Haiku)', async () => {
    const { p, calls } = provider(
      () => json(400, { type: 'error', error: { type: 'invalid_request_error', message: 'bad' } }),
      {
        model: 'claude-haiku-5-5',
      },
    );
    await p.generateStructured(req);
    expect(calls).toHaveLength(1);
  });
});
