/// <reference types="jest" />
/**
 * MICRO + MACRO gate checkers — unit tests (the "checkers in place").
 *
 * Proves the pure gate logic (scripts/ci/gate-lib.js) used by the micro-gate
 * and macro-gate runners: test-first enforcement (micro), Trace-Record +
 * blast-radius reconciliation + domain mapping (macro). Runs in the harness so
 * the gates' own policy can't silently regress.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const gate = require('@/scripts/ci/gate-lib');

describe('MICRO gate — test-first enforcement', () => {
  it('FAILS when code changes without any test in the diff', () => {
    const issues = gate.microGateIssues(['app/api/crm/offers/[id]/transmit/route.ts']);
    expect(issues.some((i: { rule: string }) => i.rule === 'test-first')).toBe(true);
  });
  it('PASSES when code + a test change together', () => {
    expect(
      gate.microGateIssues(['app/api/crm/x/route.ts', 'tests/runtime/x.test.ts']),
    ).toHaveLength(0);
  });
  it('PASSES for docs-only changes (no code)', () => {
    expect(gate.microGateIssues(['docs/foo.md', 'docs/bar.md'])).toHaveLength(0);
  });
  it('does NOT block the gate tooling itself (bootstrap exemption)', () => {
    expect(gate.microGateIssues(['scripts/ci/gate-lib.js'])).toHaveLength(0);
  });
});

describe('MACRO gate — Trace Record + blast radius + domains', () => {
  it('FAILS when code changes without a Correction Trace Record', () => {
    const { issues } = gate.macroGateIssues(['app/api/crm/x/route.ts', 'tests/runtime/x.test.ts']);
    expect(issues.some((i: { rule: string }) => i.rule === 'trace-record')).toBe(true);
  });
  it('PASSES with a Trace Record present', () => {
    const { issues } = gate.macroGateIssues([
      'app/api/crm/x/route.ts',
      'tests/runtime/x.test.ts',
      'docs/audits/corrections/U4-offer-transmit-ownership.md',
    ]);
    expect(issues).toHaveLength(0);
  });
  it('FLAGS files changed OUTSIDE the pre-registered blast radius (no dark work)', () => {
    const { issues } = gate.macroGateIssues(
      ['app/api/a.ts', 'app/api/b.ts', 'tests/runtime/x.test.ts', 'docs/audits/corrections/U4.md'],
      { declaredRadius: ['app/api/a.ts'] },
    );
    expect(issues.some((i: { rule: string }) => i.rule === 'blast-radius')).toBe(true);
  });
  it('maps files to their domains + required gates', () => {
    const domains = gate.mapDomains([
      'app/api/portal/offers/route.ts',
      'lib/media/x.ts',
      'lib/compliance/status.ts',
    ]);
    expect(Object.keys(domains)).toEqual(expect.arrayContaining(['portal', 'media', 'compliance']));
    expect(domains.portal.gates).toContain('security-agent');
    expect(domains.compliance.gates).toContain('tristle');
  });
  it('treats the _TEMPLATE as NOT a Trace Record (only real records count)', () => {
    expect(gate.isTraceRecord('docs/audits/corrections/_TEMPLATE.md')).toBe(false);
    expect(gate.isTraceRecord('docs/audits/corrections/U4-x.md')).toBe(true);
  });
});
