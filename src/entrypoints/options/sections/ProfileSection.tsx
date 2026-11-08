import { useRef, useState, type ChangeEvent } from 'react';
import type { ApplicantProfile } from '@/core/domain';
import { PROFILE_LIMITS } from '@/core/schemas';
import {
  checkProfileFile,
  parseProfileText,
  PROFILE_FILE_ACCEPT,
  profileExportFilename,
} from '@/core/use-cases/profile-file';
import { ConfirmButton, describeError, LoadError, Message, Section } from '@/ui/components';
import { repos } from '@/ui/services';
import { useResource } from '@/ui/useResource';

const loadProfile = async () => ({
  current: await repos.profile.getCurrent(),
  history: await repos.profile.listHistory(),
});

type Notice = { kind: 'error' | 'success' | 'info'; text: string } | null;

export function ProfileSection() {
  const { state, reload } = useResource(loadProfile);
  // Lives here (not in the editor) so it survives the editor remount after a save.
  const [notice, setNotice] = useState<Notice>(null);

  return (
    <Section
      id="profile"
      title="Applicant profile"
      intro={
        <>
          Plain text or Markdown describing your experience, skills, education and preferences. AI
          features will use <strong>only</strong> what is written here. They must never invent
          qualifications. Every save keeps the previous version so you can restore it.
        </>
      }
    >
      {state.status === 'loading' && <p className="muted">Loading…</p>}
      {state.status === 'error' && (
        <LoadError
          error={state.error}
          onRecover={async () => {
            await repos.profile.recover();
            reload();
          }}
        />
      )}
      {state.status === 'ready' && (
        <ProfileEditor
          // Remount the editor when the saved version changes.
          key={state.data.current?.version ?? 0}
          current={state.data.current}
          history={state.data.history}
          onSaved={reload}
          onNotice={setNotice}
        />
      )}
      {notice && <Message kind={notice.kind}>{notice.text}</Message>}
    </Section>
  );
}

function ProfileEditor(props: {
  current: ApplicantProfile | null;
  history: ApplicantProfile[];
  onSaved: () => void;
  onNotice: (notice: Notice) => void;
}) {
  const saved = props.current?.content ?? '';
  const [text, setText] = useState(saved);
  const setNotice = props.onNotice;
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const dirty = text !== saved;
  const tooLong = text.length > PROFILE_LIMITS.maxChars;

  async function save() {
    setBusy(true);
    try {
      const p = await repos.profile.saveContent(text);
      setNotice({ kind: 'success', text: `Saved as version ${p.version}.` });
      props.onSaved();
    } catch (e) {
      setNotice({ kind: 'error', text: describeError(e) });
    } finally {
      setBusy(false);
    }
  }

  async function onImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const check = checkProfileFile(file);
    if (!check.ok) {
      setNotice({ kind: 'error', text: check.error });
      return;
    }
    const parsed = parseProfileText(await file.text());
    if (!parsed.ok) {
      setNotice({ kind: 'error', text: parsed.error });
      return;
    }
    setText(parsed.value);
    setNotice({
      kind: 'info',
      text: `Imported “${file.name}”. Review it, then click Save profile to keep it.`,
    });
  }

  function onExport() {
    if (!props.current) return;
    const blob = new Blob([props.current.content], { type: 'text/markdown;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = profileExportFilename(props.current);
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 0);
  }

  return (
    <>
      <label className="block">
        <span className="sr-only">Profile text</span>
        <textarea
          name="profile"
          rows={16}
          spellCheck
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'# Your name\n\n## Experience\n- …\n\n## Skills\n- …'}
        />
      </label>
      <p className={`muted small ${tooLong ? 'over' : ''}`}>
        {text.length.toLocaleString('en-US')} / {PROFILE_LIMITS.maxChars.toLocaleString('en-US')}{' '}
        characters
        {props.current
          ? ` · saved version ${props.current.version}, ${new Date(props.current.updatedAt).toLocaleString()}`
          : ' · not saved yet'}
        {dirty && ' · unsaved changes'}
      </p>
      <div className="button-row">
        <button
          type="button"
          className="primary"
          onClick={() => void save()}
          disabled={!dirty || tooLong || busy}
        >
          Save profile
        </button>
        {dirty && (
          <button type="button" onClick={() => setText(saved)}>
            Discard changes
          </button>
        )}
        <button type="button" onClick={() => fileInput.current?.click()}>
          Import .md / .txt
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={PROFILE_FILE_ACCEPT}
          hidden
          data-testid="profile-import"
          onChange={(e) => void onImport(e)}
        />
        <button type="button" onClick={onExport} disabled={!props.current}>
          Export saved profile
        </button>
      </div>
      <details className="history">
        <summary>Previous versions ({props.history.length})</summary>
        {props.history.length === 0 ? (
          <p className="muted">No previous versions yet.</p>
        ) : (
          <ul className="rows">
            {props.history.map((p) => (
              <li key={p.version} className="row">
                <details>
                  <summary>
                    Version {p.version} · {new Date(p.updatedAt).toLocaleString()} ·{' '}
                    {p.content.length.toLocaleString('en-US')} characters
                  </summary>
                  <pre className="preview">{p.content}</pre>
                </details>
                <ConfirmButton
                  label="Restore"
                  confirmLabel={`Restore version ${p.version}`}
                  onConfirm={async () => {
                    try {
                      const restored = await repos.profile.restore(p.version);
                      setNotice({
                        kind: 'success',
                        text: `Version ${p.version} restored as version ${restored.version}.`,
                      });
                      props.onSaved();
                    } catch (e) {
                      setNotice({ kind: 'error', text: describeError(e) });
                    }
                  }}
                />
              </li>
            ))}
          </ul>
        )}
        <p className="muted small">
          The {PROFILE_LIMITS.historyLimit} most recent previous versions are kept.
        </p>
      </details>
    </>
  );
}
