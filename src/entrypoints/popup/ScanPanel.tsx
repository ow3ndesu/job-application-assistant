import { useRef, useState } from 'react';
import type { SavedJob, ScanRecord } from '@/core/schemas';
import { runScan, SCAN_PHASE_TEXT, type ScanPhase } from '@/scan/run-scan';
import { captureActiveTab } from '@/sites/capture';
import { extractPage, findAdapter } from '@/sites/registry';
import { JobLink } from '@/ui/JobLink';
import { openExternal, openJobsPage } from '@/ui/open-tab';
import { clock, ids, repos } from '@/ui/services';
import { useResource } from '@/ui/useResource';

const PREVIEW_COUNT = 8;

type State =
  | { phase: 'idle' }
  | { phase: 'running'; step: ScanPhase }
  | { phase: 'done'; record: ScanRecord; jobs: SavedJob[] };

const loadSearchShortcuts = async () => {
  const [keywords, sites] = await Promise.all([
    repos.searchKeywords.get(),
    repos.targetSites.list(),
  ]);
  const shortcuts: { label: string; url: string }[] = [];
  for (const site of sites.items.filter((s) => s.enabled)) {
    const adapter = findAdapter(new URL(site.url));
    if (!adapter?.searchUrl) continue;
    for (const k of keywords.include) {
      shortcuts.push({ label: `${k} · ${site.label}`, url: adapter.searchUrl(k).href });
    }
  }
  return { shortcuts, keywords };
};

function summary(record: ScanRecord): string {
  const c = record.counts;
  if (record.pageStatus !== 'ok') return record.message ?? 'Nothing was saved.';
  const parts = [`Found ${c.found} job${c.found === 1 ? '' : 's'}`, `saved ${c.saved}`];
  const detail = [
    c.new && `${c.new} new`,
    c.updated && `${c.updated} updated`,
    c.unchanged && `${c.unchanged} already saved`,
  ].filter(Boolean);
  return `${parts.join(', ')}${detail.length ? ` (${detail.join(', ')})` : ''}.`;
}

export function ScanPanel() {
  const { state: shortcuts } = useResource(loadSearchShortcuts);
  const [state, setState] = useState<State>({ phase: 'idle' });
  const [showAll, setShowAll] = useState(false);
  const controller = useRef<AbortController | null>(null);

  async function scan() {
    const ac = new AbortController();
    controller.current = ac;
    setShowAll(false);
    setState({ phase: 'running', step: 'reading_page' });
    const outcome = await runScan(
      { capture: captureActiveTab, extract: extractPage, repos, clock, ids },
      { signal: ac.signal, onPhase: (step) => setState({ phase: 'running', step }) },
    );
    controller.current = null;
    setState({ phase: 'done', record: outcome.record, jobs: outcome.jobs });
  }

  const record = state.phase === 'done' ? state.record : null;
  const jobs = state.phase === 'done' ? state.jobs : [];

  return (
    <section className="page-check" aria-label="Scan this tab">
      {shortcuts.status === 'ready' && shortcuts.data.shortcuts.length > 0 && (
        <details className="small search-shortcuts">
          <summary>Search by your keywords</summary>
          <ul>
            {shortcuts.data.shortcuts.map((s) => (
              <li key={s.url}>
                <button type="button" className="link-button" onClick={() => openExternal(s.url)}>
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
          <p className="muted">Opens the site&apos;s search in a new tab. Then scan that tab.</p>
        </details>
      )}
      {shortcuts.status === 'ready' && shortcuts.data.keywords.include.length === 0 && (
        <p className="muted small">
          No keywords set: every job on a page is saved. Add keywords in Settings to filter.
        </p>
      )}

      <div className="button-row">
        <button
          type="button"
          className="primary"
          onClick={() => void scan()}
          disabled={state.phase === 'running'}
        >
          {state.phase === 'running' ? 'Scanning…' : 'Scan this tab'}
        </button>
        {state.phase === 'running' && (
          <button type="button" onClick={() => controller.current?.abort()}>
            Cancel
          </button>
        )}
      </div>
      <p className="muted small">
        Reads only the page open in this tab and saves matching jobs on this device.
      </p>

      {state.phase === 'running' && (
        <p className="message info" role="status" data-testid="scan-progress">
          {SCAN_PHASE_TEXT[state.step]}
        </p>
      )}

      {record && (
        <div data-testid="scan-result" data-status={record.pageStatus}>
          <p
            className={`message ${record.pageStatus === 'ok' ? 'success' : record.pageStatus === 'no_results' || record.pageStatus === 'cancelled' ? 'info' : 'error'}`}
            role="status"
          >
            {record.siteLabel ? `${record.siteLabel}: ` : ''}
            {summary(record)}
          </p>
          {record.pageStatus === 'ok' && record.message && (
            <p className="muted small">{record.message}</p>
          )}
          {jobs.length > 0 && (
            <>
              <ul className="job-preview">
                {(showAll ? jobs : jobs.slice(0, PREVIEW_COUNT)).map((job) => (
                  <li key={job.id}>
                    <JobLink url={job.sourceUrl}>
                      <strong>{job.title}</strong>
                    </JobLink>
                    <span className="muted small">
                      {' '}
                      · {job.compensation ?? 'pay not stated'}
                      {job.employmentType ? ` · ${job.employmentType}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
              {jobs.length > PREVIEW_COUNT && (
                <button type="button" className="link-button" onClick={() => setShowAll((v) => !v)}>
                  {showAll
                    ? 'Show fewer'
                    : `Show all ${jobs.length} (${jobs.length - PREVIEW_COUNT} more)`}
                </button>
              )}
            </>
          )}
        </div>
      )}

      <p>
        <button type="button" className="link-button" onClick={openJobsPage}>
          Open saved jobs →
        </button>
      </p>
    </section>
  );
}
