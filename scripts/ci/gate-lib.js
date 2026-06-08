// Pure logic for the MICRO and MACRO gate checkers (plan PART B/G).
//
// CommonJS so both the node runners (scripts/ci/{micro,macro}-gate.js) and the
// ts-jest tests can consume it. NO git/IO here — callers pass the changed-file
// list, so the policy is deterministic and unit-testable. Fail-closed: when in
// doubt the gate raises an issue (caller exits non-zero), never silently passes.

// Path → domain + the gates/agents that MUST run when that surface is touched.
// First match wins (order matters: most-specific first).
const DOMAIN_RULES = [
  { match: /^app\/api\/portal\//,                 domain: 'portal',        gates: ['security-agent', 'workspace-isolation', 'tristle(if §D)'] },
  { match: /^app\/api\/cron\//,                    domain: 'cron',          gates: ['security-agent', 'ops-health'] },
  { match: /^app\/api\/crm\//,                     domain: 'crm',           gates: ['security-agent', 'tristle(if §D)'] },
  { match: /^app\/api\/auth\//,                    domain: 'auth',          gates: ['security-agent'] },
  { match: /^app\/api\//,                          domain: 'api',           gates: ['security-agent'] },
  { match: /^lib\/auth\//,                         domain: 'auth',          gates: ['security-agent'] },
  { match: /^lib\/(idx|search)\//,                 domain: 'search/idx',    gates: ['rebny-search-compliance-auditor', 'tristle'] },
  { match: /^lib\/media\//,                        domain: 'media',         gates: ['tristle'] },
  { match: /^lib\/compliance\//,                   domain: 'compliance',    gates: ['tristle', 'ucba/rls/idx'] },
  { match: /^app\/listing\//,                      domain: 'listing-ui',    gates: ['frontend-auditor', 'tristle'] },
  { match: /^app\/components\//,                   domain: 'ui',            gates: ['frontend-auditor'] },
  { match: /^app\/.*page\.tsx$/,                   domain: 'ui-page',       gates: ['frontend-auditor'] },
  { match: /^prisma\/(schema\.prisma|migrations\/)/, domain: 'schema',      gates: ['HELD', 'security-agent'] },
  { match: /^\.github\/workflows\//,               domain: 'ci',            gates: ['HELD', 'security-agent'] },
  { match: /^public\/crm\//,                       domain: 'crm-frontend',  gates: ['HELD', 'frontend-auditor'] },
  { match: /^scripts\//,                           domain: 'ops/tooling',   gates: ['code-reviewer'] },
];

const isTest = (f) => /(\.test\.|\.spec\.|__tests__\/)/.test(f);
const isDoc = (f) => /^docs\//.test(f) || /\.md$/.test(f);
const isCode = (f) => /\.(ts|tsx|js|mjs|cjs)$/.test(f) && !isTest(f);
const isTraceRecord = (f) => /^docs\/audits\/corrections\/.+\.md$/.test(f) && !/_TEMPLATE\.md$/.test(f);
// The gate tooling itself is exempt from requiring a test/Trace-Record (bootstrap)
// — it is covered by tests/runtime/gate-checkers.test.ts.
const isGateTooling = (f) =>
  /^scripts\/ci\/(gate-lib|micro-gate|macro-gate)\.js$/.test(f);

function classify(files) {
  return {
    code: files.filter(isCode),
    tests: files.filter(isTest),
    docs: files.filter(isDoc),
    traceRecords: files.filter(isTraceRecord),
  };
}

function mapDomains(files) {
  const out = {};
  for (const f of files) {
    for (const r of DOMAIN_RULES) {
      if (r.match.test(f)) {
        if (!out[r.domain]) out[r.domain] = { gates: r.gates, files: [] };
        out[r.domain].files.push(f);
        break;
      }
    }
  }
  return out;
}

/**
 * MICRO gate — local correctness. Every code change must ship a test change in
 * the same diff (test-first / §F failing-test-flips-green). Gate tooling is the
 * only bootstrap exemption. Returns [] when clean.
 */
function microGateIssues(files) {
  const { code, tests } = classify(files);
  const issues = [];
  const realCode = code.filter((f) => !isGateTooling(f));
  if (realCode.length > 0 && tests.length === 0) {
    issues.push({
      level: 'fail',
      rule: 'test-first',
      msg: `${realCode.length} code file(s) changed but NO test changed in the diff. Add a failing-test-flips-green (§F): ${realCode.slice(0, 5).join(', ')}${realCode.length > 5 ? ' …' : ''}`,
    });
  }
  return issues;
}

/**
 * MACRO gate — whole-system impact. Every code change must ship a Correction
 * Trace Record (plan §G2). Reports the blast-radius domains + required gates so
 * the touched-but-not-home surfaces get verified. If a declared blast radius is
 * supplied (parsed from the record), flags any code file changed OUTSIDE it
 * ("no work in the dark"). Returns { issues, domains }.
 */
function macroGateIssues(files, opts = {}) {
  const { code, traceRecords } = classify(files);
  const issues = [];
  const realCode = code.filter((f) => !isGateTooling(f));

  if (realCode.length > 0 && traceRecords.length === 0) {
    issues.push({
      level: 'fail',
      rule: 'trace-record',
      msg: `${realCode.length} code file(s) changed but NO Correction Trace Record (docs/audits/corrections/<id>.md) in the diff. Every correction must ship its Trace Record (plan §G2).`,
    });
  }

  if (Array.isArray(opts.declaredRadius) && opts.declaredRadius.length > 0) {
    const declared = new Set(opts.declaredRadius);
    const unexpected = realCode.filter((f) => !declared.has(f));
    if (unexpected.length > 0) {
      issues.push({
        level: 'fail',
        rule: 'blast-radius',
        msg: `Files changed OUTSIDE the pre-registered blast radius (unexpected reach — no work in the dark): ${unexpected.join(', ')}. Update the Trace Record's declared radius or stop and re-scope.`,
      });
    }
  }

  return { issues, domains: mapDomains(files) };
}

module.exports = {
  DOMAIN_RULES,
  classify,
  mapDomains,
  microGateIssues,
  macroGateIssues,
  isCode,
  isTest,
  isDoc,
  isTraceRecord,
  isGateTooling,
};
