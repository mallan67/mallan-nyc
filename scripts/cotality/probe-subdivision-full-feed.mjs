#!/usr/bin/env node
/**
 * THE NEIGHBOURHOOD VOCABULARY, READ FROM THE WHOLE FEED — NOT THE ON-MARKET SLICE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS EXISTS TO CORRECT
 *
 * The first vocabulary was read from the on-market Search universe —
 * Active + ComingSoon + ActiveUnderContract — which is 7,741 rows of 591,409.
 * One and a third percent of the feed. `geography.ts` then enforced that list as
 * a UNIVERSAL REFUSAL at every status, so a name absent from current on-market
 * inventory was rejected with "Not a live Cotality value".
 *
 * That message asserts a universal negative the read could not support, and it is
 * false for real neighbourhoods:
 *
 *     Gramercy       666 rows      Union Square     654 rows
 *     Civic Center   122 rows      South Slope       33 rows
 *     Stuyvesant Town 14 rows      Sugar Hill        10 rows
 *
 * A Closed/comps search for any of them hard-failed, and `comparable` is in that
 * criterion's own workflow list — the one workflow the on-market universe
 * excludes. Silent widening was replaced by a hard refusal of legitimate queries,
 * which for comps is the worse defect.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS READS
 *
 * EVERY Property row — every status AND every PropertyType — selecting only
 * SubdivisionName and CityRegion. That is ~592 pages. It is a one-time contract
 * build, read-only, and the right size for a fact the whole product depends on.
 *
 * Records for each folded identity: every raw spelling the provider carries, the
 * row count of each, and the borough(s) it appears in — so case-only variants can
 * be collapsed to one broker-facing identity while the union of raw spellings
 * still executes, and so a name in two boroughs is caught rather than assumed
 * away.
 *
 * READ-ONLY. GET only. No Cotality write, no database, no mutation.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { createCotalityClient } from './live-client.mjs';

const client = createCotalityClient();
const PROBED_AT = new Date().toISOString().slice(0, 10);

/** EVERY status. The point of this probe is that status must not scope identity. */
// EVERY Property row, with NO PropertyType restriction.
//
// The first pass scoped this to Residential + ResidentialLease, which are the Sale
// and Rental universes. Building Search sends no `type` at all, so the executor
// adds no PropertyType predicate for it — meaning Building could execute over a
// broader universe than the geography vocabulary that validates it.
//
// Measured 2026-08-31: those two types account for 591,409 of 591,409 rows, so the
// scoped census happened to cover Building. Relying on that coincidence is exactly
// the silent divergence the positive PropertyType universe contract exists to
// prevent, so the universe is now unconditional and cannot drift out from under
// Building if the feed ever carries another type.
const UNIVERSE = null;

/** Same fold as geography.ts: case, space and punctuation insensitive. */
const fold = (v) => v.toLowerCase().replace(/[^a-z]/g, '');

async function main() {
  process.stderr.write('\n=== full-feed SubdivisionName census (all statuses) ===\n');
  const page = await client.page(
    'Property',
    UNIVERSE ? { $select: 'SubdivisionName,CityRegion', $filter: UNIVERSE, $top: 1000 }
            : { $select: 'SubdivisionName,CityRegion', $top: 1000 },
    { maxRows: Infinity, maxPages: 1200 },
  );
  const rows = page.rows ?? [];
  if (page.truncated) {
    throw new Error(`REFUSING: read truncated at ${rows.length} rows — a partial vocabulary would blocklist real neighbourhoods`);
  }
  process.stderr.write(`  rows ${rows.length}, pages ${page.pages}\n`);

  const byFolded = new Map();
  let blank = 0;
  for (const r of rows) {
    const name = typeof r.SubdivisionName === 'string' ? r.SubdivisionName.trim() : '';
    if (!name) { blank += 1; continue; }
    const region = typeof r.CityRegion === 'string' ? r.CityRegion.trim() : '';
    const key = fold(name);
    const e = byFolded.get(key) ?? { spellings: new Map(), boroughs: new Map() };
    e.spellings.set(name, (e.spellings.get(name) ?? 0) + 1);
    if (region) e.boroughs.set(region, (e.boroughs.get(region) ?? 0) + 1);
    byFolded.set(key, e);
  }

  const identities = [];
  const multiBorough = [];
  for (const [key, e] of byFolded) {
    const spellings = [...e.spellings.entries()].sort((a, b) => b[1] - a[1]);
    const boroughs = [...e.boroughs.entries()].sort((a, b) => b[1] - a[1]);
    if (boroughs.length > 1) {
      multiBorough.push({ folded: key, spellings: spellings.map(([s]) => s), boroughs: Object.fromEntries(boroughs) });
    }
    identities.push({
      folded: key,
      // The most-populated raw spelling. A PRESENTATION label may override this —
      // that is a Mallan naming decision, not a provider fact — but the default
      // is the provider's own commonest form rather than an invented one.
      commonestSpelling: spellings[0][0],
      spellings: spellings.map(([s, n]) => ({ value: s, rows: n })),
      rows: spellings.reduce((sum, [, n]) => sum + n, 0),
      borough: boroughs.length === 1 ? boroughs[0][0] : null,
      boroughs: Object.fromEntries(boroughs),
    });
  }
  identities.sort((a, b) => a.folded.localeCompare(b.folded));

  const caseGroups = identities.filter((i) => i.spellings.length > 1);
  process.stderr.write(`  blank SubdivisionName rows : ${blank}\n`);
  process.stderr.write(`  distinct folded identities : ${identities.length}\n`);
  process.stderr.write(`  identities with >1 spelling: ${caseGroups.length}\n`);
  process.stderr.write(`  identities in >1 borough   : ${multiBorough.length}\n\n`);
  for (const g of caseGroups.slice(0, 25)) {
    process.stderr.write(`    ${g.commonestSpelling.padEnd(26)} ${g.spellings.map((s) => `${s.value}(${s.rows})`).join(' ')}\n`);
  }
  if (multiBorough.length) {
    process.stderr.write('\n  MULTI-BOROUGH (identity is NOT unique):\n');
    for (const m of multiBorough) {
      process.stderr.write(`    ${m.spellings.join('/')} -> ${JSON.stringify(m.boroughs)}\n`);
    }
  }

  mkdirSync('artifacts', { recursive: true });
  const out = {
    probedAt: PROBED_AT,
    probedAtExact: new Date().toISOString(),
    universe: UNIVERSE ?? 'ALL Property rows — no PropertyType restriction',
    scope: 'ALL statuses AND all PropertyTypes — covers whatever Building Search executes',
    rowsRead: rows.length,
    pagesRead: page.pages,
    truncated: Boolean(page.truncated),
    complete: !page.truncated,
    blankSubdivisionNameRows: blank,
    distinctIdentities: identities.length,
    identitiesWithMultipleSpellings: caseGroups.length,
    uniquePerBorough: multiBorough.length === 0,
    multiBorough,
    identities,
  };
  const path = `artifacts/subdivision-full-feed-${PROBED_AT}.json`;
  writeFileSync(path, JSON.stringify(out, null, 2));
  process.stderr.write(`\nevidence -> ${path}\n`);
  process.stdout.write(JSON.stringify({
    rows: rows.length, identities: identities.length,
    caseGroups: caseGroups.length, multiBorough: multiBorough.length,
  }) + '\n');
}

main().catch((e) => {
  process.stderr.write(`\nPROBE RUN FAILED (UNVERIFIED): ${e?.message || e}\n`);
  process.exit(1);
});
