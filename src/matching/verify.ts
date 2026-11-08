import type { EvidencedStrength } from '@/core/schemas';
import type { MatchAIOutput } from './ai-output';

/** Minimum length of a usable quote (after normalisation). */
export const MIN_QUOTE_CHARS = 4;
/** Score ceiling when no strength could be verified against the profile. */
export const UNVERIFIED_SCORE_CAP = 30;

/** Normalises text for verbatim comparison: case, whitespace, quotes, dashes, bullets. */
export function normalizeForQuote(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019\u201a\u201b\u2032]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/(^|\n)\s*[-*\u2022]\s+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'.,;:!?\u2026\s]+|["'.,;:!?\u2026\s]+$/g, '');
}

export interface VerifiedMatch {
  score: number;
  strengths: EvidencedStrength[];
  unsupportedClaims: string[];
  gaps: string[];
  uncertainties: string[];
  rationale: string;
  scoreCapped: boolean;
}

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}\u2026` : s);
const clean = (items: string[], max = 50) =>
  [...new Set(items.map((s) => s.trim()).filter(Boolean))].slice(0, max).map((s) => clip(s, 2000));

/**
 * Keeps only strengths whose quotes really appear in the profile. Anything
 * else is reported as an unsupported claim, never as a fact. If nothing could
 * be verified, the score is capped.
 */
export function verifyAgainstProfile(output: MatchAIOutput, profileContent: string): VerifiedMatch {
  const profile = normalizeForQuote(profileContent);
  const strengths: EvidencedStrength[] = [];
  const unsupportedClaims: string[] = [];

  for (const s of output.strengths) {
    const claim = s.claim.trim();
    if (!claim) continue;
    const verified = s.profileQuotes
      .map((q) => q.trim())
      .filter((q) => {
        const n = normalizeForQuote(q);
        return n.length >= MIN_QUOTE_CHARS && profile.includes(n);
      });
    if (verified.length > 0) {
      strengths.push({
        claim: clip(claim, 2000),
        evidence: [...new Set(verified)].slice(0, 10).map((q) => clip(q, 2000)),
      });
    } else {
      unsupportedClaims.push(claim);
    }
  }

  const uncertainties = [...output.uncertainties];
  let score = Math.max(0, Math.min(100, Math.round(output.score)));
  let scoreCapped = false;
  if (strengths.length === 0 && score > UNVERIFIED_SCORE_CAP) {
    score = UNVERIFIED_SCORE_CAP;
    scoreCapped = true;
    uncertainties.unshift(
      `The estimate was capped at ${UNVERIFIED_SCORE_CAP} because no strength could be confirmed with text from your profile.`,
    );
  }

  return {
    score,
    strengths: strengths.slice(0, 50),
    unsupportedClaims: clean(unsupportedClaims),
    gaps: clean(output.gaps),
    uncertainties: clean(uncertainties),
    rationale: clip(output.rationale.trim() || 'No rationale was given.', 5000),
    scoreCapped,
  };
}
