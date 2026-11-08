import { z } from 'zod';

export const IdSchema = z.string().trim().min(1).max(200);

/** ISO-8601 timestamp, e.g. `2026-11-08T01:00:00.000Z`. */
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });

/** Any http(s) URL. Rejects `javascript:`, `data:`, `file:`, etc. */
export const HttpUrlSchema = z.url({ protocol: /^https?$/ }).max(2048);

/** https-only URL, used for user-configured target sites. */
export const HttpsUrlSchema = z.url({ protocol: /^https$/ }).max(2048);

export const NonEmptyTextSchema = z.string().trim().min(1);

/** Ensures a string list has no case-insensitive duplicates. */
export function uniqueCaseInsensitive(values: readonly string[]): boolean {
  return new Set(values.map((v) => v.toLowerCase())).size === values.length;
}
