import type { JobPosting, SearchKeywords } from '../schemas';

export interface FunnelResult {
  passes: boolean;
  matchedInclude: string[];
  matchedExclude: string[];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Case-insensitive phrase match with word-ish boundaries: "va" matches "VA"
 * and "VA/Admin" but not "java"; "c++" and "e-commerce" match literally.
 */
export function keywordMatches(text: string, keyword: string): boolean {
  const k = keyword.trim().replace(/\s+/g, ' ');
  if (!k) return false;
  const start = /^\w/.test(k) ? '(?<![\\w])' : '';
  const end = /\w$/.test(k) ? '(?![\\w])' : '';
  const pattern = k.split(' ').map(escapeRegExp).join('\\s+');
  return new RegExp(`${start}${pattern}${end}`, 'i').test(text);
}

/** The text a job is matched against: title, type, pay, skills and description. */
export function jobSearchText(
  job: Pick<
    JobPosting,
    'title' | 'description' | 'requirements' | 'employmentType' | 'compensation'
  >,
): string {
  return [job.title, job.employmentType, job.compensation, ...job.requirements, job.description]
    .filter(Boolean)
    .join('\n');
}

/**
 * Keyword funnel. Exclusions always win. With no include keywords, everything
 * not excluded passes; otherwise at least one include keyword must match.
 */
export function applyKeywordFunnel(
  job: Pick<
    JobPosting,
    'title' | 'description' | 'requirements' | 'employmentType' | 'compensation'
  >,
  keywords: SearchKeywords,
): FunnelResult {
  const text = jobSearchText(job);
  const matchedInclude = keywords.include.filter((k) => keywordMatches(text, k));
  const matchedExclude = keywords.exclude.filter((k) => keywordMatches(text, k));
  const passes =
    matchedExclude.length === 0 && (keywords.include.length === 0 || matchedInclude.length > 0);
  return { passes, matchedInclude, matchedExclude };
}
