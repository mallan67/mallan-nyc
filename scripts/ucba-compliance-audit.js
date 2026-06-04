#!/usr/bin/env node
/**
 * UCBA 2026 Compliance Audit Validator
 *
 * Runs automated checks against the codebase to verify REBNY UCBA 2026 compliance.
 * Uses the audit checklist at compliance/rules/ucba-audit-checklist.json as the source of truth.
 *
 * Usage:
 *   node scripts/ucba-compliance-audit.js          # Run full audit
 *   node scripts/ucba-compliance-audit.js --fails   # Show only FAIL items
 *   node scripts/ucba-compliance-audit.js --section H  # Audit section H only
 *   node scripts/ucba-compliance-audit.js --json    # JSON output
 *
 * Exit codes:
 *   0 = all checks pass (no FAILs)
 *   1 = one or more FAILs detected
 *
 * Each rule has:
 *   - verifyFiles: files to check
 *   - verifyPattern: regex to search for
 *   - verifyDescription: what to look for
 *   - verdict: expected result from last manual audit
 *
 * The validator CONFIRMS the manual audit by checking that the code patterns
 * still exist. If a pattern disappears (e.g., someone removes a gate check),
 * the validator will flag a REGRESSION.
 */

const fs = require('fs');
const path = require('path');

// ─── Config ──────────────────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..');
const CHECKLIST_PATH = path.join(ROOT, 'compliance', 'rules', 'ucba-audit-checklist.json');

// ─── CLI Args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const showFailsOnly = args.includes('--fails');
const jsonOutput = args.includes('--json');
const sectionFilter = args.includes('--section') ? args[args.indexOf('--section') + 1] : null;

// ─── Load Checklist ──────────────────────────────────────────────────────
let checklist;
try {
  checklist = JSON.parse(fs.readFileSync(CHECKLIST_PATH, 'utf-8'));
} catch (e) {
  console.error(`ERROR: Cannot load checklist at ${CHECKLIST_PATH}`);
  console.error(e.message);
  process.exit(1);
}

// ─── File Cache ──────────────────────────────────────────────────────────
const fileCache = new Map();

function readFile(relPath) {
  if (fileCache.has(relPath)) return fileCache.get(relPath);

  const absPath = path.join(ROOT, relPath);

  // Handle directory paths — scan all files in dir
  try {
    const stat = fs.statSync(absPath);
    if (stat.isDirectory()) {
      const content = scanDirectory(absPath);
      fileCache.set(relPath, content);
      return content;
    }
  } catch {
    // File doesn't exist
    fileCache.set(relPath, null);
    return null;
  }

  try {
    const content = fs.readFileSync(absPath, 'utf-8');
    fileCache.set(relPath, content);
    return content;
  } catch {
    fileCache.set(relPath, null);
    return null;
  }
}

function scanDirectory(dirPath) {
  let combined = '';
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isFile() && /\.(ts|tsx|js|html)$/.test(entry.name)) {
        try {
          combined += fs.readFileSync(full, 'utf-8') + '\n';
        } catch { /* skip unreadable */ }
      } else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        combined += scanDirectory(full);
      }
    }
  } catch { /* skip */ }
  return combined;
}

// ─── Pattern Checker ─────────────────────────────────────────────────────

function checkPattern(fileContents, pattern) {
  if (!fileContents || !pattern) return { found: false, matches: [] };

  // Split on | for multi-pattern OR matching
  const patterns = pattern.split('|').map(p => p.trim()).filter(Boolean);
  const allMatches = [];

  for (const p of patterns) {
    try {
      const regex = new RegExp(p, 'i');
      const lines = fileContents.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          allMatches.push({ line: i + 1, text: lines[i].trim().substring(0, 120) });
          if (allMatches.length >= 5) break; // Cap at 5 matches per rule
        }
      }
    } catch {
      // Invalid regex, try as literal
      if (fileContents.includes(p)) {
        allMatches.push({ line: 0, text: `Literal match found for: ${p}` });
      }
    }
    if (allMatches.length >= 5) break;
  }

  return { found: allMatches.length > 0, matches: allMatches };
}

// ─── v2 Rich-Format Evaluator ────────────────────────────────────────────
//
// When a rule has a `validation_v2` block, evaluate per-surface and aggregate.
// Surface verdicts: PASS | FAIL | UNVERIFIED.
// Aggregate rules:
//   - all surfaces PASS                               → PASS
//   - mix of PASS + FAIL                              → PARTIAL
//   - mix of PASS + UNVERIFIED (no FAIL)              → UNVERIFIED if any required surface UNVERIFIED, else PASS
//   - all surfaces FAIL                               → FAIL
//   - any required surface FAIL but expected PARTIAL  → still PARTIAL (auction is a known case)
//   - if previously PASS and now any FAIL             → REGRESSION
//
// v2 ALSO honors expected_aggregate when set: the runner does not fail on
// the rule when actual matches expected (e.g. C15 is expected PARTIAL).
// However, if the actual is WORSE than expected (FAIL while expected
// PARTIAL, or PARTIAL while expected PASS), that's a regression-like
// failure. If actual is BETTER than expected (PASS while expected
// PARTIAL), the runner upgrades the verdict and surfaces it as good news.

function evaluateSurface(surfaceKey, evidenceFiles, surfacePattern) {
  // No evidence files declared → can't evaluate → UNVERIFIED
  if (!Array.isArray(evidenceFiles) || evidenceFiles.length === 0) {
    return { verdict: 'UNVERIFIED', reason: 'no evidence file paths declared', files: [] };
  }

  let combined = '';
  const filesChecked = [];

  for (const f of evidenceFiles) {
    const content = readFile(f);
    if (content) {
      combined += content + '\n';
      filesChecked.push({ path: f, found: true });
    } else {
      filesChecked.push({ path: f, found: false });
    }
  }

  const anyFileFound = filesChecked.some((f) => f.found);
  if (!anyFileFound) {
    return { verdict: 'FAIL', reason: 'no declared evidence files exist on disk', files: filesChecked };
  }

  // No pattern provided → file presence alone counts as PASS for this surface.
  if (!surfacePattern) {
    return { verdict: 'PASS', reason: 'evidence file present (no pattern required)', files: filesChecked };
  }

  const pat = checkPattern(combined, surfacePattern);
  if (pat.found) {
    return { verdict: 'PASS', reason: `pattern matched (${pat.matches.length} hit${pat.matches.length === 1 ? '' : 's'})`, files: filesChecked, matches: pat.matches.slice(0, 3) };
  }
  return { verdict: 'FAIL', reason: 'evidence file present but pattern not found', files: filesChecked };
}

function aggregateV2(surfaceVerdicts, expectedAggregate) {
  const verdicts = Object.values(surfaceVerdicts).map((s) => s.verdict);
  const passCount = verdicts.filter((v) => v === 'PASS').length;
  const failCount = verdicts.filter((v) => v === 'FAIL').length;
  const unverifiedCount = verdicts.filter((v) => v === 'UNVERIFIED').length;
  const total = verdicts.length;

  let actual;
  if (failCount === 0 && unverifiedCount === 0) {
    actual = 'PASS';
  } else if (passCount > 0 && failCount > 0) {
    actual = 'PARTIAL';
  } else if (failCount === total) {
    actual = 'FAIL';
  } else if (passCount > 0 && unverifiedCount > 0 && failCount === 0) {
    actual = 'UNVERIFIED';
  } else if (passCount === 0 && unverifiedCount > 0 && failCount === 0) {
    actual = 'UNVERIFIED';
  } else {
    actual = 'PARTIAL';
  }

  // Reconcile against expected_aggregate if declared
  let reconciled = actual;
  let claimOverstated = false;
  if (expectedAggregate) {
    const ranking = { FAIL: 0, PARTIAL: 1, UNVERIFIED: 2, PASS: 3 };
    if (ranking[actual] < ranking[expectedAggregate]) {
      // Actual is worse than expected → regression-class failure
      reconciled = actual;
      claimOverstated = true;
    } else if (ranking[actual] > ranking[expectedAggregate]) {
      // Actual is better than expected → upgrade
      reconciled = actual;
    } else {
      // Match → use expected (also matches actual)
      reconciled = actual;
    }
  }

  return {
    actual,
    expected: expectedAggregate || null,
    reconciled,
    claimOverstated,
    counts: { pass: passCount, fail: failCount, unverified: unverifiedCount, total },
  };
}

function evaluateRuleV2(rule) {
  const v2 = rule.validation_v2;
  const surfaces = {};
  const required = v2.required_surfaces || [];
  for (const surfaceKey of required) {
    const evidenceFiles = v2.evidence?.[surfaceKey];
    const pattern = v2.surface_patterns?.[surfaceKey];
    surfaces[surfaceKey] = evaluateSurface(surfaceKey, evidenceFiles, pattern);
  }
  const aggregate = aggregateV2(surfaces, v2.expected_aggregate);
  return {
    format: 'v2',
    validation_mode: v2.validation_mode,
    ci_policy: v2.ci_policy,
    release_blocking: v2.release_blocking !== false,
    workflow_id: v2.workflow_id || null,
    surfaces,
    aggregate,
  };
}

// ─── Run Audit ───────────────────────────────────────────────────────────

const results = {
  timestamp: new Date().toISOString(),
  summary: {
    total: 0,
    pass: 0,
    fail: 0,
    partial: 0,
    unverified: 0,
    evaluate: 0,
    regression: 0,
    claim_overstated: 0,
    v1_count: 0,
    v2_count: 0,
  },
  sections: {},
  regressions: [],
  failures: [],
  partials: [],
  unverified: [],
  claimOverstatements: [],
  evaluateClosely: []
};

const sections = checklist.sections;

for (const [sectionKey, section] of Object.entries(sections)) {
  if (sectionFilter && sectionKey.toUpperCase() !== sectionFilter.toUpperCase()) continue;

  const sectionResult = {
    name: section.name,
    rules: []
  };

  for (const rule of section.rules) {
    results.summary.total++;

    // ── v2 PATH ── rich-format rules with required_surfaces + evidence
    if (rule.validation_v2) {
      results.summary.v2_count++;
      const v2 = evaluateRuleV2(rule);

      let liveVerdict = v2.aggregate.reconciled;
      let isRegression = false;

      switch (v2.aggregate.reconciled) {
        case 'PASS':
          results.summary.pass++;
          break;
        case 'PARTIAL':
          results.summary.partial++;
          results.partials.push({
            id: rule.id, name: rule.name, ucbaRef: rule.ucbaRef,
            requirement: rule.requirement, expected: v2.aggregate.expected,
            workflow_id: v2.workflow_id, surfaces: v2.surfaces,
          });
          break;
        case 'FAIL':
          results.summary.fail++;
          results.failures.push({
            id: rule.id, name: rule.name, ucbaRef: rule.ucbaRef,
            priority: rule.priority || 'medium', requirement: rule.requirement,
            workflow_id: v2.workflow_id, surfaces: v2.surfaces,
          });
          break;
        case 'UNVERIFIED':
          results.summary.unverified++;
          results.unverified.push({
            id: rule.id, name: rule.name, ucbaRef: rule.ucbaRef,
            requirement: rule.requirement, workflow_id: v2.workflow_id,
            surfaces: v2.surfaces,
          });
          break;
      }

      if (v2.aggregate.claimOverstated) {
        results.summary.claim_overstated++;
        results.claimOverstatements.push({
          id: rule.id, name: rule.name,
          actual: v2.aggregate.actual, expected: v2.aggregate.expected,
          workflow_id: v2.workflow_id,
        });
      }

      // Detect regression: rule's legacy `verdict` was PASS but v2 actual is FAIL/PARTIAL/UNVERIFIED
      if (rule.verdict === 'PASS' && v2.aggregate.actual !== 'PASS') {
        isRegression = true;
        results.summary.regression++;
        results.regressions.push({
          id: rule.id, name: rule.name, ucbaRef: rule.ucbaRef,
          previousVerdict: 'PASS', currentVerdict: v2.aggregate.actual,
          issue: `v2 evaluation aggregated to ${v2.aggregate.actual}; legacy rule.verdict was PASS`,
          surfaces: v2.surfaces,
        });
      }

      sectionResult.rules.push({
        id: rule.id, name: rule.name, ucbaRef: rule.ucbaRef,
        format: 'v2',
        liveVerdict, isRegression,
        v2Aggregate: v2.aggregate,
        v2Surfaces: v2.surfaces,
        validation_mode: v2.validation_mode,
        ci_policy: v2.ci_policy,
        workflow_id: v2.workflow_id,
      });
      continue;
    }

    // ── v1 PATH ── legacy single-pattern rules
    results.summary.v1_count++;

    // Combine all file contents for this rule
    let combinedContent = '';
    const filesChecked = [];

    for (const filePath of (rule.verifyFiles || [])) {
      const content = readFile(filePath);
      if (content) {
        combinedContent += content + '\n';
        filesChecked.push({ path: filePath, found: true });
      } else {
        filesChecked.push({ path: filePath, found: false });
      }
    }

    // Check pattern
    const patternResult = checkPattern(combinedContent, rule.verifyPattern);

    // Determine live verdict
    let liveVerdict;
    let isRegression = false;

    if (rule.verdict === 'PASS') {
      if (patternResult.found) {
        liveVerdict = 'PASS';
        results.summary.pass++;
      } else {
        liveVerdict = 'REGRESSION';
        isRegression = true;
        results.summary.regression++;
        results.regressions.push({
          id: rule.id,
          name: rule.name,
          ucbaRef: rule.ucbaRef,
          previousVerdict: 'PASS',
          issue: `Pattern no longer found in code. Was PASS, now missing.`,
          verifyDescription: rule.verifyDescription,
          files: filesChecked
        });
      }
    } else if (rule.verdict === 'FAIL') {
      // Check if it's been fixed
      if (patternResult.found) {
        liveVerdict = 'POSSIBLY_FIXED';
        results.summary.pass++;
      } else {
        liveVerdict = 'FAIL';
        results.summary.fail++;
        results.failures.push({
          id: rule.id,
          name: rule.name,
          ucbaRef: rule.ucbaRef,
          priority: rule.priority || 'medium',
          requirement: rule.requirement,
          verifyDescription: rule.verifyDescription
        });
      }
    } else {
      // EVALUATE_CLOSELY
      liveVerdict = patternResult.found ? 'EVALUATE_CLOSELY (pattern exists)' : 'EVALUATE_CLOSELY (pattern missing)';
      results.summary.evaluate++;
      results.evaluateClosely.push({
        id: rule.id,
        name: rule.name,
        ucbaRef: rule.ucbaRef,
        patternFound: patternResult.found,
        verifyDescription: rule.verifyDescription
      });
    }

    sectionResult.rules.push({
      id: rule.id,
      name: rule.name,
      ucbaRef: rule.ucbaRef,
      expectedVerdict: rule.verdict,
      liveVerdict,
      isRegression,
      patternFound: patternResult.found,
      matchCount: patternResult.matches.length,
      matches: patternResult.matches.slice(0, 3), // Top 3
      filesChecked
    });
  }

  results.sections[sectionKey] = sectionResult;
}

// ─── Output ──────────────────────────────────────────────────────────────

if (jsonOutput) {
  console.log(JSON.stringify(results, null, 2));
} else {
  // Human-readable output
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         UCBA 2026 COMPLIANCE AUDIT VALIDATOR                ║');
  console.log('║         Source: UCBA Master Copy (January 2026)             ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Timestamp: ${results.timestamp}`);
  console.log(`  Checklist: ${CHECKLIST_PATH}`);
  console.log('');

  // Section-by-section results
  for (const [key, section] of Object.entries(results.sections)) {
    console.log(`━━━ Section ${key}: ${section.name} ━━━`);
    console.log('');

    for (const rule of section.rules) {
      if (showFailsOnly && rule.liveVerdict === 'PASS') continue;

      const icon = rule.liveVerdict === 'PASS'        ? '✓' :
                   rule.liveVerdict === 'PARTIAL'     ? '◐' :
                   rule.liveVerdict === 'UNVERIFIED'  ? '?' :
                   rule.liveVerdict === 'REGRESSION'  ? '⚠' :
                   rule.liveVerdict === 'FAIL'        ? '✗' :
                   rule.liveVerdict === 'POSSIBLY_FIXED' ? '?' : '~';

      const color = rule.liveVerdict === 'PASS'       ? '\x1b[32m' : // green
                    rule.liveVerdict === 'PARTIAL'    ? '\x1b[33m' : // yellow
                    rule.liveVerdict === 'UNVERIFIED' ? '\x1b[36m' : // cyan
                    rule.liveVerdict === 'REGRESSION' ? '\x1b[31m' : // red
                    rule.liveVerdict === 'FAIL'       ? '\x1b[31m' : // red
                    rule.liveVerdict === 'POSSIBLY_FIXED' ? '\x1b[33m' : '\x1b[33m';

      console.log(`  ${color}${icon}\x1b[0m ${rule.id} — ${rule.name} [${rule.ucbaRef}]${rule.format === 'v2' ? ' \x1b[90m[v2]\x1b[0m' : ''}`);

      if (rule.format === 'v2') {
        const a = rule.v2Aggregate;
        console.log(`    Verdict: ${color}${rule.liveVerdict}\x1b[0m  (expected: ${a.expected || '—'}, actual: ${a.actual}, surfaces: ${a.counts.pass}/${a.counts.total} pass${a.counts.fail ? `, ${a.counts.fail} fail` : ''}${a.counts.unverified ? `, ${a.counts.unverified} unverified` : ''})`);
        for (const [surfaceKey, sv] of Object.entries(rule.v2Surfaces)) {
          const sIcon = sv.verdict === 'PASS' ? '✓' : sv.verdict === 'FAIL' ? '✗' : '?';
          const sColor = sv.verdict === 'PASS' ? '\x1b[32m' : sv.verdict === 'FAIL' ? '\x1b[31m' : '\x1b[36m';
          console.log(`    ${sColor}${sIcon}\x1b[0m ${surfaceKey.padEnd(20)} ${sv.reason}`);
        }
        if (a.claimOverstated) {
          console.log(`    \x1b[31m⚠ CLAIM_OVERSTATED: actual (${a.actual}) is worse than expected (${a.expected}).\x1b[0m`);
        }
      } else {
        console.log(`    Verdict: ${color}${rule.liveVerdict}\x1b[0m (expected: ${rule.expectedVerdict})`);
        if (rule.matches?.length > 0 && !showFailsOnly) {
          for (const m of rule.matches.slice(0, 2)) {
            console.log(`    └─ L${m.line}: ${m.text}`);
          }
        }
      }

      if (rule.isRegression) {
        console.log(`    \x1b[31m⚠ REGRESSION: previously-passing rule now degraded.\x1b[0m`);
      }

      console.log('');
    }
  }

  // Summary
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                        SUMMARY                             ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Total Rules Checked:     ${String(results.summary.total).padStart(4)}    (v1: ${results.summary.v1_count}, v2: ${results.summary.v2_count})${' '.repeat(Math.max(0, 19 - String(results.summary.v1_count).length - String(results.summary.v2_count).length))}║`);
  console.log(`║  \x1b[32mPASS:\x1b[0m                     ${String(results.summary.pass).padStart(4)}                              ║`);
  console.log(`║  \x1b[33mPARTIAL:\x1b[0m                  ${String(results.summary.partial).padStart(4)}                              ║`);
  console.log(`║  \x1b[31mFAIL:\x1b[0m                     ${String(results.summary.fail).padStart(4)}                              ║`);
  console.log(`║  \x1b[36mUNVERIFIED:\x1b[0m               ${String(results.summary.unverified).padStart(4)}                              ║`);
  console.log(`║  \x1b[33mEVALUATE CLOSELY:\x1b[0m         ${String(results.summary.evaluate).padStart(4)}                              ║`);
  console.log(`║  \x1b[31mREGRESSIONS:\x1b[0m              ${String(results.summary.regression).padStart(4)}                              ║`);
  console.log(`║  \x1b[31mCLAIM_OVERSTATED:\x1b[0m         ${String(results.summary.claim_overstated).padStart(4)}                              ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  if (results.regressions.length > 0) {
    console.log('\x1b[31m⚠ REGRESSIONS DETECTED — previously-passing rules now degraded:\x1b[0m');
    for (const r of results.regressions) {
      console.log(`  ✗ ${r.id}: ${r.name} — ${r.issue}`);
    }
    console.log('');
  }

  if (results.failures.length > 0) {
    console.log('\x1b[31m✗ FAILURES — required surfaces missing:\x1b[0m');
    for (const f of results.failures) {
      console.log(`  ✗ ${f.id} [${f.priority || 'medium'}]: ${f.name} — ${f.requirement}`);
    }
    console.log('');
  }

  if (results.partials.length > 0) {
    console.log('\x1b[33m◐ PARTIAL — feature is in progress, some surfaces missing:\x1b[0m');
    for (const p of results.partials) {
      console.log(`  ◐ ${p.id}: ${p.name}${p.workflow_id ? ` (workflow: ${p.workflow_id})` : ''}`);
    }
    console.log('');
  }

  if (results.unverified.length > 0) {
    console.log('\x1b[36m? UNVERIFIED — surfaces present but runtime/prod proof needed:\x1b[0m');
    for (const u of results.unverified) {
      console.log(`  ? ${u.id}: ${u.name}${u.workflow_id ? ` (workflow: ${u.workflow_id})` : ''}`);
    }
    console.log('');
  }

  if (results.claimOverstatements.length > 0) {
    console.log('\x1b[31m⚠ CLAIM_OVERSTATED — actual is worse than expected:\x1b[0m');
    for (const c of results.claimOverstatements) {
      console.log(`  ⚠ ${c.id}: ${c.name} — actual=${c.actual}, expected=${c.expected}`);
    }
    console.log('');
  }

  console.log(`Checklist source: ${CHECKLIST_PATH}`);
  console.log('');
}

// Exit codes (per validator-framework spec):
//   1 = blocking FAIL on a release-blocking rule
//   2 = REGRESSION
//   3 = CLAIM_OVERSTATED
//   0 = clean (PASS / PARTIAL within expected / UNVERIFIED)
let exitCode = 0;
if (results.summary.claim_overstated > 0) exitCode = 3;
if (results.summary.regression > 0) exitCode = 2;
// Only blocking FAILs raise exit 1. PARTIAL with expected_aggregate=PARTIAL doesn't.
const blockingFailures = results.failures.filter((f) => {
  // v2 failures are stored with workflow_id; treat as blocking unless explicitly expected
  return true;
});
if (blockingFailures.length > 0) exitCode = 1;
process.exit(exitCode);
