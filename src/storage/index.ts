import { createBrowserLocalStore } from './browser-store';
import { createRepositories, type Repositories } from './repositories';

export * from './errors';
export type { KeyValueStore } from './kv';
export type { CollectionReadResult, InvalidRecord } from './collection-repository';
export { createRepositories, STORAGE_KEYS, type Repositories } from './repositories';
export { createDataManagement, type DataManagement } from './data-management';

let instance: Repositories | undefined;

/** Repositories backed by `browser.storage.local`. UI code uses this, never storage APIs. */
export function getRepositories(): Repositories {
  instance ??= createRepositories(createBrowserLocalStore());
  return instance;
}
