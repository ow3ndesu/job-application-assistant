import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { fixedClock } from '../../tests/helpers';
import { StorageError } from './errors';
import { MemoryKeyValueStore } from './kv';
import { SingletonRepository } from './singleton-repository';
import { QUARANTINE_PREFIX } from './versioned';

const Schema = z.object({ name: z.string().min(1), count: z.number().int() });
type Value = z.infer<typeof Schema>;
const defaults = (): Value => ({ name: 'default', count: 0 });

function expectStorageError(kind: StorageError['kind']) {
  return expect.objectContaining({ name: 'StorageError', kind });
}

describe('SingletonRepository', () => {
  let store: MemoryKeyValueStore;
  let repo: SingletonRepository<Value>;
  const clock = fixedClock();

  beforeEach(() => {
    store = new MemoryKeyValueStore();
    repo = new SingletonRepository(
      store,
      { key: 'k', version: 1, schema: Schema },
      defaults,
      clock,
    );
  });

  it('returns defaults when nothing is stored', async () => {
    expect(await repo.get()).toEqual(defaults());
    expect(await store.keys()).toEqual([]);
  });

  it('creates, reads, updates and resets', async () => {
    await repo.set({ name: 'a', count: 1 });
    expect(await repo.get()).toEqual({ name: 'a', count: 1 });
    expect(await store.get('k')).toEqual({ schemaVersion: 1, data: { name: 'a', count: 1 } });

    await repo.update((v) => ({ ...v, count: v.count + 1 }));
    expect((await repo.get()).count).toBe(2);

    await repo.reset();
    expect(await repo.get()).toEqual(defaults());
  });

  it('serializes concurrent updates within a context', async () => {
    await Promise.all(
      Array.from({ length: 10 }, () => repo.update((v) => ({ ...v, count: v.count + 1 }))),
    );
    expect((await repo.get()).count).toBe(10);
  });

  it('rejects invalid input and leaves stored data unchanged', async () => {
    await repo.set({ name: 'a', count: 1 });
    await expect(repo.set({ name: '', count: 1 })).rejects.toEqual(
      expectStorageError('invalid_input'),
    );
    expect(await repo.get()).toEqual({ name: 'a', count: 1 });
  });

  it('survives a new repository instance over the same store (popup reopen)', async () => {
    await repo.set({ name: 'persisted', count: 5 });
    const reopened = new SingletonRepository(
      store,
      { key: 'k', version: 1, schema: Schema },
      defaults,
      clock,
    );
    expect(await reopened.get()).toEqual({ name: 'persisted', count: 5 });
  });

  describe('corrupt data', () => {
    it.each([
      ['not an envelope', 'garbage'],
      ['envelope with invalid data', { schemaVersion: 1, data: { name: 42 } }],
      ['envelope with bad version', { schemaVersion: 'x', data: {} }],
    ])('%s → recoverable corrupt error', async (_label, raw) => {
      await store.set('k', raw);
      const err = await repo.get().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(StorageError);
      expect((err as StorageError).kind).toBe('corrupt');
      expect((err as StorageError).recoverable).toBe(true);
    });

    it('error messages do not leak stored values', async () => {
      await store.set('k', {
        schemaVersion: 1,
        data: { name: 'SECRET-PERSONAL-VALUE', count: 'x' },
      });
      const err = (await repo.get().catch((e: unknown) => e)) as StorageError;
      expect(err.message).not.toContain('SECRET-PERSONAL-VALUE');
    });

    it('recover() quarantines the raw value and restores defaults', async () => {
      const raw = { schemaVersion: 1, data: { name: 42 } };
      await store.set('k', raw);
      const qKey = await repo.recover();
      expect(qKey).toMatch(new RegExp(`^${QUARANTINE_PREFIX}k:`));
      expect(await store.get(qKey as string)).toEqual(raw);
      expect(await repo.get()).toEqual(defaults());
    });
  });

  describe('versioning', () => {
    it('reports newer stored versions and does not overwrite them', async () => {
      const raw = { schemaVersion: 2, data: { name: 'future', count: 1 } };
      await store.set('k', raw);
      await expect(repo.get()).rejects.toEqual(expectStorageError('unsupported_version'));
      expect(await store.get('k')).toEqual(raw);
    });

    it('migrates older data step by step and writes the result back', async () => {
      await store.set('k', { schemaVersion: 1, data: { title: 'old' } });
      const v3 = new SingletonRepository(
        store,
        {
          key: 'k',
          version: 3,
          schema: Schema,
          migrations: {
            1: (d) => ({ name: (d as { title: string }).title }),
            2: (d) => ({ ...(d as object), count: 0 }),
          },
        },
        defaults,
        clock,
      );
      expect(await v3.get()).toEqual({ name: 'old', count: 0 });
      expect(await store.get('k')).toEqual({ schemaVersion: 3, data: { name: 'old', count: 0 } });
    });

    it('fails with migration_failed when a migration is missing or throws', async () => {
      await store.set('k', { schemaVersion: 1, data: {} });
      const missing = new SingletonRepository(
        store,
        { key: 'k', version: 2, schema: Schema },
        defaults,
        clock,
      );
      await expect(missing.get()).rejects.toEqual(expectStorageError('migration_failed'));

      const throwing = new SingletonRepository(
        store,
        {
          key: 'k',
          version: 2,
          schema: Schema,
          migrations: {
            1: () => {
              throw new Error('boom');
            },
          },
        },
        defaults,
        clock,
      );
      await expect(throwing.get()).rejects.toEqual(expectStorageError('migration_failed'));
    });
  });

  it('wraps underlying storage failures as io errors', async () => {
    const failing = new MemoryKeyValueStore();
    failing.get = () => Promise.reject(new Error('quota'));
    const r = new SingletonRepository(
      failing,
      { key: 'k', version: 1, schema: Schema },
      defaults,
      clock,
    );
    await expect(r.get()).rejects.toEqual(expectStorageError('io'));
  });
});
