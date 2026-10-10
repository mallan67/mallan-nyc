/// <reference types="jest" />
/**
 * `POST /api/idx/ensure-listing` creates a local stub of a Cotality listing, so that showings and
 * listing-sends have a row to point at. The stub is ANOTHER FIRM'S listing.
 *
 * PROVEN DEFECT (compliance review of 2026-10-09, read in the code at 9e08ef3c; the same lines are on main).
 * The route wrote `rls_eligible: false` ("External IDX listing, not our exclusive"). Every reader of that
 * column takes `false` to mean "Mallan's own website-only listing, outside RLS": the public label (`_source:
 * 'exclusive'`, "Exclusive listing by Mallan Real Estate Inc.", no disclaimer, an agent card built from the agent
 * columns, which for a stub are the other firm's agent), the IDX-display, internet-display, owner-opt-out,
 * participant-only and address gates (all skipped for such a row), the campaign gate, the exclusives lists. The
 * sync never resets the column on a Listing, so the flag stayed when the real row arrived.
 *
 * The identity rule has a second half: an `SL-` / `RL-` listing id is read as Mallan's own whatever the flag
 * says, and this route took the id from the request body.
 *
 * These tests run the real route handler against a stub of the database, then feed the row it would write to the
 * real readers: the canonical identity helper, the public classifier and attribution, the public display filter and
 * the campaign gate.
 */

const mockFindUnique = jest.fn<Promise<unknown>, [unknown]>();
const mockFindFirst = jest.fn<Promise<unknown>, [unknown]>();
const mockCreate = jest.fn<Promise<unknown>, [unknown]>();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    listing: {
      findUnique: (a: unknown) => mockFindUnique(a),
      findFirst: (a: unknown) => mockFindFirst(a),
      create: (a: unknown) => mockCreate(a),
    },
    auditEvent: { create: async () => ({}) },
  },
}));
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: async () => ({ userId: 1n, role: 'BROKER', userType: 'agent' }),
  isAuthError: () => false,
  logAuditEvent: async () => undefined,
}));
jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));
jest.mock('@/lib/search/listing-search-projection', () => ({
  __esModule: true,
  dualWriteProjectionForListingId: async () => undefined,
}));

import { isMallanLocalListing } from '@/lib/listings/mallan-source-identity';
import { classifyDbListing, dbListingToPublicDTO, filterDisplayableDbListings } from '@/lib/idx/db-to-public-dto';
import { listingAttribution, MALLAN_EXCLUSIVE_ATTRIBUTION } from '@/lib/idx/public-attribution';
import { evaluateCampaignDistributionGate } from '@/lib/compliance/campaign-distribution-gate';

type Row = Record<string, unknown>;
type PublicRow = Parameters<typeof filterDisplayableDbListings>[0][number];

const COTALITY_ID = 'RLS20105333';

// What the CRM sends for a listing found in the live Cotality search (public/crm/js/core/api-client.js ensureListing).
const BODY = {
  listing_id: COTALITY_ID,
  address: '1 Example Street',
  price: 1000000,
  status: 'Active',
  listing_category: 'sale',
  agent_name: 'Other Agent',
  agent_email: 'other.agent@example.com',
  agent_phone: '2125550100',
  company: 'Other Realty LLC',
  internet_display_yn: true,
  address_display_yn: true,
  images: ['https://api.cotality.com/trestle/Media/a.jpg'],
};

function req(body: unknown) {
  return new Request('http://localhost/api/idx/ensure-listing', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

async function createdRow(body: Record<string, unknown> = BODY): Promise<Row> {
  const { POST } = await import('@/app/api/idx/ensure-listing/route');
  const res = await POST(req(body));
  expect(res.status).toBe(201);
  expect(mockCreate).toHaveBeenCalledTimes(1);
  return (mockCreate.mock.calls[0][0] as { data: Row }).data;
}

// The columns the database fills in on its own, as the schema defaults do.
const withDefaults = (data: Row): Row => ({ owner_opt_out: false, participant_only: false, ...data });

beforeEach(() => {
  jest.clearAllMocks();
  mockFindUnique.mockResolvedValue(null);
  mockFindFirst.mockResolvedValue(null);
  mockCreate.mockImplementation(async (a: unknown) => ({
    ...(a as { data: Row }).data,
    id: 1n,
    listing_id: ((a as { data: Row }).data.listing_id as string) ?? COTALITY_ID,
  }));
});

describe('the stub of another firm\'s listing is an RLS-eligible feed row', () => {
  it('is written RLS-eligible', async () => {
    const data = await createdRow();
    expect(data.rls_eligible).toBe(true);
  });

  it('stays RLS-eligible whatever the request body says about itself', async () => {
    const data = await createdRow({ ...BODY, rls_eligible: false, agent_id: 7, owner_client_id: 9 });
    expect(data.rls_eligible).toBe(true);
    expect(data).not.toHaveProperty('agent_id');
    expect(data).not.toHaveProperty('owner_client_id');
  });

  it('is not Mallan-authored for the canonical identity helper', async () => {
    const data = await createdRow();
    expect(isMallanLocalListing({ listing_id: COTALITY_ID, rls_eligible: data.rls_eligible as boolean })).toBe(false);
  });
});

describe('what the public site then says about it', () => {
  it('is third-party inventory: courtesy of the listing office, with the RLS disclaimer, never Mallan\'s exclusive', async () => {
    const data = await createdRow();
    const row = { listing_id: COTALITY_ID, rls_eligible: data.rls_eligible as boolean };
    expect(classifyDbListing(row)).toBe('third-party-idx');
    const attribution = listingAttribution(row, 'Other Realty LLC');
    expect(attribution.attributionText).toBe('Listing courtesy of Other Realty LLC');
    expect(attribution.attributionText).not.toBe(MALLAN_EXCLUSIVE_ATTRIBUTION);
    expect(attribution.disclaimerRequired).toBe(true);
  });

  it('the page data built from it is third-party: no agent card, and none of the other firm\'s agent\'s contact details published', async () => {
    const data = withDefaults(await createdRow());
    const dto = dbListingToPublicDTO({ ...data, id: 1n, created_at: new Date(), updated_at: new Date() } as unknown as Parameters<typeof dbListingToPublicDTO>[0]);
    expect(dto._source).toBe('db+idx');
    expect(dto._displayCompliance?.attributionText).toBe('Listing courtesy of Other Realty LLC');
    expect(dto._displayCompliance?.disclaimerRequired).toBe(true);
    expect(dto).not.toHaveProperty('_assignedAgent');
    const published = JSON.stringify(dto);
    expect(published).not.toContain('other.agent@example.com');
    expect(published).not.toContain('2125550100');
  });

  it('is shown only when the feed says it may be: the display gates bind it like any feed row', async () => {
    const shown = withDefaults(await createdRow());
    expect(filterDisplayableDbListings([shown as unknown as PublicRow])).toHaveLength(1);

    // the CRM did not affirm internet display (a flag that is missing or false is not displayable)
    const hidden = withDefaults(await createdRowFresh({ ...BODY, internet_display_yn: false }));
    expect(filterDisplayableDbListings([hidden as unknown as PublicRow])).toHaveLength(0);
    const unsaid = withDefaults(await createdRowFresh({ ...BODY, internet_display_yn: undefined }));
    expect(filterDisplayableDbListings([unsaid as unknown as PublicRow])).toHaveLength(0);
  });

  // Unchanged behaviour, pinned so the fix cannot loosen it: the status gate and idx_display_yn already kept a closed stub out.
  it('a closed stub is written with idx_display_yn false and is not shown', async () => {
    const closed = withDefaults(await createdRowFresh({ ...BODY, status: 'Closed' }));
    expect(closed.idx_display_yn).toBe(false);
    expect(filterDisplayableDbListings([closed as unknown as PublicRow])).toHaveLength(0);
  });

  it('is held back by an owner opt-out or a participant-only flag that the sync records later', async () => {
    const data = withDefaults(await createdRow());
    expect(filterDisplayableDbListings([{ ...data, owner_opt_out: true } as unknown as PublicRow])).toHaveLength(0);
    expect(filterDisplayableDbListings([{ ...data, participant_only: true } as unknown as PublicRow])).toHaveLength(0);
  });

  it('is gated for campaigns like any feed row', async () => {
    const data = withDefaults(await createdRow());
    const gate = (over: Row) =>
      evaluateCampaignDistributionGate({ listing_id: COTALITY_ID, ...(data as object), ...over } as never);
    expect(gate({}).allowed).toBe(true);
    expect(gate({ internet_entire_listing_display_yn: false }).blocks).toContain('internet_entire_listing_display_yn');
    expect(gate({ idx_display_yn: false }).blocks).toContain('idx_display_yn');
  });
});

// createdRow() asserts exactly one create per test; these helpers call the route again inside one test.
async function createdRowFresh(body: Record<string, unknown>): Promise<Row> {
  mockCreate.mockClear();
  return createdRow(body);
}

describe('the id of a stub is a Cotality id, never one of Mallan\'s own', () => {
  it.each(['SL-0004', 'RL-1180', 'sl-77', 'Rl-9'])('refuses to create a stub under %s', async (id) => {
    const { POST } = await import('@/app/api/idx/ensure-listing/route');
    const res = await POST(req({ ...BODY, listing_id: id }));
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('still returns a row that already exists under such an id, unchanged and without writing', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 5n, listing_id: 'SL-0004' });
    const { POST } = await import('@/app/api/idx/ensure-listing/route');
    const res = await POST(req({ ...BODY, listing_id: 'SL-0004' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ listing_id: 'SL-0004', db_id: '5', created: false });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('creates nothing for a Cotality listing the database already holds', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 8n, listing_id: COTALITY_ID });
    const { POST } = await import('@/app/api/idx/ensure-listing/route');
    const res = await POST(req(BODY));
    expect(await res.json()).toEqual({ listing_id: COTALITY_ID, db_id: '8', created: false });
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

// Module scope: without a top-level import/export TypeScript treats this file as a global script.
export {};
