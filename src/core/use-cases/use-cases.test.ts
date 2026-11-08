import { describe, expect, it } from 'vitest';
import { fixedClock, sequentialIds } from '../../../tests/helpers';
import { defaultTargetSite, PROFILE_LIMITS } from '../schemas';
import { validateApiKeyInput } from './api-key';
import { addKeyword, removeKeyword } from './keywords';
import {
  checkProfileFile,
  parseProfileText,
  PROFILE_MAX_FILE_BYTES,
  profileExportFilename,
} from './profile-file';
import {
  createTargetSite,
  editTargetSite,
  normalizeSiteUrl,
  setTargetSiteEnabled,
} from './target-sites';

const clock = fixedClock();
const ids = sequentialIds('site');
const defaultSite = defaultTargetSite(clock.now());

describe('target sites', () => {
  it('creates an enabled site and defaults the label to the hostname', () => {
    const r = createTargetSite({ url: 'https://Example.com/jobs/', label: ' ' }, [], clock, ids);
    expect(r).toMatchObject({
      ok: true,
      value: { url: 'https://example.com/jobs', label: 'example.com', enabled: true },
    });
  });

  it.each([
    ['not a url', 'valid URL'],
    ['http://example.com', 'https://'],
    ['javascript:alert(1)', 'https://'],
  ])('rejects %s', (url, msg) => {
    const r = createTargetSite({ url, label: '' }, [], clock, ids);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(msg);
  });

  it('rejects duplicates after normalization (case, trailing slash, hash)', () => {
    const r = createTargetSite(
      { url: 'https://WWW.onlinejobs.ph/jobseekers/#top', label: '' },
      [defaultSite],
      clock,
      ids,
    );
    expect(r).toEqual({ ok: false, error: 'This site is already in the list.' });
  });

  it('edits a site without flagging itself as a duplicate', () => {
    const r = editTargetSite(
      defaultSite,
      { url: defaultSite.url, label: 'OLJ' },
      [defaultSite],
      clock,
    );
    expect(r).toMatchObject({ ok: true, value: { id: defaultSite.id, label: 'OLJ' } });
  });

  it('rejects labels over 100 characters', () => {
    const r = createTargetSite(
      { url: 'https://a.example', label: 'x'.repeat(101) },
      [],
      clock,
      ids,
    );
    expect(r.ok).toBe(false);
  });

  it('toggles enabled', () => {
    expect(setTargetSiteEnabled(defaultSite, false, clock).enabled).toBe(false);
  });

  it('normalizeSiteUrl returns null for garbage', () => {
    expect(normalizeSiteUrl('::')).toBeNull();
  });
});

describe('keywords', () => {
  const empty = { include: [], exclude: [] };

  it('adds trimmed keywords with collapsed whitespace', () => {
    expect(addKeyword(empty, 'include', '  virtual   assistant ')).toEqual({
      ok: true,
      value: { include: ['virtual assistant'], exclude: [] },
    });
  });

  it('rejects empty, duplicate (case-insensitive) and cross-list duplicates', () => {
    expect(addKeyword(empty, 'include', '   ').ok).toBe(false);
    const one = { include: ['React'], exclude: [] };
    expect(addKeyword(one, 'include', 'react').ok).toBe(false);
    expect(addKeyword(one, 'exclude', 'REACT').ok).toBe(false);
  });

  it('enforces the per-list maximum and length limit', () => {
    const full = { include: Array.from({ length: 50 }, (_, i) => `k${i}`), exclude: [] };
    expect(addKeyword(full, 'include', 'one more').ok).toBe(false);
    expect(addKeyword(empty, 'include', 'x'.repeat(101)).ok).toBe(false);
  });

  it('removes a keyword', () => {
    expect(removeKeyword({ include: ['a', 'b'], exclude: ['c'] }, 'include', 'a')).toEqual({
      include: ['b'],
      exclude: ['c'],
    });
  });
});

describe('profile file import/export', () => {
  it('accepts .md and .txt (any case) and rejects other types', () => {
    expect(checkProfileFile({ name: 'me.MD', size: 10 }).ok).toBe(true);
    expect(checkProfileFile({ name: 'me.txt', size: 10 }).ok).toBe(true);
    expect(checkProfileFile({ name: 'me.pdf', size: 10 }).ok).toBe(false);
    expect(checkProfileFile({ name: 'me.md.exe', size: 10 }).ok).toBe(false);
  });

  it('rejects oversized files before reading', () => {
    expect(checkProfileFile({ name: 'me.md', size: PROFILE_MAX_FILE_BYTES + 1 }).ok).toBe(false);
  });

  it('strips a BOM and normalizes line endings', () => {
    expect(parseProfileText('\uFEFF# Me\r\nline\rline')).toEqual({
      ok: true,
      value: '# Me\nline\nline',
    });
  });

  it('rejects binary-looking text and over-long content', () => {
    expect(parseProfileText('abc\u0000def').ok).toBe(false);
    expect(parseProfileText('x'.repeat(PROFILE_LIMITS.maxChars + 1)).ok).toBe(false);
  });

  it('names exports by version', () => {
    expect(profileExportFilename({ version: 3 })).toBe('applicant-profile-v3.md');
  });
});

describe('API key input', () => {
  it('trims and accepts a key without assuming a provider prefix', () => {
    expect(validateApiKeyInput('  abc-123  ')).toEqual({ ok: true, value: 'abc-123' });
  });

  it('rejects empty, whitespace-containing and over-long keys', () => {
    expect(validateApiKeyInput('   ').ok).toBe(false);
    expect(validateApiKeyInput('abc def').ok).toBe(false);
    expect(validateApiKeyInput('x'.repeat(501)).ok).toBe(false);
  });
});
