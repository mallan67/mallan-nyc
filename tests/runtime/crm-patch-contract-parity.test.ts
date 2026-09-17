/// <reference types="jest" />
/**
 * Domain 5 (2026-09-08) — edit-save persists through the SAME contract as create-save.
 *
 * Before: POST ran normalizePayload (strip the NAR-removed fields, rename Mallan form aliases to the stored
 * names, normalize values, fold the legacy permission booleans) and routed buckets through the form contract's
 * persistenceMap; PATCH had its own hand-written key lists. Measured divergence: 45 contract feature keys
 * (Furnished, LeaseType, MinLeaseMonths, FlipTax*, TaxAbatement*, FireplaceYN, …) landed only in raw_data on an
 * edit-save, and 4 PATCH-only keys (ParkingFeatures, LaundryFeatures, BuildingFeatures, RealEstateTax) never
 * reached the features bucket on create.
 *
 * BEHAVIOURAL: invoke the real PATCH handler with mocked prisma/auth and inspect the captured update.
 */
import { buildPrismaMock } from './helpers';
import { MALLAN_FORM_CONTRACT } from '@/lib/listings/mallan-form-contract';

const { prisma: prismaMock } = buildPrismaMock();
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));
const requireAgentOrBrokerMock: jest.Mock = jest.fn();
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: (req: unknown): Promise<unknown> => requireAgentOrBrokerMock(req),
  isAuthError: (): boolean => false,
  logAuditEvent: async (): Promise<void> => undefined,
}));
jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));
jest.mock('@/lib/search/listing-search-projection', () => ({ __esModule: true, dualWriteProjectionForListingId: async () => undefined }));
jest.mock('@/lib/crm/listing-urls', () => ({ __esModule: true, buildListingUrls: () => ({ publicUrl: '/listing/x', rebnyListingUrl: 'https://www.mallan.nyc/listing/x' }) }));

function draftRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 501n, listing_id: 'RL-0501', mls_id: null, status: 'Draft', rls_eligible: true, listing_type: 'rent',
    agent_id: 7n, raw_data: { Furnished: 'Unfurnished' }, address: { StreetNumber: '400' }, features: { Heating: 'Steam' },
    internet_address_display_yn: true, agent_info: {},
    list_agent_full_name: 'Maya Allan', list_office_name: 'Mallan Real Estate Inc.',
    list_agent_email: null, list_agent_direct_phone: null, list_office_mls_id: '7041', list_agent_mls_id: null,
    co_list_office_mls_id: null, co_list_agent_mls_id: null,
    ...overrides,
  };
}
let captured: Record<string, unknown> | null = null;
function setRow(row: Record<string, unknown>) {
  const m = prismaMock as { listing: { findUnique: jest.Mock; update: jest.Mock } };
  m.listing.findUnique = jest.fn(async () => row);
  m.listing.update = jest.fn(async (args: { data: Record<string, unknown> }) => { captured = args.data; return { ...row, ...args.data }; });
}
async function callPatch(body: unknown, id = '501'): Promise<Response> {
  const { PATCH } = await import('@/app/api/crm/listings/[id]/route');
  const req = new Request(`http://localhost/api/crm/listings/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (PATCH as any)(req, { params: Promise.resolve({ id }) });
}
beforeEach(() => {
  captured = null;
  requireAgentOrBrokerMock.mockReset().mockResolvedValue({ role: 'BROKER', userId: 7n, userType: 'agent', sessionId: 't' });
});

describe('PATCH persists through the form contract (normalizePayload + persistenceMap)', () => {
  it('renames Mallan form aliases to the stored names in every bucket and never stores the alias key', async () => {
    setRow(draftRow());
    const res = await callPatch({ description: 'Sun-drenched two bedroom', Borough: 'Manhattan', UnParsedAddress: '400 East 90th Street 17C', privateRemarks: 'Call first' });
    expect(res.status).toBe(200);
    const features = captured!.features as Record<string, unknown>;
    const address = captured!.address as Record<string, unknown>;
    const raw = captured!.raw_data as Record<string, unknown>;
    expect(features.PublicRemarks).toBe('Sun-drenched two bedroom');
    expect(features.PrivateRemarks).toBe('Call first');
    expect(address.CityRegion).toBe('Manhattan');
    expect(address.UnparsedAddress).toBe('400 East 90th Street 17C');
    expect(captured!.borough).toBe('Manhattan');
    for (const alias of ['description', 'Borough', 'UnParsedAddress', 'privateRemarks']) {
      expect(raw).not.toHaveProperty(alias);
      expect(address).not.toHaveProperty(alias);
      expect(features).not.toHaveProperty(alias);
    }
  });

  it('routes every contract feature key to the features bucket on an edit-save (the 45 keys that used to land only in raw_data)', async () => {
    setRow(draftRow());
    const res = await callPatch({ Furnished: 'Furnished', LeaseType: 'Standard', MinLeaseMonths: 12, FlipTax: '2%', TaxAbatementYN: true, FireplaceYN: true, SponsorUnitYN: false });
    expect(res.status).toBe(200);
    const features = captured!.features as Record<string, unknown>;
    expect(features).toMatchObject({ Furnished: 'Furnished', LeaseType: 'Standard', MinLeaseMonths: 12, FlipTax: '2%', TaxAbatementYN: true, FireplaceYN: true, SponsorUnitYN: false });
    // the untouched existing feature survives (PATCH is partial)
    expect(features.Heating).toBe('Steam');
  });

  it('strips a NAR-removed field from storage on edit, exactly as create does', async () => {
    setRow(draftRow());
    const removed = (MALLAN_FORM_CONTRACT as unknown as { persistenceMap: Record<string, { removed?: boolean }> }).persistenceMap;
    const removedKey = Object.keys(removed).find((k) => removed[k].removed)!;
    expect(removedKey).toBeTruthy();
    const res = await callPatch({ [removedKey]: '2.5%', YearBuilt: 1928 });
    expect(res.status).toBe(200);
    expect(captured!.raw_data as Record<string, unknown>).not.toHaveProperty(removedKey);
    expect((captured!.features as Record<string, unknown>).YearBuilt).toBe(1928);
  });

  it('does NOT apply the create-time InternetEntireListingDisplayYN default to a partial edit', async () => {
    setRow(draftRow({ internet_entire_listing_display_yn: false }));
    const res = await callPatch({ YearBuilt: 1928 });
    expect(res.status).toBe(200);
    expect(captured).not.toHaveProperty('internet_entire_listing_display_yn');
    expect(captured!.raw_data as Record<string, unknown>).not.toHaveProperty('InternetEntireListingDisplayYN');
  });
});

describe('the form contract buckets the keys the CRM viewers read', () => {
  it('ParkingFeatures / LaundryFeatures / BuildingFeatures (live) and RealEstateTax (Mallan fact read by the viewer) are features-bucket keys', () => {
    const pm = (MALLAN_FORM_CONTRACT as unknown as { persistenceMap: Record<string, { features?: boolean }> }).persistenceMap;
    for (const k of ['ParkingFeatures', 'LaundryFeatures', 'BuildingFeatures', 'RealEstateTax']) expect(pm[k]?.features).toBe(true);
  });
});
