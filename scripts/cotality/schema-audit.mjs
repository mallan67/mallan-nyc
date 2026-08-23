#!/usr/bin/env node
/**
 * Audit Mallan's Prisma `Listing` model against the live Cotality Property
 * resource.
 *
 * ONE COMPARISON, ONE AUTHORITY. Mallan's DB columns are compared to the
 * verified Cotality contract and to nothing else. The previous version compared
 * three things - a captured metadata file, a dated field CSV, and a snapshot -
 * which meant a disagreement between them had no adjudicator and the CSV could
 * win.
 *
 * WHAT A FINDING MEANS. A Mallan column whose name matches no Cotality field is
 * not automatically wrong: Mallan owns business columns the provider knows
 * nothing about. It is reported so the distinction is deliberate rather than
 * accidental.
 *
 * Diagnostic only. It is not a gate and asserts no compliance obligation.
 */
import fs from 'fs';

const CONTRACT = 'data/cotality-contract.live.json';
const SCHEMA = 'prisma/schema.prisma';

if (!fs.existsSync(CONTRACT)) {
  console.error('[cotality:schema-audit] UNVERIFIED: ' + CONTRACT + ' missing. Run npm run cotality:pull-contract.');
  process.exit(1);
}
if (!fs.existsSync(SCHEMA)) {
  console.error('[cotality:schema-audit] ' + SCHEMA + ' missing.');
  process.exit(1);
}

const contract = JSON.parse(fs.readFileSync(CONTRACT, 'utf8'));
const property = contract.entityTypes?.Property?.properties;
if (!property) {
  console.error('[cotality:schema-audit] UNVERIFIED: contract declares no Property resource.');
  process.exit(1);
}

// The Listing model block from the Prisma schema.
const schema = fs.readFileSync(SCHEMA, 'utf8');
const block = schema.match(/model\s+Listing\s*\{([\s\S]*?)\n\}/);
if (!block) {
  console.error('[cotality:schema-audit] no Listing model in ' + SCHEMA);
  process.exit(1);
}

/** column name -> the @map("...") name it persists as, if any. */
const columns = new Map();
for (const line of block[1].split('\n')) {
  const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s+\S+/.exec(line);
  if (!m) continue;
  if (/^(@@|\/\/)/.test(line.trim())) continue;
  const mapped = /@map\("([^"]+)"\)/.exec(line);
  columns.set(m[1], mapped ? mapped[1] : null);
}

/** snake_case / camelCase column -> the PascalCase provider field it would be. */
function pascal(name) {
  return name
    .split(/[_\s-]+/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
}

const providerFields = new Set(Object.keys(property));
const matched = [];
const mallanOwned = [];

for (const [col] of columns) {
  const candidates = [col, pascal(col), col.charAt(0).toUpperCase() + col.slice(1)];
  const hit = candidates.find((c) => providerFields.has(c));
  if (hit) matched.push([col, hit]);
  else mallanOwned.push(col);
}

const json = process.argv.includes('--json');
if (json) {
  console.log(
    JSON.stringify(
      {
        source: contract.source,
        pulledAt: contract.pulled_at,
        listingColumns: columns.size,
        providerFields: providerFields.size,
        matchedToCotality: matched.map(([c, f]) => ({ column: c, cotalityField: f })),
        mallanOwnedColumns: mallanOwned,
      },
      null,
      2,
    ),
  );
} else {
  console.log('[cotality:schema-audit] Prisma Listing vs live Cotality Property');
  console.log('  contract pulled : ' + contract.pulled_at);
  console.log('  Listing columns : ' + columns.size);
  console.log('  Property fields : ' + providerFields.size);
  console.log('  matched to a Cotality field : ' + matched.length);
  console.log('  Mallan-owned (no Cotality equivalent) : ' + mallanOwned.length);
  if (process.env.VERBOSE) {
    console.log('\n  Mallan-owned columns:');
    for (const c of mallanOwned) console.log('    ' + c);
  }
}
