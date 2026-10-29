/// <reference types="jest" />
/**
 * The owner / client relationship of a listing — Listing.owner_client_id → Lead (relation ListingOwner) — in the CRM listing routes.
 * Integration brief 2026-10-28, step 3: the relationship must survive create, edit and reload. The column existed; nothing read or wrote it.
 *   1. POST /api/crm/listings with owner_client_id links the new Draft to that client — one the signed-in user may work with (the CRM's
 *      lead-access guard); an unknown client is refused (404); an absent key links nobody. The key never lands in raw_data.
 *   2. PATCH /api/crm/listings/:id with owner_client_id re-links (connect) or clears (null → disconnect); an absent key leaves it as it is.
 *   3. GET /api/crm/listings serialises owner_client_id and filters by ?owner_client_id= (the client workspace's Owned Listings).
 *   4. GET /api/crm/listings/:id serialises owner_client_id (the forms restore their Owner picker from it).
 */
import { NextRequest } from "next/server";
import { buildPrismaMock, makeRequest, readJson } from "./helpers";

const { prisma: innerPrismaMock, calls } = buildPrismaMock();
const rawQuery = jest.fn(async () => [{ max_seq: null }]);
const rawExecute = jest.fn(async () => 0);
const prismaMock: Record<string, unknown> = new Proxy(innerPrismaMock as unknown as Record<string, unknown>, {
  get(target, prop: string) {
    if (prop === "$queryRaw" || prop === "$queryRawUnsafe") return rawQuery;
    if (prop === "$executeRaw" || prop === "$executeRawUnsafe") return rawExecute;
    if (prop === "$transaction") return jest.fn(async (cb: (tx: unknown) => unknown) => cb(prismaMock));
    return target[prop];
  },
});
jest.mock("@/lib/prisma", () => ({ __esModule: true, default: prismaMock }));
jest.mock("@/lib/auth/readonly-guard", () => ({ __esModule: true, assertWriteAllowed: () => null }));
jest.mock("@/lib/auth", () => ({
  __esModule: true,
  requireAgentOrBroker: jest.fn(async () => ({ userId: "agent-1", userType: "agent", role: "BROKER" })),
  isAuthError: () => false,
  logAuditEvent: jest.fn(async () => undefined),
}));
jest.mock("@/lib/cache/public-cache", () => ({
  __esModule: true,
  safeRevalidateTags: jest.fn(),
  listingCacheTag: (id: string) => `listing:${id}`,
  buildingAndManifestInvalidationTags: () => [],
  SEARCH_CACHE_TAG: "search",
}));
jest.mock("@/lib/search/listing-search-projection", () => ({ __esModule: true, dualWriteProjectionForListingId: jest.fn(async () => undefined) }));
jest.mock("@/lib/notifications/engine", () => ({ __esModule: true, createNotification: jest.fn(async () => undefined) }));

import { POST, GET as LIST } from "@/app/api/crm/listings/route";
import { GET as GET_ONE, PATCH } from "@/app/api/crm/listings/[id]/route";

type Mocked = { listing: Record<string, jest.Mock>; lead: Record<string, jest.Mock> };
const m = () => prismaMock as unknown as Mocked;

const minimalSaleDraft = {
  listing_type: "sale", listingAgreement: "ExclusiveRightToSell", status: "Draft", ListPrice: 1250000,
  StreetNumber: "400", StreetName: "East 90th", StreetSuffix: "Street", UnitNumber: "17C", City: "New York", StateOrProvince: "NY",
  PropertyType: "Residential", PropertySubType: "Condominium",
};

function crmListing(overrides: Record<string, unknown> = {}) {
  return {
    id: BigInt(901), listing_id: "SL-0901", mls_id: null, agent_id: "agent-1", owner_client_id: null, status: "Draft", listing_type: "sale", rls_eligible: true,
    list_price: 1250000, living_area: null, bedrooms_total: 2, bathrooms_full: 1, bathrooms_half: 0, property_type: "Residential", property_sub_type: "Condominium",
    raw_data: { ListPrice: 1250000, StreetNumber: "400", StreetName: "East 90th", PublicRemarks: "Bright two bedroom." }, features: {}, address: { StreetNumber: "400", StreetName: "East 90th" },
    media: [], internet_entire_listing_display_yn: true, internet_address_display_yn: true, internet_automated_valuation_display_yn: true, internet_consumer_comment_yn: true,
    participant_only: false, owner_opt_out: false, status_changed_at: null, first_active_date: null, days_on_market: 0, expiration_date: null, last_synced_from_trestle: null,
    created_at: new Date("2026-03-01T00:00:00Z"), updated_at: new Date("2026-03-02T00:00:00Z"),
    ...overrides,
  };
}

/** The CRM clients the lead-access guard finds: only #56 exists, assigned to the signed-in agent. */
const KNOWN_LEADS = [{ id: BigInt(56), agent_id: "agent-1" }];

beforeEach(() => {
  for (const k of Object.keys(calls)) delete calls[k];
  m().lead.findMany = jest.fn(async (args: { where: { id: { in: bigint[] } } }) => KNOWN_LEADS.filter((l) => args.where.id.in.some((id) => id === l.id)));
  m().listing.create = jest.fn(async (args: { data: Record<string, unknown> }) => ({ ...crmListing(), ...args.data, id: BigInt(901) }));
  m().listing.update = jest.fn(async (args: { data: Record<string, unknown> }) => ({ ...crmListing(), ...args.data, id: BigInt(901) }));
  m().listing.findMany = jest.fn(async () => []);
  m().listing.findUnique = jest.fn(async () => null);
  m().listing.findFirst = jest.fn(async () => null);
});

describe("POST /api/crm/listings — the owner (seller / landlord) link", () => {
  it("links the new Draft to the client, as the typed column, never as a raw_data key", async () => {
    const res = await POST(makeRequest({ method: "POST", body: { ...minimalSaleDraft, owner_client_id: "56" } }));
    expect(res.status).toBe(201);
    const data = m().listing.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.owner_client_id).toBe(BigInt(56));
    expect((data.raw_data as Record<string, unknown>)).not.toHaveProperty("owner_client_id");
    expect(m().lead.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: [BigInt(56)] } } }));
    const json = await readJson<{ owner_client_id?: unknown }>(res);
    expect(json.owner_client_id === "56" || json.owner_client_id === undefined).toBe(true);   // the create answer is the fetched row (mocked here); the GETs serialise it
  });

  it("a client the CRM does not have is refused, and nothing is created", async () => {
    const res = await POST(makeRequest({ method: "POST", body: { ...minimalSaleDraft, owner_client_id: "999" } }));
    expect(res.status).toBe(404);
    expect(m().listing.create).not.toHaveBeenCalled();
  });

  it("an absent, null or empty owner links nobody", async () => {
    for (const body of [minimalSaleDraft, { ...minimalSaleDraft, owner_client_id: null }, { ...minimalSaleDraft, owner_client_id: "" }]) {
      m().listing.create.mockClear();
      const res = await POST(makeRequest({ method: "POST", body }));
      expect(res.status).toBe(201);
      expect((m().listing.create.mock.calls[0][0].data as Record<string, unknown>).owner_client_id).toBeNull();
    }
    expect(m().lead.findMany).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/crm/listings/:id — the owner link is edited, cleared, or left alone", () => {
  const patch = (body: Record<string, unknown>) => PATCH(makeRequest({ method: "PATCH", body }), { params: Promise.resolve({ id: "SL-0901" }) });
  beforeEach(() => {
    m().listing.findFirst = jest.fn(async () => crmListing({ owner_client_id: BigInt(12) }));
    m().listing.findUnique = jest.fn(async () => crmListing({ owner_client_id: BigInt(12) }));
  });

  it("owner_client_id: '56' re-links the listing to that client", async () => {
    const res = await patch({ owner_client_id: "56", PublicRemarks: "Bright two bedroom with a terrace." });
    expect(res.status).toBe(200);
    const data = m().listing.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.owner_client).toEqual({ connect: { id: BigInt(56) } });
    expect(JSON.stringify(data.raw_data ?? {})).not.toContain("owner_client_id");
  });

  it("owner_client_id: null clears the link; an absent key leaves it as it is", async () => {
    expect((await patch({ owner_client_id: null })).status).toBe(200);
    expect((m().listing.update.mock.calls[0][0].data as Record<string, unknown>).owner_client).toEqual({ disconnect: true });
    m().listing.update.mockClear();
    expect((await patch({ PublicRemarks: "Bright two bedroom." })).status).toBe(200);
    expect(m().listing.update.mock.calls[0][0].data as Record<string, unknown>).not.toHaveProperty("owner_client");
  });

  it("a client the CRM does not have is refused, and nothing is written", async () => {
    expect((await patch({ owner_client_id: "999" })).status).toBe(404);
    expect(m().listing.update).not.toHaveBeenCalled();
  });
});

describe("GET — the owner link is read back, and the list is filtered by it", () => {
  it("GET /api/crm/listings/:id serialises owner_client_id", async () => {
    m().listing.findFirst = jest.fn(async () => crmListing({ owner_client_id: BigInt(56) }));
    m().listing.findUnique = jest.fn(async () => crmListing({ owner_client_id: BigInt(56) }));
    const res = await GET_ONE(makeRequest({ method: "GET" }), { params: Promise.resolve({ id: "SL-0901" }) });
    expect(res.status).toBe(200);
    expect((await readJson<{ owner_client_id: unknown }>(res)).owner_client_id).toBe("56");
  });

  it("GET /api/crm/listings?owner_client_id=56 selects, filters by and serialises the typed column", async () => {
    const row = { ...crmListing({ owner_client_id: BigInt(56) }), listing_media: [], _count: { listing_media: 0 } };
    m().listing.findMany = jest.fn(async () => [row]);
    const res = await LIST(new NextRequest("http://localhost/api/crm/listings?owner_client_id=56&limit=50"));
    expect(res.status).toBe(200);
    const args = m().listing.findMany.mock.calls[0][0] as { where: Record<string, unknown>; select: Record<string, unknown> };
    expect(args.where.owner_client_id).toBe(BigInt(56));
    expect(args.select.owner_client_id).toBe(true);
    const json = await readJson<{ listings: Array<{ listing_id: string; owner_client_id: unknown }> }>(res);
    expect(json.listings.map((l) => [l.listing_id, l.owner_client_id])).toEqual([["SL-0901", "56"]]);
  });

  it("a malformed owner filter is refused", async () => {
    const res = await LIST(new NextRequest("http://localhost/api/crm/listings?owner_client_id=abc"));
    expect(res.status).toBe(400);
  });
});
