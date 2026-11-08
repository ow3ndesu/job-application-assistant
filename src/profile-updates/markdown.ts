import { normalizeForQuote } from '@/matching/verify';

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

export interface Section {
  title: string;
  level: number;
  line: number;
}

/** Markdown headings in the profile, in order. */
export function listSections(content: string): Section[] {
  return content.split('\n').flatMap((line, i) => {
    const m = HEADING.exec(line);
    return m?.[1] && m[2] ? [{ title: m[2].trim(), level: m[1].length, line: i }] : [];
  });
}

/** True if the profile already contains this fact (normalised text match). */
export function profileAlreadyHas(content: string, text: string): boolean {
  const n = normalizeForQuote(text);
  return n.length > 0 && normalizeForQuote(content).includes(n);
}

export interface Addition {
  section: string;
  text: string;
}

export interface InsertResult {
  content: string;
  added: Addition[];
  /** Skipped because the profile already contains the same text. */
  duplicates: Addition[];
}

/**
 * Adds each fact as a "- " bullet at the end of its section (matched by
 * heading text, case-insensitive). A missing section is created at the end as
 * "## Section". Existing text is never changed or removed.
 */
export function insertAdditions(content: string, additions: readonly Addition[]): InsertResult {
  let lines = content.replace(/\s+$/, '').split('\n');
  if (lines.length === 1 && lines[0] === '') lines = [];
  const added: Addition[] = [];
  const duplicates: Addition[] = [];

  for (const raw of additions) {
    const addition = { section: raw.section.trim(), text: raw.text.replace(/\s+/g, ' ').trim() };
    if (!addition.text || !addition.section) continue;
    const current = lines.join('\n');
    if (
      profileAlreadyHas(current, addition.text) ||
      added.some((a) => normalizeForQuote(a.text) === normalizeForQuote(addition.text))
    ) {
      duplicates.push(addition);
      continue;
    }
    const bullet = `- ${addition.text}`;
    const sections = listSections(current);
    const target = sections.find((s) => s.title.toLowerCase() === addition.section.toLowerCase());
    if (!target) {
      lines.push(...(lines.length ? [''] : []), `## ${addition.section}`, bullet);
    } else {
      const next = sections.find((s) => s.line > target.line && s.level <= target.level);
      let insertAt = next ? next.line : lines.length;
      while (insertAt - 1 > target.line && (lines[insertAt - 1] ?? '').trim() === '') insertAt--;
      lines.splice(insertAt, 0, bullet);
    }
    added.push(addition);
  }
  return { content: lines.join('\n'), added, duplicates };
}

export type DiffLine = { type: 'same' | 'add' | 'remove'; text: string };

/** Line diff (common prefix/suffix + LCS on the middle) for the review screen. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const n = midA.length;
  const m = midB.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const row = lcs[i] as number[];
      row[j] =
        midA[i] === midB[j]
          ? (lcs[i + 1]?.[j + 1] ?? 0) + 1
          : Math.max(lcs[i + 1]?.[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  const middle: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (midA[i] === midB[j]) {
      middle.push({ type: 'same', text: midA[i] as string });
      i++;
      j++;
    } else if ((lcs[i + 1]?.[j] ?? 0) >= (lcs[i]?.[j + 1] ?? 0)) {
      middle.push({ type: 'remove', text: midA[i] as string });
      i++;
    } else {
      middle.push({ type: 'add', text: midB[j] as string });
      j++;
    }
  }
  while (i < n) middle.push({ type: 'remove', text: midA[i++] as string });
  while (j < m) middle.push({ type: 'add', text: midB[j++] as string });
  return [
    ...a.slice(0, start).map((text) => ({ type: 'same' as const, text })),
    ...middle,
    ...a.slice(endA).map((text) => ({ type: 'same' as const, text })),
  ];
}
