import { fail, ok, type Result } from '../result';
import { KEYWORD_LIMITS, type SearchKeywords } from '../schemas';

export type KeywordKind = keyof SearchKeywords; // 'include' | 'exclude'

export function addKeyword(
  current: SearchKeywords,
  kind: KeywordKind,
  raw: string,
): Result<SearchKeywords> {
  const keyword = raw.trim().replace(/\s+/g, ' ');
  if (!keyword) return fail('Enter a keyword.');
  if (keyword.length > KEYWORD_LIMITS.maxLength) {
    return fail(`Keywords can be at most ${KEYWORD_LIMITS.maxLength} characters.`);
  }
  const list = current[kind];
  if (list.length >= KEYWORD_LIMITS.maxCount) {
    return fail(`You can add at most ${KEYWORD_LIMITS.maxCount} keywords here.`);
  }
  const lower = keyword.toLowerCase();
  if (list.some((k) => k.toLowerCase() === lower)) return fail('That keyword is already added.');
  const otherKind: KeywordKind = kind === 'include' ? 'exclude' : 'include';
  if (current[otherKind].some((k) => k.toLowerCase() === lower)) {
    return fail(
      `That keyword is already in the ${otherKind === 'include' ? 'keywords' : 'exclusions'} list.`,
    );
  }
  return ok({ ...current, [kind]: [...list, keyword] });
}

export function removeKeyword(
  current: SearchKeywords,
  kind: KeywordKind,
  keyword: string,
): SearchKeywords {
  return { ...current, [kind]: current[kind].filter((k) => k !== keyword) };
}
