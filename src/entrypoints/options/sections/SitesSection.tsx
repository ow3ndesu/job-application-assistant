import { useState, type FormEvent } from 'react';
import type { TargetSite } from '@/core/domain';
import {
  createTargetSite,
  editTargetSite,
  setTargetSiteEnabled,
} from '@/core/use-cases/target-sites';
import { ConfirmButton, describeError, LoadError, Message, Section } from '@/ui/components';
import { clock, ids, repos } from '@/ui/services';
import { useResource } from '@/ui/useResource';

const loadSites = () => repos.targetSites.list();

export function SitesSection() {
  const { state, reload } = useResource(loadSites);
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const sites = state.status === 'ready' ? state.data.items : [];

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      reload();
    } catch (e) {
      setError(describeError(e));
    }
  }

  function onAdd(e: FormEvent) {
    e.preventDefault();
    const result = createTargetSite({ url, label }, sites, clock, ids);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    void run(async () => {
      await repos.targetSites.upsert(result.value);
      setUrl('');
      setLabel('');
    });
  }

  return (
    <Section
      id="sites"
      title="Job sites"
      intro={
        <>
          Sites the extension may read job postings from. It reads only pages you open yourself; it
          does not browse sites in the background. Only OnlineJobs.ph is supported for job
          extraction right now.
        </>
      }
    >
      {state.status === 'loading' && <p className="muted">Loading…</p>}
      {state.status === 'error' && (
        <LoadError
          error={state.error}
          onRecover={async () => {
            await repos.targetSites.recover();
            reload();
          }}
        />
      )}
      {state.status === 'ready' && (
        <>
          {state.data.invalid.length > 0 && (
            <div className="message error" role="alert">
              <p>{state.data.invalid.length} saved site(s) could not be read.</p>
              <button
                type="button"
                onClick={() => void run(() => repos.targetSites.discardInvalid())}
              >
                Set unreadable entries aside
              </button>
            </div>
          )}
          {sites.length === 0 ? (
            <p className="muted">No sites configured.</p>
          ) : (
            <ul className="rows" data-testid="site-list">
              {sites.map((site) =>
                editingId === site.id ? (
                  <EditSiteRow
                    key={site.id}
                    site={site}
                    onCancel={() => setEditingId(null)}
                    onSave={(input) => {
                      const result = editTargetSite(site, input, sites, clock);
                      if (!result.ok) return result.error;
                      void run(async () => {
                        await repos.targetSites.upsert(result.value);
                        setEditingId(null);
                      });
                      return null;
                    }}
                  />
                ) : (
                  <li key={site.id} className="row" data-testid="site-row">
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={site.enabled}
                        aria-label={`Enable ${site.label}`}
                        onChange={(e) =>
                          void run(() =>
                            repos.targetSites.upsert(
                              setTargetSiteEnabled(site, e.target.checked, clock),
                            ),
                          )
                        }
                      />
                      <span className={site.enabled ? '' : 'muted'}>
                        <strong>{site.label}</strong>
                        {!site.enabled && ' (disabled)'}
                        <br />
                        <span className="url">{site.url}</span>
                      </span>
                    </label>
                    <span className="actions">
                      <button type="button" onClick={() => setEditingId(site.id)}>
                        Edit
                      </button>
                      <ConfirmButton
                        label="Remove"
                        confirmLabel="Remove site"
                        onConfirm={() => run(() => repos.targetSites.remove(site.id))}
                      />
                    </span>
                  </li>
                ),
              )}
            </ul>
          )}

          <form className="inline-form" noValidate onSubmit={onAdd} aria-label="Add a job site">
            <label>
              URL
              <input
                type="url"
                required
                placeholder="https://…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                name="site-url"
              />
            </label>
            <label>
              Name (optional)
              <input
                type="text"
                maxLength={100}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                name="site-label"
              />
            </label>
            <button type="submit">Add site</button>
          </form>
        </>
      )}
      {error && <Message kind="error">{error}</Message>}
    </Section>
  );
}

function EditSiteRow(props: {
  site: TargetSite;
  onSave: (input: { url: string; label: string }) => string | null;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState(props.site.url);
  const [label, setLabel] = useState(props.site.label);
  const [error, setError] = useState<string | null>(null);

  return (
    <li className="row">
      <form
        noValidate
        className="inline-form"
        aria-label={`Edit ${props.site.label}`}
        onSubmit={(e) => {
          e.preventDefault();
          setError(props.onSave({ url, label }));
        }}
      >
        <label>
          URL
          <input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <label>
          Name
          <input
            type="text"
            maxLength={100}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <button type="submit">Save</button>
        <button type="button" onClick={props.onCancel}>
          Cancel
        </button>
        {error && <Message kind="error">{error}</Message>}
      </form>
    </li>
  );
}
