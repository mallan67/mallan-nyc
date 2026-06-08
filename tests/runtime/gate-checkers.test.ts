/// <reference types="jest" />
/**
 * MICRO + MACRO gate checkers — unit tests (the "checkers in place").
 *
 * Proves the pure gate logic (scripts/ci/gate-lib.js): test-first enforcement
 * (micro), Trace-Record + blast-radius + fail-closed unknown-domain + domain
 * mapping (macro), generated/config handling, test-exemption-with-reason, and
 * the basic Trace-Record validity checker. Runs in the harness so the gates'
 * own policy can't silently regress.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const gate = require('@/scripts/ci/gate-lib');

interface GateIssue { level: string; rule: string; msg: string }

describe('MICRO gate — test-first enforcement', () => {
  it('FAILS when non-test code changes without any test', () => {
    const issues: GateIssue[] = gate.microGateIssues(['app/api/crm/offers/[id]/transmit/route.ts']);
    expect(issues.some((i: GateIssue) => i.rule === 'test-first')).toBe(true);
  });
  it('PASSES when code + a test change together', () => {
    expect(gate.microGateIssues(['app/api/crm/x/route.ts', 'tests/runtime/x.test.ts'])).toHaveLength(0);
  });
  it('PASSES for docs-only changes (no false fail)', () => {
    expect(gate.microGateIssues(['docs/foo.md', 'docs/audits/bar.md'])).toHaveLength(0);
  });
  it('PASSES for test-only changes', () => {
    expect(gate.microGateIssues(['tests/runtime/x.test.ts'])).toHaveLength(0);
  });
  // NOTE: the gate-tooling bootstrap exemption is now NARROWED (G3) — gate
  // scripts bypass test-first ONLY when tests/runtime/gate-checkers.test.ts is
  // also in the diff. See the dedicated "narrowed gate-tooling" describe below.
  it('generated artifacts do NOT bypass the rule (still need a test for the real code)', () => {
    // a real code file + a regenerated artifact, no test → still fails
    const issues: GateIssue[] = gate.microGateIssues([
      'app/api/crm/x/route.ts',
      'public/crm/data/validator-results.json',
    ]);
    expect(issues.some((i: GateIssue) => i.rule === 'test-first')).toBe(true);
  });
  it('generated artifact alone does NOT require a test', () => {
    expect(gate.microGateIssues(['public/crm/data/validator-results.json'])).toHaveLength(0);
  });
  it('config-only change does NOT require a test', () => {
    expect(gate.microGateIssues(['package.json'])).toHaveLength(0);
  });
  it('allows an EXPLICIT test-exemption only with a reason', () => {
    const withReason = gate.microGateIssues(['app/api/crm/x/route.ts'], { testExemptReason: 'pure type-only refactor, covered by type-check' });
    expect(withReason).toHaveLength(0);
    const noReason = gate.microGateIssues(['app/api/crm/x/route.ts'], { testExemptReason: '' });
    expect(noReason.some((i: GateIssue) => i.rule === 'test-first')).toBe(true);
  });
});

describe('MACRO gate — Trace Record + blast radius + domains + fail-closed unknown', () => {
  it('FAILS when code changes without a Correction Trace Record', () => {
    const { issues } = gate.macroGateIssues(['app/api/crm/x/route.ts', 'tests/runtime/x.test.ts']);
    expect(issues.some((i: GateIssue) => i.rule === 'trace-record')).toBe(true);
  });
  it('PASSES with a Trace Record present', () => {
    const { issues } = gate.macroGateIssues([
      'app/api/crm/x/route.ts',
      'tests/runtime/x.test.ts',
      'docs/audits/corrections/U4-offer-transmit-ownership.md',
    ]);
    expect(issues).toHaveLength(0);
  });
  it('FAILS CLOSED on a code file in an UNKNOWN domain (outside the known tree)', () => {
    const { issues } = gate.macroGateIssues([
      'weird/place/thing.ts',
      'tests/runtime/x.test.ts',
      'docs/audits/corrections/U4.md',
    ]);
    expect(issues.some((i: GateIssue) => i.rule === 'unknown-domain')).toBe(true);
  });
  it('an unknown file can be explicitly classified (allowlist) to pass', () => {
    const { issues } = gate.macroGateIssues(
      ['weird/place/thing.ts', 'tests/runtime/x.test.ts', 'docs/audits/corrections/U4.md'],
      { classifiedAllow: ['weird/place/thing.ts'] },
    );
    expect(issues.some((i: GateIssue) => i.rule === 'unknown-domain')).toBe(false);
  });
  it('FLAGS files changed OUTSIDE the declared blast radius', () => {
    const { issues } = gate.macroGateIssues(
      ['app/api/a.ts', 'app/api/b.ts', 'tests/runtime/x.test.ts', 'docs/audits/corrections/U4.md'],
      { declaredRadius: ['app/api/a.ts'] },
    );
    expect(issues.some((i: GateIssue) => i.rule === 'blast-radius')).toBe(true);
  });
  it('maps files to domains + required gates (compliance/auth/api get specific gates)', () => {
    const domains = gate.mapDomains([
      'app/api/portal/offers/route.ts',
      'lib/media/x.ts',
      'lib/compliance/status.ts',
      'lib/auth/middleware.ts',
    ]);
    expect(Object.keys(domains)).toEqual(expect.arrayContaining(['portal', 'media', 'compliance', 'auth']));
    expect(domains.portal.gates).toContain('security-agent');
    expect(domains.compliance.gates).toContain('tristle');
  });
  it('treats the _TEMPLATE as NOT a Trace Record', () => {
    expect(gate.isTraceRecord('docs/audits/corrections/_TEMPLATE.md')).toBe(false);
    expect(gate.isTraceRecord('docs/audits/corrections/U4-x.md')).toBe(true);
  });
});

describe('Trace-Record validity checker (basic; full parsing is a G2-hardening follow-up)', () => {
  it('PLANNED record needs nothing filled', () => {
    const { issues } = gate.traceRecordIssues('## 0. Header\n- **Status:** PLANNED\n## 1. Defect\n- **RED proof:** …');
    expect(issues).toHaveLength(0);
  });
  it('SETTLED record with a blank RED proof FAILS', () => {
    const md = '- **Status:** SETTLED\n## 1. Defect\n- **RED proof:** …\n## 2. blast\n## 9. Permanent regression guard\n- tests/runtime/x.test.ts';
    const { issues } = gate.traceRecordIssues(md);
    expect(issues.some((i: GateIssue) => i.rule === 'red-proof-blank')).toBe(true);
  });
  it('SETTLED record with a grep-only RED proof FAILS', () => {
    const md = '- **Status:** SETTLED\n## 1. Defect\n- **RED proof:** grep showed the missing check at route.ts:51\n## 9. Permanent regression guard\n- tests/runtime/x.test.ts';
    const { issues } = gate.traceRecordIssues(md);
    expect(issues.some((i: GateIssue) => i.rule === 'red-proof-grep-only')).toBe(true);
  });
  it('SETTLED record with a real failing test RED proof + regression guard PASSES', () => {
    const md = '- **Status:** SETTLED\n## 1. Defect\n- **RED proof:** captured output of the failing test tests/runtime/x.test.ts (RED before fix)\n## 9. Permanent regression guard\n- tests/runtime/x.test.ts';
    const { issues } = gate.traceRecordIssues(md);
    expect(issues).toHaveLength(0);
  });
  it('SETTLED record with no regression guard FAILS', () => {
    const md = '- **Status:** SETTLED\n## 1. Defect\n- **RED proof:** failing test tests/runtime/x.test.ts captured RED\n## 9. Permanent regression guard\n- ▢';
    const { issues } = gate.traceRecordIssues(md);
    expect(issues.some((i: GateIssue) => i.rule === 'regression-guard')).toBe(true);
  });
});

describe('extractDeclaredRadius — auto-parse §2 WILL touch', () => {
  it('extracts exact code-file paths from §2', () => {
    const md = `
## 2. Pre-registered blast radius
- **WILL touch (direct):**
  - \`app/api/crm/offers/[id]/transmit/route.ts\`
  - \`tests/runtime/offer-transmit.test.ts\`
## 3. next
`;
    expect(gate.extractDeclaredRadius(md)).toEqual([
      'app/api/crm/offers/[id]/transmit/route.ts',
      'tests/runtime/offer-transmit.test.ts',
    ]);
  });
  it('ignores placeholders / ellipsis / angle-bracket paths', () => {
    const md = `
## 2. Pre-registered blast radius
- \`…/offer-transmit/route.ts:~54\`
- \`<test file>\`
- \`app/api/crm/x/route.ts\`
## 3. next
`;
    expect(gate.extractDeclaredRadius(md)).toEqual(['app/api/crm/x/route.ts']);
  });
  it('returns [] when there is no §2 section', () => {
    expect(gate.extractDeclaredRadius('## 1. Defect\nno blast radius here')).toEqual([]);
  });
});

describe('MICRO gate — narrowed gate-tooling bootstrap exemption (G3)', () => {
  it('gate tooling change WITHOUT its gate test FAILS test-first', () => {
    const issues: GateIssue[] = gate.microGateIssues(['scripts/ci/gate-lib.js']);
    expect(issues.some((i) => i.rule === 'test-first')).toBe(true);
  });
  it('gate tooling change WITH tests/runtime/gate-checkers.test.ts PASSES', () => {
    expect(
      gate.microGateIssues(['scripts/ci/gate-lib.js', 'tests/runtime/gate-checkers.test.ts']),
    ).toHaveLength(0);
  });
});

describe('exemptionIssues — exemption must be recorded in a Trace Record', () => {
  const REASON = 'pure type-only refactor, covered by type-check';
  it('exemption used but NO Trace Record in the diff → fails', () => {
    const issues: GateIssue[] = gate.exemptionIssues(['app/api/crm/x/route.ts'], REASON, {
      readFile: () => '',
    });
    expect(issues.some((i) => i.rule === 'exemption-trace-record')).toBe(true);
  });
  it('Trace Record present but reason NOT in it → fails', () => {
    const issues: GateIssue[] = gate.exemptionIssues(
      ['app/api/crm/x/route.ts', 'docs/audits/corrections/U4.md'],
      REASON,
      { readFile: () => 'a record that does not mention the reason' },
    );
    expect(issues.some((i) => i.rule === 'exemption-not-recorded')).toBe(true);
  });
  it('exact reason recorded in the Trace Record → passes', () => {
    const issues: GateIssue[] = gate.exemptionIssues(
      ['app/api/crm/x/route.ts', 'docs/audits/corrections/U4.md'],
      REASON,
      { readFile: () => `…\nTEST-EXEMPT: ${REASON}\n…` },
    );
    expect(issues).toHaveLength(0);
  });
  it('no exemption claimed → no issues', () => {
    expect(gate.exemptionIssues(['app/api/crm/x/route.ts'], '')).toHaveLength(0);
  });
});

describe('declaredRadiusMissingIssue — macro must parse a radius when code + record present', () => {
  it('code + Trace Record but EMPTY declared radius → fails', () => {
    const issue = gate.declaredRadiusMissingIssue(
      ['app/api/crm/x/route.ts', 'docs/audits/corrections/U4.md'],
      [],
    );
    expect(issue && issue.rule).toBe('declared-radius-missing');
  });
  it('code + Trace Record + a parsed radius → null', () => {
    const issue = gate.declaredRadiusMissingIssue(
      ['app/api/crm/x/route.ts', 'docs/audits/corrections/U4.md'],
      ['app/api/crm/x/route.ts'],
    );
    expect(issue).toBeNull();
  });
  it('docs-only change → null (no code, nothing to declare)', () => {
    expect(gate.declaredRadiusMissingIssue(['docs/x.md'], [])).toBeNull();
  });
});
