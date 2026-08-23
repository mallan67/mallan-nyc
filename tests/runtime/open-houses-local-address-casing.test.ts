/// <reference types="jest" />
/**
 * P1 open-house display fix: local (CRM) open houses were dropped because /api/open-houses read the
 * listing address with camelCase keys, but CRM listings store the address JSON in Cotality PascalCase
 * (StreetNumber/StreetName/UnitNumber). The empty address then failed the `hasData` filter, so a
 * Mallan website-only exclusive (e.g. SL-0007) with a valid open house never reached the global
 * page OR the listing-detail panel. Fix: case-tolerant address extraction (PascalCase + camelCase).
 */
import { pickAddressParts, normalizeAddressKey, openHouseTwinKey, listingPageOpenHouseKey } from '@/lib/open-houses/upcoming-open-houses';

describe('listingPageOpenHouseKey — address-key fallback restricted to Mallan-owned local exclusives (Codex #464)', () => {
  const addr = { streetNumber: '400', streetName: '90th', unitNumber: '4D', postalCode: '10128' };
  it('Mallan local exclusive (SL-/RL-) page → non-empty twin key', () => {
    expect(listingPageOpenHouseKey({ id: 'SL-0007', address: addr }).length).toBeGreaterThan(0);
    expect(listingPageOpenHouseKey({ id: 'RL-0003', address: addr }).length).toBeGreaterThan(0);
  });
  it('non-Mallan / IDX / co-listing page with the SAME address → empty key (no cross-attribution)', () => {
    // The Mallan RLS twin matches by exact listingId instead; a co-listing from another brokerage
    // (same address slug, distinct listingId — page.tsx 3-brokerage case) must NOT get Mallan's OH.
    expect(listingPageOpenHouseKey({ id: 'RLS20099289', address: addr })).toBe('');
    expect(listingPageOpenHouseKey({ id: 'OTHER-BROKERAGE-123', address: addr })).toBe('');
  });
  it('Mallan local but incomplete address → empty key', () => {
    expect(listingPageOpenHouseKey({ id: 'SL-0007', address: { unitNumber: '4D', postalCode: '10128' } })).toBe('');
  });
});

describe('openHouseTwinKey — ZIP-disambiguated twin key (Codex #464 P2)', () => {
  it('same street+unit but DIFFERENT ZIP → different keys (no E/W cross-town collision)', () => {
    const east = openHouseTwinKey({ streetNumber: '400', streetName: '90th', unitNumber: '4D', postalCode: '10128' });
    const west = openHouseTwinKey({ streetNumber: '400', streetName: '90th', unitNumber: '4D', postalCode: '10024' });
    expect(east).not.toBe(west);
  });
  it('same unit + same ZIP (case/format variants) → SAME key (twin match preserved)', () => {
    const a = openHouseTwinKey({ streetNumber: '400', streetName: '90th', unitNumber: '4D', postalCode: '10128' });
    const b = openHouseTwinKey({ streetNumber: '400', streetName: '90TH', unitNumber: '4d', postalCode: '10128' });
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });
  it('no usable street → empty key even if ZIP present (no ZIP-only false match)', () => {
    expect(openHouseTwinKey({ postalCode: '10128' })).toBe('');
  });
  it('incomplete street — unit-number only (no number+name) → empty key (Codex #464 P2b: no partial collision)', () => {
    expect(openHouseTwinKey({ unitNumber: '4D', postalCode: '10128' })).toBe('');
    expect(openHouseTwinKey({ streetName: '90th', unitNumber: '4D', postalCode: '10128' })).toBe(''); // no streetNumber
  });
  it('missing / partial ZIP → empty key (a full 5-digit ZIP is required for disambiguation)', () => {
    expect(openHouseTwinKey({ streetNumber: '400', streetName: '90th', unitNumber: '4D' })).toBe(''); // no ZIP
    expect(openHouseTwinKey({ streetNumber: '400', streetName: '90th', unitNumber: '4D', postalCode: '1012' })).toBe(''); // partial ZIP
  });
});

// ── Trestle path off (so GET exercises only the local feed) ──
jest.mock('@/lib/idx/auth', () => ({
  __esModule: true,
  getAccessToken: jest.fn(async () => { throw new Error('trestle disabled in test'); }),
}));
jest.mock('@/lib/listings/agent-info-resolver', () => ({
  __esModule: true,
  resolveListingAgentInfo: () => ({ officeName: 'Mallan Real Estate Inc.' }),
  AGENT_TYPED_SELECT: {},
}));

const showingFindMany = jest.fn();
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { showing: { findMany: (...a: unknown[]) => showingFindMany(...a) } },
}));

import { GET } from '@/app/api/open-houses/route';

const PASCAL_ADDR = {
  StreetNumber: '400', StreetDirPrefix: 'E', StreetName: '90th', StreetSuffix: 'Street',
  UnitNumber: '4D', City: 'New York', PostalCode: '10128', UnparsedAddress: '400 E 90th Street',
};

function localShowing(overrides: Record<string, unknown> = {}) {
  return {
    id: 3n,
    time: '10:00 AM - 12:00 PM',
    date: new Date(Date.now() + 7 * 86400_000), // future
    listing: {
      listing_id: 'SL-0007',
      status: 'Active',
      address: PASCAL_ADDR,
      city: 'New York',
      neighborhood: 'Upper East Side',
      list_price: 560000,
      bedrooms_total: 0, // SL-0007 is a studio (0 bed / 1 bath / 476 sqft / 2 rooms)
      bathrooms_full: 1,
      bathrooms_half: 0,
      living_area: 476,
      property_type: 'Residential',
      property_sub_type: 'Apartment',
      features: {},
      media: [{ url: 'https://x/p.jpg' }],
      rls_eligible: false, // website-only Mallan exclusive
      owner_opt_out: false,
      participant_only: false,
      internet_entire_listing_display_yn: false,
      internet_address_display_yn: true, // address displayable
      ...overrides,
    },
    agent: { full_name: 'Agent', phone: '555' },
  };
}

async function getOpenHouses() {
  showingFindMany.mockResolvedValueOnce([localShowing()]);
  const res = await GET();
  const json = (await res.json()) as { openHouses: Array<{ listingId: string; address: string; source: string }> };
  return json.openHouses;
}

beforeEach(() => jest.clearAllMocks());

describe('pickAddressParts — case-tolerant Cotality street parts', () => {
  it('reads PascalCase (CRM-saved) address keys', () => {
    const p = pickAddressParts(PASCAL_ADDR);
    expect(p.streetNumber).toBe('400');
    expect(p.streetName).toBe('90th');
    expect(p.unitNumber).toBe('4D');
  });
  it('still reads camelCase address keys', () => {
    const p = pickAddressParts({ streetNumber: '5', streetName: 'Tudor City Pl', unitNumber: '2G' });
    expect(p.streetNumber).toBe('5');
    expect(p.streetName).toBe('Tudor City Pl');
    expect(p.unitNumber).toBe('2G');
  });
  it('empty/garbage address → all-empty parts (no throw)', () => {
    expect(pickAddressParts(null).streetName).toBe('');
    expect(pickAddressParts({}).streetNumber).toBe('');
  });
  it('canonical PascalCase wins over STALE legacy camelCase when both are present (Codex #463)', () => {
    // The CRM PATCH merges new PascalCase Cotality keys over the existing address JSON without deleting
    // old camelCase keys (app/api/crm/listings/[id]/route.ts:366-368), so an edited row can carry
    // both. The current (PascalCase) value must win, not the stale camelCase one.
    const p = pickAddressParts({
      streetNumber: '1', StreetNumber: '400',
      streetName: 'Old Street', StreetName: '90th',
      unitNumber: 'OLD', UnitNumber: '4D',
    });
    expect(p.streetNumber).toBe('400');
    expect(p.streetName).toBe('90th');
    expect(p.unitNumber).toBe('4D');
  });
  it('banner path: normalizeAddressKey over PascalCase parts is non-empty (was empty before fix)', () => {
    const p = pickAddressParts(PASCAL_ADDR);
    const key = normalizeAddressKey({ streetNumber: p.streetNumber, streetName: p.streetName, unitNumber: p.unitNumber });
    expect(key.length).toBeGreaterThan(0);
    expect(key).toContain('400');
  });
});

describe('/api/open-houses — local PascalCase open house flows through', () => {
  it('PascalCase local open house appears with a NON-EMPTY address (not dropped by hasData)', async () => {
    const ohs = await getOpenHouses();
    expect(ohs.length).toBe(1);
    expect(ohs[0].source).toBe('local');
    expect(ohs[0].address.trim().length).toBeGreaterThan(0);
    expect(ohs[0].address).toContain('400');
    expect(ohs[0].address).toContain('90th');
  });

  it('returned listingId equals the string listing_id (SL-0007)', async () => {
    const ohs = await getOpenHouses();
    expect(ohs[0].listingId).toBe('SL-0007');
  });

  it('camelCase address still resolves (no regression)', async () => {
    showingFindMany.mockResolvedValueOnce([
      localShowing({ address: { streetNumber: '400', streetDirPrefix: 'E', streetName: '90th', streetSuffix: 'Street', unitNumber: '4D' } }),
    ]);
    const res = await GET();
    const json = (await res.json()) as { openHouses: Array<{ address: string }> };
    expect(json.openHouses.length).toBe(1);
    expect(json.openHouses[0].address).toContain('400');
  });

  it('address-suppressed local open house falls back to neighborhood placeholder and is NOT dropped', async () => {
    showingFindMany.mockResolvedValueOnce([localShowing({ internet_address_display_yn: false })]);
    const res = await GET();
    const json = (await res.json()) as { openHouses: Array<{ address: string }> };
    expect(json.openHouses.length).toBe(1);
    expect(json.openHouses[0].address).toContain('Upper East Side');
    expect(json.openHouses[0].address).toMatch(/Available on Request/i);
  });

  it('local open house includes a non-empty addressKey (twin-safe matching)', async () => {
    const ohs = await getOpenHouses();
    const key = (ohs[0] as Record<string, unknown>).addressKey as string;
    expect(key.length).toBeGreaterThan(0);
    expect(key).toContain('400');
    expect(key).toContain('90th');
    expect(key).toContain('10128'); // ZIP included for cross-town disambiguation (Codex #464 P2)
  });

  it('address-suppressed local open house emits an EMPTY addressKey (compliant — no suppressed street key)', async () => {
    showingFindMany.mockResolvedValueOnce([localShowing({ internet_address_display_yn: false })]);
    const res = await GET();
    const json = (await res.json()) as { openHouses: Array<Record<string, unknown>> };
    expect(json.openHouses[0].addressKey).toBe('');
  });
});
