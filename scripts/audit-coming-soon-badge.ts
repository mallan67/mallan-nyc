#!/usr/bin/env tsx
// Coming Soon badge audit.
//
// UCBA Art. I §16(C): Every Coming Soon listing display must show:
//   "Coming Soon. No Showings or Open House until [Start Showing Date]"
//
// Penalty: $500/$2,000/$10,000/suspension (general UCBA scale).
//
// Strategy:
//   1. Find every component under app/ that renders listing card UI
//      (per audit-public-attribution.ts heuristic).
//   2. Check whether it conditionally renders the REBNY badge text when the
//      listing's standardStatus / status is "ComingSoon".
//   3. If the source data could plausibly include CS listings AND the
//      component lacks the badge → violation.
//
// Read-only.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, 'app');

// Required REBNY badge phrase fragments (case-insensitive).
const BADGE_PHRASES = [
  /Coming Soon\.\s*No Showings or Open House/i,
  /Coming Soon[^"']{0,30}No Showings/i,
  // Shared component — its definition contains the UCBA phrasing, so importing
  // and using it satisfies the requirement.
  /<ComingSoonBadge\b/,
  /\bComingSoonBadge\b/,
];

// Markers indicating the component checks for Coming Soon status.
const CS_DETECTION = [
  /\bisComingSoon\b/,
  /\bisComingSoonStatus\b/,
  /['"]ComingSoon['"]/,
  /['"]Coming Soon['"]/,
  /standardStatus\s*===\s*['"]ComingSoon['"]/,
  /_displayCompliance\.comingSoon/,
  /<ComingSoonBadge\b/,
  /\bComingSoonBadge\b/,
];

// Listing-data tokens (same as attribution audit).
const LISTING_DATA_TOKENS = [
  /\blistPrice\b/, /\bListPrice\b/,
  /\bmlsId\b/, /\bListingKey\b/,
  /\.bedroomsTotal\b/, /\.bathroomsFull\b/,
];

const RENDER_PATTERNS = [
  /formatPrice\s*\(/,
  /\{\s*[a-zA-Z_$][\w$]*\.listPrice/,
  /\{\s*[a-zA-Z_$][\w$]*\.bedroomsTotal/,
  /\{\s*[a-zA-Z_$][\w$]*\.bathroomsFull/,
  /\{\s*[a-zA-Z_$][\w$]*\.beds\b/,
  /\{\s*[a-zA-Z_$][\w$]*\.baths\b/,
  /\{\s*[a-zA-Z_$][\w$]*\.address\.[a-z]/,
];

interface Finding {
  file: string;
  kind: 'MISSING_BADGE' | 'INCORRECT_BADGE_TEXT' | 'NO_CS_DETECTION';
  detail: string;
}

function listTsxFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      // Public surfaces only — skip api/admin/portal/crm
      if (entry.name === 'crm' || entry.name === 'admin' || entry.name === 'portal' || entry.name === 'api') continue;
      out.push(...listTsxFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      if (/^(layout|loading|error|not-found)\.tsx$/.test(entry.name)) continue;
      out.push(full);
    }
  }
  return out;
}

function isListingRenderer(content: string): boolean {
  let dataHits = 0, renderHits = 0;
  for (const re of LISTING_DATA_TOKENS) if (re.test(content)) dataHits++;
  for (const re of RENDER_PATTERNS) if (re.test(content)) renderHits++;
  return dataHits >= 2 && renderHits >= 2;
}

function hasBadgeText(content: string): boolean {
  return BADGE_PHRASES.some((re) => re.test(content));
}

function detectsComingSoon(content: string): boolean {
  return CS_DETECTION.some((re) => re.test(content));
}

const findings: Finding[] = [];
const okFiles: string[] = [];

const files = listTsxFiles(APP_DIR);
for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  if (!isListingRenderer(content)) continue;

  const rel = path.relative(ROOT, file);
  const detected = detectsComingSoon(content);
  const hasText = hasBadgeText(content);

  if (!detected && !hasText) {
    findings.push({
      file: rel,
      kind: 'NO_CS_DETECTION',
      detail: 'Renders listings but has no Coming Soon detection and no badge — CS listings would render without UCBA Art. I §16(C) badge',
    });
    continue;
  }
  if (detected && !hasText) {
    findings.push({
      file: rel,
      kind: 'MISSING_BADGE',
      detail: 'Detects Coming Soon status but does not render the UCBA-required badge text',
    });
    continue;
  }
  if (!detected && hasText) {
    findings.push({
      file: rel,
      kind: 'INCORRECT_BADGE_TEXT',
      detail: 'Has badge text but no detection logic — badge may render unconditionally',
    });
    continue;
  }
  okFiles.push(rel);
}

console.log('═══ COMING SOON BADGE AUDIT ═══');
console.log(`Listing-renderer components: ${findings.length + okFiles.length}`);
console.log('');
if (findings.length === 0) {
  console.log('  ✓ All listing renderers handle Coming Soon per UCBA Art. I §16(C).');
} else {
  console.log(`  ✗ ${findings.length} issues:`);
  for (const f of findings) {
    console.log(`     [${f.kind}] ${f.file}`);
    console.log(`         ${f.detail}`);
  }
}
console.log('');
console.log(`OK files: ${okFiles.length}`);
for (const f of okFiles) console.log(`  ✓ ${f}`);
process.exit(findings.length > 0 ? 1 : 0);
