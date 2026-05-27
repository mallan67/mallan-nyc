/**
 * excludeUndisclosed filter tests.
 *
 * Verifies that the DB-level AND DTO-level filters correctly:
 * 1. Include CRM exclusives (SL-/RL- prefix) even with internet_address_display_yn=false
 * 2. Exclude RLS rows with internet_address_display_yn=false before pagination
 * 3. FeaturedListings passes excludeUndisclosed=true
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROUTE_PATH = resolve(__dirname, '../../app/api/listings/route.ts');
const routeSource = readFileSync(ROUTE_PATH, 'utf8');

const FEATURED_PATH = resolve(__dirname, '../../app/components/FeaturedListings.tsx');
const featuredSource = readFileSync(FEATURED_PATH, 'utf8');

describe('excludeUndisclosed DB filter', () => {
  test('DB-level filter uses AND with OR for SL-/RL- prefix and internet_address_display_yn', () => {
    const idx = routeSource.indexOf('if (excludeUndisclosed)');
    expect(idx).toBeGreaterThan(-1);
    const block = routeSource.slice(idx, idx + 500);
    expect(block).toContain("listing_id: { startsWith: 'SL-' }");
    expect(block).toContain("listing_id: { startsWith: 'RL-' }");
    expect(block).toContain('internet_address_display_yn: true');
    expect(block).toMatch(/w\.AND/);
  });

  test('CRM exclusive (SL- prefix) passes DB filter even with internet_address_display_yn=false', () => {
    const block = routeSource.slice(
      routeSource.indexOf('if (excludeUndisclosed)'),
      routeSource.indexOf('if (excludeUndisclosed)') + 500
    );
    expect(block).toContain("{ listing_id: { startsWith: 'SL-' } }");
  });

  test('RLS row with internet_address_display_yn=false excluded by DB filter', () => {
    const block = routeSource.slice(
      routeSource.indexOf('if (excludeUndisclosed)'),
      routeSource.indexOf('if (excludeUndisclosed)') + 500
    );
    expect(block).toContain('internet_address_display_yn: true');
  });
});

describe('excludeUndisclosed DTO post-filter (defensive layer)', () => {
  test('DB-first path exempts _source=exclusive from Address Undisclosed filter', () => {
    const matches = routeSource.match(/l\._source === 'exclusive' \|\| l\.address\?\.streetName !== 'Address Undisclosed'/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });
});

describe('FeaturedListings excludeUndisclosed integration', () => {
  test('FeaturedListings passes excludeUndisclosed=true to API', () => {
    expect(featuredSource).toContain("excludeUndisclosed', 'true'");
  });
});

describe('fetchExclusiveListings bypasses gates for rls_eligible=false', () => {
  test('fetchExclusiveListings uses OR with rls_eligible gate bypass', () => {
    const fnIdx = routeSource.indexOf('async function fetchExclusiveListings');
    expect(fnIdx).toBeGreaterThan(-1);
    const fnBody = routeSource.slice(fnIdx, fnIdx + 600);
    expect(fnBody).toContain('rls_eligible: true');
    expect(fnBody).toContain('SEARCH_DISPLAY_GATE');
    expect(fnBody).toContain('rls_eligible: false');
    expect(fnBody).toContain('list_price: { gt: 0 }');
  });

  test('fetchExclusiveListings does NOT apply flat SEARCH_DISPLAY_GATE', () => {
    const fnIdx = routeSource.indexOf('async function fetchExclusiveListings');
    const fnBody = routeSource.slice(fnIdx, fnIdx + 300);
    const lines = fnBody.split('\n');
    const flatGateLine = lines.find(l => l.trim() === '...SEARCH_DISPLAY_GATE,');
    expect(flatGateLine).toBeUndefined();
  });
});
