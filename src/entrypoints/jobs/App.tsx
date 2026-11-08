import { useMemo, useState } from 'react';
import { APP_NAME } from '@/core/app-info';
import type {
  ApplicationDraft,
  JobMatch,
  SavedJob,
  ScanRecord,
  SearchKeywords,
  TargetSite,
} from '@/core/schemas';
import { applyKeywordFunnel, jobSearchText } from '@/core/use-cases/keyword-funnel';
import { ConfirmButton, describeError, LoadError, Message, Section } from '@/ui/components';
import { JobLink } from '@/ui/JobLink';
import { repos } from '@/ui/services';
import { useResource } from '@/ui/useResource';
import { DraftPanel } from './DraftPanel';
import { MatchPanel } from './MatchPanel';
import { APPLICATION_STATUS_LABEL } from '@/drafting/workflow';

const loadAll = async () => {
  const [jobs, scans, keywords, sites, matches, profile, drafts] = await Promise.all([
    repos.jobs.list(),
    repos.scans.list(),
    repos.searchKeywords.get(),
    repos.targetSites.list(),
    repos.matches.list(),
    repos.profile.getCurrent(),
    repos.drafts.list(),
  ]);
  const profileVersion = profile?.content.trim() ? profile.version : null;
  return {
    jobs,
    scans: scans.items,
    keywords,
    sites: sites.items,
    matches: latestMatches(matches.items, profileVersion),
    drafts: latestByProfileVersion(drafts.items, profileVersion),
    profileVersion,
  };
};

/** Per job: the draft for the current profile version if any, else the newest. */
function latestByProfileVersion(
  drafts: ApplicationDraft[],
  profileVersion: number | null,
): Map<string, ApplicationDraft> {
  const byJob = new Map<string, ApplicationDraft>();
  for (const d of [...drafts].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))) {
    const prev = byJob.get(d.jobId);
    const prevIsCurrent = prev?.profileVersion === profileVersion;
    if (!prev || !prevIsCurrent || d.profileVersion === profileVersion) byJob.set(d.jobId, d);
  }
  return byJob;
}

/** Per job: the match for the current profile version if any, else the newest. */
function latestMatches(matches: JobMatch[], profileVersion: number | null): Map<string, JobMatch> {
  const byJob = new Map<string, JobMatch>();
  for (const m of [...matches].sort((a, b) => a.evaluatedAt.localeCompare(b.evaluatedAt))) {
    const prev = byJob.get(m.jobId);
    const prevIsCurrent = prev?.profileVersion === profileVersion;
    if (!prev || !prevIsCurrent || m.profileVersion === profileVersion) byJob.set(m.jobId, m);
  }
  return byJob;
}

const fmt = (iso: string) => new Date(iso).toLocaleString();

export function App() {
  const { state, reload } = useResource(loadAll);

  return (
    <div className="options">
      <header>
        <h1>{APP_NAME} — Saved jobs</h1>
        <nav aria-label="Pages">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              void browser.runtime.openOptionsPage();
            }}
          >
            Settings
          </a>
          <a href="#history">Scan history</a>
        </nav>
      </header>
      {state.status === 'loading' && <p className="muted">Loading…</p>}
      {state.status === 'error' && (
        <LoadError
          error={state.error}
          onRecover={async () => {
            await repos.jobs.recover();
            await repos.scans.recover();
            reload();
          }}
        />
      )}
      {state.status === 'ready' && (
        <>
          <JobList
            jobs={state.data.jobs.items}
            invalidCount={state.data.jobs.invalid.length}
            keywords={state.data.keywords}
            sites={state.data.sites}
            matches={state.data.matches}
            drafts={state.data.drafts}
            profileVersion={state.data.profileVersion}
            onChanged={reload}
          />
          <ScanHistory scans={state.data.scans} />
        </>
      )}
    </div>
  );
}

function JobList(props: {
  jobs: SavedJob[];
  invalidCount: number;
  keywords: SearchKeywords;
  sites: TargetSite[];
  matches: Map<string, JobMatch>;
  drafts: Map<string, ApplicationDraft>;
  profileVersion: number | null;
  onChanged: () => void;
}) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [source, setSource] = useState('');
  const [matchingOnly, setMatchingOnly] = useState(false);
  /** '' = any, 'none' = no draft yet, otherwise a draft status. */
  const [application, setApplication] = useState('');
  const [error, setError] = useState<string | null>(null);

  const types = useMemo(
    () =>
      [...new Set(props.jobs.map((j) => j.employmentType).filter((t): t is string => !!t))].sort(),
    [props.jobs],
  );
  const sources = useMemo(() => [...new Set(props.jobs.map((j) => j.source))].sort(), [props.jobs]);
  const sourceLabel = (id: string) =>
    props.sites.find((s) => s.id === id)?.label ?? (id === 'onlinejobs-ph' ? 'OnlineJobs.ph' : id);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return props.jobs
      .filter((j) => !type || j.employmentType === type)
      .filter((j) => !source || j.source === source)
      .filter((j) => !q || jobSearchText(j).toLowerCase().includes(q))
      .filter((j) => !matchingOnly || applyKeywordFunnel(j, props.keywords).passes)
      .filter((j) => {
        if (!application) return true;
        const status = props.drafts.get(j.id)?.status;
        if (application === 'none') return status === undefined;
        if (application === 'draft') return status === 'draft' || status === 'needs_review';
        return status === application;
      })
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  }, [props.jobs, props.keywords, props.drafts, query, type, source, matchingOnly, application]);

  return (
    <Section
      id="jobs"
      title={`Jobs (${visible.length} of ${props.jobs.length})`}
      intro="Jobs saved from pages you scanned. Open a job post and scan it to get its full description."
    >
      {props.invalidCount > 0 && (
        <div className="message error" role="alert">
          <p>{props.invalidCount} saved job(s) could not be read.</p>
          <button
            type="button"
            onClick={async () => {
              await repos.jobs.discardInvalid();
              props.onChanged();
            }}
          >
            Set unreadable entries aside
          </button>
        </div>
      )}
      <div className="inline-form" role="search" aria-label="Filter jobs">
        <label>
          Search
          <input
            type="search"
            name="job-search"
            value={query}
            placeholder="Title, skill, description…"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          Type
          <select name="job-type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Any</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        {sources.length > 1 && (
          <label>
            Site
            <select name="job-source" value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">All</option>
              {sources.map((s) => (
                <option key={s} value={s}>
                  {sourceLabel(s)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Application
          <select
            name="application-status"
            value={application}
            onChange={(e) => setApplication(e.target.value)}
          >
            <option value="">Any</option>
            <option value="none">No draft yet</option>
            <option value="draft">Draft</option>
            <option value="approved">{APPLICATION_STATUS_LABEL.approved}</option>
            <option value="submitted">Applied (reported by you)</option>
            <option value="failed">{APPLICATION_STATUS_LABEL.failed}</option>
          </select>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            name="matching-only"
            checked={matchingOnly}
            onChange={(e) => setMatchingOnly(e.target.checked)}
          />
          <span>Only jobs matching my current keywords</span>
        </label>
      </div>

      {props.jobs.length === 0 ? (
        <p className="muted">
          No jobs saved yet. Open a job search page, click the extension icon, then “Scan this tab”.
        </p>
      ) : visible.length === 0 ? (
        <p className="muted">No saved jobs match these filters.</p>
      ) : (
        <ul className="rows" data-testid="job-list">
          {visible.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              keywords={props.keywords}
              sourceLabel={sourceLabel(job.source)}
              match={props.matches.get(job.id)}
              draft={props.drafts.get(job.id)}
              profileVersion={props.profileVersion}
              onMatched={props.onChanged}
              onRemove={async () => {
                setError(null);
                try {
                  await repos.jobs.remove(job.id);
                  props.onChanged();
                } catch (e) {
                  setError(describeError(e));
                }
              }}
            />
          ))}
        </ul>
      )}
      {error && <Message kind="error">{error}</Message>}
    </Section>
  );
}

function JobRow(props: {
  job: SavedJob;
  keywords: SearchKeywords;
  sourceLabel: string;
  match: JobMatch | undefined;
  draft: ApplicationDraft | undefined;
  profileVersion: number | null;
  onMatched: () => void;
  onRemove: () => Promise<void>;
}) {
  const { job } = props;
  const [open, setOpen] = useState(false);
  const current = applyKeywordFunnel(job, props.keywords);
  const snippet =
    job.description.length > 220 ? `${job.description.slice(0, 220)}…` : job.description;

  return (
    <li className="job-row" data-testid="job-row" data-job-id={job.id}>
      <div className="job-row-main">
        <JobLink url={job.sourceUrl} className="job-title">
          {job.title}
        </JobLink>
        <p className="muted small">
          {props.sourceLabel} · {job.compensation ?? 'pay not stated'}
          {job.employmentType ? ` · ${job.employmentType}` : ''}
          {job.postedAt ? ` · posted ${job.postedAt}` : ''}
          {` · first seen ${fmt(job.firstSeenAt)}`}
        </p>
        {(props.match || props.draft) && (
          <p className="small">
            {props.match && (
              <span className="badge" data-testid="fit-badge">
                Estimated fit {props.match.score}/100
              </span>
            )}
            {props.match?.injectionSuspected && <span className="badge err"> Suspicious post</span>}
            {props.draft && (
              <span
                className={`badge ${props.draft.status === 'approved' ? 'ok' : props.draft.status === 'failed' ? 'err' : ''}`}
                data-testid="application-badge"
              >
                {APPLICATION_STATUS_LABEL[props.draft.status]}
              </span>
            )}
          </p>
        )}
        {(current.matchedInclude.length > 0 || current.matchedExclude.length > 0) && (
          <ul className="chips" aria-label="Keyword matches">
            {current.matchedInclude.map((k) => (
              <li key={`i-${k}`} className="chip match">
                {k}
              </li>
            ))}
            {current.matchedExclude.map((k) => (
              <li key={`e-${k}`} className="chip exclude" title="Matches an exclusion">
                ✕ {k}
              </li>
            ))}
          </ul>
        )}
        {!open && <p className="snippet">{snippet}</p>}
        {open && (
          <div className="job-details" data-testid="job-details">
            {job.descriptionSource === 'listing_snippet' && (
              <p className="message info small">
                This is the short preview from the search page. Open the job post and scan it to
                save the full description.
              </p>
            )}
            <p className="full-text">{job.description}</p>
            {job.requirements.length > 0 && (
              <>
                <h3>Skills</h3>
                <ul className="chips">
                  {job.requirements.map((r) => (
                    <li key={r} className="chip">
                      {r}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {job.attributes && (
              <dl className="facts">
                {Object.entries(job.attributes).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="muted small">
              Source: <JobLink url={job.sourceUrl}>{job.sourceUrl}</JobLink>
              <br />
              First seen {fmt(job.firstSeenAt)} · last seen {fmt(job.lastSeenAt)}
            </p>
            <MatchPanel
              job={job}
              latest={props.match}
              currentProfileVersion={props.profileVersion}
              onMatched={props.onMatched}
            />
            <DraftPanel
              key={props.draft ? props.draft.id + props.draft.updatedAt : 'none'}
              job={job}
              draft={props.draft}
              currentProfileVersion={props.profileVersion}
              onChanged={props.onMatched}
            />
          </div>
        )}
      </div>
      <span className="actions">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? 'Hide details' : 'Details'}
        </button>
        <ConfirmButton label="Remove" confirmLabel="Remove job" onConfirm={props.onRemove} />
      </span>
    </li>
  );
}

const STATUS_LABEL: Record<ScanRecord['pageStatus'], string> = {
  ok: 'Saved',
  no_results: 'No jobs on page',
  login_required: 'Login required',
  blocked: 'Blocked / verification',
  unsupported_page: 'Unsupported page',
  structure_changed: 'Layout not recognised',
  site_not_enabled: 'Site not enabled',
  cannot_access: 'Could not read tab',
  cancelled: 'Cancelled',
  error: 'Error',
};

function ScanHistory(props: { scans: ScanRecord[] }) {
  const scans = [...props.scans].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return (
    <Section id="history" title="Scan history" intro="The 50 most recent scans, newest first.">
      {scans.length === 0 ? (
        <p className="muted">No scans yet.</p>
      ) : (
        <ul className="rows" data-testid="scan-history">
          {scans.map((s) => (
            <li key={s.id} className="row scan-row" data-status={s.pageStatus}>
              <span>
                <span
                  className={`badge ${s.pageStatus === 'ok' ? 'ok' : s.status === 'failed' ? 'err' : ''}`}
                >
                  {STATUS_LABEL[s.pageStatus]}
                </span>{' '}
                <strong>{s.siteLabel ?? 'Unknown site'}</strong>{' '}
                <span className="muted small">{fmt(s.startedAt)}</span>
                <br />
                {s.url && <span className="url">{s.url}</span>}
                {s.pageStatus === 'ok' && (
                  <span className="small">
                    <br />
                    Found {s.counts.found} · saved {s.counts.saved} ({s.counts.new} new,{' '}
                    {s.counts.updated} updated, {s.counts.unchanged} unchanged) · filtered out{' '}
                    {s.counts.filteredOut}
                    {s.counts.skipped ? ` · skipped ${s.counts.skipped}` : ''}
                  </span>
                )}
                {s.message && (
                  <span className="small muted">
                    <br />
                    {s.message}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
