export type StorageErrorKind =
  /** Stored data does not match the expected shape. Recover with `recover()`. */
  | 'corrupt'
  /** Stored data was written by a newer app version; left untouched. */
  | 'unsupported_version'
  /** No migration path, or a migration threw. Recover with `recover()`. */
  | 'migration_failed'
  /** Caller tried to write a value that fails validation. Nothing was written. */
  | 'invalid_input'
  | 'not_found'
  /** Underlying storage API failed (quota, unavailable, …). */
  | 'io';

/**
 * Typed storage failure. Messages contain only keys and schema paths, never
 * stored values, so they are safe to show or log (profile data may be personal).
 */
export class StorageError extends Error {
  override readonly name = 'StorageError';

  constructor(
    readonly kind: StorageErrorKind,
    readonly key: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(`[${key}] ${message}`, options);
  }

  /** True when `recover()` on the owning repository can restore a usable state. */
  get recoverable(): boolean {
    return this.kind === 'corrupt' || this.kind === 'migration_failed';
  }
}

export function isStorageError(error: unknown): error is StorageError {
  return error instanceof StorageError;
}
