import { describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '@/core/schemas';
import type { AIProvider } from '@/providers/ai/types';
import { aiError } from '@/providers/ai/types';
import { createRepositories, type Repositories } from '@/storage';
import { MemoryKeyValueStore } from '@/storage/kv';
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
  const handle = createBackgroundHandler({ repos, createProvider, extensionOrigin: ORIGIN });
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
