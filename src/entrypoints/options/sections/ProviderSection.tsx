import { useState, type FormEvent } from 'react';
import { ANTHROPIC_MODEL_OPTIONS, DEFAULT_ANTHROPIC_MODEL } from '@/core/schemas';
import { validateApiKeyInput } from '@/core/use-cases/api-key';
import { ConfirmButton, describeError, LoadError, Message, Section } from '@/ui/components';
import { repos } from '@/ui/services';
import { useResource } from '@/ui/useResource';

const loadProvider = async () => ({
  settings: await repos.settings.get(),
  hasKey: await repos.secrets.hasAnthropicApiKey(),
});

type Notice = { kind: 'error' | 'success'; text: string } | null;

export function ProviderSection() {
  const { state, reload } = useResource(loadProvider);
  // The key lives only in this input until saved; it is never read back into the UI.
  const [keyInput, setKeyInput] = useState('');
  const [notice, setNotice] = useState<Notice>(null);

  async function act(action: () => Promise<unknown>, success: string) {
    setNotice(null);
    try {
      await action();
      setNotice({ kind: 'success', text: success });
      reload();
    } catch (e) {
      setNotice({ kind: 'error', text: describeError(e) });
    }
  }

  function onSaveKey(e: FormEvent) {
    e.preventDefault();
    const result = validateApiKeyInput(keyInput);
    if (!result.ok) {
      setNotice({ kind: 'error', text: result.error });
      return;
    }
    setKeyInput('');
    void act(() => repos.secrets.setAnthropicApiKey(result.value), 'API key saved.');
  }

  return (
    <Section id="provider" title="AI provider">
      {state.status === 'loading' && <p className="muted">Loading…</p>}
      {state.status === 'error' && (
        <LoadError
          error={state.error}
          onRecover={async () => {
            await repos.settings.recover();
            await repos.secrets.recover();
            reload();
          }}
        />
      )}
      {state.status === 'ready' && (
        <>
          <div className="field-grid">
            <label>
              Provider
              <select value="anthropic" disabled>
                <option value="anthropic">Anthropic Claude</option>
              </select>
            </label>
            <label>
              Model
              <select
                name="model"
                value={state.data.settings.ai.model ?? DEFAULT_ANTHROPIC_MODEL}
                onChange={(e) =>
                  void act(
                    () =>
                      repos.settings.update((s) => ({
                        ...s,
                        ai: { ...s.ai, model: e.target.value },
                      })),
                    'Model saved.',
                  )
                }
              >
                {ANTHROPIC_MODEL_OPTIONS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <h3>Anthropic API key</h3>
          <p data-testid="api-key-status">
            {state.data.hasKey ? (
              <>
                <span className="badge ok">Key saved</span> The key is hidden and cannot be viewed
                here. Enter a new one to replace it.
              </>
            ) : (
              <>
                <span className="badge">No key saved</span> Create a key in the{' '}
                <a
                  href="https://platform.claude.com/settings/keys"
                  target="_blank"
                  rel="noreferrer"
                >
                  Claude Console
                </a>
                .
              </>
            )}
          </p>
          <form className="inline-form" onSubmit={onSaveKey} aria-label="Save API key">
            <label>
              {state.data.hasKey ? 'Replace key' : 'API key'}
              <input
                type="password"
                name="api-key"
                autoComplete="off"
                spellCheck={false}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
              />
            </label>
            <button type="submit" disabled={!keyInput}>
              Save key
            </button>
            {state.data.hasKey && (
              <ConfirmButton
                label="Remove key"
                confirmLabel="Remove API key"
                testId="remove-key"
                onConfirm={() =>
                  act(() => repos.secrets.clearAnthropicApiKey(), 'API key removed.')
                }
              />
            )}
          </form>
          <p className="muted small">The key is not checked with Anthropic yet.</p>

          <details className="disclosure" open>
            <summary>Where your key and data go</summary>
            <ul>
              <li>
                Your key is stored only in this browser profile, in Chrome&apos;s extension storage
                on this device. Chrome does <strong>not</strong> encrypt it, so anyone with access
                to your computer account could read it. Use a key you can revoke, and remove it here
                when you stop using the extension.
              </li>
              <li>
                The key is sent only to Anthropic (<code>api.anthropic.com</code>), when you run an
                AI action. It is never sent to job sites and is never included in profile exports.
              </li>
              <li>
                When you ask for a job match or an application draft, the job details and your
                profile text are sent to Anthropic to generate the result. Nothing is sent until you
                start an action. Anthropic&apos;s API terms and privacy policy apply to that data.
              </li>
              <li>This extension has no server of its own and collects no analytics.</li>
            </ul>
          </details>
        </>
      )}
      {notice && <Message kind={notice.kind}>{notice.text}</Message>}
    </Section>
  );
}
