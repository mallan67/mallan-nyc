/// <reference types="jest" />
/**
 * P1 open-house display fix: local (CRM) open houses were dropped because /api/open-houses read the
 * listing address with camelCase keys, but CRM listings store the address JSON in RESO PascalCase
 * (StreetNumber/StreetName/UnitNumber). The empty address then failed the `hasData` filter, so a
 * Mallan website-only exclusive (e.g. SL-0007) with a valid open house never reached the global
 * page OR the listing-detail panel. Fix: case-tolerant address extraction (PascalCase + camelCase).
 */
import { pickAddressParts, normalizeAddressKey } from '@/lib/open-houses/upcoming-open-houses';

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
  UnitNumber: '4D', City: 'New York', UnparsedAddress: '400 E 90th Street',
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
      bedrooms_total: 1,
      bathrooms_full: 1,
      bathrooms_half: 0,
      living_area: 700,
      property_type: 'Residential',
      property_sub_type: null,
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

describe('pickAddressParts — case-tolerant RESO street parts', () => {
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
});
