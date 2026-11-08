import type { DraftAnswer } from '@/core/schemas';
import { MIN_QUOTE_CHARS, normalizeForQuote } from '@/matching/verify';
import type { DraftAIOutput } from './ai-output';
import { classifySensitive } from './sensitive';

/**
 * Text that looks like a claim about the applicant (numbers, durations,
 * experience, credentials, skills, results). Such text needs profile evidence
 * even if the model labelled it "courtesy".
 */
const FACT_LIKE =
  /\d|\b(years?|months?|experience[d]?|worked|working (at|for|as|with)|managed|manage|led|built|created|developed|designed|certified|certificate|certification|degree|diploma|graduated?|bachelor|master'?s|phd|fluent|proficient|expert|expertise|skilled|skills?|familiar with|trained|handled|delivered|achieved|increased|reduced|clients?|projects?|available|availability|hours|full[- ]time|part[- ]time|tools?|software|background in|speciali[sz]e)\b/i;

export function looksFactual(text: string): boolean {
  return FACT_LIKE.test(text);
}

function verifiedQuotes(quotes: readonly string[], normalizedProfile: string): string[] {
  return [
    ...new Set(
      quotes
        .map((q) => q.trim())
        .filter((q) => {
          const n = normalizeForQuote(q);
          return n.length >= MIN_QUOTE_CHARS && normalizedProfile.includes(n);
        }),
    ),
  ].slice(0, 10);
}

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s);

export interface VerifiedDraft {
  coverLetter: string;
  coverLetterEvidence: { paragraph: string; evidence: string[] }[];
  removedStatements: string[];
  answers: DraftAnswer[];
  postInstructions: string[];
}

/**
 * Enforces the evidence rules on a model draft:
 *  - factual (or fact-like) paragraphs without a verified profile quote are removed;
 *  - answers need verified quotes unless they contain no claims;
 *  - sensitive questions are always left blank, whatever the model returned.
 */
export function verifyDraft(
  output: DraftAIOutput,
  profileContent: string,
  questions: readonly string[],
): VerifiedDraft {
  const profile = normalizeForQuote(profileContent);
  const kept: string[] = [];
  const coverLetterEvidence: VerifiedDraft['coverLetterEvidence'] = [];
  const removedStatements: string[] = [];

  for (const p of output.coverLetter) {
    const text = p.text.trim();
    if (!text) continue;
    const needsEvidence = p.kind === 'factual' || looksFactual(text);
    if (!needsEvidence) {
      kept.push(text);
      continue;
    }
    const evidence = verifiedQuotes(p.profileQuotes, profile);
    if (evidence.length > 0) {
      kept.push(text);
      coverLetterEvidence.push({
        paragraph: clip(text, 5000),
        evidence: evidence.map((q) => clip(q, 2000)),
      });
    } else {
      removedStatements.push(clip(text, 2000));
    }
  }

  const answers: DraftAnswer[] = questions.map((question, index) => {
    const category = classifySensitive(question);
    if (category) {
      return {
        question,
        answer: '',
        status: 'sensitive',
        evidence: [],
        sensitiveCategory: category,
        note: 'Sensitive question: never answered automatically. Answer it yourself if you choose to.',
      };
    }
    const modelAnswer = output.answers.find((a) => a.questionNumber === index + 1);
    const text = modelAnswer?.text.trim() ?? '';
    if (!modelAnswer || modelAnswer.status !== 'answered' || !text) {
      return {
        question,
        answer: '',
        status: 'unknown',
        evidence: [],
        note: 'Your profile has nothing to answer this. Write your own answer if it applies.',
      };
    }
    const evidence = verifiedQuotes(modelAnswer.profileQuotes, profile);
    if (evidence.length > 0) {
      return {
        question,
        answer: clip(text, 20000),
        status: 'answered',
        evidence: evidence.map((q) => clip(q, 2000)),
      };
    }
    if (!looksFactual(text)) {
      return {
        question,
        answer: clip(text, 20000),
        status: 'answered',
        evidence: [],
        note: 'Uses no facts from your profile. Check that it reflects you.',
      };
    }
    removedStatements.push(clip(`Answer to "${question}": ${text}`, 2000));
    return {
      question,
      answer: '',
      status: 'unknown',
      evidence: [],
      note: 'A drafted answer was removed because your profile does not support it.',
    };
  });

  const postInstructions = [
    ...new Set(output.postInstructions.map((s) => s.trim()).filter(Boolean)),
  ]
    .slice(0, 20)
    .map((s) => clip(s, 500));

  return {
    coverLetter: kept.join('\n\n'),
    coverLetterEvidence: coverLetterEvidence.slice(0, 30),
    removedStatements: removedStatements.slice(0, 30),
    answers,
    postInstructions,
  };
}
