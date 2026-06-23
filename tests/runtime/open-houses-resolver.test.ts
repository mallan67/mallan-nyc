/// <reference types="jest" />
/**
 * Shared open-house resolver (lib/open-houses/upcoming-open-houses.ts) — the single source of truth
 * for the open-house SCOPE constants and the listing-card `nextOpenHouse` matching. Runtime unit
 * tests for the pure functions; the live Trestle/DB fetch is exercised separately (probes + e2e).
 *
 * Key property under test: TWIN-SAFE matching. #4D is the website-only exclusive SL-0007 on
 * Featured/exclusive surfaces but its open house lives on the RLS twin RLS20099289 — a plain
 * listing-id join misses it, so we also match on a normalized address key.
 */
import {
  MALLAN_OH_OFFICE_MLS_IDS,
  OPEN_HOUSE_ELIGIBLE_STATUSES,
  isMallanOwnedLocalListing,
  formatEasternTime,
  normalizeAddressKey,
  findNextOpenHouse,
  type OpenHouseIndex,
  type NextOpenHouse,
} from '@/lib/open-houses/upcoming-open-houses';

describe('open-house resolver — scope constants (single source of truth)', () => {
  it('Mallan office id is 7041 and is NOT the empty syndication-HOLD constant', () => {
    expect([...MALLAN_OH_OFFICE_MLS_IDS]).toEqual(['7041']);
  });
  it('eligible statuses include Active + ActiveUnderContract but EXCLUDE ComingSoon (UCBA §16)', () => {
    expect(OPEN_HOUSE_ELIGIBLE_STATUSES).toContain('Active');
    expect(OPEN_HOUSE_ELIGIBLE_STATUSES).toContain('ActiveUnderContract');
    expect(OPEN_HOUSE_ELIGIBLE_STATUSES).not.toContain('ComingSoon');
  });
});

describe('open-house resolver — isMallanOwnedLocalListing', () => {
  it('website-only exclusive (rls_eligible=false) is Mallan-owned', () => {
    expect(isMallanOwnedLocalListing({ rls_eligible: false, listing_id: 'anything' })).toBe(true);
  });
  it('SL-/RL- prefixed CRM listing is Mallan-owned', () => {
    expect(isMallanOwnedLocalListing({ rls_eligible: true, listing_id: 'SL-0007' })).toBe(true);
    expect(isMallanOwnedLocalListing({ listing_id: 'RL-0002' })).toBe(true);
  });
  it('a synced RLS listing (rls_eligible=true, RLS id) is NOT surfaced via the local path', () => {
    expect(isMallanOwnedLocalListing({ rls_eligible: true, listing_id: 'RLS20099289' })).toBe(false);
  });
});

describe('open-house resolver — formatEasternTime', () => {
  it('renders a -04:00 ISO time in Eastern regardless of server TZ (noon-ET, not 4PM-UTC)', () => {
    expect(formatEasternTime('2026-06-28T12:00:00.000-04:00')).toBe('12:00 PM');
    expect(formatEasternTime('2026-06-28T13:00:00.000-04:00')).toBe('1:00 PM');
  });
  it('empty/garbage in → empty/passthrough out', () => {
    expect(formatEasternTime(null)).toBe('');
    expect(formatEasternTime('')).toBe('');
  });
});

describe('open-house resolver — normalizeAddressKey (twin-safe)', () => {
  it('collapses "400 E 90TH Street, #4D" and "400 90th St 4D" to the same key', () => {
    const a = normalizeAddressKey({ streetNumber: '400', streetName: 'E 90TH Street', unitNumber: '#4D' });
    const b = normalizeAddressKey({ streetNumber: '400', streetName: '90th St', unitNumber: '4D' });
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });
  it('different units do NOT collapse', () => {
    const a = normalizeAddressKey({ streetNumber: '400', streetName: '90th', unitNumber: '4D' });
    const c = normalizeAddressKey({ streetNumber: '400', streetName: '90th', unitNumber: '5A' });
    expect(a).not.toBe(c);
  });
  it('empty address → empty key (callers must never match on empty)', () => {
    expect(normalizeAddressKey({})).toBe('');
  });
});

describe('open-house resolver — findNextOpenHouse (id OR address twin match)', () => {
  const oh: NextOpenHouse = { date: '2026-06-28', startTime: '12:00 PM', endTime: '1:00 PM', type: 'Public' };
  const index: OpenHouseIndex = {
    byListingId: new Map([['RLS20099289', oh]]),
    byAddressKey: new Map([[normalizeAddressKey({ streetNumber: '400', streetName: '90th', unitNumber: '4D' }), oh]]),
    size: 1,
  };

  it('matches by exact listing id (the RLS twin)', () => {
    expect(findNextOpenHouse({ id: 'RLS20099289' }, index)).toEqual(oh);
  });

  it('matches the SL-0007 exclusive by ADDRESS even though its id differs from the RLS twin', () => {
    const slListing = { id: 'SL-0007', listing_id: 'SL-0007', address: { streetNumber: '400', streetName: 'E 90th Street', unitNumber: '4D' } };
    expect(findNextOpenHouse(slListing, index)).toEqual(oh);
  });

  it('returns null for an unrelated listing', () => {
    expect(findNextOpenHouse({ id: 'RLS99999999', address: { streetNumber: '1', streetName: 'Nowhere', unitNumber: '1' } }, index)).toBeNull();
  });

  it('returns null when the index is empty (fast path)', () => {
    expect(findNextOpenHouse({ id: 'RLS20099289' }, { byListingId: new Map(), byAddressKey: new Map(), size: 0 })).toBeNull();
  });
});
