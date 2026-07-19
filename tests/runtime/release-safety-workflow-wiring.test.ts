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
    expect(rt).toContain('RELEASE_TRUTH_REQUIRE_DEPLOY_PROOF');
  });

  test('vercel.json cron cadences are untouched by P2 (COTALITY-10 is a separate stage)', () => {
    const vercel = JSON.parse(read('vercel.json'));
    const bySchedule = Object.fromEntries(
      (vercel.crons || []).map((c: { path: string; schedule: string }) => [c.path, c.schedule])
    );
    expect(bySchedule['/api/cron/idx-sync']).toBe('*/30 * * * *');
    expect(bySchedule['/api/cron/media-sync']).toBe('0 * * * *');
  });

  test('P2 scripts exist where the runbook points', () => {
    for (const rel of [
      'scripts/release-safety/listing-smoke.js',
      'scripts/release-safety/verify-deployment-sha.js',
      'scripts/release-safety/record-known-good.js',
      'scripts/release-safety/release-truth-verdict.js',
      'scripts/release-safety/import-graph.js',
      'docs/operations/release-safety-runbook.md',
    ]) {
      expect(fs.existsSync(path.join(ROOT, rel))).toBe(true);
    }
  });
});
