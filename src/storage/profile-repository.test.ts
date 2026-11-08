import { beforeEach, describe, expect, it } from 'vitest';
import { fixedClock, sequentialIds } from '../../tests/helpers';
import { StorageError } from './errors';
import { MemoryKeyValueStore } from './kv';
import { createRepositories, type Repositories } from './repositories';

describe('ProfileRepository', () => {
  let store: MemoryKeyValueStore;
  let repos: Repositories;
  const clock = fixedClock();

  beforeEach(() => {
    store = new MemoryKeyValueStore();
    repos = createRepositories(store, { clock, ids: sequentialIds('profile') });
  });

  it('has no profile initially', async () => {
    expect(await repos.profile.getCurrent()).toBeNull();
    expect(await repos.profile.listHistory()).toEqual([]);
  });

  it('creates version 1, then keeps the previous version on each change', async () => {
    const v1 = await repos.profile.saveContent('# Me\nVA, 3 years');
    expect(v1).toMatchObject({ id: 'profile-1', version: 1 });

    clock.advance(1000);
    const v2 = await repos.profile.saveContent('# Me\nVA, 4 years');
    expect(v2).toMatchObject({ id: 'profile-1', version: 2, content: '# Me\nVA, 4 years' });
    expect((await repos.profile.listHistory()).map((p) => p.version)).toEqual([1]);
  });

  it('does not create a new version for unchanged content', async () => {
    await repos.profile.saveContent('same');
    await repos.profile.saveContent('same');
    expect((await repos.profile.getCurrent())?.version).toBe(1);
    expect(await repos.profile.listHistory()).toEqual([]);
  });

  it('restores an earlier version as a new latest version (non-destructive)', async () => {
    await repos.profile.saveContent('one');
    await repos.profile.saveContent('two');
    const restored = await repos.profile.restore(1);
    expect(restored).toMatchObject({ version: 3, content: 'one' });
    expect((await repos.profile.listHistory()).map((p) => p.version)).toEqual([2, 1]);
  });

  it('restore() of an unknown version throws not_found and changes nothing', async () => {
    await repos.profile.saveContent('one');
    const err = (await repos.profile.restore(99).catch((e: unknown) => e)) as StorageError;
    expect(err).toBeInstanceOf(StorageError);
    expect(err.kind).toBe('not_found');
    expect((await repos.profile.getCurrent())?.version).toBe(1);
  });

  it('caps history at the configured limit', async () => {
    for (let i = 1; i <= 25; i++) await repos.profile.saveContent(`content ${i}`);
    const history = await repos.profile.listHistory();
    expect(history).toHaveLength(20);
    expect(history[0]?.version).toBe(24);
    expect((await repos.profile.getCurrent())?.version).toBe(25);
  });

  it('rejects content over the size limit', async () => {
    await expect(repos.profile.saveContent('x'.repeat(100_001))).rejects.toMatchObject({
      kind: 'invalid_input',
    });
  });

  it('persists across repository instances (popup close/reopen)', async () => {
    await repos.profile.saveContent('persist me');
    const reopened = createRepositories(store);
    expect((await reopened.profile.getCurrent())?.content).toBe('persist me');
  });

  it('clear() deletes the profile and its history', async () => {
    await repos.profile.saveContent('one');
    await repos.profile.saveContent('two');
    await repos.profile.clear();
    expect(await repos.profile.getCurrent()).toBeNull();
    expect(await repos.profile.listHistory()).toEqual([]);
  });
});
