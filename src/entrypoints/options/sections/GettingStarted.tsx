import { repos } from '@/ui/services';
import { useResource } from '@/ui/useResource';

const loadProgress = async () => {
  const [profile, hasKey, keywords, jobs] = await Promise.all([
    repos.profile.getCurrent(),
    repos.secrets.hasAnthropicApiKey(),
    repos.searchKeywords.get(),
    repos.jobs.list(),
  ]);
  return {
    profile: !!profile?.content.trim(),
    key: hasKey,
    keywords: keywords.include.length > 0,
    scanned: jobs.items.length > 0,
  };
};

/** First-run checklist. Hidden once every step is done. */
export function GettingStarted() {
  const { state } = useResource(loadProgress);
  if (state.status !== 'ready') return null;
  const s = state.data;
  if (s.profile && s.key && s.keywords && s.scanned) return null;

  const steps: { done: boolean; title: string; body: React.ReactNode }[] = [
    {
      done: s.profile,
      title: 'Write or import your profile',
      body: (
        <>
          Describe your experience, skills and preferences under <a href="#profile">Profile</a>. AI
          features only use what you write there.
        </>
      ),
    },
    {
      done: s.keywords,
      title: 'Add keywords (optional)',
      body: (
        <>
          Under <a href="#keywords">Keywords</a>, add what you want to find and what to skip.
          Without keywords, every job on a scanned page is saved.
        </>
      ),
    },
    {
      done: s.scanned,
      title: 'Scan a job page',
      body: (
        <>
          Open the OnlineJobs.ph job search (or a job post), click the extension icon, then “Scan
          this tab”. The extension reads only that page.
        </>
      ),
    },
    {
      done: s.key,
      title: 'Add your Anthropic API key (for AI features)',
      body: (
        <>
          Needed only for fit checks, drafts and AI suggestions. Add it under{' '}
          <a href="#provider">AI provider</a> and click Test key. Your Anthropic account needs
          credits.
        </>
      ),
    },
  ];

  return (
    <section
      className="card getting-started"
      aria-labelledby="getting-started-title"
      data-testid="getting-started"
    >
      <h2 id="getting-started-title">Getting started</h2>
      <ol>
        {steps.map((step) => (
          <li key={step.title} className={step.done ? 'done' : ''} data-done={step.done}>
            <strong>
              {step.done ? '✓ ' : ''}
              {step.title}
            </strong>
            <br />
            <span className="muted small">{step.body}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
