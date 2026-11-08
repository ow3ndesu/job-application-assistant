#!/usr/bin/env node
// Runs the full E2E suite:
//   1. journeys on a production E2E build
//   2. journeys on a development E2E build (React dev warnings fail the run)
//   3. upgrade path + release verification on a clean release build
// Ends with a clean release build in .output/chrome-mv3.
// Requires Google Chrome (set CHROME_PATH if it's not in a standard location).
import { spawnSync } from 'node:child_process';

const run = (label, cmd, env = {}) => {
  process.stdout.write(`\n=== ${label} ===\n`);
  const r = spawnSync(cmd, { shell: true, stdio: 'inherit', env: { ...process.env, ...env } });
  return r.status === 0;
};

const results = [
  [
    'build (E2E, production)',
    run('build (E2E, production)', 'pnpm exec wxt build', { E2E_HOST_ACCESS: '1' }),
  ],
];
results.push([
  'journeys (production)',
  run('journeys (production)', 'node tests/e2e/journeys.e2e.mjs .output/chrome-mv3'),
]);
results.push([
  'build (E2E, development)',
  run('build (E2E, development)', 'pnpm exec wxt build --mode development', {
    E2E_HOST_ACCESS: '1',
  }),
]);
results.push([
  'journeys (development)',
  run('journeys (development)', 'node tests/e2e/journeys.e2e.mjs .output/chrome-mv3-dev'),
]);
// Always end on a clean release build, even if earlier steps failed.
results.push([
  'build (release)',
  run('build (release)', 'pnpm exec wxt build', { E2E_HOST_ACCESS: '' }),
]);
results.push([
  'upgrade path (release)',
  run('upgrade path (release)', 'node tests/e2e/upgrade.e2e.mjs .output/chrome-mv3'),
]);
results.push([
  'release verification',
  run('release verification', 'node scripts/verify-release.mjs'),
]);

process.stdout.write('\n=== E2E summary ===\n');
for (const [label, ok] of results) process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${label}\n`);
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
