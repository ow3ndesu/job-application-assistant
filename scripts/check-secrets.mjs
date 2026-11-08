#!/usr/bin/env node
// Scans tracked source files and the production build for things that must
// never ship: API keys, private keys, cloud credentials, and env files.
// Usage: node scripts/check-secrets.mjs   (exit code 1 on findings)
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();

const PATTERNS = [
  ['Anthropic API key', /sk-ant-[A-Za-z0-9_-]{20,}/],
  ['OpenAI-style secret key', /\bsk-[A-Za-z0-9]{32,}\b/],
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |)PRIVATE KEY-----/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Hard-coded API key assignment', /ANTHROPIC_API_KEY\s*=\s*['"]?[A-Za-z0-9_-]{8,}/],
];
const FORBIDDEN_FILES = [/^\.env(\..*)?$/];
const ALLOWED_ENV = new Set(['.env.example']);

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
  });
  return out.split('\n').filter(Boolean);
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const findings = [];
const files = [...trackedFiles().map((f) => join(root, f)), ...walk(join(root, '.output'))];
for (const file of files) {
  const rel = relative(root, file).split('\\').join('/');
  const base = rel.split('/').pop() ?? rel;
  if (FORBIDDEN_FILES.some((re) => re.test(base)) && !ALLOWED_ENV.has(base)) {
    findings.push(`${rel}: environment file must not be committed or shipped`);
    continue;
  }
  if (rel === 'scripts/check-secrets.mjs' || /\.(png|jpe?g|gif|ico|woff2?|zip)$/i.test(rel))
    continue;
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  for (const [label, re] of PATTERNS) {
    if (re.test(text)) findings.push(`${rel}: ${label}`);
  }
}

if (findings.length) {
  process.stderr.write(
    `Secret scan FAILED (${findings.length}):\n${findings.map((f) => `  - ${f}`).join('\n')}\n`,
  );
  process.exit(1);
}
process.stdout.write(`Secret scan passed: ${files.length} files checked (source + .output).\n`);
