/// <reference types="jest" />
/**
 * Beds, baths and living area are read ONE way by the create and the edit route (lib/listings/nullable-number.ts): a blank box is NULL ("not entered"), a typed 0 is 0 (a studio), a number is that
 * number, and anything else is refused. The forms already send a blank box as null (crm-form-blank-numbers.test.ts); the edit route read null as 0 (`Number(null)`), and the create route read a
 * typed 0 as "not entered" (a truthy test), so the same box meant two different facts depending on whether the listing was being created or edited.
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
import { readNullableNumber } from "@/lib/listings/nullable-number";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Mocked = { listing: Record<string, jest.Mock> };
const m = () => prismaMock as unknown as Mocked;

const draft = {
  listing_type: "sale", listingAgreement: "ExclusiveRightToSell", status: "Draft", ListPrice: 1200000,
  StreetNumber: "800", StreetName: "2nd", StreetSuffix: "Avenue", UnitNumber: "806", City: "New York", StateOrProvince: "NY",
  PropertyType: "Commercial", PropertySubType: "",
};

function crmListing(overrides: Record<string, unknown> = {}) {
  return {
    id: BigInt(901), listing_id: "SL-0901", mls_id: null, agent_id: "agent-1", owner_client_id: null, status: "Draft", listing_type: "sale", rls_eligible: false,
    list_price: 1200000, living_area: 900, bedrooms_total: 2, bathrooms_full: 1, bathrooms_half: 1, property_type: "Commercial", property_sub_type: "",
    raw_data: { ListPrice: 1200000, StreetNumber: "800", StreetName: "2nd" }, features: {}, address: { StreetNumber: "800", StreetName: "2nd" },
    media: [], internet_entire_listing_display_yn: true, internet_address_display_yn: true, internet_automated_valuation_display_yn: true, internet_consumer_comment_yn: true,
    participant_only: false, owner_opt_out: false, status_changed_at: null, first_active_date: null, days_on_market: 0, expiration_date: null, last_synced_from_trestle: null,
    created_at: new Date("2026-03-01T00:00:00Z"), updated_at: new Date("2026-03-02T00:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  for (const k of Object.keys(calls)) delete calls[k];
  m().listing.create = jest.fn(async (args: { data: Record<string, unknown> }) => ({ ...crmListing(), ...args.data, id: BigInt(901) }));
  m().listing.update = jest.fn(async (args: { data: Record<string, unknown> }) => ({ ...crmListing(), ...args.data, id: BigInt(901) }));
  m().listing.findMany = jest.fn(async () => []);
  m().listing.findUnique = jest.fn(async () => crmListing());
  m().listing.findFirst = jest.fn(async () => null);
});

const patch = (body: Record<string, unknown>) => PATCH(makeRequest({ method: "PATCH", body }), { params: Promise.resolve({ id: "SL-0901" }) });
const post = (extra: Record<string, unknown>) => POST(makeRequest({ method: "POST", body: { ...draft, ...extra } }));
const updated = () => m().listing.update.mock.calls[0][0].data as Record<string, any>;
const created = () => m().listing.create.mock.calls[0][0].data as Record<string, any>;

describe("readNullableNumber: one reading of a nullable number", () => {
  it.each([
    [null, null], ["", null], ["   ", null], [0, 0], ["0", 0], [3, 3], ["3", 3], [" 12 ", 12], ["1234.5", 1234.5], [-1, -1],
  ])("%j reads as %j", (input, value) => {
    expect(readNullableNumber(input)).toEqual({ ok: true, value });
  });
  it.each([["abc"], [NaN], [Infinity], [true], [[]], [{}], [undefined]])("%j is not a number", (input) => {
    expect(readNullableNumber(input)).toEqual({ ok: false });
  });
});

describe("PATCH /api/crm/listings/:id: a blank box is NULL, a typed 0 is 0", () => {
  it("a blank box (the form sends null) clears the column; it is NOT stored as 0", async () => {
    const res = await patch({ BedroomsTotal: null, BathroomsFull: null, BathroomsHalf: null, LivingArea: null });
    expect(res.status).toBe(200);
    expect(updated()).toMatchObject({ bedrooms_total: null, bathrooms_full: null, bathrooms_half: null, living_area: null });
  });

  it("an empty string reads as blank too", async () => {
    const res = await patch({ BedroomsTotal: "", LivingArea: "  " });
    expect(res.status).toBe(200);
    expect(updated()).toMatchObject({ bedrooms_total: null, living_area: null });
  });

  it("a typed 0 stays 0 (a studio has 0 bedrooms)", async () => {
    const res = await patch({ BedroomsTotal: 0, BathroomsFull: "0" });
    expect(res.status).toBe(200);
    expect(updated()).toMatchObject({ bedrooms_total: 0, bathrooms_full: 0 });
  });

  it("numbers and numeric text are stored as numbers", async () => {
    const res = await patch({ BedroomsTotal: "3", BathroomsFull: 2, BathroomsHalf: "1", LivingArea: "1234.5" });
    expect(res.status).toBe(200);
    expect(updated()).toMatchObject({ bedrooms_total: 3, bathrooms_full: 2, bathrooms_half: 1, living_area: 1234.5 });
  });

  it("a request that does not carry the keys leaves the columns alone", async () => {
    const res = await patch({ PublicRemarks: "Bright two bedroom with a terrace." });
    expect(res.status).toBe(200);
    for (const col of ["bedrooms_total", "bathrooms_full", "bathrooms_half", "living_area"]) expect(updated()).not.toHaveProperty(col);
  });

  it("text where a number belongs is refused with 400 and nothing is written", async () => {
    const res = await patch({ BedroomsTotal: "three" });
    expect(res.status).toBe(400);
    expect((await readJson<{ field?: string }>(res)).field).toBe("BedroomsTotal");
    expect(m().listing.update).not.toHaveBeenCalled();
  });
});

describe("POST /api/crm/listings: the same reading on create", () => {
  it("a typed 0 stays 0 on create (a studio is not 'not entered')", async () => {
    const res = await post({ BedroomsTotal: 0, BathroomsFull: 1, BathroomsHalf: 0, LivingArea: 450 });
    expect(res.status).toBe(201);
    expect(created()).toMatchObject({ bedrooms_total: 0, bathrooms_full: 1, bathrooms_half: 0, living_area: 450 });
  });

  it("blank and missing boxes are NULL", async () => {
    const res = await post({ BedroomsTotal: null, BathroomsFull: "" });
    expect(res.status).toBe(201);
    expect(created()).toMatchObject({ bedrooms_total: null, bathrooms_full: null, bathrooms_half: null, living_area: null });
  });

  it("numeric text is stored as a number", async () => {
    const res = await post({ BedroomsTotal: "3", LivingArea: "1234.5" });
    expect(res.status).toBe(201);
    expect(created()).toMatchObject({ bedrooms_total: 3, living_area: 1234.5 });
  });

  it("text where a number belongs is refused with 400 and nothing is created", async () => {
    const res = await post({ BedroomsTotal: "three" });
    expect(res.status).toBe(400);
    expect(m().listing.create).not.toHaveBeenCalled();
  });
});
