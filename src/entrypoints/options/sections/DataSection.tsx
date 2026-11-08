import { useState } from 'react';
import { ConfirmButton, describeError, LoadError, Message, Section } from '@/ui/components';
import { dataManagement } from '@/ui/services';
import { useResource } from '@/ui/useResource';

const loadSummary = () => dataManagement.summary();

/** Delete/reset controls. `onChanged` lets the page refresh the other sections. */
export function DataSection(props: { onChanged: () => void }) {
  const { state, reload } = useResource(loadSummary);
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  async function run(action: () => Promise<void>, done: string) {
    setNotice(null);
    try {
      await action();
      setNotice({ kind: 'success', text: done });
    } catch (e) {
      setNotice({ kind: 'error', text: describeError(e) });
    } finally {
      reload();
      props.onChanged();
    }
  }

  const s = state.status === 'ready' ? state.data : null;

  return (
    <Section
      id="data"
      title="Your data"
      intro="Everything is stored locally in this browser profile. Deleting cannot be undone."
    >
      {state.status === 'error' && <LoadError error={state.error} />}
      <ul className="rows" data-testid="data-controls">
        <li className="row">
          <span>Applicant profile{s && ` · ${s.profileVersions} version(s)`}</span>
          <ConfirmButton
            label="Delete profile"
            confirmLabel="Delete profile and all versions"
            testId="delete-profile"
            onConfirm={() => run(dataManagement.deleteProfile, 'Profile deleted.')}
          />
        </li>
        <li className="row">
          <span>
            Saved jobs, match results and scan history
            {s && ` · ${s.jobs} job(s), ${s.matches} match(es)`}
          </span>
          <ConfirmButton
            label="Delete jobs"
            confirmLabel="Delete jobs, matches and history"
            testId="delete-jobs"
            onConfirm={() => run(dataManagement.deleteJobs, 'Jobs and matches deleted.')}
          />
        </li>
        <li className="row">
          <span>Application drafts{s && ` · ${s.drafts} draft(s)`}</span>
          <ConfirmButton
            label="Delete drafts"
            confirmLabel="Delete all drafts"
            testId="delete-drafts"
            onConfirm={() => run(dataManagement.deleteDrafts, 'Drafts deleted.')}
          />
        </li>
        <li className="row">
          <span>Settings, job sites and keywords</span>
          <ConfirmButton
            label="Reset settings"
            confirmLabel="Reset to defaults"
            testId="reset-settings"
            onConfirm={() => run(dataManagement.resetSettings, 'Settings reset to defaults.')}
          />
        </li>
        <li className="row">
          <span>API key{s && (s.hasApiKey ? ' · saved' : ' · none')}</span>
          <ConfirmButton
            label="Remove key"
            confirmLabel="Remove API key"
            testId="data-remove-key"
            disabled={!s?.hasApiKey}
            onConfirm={() => run(dataManagement.removeApiKey, 'API key removed.')}
          />
        </li>
        <li className="row">
          <strong>Everything above</strong>
          <ConfirmButton
            label="Delete everything"
            confirmLabel="Yes, delete everything"
            testId="delete-everything"
            onConfirm={() => run(dataManagement.deleteEverything, 'All extension data deleted.')}
          />
        </li>
      </ul>
      {notice && <Message kind={notice.kind}>{notice.text}</Message>}
    </Section>
  );
}
