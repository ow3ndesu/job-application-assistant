import { describe, expect, it } from 'vitest';
import { ApplicationDraftSchema, type ApplicationDraft } from '@/core/schemas';
import { SITE_ADAPTERS } from '@/sites/registry';
import { onlineJobsAdapter } from '@/sites/onlinejobs/adapter';
import { applyDraftEdits } from './edit';
import {
  APPLICATION_STATUS_LABEL,
  approveDraft,
  checkApproval,
  draftContentHash,
  isApprovalCurrent,
  markCouldNotApply,
  markSubmittedByUser,
  reopenDraft,
  undoSubmitted,
  withdrawApproval,
} from './workflow';

const T0 = new Date('2026-11-08T00:00:00.000Z');
const T1 = new Date('2026-11-08T01:00:00.000Z');

const base = (overrides: Partial<ApplicationDraft> = {}): ApplicationDraft => ({
  id: 'job-1@v1',
  jobId: 'job-1',
  profileId: 'p',
  profileVersion: 1,
  coverLetter: 'Hello, I have 3 years as a VA.',
  coverLetterEvidence: [],
  removedStatements: [],
  answers: [
    { question: 'Tools?', answer: 'Zendesk', status: 'answered', evidence: ['Zendesk'] },
    {
      question: 'Expected salary?',
      answer: '',
      status: 'sensitive',
      evidence: [],
      sensitiveCategory: 'compensation',
    },
  ],
  postInstructions: [],
  injectionSuspected: false,
  editedByUser: false,
  status: 'needs_review',
  jobContentHash: 'h',
  model: 'claude-opus-5-5',
  createdAt: T0.toISOString(),
  updatedAt: T0.toISOString(),
  ...overrides,
});

const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe('approval (first confirmation)', () => {
  it('requires the review acknowledgement', () => {
    expect(approveDraft(base(), { reviewed: false, leaveBlankConfirmed: true }, T1)).toEqual({
      ok: false,
      error: 'Confirm that you reviewed the message and answers.',
    });
  });

  it('requires explicit confirmation to leave blank questions unanswered', () => {
    expect(checkApproval(base()).blankAnswers).toBe(1);
    const r = approveDraft(base(), { reviewed: true }, T1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/leave 1 question/);
  });

  it('cannot approve an empty message', () => {
    expect(
      approveDraft(base({ coverLetter: '  ' }), { reviewed: true, leaveBlankConfirmed: true }, T1)
        .ok,
    ).toBe(false);
  });

  it('approves and fingerprints the exact text', () => {
    const d = unwrap(approveDraft(base(), { reviewed: true, leaveBlankConfirmed: true }, T1));
    expect(d).toMatchObject({
      status: 'approved',
      approvedAt: T1.toISOString(),
      approvedContentHash: draftContentHash(d),
    });
    expect(isApprovalCurrent(d)).toBe(true);
    expect(ApplicationDraftSchema.safeParse(d).success).toBe(true);
  });

  it('editing approved text revokes the approval', () => {
    const d = unwrap(approveDraft(base(), { reviewed: true, leaveBlankConfirmed: true }, T1));
    const edited = applyDraftEdits(d, { coverLetter: 'Changed text.' }, T1);
    expect(edited.status).not.toBe('approved');
    expect(edited.approvedAt).toBeUndefined();
    expect(edited.approvedContentHash).toBeUndefined();
    expect(markSubmittedByUser(edited, T1).ok).toBe(false);
  });

  it('a tampered approved record (text changed without edits API) is not current', () => {
    const d = unwrap(approveDraft(base(), { reviewed: true, leaveBlankConfirmed: true }, T1));
    expect(isApprovalCurrent({ ...d, coverLetter: 'sneaky change' })).toBe(false);
    expect(markSubmittedByUser({ ...d, coverLetter: 'sneaky change' }, T1).ok).toBe(false);
  });
});

describe('submission (separate final confirmation; user-reported, unconfirmed)', () => {
  it('cannot be reported without approval', () => {
    expect(markSubmittedByUser(base(), T1)).toEqual({
      ok: false,
      error: 'Mark the draft ready to use first.',
    });
  });

  it('records a user report, never an extension claim', () => {
    const approved = unwrap(
      approveDraft(base(), { reviewed: true, leaveBlankConfirmed: true }, T0),
    );
    const submitted = unwrap(markSubmittedByUser(approved, T1));
    expect(submitted).toMatchObject({
      status: 'submitted',
      submittedAt: T1.toISOString(),
      submissionReportedBy: 'user',
    });
    expect(APPLICATION_STATUS_LABEL.submitted).toMatch(/reported by you, unconfirmed/);
    expect(ApplicationDraftSchema.safeParse(submitted).success).toBe(true);
  });

  it('a submitted draft cannot be edited', () => {
    const submitted = unwrap(
      markSubmittedByUser(
        unwrap(approveDraft(base(), { reviewed: true, leaveBlankConfirmed: true }, T0)),
        T1,
      ),
    );
    expect(applyDraftEdits(submitted, { coverLetter: 'x' }, T1)).toBe(submitted);
  });

  it('can be undone back to ready-to-use', () => {
    const submitted = unwrap(
      markSubmittedByUser(
        unwrap(approveDraft(base(), { reviewed: true, leaveBlankConfirmed: true }, T0)),
        T1,
      ),
    );
    const undone = unwrap(undoSubmitted(submitted, T1));
    expect(undone.status).toBe('approved');
    expect(undone.submittedAt).toBeUndefined();
    expect(undone.submissionReportedBy).toBeUndefined();
  });
});

describe('cancel paths', () => {
  it('withdraw approval returns to review', () => {
    const approved = unwrap(
      approveDraft(base(), { reviewed: true, leaveBlankConfirmed: true }, T0),
    );
    const w = unwrap(withdrawApproval(approved, T1));
    expect(w).toMatchObject({ status: 'needs_review' });
    expect(w.approvedAt).toBeUndefined();
  });

  it("couldn't apply, with a note, then reopen", () => {
    const failed = unwrap(markCouldNotApply(base(), '  Login page kept failing  ', T1));
    expect(failed).toMatchObject({ status: 'failed', outcomeNote: 'Login page kept failing' });
    expect(ApplicationDraftSchema.safeParse(failed).success).toBe(true);
    const reopened = unwrap(reopenDraft(failed, T1));
    expect(reopened.status).toBe('needs_review');
    expect(reopened.outcomeNote).toBeUndefined();
  });

  it("can't mark couldn't-apply while reported as submitted", () => {
    const submitted = unwrap(
      markSubmittedByUser(
        unwrap(approveDraft(base(), { reviewed: true, leaveBlankConfirmed: true }, T0)),
        T1,
      ),
    );
    expect(markCouldNotApply(submitted, '', T1).ok).toBe(false);
  });
});

describe('form assistance policy', () => {
  it('OnlineJobs.ph never allows form filling (ToS + read-only decision)', () => {
    expect(onlineJobsAdapter.formAssistance.allowed).toBe(false);
    expect(onlineJobsAdapter.formAssistance.reason).toMatch(/never fills in or submits/);
  });

  it('no supported site currently allows form filling', () => {
    expect(SITE_ADAPTERS.filter((a) => a.formAssistance.allowed)).toEqual([]);
  });
});
