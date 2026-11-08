import type { ApplicationDraft, JobMatch, SavedJob } from '@/core/schemas';
import { classifySensitive } from '@/drafting/sensitive';
import { profileAlreadyHas } from './markdown';

/** An answer the user wrote themselves in a draft: user-supplied, so usable as a source. */
export interface OwnAnswerCandidate {
  key: string;
  question: string;
  answer: string;
  label: string;
  at: string;
}

/**
 * Something the AI claimed that the profile does not support. NOT a fact:
 * it can only become a proposal after the user explicitly confirms it is true.
 */
export interface UnconfirmedClaimCandidate {
  key: string;
  claim: string;
  label: string;
  at: string;
}

export interface Candidates {
  ownAnswers: OwnAnswerCandidate[];
  unconfirmedClaims: UnconfirmedClaimCandidate[];
}

/**
 * Collects candidates for profile additions. Excludes sensitive questions,
 * empty answers, things the profile already says, and anything the user has
 * already turned into a proposal (by key).
 */
export function collectCandidates(input: {
  profileContent: string;
  drafts: readonly ApplicationDraft[];
  matches: readonly JobMatch[];
  jobs: readonly SavedJob[];
  usedKeys: ReadonlySet<string>;
}): Candidates {
  const title = (jobId: string) => input.jobs.find((j) => j.id === jobId)?.title ?? 'a saved job';
  const ownAnswers: OwnAnswerCandidate[] = [];
  const unconfirmed = new Map<string, UnconfirmedClaimCandidate>();

  for (const d of input.drafts) {
    d.answers.forEach((a) => {
      if (a.status !== 'user_written' || a.sensitiveCategory || classifySensitive(a.question))
        return;
      const answer = a.answer.trim();
      if (!answer || profileAlreadyHas(input.profileContent, answer)) return;
      const key = `answer:${d.id}:${a.question}`;
      if (input.usedKeys.has(key)) return;
      ownAnswers.push({
        key,
        question: a.question,
        answer,
        label: `Your answer to "${a.question}" (${title(d.jobId)})`,
        at: d.updatedAt,
      });
    });
    for (const claim of d.removedStatements) {
      if (claim.startsWith('Answer to "')) continue; // answers are re-asked via the draft itself
      addClaim(
        unconfirmed,
        input,
        claim,
        `Removed from your draft for ${title(d.jobId)}`,
        d.updatedAt,
      );
    }
  }
  for (const m of input.matches) {
    for (const claim of m.unsupportedClaims) {
      addClaim(
        unconfirmed,
        input,
        claim,
        `Suggested by the fit check for ${title(m.jobId)}`,
        m.evaluatedAt,
      );
    }
  }
  return { ownAnswers, unconfirmedClaims: [...unconfirmed.values()] };
}

function addClaim(
  out: Map<string, UnconfirmedClaimCandidate>,
  input: { profileContent: string; usedKeys: ReadonlySet<string> },
  claim: string,
  label: string,
  at: string,
) {
  const text = claim.trim();
  const key = `claim:${text.toLowerCase()}`;
  if (!text || out.has(key) || input.usedKeys.has(key)) return;
  if (classifySensitive(text) || profileAlreadyHas(input.profileContent, text)) return;
  out.set(key, { key, claim: text, label, at });
}
