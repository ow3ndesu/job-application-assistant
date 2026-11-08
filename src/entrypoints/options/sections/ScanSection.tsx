import { useState, type FormEvent } from 'react';
import type { Settings } from '@/core/domain';
import { SETTINGS_LIMITS, SettingsSchema } from '@/core/schemas';
import { describeError, LoadError, Message, Section } from '@/ui/components';
import { repos } from '@/ui/services';
import { useResource } from '@/ui/useResource';

const loadSettings = () => repos.settings.get();

type Notice = { kind: 'error' | 'success'; text: string } | null;

export function ScanSection() {
  const { state, reload } = useResource(loadSettings);
  // Kept here (not in the form) so it survives the form remount after a save.
  const [notice, setNotice] = useState<Notice>(null);

  return (
    <Section
      id="scan"
      title="Scan limits"
      intro="Limits how many postings are processed per scan and how quickly pages are requested."
    >
      {state.status === 'loading' && <p className="muted">Loading…</p>}
      {state.status === 'error' && (
        <LoadError
          error={state.error}
          onRecover={async () => {
            await repos.settings.recover();
            reload();
          }}
        />
      )}
      {state.status === 'ready' && (
        <ScanForm
          key={JSON.stringify(state.data.scan)}
          settings={state.data}
          onSaved={reload}
          onNotice={setNotice}
        />
      )}
      {notice && <Message kind={notice.kind}>{notice.text}</Message>}
    </Section>
  );
}

function ScanForm(props: {
  settings: Settings;
  onSaved: () => void;
  onNotice: (notice: Notice) => void;
}) {
  const [maxJobs, setMaxJobs] = useState(String(props.settings.scan.maxJobsPerScan));
  const [delaySec, setDelaySec] = useState(String(props.settings.scan.requestDelayMs / 1000));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const scan = {
      maxJobsPerScan: Number(maxJobs),
      requestDelayMs: Math.round(Number(delaySec) * 1000),
    };
    if (!SettingsSchema.safeParse({ ...props.settings, scan }).success) {
      props.onNotice({
        kind: 'error',
        text: `Use 1–${SETTINGS_LIMITS.maxJobsPerScan} jobs and a delay of at least ${SETTINGS_LIMITS.minRequestDelayMs / 1000} seconds.`,
      });
      return;
    }
    try {
      await repos.settings.update((s) => ({ ...s, scan }));
      props.onNotice({ kind: 'success', text: 'Scan limits saved.' });
      props.onSaved();
    } catch (err) {
      props.onNotice({ kind: 'error', text: describeError(err) });
    }
  }

  return (
    // noValidate: show our own messages instead of the browser's validation bubble.
    <form
      className="inline-form"
      noValidate
      onSubmit={(e) => void onSubmit(e)}
      aria-label="Scan limits"
    >
      <label>
        Max jobs per scan
        <input
          type="number"
          name="max-jobs"
          min={1}
          max={SETTINGS_LIMITS.maxJobsPerScan}
          value={maxJobs}
          onChange={(e) => setMaxJobs(e.target.value)}
        />
      </label>
      <label>
        Delay between page requests (seconds)
        <input
          type="number"
          name="delay"
          min={SETTINGS_LIMITS.minRequestDelayMs / 1000}
          step={1}
          value={delaySec}
          onChange={(e) => setDelaySec(e.target.value)}
        />
      </label>
      <button type="submit">Save limits</button>
      <p className="muted small">
        The minimum delay is {SETTINGS_LIMITS.minRequestDelayMs / 1000} seconds, matching the crawl
        delay OnlineJobs.ph asks for.
      </p>
    </form>
  );
}
