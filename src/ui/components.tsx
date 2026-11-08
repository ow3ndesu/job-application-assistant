import { useState, type ReactNode } from 'react';
import { isStorageError } from '@/storage';

export function Section(props: {
  id: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card" aria-labelledby={`${props.id}-title`} id={props.id}>
      <h2 id={`${props.id}-title`}>{props.title}</h2>
      {props.intro && <div className="muted intro">{props.intro}</div>}
      {props.children}
    </section>
  );
}

/** Two-step destructive action: first click asks, second click confirms. */
export function ConfirmButton(props: {
  label: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
  disabled?: boolean;
  testId?: string;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!asking) {
    return (
      <button
        type="button"
        className="danger"
        disabled={props.disabled}
        data-testid={props.testId}
        onClick={() => setAsking(true)}
      >
        {props.label}
      </button>
    );
  }
  return (
    <span className="confirm" role="group" aria-label={`Confirm: ${props.label}`}>
      <button
        type="button"
        className="danger solid"
        disabled={busy}
        data-testid={props.testId ? `${props.testId}-confirm` : undefined}
        onClick={async () => {
          setBusy(true);
          try {
            await props.onConfirm();
          } finally {
            setBusy(false);
            setAsking(false);
          }
        }}
      >
        {props.confirmLabel ?? 'Yes, confirm'}
      </button>
      <button type="button" onClick={() => setAsking(false)} disabled={busy}>
        Cancel
      </button>
    </span>
  );
}

export function Message(props: { kind: 'error' | 'success' | 'info'; children: ReactNode }) {
  return (
    <p className={`message ${props.kind}`} role={props.kind === 'error' ? 'alert' : 'status'}>
      {props.children}
    </p>
  );
}

/** Explains a load failure in plain words, with recovery when possible. */
export function LoadError(props: { error: unknown; onRecover?: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  const storage = isStorageError(props.error) ? props.error : undefined;
  const summary =
    storage?.kind === 'unsupported_version'
      ? 'This data was saved by a newer version of the extension. Update the extension to read it.'
      : storage?.kind === 'io'
        ? 'Browser storage could not be accessed. Try reloading this page.'
        : storage?.recoverable
          ? 'Saved data could not be read (it may be damaged).'
          : 'Something went wrong while loading this section.';

  return (
    <div className="message error" role="alert">
      <p>{summary}</p>
      {storage?.recoverable && props.onRecover && (
        <p>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await props.onRecover?.();
              } finally {
                setBusy(false);
              }
            }}
          >
            Reset this section
          </button>{' '}
          <span className="muted">The unreadable data is set aside in storage, not deleted.</span>
        </p>
      )}
      {storage && (
        <details>
          <summary>Technical details</summary>
          <pre>{storage.message}</pre>
        </details>
      )}
    </div>
  );
}

/** Returns a user-facing message for an unexpected error from a save action. */
export function describeError(error: unknown): string {
  if (isStorageError(error)) {
    if (error.kind === 'invalid_input') return 'That value is not valid and was not saved.';
    if (error.kind === 'not_found') return 'That item no longer exists.';
    return 'Saving failed. Please try again.';
  }
  return 'Something went wrong. Please try again.';
}

/** An error message with optional technical details (e.g. the provider's own error text). */
export function ErrorNotice(props: { message: string; detail?: string | undefined }) {
  return (
    <div className="message error" role="alert" data-testid="error-notice">
      <p>{props.message}</p>
      {props.detail && (
        <details>
          <summary>Technical details</summary>
          <pre data-testid="error-detail">{props.detail}</pre>
        </details>
      )}
    </div>
  );
}
