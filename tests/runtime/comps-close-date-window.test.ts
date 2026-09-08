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
  it('display names map to live members (Under Contract → ActiveUnderContract, Coming Soon → ComingSoon)', () => {
    expect(compsStatusWindowFilter(['Under Contract', 'Coming Soon'], 6, ASOF)).toBe("(StandardStatus eq 'ActiveUnderContract' or StandardStatus eq 'ComingSoon')");
  });
  it('no statuses → no clause', () => {
    expect(compsStatusWindowFilter([], 6, ASOF)).toBe('');
  });
  it('closed-only comps are ordered by the closing date; mixed sets keep the modification order', () => {
    expect(compsOrderBy(['Closed'])).toBe('CloseDate desc');
    expect(compsOrderBy(['Closed', 'Active'])).toBe('ModificationTimestamp desc');
  });
});

const comp = (over: Partial<CompListing>): CompListing => ({
  listing_id: 'RLS1', address: '400 East 90th Street', unit: '17C', status: 'Closed', property_type: 'Residential',
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
  it('uses terminal_since (= OffMarketDate = CloseDate on every Closed row, whole-corpus census 2026-09-08)', () => {
    expect(src).toMatch(/\{ status: 'Closed', terminal_since: \{ gte: since \} \}/);
  });
});
