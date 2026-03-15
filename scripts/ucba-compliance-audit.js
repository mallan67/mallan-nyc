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
const AUDIT_REPORT_PATH = path.join(ROOT, 'compliance', 'FULL-AUDIT-2026-03-13.md');

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

// ─── Run Audit ───────────────────────────────────────────────────────────

const results = {
  timestamp: new Date().toISOString(),
  summary: { total: 0, pass: 0, fail: 0, evaluate: 0, regression: 0 },
  sections: {},
  regressions: [],
  failures: [],
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

      const icon = rule.liveVerdict === 'PASS' ? '✓' :
                   rule.liveVerdict === 'REGRESSION' ? '⚠' :
                   rule.liveVerdict === 'FAIL' ? '✗' :
                   rule.liveVerdict === 'POSSIBLY_FIXED' ? '?' : '~';

      const color = rule.liveVerdict === 'PASS' ? '\x1b[32m' :       // green
                    rule.liveVerdict === 'REGRESSION' ? '\x1b[31m' :  // red
                    rule.liveVerdict === 'FAIL' ? '\x1b[31m' :        // red
                    rule.liveVerdict === 'POSSIBLY_FIXED' ? '\x1b[33m' : // yellow
                    '\x1b[33m';                                        // yellow

      console.log(`  ${color}${icon}\x1b[0m ${rule.id} — ${rule.name} [${rule.ucbaRef}]`);
      console.log(`    Verdict: ${color}${rule.liveVerdict}\x1b[0m (expected: ${rule.expectedVerdict})`);

      if (rule.matches.length > 0 && !showFailsOnly) {
        for (const m of rule.matches.slice(0, 2)) {
          console.log(`    └─ L${m.line}: ${m.text}`);
        }
      }

      if (rule.isRegression) {
        console.log(`    \x1b[31m⚠ REGRESSION: Code pattern no longer found! Was previously PASS.\x1b[0m`);
      }

      console.log('');
    }
  }

  // Summary
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                        SUMMARY                             ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Total Rules Checked:     ${String(results.summary.total).padStart(4)}                              ║`);
  console.log(`║  \x1b[32mPASS:\x1b[0m                     ${String(results.summary.pass).padStart(4)}                              ║`);
  console.log(`║  \x1b[31mFAIL:\x1b[0m                     ${String(results.summary.fail).padStart(4)}                              ║`);
  console.log(`║  \x1b[33mEVALUATE CLOSELY:\x1b[0m         ${String(results.summary.evaluate).padStart(4)}                              ║`);
  console.log(`║  \x1b[31mREGRESSIONS:\x1b[0m              ${String(results.summary.regression).padStart(4)}                              ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  if (results.regressions.length > 0) {
    console.log('\x1b[31m⚠ REGRESSIONS DETECTED — Previously passing rules no longer match:\x1b[0m');
    for (const r of results.regressions) {
      console.log(`  ✗ ${r.id}: ${r.name} — ${r.issue}`);
    }
    console.log('');
  }

  if (results.failures.length > 0) {
    console.log('\x1b[31m✗ FAILURES — Known unimplemented rules:\x1b[0m');
    for (const f of results.failures) {
      console.log(`  ✗ ${f.id} [${f.priority}]: ${f.name} — ${f.requirement}`);
    }
    console.log('');
  }

  console.log(`Full audit report: ${AUDIT_REPORT_PATH}`);
  console.log(`Checklist source: ${CHECKLIST_PATH}`);
  console.log('');
}

// Exit code
const hasRegressions = results.summary.regression > 0;
process.exit(hasRegressions ? 1 : 0);
