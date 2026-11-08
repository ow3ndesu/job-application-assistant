import { z } from 'zod';
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

export interface InvalidRecord {
  id: string;
  reason: string;
}

export interface CollectionReadResult<T> {
  items: T[];
  /** Records that failed validation. They are kept in storage until discarded. */
  invalid: InvalidRecord[];
}

const RecordMapSchema = z.record(z.string(), z.unknown());

interface ParsedMap<T> {
  valid: Map<string, T>;
  invalid: InvalidRecord[];
  invalidRaw: Map<string, unknown>;
}

/**
 * Repository for a collection of records with string ids, stored as one
 * `{ [id]: record }` map under a single key. Each record is validated on its
 * own: one corrupt record does not make the rest unreadable, and corrupt
 * records are preserved on writes until explicitly discarded.
 */
export class CollectionRepository<T extends { id: string }> {
  private readonly lock = new KeyedMutex();

  constructor(
    private readonly store: KeyValueStore,
    /** `schema` validates a single record; migrations operate on the whole map. */
    private readonly spec: VersionedSpec<T>,
    private readonly clock: Clock,
    /** Records to seed when the key has never been written. */
    private readonly initial: () => T[] = () => [],
  ) {}

  get key(): string {
    return this.spec.key;
  }

  async list(): Promise<CollectionReadResult<T>> {
    const parsed = await this.readMap();
    return { items: [...parsed.valid.values()], invalid: parsed.invalid };
  }

  /** Returns the record, `undefined` if absent, or throws `corrupt` if invalid. */
  async get(id: string): Promise<T | undefined> {
    const parsed = await this.readMap();
    const bad = parsed.invalid.find((r) => r.id === id);
    if (bad)
      throw new StorageError('corrupt', this.spec.key, `Record ${id} is invalid: ${bad.reason}`);
    return parsed.valid.get(id);
  }

  /** Inserts or replaces a record by id. Invalid input throws and writes nothing. */
  upsert(item: T): Promise<T> {
    return this.upsertMany([item]).then((r) => r[0] as T);
  }

  upsertMany(items: readonly T[]): Promise<T[]> {
    return this.lock.run(this.spec.key, async () => {
      const validated = items.map((item) => this.validateInput(item));
      const parsed = await this.readMap();
      for (const item of validated) parsed.valid.set(item.id, item);
      await this.writeMap(parsed);
      return validated;
    });
  }

  /** Returns true if a record (valid or invalid) was removed. */
  remove(id: string): Promise<boolean> {
    return this.lock.run(this.spec.key, async () => {
      const parsed = await this.readMap();
      const removedValid = parsed.valid.delete(id);
      const removedInvalid = parsed.invalidRaw.delete(id);
      const existed = removedValid || removedInvalid;
      if (existed) await this.writeMap(parsed);
      return existed;
    });
  }

  /** Removes all records (does not re-seed initial records). */
  clear(): Promise<void> {
    return this.lock.run(this.spec.key, () =>
      io(this.spec.key, () => this.store.set(this.spec.key, wrap(this.spec.version, {}))),
    );
  }

  /** Deletes the key entirely; the next read re-seeds initial records. */
  reset(): Promise<void> {
    return this.lock.run(this.spec.key, () =>
      io(this.spec.key, () => this.store.remove(this.spec.key)),
    );
  }

  /**
   * Moves invalid records to a quarantine key and drops them from the
   * collection. Returns the quarantine key, or `undefined` if none were invalid.
   */
  discardInvalid(): Promise<string | undefined> {
    return this.lock.run(this.spec.key, async () => {
      const parsed = await this.readMap();
      if (parsed.invalid.length === 0) return undefined;
      const target = await quarantine(
        this.store,
        this.spec.key,
        this.clock.now(),
        Object.fromEntries(parsed.invalidRaw),
      );
      await this.writeMap({ ...parsed, invalid: [], invalidRaw: new Map() });
      return target;
    });
  }

  /**
   * Recovery for a whole-collection failure (`corrupt` envelope or
   * `migration_failed`): quarantines the raw value and resets the collection.
   */
  recover(): Promise<string | undefined> {
    return this.lock.run(this.spec.key, () =>
      quarantine(this.store, this.spec.key, this.clock.now()),
    );
  }

  private validateInput(item: T): T {
    const parsed = this.spec.schema.safeParse(item);
    if (!parsed.success) {
      throw new StorageError(
        'invalid_input',
        this.spec.key,
        `Refusing to store invalid record:\n${describeIssues(parsed.error)}`,
      );
    }
    return parsed.data;
  }

  private async readMap(): Promise<ParsedMap<T>> {
    const read = await readEnvelopeData(this.store, this.spec);
    if (!read) {
      // First run: persist seed records so their ids/timestamps stay stable.
      const seeded: ParsedMap<T> = { valid: new Map(), invalid: [], invalidRaw: new Map() };
      for (const item of this.initial()) seeded.valid.set(item.id, this.validateInput(item));
      if (seeded.valid.size > 0) await this.writeMap(seeded);
      return seeded;
    }

    const map = RecordMapSchema.safeParse(read.data);
    if (!map.success) {
      throw new StorageError('corrupt', this.spec.key, 'Stored collection is not a record map');
    }

    const result: ParsedMap<T> = { valid: new Map(), invalid: [], invalidRaw: new Map() };
    for (const [id, raw] of Object.entries(map.data)) {
      const parsed = this.spec.schema.safeParse(raw);
      if (!parsed.success) {
        result.invalid.push({ id, reason: describeIssues(parsed.error) });
        result.invalidRaw.set(id, raw);
      } else if (parsed.data.id !== id) {
        result.invalid.push({ id, reason: 'Record id does not match its storage key' });
        result.invalidRaw.set(id, raw);
      } else {
        result.valid.set(id, parsed.data);
      }
    }
    if (read.migrated) await this.writeMap(result);
    return result;
  }

  private async writeMap(parsed: ParsedMap<T>): Promise<void> {
    const data: Record<string, unknown> = Object.fromEntries(parsed.invalidRaw);
    for (const [id, item] of parsed.valid) data[id] = item;
    await io(this.spec.key, () => this.store.set(this.spec.key, wrap(this.spec.version, data)));
  }
}
