import { z } from 'zod';
import { StorageError } from './errors';
import type { KeyValueStore } from './kv';

/**
 * Versioning strategy
 * -------------------
 * Every stored value is wrapped in an envelope `{ schemaVersion, data }`.
 * `migrations[n]` converts envelope data from version n to n + 1. On read, data
 * older than `version` is migrated step by step and then validated; the
 * migrated result is written back. Data newer than `version` (written by a newer
 * build) is reported as `unsupported_version` and never overwritten.
 */
export interface VersionedSpec<T> {
  key: string;
  version: number;
  schema: z.ZodType<T>;
  migrations?: Readonly<Record<number, (data: unknown) => unknown>>;
}

export const QUARANTINE_PREFIX = 'quarantine:';

const EnvelopeSchema = z.object({
  schemaVersion: z.number().int().positive(),
  data: z.unknown(),
});

export interface Envelope {
  schemaVersion: number;
  data: unknown;
}

export function wrap(version: number, data: unknown): Envelope {
  return { schemaVersion: version, data };
}

export async function io<T>(key: string, op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (cause) {
    throw new StorageError('io', key, 'Storage operation failed', { cause });
  }
}

export function describeIssues(error: z.ZodError): string {
  // prettifyError reports messages and paths, not input values.
  return z.prettifyError(error);
}

/**
 * Reads and migrates envelope data. Returns `undefined` when the key is absent.
 * Does not validate `data` against `spec.schema`; callers do that because
 * collection repositories validate per record.
 */
export async function readEnvelopeData(
  store: KeyValueStore,
  spec: VersionedSpec<unknown>,
): Promise<{ data: unknown; migrated: boolean } | undefined> {
  const raw = await io(spec.key, () => store.get(spec.key));
  if (raw === undefined) return undefined;

  const envelope = EnvelopeSchema.safeParse(raw);
  if (!envelope.success) {
    throw new StorageError('corrupt', spec.key, 'Stored value is not a valid envelope');
  }

  const stored = envelope.data.schemaVersion;
  if (stored > spec.version) {
    throw new StorageError(
      'unsupported_version',
      spec.key,
      `Stored schema v${stored} is newer than supported v${spec.version}`,
    );
  }

  let data = envelope.data.data;
  for (let v = stored; v < spec.version; v++) {
    const migrate = spec.migrations?.[v];
    if (!migrate) {
      throw new StorageError('migration_failed', spec.key, `No migration from v${v} to v${v + 1}`);
    }
    try {
      data = migrate(data);
    } catch (cause) {
      throw new StorageError('migration_failed', spec.key, `Migration v${v}→v${v + 1} threw`, {
        cause,
      });
    }
  }
  return { data, migrated: stored !== spec.version };
}

/**
 * Moves the raw value at `key` to a timestamped quarantine key so it is never
 * silently lost, then removes the original. Returns the quarantine key, or
 * `undefined` if there was nothing to move.
 */
export async function quarantine(
  store: KeyValueStore,
  key: string,
  now: Date,
  raw?: unknown,
): Promise<string | undefined> {
  const value = raw ?? (await io(key, () => store.get(key)));
  if (value === undefined) return undefined;
  const target = `${QUARANTINE_PREFIX}${key}:${now.toISOString()}`;
  await io(key, () => store.set(target, value));
  if (raw === undefined) await io(key, () => store.remove(key));
  return target;
}

/** Serializes async operations per key within one JS context (page or worker). */
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<unknown>>();

  run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const next = previous.then(fn, fn);
    const tail = next.catch(() => undefined);
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return next;
  }
}
