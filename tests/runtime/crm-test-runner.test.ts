/// <reference types="jest" />
/**
 * Meta-test for the CRM test runner.
 *
 * Why this exists: `npm run crm:test` is the gate that exercises the in-tree
 * Fair Housing + UCBA description-compliance validators (19/20/21/22). The
 * gate is wired into .github/workflows/pr-check.yml, but workflow YAML
 * doesn't fail in a way that catches a silently-renamed npm script. This
 * test shells out to the runner via spawnSync; if the runner is missing,
 * the script reference is broken, or any of the 39 cases fail, this test
 * goes red — independent of CI wiring drift.
 *
 * History: the original 05-test-suite-runner.js was deleted in commit
 * a0e00f03 (2026-03-24) and its npm script reference was left orphaned —
 * `npm run crm:test` was silently broken on main from then until PR 11
 * restored it. This test makes a re-run of that mistake impossible.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

describe('npm run crm:test', () => {
  it('exits 0', () => {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const result = spawnSync('npm', ['run', '--silent', 'crm:test'], {
      cwd: repoRoot,
      encoding: 'utf8',
      shell: true,
    });
    if (result.status !== 0) {
      // Forward to stderr so the failure mode is investigable in CI logs.
      // eslint-disable-next-line no-console
      console.error('crm:test stdout:\n' + result.stdout);
      // eslint-disable-next-line no-console
      console.error('crm:test stderr:\n' + result.stderr);
    }
    expect(result.status).toBe(0);
  }, 60_000);
});
