/// <reference types="jest" />
/**
 * THE FACT THAT DETERMINES THE WHOLE MAP DESIGN.
 *
 * Verified live against api.cotality.com on 2026-08-26, because a repo claim
 * about provider data is not evidence and this one decides an architecture:
 *
 *   $select=Latitude,Longitude on live Active rows  -> null, every row
 *   $filter=Latitude ne null                        -> HTTP 400,
 *                                                      "cannot be used"
 *
 * Both facts matter and they are different. Null values mean provider
 * coordinates cannot draw a pin. Suppression for filtering means Mallan cannot
 * ask "which listings are in this viewport" AT ALL — a spatial provider query
 * does not exist on this subscription, at any price, for any viewport.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THAT MAKES THE MAP CONTRACT.
 *
 * Geography has to be expressed in the provider's OWN vocabulary, and
 * coordinates have to come from Mallan's side:
 *
 *     viewport / polygon
 *   -> the neighbourhoods and boroughs it covers
 *   -> CityRegion / SubdivisionName / PostalCode criteria (proven filterable)
 *   -> the final universe for that geography
 *   -> pins from the existing Census-backed GeocodeCache (address_key ->
 *      lat/lng, source census | zip_centroid)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS TRUE OF THE CODE TODAY, stated rather than implied: the map takes a
 * bounded head read of the same criteria. For a 4,622-result search the first
 * 500 rows in PRICE order are not the geography of the result set, so this is a
 * sample and the code now says so. An earlier comment asserted that pins beyond
 * 500 "add nothing a broker can read" — that was an assertion, not a finding,
 * and this file exists partly so it cannot be made again.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO = resolve(__dirname, '../..');
const engine = readFileSync(resolve(REPO, 'public/crm/js/search/search-engine.js'), 'utf8');
const filter = readFileSync(resolve(REPO, 'lib/search/crm-idx-filter.ts'), 'utf8');
const schema = readFileSync(resolve(REPO, 'prisma/schema.prisma'), 'utf8');

// Start at the doc comment, not the function keyword — the constraint being
// asserted is documented ABOVE the declaration.
const mapBlock = engine.slice(
  engine.indexOf('A BOUNDED READ FOR THE MAP'),
  engine.indexOf('function _requestResultPage('),
);

describe('provider coordinates are not a usable geography source', () => {
  it('no OData filter is ever built on Latitude or Longitude', () => {
    // Live: PROVIDER-SUPPRESSED for filtering. Emitting one would 400 the whole
    // search, not merely return nothing.
    const code = filter
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    expect(code).not.toMatch(/Latitude (eq|ne|ge|le|gt|lt) /);
    expect(code).not.toMatch(/Longitude (eq|ne|ge|le|gt|lt) /);
  });

  it('the constraint is recorded where the map code can be read', () => {
    // A future contributor reaching for a viewport query must meet this fact
    // before writing the query, not after the 400.
    expect(mapBlock).toMatch(/PROVIDER-SUPPRESSED for filtering/);
    expect(mapBlock).toMatch(/NULL on live/i);
  });
});

describe('the map read does not claim to be the map universe', () => {
  it('it is labelled a bounded head sample', () => {
    expect(mapBlock).toMatch(/BOUNDED HEAD SAMPLE, NOT THE MAP UNIVERSE/);
  });

  it('the discredited "adds nothing a broker can read" claim is gone', () => {
    expect(mapBlock).not.toMatch(/add nothing a broker can read\./);
  });

  it('partial coverage is recorded so a renderer can disclose it', () => {
    // Showing a sample without saying so is the same shape as printing a
    // fetched window as the result total.
    expect(engine).toMatch(/mapIsPartial/);
  });

  it('the intended contract is written down, not left implicit', () => {
    expect(mapBlock).toMatch(/GeocodeCache/);
    expect(mapBlock).toMatch(/CityRegion \/ SubdivisionName \/ PostalCode/);
  });
});

describe('the Mallan-side geography source it will use already exists', () => {
  it('a Census-backed geocode cache is in the schema', () => {
    // So the real map does not need a new store, a new provider, or Google.
    expect(schema).toMatch(/model GeocodeCache/);
    expect(schema).toMatch(/address_key\s+String\s+@unique/);
    expect(schema).toMatch(/source\s+String\s+@default\("census"\)/);
  });

  it('the provider geography fields the criteria use ARE filterable', () => {
    // CityRegion and SubdivisionName carry the borough/neighborhood criteria
    // and are executed today, which is what makes the contract above possible.
    // They live in the canonical geography module rather than the filter
    // builder, which delegates to it — asserting against the builder found
    // nothing and would have read as "geography is not wired".
    const geography = readFileSync(
      resolve(REPO, 'lib/search/canonical/geography.ts'),
      'utf8',
    );
    const code = geography
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n');
    expect(code).toMatch(/CityRegion/);
    expect(code).toMatch(/SubdivisionName/);
  });
});
