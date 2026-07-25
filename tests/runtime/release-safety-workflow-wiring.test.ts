/**
 * Release-safety P2 — control 8: workflow-wiring regression pins.
 *
 * Static assertions that keep the P2 wiring true over time. Each pin states
 * what it proves — and only that. A green pin proves the WIRING TEXT exists;
 * it does not prove any workflow ran (that is runtime/PRODUCTION evidence).
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('release-safety P2 — workflow wiring pins', () => {
  test('root jest config includes the tests/runtime project (new tests auto-run in PR CI)', () => {
    const rootJest = read('jest.config.js');
    expect(rootJest).toContain('tests/runtime/jest.config.js');
  });

  test('pr-check runs jest with --ci (the runtime suite is a real PR gate step)', () => {
    const prCheck = read('.github/workflows/pr-check.yml');
    expect(prCheck).toMatch(/npx jest --ci/);
  });

  test('live-site-cron propagates failure (no silent-green hourly runs)', () => {
    const cron = read('.github/workflows/live-site-cron.yml');
    expect(cron).toContain('Propagate failure');
    // The propagate step must fail on nonzero exit, invalid JSON, or fails>0:
    expect(cron).toMatch(/rc != '0' \|\| steps\.validator\.outputs\.json_ok != '1' \|\| steps\.validator\.outputs\.fails != '0'/);
    expect(cron).toMatch(/exit 1/);
  });

  test('live-site-cron runs the validator exactly ONCE (no double production probing)', () => {
    const cron = read('.github/workflows/live-site-cron.yml');
    const invocations = cron.match(/node scripts\/validate-live-site\.js/g) || [];
    expect(invocations).toHaveLength(1);
    // stderr preserved, JSON validity enforced:
    expect(cron).toContain('live-site.stderr');
    expect(cron).toContain('json_ok');
  });

  test('live-site summary validation is strict: all four counters must be finite nonnegative numbers, checks an array', () => {
    const cron = read('.github/workflows/live-site-cron.yml');
    expect(cron).toContain('Number.isFinite');
    expect(cron).toMatch(/isCount\(s\.pass\).*isCount\(s\.fail\).*isCount\(s\.blocked\).*isCount\(s\.unverified\)/s);
    expect(cron).toContain('Array.isArray(d.checks)');
    // malformed blocked/unverified are never defaulted to zero:
    expect(cron).not.toContain('s.blocked || 0');
    expect(cron).not.toContain('s.unverified || 0');
  });

  test('live-site-cron does not claim BLOCKED/UNVERIFIED results as fully clean', () => {
    const cron = read('.github/workflows/live-site-cron.yml');
    expect(cron).toContain('PASS-WITH-GAPS');
  });

  test('live-site-cron does NOT run the five-probe listing smoke hourly (Neon cost boundary)', () => {
    const cron = read('.github/workflows/live-site-cron.yml');
    expect(cron).not.toContain('listing-smoke.js --base-url');
    // Cadence unchanged: hourly.
    expect(cron).toContain("cron: '0 * * * *'");
  });

  test('release-truth posts a fail-closed commit status (default pending, never default success)', () => {
    const rt = read('.github/workflows/release-truth.yml');
    expect(rt).toContain('state="pending"');
    expect(rt).not.toMatch(/^\s*state="success"\s*$\n(?=\s*case)/m);
  });

  test('release-truth production proof is TOKEN-FREE (no Vercel secret; public identity endpoint)', () => {
    const rt = read('.github/workflows/release-truth.yml');
    // No Vercel API credential is referenced anywhere in the workflow.
    expect(rt).not.toMatch(/secrets\.VERCEL_TOKEN/);
    expect(rt).not.toMatch(/vars\.VERCEL_TEAM_ID/);
    expect(rt).not.toMatch(/vars\.RELEASE_TRUTH_REQUIRE_DEPLOY_PROOF/);
    // Proof comes from asking the production alias itself.
    expect(rt).toContain('verify-release-identity.js');
    expect(rt).toContain('/api/release-identity');
    // It still feeds BOTH proofs to the aggregator.
    expect(rt).toContain('--deploy-proof deploy-proof.json');
    expect(rt).toContain('--smoke-evidence smoke.json');
  });

  test('release-truth runs the two-phase identity check (pre-smoke MATCH + post-smoke reconfirm)', () => {
    const rt = read('.github/workflows/release-truth.yml');
    // Phase 1 verify, then smoke, then phase 2 reconfirm — TOCTOU guard.
    expect(rt).toMatch(/verify-release-identity\.js[\s\S]*listing-smoke\.js[\s\S]*--reconfirm deploy-proof\.json/);
    // On a reconfirm failure BOTH proofs are discarded (fail closed) so the
    // aggregator cannot reach PROD_PROVEN.
    expect(rt).toMatch(/rm -f deploy-proof\.json smoke\.json/);
    // The enforce-gate fails the run on a phase-1 non-MATCH OR a phase-2 reject.
    expect(rt).toContain('reconfirm_rc');
  });

  test('the production-proof steps are EVENT-gated so PR events stay advisory (GH \'\' == \'0\' coercion guard)', () => {
    // GitHub coerces a skipped step\'s empty rc: `'' == '0'` becomes numeric
    // 0 == 0 = TRUE. Relying on `steps.verify.outputs.rc == '0'` alone made
    // smoke/reconfirm/enforce run on PRs and fail the run. All four
    // production-proof steps must be gated on push-to-main OR workflow_dispatch.
    const rt = read('.github/workflows/release-truth.yml');
    const eventGate = /\(github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'\) \|\| github\.event_name == 'workflow_dispatch'/g;
    // verify + smoke + reconfirm + enforce == 4 occurrences.
    expect((rt.match(eventGate) || []).length).toBeGreaterThanOrEqual(4);
    // The enforce gate in particular must carry the event gate (its absence is
    // exactly what failed PR #565's run on the token-free commit).
    expect(rt).toMatch(/Enforce production gate[\s\S]*github\.event_name == 'push'[\s\S]*reconfirm_rc/);
  });

  test('feed + media sync run on the unified One Cycle cadence (*/10), not independent crons', () => {
    // W2 unification (2026-07-24): the standalone idx-sync (*/30) and
    // media-sync (hourly) cron entries were replaced by /api/cron/one-cycle
    // (*/10), which invokes both in-process on ONE 10-minute timeline.
    const vercel = JSON.parse(read('vercel.json'));
    const bySchedule = Object.fromEntries(
      (vercel.crons || []).map((c: { path: string; schedule: string }) => [c.path, c.schedule])
    );
    expect(bySchedule['/api/cron/idx-sync']).toBeUndefined();
    expect(bySchedule['/api/cron/media-sync']).toBeUndefined();
    expect(bySchedule['/api/cron/one-cycle']).toBe('*/10 * * * *');
  });

  test('P2 scripts exist where the runbook points', () => {
    for (const rel of [
      'scripts/release-safety/listing-smoke.js',
      'scripts/release-safety/verify-deployment-sha.js',
      'scripts/release-safety/verify-release-identity.js',
      'scripts/release-safety/record-known-good.js',
      'scripts/release-safety/release-truth-verdict.js',
      'scripts/release-safety/import-graph.js',
      'app/api/release-identity/route.ts',
      'docs/operations/release-safety-runbook.md',
    ]) {
      expect(fs.existsSync(path.join(ROOT, rel))).toBe(true);
    }
  });
});
