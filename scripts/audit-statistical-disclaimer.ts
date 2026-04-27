#!/usr/bin/env tsx
// Statistical disclaimer audit (UCBA Art. VIII §4).
//
// Required exact phrasing on every aggregate/statistical surface:
//   "Based on information from the REBNY Listing Service for the period
//    [start date] through [end date]..."
//
// Penalty: $500/$2,000/$10,000/suspension (general UCBA scale) + REBNY
// data-quality fines.
//
// Strategy:
//   1. Identify pages/components that render aggregate statistics
//      (avgPrice / medianPrice / closedSales / dom / counts / trends).
//   2. For each, check it has the disclaimer with "for the period".

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, 'app');

// Tokens indicating aggregate/statistical data is rendered
const STATS_TOKENS = [
  /\bavgPrice\b/, /\bmedianPrice\b/, /\bavg_price\b/, /\bmedian_price\b/,
  /\bavgListPrice\b/, /\bmedianListPrice\b/,
  /\baverageDom\b/, /\bavgDom\b/,
  /\baverageDaysOnMarket\b/,
  /\baverage[A-Z]/, /\bmedian[A-Z]/,
  /\btotalListings\b/, /\bclosedCount\b/,
  /\bpriceTrend\b/, /\bmarketTrend\b/, /\btrend[A-Z]/,
  /MarketStats|MarketModule|MarketSnapshot|MarketReport/,
];

const DISCLAIMER_PERIOD = /Based on information from the REBNY Listing Service for the period/i;
const DISCLAIMER_GENERIC = /Based on information from the REBNY Listing Service/i;
const DISCLAIMER_VIA_COMPONENT = /<IDXDisclaimer|<MarketReport|<MarketStatsModule|<MarketSnapshot|<AnswerBox/;

interface Finding {
  file: string;
  kind: 'STATS_NO_DISCLAIMER' | 'STATS_DISCLAIMER_MISSING_PERIOD';
  detail: string;
}

function listTsxFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      if (entry.name === 'crm' || entry.name === 'admin' || entry.name === 'api') continue;
      out.push(...listTsxFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      if (/^(layout|loading|error|not-found)\.tsx$/.test(entry.name)) continue;
      out.push(full);
    }
  }
  return out;
}

function isAggregateRenderer(content: string): boolean {
  let hits = 0;
  for (const re of STATS_TOKENS) if (re.test(content)) hits++;
  return hits >= 2;
}

const findings: Finding[] = [];
const okFiles: string[] = [];

const files = listTsxFiles(APP_DIR);
for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  if (!isAggregateRenderer(content)) continue;

  const rel = path.relative(ROOT, file);

  const hasPeriod = DISCLAIMER_PERIOD.test(content);
  const hasGeneric = DISCLAIMER_GENERIC.test(content);
  const usesDisclaimerComp = DISCLAIMER_VIA_COMPONENT.test(content);

  if (!hasPeriod && !hasGeneric && !usesDisclaimerComp) {
    findings.push({
      file: rel,
      kind: 'STATS_NO_DISCLAIMER',
      detail: 'Renders aggregate statistics but has no REBNY disclaimer',
    });
  } else if (!hasPeriod && !usesDisclaimerComp && hasGeneric) {
    findings.push({
      file: rel,
      kind: 'STATS_DISCLAIMER_MISSING_PERIOD',
      detail: 'Disclaimer present but missing "for the period [start] through [end]" — UCBA Art. VIII §4 requires explicit period for aggregate stats',
    });
  } else {
    okFiles.push(rel);
  }
}

console.log('═══ STATISTICAL DISCLAIMER AUDIT ═══');
console.log(`Aggregate-stats pages: ${findings.length + okFiles.length}`);
console.log('');
if (findings.length === 0) {
  console.log('  ✓ All aggregate pages carry the UCBA Art. VIII §4 disclaimer.');
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
