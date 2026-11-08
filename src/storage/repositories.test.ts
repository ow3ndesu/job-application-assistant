import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULT_TARGET_SITE_URL, defaultSettings } from '@/core/schemas';
import { fixedClock, sampleJob } from '../../tests/helpers';
import { createBrowserLocalStore } from './browser-store';
import { createRepositories } from './repositories';

describe('repositories over browser.storage.local (fake browser)', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('first run: default settings, empty keywords, default OnlineJobs.ph site', async () => {
    const repos = createRepositories(createBrowserLocalStore(), { clock: fixedClock() });
    expect(await repos.settings.get()).toEqual(defaultSettings());
    expect(await repos.searchKeywords.get()).toEqual({ include: [], exclude: [] });
    const { items } = await repos.targetSites.list();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ url: DEFAULT_TARGET_SITE_URL, enabled: true });
  });

  it('target sites: add, edit, disable, remove', async () => {
    const repos = createRepositories(createBrowserLocalStore(), { clock: fixedClock() });
    const [site] = (await repos.targetSites.list()).items;
    if (!site) throw new Error('expected default site');

    await repos.targetSites.upsert({
      ...site,
      id: 'other',
      url: 'https://example.com/jobs',
      label: 'Example',
    });
    await repos.targetSites.upsert({ ...site, enabled: false, label: 'OLJ' });
    expect(await repos.targetSites.get(site.id)).toMatchObject({ enabled: false, label: 'OLJ' });

    await repos.targetSites.remove(site.id);
    expect((await repos.targetSites.list()).items.map((s) => s.id)).toEqual(['other']);
  });

  it('removing the default site does not bring it back on next open', async () => {
    const repos = createRepositories(createBrowserLocalStore(), { clock: fixedClock() });
    const [site] = (await repos.targetSites.list()).items;
    await repos.targetSites.remove(site?.id ?? '');
    const reopened = createRepositories(createBrowserLocalStore());
    expect((await reopened.targetSites.list()).items).toEqual([]);
  });

  it('all data persists across fresh repository instances (popup close/reopen)', async () => {
    const a = createRepositories(createBrowserLocalStore(), { clock: fixedClock() });
    await a.settings.update((s) => ({ ...s, scan: { ...s.scan, maxJobsPerScan: 10 } }));
    await a.searchKeywords.set({ include: ['virtual assistant'], exclude: ['sales'] });
    await a.profile.saveContent('# Profile');
    await a.jobs.upsert(sampleJob());

    const b = createRepositories(createBrowserLocalStore());
    expect((await b.settings.get()).scan.maxJobsPerScan).toBe(10);
    expect(await b.searchKeywords.get()).toEqual({
      include: ['virtual assistant'],
      exclude: ['sales'],
    });
    expect((await b.profile.getCurrent())?.content).toBe('# Profile');
    expect(await b.jobs.get('job-1')).toEqual(sampleJob());
  });

  it('clearAll() deletes everything', async () => {
    const repos = createRepositories(createBrowserLocalStore(), { clock: fixedClock() });
    await repos.profile.saveContent('# Profile');
    await repos.jobs.upsert(sampleJob());
    await repos.clearAll();
    expect(await fakeBrowser.storage.local.get(null)).toEqual({});
    expect(await repos.profile.getCurrent()).toBeNull();
  });

  it('a corrupt record in browser storage fails safely', async () => {
    await fakeBrowser.storage.local.set({ settings: { schemaVersion: 1, data: { ai: 'broken' } } });
    const repos = createRepositories(createBrowserLocalStore(), { clock: fixedClock() });
    await expect(repos.settings.get()).rejects.toMatchObject({ kind: 'corrupt' });
    await repos.settings.recover();
    expect(await repos.settings.get()).toEqual(defaultSettings());
  });
});
