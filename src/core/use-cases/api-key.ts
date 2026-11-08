import { fail, ok, type Result } from '../result';

export const API_KEY_MAX_LENGTH = 500;

/**
 * Basic shape check only. Whether the key actually works is checked against the
 * provider in T04. No provider-specific prefix is assumed here.
 */
export function validateApiKeyInput(raw: string): Result<string> {
  const key = raw.trim();
  if (!key) return fail('Enter an API key.');
  if (/\s/.test(key)) return fail('API keys cannot contain spaces.');
  if (key.length > API_KEY_MAX_LENGTH) return fail('That key is too long.');
  return ok(key);
}
