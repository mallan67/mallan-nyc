/// <reference types="jest" />
/**
 * Similar Properties — address visibility (raw-feed vs DB) + rental label.
 *
 * Address display is CONTEXT-SPECIFIC (Maya, 2026-07-16): raw Cotality/IDX Plus records are
 * upstream pre-filtered so a null InternetAddressDisplayYN is displayable; stored DB rows are NOT
 * pre-filtered, so a null flag stays fail-closed (masked). The route uses the canonical
 * isAddressDisplayable with `idxPlusPreFiltered` ONLY on the raw branch. The shared
 * maskAddressIfRestricted is NOT changed globally. The subject/twin exclusion (sameAddressKey) that
 * already lives on main is left intact.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isAddressDisplayable } from '@/lib/compliance/gates';

const ROUTE = readFileSync(resolve(__dirname, '../../app/api/listings/similar/route.ts'), 'utf8');

describe('address visibility — canonical isAddressDisplayable (raw feed vs DB)', () => {
  it('RAW Trestle: null InternetAddressDisplayYN is DISPLAYABLE (idxPlusPreFiltered)', () => {
    expect(isAddressDisplayable(
      { InternetAddressDisplayYN: null, InternetEntireListingDisplayYN: null },
      { idxPlusPreFiltered: true },
    )).toBe(true);
  });
  it('RAW Trestle: explicit false MASKS (per-row override, even pre-filtered)', () => {
    expect(isAddressDisplayable(
      { InternetAddressDisplayYN: false, InternetEntireListingDisplayYN: null },
      { idxPlusPreFiltered: true },
    )).toBe(false);
  });
  it('DB row: null internet_address_display_yn stays MASKED (fail-closed, no pre-filter option)', () => {
    expect(isAddressDisplayable(
      { internet_address_display_yn: null, internet_entire_listing_display_yn: true },
    )).toBe(false);
  });
  it('DB row: explicit true SHOWS the address', () => {
    expect(isAddressDisplayable(
      { internet_address_display_yn: true, internet_entire_listing_display_yn: true },
    )).toBe(true);
  });
});

describe('similar route wires the context-specific address gate (does NOT change the shared masker)', () => {
  it('RAW Cotality branch uses isAddressDisplayable with idxPlusPreFiltered: true', () => {
    expect(ROUTE).toMatch(/isAddressDisplayable\(r,\s*\{\s*idxPlusPreFiltered:\s*true\s*\}\)/);
  });
  it('DB branch uses the canonical helper WITHOUT the pre-filter option (stays fail-closed)', () => {
    expect(ROUTE).toMatch(/isAddressDisplayable\(l\)/);
  });
  it('the shared maskAddressIfRestricted is NOT flipped to a global fail-open (!== false)', () => {
    // It must still be the strict `=== true` masker; the raw-feed nuance is applied by the caller.
    expect(ROUTE).toMatch(/internetAddressDisplayYN === true/);
    expect(ROUTE).not.toMatch(/internetAddressDisplayYN !== false/);
  });
});

describe('subject / address-twin exclusion is preserved (already on main — not re-implemented)', () => {
  it('the DB branch still drops the excluded listing + its normalized address twin via sameAddressKey', () => {
    expect(ROUTE).toMatch(/listing_id:\s*\{\s*not:\s*excludeId\s*\}/);
    expect(ROUTE).toMatch(/!sameAddressKey\(r,\s*excludedListing\)/);
  });
});

describe('rental label — rental cards identify rental inventory; sales unchanged', () => {
  it('both DTO paths fall back to "Rental" for rentals only (mapPropertyType returns "" for Apartment)', () => {
    const uses = ROUTE.match(/\|\|\s*\(isRental\s*\?\s*'Rental'\s*:\s*''\)/g) || [];
    expect(uses.length).toBe(2); // DB DTO + Cotality DTO
  });
  it('sale results are unchanged (the fallback only applies when isRental)', () => {
    // `isRental ? 'Rental' : ''` → a sale keeps mapPropertyType's own value ('' when Apartment).
    expect(ROUTE).not.toMatch(/mapPropertyType\([^)]*\)\s*\|\|\s*'Rental'/); // never an unconditional 'Rental'
  });
});
