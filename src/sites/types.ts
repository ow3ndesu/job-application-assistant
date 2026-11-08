import type { JobPosting } from '@/core/schemas';

/** A page the user opened, captured as an inert parsed document. */
export interface PageSnapshot {
  url: URL;
  document: Document;
  capturedAt: Date;
}

export type PageKind = 'listing' | 'detail';

export interface ExtractionDiagnostics {
  adapterId: string;
  pageKind?: PageKind;
  /** Elements that looked like job cards. */
  candidates: number;
  /** Candidates dropped, with the reason (e.g. missing title). */
  skipped: { index: number; reason: string }[];
  /** Duplicate cards on the same page collapsed into one job. */
  duplicatesOnPage: number;
  notes: string[];
}

/**
 * Outcome of reading one page. Maps to the three user-facing categories:
 *  - not found:            `no_results`
 *  - could not access:     `login_required`, `blocked`
 *  - structure unsupported: `unsupported_page`, `structure_changed`
 */
export type ExtractionResult =
  | { status: 'ok'; pageKind: PageKind; jobs: JobPosting[]; diagnostics: ExtractionDiagnostics }
  | { status: 'no_results'; pageKind: 'listing'; diagnostics: ExtractionDiagnostics }
  | { status: 'login_required'; diagnostics: ExtractionDiagnostics }
  | { status: 'blocked'; diagnostics: ExtractionDiagnostics }
  | { status: 'unsupported_page'; reason: string; diagnostics: ExtractionDiagnostics }
  | { status: 'structure_changed'; reason: string; diagnostics: ExtractionDiagnostics };

export interface SiteAdapter {
  readonly id: string;
  readonly label: string;
  canHandle(url: URL): boolean;
  /** Pure: reads only the given snapshot. Never fetches, clicks, or navigates. */
  extract(page: PageSnapshot): Promise<ExtractionResult>;
  /** Search page URL the user can open themselves (never fetched by the extension). */
  searchUrl?(keyword: string): URL;
  /**
   * Whether the extension may fill in (never submit) application forms on this
   * site, even after user approval. Decided per site from its terms and the
   * user's decision. When false, only the manual copy/apply workflow exists.
   */
  readonly formAssistance: { allowed: boolean; reason: string };
}

export const EXTRACTION_STATUS_TEXT: Record<ExtractionResult['status'], string> = {
  ok: 'Jobs found.',
  no_results: 'No jobs were found on this page.',
  login_required: 'This page requires you to log in to the site. Log in, then try again.',
  blocked:
    'The site showed a verification or block page. Complete it yourself in the tab, then try again.',
  unsupported_page: 'This page is not a supported job list or job post.',
  structure_changed:
    'The page layout was not recognised. The site may have changed; extraction was stopped rather than guessing.',
};
