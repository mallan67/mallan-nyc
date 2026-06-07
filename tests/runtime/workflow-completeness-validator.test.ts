/// <reference types="jest" />
/**
 * Regression guard — workflow-completeness validator MACHINE (`--json`) contract.
 *
 * Context (2026-06-07, Phase 0.4): `validate-workflow-completeness.js --json`
 * previously called `process.exit(1)` whenever it found a release-blocking
 * workflow. Its programmatic callers wrap it in `execSync()`, which THROWS on a
 * non-zero exit — so a perfectly valid JSON report was mis-handled as a crashed
 * validator and surfaced by `compliance-check` as
 * "workflow completeness — validator failed" (an UNVERIFIED, i.e. a HARNESS
 * BLIND SPOT). It was never actually crashing.
 *
 * Contract pinned here: in `--json` (report) mode the validator MUST always
 * exit 0 and emit parseable JSON, EVEN WHEN `summary.blocking_failures > 0`.
 * Gating is the caller's responsibility (it reads `summary.blocking_failures`).
 * Standalone/human mode keeps its own exit-1 gating and is intentionally NOT
 * asserted here (so direct `npm run validator:workflows` still fails CI).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'validate-workflow-completeness.js');
const WF_MAP = path.join(ROOT, 'compliance', 'rules', 'workflow-map.json');
const hasMap = fs.existsSync(WF_MAP);

function runJson(): { status: number | null; stdout: string } {
  const r = spawnSync('node', [SCRIPT, '--json'], {
    cwd: ROOT,
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
  });
  return { status: r.status, stdout: r.stdout ?? '' };
}

describe('validate-workflow-completeness.js --json machine contract', () => {
  (hasMap ? it : it.skip)(
    'exits 0 in --json mode and emits parseable JSON with a numeric summary',
    () => {
      const { status, stdout } = runJson();
      expect(status).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed).toHaveProperty('summary');
      expect(typeof parsed.summary.total).toBe('number');
      expect(typeof parsed.summary.blocking_failures).toBe('number');
      expect(Array.isArray(parsed.workflows)).toBe(true);
    },
    30000,
  );

  (hasMap ? it : it.skip)(
    'still exits 0 even when blocking_failures > 0 (the exact condition that caused execSync→UNVERIFIED)',
    () => {
      const { status, stdout } = runJson();
      const parsed = JSON.parse(stdout);
      // The previous bug: a non-zero exit here made callers throw and mark the
      // run UNVERIFIED. --json must signal blocking via the JSON body, not exit.
      expect(status).toBe(0);
      expect(typeof parsed.summary.blocking_failures).toBe('number');
    },
    30000,
  );
});
