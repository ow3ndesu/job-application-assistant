#!/usr/bin/env node
// Verifies the RELEASE build (.output/chrome-mv3) matches what the docs and the
// in-app disclosure promise. Run after `pnpm build` (not an E2E build).
// Usage: node scripts/verify-release.mjs   (exit 1 on any failure)
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const out = join(root, '.output', 'chrome-mv3');
const failures = [];
const pass = [];
const expect = (cond, label) => (cond ? pass : failures).push(label);

const EXPECTED_PERMISSIONS = ['activeTab', 'scripting', 'storage'];
const EXPECTED_CSP =
  "script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; connect-src 'self' https://api.anthropic.com";

if (!existsSync(join(out, 'manifest.json'))) {
  process.stderr.write('No release build found. Run `pnpm build` first.\n');
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

expect(manifest.manifest_version === 3, 'Manifest V3');
expect(manifest.version === pkg.version, `Version matches package.json (${pkg.version})`);
expect(
  JSON.stringify([...(manifest.permissions ?? [])].sort()) === JSON.stringify(EXPECTED_PERMISSIONS),
  `Permissions are exactly ${EXPECTED_PERMISSIONS.join(', ')}`,
);
for (const key of [
  'host_permissions',
  'optional_host_permissions',
  'content_scripts',
  'externally_connectable',
  'web_accessible_resources',
  'optional_permissions',
]) {
  expect(!(key in manifest), `No ${key} (an E2E build must not be released)`);
}
expect(
  manifest.content_security_policy?.extension_pages === EXPECTED_CSP,
  'Strict CSP present and unchanged',
);

const files = (function walk(d) {
  return readdirSync(d).flatMap((n) =>
    statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)],
  );
})(out);
expect(!files.some((f) => f.endsWith('.map')), 'No source maps in the package');
const bundle = files
  .filter((f) => f.endsWith('.js'))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');
expect(
  !/onlinejobs\.ph\/\*/.test(JSON.stringify(manifest)),
  'No job-site host patterns in the manifest',
);
expect(!bundle.includes('E2E_HOST_ACCESS'), 'No test-only flags in the bundle');

const privacyDoc = readFileSync(join(root, 'docs', 'PRIVACY.md'), 'utf8');
const privacyUi = readFileSync(
  join(root, 'src', 'entrypoints', 'options', 'sections', 'PrivacySection.tsx'),
  'utf8',
);
for (const term of ['activeTab', 'api.anthropic.com', 'not encrypted', 'Limited Use']) {
  expect(privacyDoc.includes(term), `docs/PRIVACY.md mentions "${term}"`);
}
for (const term of ['Storage', 'Active tab + scripting', 'api.anthropic.com', 'not encrypted']) {
  expect(privacyUi.includes(term), `In-app privacy section mentions "${term}"`);
}
const security = readFileSync(join(root, 'docs', 'SECURITY.md'), 'utf8');
expect(
  security.includes(EXPECTED_CSP.split('; ')[0]) && security.includes('connect-src'),
  'docs/SECURITY.md documents the CSP',
);

try {
  execFileSync(process.execPath, [join(root, 'scripts', 'check-secrets.mjs')], { stdio: 'pipe' });
  pass.push('Secret scan of source and build output');
} catch (e) {
  failures.push(`Secret scan failed:\n${e.stdout ?? ''}${e.stderr ?? ''}`);
}

for (const p of pass) process.stdout.write(`PASS  ${p}\n`);
for (const f of failures) process.stdout.write(`FAIL  ${f}\n`);
process.stdout.write(
  `\nRelease verification: ${pass.length}/${pass.length + failures.length} passed\n`,
);
process.exit(failures.length ? 1 : 0);
