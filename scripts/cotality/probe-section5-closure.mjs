#!/usr/bin/env node
/**
 * SECTION 5 CLOSURE PROBE — the three questions the first batch left open.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. ADDRESS: does `startswith` ANSWER THE BROKER'S QUESTION?
 *
 * The first batch proved the provider ACCEPTS `startswith(StreetNumber,'400')`.
 * That is not the same as it being right. `startswith(StreetNumber,'4')` returned
 * 64,603 rows because it matches 4, 40, 400 and 4000 alike, and the note recording
 * that called the breadth "NOT A DEFECT" — a conclusion never earned.
 *
 * A broker who selects 400 East 90th Street is not asking for every address
 * beginning with 400. Prefix matching is legitimate for free-text DISCOVERY;
 * it is wrong for a SELECTED address. This measures the collision exactly so the
 * two can be separated on evidence instead of on assertion.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 2. ZIP: the negative control was not a negative control.
 *
 * `PostalCode eq '00000'` was intended to prove an exclusion excludes. It
 * returned 215 rows, so 00000 is another in-band unknown, and an exclusion probe
 * that matches 215 rows proves nothing. A value must be found that is genuinely
 * absent before the negative case means anything.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 3. NEIGHBOURHOOD: what does the PROVIDER actually carry?
 *
 * geography.ts reverses data/rls/geo/neighborhood-aliases.json — whose own _meta
 * says "Maps RLS SubdivisionName variants", generatedAt 2026-03-19 — into
 * Cotality `SubdivisionName eq` search values. That is old RLS evidence defining
 * current provider truth, which is the exact inversion the architecture forbids:
 * the chain is COTALITY RAW -> VERIFIED MAPPING -> MALLAN CANONICAL, never the
 * reverse.
 *
 * This enumerates the SubdivisionName values the live feed ACTUALLY carries, so
 * a verified crosswalk can replace the assumed one. The alias file stays useful
 * as history and as UI vocabulary; it stops being provider authority.
 *
 * READ-ONLY. GET only. No Cotality write, no database, no mutation.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { createCotalityClient } from './live-client.mjs';

const client = createCotalityClient();
const PROBED_AT = new Date().toISOString().slice(0, 10);
const results = [];

async function count(group, label, filter, meaning) {
  const r = await client.probe('Property', { $select: 'ListingKey', $count: 'true', $top: 0, $filter: filter }, label);
  const row = {
    group, label, filter, meaning,
    state: r.state,
    httpStatus: r.httpStatus ?? null,
    count: r.state === 'SUPPORTED' ? r.count : null,
    error: r.error ? String(r.error).slice(0, 200) : null,
  };
  results.push(row);
  process.stderr.write(`  ${String(row.state).padEnd(18)} ${String(row.count ?? '—').padStart(8)}  ${group}/${label}\n`);
  return row;
}

async function main() {
  // ── 1. ADDRESS COLLISION ────────────────────────────────────────────────
  process.stderr.write('\n=== 1. ADDRESS: prefix vs exact street number ===\n');
  for (const n of ['4', '40', '400', '4000']) {
    await count('address', `exact_${n}`, `StreetNumber eq '${n}'`, `addresses whose number IS exactly ${n}`);
    await count('address', `prefix_${n}`, `startswith(StreetNumber,'${n}')`, `addresses whose number BEGINS with ${n}`);
    await count(
      'address',
      `false_matches_${n}`,
      `startswith(StreetNumber,'${n}') and StreetNumber ne '${n}'`,
      `rows a prefix search adds that are NOT street number ${n}`,
    );
  }
  // The whole structured predicate, prefix vs exact, on a real NYC address.
  await count(
    'address',
    'structured_prefix',
    "(startswith(StreetNumber,'400') and StreetDirPrefix eq 'E' and contains(StreetName,'90'))",
    'the expression the executor builds today',
  );
  await count(
    'address',
    'structured_exact',
    "(StreetNumber eq '400' and StreetDirPrefix eq 'E' and contains(StreetName,'90'))",
    'the same address asked EXACTLY',
  );

  // ── 2. ZIP: find a genuinely absent value ───────────────────────────────
  process.stderr.write('\n=== 2. ZIP: a real negative control ===\n');
  await count('postal_code', 'sentinel_00000', "PostalCode eq '00000'", 'the value used as the old negative control');
  for (const z of ['99999', '00001', '12345678']) {
    await count('postal_code', `candidate_${z}`, `PostalCode eq '${z}'`, 'candidate absent value');
  }

  // ── 3. NEIGHBOURHOOD: the live vocabulary ───────────────────────────────
  process.stderr.write('\n=== 3. NEIGHBOURHOOD: enumerating live SubdivisionName ===\n');
  const seen = new Map();
  let pages = 0;
  let next = null;
  let rows = 0;
  // The Search-eligible universe: what a broker can actually reach today.
  const UNIVERSE =
    "(PropertyType eq 'Residential' or PropertyType eq 'ResidentialLease') and " +
    "(StandardStatus eq 'Active' or StandardStatus eq 'ComingSoon' or StandardStatus eq 'ActiveUnderContract')";
  const page = await client.page(
    'Property',
    { $select: 'SubdivisionName', $filter: UNIVERSE, $top: 1000 },
    { maxRows: 60000, maxPages: 80 },
  );
  for (const r of page.rows ?? []) {
    rows += 1;
    const v = r.SubdivisionName;
    if (typeof v !== 'string' || !v.trim()) continue;
    seen.set(v, (seen.get(v) ?? 0) + 1);
  }
  pages = page.pages ?? 0;
  next = page.truncated ?? false;
  process.stderr.write(`  rows read ${rows}, pages ${pages}, truncated=${next}\n`);
  process.stderr.write(`  DISTINCT live SubdivisionName values: ${seen.size}\n`);

  const live = [...seen.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => ({ name, rows: n }));

  mkdirSync('artifacts', { recursive: true });
  const out = {
    probedAt: PROBED_AT,
    probedAtExact: new Date().toISOString(),
    universe: UNIVERSE,
    neighborhood: {
      rowsRead: rows,
      pagesRead: pages,
      truncated: next,
      distinctCount: seen.size,
      // TRUNCATION MATTERS: a partial read is a partial vocabulary, and treating
      // it as complete would blocklist real neighbourhoods. Recorded explicitly.
      complete: !next,
      values: live,
    },
    results,
  };
  const path = `artifacts/section5-closure-probe-${PROBED_AT}.json`;
  writeFileSync(path, JSON.stringify(out, null, 2));
  process.stderr.write(`\nevidence -> ${path}\n`);
  process.stdout.write(JSON.stringify({ probes: results.length, distinctNeighborhoods: seen.size, complete: !next }) + '\n');
}

main().catch((e) => {
  process.stderr.write(`\nPROBE RUN FAILED (UNVERIFIED): ${e?.message || e}\n`);
  process.exit(1);
});
