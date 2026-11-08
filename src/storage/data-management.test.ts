import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_TARGET_SITE_ID, defaultSettings } from '@/core/schemas';
import { fixedClock, sampleSavedJob } from '../../tests/helpers';
import { createDataManagement } from './data-management';
import { MemoryKeyValueStore } from './kv';
import { createRepositories, type Repositories } from './repositories';

const match = {
  id: 'm1',
  jobId: 'job-1',
  profileId: 'p',
  profileVersion: 1,
  score: 50,
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
};
const draft = {
  id: 'd1',
  jobId: 'job-1',
  profileId: 'p',
  profileVersion: 1,
  answers: {},
  evidence: {},
  unknownQuestions: [],
  status: 'draft' as const,
  createdAt: '2026-11-08T00:00:00.000Z',
  updatedAt: '2026-11-08T00:00:00.000Z',
};

describe('secrets and data management', () => {
  let store: MemoryKeyValueStore;
  let repos: Repositories;

  beforeEach(async () => {
    store = new MemoryKeyValueStore();
    repos = createRepositories(store, { clock: fixedClock() });
    await repos.profile.saveContent('# Me');
    await repos.jobs.upsert(sampleSavedJob());
    await repos.matches.upsert(match);
    await repos.drafts.upsert(draft);
    await repos.settings.update((s) => ({ ...s, scan: { ...s.scan, maxJobsPerScan: 9 } }));
    await repos.searchKeywords.set({ include: ['va'], exclude: [] });
    await repos.targetSites.remove(DEFAULT_TARGET_SITE_ID);
    await repos.secrets.setAnthropicApiKey('test-key-not-real');
  });

  it('stores the API key separately from settings and can clear it', async () => {
    expect(await repos.secrets.hasAnthropicApiKey()).toBe(true);
    expect(JSON.stringify(await store.get('settings'))).not.toContain('test-key-not-real');
    await repos.secrets.clearAnthropicApiKey();
    expect(await repos.secrets.hasAnthropicApiKey()).toBe(false);
    expect(await repos.secrets.getAnthropicApiKeyForProvider()).toBeUndefined();
  });

  it('summary counts stored data', async () => {
    expect(await createDataManagement(repos).summary()).toEqual({
      profileVersions: 1,
      jobs: 1,
      matches: 1,
      drafts: 1,
      hasApiKey: true,
    });
  });

  it('deleteProfile removes only the profile', async () => {
    const dm = createDataManagement(repos);
    await dm.deleteProfile();
    expect(await dm.summary()).toMatchObject({ profileVersions: 0, jobs: 1, drafts: 1 });
  });

  it('deleteJobs removes jobs and matches, keeps drafts', async () => {
    const dm = createDataManagement(repos);
    await dm.deleteJobs();
    expect(await dm.summary()).toMatchObject({ jobs: 0, matches: 0, drafts: 1 });
  });

  it('deleteDrafts removes only drafts', async () => {
    const dm = createDataManagement(repos);
    await dm.deleteDrafts();
    expect(await dm.summary()).toMatchObject({ drafts: 0, jobs: 1 });
  });

  it('resetSettings restores defaults, re-adds the default site, keeps profile and key', async () => {
    const dm = createDataManagement(repos);
    await dm.resetSettings();
    expect(await repos.settings.get()).toEqual(defaultSettings());
    expect(await repos.searchKeywords.get()).toEqual({ include: [], exclude: [] });
    expect((await repos.targetSites.list()).items.map((s) => s.id)).toEqual([
      DEFAULT_TARGET_SITE_ID,
    ]);
    expect(await dm.summary()).toMatchObject({ profileVersions: 1, hasApiKey: true });
  });

  it('deleteEverything removes all keys including the API key', async () => {
    await createDataManagement(repos).deleteEverything();
    expect(await store.keys()).toEqual([]);
  });
});
