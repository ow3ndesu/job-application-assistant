import type { Clock } from '@/core/domain';
import { StorageError } from './errors';
import type { KeyValueStore } from './kv';
import {
  describeIssues,
  io,
  KeyedMutex,
  quarantine,
  readEnvelopeData,
  wrap,
  type VersionedSpec,
} from './versioned';

/** Repository for a single validated value stored under one key. */
export class SingletonRepository<T> {
  private readonly lock = new KeyedMutex();

  constructor(
    private readonly store: KeyValueStore,
    private readonly spec: VersionedSpec<T>,
    private readonly defaults: () => T,
    private readonly clock: Clock,
  ) {}

  get key(): string {
    return this.spec.key;
  }

  /** Returns the stored value, or defaults when nothing is stored yet. */
  async get(): Promise<T> {
    const read = await readEnvelopeData(this.store, this.spec);
    if (!read) return this.defaults();
    const parsed = this.spec.schema.safeParse(read.data);
    if (!parsed.success) {
      throw new StorageError(
        'corrupt',
        this.spec.key,
        `Stored value failed validation:\n${describeIssues(parsed.error)}`,
      );
    }
    if (read.migrated) await this.write(parsed.data);
    return parsed.data;
  }

  /** Validates and stores `value`. Invalid input throws and writes nothing. */
  set(value: T): Promise<T> {
    return this.lock.run(this.spec.key, () => this.write(value));
  }

  /** Atomic (within this JS context) read-modify-write. */
  update(fn: (current: T) => T): Promise<T> {
    return this.lock.run(this.spec.key, async () => this.write(fn(await this.get())));
  }

  /** Deletes the stored value; the next `get()` returns defaults. */
  reset(): Promise<void> {
    return this.lock.run(this.spec.key, () =>
      io(this.spec.key, () => this.store.remove(this.spec.key)),
    );
  }

  /**
   * Recovery for `corrupt` / `migration_failed`: moves the raw stored value to a
   * quarantine key (so it is not lost) and resets to defaults.
   */
  recover(): Promise<string | undefined> {
    return this.lock.run(this.spec.key, () =>
      quarantine(this.store, this.spec.key, this.clock.now()),
    );
  }

  private async write(value: T): Promise<T> {
    const parsed = this.spec.schema.safeParse(value);
    if (!parsed.success) {
      throw new StorageError(
        'invalid_input',
        this.spec.key,
        `Refusing to store invalid value:\n${describeIssues(parsed.error)}`,
      );
    }
    await io(this.spec.key, () =>
      this.store.set(this.spec.key, wrap(this.spec.version, parsed.data)),
    );
    return parsed.data;
  }
}
