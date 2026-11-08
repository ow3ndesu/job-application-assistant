import { beforeEach, describe, expect, it } from 'vitest';
import { JobPostingSchema, type JobPosting } from '@/core/schemas';
import { fixedClock, sampleJob } from '../../tests/helpers';
import { CollectionRepository } from './collection-repository';
import { StorageError } from './errors';
import { MemoryKeyValueStore } from './kv';

const spec = { key: 'jobs', version: 1, schema: JobPostingSchema };

describe('CollectionRepository', () => {
  let store: MemoryKeyValueStore;
  let repo: CollectionRepository<JobPosting>;
  const clock = fixedClock();

  beforeEach(() => {
    store = new MemoryKeyValueStore();
    repo = new CollectionRepository(store, spec, clock);
  });

  it('starts empty and supports create/read/update/delete', async () => {
    expect(await repo.list()).toEqual({ items: [], invalid: [] });

    await repo.upsert(sampleJob());
    expect(await repo.get('job-1')).toEqual(sampleJob());

    await repo.upsert(sampleJob({ title: 'Senior VA' }));
    expect((await repo.list()).items).toHaveLength(1);
    expect((await repo.get('job-1'))?.title).toBe('Senior VA');

    expect(await repo.remove('job-1')).toBe(true);
    expect(await repo.remove('job-1')).toBe(false);
    expect(await repo.get('job-1')).toBeUndefined();
  });

  it('deduplicates by id (re-adding the same job does not create a copy)', async () => {
    await repo.upsertMany([sampleJob(), sampleJob(), sampleJob({ id: 'job-2' })]);
    expect((await repo.list()).items.map((j) => j.id).sort()).toEqual(['job-1', 'job-2']);
  });

  it('rejects invalid input atomically (nothing from the batch is written)', async () => {
    await expect(
      repo.upsertMany([
        sampleJob({ id: 'ok' }),
        sampleJob({ id: 'bad', sourceUrl: 'javascript:x' }),
      ]),
    ).rejects.toBeInstanceOf(StorageError);
    expect((await repo.list()).items).toEqual([]);
  });

  it('seeds initial records on first read and persists them', async () => {
    const seeded = new CollectionRepository(store, spec, clock, () => [sampleJob({ id: 'seed' })]);
    expect((await seeded.list()).items.map((j) => j.id)).toEqual(['seed']);
    clock.advance(60_000);
    // A second instance sees the persisted seed, not a fresh one.
    const again = new CollectionRepository(store, spec, clock, () => [sampleJob({ id: 'other' })]);
    expect((await again.list()).items.map((j) => j.id)).toEqual(['seed']);
  });

  it('clear() empties without re-seeding; reset() re-seeds', async () => {
    const seeded = new CollectionRepository(store, spec, clock, () => [sampleJob({ id: 'seed' })]);
    await seeded.list();
    await seeded.clear();
    expect((await seeded.list()).items).toEqual([]);
    await seeded.reset();
    expect((await seeded.list()).items.map((j) => j.id)).toEqual(['seed']);
  });

  describe('corrupt records', () => {
    beforeEach(async () => {
      await store.set('jobs', {
        schemaVersion: 1,
        data: {
          'job-1': sampleJob(),
          'job-2': { id: 'job-2', title: 42 },
          'job-3': sampleJob({ id: 'job-x' }),
        },
      });
    });

    it('returns valid records and reports invalid ones without throwing', async () => {
      const { items, invalid } = await repo.list();
      expect(items.map((j) => j.id)).toEqual(['job-1']);
      expect(invalid.map((r) => r.id).sort()).toEqual(['job-2', 'job-3']);
    });

    it('get() of an invalid record throws a recoverable corrupt error', async () => {
      const err = (await repo.get('job-2').catch((e: unknown) => e)) as StorageError;
      expect(err.kind).toBe('corrupt');
      expect(err.recoverable).toBe(true);
    });

    it('preserves invalid records across unrelated writes', async () => {
      await repo.upsert(sampleJob({ id: 'job-4' }));
      const { items, invalid } = await repo.list();
      expect(items.map((j) => j.id).sort()).toEqual(['job-1', 'job-4']);
      expect(invalid).toHaveLength(2);
    });

    it('discardInvalid() quarantines invalid records and keeps valid ones', async () => {
      const qKey = await repo.discardInvalid();
      expect(qKey).toBeDefined();
      expect(Object.keys((await store.get(qKey as string)) as object).sort()).toEqual([
        'job-2',
        'job-3',
      ]);
      expect(await repo.list()).toEqual({ items: [sampleJob()], invalid: [] });
      expect(await repo.discardInvalid()).toBeUndefined();
    });

    it('remove() can delete an invalid record', async () => {
      expect(await repo.remove('job-2')).toBe(true);
      expect((await repo.list()).invalid.map((r) => r.id)).toEqual(['job-3']);
    });
  });

  it('a non-map collection is corrupt and recoverable via recover()', async () => {
    await store.set('jobs', { schemaVersion: 1, data: ['not', 'a', 'map'] });
    const err = (await repo.list().catch((e: unknown) => e)) as StorageError;
    expect(err.kind).toBe('corrupt');
    const qKey = await repo.recover();
    expect(qKey).toBeDefined();
    expect(await repo.list()).toEqual({ items: [], invalid: [] });
  });
});
