/// <reference types="jest" />
/**
 * /api/listings/building must filter on StandardStatus, NOT MlsStatus.
 *
 * MlsStatus is provider-suppressed in the REBNY IDX Plus OData $filter — Trestle
 * returns HTTP 400 ("Results from 'RLS' has been suppressed (provider Level)").
 * The route caught that failure and returned empty arrays, so the "units in this
 * building" / sales-history section (BuildingUnits, rendered on every listing
 * detail page) silently disappeared. This locks the fix: the OData $filter uses
 * StandardStatus (the filterable field), never MlsStatus. (2026-07-08)
 */
import { readFileSync } from 'fs';
import * as path from 'path';

const src = readFileSync(
  path.resolve(__dirname, '../../app/api/listings/building/route.ts'),
  'utf8',
);

describe('/api/listings/building — StandardStatus filter (no MlsStatus 400)', () => {
  it('never puts MlsStatus in an OData $filter (would 400 the whole query)', () => {
    // MlsStatus may still be $select-ed or read client-side; it must NOT appear
    // in a `... eq 'X'` filter clause.
    expect(src).not.toMatch(/MlsStatus\s+eq\s+'/);
  });

  it('filters active units on StandardStatus eq \'Active\'', () => {
    expect(src).toMatch(/StandardStatus eq 'Active'/);
  });

  it('filters closed sales on StandardStatus eq \'Closed\'', () => {
    expect(src).toMatch(/StandardStatus eq 'Closed'/);
  });
});
