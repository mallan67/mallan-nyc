/// <reference types="jest" />
/**
 * Phase 0.5 (Codex follow-up) — ops:health neon-branch-prune issue policy.
 *
 * Pins scripts/branch-prune-health.js, the pure status->issue derivation that
 * scripts/ops-health.js uses. The load-bearing new case: a `refused` audit event
 * (Phase 0.5 guard blocking every prune on a non-canonical NEON_PROJECT_ID) MUST
 * surface as a critical issue — otherwise ops:health stays green while the daily
 * prune is silently blocked (the gap Codex flagged on PR #371).
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { deriveBranchPruneIssues } = require('@/scripts/branch-prune-health');

const THRESHOLDS = { branch_count_warning: 25, branch_count_critical: 4000 };

type Issue = { level: 'critical' | 'warning'; category: string; msg: string };
const derive = (p: Record<string, unknown>): Issue[] =>
  deriveBranchPruneIssues({ thresholds: THRESHOLDS, ...p });

describe('deriveBranchPruneIssues — neon-branch-prune ops:health policy', () => {
  it('REFUSED (recent, no examined) → exactly one CRITICAL issue (the Codex gap)', () => {
    const issues = derive({ status: 'refused', ageHours: 0.2, projectId: 'morning-bread-68708332' });
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe('critical');
    expect(issues[0].category).toBe('neon-prune');
    expect(issues[0].msg).toMatch(/REFUSING/);
    expect(issues[0].msg).toContain('morning-bread-68708332');
  });

  it('refused takes precedence over staleness (still critical, not a stale warning)', () => {
    const issues = derive({ status: 'refused', ageHours: 100, projectId: 'x' });
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe('critical');
    expect(issues[0].msg).toMatch(/REFUSING/);
  });

  it('skipped → critical (missing env listed)', () => {
    const issues = derive({ status: 'skipped', ageHours: 0.1, missing: ['NEON_PROJECT_ID'] });
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe('critical');
    expect(issues[0].msg).toContain('NEON_PROJECT_ID');
  });

  it('error → critical', () => {
    const issues = derive({ status: 'error', ageHours: 0.1, error: 'Neon API 500' });
    expect(issues[0].level).toBe('critical');
    expect(issues[0].msg).toContain('Neon API 500');
  });

  it('partial → warning', () => {
    const issues = derive({ status: 'partial', ageHours: 0.1, errorsCount: 2 });
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe('warning');
  });

  it('stale (ok but >25h) → warning', () => {
    const issues = derive({ status: 'ok', ageHours: 30, examined: 8 });
    expect(issues.some((i) => i.level === 'warning' && /last fired/.test(i.msg))).toBe(true);
  });

  it('ok, recent, small examined → NO issues', () => {
    expect(derive({ status: 'ok', ageHours: 1, examined: 8 })).toHaveLength(0);
  });

  it('examined >= critical threshold → critical (additive to status)', () => {
    const issues = derive({ status: 'ok', ageHours: 1, examined: 4500 });
    expect(issues.some((i) => i.level === 'critical')).toBe(true);
  });

  it('examined >= warning threshold → warning', () => {
    const issues = derive({ status: 'ok', ageHours: 1, examined: 30 });
    expect(issues.some((i) => i.level === 'warning' && /branches examined/.test(i.msg))).toBe(true);
  });

  it('refused AND high examined → two issues (both criticals surface)', () => {
    const issues = derive({ status: 'refused', ageHours: 0.1, projectId: 'x', examined: 4500 });
    expect(issues.filter((i) => i.level === 'critical')).toHaveLength(2);
  });
});
