import { APP_NAME } from '@/core/app-info';
import { repos } from '@/ui/services';
import { useResource } from '@/ui/useResource';
import { PageCheck } from './PageCheck';

const loadStatus = async () => {
  const [profile, sites, hasKey] = await Promise.all([
    repos.profile.getCurrent(),
    repos.targetSites.list(),
    repos.secrets.hasAnthropicApiKey(),
  ]);
  return {
    profileVersion: profile?.version ?? null,
    enabledSites: sites.items.filter((s) => s.enabled).length,
    hasKey,
  };
};

export function App() {
  const { state } = useResource(loadStatus);

  return (
    <main className="popup">
      <h1>{APP_NAME}</h1>
      {state.status === 'ready' && (
        <ul className="status-list" data-testid="popup-status">
          <li>
            Profile:{' '}
            {state.data.profileVersion ? `version ${state.data.profileVersion}` : 'not set up'}
          </li>
          <li>Enabled job sites: {state.data.enabledSites}</li>
          <li>API key: {state.data.hasKey ? 'saved' : 'not set'}</li>
        </ul>
      )}
      {state.status === 'error' && (
        <p className="message error">Saved data could not be read. Open settings to fix it.</p>
      )}
      <PageCheck />
      <button type="button" onClick={() => void browser.runtime.openOptionsPage()}>
        Open settings
      </button>
    </main>
  );
}
