/** Opens an https URL in a new tab (job posts, site searches). Other schemes are ignored. */
export function openExternal(url: string): void {
  try {
    if (new URL(url).protocol !== 'https:') return;
  } catch {
    return;
  }
  void browser.tabs.create({ url, active: true });
}

/** Opens the extension's Saved Jobs page. */
export function openJobsPage(): void {
  void browser.tabs.create({ url: browser.runtime.getURL('/jobs.html'), active: true });
}
