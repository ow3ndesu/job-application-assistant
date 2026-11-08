import { useState } from 'react';
import { APP_NAME } from '@/core/app-info';
import { openJobsPage } from '@/ui/open-tab';
import { DataSection } from './sections/DataSection';
import { PrivacySection } from './sections/PrivacySection';
import { KeywordsSection } from './sections/KeywordsSection';
import { ProfileSection } from './sections/ProfileSection';
import { ProviderSection } from './sections/ProviderSection';
import { ScanSection } from './sections/ScanSection';
import { SitesSection } from './sections/SitesSection';

const NAV = [
  ['profile', 'Profile'],
  ['sites', 'Job sites'],
  ['keywords', 'Keywords'],
  ['provider', 'AI provider'],
  ['scan', 'Scan limits'],
  ['data', 'Your data'],
  ['privacy', 'Privacy'],
] as const;

export function App() {
  // Bumped after delete/reset so every section reloads from storage.
  const [epoch, setEpoch] = useState(0);

  return (
    <div className="options">
      <header>
        <h1>{APP_NAME} — Settings</h1>
        <nav aria-label="Sections">
          {NAV.map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              openJobsPage();
            }}
          >
            Saved jobs →
          </a>
        </nav>
      </header>
      <main key={epoch}>
        <ProfileSection />
        <SitesSection />
        <KeywordsSection />
        <ProviderSection />
        <ScanSection />
      </main>
      <DataSection onChanged={() => setEpoch((n) => n + 1)} />
      <PrivacySection />
    </div>
  );
}
