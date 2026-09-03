#!/usr/bin/env node
/**
 * IS A NEIGHBOURHOOD NAME UNIQUE TO ONE BOROUGH?
 *
 * The closure probe proved WHICH SubdivisionName values the feed carries. It did
 * not prove that each one identifies a single place. `SubdivisionName eq 'X'` is
 * only an exact NYC neighbourhood identity if X belongs to exactly one borough —
 * otherwise a broker selecting a Manhattan neighbourhood silently receives a
 * same-named one in Brooklyn, which is the widening this section exists to end.
 *
 * The browser already stores the borough alongside each selected neighbourhood,
 * so if uniqueness does NOT hold the fix is available: carry that borough into
 * the predicate and execute `(CityRegion eq B and SubdivisionName eq N)`.
 *
 * Deciding that on evidence rather than on the plausible assumption that NYC
 * neighbourhood names are distinct — Chelsea, Bay Ridge, Sunnyside and Highbridge
 * all have real claimants in more than one borough nationally, and this feed is
 * not obliged to be tidy.
 *
 * READ-ONLY. GET only. No Cotality write, no database, no mutation.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { createCotalityClient } from './live-client.mjs';

const client = createCotalityClient();
const PROBED_AT = new Date().toISOString().slice(0, 10);

const UNIVERSE =
  "(PropertyType eq 'Residential' or PropertyType eq 'ResidentialLease') and " +
  "(StandardStatus eq 'Active' or StandardStatus eq 'ComingSoon' or StandardStatus eq 'ActiveUnderContract')";

/** Same fold as geography.ts — case/space/punctuation-insensitive identity. */
const fold = (v) => v.toLowerCase().replace(/[^a-z]/g, '');

async function main() {
  process.stderr.write('\n=== SubdivisionName x CityRegion pair census ===\n');
  const page = await client.page(
    'Property',
    { $select: 'SubdivisionName,CityRegion', $filter: UNIVERSE, $top: 1000 },
    { maxRows: 60000, maxPages: 80 },
  );
  const rows = page.rows ?? [];
  if (page.truncated) throw new Error('REFUSING: read truncated — a partial census cannot prove uniqueness');
  process.stderr.write(`  rows ${rows.length}, pages ${page.pages}, truncated=${page.truncated}\n`);

  // folded name -> borough -> { rows, spellings }
  const byName = new Map();
  let nullRegion = 0;
  for (const r of rows) {
    const name = typeof r.SubdivisionName === 'string' ? r.SubdivisionName.trim() : '';
    if (!name) continue;
    const region = typeof r.CityRegion === 'string' ? r.CityRegion.trim() : '';
    if (!region) nullRegion += 1;
    const key = fold(name);
    const entry = byName.get(key) ?? { spellings: new Set(), boroughs: new Map() };
    entry.spellings.add(name);
    entry.boroughs.set(region || '(null)', (entry.boroughs.get(region || '(null)') ?? 0) + 1);
    byName.set(key, entry);
  }

  const multi = [];
  for (const [key, e] of byName) {
    const real = [...e.boroughs.entries()].filter(([b]) => b !== '(null)');
    if (real.length > 1) {
      multi.push({
        folded: key,
        spellings: [...e.spellings],
        boroughs: Object.fromEntries(real.sort((a, b) => b[1] - a[1])),
      });
    }
  }
  multi.sort((a, b) => Object.values(b.boroughs).reduce((x, y) => x + y, 0)
                     - Object.values(a.boroughs).reduce((x, y) => x + y, 0));

  process.stderr.write(`  distinct folded names        : ${byName.size}\n`);
  process.stderr.write(`  rows with NULL CityRegion    : ${nullRegion}\n`);
  process.stderr.write(`  names spanning >1 borough    : ${multi.length}\n\n`);
  for (const m of multi) {
    const parts = Object.entries(m.boroughs).map(([b, n]) => `${b}(${n})`).join('  ');
    process.stderr.write(`    ${m.spellings.join(' / ').padEnd(30)} ${parts}\n`);
  }

  mkdirSync('artifacts', { recursive: true });
  const out = {
    probedAt: PROBED_AT,
    probedAtExact: new Date().toISOString(),
    universe: UNIVERSE,
    rowsRead: rows.length,
    pagesRead: page.pages,
    truncated: Boolean(page.truncated),
    complete: !page.truncated,
    distinctFoldedNames: byName.size,
    rowsWithNullCityRegion: nullRegion,
    // THE ANSWER, stated as a fact rather than left to a reader to infer.
    uniquePerBorough: multi.length === 0,
    namesSpanningMultipleBoroughs: multi,
    // The full name -> borough map, so the BROWSER vocabulary can be generated
    // from this same evidence instead of hand-copied. Hand-copying is how four
    // separate neighbourhood lists came to exist in the first place.
    byBorough: (() => {
      const out = {};
      for (const [, e] of byName) {
        for (const spelling of e.spellings) {
          const real = [...e.boroughs.entries()].filter(([b]) => b !== '(null)');
          if (real.length !== 1) continue;
          const borough = real[0][0];
          (out[borough] ??= []).push(spelling);
        }
      }
      for (const b of Object.keys(out)) out[b] = [...new Set(out[b])].sort();
      return out;
    })(),
  };
  const path = `artifacts/subdivision-borough-uniqueness-${PROBED_AT}.json`;
  writeFileSync(path, JSON.stringify(out, null, 2));
  process.stderr.write(`\nevidence -> ${path}\n`);
  process.stdout.write(JSON.stringify({ unique: out.uniquePerBorough, multi: multi.length }) + '\n');
}

main().catch((e) => {
  process.stderr.write(`\nPROBE RUN FAILED (UNVERIFIED): ${e?.message || e}\n`);
  process.exit(1);
});
