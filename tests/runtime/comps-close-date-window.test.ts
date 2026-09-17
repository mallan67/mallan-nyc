/// <reference types="jest" />
/**
 * Domain 7 (2026-09-08) — comparables are windowed by the CLOSING date, never by the modification time, and
 * the canonical comp-eligibility authority (lib/search/canonical/comp-eligibility.ts) is wired.
 *
 * Provider facts (live 2026-09-08, sale Closed rows): CloseDate populated on 578,417 rows and filterable;
 * `CloseDate ge 2025-09-08` → 14,942 closings in the last 12 months, of which only 11,311 were touched in the
 * last 3 months — a ModificationTimestamp window silently dropped 24% of the recent closings and admitted any
 * old closing that was merely touched. CommonInterest populated on 435,273 rows (ownership segmentation).
 */
import * as fs from 'fs';
import * as path from 'path';
import { compsStatusWindowFilter, compsOrderBy, applyCompEligibility } from '@/lib/comps/fetch-comps';
import { CompCriteriaError } from '@/lib/comps/status-criteria';
import type { CompListing } from '@/lib/comps/types';

const ROOT = path.resolve(__dirname, '../..');
const ASOF = new Date('2026-09-08T12:00:00Z');

describe('the provider clause windows closed comps by CloseDate and leaves on-market comps unwindowed', () => {
  it('closed + active: closed carries the CloseDate window, active does not, ModificationTimestamp is never used', () => {
    const f = compsStatusWindowFilter(['Closed', 'Active'], 12, ASOF);
    expect(f).toBe("((StandardStatus eq 'Closed' and CloseDate ge 2025-09-08) or StandardStatus eq 'Active')");
    expect(f).not.toContain('ModificationTimestamp');
  });
  it('closed only', () => {
    expect(compsStatusWindowFilter(['Closed'], 6, ASOF)).toBe("(StandardStatus eq 'Closed' and CloseDate ge 2026-03-08)");
  });
  it("this transaction's canonical labels map to live tokens (a sale's In Contract → Pending, Coming Soon → ComingSoon)", () => {
    expect(compsStatusWindowFilter(['In Contract', 'Coming Soon'], 6, ASOF, 'sale')).toBe("(StandardStatus eq 'Pending' or StandardStatus eq 'ComingSoon')");
  });
  it("a sale's Sold and a rental's Rented are both the Closed token, windowed by CloseDate", () => {
    expect(compsStatusWindowFilter(['Sold'], 6, ASOF, 'sale')).toBe("(StandardStatus eq 'Closed' and CloseDate ge 2026-03-08)");
    expect(compsStatusWindowFilter(['Rented'], 6, ASOF, 'rental')).toBe("(StandardStatus eq 'Closed' and CloseDate ge 2026-03-08)");
  });
  it('an unvalidated criterion never reaches OData — old display names, legacy spellings and the other transaction are refused', () => {
    expect(() => compsStatusWindowFilter(['Under Contract'], 6, ASOF, 'sale')).toThrow(CompCriteriaError);
    expect(() => compsStatusWindowFilter(['Cancelled'], 6, ASOF, 'sale')).toThrow(CompCriteriaError);
    expect(() => compsStatusWindowFilter(['Rented'], 6, ASOF, 'sale')).toThrow(/Rented/);
    expect(() => compsStatusWindowFilter(['Sold'], 6, ASOF, 'rental')).toThrow(/Sold/);
    expect(() => compsOrderBy(['Under Contract'], 'sale')).toThrow(CompCriteriaError);
  });
  it('no statuses → no clause', () => {
    expect(compsStatusWindowFilter([], 6, ASOF)).toBe('');
  });
  it('closed-only comps are ordered by the closing date; mixed sets keep the modification order', () => {
    expect(compsOrderBy(['Closed'])).toBe('CloseDate desc');
    expect(compsOrderBy(['Sold'], 'sale')).toBe('CloseDate desc');
    expect(compsOrderBy(['Closed', 'Active'])).toBe('ModificationTimestamp desc');
  });
});

const comp = (over: Partial<CompListing>): CompListing => ({
  listing_id: 'RLS1', address: '400 East 90th Street', unit: '17C', status: 'Closed',
  status_label: 'Sold', transaction: 'sale', property_type: 'Residential',
  beds: 2, baths: 1, sqft: 900, list_price: 1_000_000, close_price: 980_000, close_date: '2026-06-01', days_on_market: 30,
  price_per_sqft: 1089, building_name: '', listing_agent: '', listing_office: 'Compass', photo_count: 5, common_interest: 'StockCooperative',
  ...over,
});

describe('the canonical comp-eligibility authority is applied to every fetched comp', () => {
  it('a closed comp outside the CloseDate window is excluded even if the provider returned it', () => {
    const kept = applyCompEligibility([comp({ close_date: '2024-01-15' }), comp({ listing_id: 'RLS2' })], { asOf: ASOF, monthsBack: 12, subjectCommonInterest: 'StockCooperative' });
    expect(kept.map((c) => c.listing_id)).toEqual(['RLS2']);
  });
  it('a closed comp without a CloseDate is excluded (never dated by the modification time)', () => {
    expect(applyCompEligibility([comp({ close_date: null })], { asOf: ASOF, monthsBack: 12, subjectCommonInterest: 'StockCooperative' })).toEqual([]);
  });
  it('a co-op subject never receives a condo comp (ownership segmentation from live CommonInterest)', () => {
    const kept = applyCompEligibility([comp({ common_interest: 'Condominium' }), comp({ listing_id: 'RLS2' })], { asOf: ASOF, monthsBack: 12, subjectCommonInterest: 'StockCooperative' });
    expect(kept.map((c) => c.listing_id)).toEqual(['RLS2']);
  });
  it('a subject with unknown ownership keeps every ownership class (segmentation needs a known subject)', () => {
    const kept = applyCompEligibility([comp({ common_interest: 'Condominium' }), comp({ listing_id: 'RLS2' })], { asOf: ASOF, monthsBack: 12, subjectCommonInterest: null });
    expect(kept.map((c) => c.listing_id)).toEqual(['RLS1', 'RLS2']);
  });
  it('active and pending comps pass without a closing window', () => {
    const kept = applyCompEligibility([comp({ status: 'Active', close_date: null }), comp({ listing_id: 'RLS2', status: 'Pending', close_date: null })], { asOf: ASOF, monthsBack: 6, subjectCommonInterest: 'StockCooperative' });
    expect(kept.map((c) => c.listing_id)).toEqual(['RLS1', 'RLS2']);
  });
  it('an agent-selected off-market status (Expired) is kept as a market observation, not dropped', () => {
    const kept = applyCompEligibility([comp({ status: 'Expired', close_date: null })], { asOf: ASOF, monthsBack: 6, subjectCommonInterest: 'StockCooperative' });
    expect(kept).toHaveLength(1);
  });
});

describe('the DB-side CMA engine windows closed comps by the stable closing date column', () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib/cma/engine.ts'), 'utf8');
  it('never filters Listing by contract_closed (a Deal column the Listing model does not declare)', () => {
    expect(src).not.toMatch(/contract_closed: \{/);
  });
  it('uses the retained CloseDate rather than reconciliation/archive timing', () => {
    expect(src).toContain("path: ['CloseDate']");
    expect(src).not.toMatch(/terminal_since: \{ gte/);
  });
  it('windows the JSON CloseDate with Prisma ordered comparisons, never the non-existent string_gte / string_lte operators', () => {
    expect(src).not.toMatch(/string_gte|string_lte/);
    expect(src).toMatch(/raw_data: \{ path: \['CloseDate'\], gte: /);
  });
});

describe('CMA uses the subject transaction on both comp paths', () => {
  test("a sale's In Contract label queries the Pending token", () => {
    expect(compsStatusWindowFilter(['In Contract'], 6, ASOF, 'sale')).toBe("StandardStatus eq 'Pending'");
  });

  test.each(['Residential', 'ResidentialLease'])('building and area comps stay in %s', async (propertyType) => {
    const { fetchComps } = require('@/lib/comps/fetch-comps');
    const spy = jest.spyOn(require('@/lib/idx/fetch'), 'fetchFromTrestle').mockResolvedValue({ records: [] });
    const range = { statuses: ['Closed'], months_back: 6, beds_min: 1, beds_max: 2, baths_min: 1, baths_max: 2, sqft_min: null, sqft_max: null, sqft_enabled: false };
    try {
      await fetchComps({
        listing_id: 'SUBJECT', building_name: 'Test Building', street_number: null, street_name: null,
        borough: 'Manhattan', postal_code: '10128', neighborhood: null, property_type: propertyType,
        listing_type: propertyType === 'ResidentialLease' ? 'rent' : 'sale',
      }, { building: range, area: { ...range, neighborhoods: [], price_min: null, price_max: null } });
      expect(spy).toHaveBeenCalledTimes(2);
      for (const [request] of spy.mock.calls as Array<[{ filter: string }]>) {
        expect(request.filter).toContain("PropertyType eq '" + propertyType + "'");
      }
      // the subject transaction is the live PropertyType, never a guess
      const res = await fetchComps({
        listing_id: 'SUBJECT', building_name: 'Test Building', street_number: null, street_name: null,
        borough: 'Manhattan', postal_code: '10128', neighborhood: null, property_type: propertyType,
      }, { building: range, area: { ...range, neighborhoods: [], price_min: null, price_max: null } });
      expect(res.transaction).toBe(propertyType === 'ResidentialLease' ? 'rental' : 'sale');
    } finally { spy.mockRestore(); }
  });
});

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { listing: { findMany: jest.fn() } },
}));

describe('database CMA keeps transaction, closing facts, and valuation evidence consistent', () => {
  test.each(['sale', 'rent'])('%s uses real close prices and excludes active prices from valuation', async (listingType) => {
    const prisma = require('@/lib/prisma').default;
    const { findComps, estimateValue } = require('@/lib/cma/engine');
    const closeDate = new Date(Date.now() - 86400000 * 30).toISOString().slice(0, 10);
    const row = {
      listing_id: 'CLOSED', listing_type: listingType, address: { StreetNumber: '400', StreetName: 'East 90th Street' },
      list_price: listingType === 'sale' ? 1000000 : 5000, bedrooms_total: 2, bathrooms_full: 1,
      living_area: null, status: 'Closed', days_on_market: 0, sync_status: 'synced',
      terminal_since: new Date(), internet_address_display_yn: true, internet_entire_listing_display_yn: true,
      raw_data: { CloseDate: closeDate, ClosePrice: listingType === 'sale' ? 900000 : 4500 },
    };
    prisma.listing.findMany.mockResolvedValue([
      row,
      { ...row, listing_id: 'ASKING', status: 'Active', list_price: row.list_price * 3, raw_data: {} },
      { ...row, listing_id: 'WRONG-TYPE', listing_type: listingType === 'sale' ? 'rent' : 'sale' },
      { ...row, listing_id: 'UNDATED', raw_data: { ClosePrice: row.raw_data.ClosePrice } },
      { ...row, listing_id: 'OFF-FEED', status: 'Active', sync_status: 'off_feed' },
    ]);
    const comps = await findComps({ property_address: 'Subject', neighborhood: 'Yorkville', listing_type: listingType, bedrooms: 2, bathrooms: 1 });
    expect(comps.map((c: { listing_id: string }) => c.listing_id).sort()).toEqual(['ASKING', 'CLOSED']);
    const closed = comps.find((c: { listing_id: string }) => c.listing_id === 'CLOSED');
    expect(closed.status).toBe('Closed');
    expect(closed.status_label).toBe(listingType === 'sale' ? 'Sold' : 'Rented');
    expect(closed.transaction).toBe(listingType === 'sale' ? 'sale' : 'rental');
    expect(closed.adjusted_price).toBe(row.raw_data.ClosePrice);
    expect(estimateValue(comps).estimated).toBe(row.raw_data.ClosePrice);
    const where = prisma.listing.findMany.mock.calls.at(-1)[0].where;
    expect(where.listing_type).toBe(listingType);
    expect(where.neighborhood).toBe('Yorkville');
    const historical = where.OR.find((clause: { raw_data?: unknown }) => clause.raw_data);
    expect(historical.idx_display_yn).toBeUndefined();
    expect(historical.owner_opt_out).toBe(false);
    expect(historical.participant_only).toBe(false);
    expect(historical.raw_data.path).toEqual(['CloseDate']);
    // the window is the ISO day (the provider's Edm.Date shape), lower bound inclusive, upper bound the day after as-of
    const today = new Date().toISOString().slice(0, 10);
    expect(historical.raw_data.gte).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(historical.raw_data.gte < today).toBe(true);
    expect(historical.raw_data.lt > today).toBe(true);
    expect(historical.raw_data.string_gte).toBeUndefined();
    expect(historical.raw_data.lte).toBeUndefined();
  });

  test('active-only evidence yields no valuation', () => {
    const { estimateValue } = require('@/lib/cma/engine');
    expect(estimateValue([{ status: 'Active', adjusted_price: 1000000, similarity_score: 90 }]).estimated).toBe(0);
  });

  // Owner ruling (Maya, 2026-09-09): a CMA is a LOCATED comparison. Without a neighborhood or a borough the
  // engine would compare the subject against the whole city — refused, never widened.
  test('a subject with neither neighborhood nor borough is refused, and no query is issued', async () => {
    const prisma = require('@/lib/prisma').default;
    const { findComps } = require('@/lib/cma/engine');
    prisma.listing.findMany.mockClear();
    await expect(findComps({ property_address: 'Subject', listing_type: 'sale', bedrooms: 2 }))
      .rejects.toThrow(/neighborhood or borough/i);
    expect(prisma.listing.findMany).not.toHaveBeenCalled();
  });
});
