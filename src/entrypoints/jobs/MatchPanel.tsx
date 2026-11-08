import { useState } from 'react';
import type { JobMatch, SavedJob } from '@/core/schemas';
import { sendToBackground } from '@/ui/background-client';
import { ErrorNotice } from '@/ui/components';

const fmt = (iso: string) => new Date(iso).toLocaleString();

function band(score: number): string {
  if (score >= 75) return 'likely a strong fit';
  if (score >= 50) return 'possibly a fit';
  if (score >= 25) return 'a weak fit';
  return 'unlikely to fit';
}

/**
 * AI fit check for one job. The score is always shown as an estimate; only
 * strengths with verified profile quotes are shown as facts.
 */
export function MatchPanel(props: {
  job: SavedJob;
  latest: JobMatch | undefined;
  currentProfileVersion: number | null;
  onMatched: (match: JobMatch) => void;
}) {
  const { job, latest } = props;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; detail?: string | undefined } | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const r = await sendToBackground({ type: 'ai/match-job', jobId: job.id });
    setBusy(false);
    if (r.ok) props.onMatched(r.match);
    else setError({ message: r.error.message, detail: r.error.detail });
  }

  const profileChanged =
    latest !== undefined &&
    props.currentProfileVersion !== null &&
    latest.profileVersion !== props.currentProfileVersion;
  const jobChanged = latest !== undefined && latest.jobContentHash !== job.contentHash;

  return (
    <div className="match-panel" data-testid="match-panel">
      <div className="button-row">
        <button
          type="button"
          data-testid="check-fit"
          onClick={() => void run()}
          disabled={busy || props.currentProfileVersion === null}
        >
          {busy ? 'Checking…' : latest ? 'Check fit again' : 'Check fit with AI'}
        </button>
      </div>
      <p className="muted small">
        {props.currentProfileVersion === null
          ? 'Add your profile in Settings to check fit.'
          : `Sends this job's text and your profile (version ${props.currentProfileVersion}) to Anthropic to estimate the fit.`}
      </p>
      {error && <ErrorNotice message={error.message} detail={error.detail} />}

      {latest && (
        <div className="match-result" data-testid="match-result">
          <p className="match-score">
            <strong>Estimated fit: {latest.score}/100</strong>{' '}
            <span className="muted">({band(latest.score)})</span>
          </p>
          <p className="muted small">
            An AI estimate based only on what your profile says. It is not a prediction of how the
            employer will decide.
          </p>

          {(latest.injectionSuspected || latest.basedOnSnippet || profileChanged || jobChanged) && (
            <ul className="warnings">
              {latest.injectionSuspected && (
                <li className="message error" data-testid="injection-warning">
                  This job post contains text that tries to instruct AI tools. It was ignored, but
                  treat this posting with caution.
                </li>
              )}
              {latest.basedOnSnippet && (
                <li className="message info">
                  Based on the short preview only. Open and scan the job post for a fuller check.
                </li>
              )}
              {profileChanged && (
                <li className="message info" data-testid="profile-changed">
                  Your profile changed since this check (version {latest.profileVersion} →{' '}
                  {props.currentProfileVersion}). Check again to use the current version.
                </li>
              )}
              {jobChanged && (
                <li className="message info">The job post changed since this check.</li>
              )}
            </ul>
          )}

          <p>{latest.rationale}</p>

          <h3>Strengths (from your profile)</h3>
          {latest.strengths.length === 0 ? (
            <p className="muted small">
              No strengths could be confirmed with text from your profile.
            </p>
          ) : (
            <ul className="evidence-list" data-testid="strengths">
              {latest.strengths.map((s) => (
                <li key={s.claim}>
                  {s.claim}
                  <ul>
                    {s.evidence.map((q) => (
                      <li key={q} className="quote">
                        Your profile: “{q}”
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}

          {latest.gaps.length > 0 && (
            <>
              <h3>Missing requirements</h3>
              <ul data-testid="gaps">
                {latest.gaps.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </>
          )}

          {latest.uncertainties.length > 0 && (
            <>
              <h3>Uncertain</h3>
              <ul data-testid="uncertainties">
                {latest.uncertainties.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </>
          )}

          {latest.unsupportedClaims.length > 0 && (
            <>
              <h3>Not supported by your profile</h3>
              <p className="muted small">
                The AI suggested these, but they could not be matched to anything you wrote, so they
                are not treated as facts. Add them to your profile only if they are true.
              </p>
              <ul data-testid="unsupported">
                {latest.unsupportedClaims.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          )}

          <p className="muted small">
            Checked {fmt(latest.evaluatedAt)} · profile version {latest.profileVersion} ·{' '}
            {latest.model}
          </p>
        </div>
      )}
    </div>
  );
}
