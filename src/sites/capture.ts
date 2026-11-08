import { z } from 'zod';
import type { PageSnapshot } from './types';

/** Upper bound for a captured page (characters). Real OnlineJobs.ph pages are ~200 KB. */
export const MAX_CAPTURE_CHARS = 8_000_000;

const CapturedSchema = z.object({
  url: z.string().min(1).max(4096),
  html: z.string().max(MAX_CAPTURE_CHARS),
});

export type CaptureFailure = 'no_tab' | 'cannot_access' | 'too_large' | 'invalid_capture';

export type CaptureResult =
  { ok: true; snapshot: PageSnapshot } | { ok: false; reason: CaptureFailure };

export const CAPTURE_FAILURE_TEXT: Record<CaptureFailure, string> = {
  no_tab: 'No active tab was found.',
  cannot_access:
    'This tab cannot be read. Open a job page in a normal tab, then click the extension icon and try again.',
  too_large: 'This page is too large to read.',
  invalid_capture: 'The page could not be read.',
};

/**
 * Runs in the page (isolated world) via `scripting.executeScript`. Must be
 * self-contained: it is serialized and has no access to extension code.
 *
 * Read-only: works on a detached clone of the DOM and never clicks, scrolls,
 * submits, or fetches. The clone is stripped of executable or irrelevant
 * content (scripts, styles, frames, embedded objects and every inline `on*`
 * handler) so no page code ever reaches the extension. Chrome otherwise checks
 * inline handlers against the extension CSP even in an inert parsed document.
 */
export function snapshotPage(): { url: string; html: string } {
  const clone = document.documentElement.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll('script, style, noscript, iframe, frame, object, embed, template, link, base')
    .forEach((el) => el.remove());
  const elements = [clone, ...Array.from(clone.querySelectorAll('*'))];
  for (const el of elements) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith('on') || value.startsWith('javascript:')) el.removeAttribute(attr.name);
    }
  }
  return { url: location.href, html: clone.outerHTML };
}

/** Parses untrusted HTML into an inert document (no scripts run, nothing is inserted into our UI). */
export function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

/**
 * Captures the tab the user is looking at. Relies on `activeTab`, which Chrome
 * grants only after the user invokes the extension on that tab; no host
 * permissions are requested.
 */
export async function captureActiveTab(now: () => Date = () => new Date()): Promise<CaptureResult> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return { ok: false, reason: 'no_tab' };

  let raw: unknown;
  try {
    const [first] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: snapshotPage,
    });
    raw = first?.result;
  } catch {
    return { ok: false, reason: 'cannot_access' };
  }

  const parsed = CapturedSchema.safeParse(raw);
  if (!parsed.success) {
    const tooLarge =
      typeof raw === 'object' &&
      raw !== null &&
      typeof (raw as { html?: unknown }).html === 'string' &&
      (raw as { html: string }).html.length > MAX_CAPTURE_CHARS;
    return { ok: false, reason: tooLarge ? 'too_large' : 'invalid_capture' };
  }

  let url: URL;
  try {
    url = new URL(parsed.data.url);
  } catch {
    return { ok: false, reason: 'invalid_capture' };
  }
  return { ok: true, snapshot: { url, document: parseHtml(parsed.data.html), capturedAt: now() } };
}
