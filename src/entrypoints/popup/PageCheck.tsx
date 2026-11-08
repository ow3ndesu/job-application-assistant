import { useState } from 'react';
import { CAPTURE_FAILURE_TEXT, captureActiveTab } from '@/sites/capture';
import { extractPage } from '@/sites/registry';
import { EXTRACTION_STATUS_TEXT, type ExtractionResult } from '@/sites/types';

type State =
  | { phase: 'idle' }
  | { phase: 'reading' }
  | { phase: 'failed'; message: string }
  | { phase: 'done'; site: string; result: ExtractionResult };

const PREVIEW_COUNT = 8;

/** Only https job links are opened (sourceUrl is already schema-validated as http(s)). */
function isSafeJobUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Opens the job post in a new tab next to the current one. */
function openJob(url: string) {
  if (isSafeJobUrl(url)) void browser.tabs.create({ url, active: true });
}

/** Reads the current tab with the matching site adapter. Nothing is saved yet (T06). */
export function PageCheck() {
  const [state, setState] = useState<State>({ phase: 'idle' });
  const [showAll, setShowAll] = useState(false);

  async function run() {
    setShowAll(false);
    setState({ phase: 'reading' });
    const capture = await captureActiveTab();
    if (!capture.ok) {
      setState({ phase: 'failed', message: CAPTURE_FAILURE_TEXT[capture.reason] });
      return;
    }
    const { adapter, result } = await extractPage(capture.snapshot);
    setState({ phase: 'done', site: adapter?.label ?? 'Unknown site', result });
  }

  return (
    <section className="page-check" aria-label="Read jobs from this tab">
      <button
        type="button"
        className="primary"
        onClick={() => void run()}
        disabled={state.phase === 'reading'}
      >
        {state.phase === 'reading' ? 'Reading…' : 'Read jobs from this tab'}
      </button>
      <p className="muted small">Reads only the page open in this tab. Nothing is sent anywhere.</p>

      {state.phase === 'failed' && (
        <p className="message error" role="alert">
          {state.message}
        </p>
      )}

      {state.phase === 'done' && (
        <div data-testid="page-check-result" data-status={state.result.status}>
          {state.result.status === 'ok' ? (
            <>
              <p className="message success" role="status">
                {state.site}: found {state.result.jobs.length} job
                {state.result.jobs.length === 1 ? '' : 's'} on this{' '}
                {state.result.pageKind === 'detail' ? 'job post' : 'page'}.
              </p>
              <ul className="job-preview">
                {(showAll ? state.result.jobs : state.result.jobs.slice(0, PREVIEW_COUNT)).map(
                  (job) => (
                    <li key={job.id}>
                      <a
                        href={job.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="Open this job post in a new tab"
                        onClick={(e) => {
                          e.preventDefault();
                          openJob(job.sourceUrl);
                        }}
                      >
                        <strong>{job.title}</strong>
                      </a>
                      <span className="muted small">
                        {' '}
                        · {job.compensation ?? 'pay not stated'}
                        {job.employmentType ? ` · ${job.employmentType}` : ''}
                      </span>
                    </li>
                  ),
                )}
              </ul>
              {state.result.jobs.length > PREVIEW_COUNT && (
                <button type="button" className="link-button" onClick={() => setShowAll((v) => !v)}>
                  {showAll
                    ? 'Show fewer'
                    : `Show all ${state.result.jobs.length} jobs (${state.result.jobs.length - PREVIEW_COUNT} more)`}
                </button>
              )}
              <p className="muted small">Jobs are not saved yet.</p>
            </>
          ) : (
            <p
              className={`message ${state.result.status === 'no_results' ? 'info' : 'error'}`}
              role="status"
            >
              {'reason' in state.result
                ? state.result.reason
                : EXTRACTION_STATUS_TEXT[state.result.status]}
            </p>
          )}
          <details className="small">
            <summary>Diagnostics</summary>
            <ul>
              <li>Adapter: {state.result.diagnostics.adapterId}</li>
              <li>Status: {state.result.status}</li>
              <li>Job cards seen: {state.result.diagnostics.candidates}</li>
              <li>Skipped: {state.result.diagnostics.skipped.length}</li>
              <li>Duplicates on page: {state.result.diagnostics.duplicatesOnPage}</li>
              {state.result.diagnostics.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </section>
  );
}
