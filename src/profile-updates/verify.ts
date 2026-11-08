import { classifySensitive } from '@/drafting/sensitive';
import { MIN_QUOTE_CHARS, normalizeForQuote } from '@/matching/verify';
import { profileAlreadyHas } from './markdown';

export interface ProposedAddition {
  section: string;
  text: string;
  userQuotes: string[];
}

export interface VerifiedAddition {
  section: string;
  text: string;
  quotes: string[];
}

export interface RejectedAddition {
  text: string;
  reason: string;
}

const NUMBERS = /\d+(?:[.,]\d+)?/g;
const CREDENTIALS =
  /\b(bachelor'?s?|master'?s?|ph\.?d|doctorate|degree|diploma|certified|certificate|certification|licen[sc]ed?|accredited|cpa|mba|tesol|tefl|ielts|toeic|graduate[d]?)\b/gi;

/** Lowercased matches of `re` in `text`. */
const tokens = (re: RegExp, text: string) => [...text.matchAll(re)].map((m) => m[0].toLowerCase());

/**
 * Checks AI-phrased additions against the user's own words:
 *  - at least one quote must appear verbatim in the user's input;
 *  - every number and credential word in the addition must appear in those quotes
 *    (no invented years, amounts, degrees, or certifications);
 *  - sensitive information is not added automatically;
 *  - facts the profile already contains are skipped.
 */
export function verifyAdditions(
  additions: readonly ProposedAddition[],
  userInput: string,
  profileContent: string,
): { accepted: VerifiedAddition[]; rejected: RejectedAddition[] } {
  const input = normalizeForQuote(userInput);
  const accepted: VerifiedAddition[] = [];
  const rejected: RejectedAddition[] = [];

  for (const a of additions) {
    const text = a.text
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[-*]\s+/, '');
    const section =
      a.section
        .replace(/^#+\s*/, '')
        .trim()
        .slice(0, 80) || 'Additional information';
    if (!text) continue;
    const quotes = [
      ...new Set(
        a.userQuotes
          .map((q) => q.trim())
          .filter((q) => {
            const n = normalizeForQuote(q);
            return n.length >= MIN_QUOTE_CHARS && input.includes(n);
          }),
      ),
    ];
    if (quotes.length === 0) {
      rejected.push({ text, reason: 'Not found in what you wrote.' });
      continue;
    }
    const support = quotes.join(' ').toLowerCase();
    const newNumber = tokens(NUMBERS, text).find((n) => !support.includes(n));
    if (newNumber) {
      rejected.push({ text, reason: `Contains "${newNumber}", which you didn't write.` });
      continue;
    }
    const newCredential = tokens(CREDENTIALS, text).find(
      (c) => !tokens(CREDENTIALS, support).includes(c),
    );
    if (newCredential) {
      rejected.push({ text, reason: `Mentions "${newCredential}", which you didn't write.` });
      continue;
    }
    if (classifySensitive(text)) {
      rejected.push({
        text,
        reason: 'Sensitive information is not added automatically. Add it yourself if you want.',
      });
      continue;
    }
    if (profileAlreadyHas(profileContent, text)) {
      rejected.push({ text, reason: 'Your profile already says this.' });
      continue;
    }
    accepted.push({
      section,
      text: text.slice(0, 1000),
      quotes: quotes.slice(0, 10).map((q) => q.slice(0, 2000)),
    });
  }
  return { accepted: accepted.slice(0, 30), rejected: rejected.slice(0, 30) };
}
