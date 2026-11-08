import type { Clock } from '@/core/domain';
import {
  ApplicationDraftSchema,
  draftId,
  type ApplicantProfile,
  type ApplicationDraft,
  type JobPosting,
} from '@/core/schemas';
import { detectInjection } from '@/matching/injection';
import { aiFail, type AIProvider, type AIResult } from '@/providers/ai/types';
import { DraftAIOutputSchema } from './ai-output';
import { buildDraftPrompt } from './prompt';
import { classifySensitive } from './sensitive';
import { verifyDraft } from './verify';

export const MAX_QUESTIONS = 20;
export const MAX_QUESTION_CHARS = 500;

/** Trims, collapses whitespace, drops blanks/duplicates, applies limits. */
export function cleanQuestions(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of raw) {
    const c = q.replace(/\s+/g, ' ').trim().slice(0, MAX_QUESTION_CHARS);
    if (!c || seen.has(c.toLowerCase())) continue;
    seen.add(c.toLowerCase());
    out.push(c);
    if (out.length >= MAX_QUESTIONS) break;
  }
  return out;
}

/**
 * Generates an application draft. Sensitive questions are never sent to the
 * provider; everything the model writes is verified against the profile.
 * Never modifies the profile.
 */
export async function draftApplication(
  provider: AIProvider,
  job: JobPosting,
  profile: ApplicantProfile,
  rawQuestions: readonly string[],
  clock: Clock,
  signal?: AbortSignal,
): Promise<AIResult<ApplicationDraft>> {
  const questions = cleanQuestions(rawQuestions);
  // Only non-sensitive questions are sent, numbered in their original order.
  const sendable = questions.filter((q) => !classifySensitive(q));
  const prompt = buildDraftPrompt(job, profile, sendable);
  const result = await provider.generateStructured({
    system: prompt.system,
    userContent: prompt.userContent,
    schema: DraftAIOutputSchema,
    maxTokens: 8_000,
    ...(signal ? { signal } : {}),
  });
  if (!result.ok) return result;

  // Map model answers (numbered over `sendable`) back onto the full question list.
  const remapped = {
    ...result.value,
    answers: result.value.answers.flatMap((a) => {
      const q = sendable[a.questionNumber - 1];
      return q === undefined ? [] : [{ ...a, questionNumber: questions.indexOf(q) + 1 }];
    }),
  };
  const verified = verifyDraft(remapped, profile.content, questions);
  const needsReview =
    verified.removedStatements.length > 0 ||
    verified.answers.some((a) => a.status !== 'answered') ||
    !verified.coverLetter;
  const now = clock.now().toISOString();

  const candidate: ApplicationDraft = {
    id: draftId(job.id, profile.version),
    jobId: job.id,
    profileId: profile.id,
    profileVersion: profile.version,
    coverLetter: verified.coverLetter,
    coverLetterEvidence: verified.coverLetterEvidence,
    removedStatements: verified.removedStatements,
    answers: verified.answers,
    postInstructions: verified.postInstructions,
    injectionSuspected:
      result.value.suspiciousInstructionsInJob ||
      detectInjection([job.title, job.description, ...job.requirements].join('\n')),
    editedByUser: false,
    status: needsReview ? 'needs_review' : 'draft',
    jobContentHash: job.contentHash,
    model: result.usage?.model ?? provider.model,
    createdAt: now,
    updatedAt: now,
  };
  const parsed = ApplicationDraftSchema.safeParse(candidate);
  return parsed.success ? { ok: true, value: parsed.data } : aiFail('malformed_response');
}
