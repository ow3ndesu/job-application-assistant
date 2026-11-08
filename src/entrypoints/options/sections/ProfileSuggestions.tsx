import { useCallback, useState } from 'react';
import { randomIds } from '@/core/domain';
import type { ApplicantProfile, ProfileProposal, ProposalSource } from '@/core/schemas';
import { collectCandidates } from '@/profile-updates/candidates';
import { lineDiff, listSections } from '@/profile-updates/markdown';
import type { RejectedAddition } from '@/profile-updates/verify';
import {
  createUserProposal,
  decideProposal,
  editProposal,
  markApplied,
  previewAccepted,
} from '@/profile-updates/workflow';
import { sendToBackground } from '@/ui/background-client';
import { describeError, ErrorNotice } from '@/ui/components';
import { repos } from '@/ui/services';
import { useResource } from '@/ui/useResource';

const DEFAULT_SECTION = 'Additional information';
const fmt = (iso: string) => new Date(iso).toLocaleString();

const loadSuggestions = async () => {
  const [proposals, drafts, matches, jobs] = await Promise.all([
    repos.profileProposals.list(),
    repos.drafts.list(),
    repos.matches.list(),
    repos.jobs.list(),
  ]);
  return {
    proposals: proposals.items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    drafts: drafts.items,
    matches: matches.items,
    jobs: jobs.items,
  };
};

/**
 * Profile improvement proposals (T10). Facts come only from the user's own
 * words or explicit confirmation; nothing is written to the profile until the
 * user reviews a diff and saves a new version.
 */
export function ProfileSuggestions(props: {
  profile: ApplicantProfile | null;
  onProfileChanged: () => void;
}) {
  const { state, reload } = useResource(loadSuggestions);
  const [notes, setNotes] = useState('');
  const [section, setSection] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; detail?: string | undefined } | null>(null);
  const [rejected, setRejected] = useState<RejectedAddition[]>([]);
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [reviewing, setReviewing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const profile = props.profile;
  const sections = profile
    ? listSections(profile.content)
        .filter((s) => s.level >= 2)
        .map((s) => s.title)
    : [];

  const save = useCallback(
    async (items: ProfileProposal[]) => {
      setError(null);
      try {
        await repos.profileProposals.upsertMany(items);
        reload();
      } catch (e) {
        setError({ message: describeError(e) });
      }
    },
    [reload],
  );

  function propose(
    text: string,
    source: ProposalSource,
    targetSection = section || DEFAULT_SECTION,
  ) {
    const r = createUserProposal({ section: targetSection, text, source }, new Date(), randomIds);
    if (!r.ok) {
      setError({ message: r.error });
      return;
    }
    void save([r.value]);
  }

  async function suggestWithAI() {
    setBusy(true);
    setError(null);
    setRejected([]);
    const r = await sendToBackground({ type: 'ai/propose-profile-additions', notes });
    setBusy(false);
    if (!r.ok) {
      setError({ message: r.error.message, detail: r.error.detail });
      return;
    }
    setRejected(r.rejected);
    setNotice(`${r.proposals.length} suggestion(s) added below for your review.`);
    reload();
  }

  if (!profile) {
    return (
      <div className="profile-suggestions">
        <h3>Improve your profile</h3>
        <p className="muted small">Save a profile first.</p>
      </div>
    );
  }
  if (state.status !== 'ready') return null;

  const { proposals } = state.data;
  const usedKeys = new Set(
    proposals.flatMap((p) => p.sources.map((s) => s.ref).filter((r): r is string => !!r)),
  );
  const candidates = collectCandidates({
    profileContent: profile.content,
    drafts: state.data.drafts,
    matches: state.data.matches,
    jobs: state.data.jobs,
    usedKeys,
  });
  const open = proposals.filter((p) => p.status === 'pending' || p.status === 'accepted');
  const done = proposals.filter((p) => p.status === 'applied' || p.status === 'rejected');
  const preview = previewAccepted(profile.content, proposals);

  async function applyAccepted() {
    if (!profile || preview.used.length === 0) return;
    setError(null);
    try {
      const saved = await repos.profile.saveContent(preview.content);
      const now = new Date();
      await repos.profileProposals.upsertMany(
        preview.used.map((p) => markApplied(p, saved.version, now)),
      );
      setReviewing(false);
      setNotice(
        `Saved as profile version ${saved.version}. Version ${profile.version} is kept under "Previous versions".`,
      );
      reload();
      props.onProfileChanged();
    } catch (e) {
      setError({ message: describeError(e) });
    }
  }

  return (
    <div className="profile-suggestions" data-testid="profile-suggestions">
      <h3>Improve your profile</h3>
      <p className="muted small">
        Add facts in your own words. Nothing changes in your profile until you review the changes
        and save a new version.
      </p>

      <label className="block">
        Tell us more about yourself
        <textarea
          name="profile-notes"
          rows={3}
          value={notes}
          placeholder="e.g. I also used HubSpot for about a year at my last job."
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <div className="inline-form">
        <label>
          Add under
          <input
            list="profile-sections"
            name="proposal-section"
            value={section}
            placeholder={sections[0] ?? DEFAULT_SECTION}
            onChange={(e) => setSection(e.target.value)}
          />
          <datalist id="profile-sections">
            {sections.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <button
          type="button"
          data-testid="add-as-written"
          disabled={!notes.trim()}
          onClick={() => {
            propose(
              notes,
              {
                kind: 'user_note',
                label: 'What you wrote',
                quote: notes.trim(),
                at: new Date().toISOString(),
              },
              section || sections[0] || DEFAULT_SECTION,
            );
            setNotes('');
          }}
        >
          Add as written
        </button>
        <button
          type="button"
          data-testid="suggest-ai"
          disabled={!notes.trim() || busy}
          onClick={() => void suggestWithAI()}
        >
          {busy ? 'Suggesting…' : 'Suggest additions with AI'}
        </button>
      </div>
      <p className="muted small">
        AI suggestions send your profile and this text to Anthropic. They can only rephrase what you
        wrote; anything with numbers or credentials you didn&apos;t write is dropped.
      </p>
      {error && <ErrorNotice message={error.message} detail={error.detail} />}
      {rejected.length > 0 && (
        <details className="small" open data-testid="ai-rejected">
          <summary>Not suggested ({rejected.length})</summary>
          <ul>
            {rejected.map((r) => (
              <li key={r.text}>
                {r.text}: <span className="muted">{r.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {candidates.ownAnswers.length > 0 && (
        <>
          <h4>From answers you wrote</h4>
          <ul className="rows" data-testid="own-answers">
            {candidates.ownAnswers.map((c) => (
              <li key={c.key} className="row">
                <span className="small">
                  <strong>{c.question}</strong> {c.answer}
                  <br />
                  <span className="muted">{c.label}</span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    propose(
                      c.answer,
                      {
                        kind: 'draft_answer',
                        label: c.label,
                        quote: c.answer,
                        at: c.at,
                        ref: c.key,
                      },
                      DEFAULT_SECTION,
                    )
                  }
                >
                  Use
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {candidates.unconfirmedClaims.length > 0 && (
        <>
          <h4>Is this true about you?</h4>
          <p className="muted small">
            The AI said these, but your profile doesn&apos;t. They are added only if you confirm
            them.
          </p>
          <ul className="rows" data-testid="unconfirmed-claims">
            {candidates.unconfirmedClaims.map((c) => (
              <li key={c.key} className="row" data-claim-key={c.key}>
                <label className="toggle small">
                  <input
                    type="checkbox"
                    checked={!!confirmed[c.key]}
                    onChange={(e) =>
                      setConfirmed((prev) => ({ ...prev, [c.key]: e.target.checked }))
                    }
                  />
                  <span>
                    {c.claim}
                    <br />
                    <span className="muted">{c.label}. Tick only if it is true.</span>
                  </span>
                </label>
                <span className="actions">
                  <button
                    type="button"
                    disabled={!confirmed[c.key]}
                    onClick={() =>
                      propose(
                        c.claim,
                        {
                          kind: 'confirmed_claim',
                          label: `${c.label}; you confirmed it is true`,
                          quote: c.claim,
                          at: new Date().toISOString(),
                          ref: c.key,
                        },
                        DEFAULT_SECTION,
                      )
                    }
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const r = createUserProposal(
                        {
                          section: DEFAULT_SECTION,
                          text: c.claim,
                          source: {
                            kind: 'confirmed_claim',
                            label: `${c.label}; dismissed by you`,
                            quote: c.claim,
                            at: new Date().toISOString(),
                            ref: c.key,
                          },
                        },
                        new Date(),
                        randomIds,
                      );
                      if (r.ok)
                        void save([
                          { ...r.value, status: 'rejected', decidedAt: new Date().toISOString() },
                        ]);
                    }}
                  >
                    Not true
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h4>Proposed changes ({open.length})</h4>
      {open.length === 0 ? (
        <p className="muted small">No proposed changes.</p>
      ) : (
        <ul className="rows" data-testid="proposals">
          {open.map((p) => (
            <ProposalRow
              key={p.id + p.status + (p.decidedAt ?? '')}
              proposal={p}
              onSave={(next) => void save([next])}
            />
          ))}
        </ul>
      )}

      {preview.used.length > 0 && !reviewing && (
        <button
          type="button"
          className="primary"
          data-testid="review-changes"
          onClick={() => setReviewing(true)}
        >
          Review {preview.used.length} accepted change(s)
        </button>
      )}
      {reviewing && (
        <div className="diff-review" data-testid="diff-review">
          <p className="small">Your profile after these changes (green = added):</p>
          <pre className="diff">
            {lineDiff(profile.content, preview.content).map((l, i) => (
              <span key={i} className={`diff-${l.type}`}>
                {l.type === 'add' ? '+ ' : l.type === 'remove' ? '- ' : '  '}
                {l.text}
                {'\n'}
              </span>
            ))}
          </pre>
          {preview.duplicates.length > 0 && (
            <p className="muted small">
              Skipped (already in your profile): {preview.duplicates.map((d) => d.text).join('; ')}
            </p>
          )}
          <div className="button-row">
            <button
              type="button"
              className="primary"
              data-testid="apply-changes"
              onClick={() => void applyAccepted()}
            >
              Save as new profile version
            </button>
            <button type="button" onClick={() => setReviewing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {notice && (
        <p className="message success small" role="status">
          {notice}
        </p>
      )}

      {done.length > 0 && (
        <details className="small">
          <summary>Past decisions ({done.length})</summary>
          <ul data-testid="past-proposals">
            {done.map((p) => (
              <li key={p.id}>
                {p.status === 'applied'
                  ? `Added in version ${p.appliedToVersion ?? '?'}`
                  : 'Rejected'}
                : {p.text}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ProposalRow(props: { proposal: ProfileProposal; onSave: (p: ProfileProposal) => void }) {
  const p = props.proposal;
  const [section, setSection] = useState(p.section);
  const [text, setText] = useState(p.text);
  const [error, setError] = useState<string | null>(null);
  const changed = section !== p.section || text !== p.text;
  const now = () => new Date();

  const apply = (r: ReturnType<typeof decideProposal>) => {
    if (r.ok) props.onSave(r.value);
    else setError(r.error);
  };

  return (
    <li className="row proposal" data-proposal-status={p.status}>
      <span className="proposal-main">
        <span className="inline-form">
          <label>
            Section
            <input
              name="proposal-row-section"
              value={section}
              onChange={(e) => setSection(e.target.value)}
            />
          </label>
          <label className="grow">
            Text to add
            <input
              name="proposal-row-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
        </span>
        <span className="small muted">
          {p.status === 'accepted' ? 'Accepted' : 'Waiting for your decision'} ·{' '}
          {p.phrasedBy === 'ai' ? 'phrased by AI from your words' : 'your wording'}
        </span>
        <ul className="small source-notes">
          {p.sources.map((s) => (
            <li key={s.quote + s.at}>
              Source: {s.label} ({fmt(s.at)}): “{s.quote}”
            </li>
          ))}
        </ul>
        {error && <span className="message error small">{error}</span>}
      </span>
      <span className="actions">
        {changed ? (
          <button type="button" onClick={() => apply(editProposal(p, { section, text }, now()))}>
            Save edit
          </button>
        ) : (
          p.status !== 'accepted' && (
            <button
              type="button"
              data-testid="accept-proposal"
              onClick={() => apply(decideProposal(p, 'accepted', now()))}
            >
              Accept
            </button>
          )
        )}
        <button
          type="button"
          data-testid="reject-proposal"
          onClick={() => apply(decideProposal(p, 'rejected', now()))}
        >
          Reject
        </button>
      </span>
    </li>
  );
}
