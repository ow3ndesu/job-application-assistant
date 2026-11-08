import type { IdGenerator } from '@/core/domain';
import { fail, ok, type Result } from '@/core/result';
import { ProfileProposalSchema, type ProfileProposal, type ProposalSource } from '@/core/schemas';
import { insertAdditions, type InsertResult } from './markdown';

/** A proposal in the user's own words (no AI). */
export function createUserProposal(
  input: { section: string; text: string; source: ProposalSource },
  now: Date,
  ids: IdGenerator,
): Result<ProfileProposal> {
  const parsed = ProfileProposalSchema.safeParse({
    id: ids.newId(),
    section: input.section.replace(/^#+\s*/, '').trim(),
    text: input.text
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[-*]\s+/, ''),
    phrasedBy: 'user',
    sources: [input.source],
    status: 'pending',
    createdAt: now.toISOString(),
  });
  return parsed.success
    ? ok(parsed.data)
    : fail('Enter a section and the fact to add (max 1,000 characters).');
}

/** Edits a pending or accepted proposal; the result is the user's wording and goes back to pending. */
export function editProposal(
  p: ProfileProposal,
  edits: { section?: string; text?: string },
  now: Date,
): Result<ProfileProposal> {
  if (p.status === 'applied' || p.status === 'rejected')
    return fail('This proposal can no longer be edited.');
  const next = ProfileProposalSchema.safeParse({
    ...p,
    section: (edits.section ?? p.section).replace(/^#+\s*/, '').trim(),
    text: (edits.text ?? p.text).replace(/\s+/g, ' ').trim(),
    phrasedBy: 'user',
    status: 'pending',
    decidedAt: now.toISOString(),
  });
  return next.success
    ? ok(next.data)
    : fail('Enter a section and the fact to add (max 1,000 characters).');
}

export function decideProposal(
  p: ProfileProposal,
  decision: 'accepted' | 'rejected',
  now: Date,
): Result<ProfileProposal> {
  if (p.status === 'applied') return fail('Already added to your profile.');
  return ok({ ...p, status: decision, decidedAt: now.toISOString() });
}

/**
 * Builds the new profile text from ACCEPTED proposals only. Pure: the caller
 * shows the diff and saves a new profile version only after the user confirms.
 */
export function previewAccepted(
  profileContent: string,
  proposals: readonly ProfileProposal[],
): InsertResult & { used: ProfileProposal[] } {
  const used = proposals.filter((p) => p.status === 'accepted');
  return {
    ...insertAdditions(
      profileContent,
      used.map((p) => ({ section: p.section, text: p.text })),
    ),
    used,
  };
}

export function markApplied(p: ProfileProposal, version: number, now: Date): ProfileProposal {
  return { ...p, status: 'applied', appliedToVersion: version, decidedAt: now.toISOString() };
}
