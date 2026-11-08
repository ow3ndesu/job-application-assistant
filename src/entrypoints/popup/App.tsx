import { APP_NAME } from '@/core/app-info';

export function App() {
  const openOptions = () => {
    void browser.runtime.openOptionsPage();
  };

  return (
    <main className="popup">
      <h1>{APP_NAME}</h1>
      <p className="muted">Nothing is configured yet. Open settings to get started.</p>
      <button type="button" onClick={openOptions}>
        Open settings
      </button>
    </main>
  );
}
