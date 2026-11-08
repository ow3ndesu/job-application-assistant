import { describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '@/core/schemas';
import type { AIProvider } from '@/providers/ai/types';
import { aiError } from '@/providers/ai/types';
import { createRepositories, type Repositories } from '@/storage';
import { MemoryKeyValueStore } from '@/storage/kv';
import { sampleSavedJob } from '../../tests/helpers';
import { createBackgroundHandler } from './handler';

const OWN_ID = 'ext-id';
const ORIGIN = 'chrome-extension://ext-id/';
const fromOptions = { id: OWN_ID, url: `${ORIGIN}options.html` };

function fakeProvider(result: Awaited<ReturnType<AIProvider['validateCredentials']>>): AIProvider {
  return {
    id: 'fake',
    model: 'claude-opus-5-5',
    validateCredentials: vi.fn(() => Promise.resolve(result)),
    generateStructured: vi.fn(),
  };
}

async function setup(
  withKey: boolean,
  result = fakeProvider({ ok: true, value: { model: 'claude-opus-5-5' } }),
) {
  const repos: Repositories = createRepositories(new MemoryKeyValueStore());
  if (withKey) await repos.secrets.setAnthropicApiKey('test-key-not-real');
  const createProvider = vi.fn(() => result);
  const handle = createBackgroundHandler({
    repos,
    createProvider,
    extensionOrigin: ORIGIN,
    clock: { now: () => new Date('2026-11-08T00:00:00.000Z') },
  });
  return { handle, createProvider, repos };
}

describe('background handler', () => {
  it('validates the key via the provider built from settings + stored key', async () => {
    const { handle, createProvider } = await setup(true);
    expect(await handle({ type: 'ai/validate-key' }, fromOptions, OWN_ID)).toEqual({
      ok: true,
      model: 'claude-opus-5-5',
    });
    expect(createProvider).toHaveBeenCalledWith(defaultSettings(), 'test-key-not-real');
  });

  it('returns missing_key without calling the provider when no key is stored', async () => {
    const { handle, createProvider } = await setup(false);
    expect(await handle({ type: 'ai/validate-key' }, fromOptions, OWN_ID)).toMatchObject({
      ok: false,
      error: { kind: 'missing_key' },
    });
    expect(createProvider).not.toHaveBeenCalled();
  });

  it('passes provider errors through without the key', async () => {
    const { handle } = await setup(
      true,
      fakeProvider({ ok: false, error: aiError('invalid_key') }),
    );
    const r = await handle({ type: 'ai/validate-key' }, fromOptions, OWN_ID);
    expect(r).toMatchObject({ ok: false, error: { kind: 'invalid_key' } });
    expect(JSON.stringify(r)).not.toContain('test-key-not-real');
  });

  it.each([
    ['a content script on a web page', { id: OWN_ID, url: 'https://www.onlinejobs.ph/jobseekers' }],
    ['another extension', { id: 'other-ext', url: 'chrome-extension://other-ext/x.html' }],
    ['an unknown sender', {}],
  ])('rejects requests from %s', async (_label, sender) => {
    const { handle, createProvider } = await setup(true);
    expect(await handle({ type: 'ai/validate-key' }, sender, OWN_ID)).toMatchObject({
      ok: false,
      error: { kind: 'unauthorized_sender' },
    });
    expect(createProvider).not.toHaveBeenCalled();
  });

  it('rejects malformed messages', async () => {
    const { handle } = await setup(true);
    expect(await handle({ type: 'ai/do-anything' }, fromOptions, OWN_ID)).toMatchObject({
      ok: false,
      error: { kind: 'bad_message' },
    });
    expect(await handle('nonsense', fromOptions, OWN_ID)).toMatchObject({ ok: false });
  });

  it('never returns the key in any response', async () => {
    const { handle } = await setup(true);
    const r = await handle({ type: 'ai/validate-key' }, fromOptions, OWN_ID);
    expect(JSON.stringify(r)).not.toContain('test-key-not-real');
  });
});

describe('background handler: ai/match-job', () => {
  const clock = { now: () => new Date('2026-11-08T00:00:00.000Z') };
  const okMatch = (jobId: string, version: number) => ({
    id: `${jobId}@v${version}`,
    jobId,
    profileId: 'p',
    profileVersion: version,
    score: 60,
    strengths: [],
    gaps: [],
    uncertainties: [],
    unsupportedClaims: [],
    rationale: 'Estimate.',
    injectionSuspected: false,
    basedOnSnippet: false,
    jobContentHash: 'abc123',
    model: 'claude-opus-5-5',
    evaluatedAt: '2026-11-08T00:00:00.000Z',
  });

  async function setupMatch(opts: { key?: boolean; profile?: boolean; job?: boolean } = {}) {
    const repos = createRepositories(new MemoryKeyValueStore());
    if (opts.key !== false) await repos.secrets.setAnthropicApiKey('test-key-not-real');
    if (opts.profile !== false) await repos.profile.saveContent('# Me\n- 3 years as a VA');
    if (opts.job !== false) await repos.jobs.upsert(sampleSavedJob());
    const matchJob = vi.fn((_p: unknown, job: { id: string }, profile: { version: number }) =>
      Promise.resolve({ ok: true as const, value: okMatch(job.id, profile.version) }),
    );
    const createProvider = vi.fn(() => fakeProvider({ ok: true, value: { model: 'm' } }));
    const handle = createBackgroundHandler({
      repos,
      createProvider,
      extensionOrigin: ORIGIN,
      clock,
      matchJob: matchJob as never,
    });
    return { handle, repos, matchJob };
  }

  it('evaluates the saved job with the current profile and stores the match', async () => {
    const { handle, repos, matchJob } = await setupMatch();
    const r = await handle({ type: 'ai/match-job', jobId: 'job-1' }, fromOptions, OWN_ID);
    expect(r).toMatchObject({ ok: true, match: { jobId: 'job-1', profileVersion: 1 } });
    expect(matchJob).toHaveBeenCalledTimes(1);
    expect(await repos.matches.get('job-1@v1')).toMatchObject({ score: 60 });
  });

  it.each([
    ['no profile', { profile: false }, 'no_profile'],
    ['unknown job', { job: false }, 'job_not_found'],
    ['no API key', { key: false }, 'missing_key'],
  ] as const)('%s → %s, provider not called', async (_l, opts, kind) => {
    const { handle, matchJob } = await setupMatch(opts);
    expect(
      await handle({ type: 'ai/match-job', jobId: 'job-1' }, fromOptions, OWN_ID),
    ).toMatchObject({
      ok: false,
      error: { kind },
    });
    expect(matchJob).not.toHaveBeenCalled();
  });

  it('rejects a second evaluation of the same job while one is running', async () => {
    const { handle } = await setupMatch();
    const [a, b] = await Promise.all([
      handle({ type: 'ai/match-job', jobId: 'job-1' }, fromOptions, OWN_ID),
      handle({ type: 'ai/match-job', jobId: 'job-1' }, fromOptions, OWN_ID),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
  });

  it('web pages cannot trigger a match', async () => {
    const { handle, matchJob } = await setupMatch();
    const r = await handle(
      { type: 'ai/match-job', jobId: 'job-1' },
      { id: OWN_ID, url: 'https://www.onlinejobs.ph/jobseekers/jobsearch' },
      OWN_ID,
    );
    expect(r).toMatchObject({ ok: false, error: { kind: 'unauthorized_sender' } });
    expect(matchJob).not.toHaveBeenCalled();
  });
});
