/**
 * Minimal async key-value store. Repositories depend on this interface, not on
 * browser APIs, so they can be tested with {@link MemoryKeyValueStore}.
 */
export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
  clear(): Promise<void>;
}

/** In-memory store. Values are deep-cloned to mimic storage serialization. */
export class MemoryKeyValueStore implements KeyValueStore {
  private readonly data = new Map<string, unknown>();

  get(key: string): Promise<unknown> {
    const value = this.data.get(key);
    return Promise.resolve(value === undefined ? undefined : structuredClone(value));
  }

  set(key: string, value: unknown): Promise<void> {
    this.data.set(key, structuredClone(value));
    return Promise.resolve();
  }

  remove(key: string): Promise<void> {
    this.data.delete(key);
    return Promise.resolve();
  }

  keys(): Promise<string[]> {
    return Promise.resolve([...this.data.keys()]);
  }

  clear(): Promise<void> {
    this.data.clear();
    return Promise.resolve();
  }
}
