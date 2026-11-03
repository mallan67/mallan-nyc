/// <reference types="jest" />
/**
 * The Commercial section of the Sale form is saved by the EDIT route too (Maya, 2026-11-03: "listing type commercial condo").
 * The create route stored commercial_ownership / commercial_sub_type as typed columns; the edit route only used them to classify, so a listing created as a Condo and edited to a Commercial
 * Condo kept the old columns. The columns now follow the form on every save.
 */
import { buildPrismaMock, makeRequest, readJson } from "./helpers";

const { prisma: innerPrismaMock, calls } = buildPrismaMock();
const rawQuery = jest.fn(async () => [{ max_seq: null }]);
const rawExecute = jest.fn(async (..._a: unknown[]) => 0);
const transaction = jest.fn(async (cb: (tx: unknown) => unknown) => cb(prismaMock));
const prismaMock: Record<string, unknown> = new Proxy(innerPrismaMock as unknown as Record<string, unknown>, {
  get(target, prop: string) {
    if (prop === "$queryRaw" || prop === "$queryRawUnsafe") return rawQuery;
    if (prop === "$executeRaw" || prop === "$executeRawUnsafe") return rawExecute;
    if (prop === "$transaction") return transaction;
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

import { POST } from "@/app/api/crm/listings/route";
import { PATCH } from "@/app/api/crm/listings/[id]/route";

type Mocked = { listing: Record<string, jest.Mock> };
const m = () => prismaMock as unknown as Mocked;

const draft = {
  listing_type: "sale", listingAgreement: "ExclusiveRightToSell", status: "Draft", ListPrice: 1200000,
  StreetNumber: "800", StreetName: "2nd", StreetSuffix: "Avenue", UnitNumber: "806", City: "New York", StateOrProvince: "NY",
  PropertyType: "Residential", PropertySubType: "Condominium",
};

function crmListing(overrides: Record<string, unknown> = {}) {
  return {
    id: BigInt(901), listing_id: "SL-0901", mls_id: null, agent_id: "agent-1", owner_client_id: null, status: "Draft", listing_type: "sale", rls_eligible: true,
    list_price: 1200000, living_area: null, bedrooms_total: 2, bathrooms_full: 1, bathrooms_half: 0, property_type: "Residential", property_sub_type: "Condominium",
    raw_data: { ListPrice: 1200000, StreetNumber: "800", StreetName: "2nd", PublicRemarks: "Bright two bedroom." }, features: {}, address: { StreetNumber: "800", StreetName: "2nd" },
    media: [], internet_entire_listing_display_yn: true, internet_address_display_yn: true, internet_automated_valuation_display_yn: true, internet_consumer_comment_yn: true,
    participant_only: false, owner_opt_out: false, status_changed_at: null, first_active_date: null, days_on_market: 0, expiration_date: null, last_synced_from_trestle: null,
    created_at: new Date("2026-03-01T00:00:00Z"), updated_at: new Date("2026-03-02T00:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  for (const k of Object.keys(calls)) delete calls[k];
  rawExecute.mockClear();
  transaction.mockClear();
  m().listing.create = jest.fn(async (args: { data: Record<string, unknown> }) => ({ ...crmListing(), ...args.data, id: BigInt(901) }));
  m().listing.update = jest.fn(async (args: { data: Record<string, unknown> }) => ({ ...crmListing(), ...args.data, id: BigInt(901) }));
  m().listing.findMany = jest.fn(async () => []);
  m().listing.findUnique = jest.fn(async () => crmListing());
  m().listing.findFirst = jest.fn(async () => null);
});

const patch = (body: Record<string, unknown>) => PATCH(makeRequest({ method: "PATCH", body }), { params: Promise.resolve({ id: "SL-0901" }) });

describe("PATCH /api/crm/listings/:id: the commercial classification follows the form", () => {
  it("a listing edited to a Commercial Condo stores the ownership and the first office kind in the typed columns, and keeps them in raw_data", async () => {
    const res = await patch({ PropertyType: "Commercial", commercial_ownership: "CommercialCondo", commercial_sub_type: "MedicalOffice", saleCommSubtype: ["MedicalOffice", "DentalOffice"] });
    expect(res.status).toBe(200);
    const data = m().listing.update.mock.calls[0][0].data as Record<string, any>;
    expect(data.commercial_ownership).toBe("CommercialCondo");
    expect(data.commercial_sub_type).toBe("MedicalOffice");
    expect(data.raw_data.commercial_ownership).toBe("CommercialCondo");
  });

  it("taking the classification away clears the columns (an empty answer is stored as none)", async () => {
    const res = await patch({ commercial_ownership: "", commercial_sub_type: "" });
    expect(res.status).toBe(200);
    const data = m().listing.update.mock.calls[0][0].data as Record<string, any>;
    expect(data.commercial_ownership).toBeNull();
    expect(data.commercial_sub_type).toBeNull();
  });

  it("an edit that does not carry the commercial keys leaves the columns alone", async () => {
    const res = await patch({ PublicRemarks: "Bright two bedroom with a terrace." });
    expect(res.status).toBe(200);
    const data = m().listing.update.mock.calls[0][0].data as Record<string, any>;
    expect(data).not.toHaveProperty("commercial_ownership");
    expect(data).not.toHaveProperty("commercial_sub_type");
  });
});
