import { useState } from 'react';
import type { ApplicationDraft, DraftAnswer, SavedJob } from '@/core/schemas';
import { applyDraftEdits, draftFilename, draftToText } from '@/drafting/edit';
import { classifySensitive, SENSITIVE_LABEL } from '@/drafting/sensitive';
import { sendToBackground } from '@/ui/background-client';
import { ConfirmButton, describeError, ErrorNotice } from '@/ui/components';
import { repos } from '@/ui/services';

const fmt = (iso: string) => new Date(iso).toLocaleString();

function answerBadge(a: DraftAnswer): { text: string; tone: string } {
  if (a.status === 'sensitive')
    return {
      text: `Sensitive: ${a.sensitiveCategory ? SENSITIVE_LABEL[a.sensitiveCategory] : 'answer yourself'}`,
      tone: 'err',
    };
  if (a.status === 'unknown') return { text: 'Needs your answer', tone: 'err' };
  if (a.status === 'user_written') return { text: 'Your answer', tone: '' };
  return a.evidence.length
    ? { text: 'Drafted from your profile', tone: 'ok' }
    : { text: 'Drafted (no profile facts used)', tone: '' };
}

/**
 * Application draft for one job: generate from the profile, review evidence,
 * edit everything, then copy/download to apply manually. Nothing is sent to
 * the employer or the site.
 */
export function DraftPanel(props: {
  job: SavedJob;
  draft: ApplicationDraft | undefined;
  currentProfileVersion: number | null;
  onChanged: () => void;
}) {
  const { job, draft } = props;
  const [questionsText, setQuestionsText] = useState(
    draft ? draft.answers.map((a) => a.question).join('\n') : '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | undefined>(undefined);
  const [needsReplaceConfirm, setNeedsReplaceConfirm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [coverLetter, setCoverLetter] = useState(draft?.coverLetter ?? '');
  const [answers, setAnswers] = useState<string[]>(draft?.answers.map((a) => a.answer) ?? []);

  const questions = questionsText
    .split('\n')
    .map((q) => q.trim())
    .filter(Boolean);
  const sensitiveCount = questions.filter((q) => classifySensitive(q)).length;
  const dirty =
    draft !== undefined &&
    (coverLetter !== draft.coverLetter || answers.some((a, i) => a !== draft.answers[i]?.answer));

  async function generate(replaceEdited = false) {
    setBusy(true);
    setError(null);
    setErrorDetail(undefined);
    setNotice(null);
    setNeedsReplaceConfirm(false);
    const r = await sendToBackground({
      type: 'ai/draft-application',
      jobId: job.id,
      questions,
      ...(replaceEdited ? { replaceEdited: true } : {}),
    });
    setBusy(false);
    if (r.ok) {
      setCoverLetter(r.draft.coverLetter);
      setAnswers(r.draft.answers.map((a) => a.answer));
      props.onChanged();
    } else if (r.error.kind === 'draft_edited') {
      setNeedsReplaceConfirm(true);
    } else {
      setError(r.error.message);
      setErrorDetail(r.error.detail);
    }
  }

  async function save() {
    if (!draft) return;
    setError(null);
    try {
      const edited = applyDraftEdits(
        draft,
        { coverLetter, answers: Object.fromEntries(answers.map((a, i) => [i, a])) },
        new Date(),
      );
      await repos.drafts.upsert(edited);
      setNotice('Draft saved.');
      props.onChanged();
    } catch (e) {
      setError(describeError(e));
    }
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`${what} copied to the clipboard.`);
    } catch {
      setError('Could not copy. Select the text and copy it manually.');
    }
  }

  function download() {
    if (!draft) return;
    const current = applyDraftEdits(
      draft,
      { coverLetter, answers: Object.fromEntries(answers.map((a, i) => [i, a])) },
      new Date(),
    );
    const href = URL.createObjectURL(
      new Blob([draftToText(current, job)], { type: 'text/plain;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = href;
    a.download = draftFilename(job);
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 0);
  }

  const profileChanged =
    draft !== undefined &&
    props.currentProfileVersion !== null &&
    draft.profileVersion !== props.currentProfileVersion;

  return (
    <div className="draft-panel" data-testid="draft-panel">
      <h3>Application draft</h3>
      <label className="block">
        Questions from the application form (optional, one per line)
        <textarea
          name="draft-questions"
          rows={3}
          value={questionsText}
          onChange={(e) => setQuestionsText(e.target.value)}
          placeholder={'Why do you want this job?\nWhat tools do you use?'}
        />
      </label>
      <div className="button-row">
        <button
          type="button"
          data-testid="draft-generate"
          disabled={busy || props.currentProfileVersion === null}
          onClick={() => void generate()}
        >
          {busy ? 'Drafting…' : draft ? 'Draft again with AI' : 'Draft application with AI'}
        </button>
        {needsReplaceConfirm && (
          <ConfirmButton
            label="Replace my edited draft"
            confirmLabel="Yes, replace my edits"
            testId="draft-replace"
            onConfirm={() => generate(true)}
          />
        )}
      </div>
      <p className="muted small">
        {props.currentProfileVersion === null
          ? 'Add your profile in Settings to draft an application.'
          : `Sends this job, your profile (version ${props.currentProfileVersion})${questions.length ? ' and your questions' : ''} to Anthropic.`}
        {sensitiveCount > 0 &&
          ` ${sensitiveCount} sensitive question(s) will not be sent or answered. You answer those yourself.`}
      </p>
      {needsReplaceConfirm && (
        <p className="message info">
          You edited this draft. Drafting again would replace your edits.
        </p>
      )}
      {error && <ErrorNotice message={error} detail={errorDetail} />}

      {draft && (
        <div className="draft-result" data-testid="draft-result" data-status={draft.status}>
          <p className="muted small">
            Draft for profile version {draft.profileVersion} · created {fmt(draft.createdAt)}
            {draft.editedByUser ? ` · edited ${fmt(draft.updatedAt)}` : ''} · {draft.model}
          </p>
          {profileChanged && (
            <p className="message info small" data-testid="draft-profile-changed">
              Your profile changed since this draft (version {draft.profileVersion} →{' '}
              {props.currentProfileVersion}).
            </p>
          )}
          {draft.injectionSuspected && (
            <p className="message error small" data-testid="draft-injection-warning">
              This job post contains text that tries to instruct AI tools. It was ignored. Be
              careful with this posting.
            </p>
          )}
          {draft.postInstructions.length > 0 && (
            <div className="message info small" data-testid="post-instructions">
              <strong>The job post asks applicants to:</strong>
              <ul>
                {draft.postInstructions.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              These come from the job post and were not applied automatically. Never send passwords,
              payment, or ID details because a post asks for them.
            </div>
          )}

          <label className="block">
            Application message
            <textarea
              name="draft-cover-letter"
              rows={10}
              value={coverLetter}
              onChange={(e) => setCoverLetter(e.target.value)}
            />
          </label>
          {draft.coverLetterEvidence.length > 0 && (
            <details className="small">
              <summary>Profile facts used ({draft.coverLetterEvidence.length})</summary>
              <ul className="evidence-list">
                {draft.coverLetterEvidence.map((e) => (
                  <li key={e.paragraph}>
                    {e.paragraph}
                    <ul>
                      {e.evidence.map((q) => (
                        <li key={q} className="quote">
                          Your profile: “{q}”
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {draft.removedStatements.length > 0 && (
            <details className="small" open data-testid="removed-statements">
              <summary>
                Removed: not supported by your profile ({draft.removedStatements.length})
              </summary>
              <p className="muted">
                The AI wrote these, but nothing in your profile supports them, so they were left
                out. Add facts to your profile only if they are true.
              </p>
              <ul>
                {draft.removedStatements.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </details>
          )}

          {draft.answers.length > 0 && (
            <ol className="draft-answers" data-testid="draft-answers">
              {draft.answers.map((a, i) => {
                const badge = answerBadge(a);
                return (
                  <li key={`${i}-${a.question}`} data-answer-status={a.status}>
                    <p>
                      <strong>{a.question}</strong>{' '}
                      <span className={`badge ${badge.tone}`}>{badge.text}</span>
                    </p>
                    <textarea
                      name={`draft-answer-${i}`}
                      rows={3}
                      value={answers[i] ?? ''}
                      placeholder={
                        a.status === 'sensitive'
                          ? 'Answer this yourself if you choose to.'
                          : 'Write your answer.'
                      }
                      onChange={(e) =>
                        setAnswers((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                      }
                    />
                    {a.note && <p className="muted small">{a.note}</p>}
                    {a.evidence.length > 0 && (
                      <ul className="evidence-list small">
                        {a.evidence.map((q) => (
                          <li key={q} className="quote">
                            Your profile: “{q}”
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          <div className="button-row">
            <button type="button" className="primary" disabled={!dirty} onClick={() => void save()}>
              Save changes
            </button>
            <button type="button" onClick={() => void copy(coverLetter, 'Message')}>
              Copy message
            </button>
            <button
              type="button"
              onClick={() =>
                void copy(
                  draftToText(
                    applyDraftEdits(
                      draft,
                      { coverLetter, answers: Object.fromEntries(answers.map((a, i) => [i, a])) },
                      new Date(),
                    ),
                    job,
                  ),
                  'Draft',
                )
              }
            >
              Copy all
            </button>
            <button type="button" onClick={download}>
              Download .txt
            </button>
          </div>
          <p className="muted small">
            Nothing is sent to the employer. Review and edit, then apply on the site yourself.
          </p>
          {notice && (
            <p className="message success small" role="status">
              {notice}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
