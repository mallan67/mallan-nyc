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
const {
  aggregate,
  decideExitCode,
  evaluateRequiredCheckRequirement,
} = require('../../scripts/release-safety/release-truth-verdict.js');

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

  const SHA_A = 'a'.repeat(40);
  const SHA_B = 'b'.repeat(40);
  const boundProof = {
    verdict: 'DEPLOY_PROD_PROVEN',
    deployed_sha: SHA_A,
    deployment_id: 'dpl_prod1',
    alias_host: 'mallan.nyc',
  };
  const boundSmoke = {
    passed: true,
    expected_sha: SHA_A,
    deployment_id: 'dpl_prod1',
    base_url: 'https://mallan.nyc',
    observed_at: '2026-07-19T12:00:00.000Z',
    required_probes_ok: true,
  };

  test('PROD_PROVEN requires production-alias proof AND smoke evidence BOUND to the same deployment', () => {
    const both = aggregate({ ...cleanStatic, deploy: boundProof, smoke: boundSmoke });
    expect(both.verdict).toBe('PROD_PROVEN');
    const proofOnly = aggregate({ ...cleanStatic, deploy: boundProof });
    expect(proofOnly.verdict).toBe('UNVERIFIED');
    expect(proofOnly.reasons.join(' ')).toContain('smoke evidence missing');
    const failedSmoke = aggregate({
      ...cleanStatic,
      deploy: boundProof,
      smoke: { ...boundSmoke, passed: false, reason: 'canonical 500' },
    });
    expect(failedSmoke.verdict).toBe('PARTIAL');
  });

  test('binding: OLD smoke (different SHA) + new deployment proof can NEVER produce PROD_PROVEN', () => {
    const r = aggregate({
      ...cleanStatic,
      deploy: boundProof,
      smoke: { ...boundSmoke, expected_sha: SHA_B },
    });
    expect(r.verdict).toBe('UNVERIFIED');
    expect(r.reasons.join(' ')).toContain('identity mismatch');
    expect(r.reasons.join(' ')).toContain('does not equal the proven deployed sha');
  });

  test('binding: matching SHA but DIFFERENT deployment id can NEVER produce PROD_PROVEN', () => {
    const r = aggregate({
      ...cleanStatic,
      deploy: boundProof,
      smoke: { ...boundSmoke, deployment_id: 'dpl_other' },
    });
    expect(r.verdict).toBe('UNVERIFIED');
    expect(r.reasons.join(' ')).toContain('does not equal the proven deployment');
  });

  test('binding: smoke against a Preview URL cannot prove mallan.nyc', () => {
    const r = aggregate({
      ...cleanStatic,
      deploy: boundProof,
      smoke: { ...boundSmoke, base_url: 'https://mallan-abc123-preview.vercel.app' },
    });
    expect(r.verdict).toBe('UNVERIFIED');
    expect(r.reasons.join(' ')).toContain('is not the proven alias host');
  });

  test('binding: missing observed_at or unproven required probes block PROD_PROVEN', () => {
    expect(
      aggregate({ ...cleanStatic, deploy: boundProof, smoke: { ...boundSmoke, observed_at: undefined } }).verdict
    ).toBe('UNVERIFIED');
    expect(
      aggregate({ ...cleanStatic, deploy: boundProof, smoke: { ...boundSmoke, required_probes_ok: false } }).verdict
    ).toBe('UNVERIFIED');
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

describe('release-safety P2 — required-check integration binding', () => {
  const baseRun = {
    name: 'secured-check',
    status: 'completed',
    conclusion: 'success',
    startedAt: '2026-09-20T04:59:00Z',
    completedAt: '2026-09-20T05:00:00Z',
    url: 'https://example.test/check',
  };

  test('integration-pinned requirement ignores a same-name check from the wrong GitHub App and legacy status', () => {
    const result = evaluateRequiredCheckRequirement(
      { context: 'secured-check', integration_id: 1234 },
      [{ ...baseRun, appId: 9999 }],
      [{ context: 'secured-check', state: 'success', target_url: 'https://example.test/status' }],
    );
    expect(result.record.present).toBe(false);
    expect(result.record.state).toBe('absent');
    expect(result.pending).toBe(true);
    expect(result.failure).toBeNull();
  });

  test('newer pending rerun from the required App prevents an older success from satisfying the check', () => {
    const result = evaluateRequiredCheckRequirement(
      { context: 'secured-check', integration_id: 1234 },
      [
        { ...baseRun, appId: 1234 },
        {
          ...baseRun,
          appId: 1234,
          status: 'in_progress',
          conclusion: null,
          startedAt: '2026-09-20T05:01:00Z',
          completedAt: null,
          url: 'https://example.test/check-new',
        },
      ],
      [],
    );
    expect(result.record.state).toBe('pending');
    expect(result.pending).toBe(true);
    expect(result.failure).toBeNull();
    expect(result.record.sources).toEqual([
      expect.objectContaining({ source: 'check-run', app_id: 1234, state: 'in_progress' }),
    ]);
  });

  test('integration-pinned requirement passes only with a matching GitHub App check run', () => {
    const result = evaluateRequiredCheckRequirement(
      { context: 'secured-check', integration_id: 1234 },
      [{ ...baseRun, appId: 1234 }],
      [{ context: 'secured-check', state: 'failure', target_url: 'https://example.test/status' }],
    );
    expect(result.record.present).toBe(true);
    expect(result.record.state).toBe('success');
    expect(result.record.integration_id).toBe(1234);
    expect(result.record.sources).toEqual([
      expect.objectContaining({ source: 'check-run', app_id: 1234, state: 'success' }),
    ]);
    expect(result.pending).toBe(false);
    expect(result.failure).toBeNull();
  });

  test('unbound requirement may use a legacy commit status but remains conservative when both APIs disagree', () => {
    const statusOnly = evaluateRequiredCheckRequirement(
      { context: 'legacy-context', integration_id: null },
      [],
      [{ context: 'legacy-context', state: 'success', target_url: 'https://example.test/status' }],
    );
    expect(statusOnly.record.state).toBe('success');

    const disagree = evaluateRequiredCheckRequirement(
      { context: 'legacy-context', integration_id: null },
      [{ ...baseRun, name: 'legacy-context', appId: 9999, conclusion: 'failure' }],
      [{ context: 'legacy-context', state: 'success', target_url: 'https://example.test/status' }],
    );
    expect(disagree.record.state).toBe('failure');
    expect(disagree.failure).not.toBeNull();
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
    const result = evaluateRequiredCheckRequirement(
      { context: 'missing-check', integration_id: null },
      [],
      [],
    );
    expect(result.record).toEqual(expect.objectContaining({
      name: 'missing-check',
      present: false,
      state: 'absent',
    }));
    expect(result.pending).toBe(true);
    expect(result.failure).toBeNull();
  });

  test('GitHub proof reads are not truncated at the default page size', () => {
    expect(releaseStatus).toContain('/check-runs?per_page=100');
    expect(releaseStatus).toContain('/statuses?per_page=100');
  });

  test('a PR target caps at DEPLOY_PREVIEW', () => {
    expect(releaseStatus).toContain("prNum ? 'DEPLOY_PREVIEW' : 'DEPLOY_PASS'");
  });

  test('the workflow invokes the TOKEN-FREE identity verifier for the production gate and runs the aggregator ONCE', () => {
    // W3 (2026-07-25): the token-based alias verifier was replaced by the
    // token-free public-endpoint verifier. Proof comes from asking mallan.nyc
    // itself (GET /api/release-identity) — no Vercel API token.
    expect(workflow).toContain('verify-release-identity.js');
    expect(workflow).toContain('/api/release-identity');
    expect(workflow).not.toContain('verify-deployment-sha.js');
    expect(workflow).toContain('--deploy-proof deploy-proof.json');
    // the verifier runs in --json machine mode with stderr preserved:
    expect(workflow).toMatch(/verify-release-identity\.js[^\n]*--json > deploy-proof\.json 2> deploy-proof\.stderr/);
    // exactly ONE aggregator execution (single JSON source of truth):
    const invocations = workflow.match(/node scripts\/release-truth-check\.js/g) || [];
    expect(invocations).toHaveLength(1);
    // the aggregator's stderr is preserved to a file (never sent to /dev/null):
    expect(workflow).toMatch(/release-truth-check\.js[^\n]*2> release-truth\.stderr/);
    expect(workflow).not.toMatch(/release-truth-check\.js[^\n]*2>\/dev\/null/);
    // strict proof validation lives in the verify step:
    expect(workflow).toContain('proof rejected');
    expect(workflow).toContain('deployed_sha mismatch');
  });

  test('the workflow references NO Vercel secret or private-credential gate (fully token-free)', () => {
    // The whole point of the redesign: GitHub Actions stays independent of any
    // private Vercel credential. No token, no team id, no arming variable.
    expect(workflow).not.toMatch(/secrets\.VERCEL_TOKEN/);
    expect(workflow).not.toMatch(/vars\.VERCEL_TEAM_ID/);
    expect(workflow).not.toMatch(/vars\.RELEASE_TRUTH_REQUIRE_DEPLOY_PROOF/);
    // The production proof runs on push-to-main OR a manual dispatch (both are
    // safe: read-only public GETs) — no secret-scoping guard is needed.
    expect(workflow).toMatch(/github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  });

  test('the production proof is TWO-PHASE: pre-smoke MATCH then post-smoke reconfirm (TOCTOU guard)', () => {
    // phase 1 verify → smoke → phase 2 reconfirm, in that order.
    expect(workflow).toMatch(/verify-release-identity\.js[\s\S]*listing-smoke\.js[\s\S]*--reconfirm deploy-proof\.json/);
    // a reconfirm rejection discards BOTH proofs (fail closed):
    expect(workflow).toContain('rm -f deploy-proof.json smoke.json');
    // the enforce-gate fails the run on a phase-1 non-MATCH OR a phase-2 reject:
    expect(workflow).toContain('reconfirm_rc');
  });

  test('PR Release Truth waits boundedly and fails if dependencies never settle', () => {
    expect(workflow).toContain('Wait for PR release dependencies to settle');
    expect(workflow).toContain('seq 1 60');
    expect(workflow).toContain('validate-release-status.js --pr "$PR_NUMBER" --json');
    expect(workflow).toContain('DEPLOY_PENDING|DEPLOY_UNKNOWN) sleep 10');
    expect(workflow).toContain('dependency wait expired; exact-head proof incomplete');
    expect(workflow).toContain('exit 1');
  });

  test('deploy validator derives additional required checks from main-applicable active rulesets', () => {
    expect(releaseStatus).toContain('requiredChecksFromApplicableMainRulesets');
    expect(releaseStatus).toContain("refs/heads/main");
    expect(releaseStatus).toContain("rule?.type !== 'required_status_checks'");
    expect(releaseStatus).toContain('...rulesetDiscovery.checks');
    expect(releaseStatus).toContain('check.integration_id');
    expect(releaseStatus).toContain('appId: Number.isInteger(c.app?.id) ? c.app.id : null');
  });

  test('required-check discovery failure stays pending instead of becoming an empty required-check set', () => {
    expect(releaseStatus).toContain("ruleset-list-unavailable");
    expect(releaseStatus).toContain("ruleset-detail-unavailable:");
    expect(releaseStatus).toContain("main-ruleset-required-check-discovery");
    expect(releaseStatus).toContain("evaluation.evaluation.pending.push('main-ruleset-required-check-discovery')");
    expect(releaseStatus).not.toContain("if (!raw) return []");
  });

  test('validator delegates required-context evaluation to the integration-aware pure matcher', () => {
    expect(releaseStatus).toContain('evaluateRequiredCheckRequirement');
    expect(releaseStatus).toContain('requiredSpecs.values()');
    expect(releaseStatus).toContain('integration_id');
  });

  test('PR events invoke the aggregator with --pr (the DEPLOY_PREVIEW path), status still on the head SHA', () => {
    // The PR branch of Resolve target pairs the head SHA (checkout/status)
    // with a --pr aggregator invocation on the SAME line:
    expect(workflow).toMatch(/pull_request\.head\.sha \}\}"; args="--pr \$\{\{ github\.event\.pull_request\.number \}\}"/);
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
