import type { Clock, IdGenerator } from '../domain';
import { fail, ok, type Result } from '../result';
import { TargetSiteSchema, type TargetSite } from '../schemas';

export interface TargetSiteInput {
  url: string;
  label: string;
}

/** Normalizes a URL for duplicate detection (lowercase host, no trailing slash, no hash). */
export function normalizeSiteUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    u.hash = '';
    const path = u.pathname.replace(/\/+$/, '');
    return `${u.protocol}//${u.host.toLowerCase()}${path}${u.search}`;
  } catch {
    return null;
  }
}

function validate(
  input: TargetSiteInput,
  existing: readonly TargetSite[],
  selfId?: string,
): Result<{ url: string; label: string }> {
  const normalized = normalizeSiteUrl(input.url);
  if (!normalized) return fail('Enter a valid URL, e.g. https://www.onlinejobs.ph/jobseekers');
  if (!normalized.startsWith('https://')) return fail('Only https:// URLs are allowed.');
  const duplicate = existing.some((s) => s.id !== selfId && normalizeSiteUrl(s.url) === normalized);
  if (duplicate) return fail('This site is already in the list.');
  const label = input.label.trim() || new URL(normalized).hostname;
  return ok({ url: normalized, label });
}

export function createTargetSite(
  input: TargetSiteInput,
  existing: readonly TargetSite[],
  clock: Clock,
  ids: IdGenerator,
): Result<TargetSite> {
  const v = validate(input, existing);
  if (!v.ok) return v;
  const ts = clock.now().toISOString();
  const parsed = TargetSiteSchema.safeParse({
    id: ids.newId(),
    ...v.value,
    enabled: true,
    createdAt: ts,
    updatedAt: ts,
  });
  return parsed.success
    ? ok(parsed.data)
    : fail('Site details are invalid (label max 100 characters).');
}

export function editTargetSite(
  site: TargetSite,
  input: TargetSiteInput,
  existing: readonly TargetSite[],
  clock: Clock,
): Result<TargetSite> {
  const v = validate(input, existing, site.id);
  if (!v.ok) return v;
  const parsed = TargetSiteSchema.safeParse({
    ...site,
    ...v.value,
    updatedAt: clock.now().toISOString(),
  });
  return parsed.success
    ? ok(parsed.data)
    : fail('Site details are invalid (label max 100 characters).');
}

export function setTargetSiteEnabled(site: TargetSite, enabled: boolean, clock: Clock): TargetSite {
  return { ...site, enabled, updatedAt: clock.now().toISOString() };
}
