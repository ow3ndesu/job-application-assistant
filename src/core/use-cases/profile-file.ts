import { fail, ok, type Result } from '../result';
import { PROFILE_LIMITS, type ApplicantProfile } from '../schemas';

export const PROFILE_FILE_EXTENSIONS = ['.md', '.txt'] as const;
export const PROFILE_FILE_ACCEPT = '.md,.txt,text/markdown,text/plain';
/** Byte cap checked before reading, so huge files are never loaded. */
export const PROFILE_MAX_FILE_BYTES = PROFILE_LIMITS.maxChars * 4;

export interface ProfileFileMeta {
  name: string;
  size: number;
}

/** Pre-read check on file name and size. */
export function checkProfileFile(file: ProfileFileMeta): Result<true> {
  const lower = file.name.toLowerCase();
  if (!PROFILE_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return fail('Choose a .md or .txt file.');
  }
  if (file.size > PROFILE_MAX_FILE_BYTES) return fail('That file is too large for a profile.');
  return ok(true);
}

/** Post-read check on decoded text. Normalizes line endings and strips a BOM. */
export function parseProfileText(text: string): Result<string> {
  const content = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (content.includes('\u0000')) return fail('That file does not look like plain text.');
  if (content.length > PROFILE_LIMITS.maxChars) {
    return fail(
      `Profiles can be at most ${PROFILE_LIMITS.maxChars.toLocaleString('en-US')} characters.`,
    );
  }
  return ok(content);
}

export function profileExportFilename(profile: Pick<ApplicantProfile, 'version'>): string {
  return `applicant-profile-v${profile.version}.md`;
}
