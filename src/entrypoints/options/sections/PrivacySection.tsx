import { Section } from '@/ui/components';

/**
 * Plain-language privacy and permission disclosure. Keep in sync with
 * docs/PRIVACY.md and the manifest permissions in wxt.config.ts.
 */
export function PrivacySection() {
  return (
    <Section
      id="privacy"
      title="Privacy & permissions"
      intro="What this extension can access, what it stores, and what it sends. There is no server of our own and no analytics."
    >
      <h3>Permissions</h3>
      <ul className="small" data-testid="privacy-permissions">
        <li>
          <strong>Storage:</strong> keeps your settings, profile, saved jobs, drafts, and API key on
          this device.
        </li>
        <li>
          <strong>Active tab + scripting:</strong> lets the extension read the page you are looking
          at, only after you click the extension icon on that tab and press “Scan this tab”. It
          reads the page; it never clicks, fills in, or submits anything.
        </li>
        <li>No access to other websites, your browsing history, or tabs you didn&apos;t scan.</li>
      </ul>

      <h3>What is stored on this device</h3>
      <p className="small">
        Settings, job sites and keywords; your profile and its previous versions; saved jobs and
        scan history; fit checks; application drafts and their status; profile suggestions; and your
        Anthropic API key. Chrome keeps this in its extension storage for your browser profile,
        which is <strong>not encrypted</strong>. Anyone who can use your computer account could read
        it.
      </p>

      <h3>What is sent, and when</h3>
      <ul className="small" data-testid="privacy-transmission">
        <li>
          Only to Anthropic (<code>api.anthropic.com</code>), and only when you click an AI action:
          <ul>
            <li>Check fit: the job&apos;s text and your current profile.</li>
            <li>
              Draft application: the job&apos;s text, your profile, and your non-sensitive
              questions. Sensitive questions are never sent.
            </li>
            <li>Suggest profile additions: your profile and the text you typed.</li>
            <li>Test key: only your key and the model name (no profile or job data).</li>
          </ul>
        </li>
        <li>Your API key is sent only to Anthropic, never to job sites.</li>
        <li>
          The extension blocks network requests to any other server. Job sites are only read from
          tabs you open yourself.
        </li>
        <li>
          Anthropic&apos;s API terms and privacy policy apply to data you send for AI actions.
        </li>
      </ul>

      <h3>Your control</h3>
      <p className="small">
        Delete any of your data under <a href="#data">Your data</a>, remove the extension to delete
        everything, and revoke your API key in the Claude Console at any time.
      </p>
    </Section>
  );
}
