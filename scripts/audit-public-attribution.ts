#!/usr/bin/env tsx
// Public-facing attribution & disclaimer audit.
//
// UCBA Art. III §2(C): Every IDX/VOW listing display must show
// "Listing Courtesy of [Exclusive Broker]" in a reasonably prominent
// location, font not smaller than median type face.
//
// UCBA Art. VIII §4: Aggregate / statistical pages must show the REBNY RLS
// statistical disclaimer.
//
// Heuristics:
//   1. Find every component under app/ that renders listing data
//      (consumes ListPrice / listPrice / ListOfficeName / mlsId / etc.)
//   2. Verify each has "Listing Courtesy" or attribution markup nearby.
//   3. Verify font size of attribution element is not smaller than
//      median visible font in the same component.
//
// Read-only. No code mutations.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, 'app');

// Pixel size for each Tailwind text class we recognize. Used to compute
// whether an attribution font is at least the median of all text classes
// found in the same file.
const TEXT_SIZE_PX: Record<string, number> = {
  'text-[8px]': 8, 'text-[9px]': 9, 'text-[10px]': 10, 'text-[11px]': 11,
  'text-[12px]': 12, 'text-[13px]': 13, 'text-[14px]': 14, 'text-[15px]': 15,
  'text-[16px]': 16, 'text-[18px]': 18, 'text-[20px]': 20,
  'text-xs': 12, 'text-sm': 14, 'text-base': 16, 'text-lg': 18,
  'text-xl': 20, 'text-2xl': 24, 'text-3xl': 30, 'text-4xl': 36,
};

interface Finding {
  file: string;
  kind: 'MISSING_ATTRIBUTION' | 'BELOW_MEDIAN_FONT' | 'OK';
  attributionFont?: number;
  medianFont?: number;
  detail?: string;
}

function listTsxFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      // Skip private/admin/CRM/portal routes — attribution is for IDX/public surfaces
      if (entry.name === 'crm' || entry.name === 'admin' || entry.name === 'portal' || entry.name === 'api') continue;
      out.push(...listTsxFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      // Skip layout/loading/error/not-found shells (no listing data)
      if (/^(layout|loading|error|not-found|page\.module)\.tsx$/.test(entry.name)) continue;
      out.push(full);
    }
  }
  return out;
}

// A file is considered to render listing data if it consumes any of these
// tokens (ListPrice / mlsId / ListOfficeName / etc.) AND outputs JSX that
// actually renders listing card UI (visible price/address — not just a
// callback button consuming listing props).
const LISTING_DATA_TOKENS = [
  /\blistPrice\b/, /\bListPrice\b/, /\blist_price\b/,
  /\bmlsId\b/, /\bmls_id\b/, /\bListingKey\b/,
  /\blistOfficeName\b/, /\bListOfficeName\b/,
  /\.bedroomsTotal\b/, /\.bathroomsFull\b/, /BedroomsTotal/, /BathroomsFull/,
];

// Heuristic for "actually renders listing card UI" — must contain JSX that
// visually outputs price + at least one detail. Pure utility components
// (buttons, hooks, badges) that consume listing props but don't render the
// card are excluded. We accept ANY object name (listing/l/item/unit/u/deal)
// followed by .listPrice / .bedroomsTotal / .bathroomsFull / formatPrice.
function rendersListingCardUI(content: string): boolean {
  const renders = [
    /formatPrice\s*\(/,                         // formatPrice(...) appears
    /\{\s*[a-zA-Z_$][\w$]*\.listPrice/,         // {x.listPrice}
    /\{\s*[a-zA-Z_$][\w$]*\.bedroomsTotal/,
    /\{\s*[a-zA-Z_$][\w$]*\.bathroomsFull/,
    /\{\s*[a-zA-Z_$][\w$]*\.beds\b/,
    /\{\s*[a-zA-Z_$][\w$]*\.baths\b/,
    /\{\s*[a-zA-Z_$][\w$]*\.address\.[a-z]/,
    /\{\s*[a-zA-Z_$][\w$]*\?\.[a-z]+\?\.listOfficeName/, // l.detail?.listOfficeName
  ];
  let hits = 0;
  for (const re of renders) if (re.test(content)) hits++;
  return hits >= 2;
}

function isListingComponent(content: string): boolean {
  let dataHits = 0;
  for (const re of LISTING_DATA_TOKENS) {
    if (re.test(content)) dataHits++;
  }
  if (dataHits < 2) return false;
  return rendersListingCardUI(content);
}

function extractMedianFont(content: string): number | null {
  // UCBA Art. III §2(C) intent: "median TYPE FACE" — i.e. body/list text size,
  // not heading/price callouts. Cap at 18px (text-lg) so display headings
  // (text-xl/2xl/3xl/4xl) don't skew the median upward and force absurdly
  // large attribution.
  const BODY_TEXT_CAP_PX = 18;
  const sizes: number[] = [];
  for (const [cls, px] of Object.entries(TEXT_SIZE_PX)) {
    if (px > BODY_TEXT_CAP_PX) continue;
    const escaped = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'g');
    const matches = content.match(re);
    if (matches) for (let i = 0; i < matches.length; i++) sizes.push(px);
  }
  const inlineRe = /fontSize:\s*(\d+)/g;
  let m;
  while ((m = inlineRe.exec(content)) !== null) {
    const px = parseInt(m[1], 10);
    if (px <= BODY_TEXT_CAP_PX) sizes.push(px);
  }
  if (sizes.length === 0) return null;
  sizes.sort((a, b) => a - b);
  const mid = Math.floor(sizes.length / 2);
  return sizes.length % 2 === 0 ? (sizes[mid - 1] + sizes[mid]) / 2 : sizes[mid];
}

function extractAttributionFont(content: string): number | null {
  // Look for a paragraph/span that contains "Courtesy of" / "courtesy of".
  // Walk backwards on the same JSX element only — stop at a `>` (closing tag)
  // or a blank line, otherwise we'd grab classes from a parent <div>.
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!/[Cc]ourtesy of/.test(lines[i])) continue;
    for (let j = i; j >= Math.max(0, i - 4); j--) {
      // If we encounter a closing > on the previous line, we've left the
      // current element — stop.
      if (j < i && /^\s*>\s*$/.test(lines[j])) break;
      // Match Tailwind class or inline fontSize on this line
      for (const [cls, px] of Object.entries(TEXT_SIZE_PX)) {
        const escaped = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`\\b${escaped}\\b`).test(lines[j])) return px;
      }
      const inline = /fontSize:\s*(\d+)/.exec(lines[j]);
      if (inline) return parseInt(inline[1], 10);
    }
  }
  return null;
}

function hasAttribution(content: string): boolean {
  return /[Cc]ourtesy of/.test(content) ||
    /data-rebny-attribution/.test(content) ||
    /Based on information from the REBNY/.test(content);
}

const findings: Finding[] = [];
const okFiles: string[] = [];

const files = listTsxFiles(APP_DIR);
for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  if (!isListingComponent(content)) continue;

  const rel = path.relative(ROOT, file);

  if (!hasAttribution(content)) {
    findings.push({
      file: rel,
      kind: 'MISSING_ATTRIBUTION',
      detail: 'Component renders listing data but has no "Listing Courtesy of" or REBNY attribution markup',
    });
    continue;
  }

  const median = extractMedianFont(content);
  const attribFont = extractAttributionFont(content);
  if (median !== null && attribFont !== null && attribFont < median) {
    findings.push({
      file: rel,
      kind: 'BELOW_MEDIAN_FONT',
      attributionFont: attribFont,
      medianFont: median,
      detail: `Attribution font ${attribFont}px < median ${median}px — UCBA Art. III §2(C) violation`,
    });
  } else {
    okFiles.push(rel);
  }
}

console.log('═══ PUBLIC ATTRIBUTION AUDIT ═══');
console.log(`Scanned ${files.length} app/ TSX files`);
console.log(`Files rendering listing data: ${findings.length + okFiles.length}`);
console.log('');
if (findings.length === 0) {
  console.log('  ✓ All listing-rendering components have compliant attribution.');
} else {
  console.log(`  ✗ ${findings.length} issues:`);
  for (const f of findings) {
    console.log(`     ${f.kind === 'MISSING_ATTRIBUTION' ? '[MISSING]' : '[FONT]'} ${f.file}`);
    if (f.detail) console.log(`         ${f.detail}`);
  }
}
console.log('');
console.log(`OK files: ${okFiles.length}`);
for (const f of okFiles) console.log(`  ✓ ${f}`);

process.exit(findings.length > 0 ? 1 : 0);
