/// <reference types="jest" />
/**
 * Backend-Search-0 — public closed-sale SOURCE guard.
 *
 * Locks that every PUBLIC closed-sale surface ships ACRIS public-record sales only,
 * routed through the visibility contract — never a raw MLS/Cotality ClosePrice.
 * Agent/internal/report surfaces are NOT restricted by this PR (verified behaviorally
 * in visibility-contract.test.ts). (2026-07-09)
 *
 * UPDATE (PR #511): the LISTING DETAIL page no longer renders ANY closed-sale comp —
 * the live Trestle last-sale + the ACRIS lookup were removed with the DB-only render.
 * With nothing shown, a raw MLS ClosePrice can never reach the public listing page (a
 * stronger guarantee than gating). The building routes still ship ACRIS-only via the
 * contract and keep their guards below.
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

describe('listing-detail Last Sale — no public MLS closed-sale (removed in PR #511)', () => {
  // Strip comments so the assertions test CODE, not the notes that mention the removed
  // symbols by name.
  const code = listingDetail
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('has no MLS-first "trestleSale || acrisSale" fallback', () => {
    expect(code).not.toMatch(/trestleSale\s*\|\|\s*acrisSale/);
  });
  it('performs NO live closed-sale lookup on the public page (Trestle + ACRIS removed)', () => {
    // The public listing page renders no closed-sale comp at all, so a raw MLS/Cotality
    // ClosePrice can never reach it — a stronger guarantee than the old public gate.
    expect(code).not.toMatch(/fetchLastUnitSale\s*\(/);
    expect(code).not.toMatch(/fetchLastSaleFromACRIS\s*\(/);
    expect(code).not.toMatch(/resolveVisibility\s*\(/);
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

describe('public closed-sale surfaces import the single visibility contract module', () => {
  it('buildings imports lib/search/visibility-contract; listing-detail no longer needs it', () => {
    expect(buildings).toMatch(/from '@\/lib\/search\/visibility-contract'/);
    // listing-detail's closed-sale block was removed in PR #511 (DB-only render), so it
    // no longer imports (or needs) the visibility contract — nothing public to gate there.
    expect(listingDetail).not.toMatch(/from '@\/lib\/search\/visibility-contract'/);
  });
});
