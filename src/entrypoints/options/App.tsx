import { APP_NAME } from '@/core/app-info';

export function App() {
  return (
    <main className="options">
      <h1>{APP_NAME} — Settings</h1>
      <p className="muted">
        Settings, profile management and AI provider configuration will appear here.
      </p>
    </main>
  );
}
