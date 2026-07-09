/// <reference types="jest" />
/**
 * Backend-Search-0 — public closed-sale SOURCE guard.
 *
 * Locks that every PUBLIC closed-sale surface ships ACRIS public-record sales
 * only, routed through the visibility contract — never a raw MLS/Cotality
 * ClosePrice. Agent/internal/report surfaces are NOT restricted by this PR
 * (verified behaviorally in visibility-contract.test.ts). (2026-07-09)
 */
import { readFileSync } from 'fs';
import * as path from 'path';

const read = (p: string) => readFileSync(path.resolve(__dirname, '..', '..', p), 'utf8');
const buildings = read('app/api/buildings/route.ts');
const listingDetail = read('app/listing/[...slug]/page.tsx');
const buildingRoute = read('app/api/listings/building/route.ts');

describe('/api/buildings — public sale history is ACRIS-only via the contract', () => {
  it('imports and applies resolveVisibility with the public audience', () => {
    expect(buildings).toMatch(/resolveVisibility/);
    expect(buildings).toMatch(/audience:\s*'public'/);
  });

  it('fetches ACRIS public-record sales and tags them source acris', () => {
    expect(buildings).toMatch(/fetchAcrisSales/);
    expect(buildings).toMatch(/source:\s*'acris'/);
  });

  it('rebuilds saleHistory from the contract-filtered (public) set', () => {
    // The public route must not ship the raw MLS-pushed saleHistory; it is
    // replaced with the resolveVisibility-allowed rows.
    expect(buildings).toMatch(/saleHistory\.length\s*=\s*0/);
    expect(buildings).toMatch(/saleHistory\.push\(\.\.\.publicSaleHistory\)/);
  });
});

describe('listing-detail Last Sale — does not prefer MLS over ACRIS publicly', () => {
  it('removed the "trestleSale || acrisSale" MLS-first fallback', () => {
    expect(listingDetail).not.toMatch(/trestleSale\s*\|\|\s*acrisSale/);
  });
  it('gates the shown sale through resolveVisibility (public audience)', () => {
    expect(listingDetail).toMatch(/resolveVisibility/);
    expect(listingDetail).toMatch(/audience:\s*'public'/);
  });
});

describe('/api/listings/building — precedent preserved + shared ACRIS lib', () => {
  it('still filters public saleHistory to source === acris', () => {
    expect(buildingRoute).toMatch(/\.filter\(\s*\(?s\)?\s*=>\s*s\.source\s*===\s*'acris'\s*\)/);
  });
  it('uses the shared acris-building-sales lib (no local ACRIS helper copy)', () => {
    expect(buildingRoute).toMatch(/from '@\/lib\/buildings\/acris-building-sales'/);
    expect(buildingRoute).not.toMatch(/async function fetchAcrisSales/);
    expect(buildingRoute).not.toMatch(/async function lookupBBL/);
  });
});

describe('all three public surfaces import the single visibility contract module', () => {
  it('buildings + listing-detail import from lib/search/visibility-contract', () => {
    expect(buildings).toMatch(/from '@\/lib\/search\/visibility-contract'/);
    expect(listingDetail).toMatch(/from '@\/lib\/search\/visibility-contract'/);
  });
});
