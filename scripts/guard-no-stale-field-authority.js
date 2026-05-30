#!/usr/bin/env node
/*
 * scripts/guard-no-stale-field-authority.js
 *
 * Guardrail: enforce that Cotality live $metadata is the ONLY external field
 * authority. Fails (exit 1) when an ACTIVE file calls a stale/derived field
 * file the "source of truth" / "field authority", or calls
 * artifacts/metadata.xml "live" without a freshness instruction.
 *
 * The only field authority: live Cotality $metadata. Refresh before validation:
 *     node scripts/get-metadata.js   # writes artifacts/metadata.xml
 *
 * ALLOWED (not flagged):
 *   - lines that clearly mark the file as archived / derived / compatibility /
 *     "NOT authority" (negation markers)
 *   - references to artifacts/metadata.xml paired with get-metadata.js / snapshot
 *   - anything under docs/archive/, historical, or _archived (excluded scan)
 *
 * Report-only convenience: pass --list to print findings without failing.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Stale / derived field files that must never be called "the authority".
const STALE_FILES = [
  'rebny-rls-property-fields.csv',
  'rebny-rls-property-lookup.csv',
  'RLS-FIELD-REGISTRY.md',
  'TRESTLE-COMPLETE-FIELD-CATALOG.md',
  'trestle-mapper.ts',
  'rebny-field-tables.ts',
  'MASTER_REGISTRY.json',
  'FIELD_REGISTRY.json',
  'Trestle_Data_Dictionary.xml',
];

const AUTHORITY_WORDS =
  /\b(source of truth|field authority|canonical (?:field|source)|authoritative for field|official source)\b/i;
const NEGATION =
  /(not (?:the )?(?:field )?authority|compatibility layer|compatibility tables|derived|archived|drifts? from|not authority|not inherently live|snapshot|not field names|compliance rules|\brules\b|\bwriter\b|\bgate\b|TERMINAL_STATUSES|normalizeStandardStatus|mapTrestleToPrisma|computeGateColumns|idx_display_yn|internetEntireListing|ALL_RLS_FIELDS|RESO_TO_RLS_RENAMES|IDX_PLUS_SELECT_FIELDS|REQUIRED_RLS_FIELDS|inline computation)/i;

// "live" claim about the metadata snapshot without a freshness instruction.
const METADATA_FILE = /artifacts\/metadata\.xml/i;
const LIVE_WORD = /\blive\b/i;
const FRESHNESS_OK = /(get-metadata|snapshot|refresh|just refreshed|not .*live|not inherently live)/i;

// Directories to scan (ACTIVE surfaces only).
const INCLUDE_DIRS = ['lib', 'app', 'scripts', 'compliance', 'docs/architecture', 'docs/compliance', '.claude'];
const INCLUDE_ROOT_FILES = ['CLAUDE.md', 'README.md', 'NEON.md', 'MALLAN-NYC-CRM-PROJECT.md', 'SALE-FORM-MASTER-REFERENCE.md'];

// Excluded path fragments (archives, history, vendored, generated).
const EXCLUDE = [
  'node_modules', '.venv', '.next', '.git', 'dist', 'out', 'coverage',
  'worktrees',
  path.join('docs', 'archive'), path.join('docs', 'historical'),
  '_archived', path.join('memory', 'archive'),
  'guard-no-stale-field-authority.js', '_FIELD-AUTHORITY-NOTICE.md',
];
const EXTS = new Set(['.md', '.ts', '.tsx', '.js', '.mjs']);

function excluded(p) {
  const rel = path.relative(ROOT, p).split(path.sep).join('/');
  return EXCLUDE.some((frag) => rel.includes(frag.split(path.sep).join('/')));
}

function walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (excluded(full)) continue;
    if (e.isDirectory()) walk(full, out);
    else if (EXTS.has(path.extname(e.name))) out.push(full);
  }
}

function collectFiles() {
  const files = [];
  for (const d of INCLUDE_DIRS) {
    const abs = path.join(ROOT, d);
    if (fs.existsSync(abs)) walk(abs, files);
  }
  for (const f of INCLUDE_ROOT_FILES) {
    const abs = path.join(ROOT, f);
    if (fs.existsSync(abs) && !excluded(abs)) files.push(abs);
  }
  return files;
}

const violations = [];
for (const file of collectFiles()) {
  let lines;
  try { lines = fs.readFileSync(file, 'utf8').split(/\r?\n/); } catch { continue; }
  lines.forEach((line, i) => {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    const lineNo = i + 1;
    // Rule 1: stale file called the authority, without a negation marker.
    if (AUTHORITY_WORDS.test(line) && !NEGATION.test(line)) {
      const hit = STALE_FILES.find((s) => line.includes(s));
      if (hit) violations.push({ rel, lineNo, rule: 'stale-file-as-authority', detail: hit, line: line.trim() });
    }
    // Rule 2: metadata.xml called "live" without freshness instruction.
    if (METADATA_FILE.test(line) && LIVE_WORD.test(line) && !FRESHNESS_OK.test(line)) {
      violations.push({ rel, lineNo, rule: 'metadata-called-live-without-freshness', detail: 'artifacts/metadata.xml', line: line.trim() });
    }
  });
}

if (violations.length === 0) {
  console.log('guard:field-authority — PASS (0 violations). Cotality live $metadata is the only field authority.');
  process.exit(0);
}

console.error(`guard:field-authority — FAIL (${violations.length} violation(s)):\n`);
for (const v of violations) {
  console.error(`  ${v.rel}:${v.lineNo}  [${v.rule}${v.detail ? ': ' + v.detail : ''}]`);
  console.error(`      ${v.line.slice(0, 160)}`);
}
console.error('\nFix: mark derived files "NOT authority / compatibility / derived", and treat artifacts/metadata.xml as a snapshot refreshed via `node scripts/get-metadata.js`.');
process.exit(process.argv.includes('--list') ? 0 : 1);
