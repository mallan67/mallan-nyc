/**
 * Release-safety P2 — control 5 tests: Release-Truth verdict hardening.
 *
 * Locks the fail-closed contract: a deploy target whose runtime proof is
 * pending/unknown must aggregate to UNVERIFIED (the pre-P2 aggregator said
 * CODE_VALID + exit 0 — the exact blind spot of the PR #523 incident, where
 * the revert-merge never deployed but everything reported green).
 */
import * as fs from 'fs';
import * as path from 'path';

/* eslint-disable @typescript-eslint/no-var-requires */
const { aggregate, decideExitCode } = require('../../scripts/release-safety/release-truth-verdict.js');

const ROOT = path.resolve(__dirname, '../..');

const cleanStatic = {
  ucba: { regressions: 0, claim_overstated: 0, blocking_failures: 0 },
  workflows: { blocking_failures: 0 },
  migration: { summary: { fail: 0 } },
};

describe('release-safety P2 — Release-Truth aggregate (fail-closed)', () => {
  test('DEPLOY_PENDING => UNVERIFIED (was CODE_VALID before P2)', () => {
    const r = aggregate({ ...cleanStatic, deploy: { verdict: 'DEPLOY_PENDING' } });
    expect(r.verdict).toBe('UNVERIFIED');
  });

  test('DEPLOY_UNKNOWN => UNVERIFIED (was CODE_VALID before P2)', () => {
    const r = aggregate({ ...cleanStatic, deploy: { verdict: 'DEPLOY_UNKNOWN' } });
    expect(r.verdict).toBe('UNVERIFIED');
  });

  test('an unrecognized deploy verdict => UNVERIFIED, never a green verdict', () => {
    const r = aggregate({ ...cleanStatic, deploy: { verdict: 'DEPLOY_BANANA' } });
    expect(r.verdict).toBe('UNVERIFIED');
  });

  test('no deploy target at all stays CODE_VALID (honestly static-only)', () => {
    const r = aggregate({ ...cleanStatic });
    expect(r.verdict).toBe('CODE_VALID');
    expect(r.reasons.join(' ')).toContain('static layers only');
  });

  test('DEPLOY_FAIL => DEPLOY_INVALID (unchanged)', () => {
    expect(aggregate({ ...cleanStatic, deploy: { verdict: 'DEPLOY_FAIL' } }).verdict).toBe('DEPLOY_INVALID');
  });

  test('Preview success can NEVER become PROD_PROVEN (caps at PREVIEW_PROVEN)', () => {
    const r = aggregate({ ...cleanStatic, deploy: { verdict: 'DEPLOY_PREVIEW' } });
    expect(r.verdict).toBe('PREVIEW_PROVEN');
    expect(r.verdict).not.toBe('PROD_PROVEN');
    // Even WITH passing smoke evidence, a preview deployment is not production:
    const withSmoke = aggregate({
      ...cleanStatic,
      deploy: { verdict: 'DEPLOY_PREVIEW' },
      smoke: { passed: true },
    });
    expect(withSmoke.verdict).toBe('PREVIEW_PROVEN');
  });

  test('DEPLOY_PASS (checks green, no production-alias proof) => UNVERIFIED, never PROD_PROVEN', () => {
    const r = aggregate({ ...cleanStatic, deploy: { verdict: 'DEPLOY_PASS' } });
    expect(r.verdict).toBe('UNVERIFIED');
    expect(r.reasons.join(' ')).toContain('production-alias proof missing');
  });

  test('PROD_PROVEN requires BOTH production-alias proof AND passing smoke evidence', () => {
    const both = aggregate({
      ...cleanStatic,
      deploy: { verdict: 'DEPLOY_PROD_PROVEN' },
      smoke: { passed: true },
    });
    expect(both.verdict).toBe('PROD_PROVEN');
    const proofOnly = aggregate({ ...cleanStatic, deploy: { verdict: 'DEPLOY_PROD_PROVEN' } });
    expect(proofOnly.verdict).toBe('UNVERIFIED');
    expect(proofOnly.reasons.join(' ')).toContain('smoke evidence missing');
    const failedSmoke = aggregate({
      ...cleanStatic,
      deploy: { verdict: 'DEPLOY_PROD_PROVEN' },
      smoke: { passed: false, reason: 'canonical 500' },
    });
    expect(failedSmoke.verdict).toBe('PARTIAL');
  });

  test('regressions, partials and overstated claims still dominate (unchanged)', () => {
    expect(aggregate({ ...cleanStatic, ucba: { ...cleanStatic.ucba, regressions: 2 } }).verdict).toBe('REGRESSION');
    expect(aggregate({ ...cleanStatic, workflows: { blocking_failures: 1 } }).verdict).toBe('PARTIAL');
    expect(aggregate({ ...cleanStatic, ucba: { ...cleanStatic.ucba, claim_overstated: 1 } }).verdict).toBe('CLAIM_OVERSTATED');
    expect(
      aggregate({ ...cleanStatic, deploy: { verdict: 'DEPLOY_PASS' }, live_site: { summary: { fail: 2 } } }).verdict
    ).toBe('PARTIAL');
  });
});

describe('release-safety P2 — exit-code contract', () => {
  test('default mode preserves the historical contract', () => {
    expect(decideExitCode('PROD_PROVEN')).toBe(0);
    expect(decideExitCode('CODE_VALID')).toBe(0);
    expect(decideExitCode('UNVERIFIED')).toBe(0); // advisory default
    expect(decideExitCode('UNVERIFIED', { strict: true })).toBe(4);
    expect(decideExitCode('REGRESSION')).toBe(1);
    expect(decideExitCode('DEPLOY_INVALID')).toBe(1);
    expect(decideExitCode('PARTIAL')).toBe(2);
    expect(decideExitCode('CLAIM_OVERSTATED')).toBe(3);
  });

  test('--require-deploy-proof: ONLY PROD_PROVEN exits 0', () => {
    const opts = { requireDeployProof: true };
    expect(decideExitCode('PROD_PROVEN', opts)).toBe(0);
    expect(decideExitCode('CODE_VALID', opts)).toBe(4);
    expect(decideExitCode('PREVIEW_PROVEN', opts)).toBe(4); // preview is never production
    expect(decideExitCode('UNVERIFIED', opts)).toBe(4);
    expect(decideExitCode('REGRESSION', opts)).toBe(1);
    expect(decideExitCode('DEPLOY_INVALID', opts)).toBe(1);
    expect(decideExitCode('PARTIAL', opts)).toBe(2);
    expect(decideExitCode('CLAIM_OVERSTATED', opts)).toBe(3);
    expect(decideExitCode('SOMETHING_NEW', opts)).toBe(4); // fail closed
  });

  test('advisory mode: PREVIEW_PROVEN exits 0 (PR evaluation stays advisory)', () => {
    expect(decideExitCode('PREVIEW_PROVEN')).toBe(0);
  });
});

describe('release-safety P2 — deploy-validator + workflow wiring pins (static)', () => {
  const normalize = (s: string) => s.replace(/\r\n/g, '\n');
  const releaseStatus = normalize(fs.readFileSync(path.join(ROOT, 'scripts', 'validate-release-status.js'), 'utf8'));
  const workflow = normalize(fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'release-truth.yml'), 'utf8'));

  test('Vercel Preview Comments success is preview-only evidence, never deploy proof', () => {
    expect(releaseStatus).toContain("state: 'preview-only'");
    expect(releaseStatus).not.toContain('Preview Comments check ran and passed → deploy completed');
  });

  test('absent required checks are fail-closed into pending', () => {
    expect(releaseStatus).toMatch(/state: 'absent' \}\);\n\s*evaluation\.evaluation\.pending\.push\(name\);\n\s*continue;/);
  });

  test('a PR target caps at DEPLOY_PREVIEW', () => {
    expect(releaseStatus).toContain("prNum ? 'DEPLOY_PREVIEW' : 'DEPLOY_PASS'");
  });

  test('the workflow invokes the alias-aware verifier for the production gate and runs the aggregator ONCE', () => {
    expect(workflow).toContain('verify-deployment-sha.js');
    expect(workflow).toContain('--deploy-proof deploy-proof.json');
    // exactly ONE aggregator execution (single JSON source of truth):
    const invocations = workflow.match(/node scripts\/release-truth-check\.js/g) || [];
    expect(invocations).toHaveLength(1);
    // the aggregator's stderr is preserved to a file (never sent to /dev/null):
    expect(workflow).toMatch(/release-truth-check\.js[^\n]*2> release-truth\.stderr/);
    expect(workflow).not.toMatch(/release-truth-check\.js[^\n]*2>\/dev\/null/);
    // PR events never production-gated:
    expect(workflow).toContain(`github.event_name }}" != "pull_request"`);
  });

  test('release-truth-check.js accepts the P2 proof/evidence layers', () => {
    const script = fs.readFileSync(path.join(ROOT, 'scripts', 'release-truth-check.js'), 'utf8');
    expect(script).toContain("argFlag('--deploy-proof')");
    expect(script).toContain("argFlag('--smoke-evidence')");
    expect(script).toContain('DEPLOY_PROD_PROVEN');
  });
});

describe('release-safety P2 — CLI wiring pins (static)', () => {
  const script = fs.readFileSync(path.join(ROOT, 'scripts', 'release-truth-check.js'), 'utf8');

  test('release-truth-check.js consumes the shared verdict module', () => {
    expect(script).toContain("require('./release-safety/release-truth-verdict.js')");
    expect(script).toContain("has('--require-deploy-proof')");
    expect(script).toContain('decideExitCode(final.verdict');
  });

  test('the old inline pending/unknown => CODE_VALID branch is gone', () => {
    expect(script).not.toContain("deploy pending' — code is sound");
    expect(script).not.toContain('code is sound but deploy not proven');
  });
});
