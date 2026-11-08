import type { Clock } from '@/core/domain';
import {
  JobMatchSchema,
  matchId,
  type ApplicantProfile,
  type JobMatch,
  type JobPosting,
} from '@/core/schemas';
import { aiFail, type AIProvider, type AIResult } from '@/providers/ai/types';
import { MatchAIOutputSchema } from './ai-output';
import { detectInjection } from './injection';
import { buildMatchPrompt } from './prompt';
import { verifyAgainstProfile } from './verify';

/**
 * Evaluates one job against the current profile. Output is schema-validated by
 * the provider, then every strength is checked against the profile text before
 * anything is stored or shown.
 */
export async function matchJob(
  provider: AIProvider,
  job: JobPosting,
  profile: ApplicantProfile,
  clock: Clock,
  signal?: AbortSignal,
): Promise<AIResult<JobMatch>> {
  const prompt = buildMatchPrompt(job, profile);
  const result = await provider.generateStructured({
    system: prompt.system,
    userContent: prompt.userContent,
    schema: MatchAIOutputSchema,
    maxTokens: 8_000,
    ...(signal ? { signal } : {}),
  });
  if (!result.ok) return result;

  const verified = verifyAgainstProfile(result.value, profile.content);
  const basedOnSnippet = job.descriptionSource === 'listing_snippet';
  const uncertainties = basedOnSnippet
    ? [
        'Only the short preview from the search page was available. Scan the job post for a fuller evaluation.',
        ...verified.uncertainties,
      ]
    : verified.uncertainties;

  const candidate: JobMatch = {
    id: matchId(job.id, profile.version),
    jobId: job.id,
    profileId: profile.id,
    profileVersion: profile.version,
    score: verified.score,
    strengths: verified.strengths,
    gaps: verified.gaps,
    uncertainties: uncertainties.slice(0, 50),
    unsupportedClaims: verified.unsupportedClaims,
    rationale: verified.rationale,
    injectionSuspected:
      result.value.suspiciousInstructionsInJob ||
      detectInjection([job.title, job.description, ...job.requirements].join('\n')),
    basedOnSnippet,
    jobContentHash: job.contentHash,
    model: result.usage?.model ?? provider.model,
    evaluatedAt: clock.now().toISOString(),
  };
  const parsed = JobMatchSchema.safeParse(candidate);
  return parsed.success ? { ok: true, value: parsed.data } : aiFail('malformed_response');
}
