import { onlineJobsAdapter } from './onlinejobs/adapter';
import type { ExtractionResult, PageSnapshot, SiteAdapter } from './types';

export const SITE_ADAPTERS: readonly SiteAdapter[] = [onlineJobsAdapter];

export function findAdapter(url: URL): SiteAdapter | undefined {
  return SITE_ADAPTERS.find((a) => a.canHandle(url));
}

/**
 * Runs the matching adapter. A failing adapter never throws to the caller:
 * unexpected errors become `structure_changed` so the rest of the extension keeps working.
 */
export async function extractPage(
  page: PageSnapshot,
): Promise<{ adapter?: SiteAdapter; result: ExtractionResult }> {
  const adapter = findAdapter(page.url);
  const diagnostics = {
    adapterId: adapter?.id ?? 'none',
    candidates: 0,
    skipped: [],
    duplicatesOnPage: 0,
    notes: [],
  };
  if (!adapter) {
    return {
      result: {
        status: 'unsupported_page',
        reason: 'No supported job site matches this page. Supported: OnlineJobs.ph.',
        diagnostics,
      },
    };
  }
  try {
    return { adapter, result: await adapter.extract(page) };
  } catch {
    return {
      adapter,
      result: {
        status: 'structure_changed',
        reason: 'The page could not be read (unexpected error in the site adapter).',
        diagnostics,
      },
    };
  }
}
