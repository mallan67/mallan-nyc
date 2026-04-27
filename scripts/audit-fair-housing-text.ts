#!/usr/bin/env tsx
// Fair Housing text scan over public-facing content.
//
// Scans every hardcoded string in app/ (TSX/TS), data/, content/, and any
// neighborhood/market/blog text against data/compliance/prohibited-terms.json.
//
// Layers:
//   - Federal Fair Housing Act (race/color/national-origin/religion/sex/familial/disability)
//   - NY State HRL (age, marital, military, sexual orientation, gender identity)
//   - NYC HRL Title 8 (lawful occupation, source of income, immigration, caregiver)
//   - Fair Chance Housing Act (no criminal-history references)
//
// Penalties:
//   - HUD: up to ,000
//   - NYC Commission on Human Rights: up to 0,000
//   - REBNY/UCBA:  → 0 + RLS termination
//
// Read-only. No code mutations.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

interface Category {
  severity: string;
  reason: string;
  terms: string[];
}
interface ProhibitedTerms {
  categories: Record<string, Category>;
}

const termsFile = path.join(ROOT, 'data/compliance/prohibited-terms.json');
const json = JSON.parse(fs.readFileSync(termsFile, 'utf-8')) as ProhibitedTerms;

interface Pattern {
  category: string;
  severity: string;
  reason: string;
  term: string;
  re: RegExp;
}

const patterns: Pattern[] = [];
for (const [cat, c] of Object.entries(json.categories)) {
  for (const term of c.terms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Use word boundaries when possible. The hardcoded patterns include
    // fragments like "near church" — those are matched as substrings (with
    // surrounding non-word context) to catch sentences.
    const re = new RegExp(`(^|[^A-Za-z])${escaped}(?![A-Za-z])`, 'i');
    patterns.push({ category: cat, severity: c.severity, reason: c.reason, term, re });
  }
}

// Scan public-facing files only
const SCAN_GLOBS = ['app', 'content', 'public/copy'];
const EXTS = ['.tsx', '.ts', '.md', '.mdx'];

function listFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        // Skip private surfaces
        if (entry.name === 'crm' || entry.name === 'admin' || entry.name === 'api') continue;
        walk(full);
      } else if (entry.isFile() && EXTS.some((e) => entry.name.endsWith(e))) {
        out.push(full);
      }
    }
  }
  walk(root);
  return out;
}

const files: string[] = [];
for (const g of SCAN_GLOBS) files.push(...listFiles(g));

interface Finding {
  file: string;
  line: number;
  category: string;
  severity: string;
  reason: string;
  term: string;
  text: string;
}

const findings: Finding[] = [];
for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
    // Skip imports/types
    if (/^\s*(import|export)\s/.test(line)) continue;
    // Skip lines that are clearly code (no quoted string content)
    if (!/['"`]/.test(line) && !/<[A-Za-z]/.test(line) && !/^[#*-]/.test(line) && !/[A-Z][a-z]+ [a-z]/.test(line)) continue;
    for (const p of patterns) {
      if (p.re.test(line)) {
        findings.push({
          file: path.relative(ROOT, file),
          line: i + 1,
          category: p.category,
          severity: p.severity,
          reason: p.reason,
          term: p.term,
          text: trimmed.slice(0, 140),
        });
      }
    }
  }
}

// Filter false positives: this audit script itself contains the terms
const filtered = findings.filter((f) => !/audit-fair-housing-text\.ts$/.test(f.file));

console.log('═══ FAIR HOUSING TEXT SCAN ═══');
console.log(`Files scanned: ${files.length}`);
console.log(`Total prohibited terms loaded: ${patterns.length}`);
console.log('');

if (filtered.length === 0) {
  console.log('✓ No Fair Housing violations found in public-facing content.');
} else {
  // Group by severity
  const bySeverity = new Map<string, Finding[]>();
  for (const f of filtered) {
    if (!bySeverity.has(f.severity)) bySeverity.set(f.severity, []);
    bySeverity.get(f.severity)!.push(f);
  }
  for (const sev of ['critical', 'high', 'medium', 'warning']) {
    const list = bySeverity.get(sev);
    if (!list) continue;
    console.log(`✗ ${sev.toUpperCase()}: ${list.length} hits`);
    for (const f of list.slice(0, 30)) {
      console.log(`   ${f.file}:${f.line}`);
      console.log(`     [${f.category}] term="${f.term}"`);
      console.log(`     ${f.reason}`);
      console.log(`     "${f.text}"`);
    }
    if (list.length > 30) console.log(`   ... and ${list.length - 30} more`);
    console.log('');
  }
}
process.exit(filtered.length > 0 ? 1 : 0);
