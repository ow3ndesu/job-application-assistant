import { randomIds, systemClock, type Clock, type IdGenerator } from '@/core/domain';
import {
  ApplicationDraftSchema,
  defaultSearchKeywords,
  defaultSettings,
  defaultTargetSite,
  emptyProfileState,
  emptySecrets,
  JobMatchSchema,
  migrateDraftsV1toV2,
  migrateJobsV1toV2,
  migrateMatchesV1toV2,
  SavedJobSchema,
  ScanRecordSchema,
  migrateTargetSitesV1toV2,
  ProfileStateSchema,
  SearchKeywordsSchema,
  SecretsSchema,
  SettingsSchema,
  TargetSiteSchema,
} from '@/core/schemas';
import { CollectionRepository } from './collection-repository';
import type { KeyValueStore } from './kv';
import { ProfileRepository } from './profile-repository';
import { SecretsRepository } from './secrets-repository';
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
  scans: 'scans',
  secrets: 'secrets',
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
      {
        key: STORAGE_KEYS.targetSites,
        version: 2,
        schema: TargetSiteSchema,
        migrations: { 1: migrateTargetSitesV1toV2 },
      },
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
      {
        key: STORAGE_KEYS.jobs,
        version: 2,
        schema: SavedJobSchema,
        migrations: { 1: migrateJobsV1toV2 },
      },
      clock,
    ),
    matches: new CollectionRepository(
      store,
      {
        key: STORAGE_KEYS.matches,
        version: 2,
        schema: JobMatchSchema,
        migrations: { 1: migrateMatchesV1toV2 },
      },
      clock,
    ),
    drafts: new CollectionRepository(
      store,
      {
        key: STORAGE_KEYS.drafts,
        version: 2,
        schema: ApplicationDraftSchema,
        migrations: { 1: migrateDraftsV1toV2 },
      },
      clock,
    ),
    scans: new CollectionRepository(
      store,
      { key: STORAGE_KEYS.scans, version: 1, schema: ScanRecordSchema },
      clock,
    ),
    secrets: new SecretsRepository(
      new SingletonRepository(
        store,
        { key: STORAGE_KEYS.secrets, version: 1, schema: SecretsSchema },
        emptySecrets,
        clock,
      ),
    ),
    /** Deletes everything this extension stored, including the API key and quarantined data. */
    clearAll: () => store.clear(),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
