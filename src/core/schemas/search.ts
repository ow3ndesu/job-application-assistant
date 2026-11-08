import { z } from 'zod';
import { HttpsUrlSchema, IdSchema, IsoDateTimeSchema, uniqueCaseInsensitive } from './common';

export const DEFAULT_TARGET_SITE_ID = 'onlinejobs-ph';
export const DEFAULT_TARGET_SITE_URL = 'https://www.onlinejobs.ph/jobseekers';

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
