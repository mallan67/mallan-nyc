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
  isByAppointment,
  resolvePublicOpenHouseType,
  parseTimeToMinutes,
  compareChronological,
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

describe('open-house resolver — resolvePublicOpenHouseType / isByAppointment (canonical label)', () => {
  it('local sale-form [ByAppointment] notes marker → By Appointment', () => {
    expect(resolvePublicOpenHouseType({ notes: '[ByAppointment] private viewing' })).toBe('By Appointment');
    expect(isByAppointment({ notes: '[ByAppointment]' })).toBe(true);
  });
  it('Cotality AppointmentRequiredYN=true → By Appointment (verified live: appt events are Public-typed)', () => {
    expect(resolvePublicOpenHouseType({ appointmentRequired: true })).toBe('By Appointment');
  });
  it('Cotality OpenHouseRemarks free-text "by appointment" → By Appointment (defensive fallback)', () => {
    expect(resolvePublicOpenHouseType({ remarks: 'Showings by appointment only' })).toBe('By Appointment');
  });
  it('ordinary public event → Public', () => {
    expect(resolvePublicOpenHouseType({ notes: '[Public] stop by' })).toBe('Public');
    expect(resolvePublicOpenHouseType({ appointmentRequired: false })).toBe('Public');
    expect(resolvePublicOpenHouseType({})).toBe('Public');
  });
  it('a [Public]/plain marker is NOT mistaken for appointment', () => {
    expect(isByAppointment({ notes: '[Public] not by appointment mention here' })).toBe(false);
  });
});

describe('open-house resolver — parseTimeToMinutes / compareChronological', () => {
  it('parses 12h Eastern times to minutes (noon=720, 5 PM=1020)', () => {
    expect(parseTimeToMinutes('12:00 PM')).toBe(720);
    expect(parseTimeToMinutes('5:00 PM')).toBe(1020);
    expect(parseTimeToMinutes('12:00 AM')).toBe(0);
  });
  it('orders by date first, then start time; same slot prefers By Appointment', () => {
    const sun: NextOpenHouse = { date: '2026-07-19', startTime: '12:00 PM', endTime: '1:00 PM', type: 'By Appointment' };
    const wed: NextOpenHouse = { date: '2026-07-22', startTime: '5:00 PM', endTime: '6:00 PM', type: 'Public' };
    expect(compareChronological(sun, wed)).toBeLessThan(0); // Sunday earlier
    const publicSlot: NextOpenHouse = { ...sun, type: 'Public' };
    expect(compareChronological(publicSlot, sun)).toBeGreaterThan(0); // same slot → By Appointment preferred
  });
});

describe('open-house resolver — findNextOpenHouse picks the EARLIEST across id + twin (400 E 90th #4D bug)', () => {
  // The #4D production bug: Wednesday matches the local SL-0007 listing-id, the earlier Sunday
  // By-Appointment matches via the shared address twin. The resolver must return Sunday, not the
  // first id match (Wednesday), and preserve the By Appointment designation.
  const sunday: NextOpenHouse = { date: '2026-07-19', startTime: '12:00 PM', endTime: '1:00 PM', type: 'By Appointment' };
  const wednesday: NextOpenHouse = { date: '2026-07-22', startTime: '5:00 PM', endTime: '6:00 PM', type: 'Public' };
  const addrKey = normalizeAddressKey({ streetNumber: '400', streetName: 'E 90th Street', unitNumber: '4D' });
  const index: OpenHouseIndex = {
    byListingId: new Map([['SL-0007', wednesday]]),          // id-match resolves the LATER Wednesday
    byAddressKey: new Map([[addrKey, sunday]]),               // twin address resolves the EARLIER Sunday
    size: 2,
  };

  it('returns Sunday (earliest) even though the exact id match is Wednesday', () => {
    const slListing = { id: 'SL-0007', listing_id: 'SL-0007', address: { streetNumber: '400', streetName: 'E 90th Street', unitNumber: '4D' } };
    const next = findNextOpenHouse(slListing, index);
    expect(next).toEqual(sunday);
    expect(next?.type).toBe('By Appointment'); // designation preserved on the selected event
  });

  it('a Public twin at the same slot cannot erase By Appointment (dedupe tie-break)', () => {
    const publicSameSlot: NextOpenHouse = { ...sunday, type: 'Public' };
    const idx: OpenHouseIndex = {
      byListingId: new Map([['SL-0007', publicSameSlot]]),
      byAddressKey: new Map([[addrKey, sunday]]),
      size: 2,
    };
    const next = findNextOpenHouse({ id: 'SL-0007', address: { streetNumber: '400', streetName: 'E 90th Street', unitNumber: '4D' } }, idx);
    expect(next?.type).toBe('By Appointment');
  });
});
