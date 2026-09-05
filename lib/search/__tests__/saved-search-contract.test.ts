/// <reference types="jest" />
/**
 * Search Consolidation Packet 2 — the ONE canonical Saved Search contract.
 *
 * A saved search stores the executor's own parameters (criteria_version 2). Legacy blobs are
 * converted only where their projection-era meaning is proven, otherwise refused by name.
 */
import {
  CRITERIA_VERSION,
  LEGACY_DEFAULT_STATUS,
  SAVED_PARAM_KEYS,
  describeSavedParams,
  isSavedSearchCriteria,
  legacyToParams,
  resolveStoredCriteria,
  savedCriteriaFromExecuted,
  savedSearchVersionState,
} from '@/lib/search/engine/saved-search';
import { EXECUTED_PARAMS } from '@/lib/search/engine/criteria';

describe('save what actually executed', () => {
  test('the stored keys are exactly the executor parameters minus paging — no second vocabulary', () => {
    const expected = [...EXECUTED_PARAMS].filter((k) => !['limit', 'skip', 'offset'].includes(k)).sort();
    expect([...SAVED_PARAM_KEYS].sort()).toEqual(expected);
  });
  test('paging is dropped, values are strings, the executor parses the result', () => {
    const r = savedCriteriaFromExecuted({ type: 'sale', status: 'Active', minPrice: 500000, borough: 'Manhattan,Brooklyn', sort: 'price_asc', limit: 50, skip: 100 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.criteria).toEqual({ criteria_version: 2, params: { type: 'sale', status: 'Active', minPrice: '500000', borough: 'Manhattan,Brooklyn', sort: 'price_asc' } });
    expect(r.executed.cityRegion).toEqual(['Manhattan', 'Brooklyn']);
    expect(r.executed.workflow).toBe('sale');
    expect(isSavedSearchCriteria(r.criteria)).toBe(true);
  });
  test('an unsupported parameter is refused by name, never dropped into a broader search', () => {
    const r = savedCriteriaFromExecuted({ type: 'sale', address: '100 W 72', minSqft: 900 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusal.unsupported.sort()).toEqual(['address', 'minSqft']);
  });
  test('an invalid value is refused by name', () => {
    const r = savedCriteriaFromExecuted({ type: 'sale', borough: 'Yonkers' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusal.invalid.map((i) => i.param)).toEqual(['borough']);
  });
  test('rental and sale are separate universes in the stored contract', () => {
    const sale = savedCriteriaFromExecuted({ type: 'sale' });
    const rental = savedCriteriaFromExecuted({ type: 'rental' });
    expect(sale.ok && sale.executed.workflow).toBe('sale');
    expect(rental.ok && rental.executed.workflow).toBe('rental');
  });
});

describe('version state', () => {
  test('current / legacy / invalid are three states; a version-2 blob with a foreign key is invalid', () => {
    expect(savedSearchVersionState({ criteria_version: CRITERIA_VERSION, params: { type: 'sale' } })).toBe('current');
    expect(savedSearchVersionState({ listing_type: 'sale' })).toBe('legacy');
    expect(savedSearchVersionState({ criteria_version: CRITERIA_VERSION, params: { min_sqft: '900' } })).toBe('invalid');
    expect(savedSearchVersionState({ criteria_version: 1, filters: {}, sort: 'price_desc' })).toBe('invalid');
    expect(savedSearchVersionState(null)).toBe('invalid');
    expect(savedSearchVersionState([])).toBe('invalid');
    expect(savedSearchVersionState('x')).toBe('invalid');
  });
  test('a current blob whose value the executor now refuses is invalid, not silently reinterpreted', () => {
    const r = resolveStoredCriteria({ criteria_version: CRITERIA_VERSION, params: { type: 'sale', status: 'OffMarket' } });
    expect(r.state).toBe('invalid');
    if (r.state !== 'invalid') return;
    expect(r.invalid.map((i) => i.param)).toEqual(['status']);
  });
});

describe('legacy census — deterministic, meaning-preserving, or refused', () => {
  test('production shape { listing_type } (public signups) → migrated with the projection default status made explicit', () => {
    const r = resolveStoredCriteria({ listing_type: 'sale' });
    expect(r.state).toBe('migrated');
    if (r.state !== 'migrated') return;
    expect(r.params).toEqual({ type: 'sale', status: LEGACY_DEFAULT_STATUS });
    expect(r.criteria.standardStatus).toEqual(['Active', 'ActiveUnderContract', 'ComingSoon']);
    expect(r.mapped).toContain('listing_type → type');
  });
  test('rent / rental / lease / buy spellings', () => {
    for (const [v, w] of [['rent', 'rental'], ['rental', 'rental'], ['lease', 'rental'], ['buy', 'sale'], ['sale', 'sale']] as const) {
      const r = legacyToParams({ listing_type: v });
      expect(r.ok && r.params.type).toBe(w);
    }
  });
  test('the browser dialect maps key-for-key where the meaning is the same', () => {
    const r = legacyToParams({
      listing_type: 'rental', min_price: 2000, max_price: 4500, min_beds: 1, max_beds: 2, min_baths: 1, max_baths: 2,
      neighborhoods: ['Tribeca', 'SoHo'], borough: 'Manhattan', zip: '10007', status: ['Active', 'Pending'], property_type: ['condo', 'coop'], listing_id: 'RLS123', _search_tab: 'rent',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.params).toEqual({
      type: 'rental', minPrice: '2000', maxPrice: '4500', minBeds: '1', maxBeds: '2', minBaths: '1', maxBaths: '2',
      neighborhood: 'Tribeca,SoHo', borough: 'Manhattan', zip: '10007', status: 'Active,Pending', ownership: 'Condominium,StockCooperative', listingId: 'RLS123',
    });
    const resolved = resolveStoredCriteria({ listing_type: 'rental', min_price: 2000, status: ['ACTIVE', 'COMING_SOON'] });
    expect(resolved.state === 'migrated' && resolved.criteria.standardStatus).toEqual(['Active', 'ComingSoon']);
  });
  test('the projection’s "no maximum" price sentinel is dropped and recorded', () => {
    const r = legacyToParams({ listing_type: 'sale', max_price: 99999999 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.params.maxPrice).toBeUndefined();
    expect(r.mapped.some((m) => /no maximum/.test(m))).toBe(true);
  });
  test('keys the executor cannot reproduce are refused BY NAME — never dropped', () => {
    const r = legacyToParams({ listing_type: 'sale', min_sqft: 900, address: '100 W 72', keyword: 'doorman', checkbox_filters: { View: ['City'] }, date_from: '2026-01-01' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    for (const k of ['min_sqft', 'address', 'keyword', 'checkbox_filters', 'date_from']) expect(r.reasons.join('\n')).toContain(`"${k}"`);
  });
  test('a legacy ownership token without a proven CommonInterest meaning is refused', () => {
    const r = legacyToParams({ listing_type: 'sale', property_type: ['townhouse'] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons[0]).toContain('"property_type"');
  });
  test('the building tab was never a Search universe', () => {
    const r = legacyToParams({ listing_type: 'sale', _search_tab: 'building' });
    expect(r.ok).toBe(false);
  });
  test('a tab that disagrees with the listing type is refused, not guessed', () => {
    expect(legacyToParams({ listing_type: 'sale', _search_tab: 'rent' }).ok).toBe(false);
    expect(legacyToParams({ listing_type: 'rental', _search_tab: 'rent' }).ok).toBe(true);
  });
  test('sub-status tokens are refused (the executor has no sub-status criterion)', () => {
    const r = resolveStoredCriteria({ listing_type: 'sale', status: ['sub:BackOnMarket'] });
    expect(r.state).toBe('invalid');
  });
  test('blank legacy values are ignored as the projection ignored them', () => {
    const r = legacyToParams({ listing_type: 'sale', min_price: '', neighborhoods: [], address: null, keyword: undefined });
    expect(r.ok).toBe(true);
  });
  test('public signup payloads: the three seeded shapes convert; a sqft filter is refused', () => {
    expect(resolveStoredCriteria({ type: 'sale' }).state).toBe('migrated');
    const btn = legacyToParams({ type: 'sale', beds: 2, minPrice: 500000, maxPrice: 1500000, propertyType: 'Condo', neighborhood: 'Tribeca', borough: 'Manhattan' });
    expect(btn.ok).toBe(true);
    if (btn.ok) expect(btn.params).toEqual({ type: 'sale', minBeds: '2', minPrice: '500000', maxPrice: '1500000', ownership: 'Condominium', neighborhood: 'Tribeca', borough: 'Manhattan', status: LEGACY_DEFAULT_STATUS });
    expect(legacyToParams({ type: 'sale', minSqft: 800 }).ok).toBe(false);
  });
  test('describeSavedParams names a public alert from its parameters', () => {
    expect(describeSavedParams({ type: 'sale', borough: 'Manhattan', minBeds: '2', minPrice: '500000', maxPrice: '1500000' })).toBe('For Sale · Manhattan · 2+ bed · $500,000-$1,500,000');
    expect(describeSavedParams({ type: 'rental' })).toBe('For Rent');
  });
});
