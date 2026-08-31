#!/usr/bin/env node
/**
 * SECTION 5.F, PART 2 — DOES A MAX BOUND SILENTLY ADMIT UNKNOWN VALUES?
 *
 * Part 1 established that the operators are accepted. That is not the same as
 * the range MEANING the right thing, and one criterion already proved it:
 * `NumberOfUnitsTotal` carries `-1` on 229 live rows, every one of which
 * satisfies the `NumberOfUnitsTotal le 10` the executor emits for a max-only
 * units search. A building cannot have negative one unit, so those rows have an
 * UNKNOWN unit count and a broker asking for "at most 10 units" is handed them
 * as though they qualified.
 *
 * That is the general shape of the defect, not a quirk of one field:
 *
 *   a `le` bound admits every value BELOW the range, including the values the
 *   provider uses to mean "not specified".
 *
 * Part 1 also showed the same impossible values elsewhere — `LivingArea eq 0` on
 * 151,404 rows and `lt 0` on 59, `StoriesTotal eq 0` on 64,384, `ListPrice lt 0`
 * on 2. This measures, per field, exactly how many rows a realistic max-only
 * search would wrongly admit, so each criterion's disposition rests on a number
 * rather than on an inference from another field's behaviour.
 *
 * ZERO IS JUDGED PER FIELD, NEVER GLOBALLY. `BedroomsTotal eq 0` is a STUDIO —
 * a real, correct zero on 88,158 rows — while `LivingArea eq 0` is a listing
 * with no floor area, which is not a thing. Treating those the same way would
 * either delete studios from Search or bless unknown areas as real. This is the
 * three-state rule (null = unknown, 0 = real zero, positive = amount) applied
 * where the provider encodes unknown as an in-band value instead of null.
 *
 * READ-ONLY. GET only. No Cotality write, no database, no mutation.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { createCotalityClient } from './live-client.mjs';

const client = createCotalityClient();
const PROBED_AT = new Date().toISOString().slice(0, 10);
const results = [];

async function count(field, label, filter, meaning) {
  const r = await client.probe('Property', { $select: 'ListingKey', $count: 'true', $top: 0, $filter: filter }, label);
  const row = {
    field,
    label,
    filter,
    meaning,
    state: r.state,
    httpStatus: r.httpStatus ?? null,
    count: r.state === 'SUPPORTED' ? r.count : null,
    error: r.error ? String(r.error).slice(0, 200) : null,
  };
  results.push(row);
  process.stderr.write(
    `  ${String(row.state).padEnd(18)} ${String(row.count ?? '—').padStart(9)}  ${field}/${label}\n`,
  );
  return row;
}

/**
 * Per field: a realistic max bound, and the predicate identifying values that
 * CANNOT be a real measurement of that quantity.
 */
const FIELDS = [
  { field: 'NumberOfUnitsTotal', max: 10,      impossible: 'NumberOfUnitsTotal lt 1',  why: 'a building has at least one unit; 0 and -1 are both not-a-count' },
  { field: 'LivingArea',         max: 500,     impossible: 'LivingArea lt 1',          why: 'a dwelling has floor area; 0 and negative are not measurements' },
  { field: 'StoriesTotal',       max: 10,      impossible: 'StoriesTotal lt 1',        why: 'a building has at least one storey' },
  { field: 'ListPrice',          max: 500000,  impossible: 'ListPrice lt 1',           why: 'a listed price of 0 or less is not a price' },
  { field: 'RoomsTotal',         max: 3,       impossible: 'RoomsTotal lt 1',          why: 'a dwelling has at least one room' },
  { field: 'YearBuilt',          max: 2020,    impossible: 'YearBuilt lt 1',           why: 'year 0 or negative is not a build year' },
  // BedroomsTotal is deliberately present with a DIFFERENT impossible set:
  // zero bedrooms is a studio, which is real. Only negatives are impossible.
  { field: 'BedroomsTotal',      max: 2,       impossible: 'BedroomsTotal lt 0',       why: 'ZERO IS A STUDIO and must never be excluded; only negatives are impossible' },
];

async function main() {
  process.stderr.write('\n=== how many impossible-valued rows does a max bound admit? ===\n');
  for (const f of FIELDS) {
    await count(f.field, 'max_bound_total', `${f.field} le ${f.max}`, `rows a max-only search returns today`);
    await count(f.field, 'impossible_total', f.impossible, `rows whose value cannot be a real ${f.field}`);
    await count(
      f.field,
      'leaked_into_max',
      `${f.field} le ${f.max} and ${f.impossible}`,
      `WRONG ANSWERS: unknown-valued rows returned as if they qualified — ${f.why}`,
    );
  }

  mkdirSync('artifacts', { recursive: true });
  const out = { probedAt: PROBED_AT, probedAtExact: new Date().toISOString(), fields: FIELDS, results };
  const path = `artifacts/section5f-sentinel-leak-${PROBED_AT}.json`;
  writeFileSync(path, JSON.stringify(out, null, 2));

  process.stderr.write('\n=== LEAK SUMMARY ===\n');
  for (const f of FIELDS) {
    const total = results.find((r) => r.field === f.field && r.label === 'max_bound_total');
    const leak = results.find((r) => r.field === f.field && r.label === 'leaked_into_max');
    if (total?.state !== 'SUPPORTED' || leak?.state !== 'SUPPORTED') {
      process.stderr.write(`  ${f.field.padEnd(20)} UNVERIFIED — not a clean zero\n`);
      continue;
    }
    const pct = total.count ? ((leak.count / total.count) * 100).toFixed(2) : '0.00';
    process.stderr.write(
      `  ${f.field.padEnd(20)} ${String(leak.count).padStart(8)} of ${String(total.count).padStart(8)} (${pct}%) wrong\n`,
    );
  }
  process.stderr.write(`\nevidence -> ${path}\n`);
}

main().catch((e) => {
  process.stderr.write(`\nPROBE RUN FAILED (UNVERIFIED): ${e?.message || e}\n`);
  process.exit(1);
});
