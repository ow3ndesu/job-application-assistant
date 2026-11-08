import type { ApplicationDraft } from '@/core/schemas';
import { fail, ok, type Result } from '@/core/result';

/**
 * Human-approved application workflow (T09). The extension never fills or
 * submits forms on OnlineJobs.ph (read-only decision), so the workflow is:
 *   draft/needs_review --approve(review ack)--> approved
 *   approved --user reports submitting (separate confirmation)--> submitted (unconfirmed)
 *   approved --withdraw--> draft ; submitted --undo--> approved
 *   any (not submitted) --could not apply--> failed ; failed --reopen--> draft
 * Editing approved text revokes the approval (see applyDraftEdits).
 */

/** FNV-1a 32-bit over the user-visible text; identifies exactly what was approved. */
export function draftContentHash(draft: Pick<ApplicationDraft, 'coverLetter' | 'answers'>): string {
  const text = JSON.stringify([
    draft.coverLetter,
    draft.answers.map((a) => [a.question, a.answer]),
  ]);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function blankAnswerCount(draft: Pick<ApplicationDraft, 'answers'>): number {
  return draft.answers.filter((a) => !a.answer.trim()).length;
}

export interface ApprovalCheck {
  blockers: string[];
  blankAnswers: number;
  sensitiveAnswered: number;
}

export function checkApproval(draft: ApplicationDraft): ApprovalCheck {
  const blockers: string[] = [];
  if (!draft.coverLetter.trim()) blockers.push('Write an application message first.');
  if (draft.status === 'submitted')
    blockers.push('This application is already marked as submitted.');
  return {
    blockers,
    blankAnswers: blankAnswerCount(draft),
    sensitiveAnswered: draft.answers.filter((a) => a.sensitiveCategory && a.answer.trim()).length,
  };
}

export interface ApprovalAck {
  /** The user confirms they reviewed the message and every answer. */
  reviewed: boolean;
  /** Required when some questions are still blank. */
  leaveBlankConfirmed?: boolean;
}

export function approveDraft(
  draft: ApplicationDraft,
  ack: ApprovalAck,
  now: Date,
): Result<ApplicationDraft> {
  const check = checkApproval(draft);
  if (check.blockers.length) return fail(check.blockers[0] ?? 'Cannot approve.');
  if (!ack.reviewed) return fail('Confirm that you reviewed the message and answers.');
  if (check.blankAnswers > 0 && !ack.leaveBlankConfirmed) {
    return fail(`Confirm that you want to leave ${check.blankAnswers} question(s) unanswered.`);
  }
  const at = now.toISOString();
  return ok({
    ...draft,
    status: 'approved',
    approvedAt: at,
    approvedContentHash: draftContentHash(draft),
    updatedAt: at,
  });
}

/** True only if the draft is approved and its text is exactly what was approved. */
export function isApprovalCurrent(draft: ApplicationDraft): boolean {
  return (
    (draft.status === 'approved' || draft.status === 'submitted') &&
    draft.approvedContentHash !== undefined &&
    draft.approvedContentHash === draftContentHash(draft)
  );
}

function withoutApproval(draft: ApplicationDraft): ApplicationDraft {
  const next = { ...draft };
  delete next.approvedAt;
  delete next.approvedContentHash;
  return next;
}

function withoutSubmission(draft: ApplicationDraft): ApplicationDraft {
  const next = { ...draft };
  delete next.submittedAt;
  delete next.submissionReportedBy;
  return next;
}

const reviewStatus = (draft: ApplicationDraft) =>
  blankAnswerCount(draft) > 0 || !draft.coverLetter.trim() ? 'needs_review' : 'draft';

export function withdrawApproval(draft: ApplicationDraft, now: Date): Result<ApplicationDraft> {
  if (draft.status !== 'approved') return fail('Only a draft marked ready can be withdrawn.');
  const next = withoutApproval(draft);
  return ok({ ...next, status: reviewStatus(next), updatedAt: now.toISOString() });
}

/**
 * The separate, final confirmation: the user reports they submitted the
 * application on the site themselves. Requires a current approval.
 */
export function markSubmittedByUser(draft: ApplicationDraft, now: Date): Result<ApplicationDraft> {
  if (draft.status !== 'approved') return fail('Mark the draft ready to use first.');
  if (!isApprovalCurrent(draft))
    return fail('The text changed since you approved it. Review and approve it again.');
  const at = now.toISOString();
  return ok({
    ...draft,
    status: 'submitted',
    submittedAt: at,
    submissionReportedBy: 'user',
    updatedAt: at,
  });
}

export function undoSubmitted(draft: ApplicationDraft, now: Date): Result<ApplicationDraft> {
  if (draft.status !== 'submitted') return fail('This application is not marked as submitted.');
  return ok({ ...withoutSubmission(draft), status: 'approved', updatedAt: now.toISOString() });
}

export function markCouldNotApply(
  draft: ApplicationDraft,
  note: string,
  now: Date,
): Result<ApplicationDraft> {
  if (draft.status === 'submitted') return fail('Undo "submitted" first.');
  const trimmed = note.trim().slice(0, 500);
  const next = withoutApproval(draft);
  return ok({
    ...next,
    status: 'failed',
    ...(trimmed ? { outcomeNote: trimmed } : {}),
    updatedAt: now.toISOString(),
  });
}

export function reopenDraft(draft: ApplicationDraft, now: Date): Result<ApplicationDraft> {
  if (draft.status !== 'failed')
    return fail('Only a draft marked "could not apply" can be reopened.');
  const next = { ...draft };
  delete next.outcomeNote;
  return ok({ ...next, status: reviewStatus(next), updatedAt: now.toISOString() });
}

export const APPLICATION_STATUS_LABEL: Record<ApplicationDraft['status'], string> = {
  draft: 'Draft',
  needs_review: 'Draft: needs your input',
  approved: 'Ready to use',
  submitted: 'Applied: reported by you, unconfirmed',
  failed: "Couldn't apply",
};
