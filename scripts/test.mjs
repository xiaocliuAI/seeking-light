import { spawnSync } from 'node:child_process';

const audits = [
  'tests/system-audit.mjs',
  'tests/color-audit.mjs',
  'tests/server-audit.mjs',
  'tests/journal-ui-audit.mjs',
  'tests/copilot-ui-audit.mjs',
  'tests/copilot-audit.mjs',
  'output/seeking-light/source-audit.mjs',
  'tests/test-readiness-audit.mjs',
  'tests/prototype-regression.mjs',
];
const root = new URL('../', import.meta.url);
let failed = false;
for (const audit of audits) {
  console.log(`\nRunning ${audit}`);
  const result = spawnSync(process.execPath, [audit], {
    cwd: root, stdio: 'inherit', timeout: 120000,
  });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
