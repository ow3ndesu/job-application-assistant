import { z } from 'zod';
import { HttpsUrlSchema, IdSchema, IsoDateTimeSchema, uniqueCaseInsensitive } from './common';

export const DEFAULT_TARGET_SITE_ID = 'onlinejobs-ph';
/**
 * Public job list. (`/jobseekers`, the original default, redirects to the login
 * page for logged-out users; changed 2026-11-08 at the user's request.)
 */
export const DEFAULT_TARGET_SITE_URL = 'https://www.onlinejobs.ph/jobseekers/jobsearch';
/** The pre-2026-11-08 default, used only by the v1→v2 storage migration. */
export const LEGACY_DEFAULT_TARGET_SITE_URL = 'https://www.onlinejobs.ph/jobseekers';

/**
 * targetSites v1→v2: points the untouched default site at the new default URL.
 * A site the user edited (different URL) or added is left exactly as it was.
 */
export function migrateTargetSitesV1toV2(data: unknown): unknown {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return data;
  const map = { ...(data as Record<string, unknown>) };
  const site = map[DEFAULT_TARGET_SITE_ID];
  if (
    typeof site === 'object' &&
    site !== null &&
    (site as { url?: unknown }).url === LEGACY_DEFAULT_TARGET_SITE_URL
  ) {
    map[DEFAULT_TARGET_SITE_ID] = { ...site, url: DEFAULT_TARGET_SITE_URL };
  }
  return map;
}

export const TargetSiteSchema = z.object({
  id: IdSchema,
  url: HttpsUrlSchema,
  label: z.string().trim().min(1).max(100),
  enabled: z.boolean(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export type TargetSite = z.infer<typeof TargetSiteSchema>;

export const KEYWORD_LIMITS = { maxLength: 100, maxCount: 50 } as const;

const KeywordSchema = z.string().trim().min(1).max(KEYWORD_LIMITS.maxLength);
const KeywordListSchema = z
  .array(KeywordSchema)
  .max(KEYWORD_LIMITS.maxCount)
  .refine(uniqueCaseInsensitive, { message: 'Duplicate keywords are not allowed' });

export const SearchKeywordsSchema = z.object({
  include: KeywordListSchema,
  exclude: KeywordListSchema,
});

export type SearchKeywords = z.infer<typeof SearchKeywordsSchema>;

export function defaultSearchKeywords(): SearchKeywords {
  return { include: [], exclude: [] };
}

export function defaultTargetSite(now: Date): TargetSite {
  const ts = now.toISOString();
  return {
    id: DEFAULT_TARGET_SITE_ID,
    url: DEFAULT_TARGET_SITE_URL,
    label: 'OnlineJobs.ph',
    enabled: true,
    createdAt: ts,
    updatedAt: ts,
  };
}
