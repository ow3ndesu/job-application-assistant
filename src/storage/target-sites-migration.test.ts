import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TARGET_SITE_ID,
  DEFAULT_TARGET_SITE_URL,
  LEGACY_DEFAULT_TARGET_SITE_URL,
} from '@/core/schemas';
import { fixedClock } from '../../tests/helpers';
import { MemoryKeyValueStore } from './kv';
import { createRepositories } from './repositories';

const ts = '2026-11-08T00:00:00.000Z';
const site = (id: string, url: string, label = 'Site') => ({
  id,
  url,
  label,
  enabled: true,
  createdAt: ts,
  updatedAt: ts,
});

async function storeV1(data: Record<string, unknown>) {
  const store = new MemoryKeyValueStore();
  await store.set('targetSites', { schemaVersion: 1, data });
  return { store, repos: createRepositories(store, { clock: fixedClock() }) };
}

describe('targetSites v1 → v2 migration (default URL change)', () => {
  it('new installs get the public job search page as the default', async () => {
    const repos = createRepositories(new MemoryKeyValueStore(), { clock: fixedClock() });
    const [first] = (await repos.targetSites.list()).items;
    expect(first?.url).toBe('https://www.onlinejobs.ph/jobseekers/jobsearch');
    expect(DEFAULT_TARGET_SITE_URL).toBe('https://www.onlinejobs.ph/jobseekers/jobsearch');
  });

  it('updates the untouched old default and writes back v2', async () => {
    const { store, repos } = await storeV1({
      [DEFAULT_TARGET_SITE_ID]: site(
        DEFAULT_TARGET_SITE_ID,
        LEGACY_DEFAULT_TARGET_SITE_URL,
        'OnlineJobs.ph',
      ),
    });
    const [migrated] = (await repos.targetSites.list()).items;
    expect(migrated).toMatchObject({
      url: DEFAULT_TARGET_SITE_URL,
      label: 'OnlineJobs.ph',
      enabled: true,
    });
    expect(await store.get('targetSites')).toMatchObject({ schemaVersion: 2 });
  });

  it('keeps a default site the user edited, and leaves other sites alone', async () => {
    const edited = site(
      DEFAULT_TARGET_SITE_ID,
      'https://www.onlinejobs.ph/jobseekers/search/c/accounting',
      'My OLJ',
    );
    const other = site('x', LEGACY_DEFAULT_TARGET_SITE_URL, 'Copy of old default');
    const { repos } = await storeV1({ [DEFAULT_TARGET_SITE_ID]: edited, x: other });
    const items = (await repos.targetSites.list()).items;
    expect(items.find((s) => s.id === DEFAULT_TARGET_SITE_ID)).toEqual(edited);
    expect(items.find((s) => s.id === 'x')).toEqual(other);
  });

  it('a user who removed the default site does not get it back', async () => {
    const { repos } = await storeV1({ x: site('x', 'https://example.com/jobs') });
    expect((await repos.targetSites.list()).items.map((s) => s.id)).toEqual(['x']);
  });
});
