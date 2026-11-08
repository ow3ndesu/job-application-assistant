import type { KeyValueStore } from './kv';

/**
 * `browser.storage.local` adapter. This is the only module that touches
 * extension storage directly (enforced by ESLint).
 *
 * Note: `storage.local` is unencrypted, on-disk, per-profile storage. It is not
 * a secure secret vault.
 */
export function createBrowserLocalStore(): KeyValueStore {
  const area = browser.storage.local;
  return {
    async get(key) {
      const result = await area.get(key);
      return result[key];
    },
    async set(key, value) {
      await area.set({ [key]: value });
    },
    async remove(key) {
      await area.remove(key);
    },
    async keys() {
      return Object.keys(await area.get(null));
    },
    async clear() {
      await area.clear();
    },
  };
}
