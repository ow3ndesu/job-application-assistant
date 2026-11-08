/**
 * Text helpers for untrusted page DOM. Only text is read; nothing from the page
 * is ever inserted into extension UI as HTML.
 */

// Built from char codes so no invisible characters appear in source.
const NBSP = String.fromCharCode(0xa0);
/** Private-use placeholder marking a `<br>` while whitespace is collapsed. */
const BR_MARK = String.fromCharCode(0xe000);

/**
 * Renders text the way a browser does: runs of whitespace (including source
 * newlines) collapse to one space; only `<br>` produces a line break. Lines are
 * trimmed and more than one blank line in a row is reduced to one.
 */
function renderText(raw: string): string {
  return raw
    .split(NBSP)
    .join(' ')
    .replace(/\s+/g, ' ')
    .split(BR_MARK)
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Single-line text of an element, or undefined if empty. */
export function inlineText(el: Element | null | undefined): string | undefined {
  const text = el?.textContent?.split(NBSP).join(' ').replace(/\s+/g, ' ').trim();
  return text ? text : undefined;
}

/**
 * Multi-line text of an element (`<br>` → newline). `exclude` removes matching
 * descendants first (e.g. a "See More" link).
 */
export function blockText(el: Element | null | undefined, exclude?: string): string | undefined {
  if (!el) return undefined;
  const clone = el.cloneNode(true) as Element;
  if (exclude) clone.querySelectorAll(exclude).forEach((n) => n.remove());
  clone.querySelectorAll('br').forEach((br) => br.replaceWith(BR_MARK));
  const text = renderText(clone.textContent ?? '');
  return text ? text : undefined;
}

/** SHA-256 hex digest (Web Crypto; available in extension pages and Node). */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
