// Pure logic for the MICRO and MACRO gate checkers (plan PART B/G).
//
// CommonJS so both the node runners (scripts/ci/{micro,macro}-gate.js) and the
// ts-jest tests can consume it. NO git/IO here — callers pass the changed-file
// list, so the policy is deterministic and unit-testable. Fail-closed: when in
// doubt the gate raises an issue (caller exits non-zero), never silently passes.

// Path → domain + the gates/agents that MUST run when that surface is touched.
// First match wins (most-specific first). The trailing generic app/lib/runtime
// rules keep ordinary changes classified; anything OUTSIDE this known tree is
// treated as an UNKNOWN domain and fails closed (macroGateIssues).
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
  { match: /^lib\/syndication\//,                  domain: 'syndication',   gates: ['tristle', 'HELD'] },
  { match: /^app\/listing\//,                      domain: 'listing-ui',    gates: ['frontend-auditor', 'tristle'] },
  { match: /^app\/components\//,                   domain: 'ui',            gates: ['frontend-auditor'] },
  { match: /^app\/.*page\.tsx$/,                   domain: 'ui-page',       gates: ['frontend-auditor'] },
  { match: /^prisma\/(schema\.prisma|migrations\/)/, domain: 'schema',      gates: ['HELD', 'security-agent'] },
  { match: /^\.github\/workflows\//,               domain: 'ci',            gates: ['HELD', 'security-agent'] },
  { match: /^public\/crm\//,                       domain: 'crm-frontend',  gates: ['HELD', 'frontend-auditor'] },
  { match: /^scripts\//,                           domain: 'ops/tooling',   gates: ['code-reviewer'] },
  // Generic catch-alls for the rest of the known tree (classified, but generic
  // → reviewer must confirm the right specific gate). These are still classified,
  // so they do NOT trip the fail-closed unknown-domain rule.
  { match: /^(proxy|instrumentation.*|middleware|next\.config.*|sentry\..*)\.(ts|tsx|js|mjs)$/, domain: 'runtime-config', gates: ['security-agent'] },
  { match: /^app\//,                               domain: 'app-other',     gates: ['code-reviewer', 'frontend-auditor(if UI)'] },
  { match: /^lib\//,                               domain: 'lib-other',     gates: ['code-reviewer'] },
];

const isTest = (f) => /(\.test\.|\.spec\.|__tests__\/)/.test(f);
const isDoc = (f) => /^docs\//.test(f) || /\.md$/.test(f);
// Generated artifacts — NOT "code requiring a test" and NOT a valid test/proof.
// They must never bypass the test-first rule nor satisfy it.
const isGenerated = (f) =>
  /^public\/crm\/data\/.*\.json$/.test(f) ||
  /^public\/crm\/index-built\.html$/.test(f) ||
  /\.min\.(js|css)$/.test(f) ||
  /^(dist|build|\.next|coverage)\//.test(f);
const isConfig = (f) =>
  /^(package(-lock)?\.json|tsconfig\.json|.*\.config\.(js|cjs|mjs|ts)|\.[^/]*rc(\.json)?|vercel\.json|\.gitignore)$/.test(f);
const isCodeRaw = (f) => /\.(ts|tsx|js|mjs|cjs)$/.test(f) && !isTest(f);
const isCode = (f) => isCodeRaw(f) && !isGenerated(f) && !isConfig(f);
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
    generated: files.filter(isGenerated),
    config: files.filter(isConfig),
    traceRecords: files.filter(isTraceRecord),
  };
}

function domainOf(file) {
  for (const r of DOMAIN_RULES) if (r.match.test(file)) return r;
  return null;
}

function mapDomains(files) {
  const out = {};
  for (const f of files) {
    const r = domainOf(f);
    if (!r) continue;
    if (!out[r.domain]) out[r.domain] = { gates: r.gates, files: [] };
    out[r.domain].files.push(f);
  }
  return out;
}

// Code files that match NO domain rule at all → fail-closed "unknown domain".
function unmappedCode(files) {
  return files.filter(isCode).filter((f) => !isGateTooling(f) && !domainOf(f));
}

/**
 * MICRO gate — local correctness. Every non-test, non-generated, non-config code
 * change must ship a test change in the same diff (test-first / §F). Docs-only and
 * test-only diffs pass. Generated artifacts never satisfy or bypass the rule.
 * An intentional test-exemption is allowed ONLY with an explicit reason
 * (opts.testExemptReason) — which a reviewer records in the Trace Record.
 * Gate tooling is the one bootstrap exemption. Returns [] when clean.
 */
function microGateIssues(files, opts = {}) {
  const { code, tests } = classify(files);
  const issues = [];
  const realCode = code.filter((f) => !isGateTooling(f));
  if (realCode.length > 0 && tests.length === 0) {
    if (opts.testExemptReason && String(opts.testExemptReason).trim().length > 0) {
      // Allowed, but the macro gate still requires a Trace Record where the
      // exemption + reason is recorded. (Surfaced as info, not a failure.)
    } else {
      issues.push({
        level: 'fail',
        rule: 'test-first',
        msg: `${realCode.length} code file(s) changed but NO test changed in the diff. Add a failing-test-flips-green (§F), or declare an explicit Trace-Record test-exemption with a reason: ${realCode.slice(0, 5).join(', ')}${realCode.length > 5 ? ' …' : ''}`,
      });
    }
  }
  return issues;
}

/**
 * MACRO gate — whole-system impact ("no work in the dark"). Every code change
 * must ship a Correction Trace Record (plan §G2). Reports the blast-radius
 * domains + required gates. Fail-closed on (a) UNKNOWN changed-file domains
 * unless explicitly classified via opts.classifiedAllow, and (b) any code file
 * changed OUTSIDE the record's declared blast radius. Returns { issues, domains }.
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

  // Fail-closed on unknown domains.
  const allow = new Set(opts.classifiedAllow || []);
  const unknown = unmappedCode(files).filter((f) => !allow.has(f));
  if (unknown.length > 0) {
    issues.push({
      level: 'fail',
      rule: 'unknown-domain',
      msg: `Changed code with NO classified domain (fail-closed): ${unknown.join(', ')}. Add a DOMAIN_RULE in gate-lib or classify explicitly before merge.`,
    });
  }

  // Declared blast-radius reconciliation.
  if (Array.isArray(opts.declaredRadius) && opts.declaredRadius.length > 0) {
    const declared = new Set(opts.declaredRadius);
    const unexpected = realCode.filter((f) => !declared.has(f));
    if (unexpected.length > 0) {
      issues.push({
        level: 'fail',
        rule: 'blast-radius',
        msg: `Files changed OUTSIDE the pre-registered blast radius (unexpected reach): ${unexpected.join(', ')}. Update the Trace Record's declared radius or stop and re-scope.`,
      });
    }
  }

  return { issues, domains: mapDomains(files) };
}

/**
 * Trace-Record validity — BASIC heuristic (full structured parsing is a
 * G2-hardening follow-up, NOT done). For a COMPLETED record (status IN-PR /
 * VERIFYING / SETTLED) it flags: a blank RED proof, a grep-only RED proof, and a
 * missing permanent regression guard. PLANNED records are intentionally allowed
 * to be unfilled. `content` is the record markdown. Returns { status, issues }.
 */
function parseTraceStatus(content) {
  const m = content.match(/Status:\s*\**\s*([A-Za-z][A-Za-z-]*)/);
  return m ? m[1].toUpperCase() : 'UNKNOWN';
}

// Capture a labelled field's value: from the first occurrence of `label` to the
// next markdown heading (## ) or the next "- **" field bullet, dropping the label
// up to its first colon. Handles inline bullets like "- **RED proof:** <value>".
function captureField(content, label) {
  const m = content.match(new RegExp(label, 'i'));
  if (!m) return '';
  const rest = content.slice(m.index);
  const boundary = rest.search(/\n## |\n- \*\*/);
  const block = boundary >= 0 ? rest.slice(0, boundary) : rest;
  const colon = block.indexOf(':');
  return (colon >= 0 ? block.slice(colon + 1) : block).replace(/[*_`>]/g, '').trim();
}

function traceRecordIssues(content) {
  const status = parseTraceStatus(content);
  const issues = [];
  if (status === 'PLANNED' || status === 'UNKNOWN') return { status, issues };

  const red = captureField(content, 'RED proof');
  const blank = !red || /^(…|▢|tbd|\.\.\.|n\/a)?$/i.test(red.replace(/[*_`>\s-]/g, ''));
  if (blank) {
    issues.push({ level: 'fail', rule: 'red-proof-blank', msg: `Trace Record (status ${status}) has a blank RED proof.` });
  } else if (/grep/i.test(red) && !/(\.test\.|failing test|live probe|preview|runtime log|GREEN|captured output)/i.test(red)) {
    issues.push({ level: 'fail', rule: 'red-proof-grep-only', msg: `Trace Record (status ${status}) RED proof is grep-only (invalid per §F — needs a failing test or live probe).` });
  }

  const guard = captureField(content, 'regression guard');
  const guardBlank = !guard || (!/\.test\./.test(guard) && /(▢|tbd|…|n\/a)/i.test(guard)) || guard.replace(/[*_`>\s-]/g, '').length === 0;
  if (guardBlank) {
    issues.push({ level: 'fail', rule: 'regression-guard', msg: `Trace Record (status ${status}) has no permanent regression guard (a committed test).` });
  }

  return { status, issues };
}

module.exports = {
  DOMAIN_RULES,
  classify,
  mapDomains,
  domainOf,
  unmappedCode,
  microGateIssues,
  macroGateIssues,
  parseTraceStatus,
  traceRecordIssues,
  isCode,
  isTest,
  isDoc,
  isGenerated,
  isConfig,
  isTraceRecord,
  isGateTooling,
};
