#!/usr/bin/env node
/**
 * SECTION 5.F — DOES THE PROVIDER ACTUALLY SUPPORT WHAT THE EXECUTOR EMITS?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * Sixteen canonical criteria emit a Cotality `$filter` clause today while their
 * registry capability is `needs_probe`. `capability.ts` defines that state as
 * "requires live Cotality verification before it may be relied on", and only
 * `yes` as verified. Code being able to BUILD a clause establishes nothing about
 * whether the provider accepts it, what it means, or how it treats absent values.
 *
 * The temptation is to promote them because price, beds and ZIP obviously work.
 * That is the guessing this workstream exists to remove. `$metadata` proves the
 * fields are DECLARED and their types; it does not prove operator support, value
 * format, sentinel semantics, or that the field means what the broker control
 * claims. `$metadata` over-declares what the licence grants (CLAUDE.md §A.0), so
 * a schema declaration is never capability proof — probe the endpoint.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE ALREADY-KNOWN WRONG ANSWER THIS MUST SETTLE
 *
 * The executor emits `NumberOfUnitsTotal le <maxUnits>` for a max-only units
 * search. Recorded Cotality evidence says that field carries a `-1` on some live
 * rows. If `-1` means "not specified" rather than a building with negative one
 * unit, then `maxUnits=10` silently returns rows whose unit count is unknown —
 * a wrong answer that looks exactly like a correct one. Range semantics cannot
 * be declared correct until that is measured.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS PROBED, PER CRITERION
 *
 * The EXACT expression the production executor emits — not a simplified stand-in.
 * A probe of `ListPrice ge 0` proves nothing about `startswith(StreetNumber,'400')`.
 *
 *   operator support   the clause is accepted at all
 *   positive hit       it returns rows, using a value taken from live data
 *   negative case      an exclusion actually excludes (a filter that matches
 *                      everything is indistinguishable from no filter)
 *   sentinel/null      how absent, zero and negative values behave
 *   compound           it survives beside the real Sale/Rental universe, because
 *                      that is the only shape a broker ever runs
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FAIL LOUD
 *
 * SUPPORTED, PROVIDER_REJECTED and UNVERIFIED are three states and never
 * collapse. An HTTP failure never becomes 0, null or []. A count is recorded
 * only when the request actually returned 200 — the client enforces this and
 * this script never substitutes a default.
 *
 * READ-ONLY. GET only. No Cotality write. No database. No mutation of any kind.
 *
 * Run: node --env-file-if-exists=.env.local --env-file-if-exists=.env \
 *        scripts/cotality/probe-section5f-executor-operators.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { createCotalityClient } from './live-client.mjs';

const client = createCotalityClient();
const PROBED_AT = new Date().toISOString().slice(0, 10);

/** The real Sale universe the executor builds — every compound probe rides on it. */
const SALE_UNIVERSE =
  "PropertyType eq 'Residential' and " +
  "(StandardStatus eq 'Active' or StandardStatus eq 'ComingSoon' or StandardStatus eq 'ActiveUnderContract')";

const results = [];

/**
 * One probe. `expect` records what the result MEANS if it succeeds, so a reader
 * does not have to re-derive intent from an OData string.
 */
async function probe(criterion, label, filter, expect) {
  const r = await client.probe(
    'Property',
    { $select: 'ListingKey', $count: 'true', $top: 0, $filter: filter },
    label,
  );
  const row = {
    criterion,
    label,
    filter,
    expect,
    state: r.state,
    httpStatus: r.httpStatus ?? null,
    // COUNT ONLY WHEN THE REQUEST SUCCEEDED. A rejected probe has no count, and
    // writing 0 here would turn "the provider refused" into "there are none".
    count: r.state === 'SUPPORTED' ? r.count : null,
    error: r.error ? String(r.error).slice(0, 300) : null,
  };
  results.push(row);
  const c = row.count == null ? '—' : String(row.count);
  process.stderr.write(
    `  ${String(row.state).padEnd(18)} ${String(c).padStart(9)}  ${criterion}/${label}\n`,
  );
  return row;
}

async function main() {
  process.stderr.write('\n=== PHASE 1: real values from live data (no invented literals) ===\n');
  const sample = await client.query('Property', {
    $select:
      'ListingId,PostalCode,UnitNumber,StreetNumber,StreetDirPrefix,StreetName,BuildingName,' +
      'ListPrice,BedroomsTotal,LivingArea,YearBuilt,NumberOfUnitsTotal,StoriesTotal,RoomsTotal',
    $filter: SALE_UNIVERSE,
    $top: 1,
    $orderby: 'ListingKey',
  });
  const s = (Array.isArray(sample.value) && sample.value[0]) || null;
  if (!s) throw new Error('FAIL LOUD: no sample row returned; cannot build value-accurate probes');
  process.stderr.write(`  sample ListingId=${s.ListingId} ZIP=${s.PostalCode} unit=${s.UnitNumber}\n`);

  const q = (v) => String(v).replace(/'/g, "''");

  process.stderr.write('\n=== PHASE 2: operator + semantics, per criterion ===\n');

  // ── list_price ────────────────────────────────────────────────────────────
  await probe('list_price', 'ge', 'ListPrice ge 500000', 'min-price bound is accepted');
  await probe('list_price', 'le', 'ListPrice le 500000', 'max-price bound is accepted');
  await probe('list_price', 'excludes', 'ListPrice ge 999000000', 'an absurd floor excludes nearly everything');
  await probe('list_price', 'null', 'ListPrice eq null', 'rows with NO price');
  await probe('list_price', 'zero', 'ListPrice eq 0', 'rows priced exactly 0 — real or sentinel?');
  await probe('list_price', 'negative', 'ListPrice lt 0', 'negative sentinel present?');
  await probe('list_price', 'compound', `${SALE_UNIVERSE} and ListPrice ge 500000`, 'survives the real universe');

  // ── bedrooms ──────────────────────────────────────────────────────────────
  await probe('bedrooms', 'ge', 'BedroomsTotal ge 2', 'min-beds bound accepted');
  await probe('bedrooms', 'le', 'BedroomsTotal le 2', 'max-beds bound accepted');
  await probe('bedrooms', 'null', 'BedroomsTotal eq null', 'unknown bedroom count');
  await probe('bedrooms', 'zero', 'BedroomsTotal eq 0', 'studio — a REAL zero, not unknown');
  await probe('bedrooms', 'negative', 'BedroomsTotal lt 0', 'negative sentinel present?');
  await probe('bedrooms', 'compound', `${SALE_UNIVERSE} and BedroomsTotal ge 2`, 'survives the real universe');

  // ── rooms_total ───────────────────────────────────────────────────────────
  await probe('rooms_total', 'ge', 'RoomsTotal ge 3', 'min-rooms bound accepted');
  await probe('rooms_total', 'le', 'RoomsTotal le 3', 'max-rooms bound accepted');
  await probe('rooms_total', 'null', 'RoomsTotal eq null', 'unknown room count');
  await probe('rooms_total', 'negative', 'RoomsTotal lt 0', 'negative sentinel present?');

  // ── living_area ───────────────────────────────────────────────────────────
  await probe('living_area', 'ge', 'LivingArea ge 500', 'min-sqft bound accepted');
  await probe('living_area', 'le', 'LivingArea le 500', 'max-sqft bound accepted');
  await probe('living_area', 'null', 'LivingArea eq null', 'unknown area');
  await probe('living_area', 'zero', 'LivingArea eq 0', 'zero sqft — real or sentinel?');
  await probe('living_area', 'negative', 'LivingArea lt 0', 'negative sentinel present?');

  // ── year_built ────────────────────────────────────────────────────────────
  await probe('year_built', 'ge', 'YearBuilt ge 1900', 'min-year bound accepted');
  await probe('year_built', 'le', 'YearBuilt le 2020', 'max-year bound accepted');
  await probe('year_built', 'null', 'YearBuilt eq null', 'unknown year');
  await probe('year_built', 'zero', 'YearBuilt eq 0', 'year 0 sentinel?');
  await probe('year_built', 'negative', 'YearBuilt lt 0', 'negative sentinel present?');

  // ── stories_total ─────────────────────────────────────────────────────────
  await probe('stories_total', 'ge', 'StoriesTotal ge 1', 'min-floors bound accepted');
  await probe('stories_total', 'le', 'StoriesTotal le 10', 'max-floors bound accepted');
  await probe('stories_total', 'null', 'StoriesTotal eq null', 'unknown floor count');
  await probe('stories_total', 'zero', 'StoriesTotal eq 0', 'zero floors — sentinel?');
  await probe('stories_total', 'negative', 'StoriesTotal lt 0', 'negative sentinel present?');

  // ── units_total — THE KNOWN WRONG-ANSWER RISK ─────────────────────────────
  await probe('units_total', 'ge', 'NumberOfUnitsTotal ge 1', 'min-units bound accepted');
  await probe('units_total', 'le', 'NumberOfUnitsTotal le 10', 'THE EXACT max-only clause the executor emits');
  await probe('units_total', 'null', 'NumberOfUnitsTotal eq null', 'unknown unit count');
  await probe('units_total', 'zero', 'NumberOfUnitsTotal eq 0', 'zero units — sentinel?');
  await probe('units_total', 'negative_one', 'NumberOfUnitsTotal eq -1', 'THE -1 SENTINEL: does it exist live?');
  await probe('units_total', 'negative_any', 'NumberOfUnitsTotal lt 0', 'any negative value at all');
  await probe(
    'units_total',
    'sentinel_leaks_into_max',
    'NumberOfUnitsTotal le 10 and NumberOfUnitsTotal lt 0',
    'DOES a negative row satisfy maxUnits=10? non-zero here = wrong answers today',
  );

  // ── postal_code ───────────────────────────────────────────────────────────
  await probe('postal_code', 'eq_live', `PostalCode eq '${q(s.PostalCode)}'`, 'exact ZIP from live data');
  await probe('postal_code', 'excludes', "PostalCode eq '00000'", 'a non-existent ZIP excludes');
  await probe('postal_code', 'null', 'PostalCode eq null', 'rows with no ZIP');
  await probe('postal_code', 'compound', `${SALE_UNIVERSE} and PostalCode eq '${q(s.PostalCode)}'`, 'survives the real universe');

  // ── unit ──────────────────────────────────────────────────────────────────
  if (s.UnitNumber) {
    const u = String(s.UnitNumber);
    await probe('unit', 'eq_upper', `UnitNumber eq '${q(u.toUpperCase())}'`, 'the executor UPPERCASES before comparing');
    await probe('unit', 'eq_lower', `UnitNumber eq '${q(u.toLowerCase())}'`, 'CASE SENSITIVITY: differing count = case-exact');
  } else {
    await probe('unit', 'eq_upper', "UnitNumber eq '17C'", 'sample row had no unit; literal probe');
    await probe('unit', 'eq_lower', "UnitNumber eq '17c'", 'case sensitivity');
  }
  await probe('unit', 'null', 'UnitNumber eq null', 'rows with no unit number');

  // ── building_name / keyword — contains() must be PERMITTED ────────────────
  await probe('building_name', 'contains', "contains(BuildingName,'Park')", 'contains() on BuildingName');
  await probe('building_name', 'excludes', "contains(BuildingName,'ZZQXNOTREAL')", 'a nonsense needle excludes');
  await probe('public_remarks_keyword', 'contains', "contains(PublicRemarks,'renovated')", 'contains() on PublicRemarks');
  await probe('public_remarks_keyword', 'excludes', "contains(PublicRemarks,'ZZQXNOTREAL')", 'nonsense needle excludes');
  await probe(
    'public_remarks_keyword',
    'compound',
    `${SALE_UNIVERSE} and contains(PublicRemarks,'renovated')`,
    'survives the real universe',
  );

  // ── street_address — the structured predicate, piece by piece ─────────────
  await probe('street_address', 'startswith_number', `startswith(StreetNumber,'${q(s.StreetNumber ?? '4')}')`, 'startswith on StreetNumber');
  await probe('street_address', 'startswith_false_match', "startswith(StreetNumber,'4')", 'BREADTH: 4 matches 4, 40, 400, 4000');
  await probe('street_address', 'dirprefix_as_string', "StreetDirPrefix eq 'E'", "THE ENUM COMPARED AS A STRING — exactly what the executor emits");
  await probe('street_address', 'dirprefix_east_word', "StreetDirPrefix eq 'East'", 'is the member spelled out instead?');
  await probe('street_address', 'contains_streetname', "contains(StreetName,'90')", 'contains() on StreetName');
  await probe(
    'street_address',
    'full_structured',
    "(startswith(StreetNumber,'400') and StreetDirPrefix eq 'E' and contains(StreetName,'90'))",
    'THE WHOLE EXPRESSION the executor builds for a directional address',
  );

  // ── dates — literal form and boundary inclusivity ─────────────────────────
  await probe('close_date', 'ge', 'CloseDate ge 2026-01-01', 'Edm.Date bare literal, as emitted');
  await probe('close_date', 'le', 'CloseDate le 2026-12-31', 'upper bound');
  await probe('close_date', 'null', 'CloseDate eq null', 'not-yet-closed rows');
  await probe('listing_contract_date', 'ge', 'ListingContractDate ge 2026-01-01', 'Edm.Date bare literal');
  await probe('listing_contract_date', 'le', 'ListingContractDate le 2026-12-31', 'upper bound');
  await probe('activity_date', 'listed_ge', 'ListingContractDate ge 2026-06-01', 'Listed basis, as emitted');
  await probe('activity_date', 'updated_gt', 'ModificationTimestamp gt 2026-06-01T00:00:00Z', 'Updated basis uses gt + Z form');
  await probe('activity_date', 'updated_le', 'ModificationTimestamp le 2026-06-01T23:59:59Z', 'Updated upper bound end-of-day');
  // BOUNDARY INCLUSIVITY: ge/le on one exact day must equal eq on that day, or
  // the range silently drops or double-counts its own edge.
  await probe('activity_date', 'boundary_range', 'ListingContractDate ge 2026-06-02 and ListingContractDate le 2026-06-02', 'one-day range');
  await probe('activity_date', 'boundary_eq', 'ListingContractDate eq 2026-06-02', 'same day by equality — counts MUST match');

  // ── listing_id_canonical — provider domain only ───────────────────────────
  await probe('listing_id_canonical', 'eq_live', `ListingId eq '${q(s.ListingId)}'`, 'provider-domain ListingId from live data');
  await probe('listing_id_canonical', 'eq_mallan_domain', "ListingId eq 'SL-0001'", 'a Mallan reference the provider never issued');

  // ── bathrooms — ONE bounded confirmation of the shape bath-contract emits ──
  await probe('bathrooms', 'contract_disjunct', '(BathroomsFull eq 1 and BathroomsHalf ge 1)', 'the exact half-bath term bath-contract renders');
  await probe('bathrooms', 'contract_full_only', 'BathroomsFull ge 2', 'the whole-number term');
  await probe('bathrooms', 'contract_le', '(BathroomsFull eq 1 and BathroomsHalf le 1)', 'the max-side term');

  // ─────────────────────────────────────────────────────────────────────────
  mkdirSync('artifacts', { recursive: true });
  const out = {
    probedAt: PROBED_AT,
    probedAtExact: new Date().toISOString(),
    base: 'https://api.cotality.com/trestle',
    universe: SALE_UNIVERSE,
    sampleRow: { ListingId: s.ListingId, PostalCode: s.PostalCode, UnitNumber: s.UnitNumber },
    totals: {
      probes: results.length,
      supported: results.filter((r) => r.state === 'SUPPORTED').length,
      providerRejected: results.filter((r) => r.state === 'PROVIDER_REJECTED').length,
      unverified: results.filter((r) => r.state !== 'SUPPORTED' && r.state !== 'PROVIDER_REJECTED').length,
    },
    results,
  };
  const path = `artifacts/section5f-executor-operator-probe-${PROBED_AT}.json`;
  writeFileSync(path, JSON.stringify(out, null, 2));

  process.stderr.write(`\n=== TOTALS ===\n`);
  process.stderr.write(`  probes            ${out.totals.probes}\n`);
  process.stderr.write(`  SUPPORTED         ${out.totals.supported}\n`);
  process.stderr.write(`  PROVIDER_REJECTED ${out.totals.providerRejected}\n`);
  process.stderr.write(`  UNVERIFIED        ${out.totals.unverified}\n`);
  process.stderr.write(`\nevidence -> ${path}\n`);
  process.stdout.write(JSON.stringify(out.totals) + '\n');
}

main().catch((e) => {
  // A crash is UNVERIFIED, never a clean zero.
  process.stderr.write(`\nPROBE RUN FAILED (UNVERIFIED): ${e?.message || e}\n`);
  process.exit(1);
});
