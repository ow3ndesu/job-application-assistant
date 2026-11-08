import { useState } from 'react';
import type { ApplicationDraft, SavedJob } from '@/core/schemas';
import type { Result } from '@/core/result';
import {
  APPLICATION_STATUS_LABEL,
  approveDraft,
  checkApproval,
  isApprovalCurrent,
  markCouldNotApply,
  markSubmittedByUser,
  reopenDraft,
  undoSubmitted,
  withdrawApproval,
} from '@/drafting/workflow';
import { findAdapter } from '@/sites/registry';
import { ConfirmButton, describeError } from '@/ui/components';
import { openExternal } from '@/ui/open-tab';
import { repos } from '@/ui/services';

const fmt = (iso: string) => new Date(iso).toLocaleString();

/**
 * Human-approved application step. The extension never fills or submits forms
 * on sites that don't allow it (OnlineJobs.ph): the user approves the exact
 * text, applies on the site themselves, and separately reports the outcome.
 */
export function ApplyPanel(props: {
  job: SavedJob;
  draft: ApplicationDraft;
  /** Unsaved edits in the draft editor. */
  dirty: boolean;
  onCopyAll: () => void;
  onChanged: () => void;
}) {
  const { job, draft } = props;
  const [reviewed, setReviewed] = useState(false);
  const [leaveBlank, setLeaveBlank] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const adapter = findAdapter(new URL(job.sourceUrl));
  const policy = adapter?.formAssistance ?? {
    allowed: false,
    reason: 'This site is not supported for form assistance. Apply on the site yourself.',
  };
  const check = checkApproval(draft);

  async function persist(result: Result<ApplicationDraft>) {
    setError(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    try {
      await repos.drafts.upsert(result.value);
      props.onChanged();
    } catch (e) {
      setError(describeError(e));
    }
  }

  return (
    <div className="apply-panel" data-testid="apply-panel" data-status={draft.status}>
      <h3>Apply</h3>
      <p>
        <span
          className={`badge ${draft.status === 'approved' ? 'ok' : draft.status === 'failed' ? 'err' : ''}`}
          data-testid="application-status"
        >
          {APPLICATION_STATUS_LABEL[draft.status]}
        </span>
      </p>
      <p className="muted small" data-testid="form-policy">
        {policy.reason}
      </p>

      {(draft.status === 'draft' || draft.status === 'needs_review') && (
        <div className="approve-step">
          {props.dirty && (
            <p className="message info small">Save your changes before marking the draft ready.</p>
          )}
          <label className="toggle small">
            <input
              type="checkbox"
              name="ack-reviewed"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            <span>
              I reviewed the message and every answer, and they are true and how I want to present
              myself.
            </span>
          </label>
          {check.blankAnswers > 0 && (
            <label className="toggle small">
              <input
                type="checkbox"
                name="ack-leave-blank"
                checked={leaveBlank}
                onChange={(e) => setLeaveBlank(e.target.checked)}
              />
              <span>
                Leave {check.blankAnswers} question(s) unanswered. Sensitive questions are yours to
                answer or skip.
              </span>
            </label>
          )}
          <button
            type="button"
            className="primary"
            data-testid="approve"
            disabled={props.dirty || check.blockers.length > 0}
            onClick={() =>
              void persist(
                approveDraft(draft, { reviewed, leaveBlankConfirmed: leaveBlank }, new Date()),
              )
            }
          >
            Mark ready to use
          </button>
          {check.blockers.map((b) => (
            <p key={b} className="muted small">
              {b}
            </p>
          ))}
        </div>
      )}

      {draft.status === 'approved' && (
        <div className="approved-step">
          <p className="small">
            Approved {draft.approvedAt ? fmt(draft.approvedAt) : ''}.{' '}
            {isApprovalCurrent(draft)
              ? 'The text has not changed since.'
              : 'The text changed since approval.'}
          </p>
          <ol className="small manual-steps">
            <li>Copy your application.</li>
            <li>
              Open the job post, log in to the site, and paste it into the application form
              yourself.
            </li>
            <li>Submit it on the site, then come back and record it below.</li>
          </ol>
          <div className="button-row">
            <button type="button" onClick={props.onCopyAll}>
              Copy all
            </button>
            <button
              type="button"
              data-testid="open-job-post"
              onClick={() => openExternal(job.sourceUrl)}
            >
              Open job post to apply
            </button>
          </div>
          <div className="button-row">
            <ConfirmButton
              label="I submitted this on the site"
              confirmLabel="Yes, I submitted it myself"
              testId="mark-submitted"
              onConfirm={() => persist(markSubmittedByUser(draft, new Date()))}
            />
            <button
              type="button"
              data-testid="withdraw"
              onClick={() => void persist(withdrawApproval(draft, new Date()))}
            >
              Withdraw approval
            </button>
          </div>
        </div>
      )}

      {draft.status === 'submitted' && (
        <div className="submitted-step">
          <p className="message info small" data-testid="submitted-note">
            You reported submitting this application on{' '}
            {draft.submittedAt ? fmt(draft.submittedAt) : 'an unknown date'}. The extension cannot
            see the site, so whether it was received is <strong>unconfirmed</strong>. Check your
            messages on the site.
          </p>
          <button
            type="button"
            data-testid="undo-submitted"
            onClick={() => void persist(undoSubmitted(draft, new Date()))}
          >
            Undo: I didn&apos;t submit it
          </button>
        </div>
      )}

      {draft.status === 'failed' && (
        <div>
          <p className="small">
            Marked as couldn&apos;t apply{draft.outcomeNote ? `: ${draft.outcomeNote}` : '.'}
          </p>
          <button type="button" onClick={() => void persist(reopenDraft(draft, new Date()))}>
            Reopen draft
          </button>
        </div>
      )}

      {draft.status !== 'submitted' && draft.status !== 'failed' && (
        <details className="small could-not-apply">
          <summary>Couldn&apos;t apply?</summary>
          <label className="block">
            Note (optional)
            <input
              type="text"
              name="outcome-note"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={() => void persist(markCouldNotApply(draft, note, new Date()))}
          >
            Mark as couldn&apos;t apply
          </button>
        </details>
      )}

      {error && (
        <p className="message error small" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
