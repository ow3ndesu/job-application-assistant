import { randomIds, systemClock, type Clock, type IdGenerator } from '@/core/domain';
import {
  ApplicationDraftSchema,
  defaultSearchKeywords,
  defaultSettings,
  defaultTargetSite,
  emptyProfileState,
  JobMatchSchema,
  JobPostingSchema,
  ProfileStateSchema,
  SearchKeywordsSchema,
  SettingsSchema,
  TargetSiteSchema,
} from '@/core/schemas';
import { CollectionRepository } from './collection-repository';
import type { KeyValueStore } from './kv';
import { ProfileRepository } from './profile-repository';
import { SingletonRepository } from './singleton-repository';

/** Storage keys owned by this extension. */
export const STORAGE_KEYS = {
  settings: 'settings',
  targetSites: 'targetSites',
  searchKeywords: 'searchKeywords',
  profile: 'profile',
  jobs: 'jobs',
  matches: 'matches',
  drafts: 'drafts',
} as const;

export interface RepositoryDeps {
  clock?: Clock;
  ids?: IdGenerator;
}

export function createRepositories(store: KeyValueStore, deps: RepositoryDeps = {}) {
  const clock = deps.clock ?? systemClock;
  const ids = deps.ids ?? randomIds;

  const profileState = new SingletonRepository(
    store,
    { key: STORAGE_KEYS.profile, version: 1, schema: ProfileStateSchema },
    emptyProfileState,
    clock,
  );

  return {
    settings: new SingletonRepository(
      store,
      { key: STORAGE_KEYS.settings, version: 1, schema: SettingsSchema },
      defaultSettings,
      clock,
    ),
    targetSites: new CollectionRepository(
      store,
      { key: STORAGE_KEYS.targetSites, version: 1, schema: TargetSiteSchema },
      clock,
      () => [defaultTargetSite(clock.now())],
    ),
    searchKeywords: new SingletonRepository(
      store,
      { key: STORAGE_KEYS.searchKeywords, version: 1, schema: SearchKeywordsSchema },
      defaultSearchKeywords,
      clock,
    ),
    profile: new ProfileRepository(profileState, clock, ids),
    jobs: new CollectionRepository(
      store,
      { key: STORAGE_KEYS.jobs, version: 1, schema: JobPostingSchema },
      clock,
    ),
    matches: new CollectionRepository(
      store,
      { key: STORAGE_KEYS.matches, version: 1, schema: JobMatchSchema },
      clock,
    ),
    drafts: new CollectionRepository(
      store,
      { key: STORAGE_KEYS.drafts, version: 1, schema: ApplicationDraftSchema },
      clock,
    ),
    /** Deletes everything this extension stored, including quarantined data. */
    clearAll: () => store.clear(),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
