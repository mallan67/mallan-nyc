/**
 * `excludeUndisclosed` — canonical address-disclosure contract.
 *
 * MEANING: "return only listings whose canonical PUBLIC address is displayable."
 * It has never meant "return Mallan listings regardless of address policy."
 *
 * REWRITTEN 2026-08-07 (commit 5). The previous version of this file PINNED THE
 * DEFECT — it asserted, as intended behaviour:
 *
 *   "Include CRM exclusives (SL-/RL- prefix) even with
 *    internet_address_display_yn=false"
 *   expect(block).toContain("listing_id: { startsWith: 'SL-' }")
 *   expect(matches!.length).toBeGreaterThanOrEqual(2)   // _source exemption
 *
 * A listing-id PREFIX is PROVENANCE. It is never address permission. An
 * RLS-eligible Mallan exclusive whose seller opted out of address display was
 * returned by the very filter whose purpose is to exclude undisclosed
 * addresses — and the DTO post-filter then exempted it a second time via
 * `_source === 'exclusive'`, at TWO separate response paths.
 *
 * These tests were not preserved for backward compatibility: they encoded the
 * bug, so keeping them would have blocked the fix.
 *
 * THE CORRECTED CONTRACT (lib/search/listing-access-decision.ts):
 *   WEBSITE-ONLY (rls_eligible: false) — not RLS inventory; the IDX address flag
 *     does not bind; first-party policy applies.
 *   RLS-BACKED  (rls_eligible: true)   — internet_address_display_yn must be true.
 * `rls_eligible` is Boolean @default(true) (NON-NULL), so the two branches are
 * exhaustive.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ADDRESS_DISCLOSED_GATE } from '../../lib/search/listing-access-decision';

const read = (p: string) =>
  readFileSync(resolve(__dirname, '../..', p), 'utf8').replace(/\r\n?/g, '\n');

const routeSource = read('app/api/listings/route.ts');
const featuredSource = read('app/components/FeaturedListings.tsx');

/** Does this row satisfy the canonical gate? Mirrors the Prisma predicate. */
function passesGate(row: { rls_eligible: boolean; internet_address_display_yn: boolean }) {
  const or = (ADDRESS_DISCLOSED_GATE.OR ?? []) as Array<Record<string, unknown>>;
  return or.some((clause) =>
    Object.entries(clause).every(
      ([k, v]) => (row as unknown as Record<string, unknown>)[k] === v,
    ),
  );
}

describe('the canonical gate itself', () => {
  it('website-only + address flag false -> INCLUDED (first-party policy)', () => {
    expect(passesGate({ rls_eligible: false, internet_address_display_yn: false })).toBe(true);
  });

  it('third-party RLS + address true -> INCLUDED', () => {
    expect(passesGate({ rls_eligible: true, internet_address_display_yn: true })).toBe(true);
  });

  it('third-party RLS + address false -> EXCLUDED', () => {
    expect(passesGate({ rls_eligible: true, internet_address_display_yn: false })).toBe(false);
  });

  it('RLS-BACKED SL-/RL- exclusive + address false -> EXCLUDED (no prefix bypass)', () => {
    // The gate never inspects listing_id, so an SL-/RL- row with rls_eligible
    // true is treated exactly like any other RLS-backed listing.
    expect(passesGate({ rls_eligible: true, internet_address_display_yn: false })).toBe(false);
  });

  it('the gate does not reference listing_id at all', () => {
    expect(JSON.stringify(ADDRESS_DISCLOSED_GATE)).not.toContain('listing_id');
    expect(JSON.stringify(ADDRESS_DISCLOSED_GATE)).not.toContain('startsWith');
  });
});

describe('the route uses the canonical gate, DB-side, before pagination', () => {
  const block = routeSource.slice(
    routeSource.indexOf('if (excludeUndisclosed)'),
    routeSource.indexOf('if (excludeUndisclosed)') + 900,
  );

  it('applies ADDRESS_DISCLOSED_GATE via AND', () => {
    expect(block).toContain('ADDRESS_DISCLOSED_GATE');
    expect(block).toMatch(/w\.AND/);
  });

  it('NO listing-id prefix appears in the disclosure filter', () => {
    expect(block).not.toContain("startsWith: 'SL-'");
    expect(block).not.toContain("startsWith: 'RL-'");
  });

  it('the gate is applied before take/skip so DB paging stays correct', () => {
    const gateIdx = routeSource.indexOf('ADDRESS_DISCLOSED_GATE;');
    const takeIdx = routeSource.indexOf('const dbTake = limit;');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(takeIdx).toBeGreaterThan(gateIdx);
  });
});

describe('DTO post-filter has NO provenance exemption (both response paths)', () => {
  it('no _source === exclusive exemption remains anywhere', () => {
    expect(routeSource).not.toMatch(
      /l\._source === 'exclusive' \|\| l\.address\?\.streetName !== 'Address Undisclosed'/,
    );
  });

  it('both paths filter purely on the canonical DTO address', () => {
    const matches = routeSource.match(
      /l => l\.address\?\.streetName !== 'Address Undisclosed'/g,
    );
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });
});

describe('FeaturedListings integration', () => {
  it('FeaturedListings passes excludeUndisclosed=true, so it inherits the fix', () => {
    expect(featuredSource).toContain("excludeUndisclosed', 'true'");
  });
});

describe('fetchExclusiveListings bypasses gates for rls_eligible=false', () => {
  it('uses the OR with an rls_eligible split, not a prefix', () => {
    const fnIdx = routeSource.indexOf('async function fetchExclusiveListings');
    expect(fnIdx).toBeGreaterThan(-1);
    const fnBody = routeSource.slice(fnIdx, fnIdx + 600);
    expect(fnBody).toContain('rls_eligible: true');
    expect(fnBody).toContain('SEARCH_DISPLAY_GATE');
    expect(fnBody).toContain('rls_eligible: false');
    expect(fnBody).toContain('list_price: { gt: 0 }');
  });

  it('does NOT apply a flat SEARCH_DISPLAY_GATE', () => {
    const fnIdx = routeSource.indexOf('async function fetchExclusiveListings');
    const fnBody = routeSource.slice(fnIdx, fnIdx + 300);
    const flatGateLine = fnBody.split('\n').find((l) => l.trim() === '...SEARCH_DISPLAY_GATE,');
    expect(flatGateLine).toBeUndefined();
  });
});
