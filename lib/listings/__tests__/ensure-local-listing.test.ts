/// <reference types="jest" />
/**
 * ensure-local-listing: a provider listing gets a LOCAL IDENTITY without ever becoming
 * Mallan-owned and without a single fabricated provider fact. The DB is mocked; the canonical
 * gate helper and the live status vocabulary are REAL.
 */
const findUniqueMock = jest.fn<Promise<unknown>, unknown[]>(async () => null);
const findFirstMock = jest.fn<Promise<unknown>, unknown[]>(async () => null);
const createMock = jest.fn<Promise<unknown>, [unknown]>(async (args: unknown) => ({ id: 9001n, listing_id: (args as { data: { listing_id: string } }).data.listing_id }));
jest.mock("@/lib/prisma", () => ({ __esModule: true, default: { listing: { findUnique: findUniqueMock, findFirst: findFirstMock, create: createMock } } }));
const dualWriteMock = jest.fn(async () => undefined);
jest.mock("@/lib/search/listing-search-projection", () => ({ __esModule: true, dualWriteProjectionForListingId: dualWriteMock }));

import { ensureInputFromSearchDto, ensureLocalListing, UnrepresentableListingError } from "@/lib/listings/ensure-local-listing";

beforeEach(() => { jest.clearAllMocks(); findUniqueMock.mockResolvedValue(null); findFirstMock.mockResolvedValue(null); });

const dto = { id: "RLS20059088", mlsStatus: "ComingSoon", status: "COMING_SOON", address: "217 W 57TH STREET", unit: "4A", neighborhood: "Tribeca", borough: "Manhattan", zip: "10019", price: 1850000, beds: 2, baths: 2.5, fullBaths: 2, halfBaths: 1, intSqft: 1320, propertyType: "Condo", propertySubType: "Apartment", listingCategory: undefined, agentName: "L A", agentEmail: "l@x.test", agentPhone: "212", company: "Other Brokerage", latitude: 40.7, longitude: -73.9, crossStreet: "7th Ave", images: [{ url: "https://cdn.test/1.jpg" }], internetDisplayYN: true, addressDisplayYN: false, permissions: { ownerOptOut: false, participantOnly: false } };
const created = () => (createMock.mock.calls[0][0] as { data: Record<string, unknown> }).data;

test("existing row by listing_id → returned, nothing created", async () => {
  findUniqueMock.mockResolvedValue({ id: 5n, listing_id: "RLS20059088" });
  const r = await ensureLocalListing(ensureInputFromSearchDto(dto, "sale"));
  expect(r).toEqual({ id: 5n, listing_id: "RLS20059088", created: false });
  expect(createMock).not.toHaveBeenCalled();
});

test("creates a Cotality-source-owned row: rls_eligible TRUE (never website-only), gates from the canonical helper, provider status exact, cursor-safe, dual-write", async () => {
  const audit = jest.fn(async () => undefined);
  const r = await ensureLocalListing(ensureInputFromSearchDto(dto, "sale"), audit);
  expect(r).toEqual({ id: 9001n, listing_id: "RLS20059088", created: true });
  const data = created();
  expect(data).toMatchObject({
    listing_id: "RLS20059088", mls_id: "RLS20059088", listing_type: "sale", status: "ComingSoon",
    list_price: 1850000, bedrooms_total: 2, bathrooms_full: 2, bathrooms_half: 1, living_area: 1320,
    borough: "Manhattan", neighborhood: "Tribeca", postal_code: "10019", property_type: "Condo",
    rls_eligible: true,
    idx_display_yn: true, internet_entire_listing_display_yn: true, internet_address_display_yn: false,
    internet_automated_valuation_display_yn: false, internet_consumer_comment_yn: false,
    participant_only: false, owner_opt_out: false, sync_status: "pending",
  });
  expect(data.last_synced_from_trestle).toBeUndefined();
  expect(audit).toHaveBeenCalledWith({ id: 9001n, listing_id: "RLS20059088" });
  expect(dualWriteMock).toHaveBeenCalledWith(expect.anything(), "RLS20059088");
});

test("a terminal provider status is stored exactly and never displayable; an explicit false entire-listing flag blocks", async () => {
  await ensureLocalListing(ensureInputFromSearchDto({ ...dto, mlsStatus: "Closed", internetDisplayYN: false }, "sale"));
  const data = created();
  expect(data.status).toBe("Closed");
  expect(data.idx_display_yn).toBe(false);
  expect(data.internet_entire_listing_display_yn).toBe(false);
  expect(data.rls_eligible).toBe(true);
});

test("IDX Plus pre-filter semantics: null display flags are displayable (not fail-closed) — the canonical gate decides", async () => {
  await ensureLocalListing(ensureInputFromSearchDto({ ...dto, mlsStatus: "Active", internetDisplayYN: null, addressDisplayYN: null }, "sale"));
  const data = created();
  expect(data.internet_entire_listing_display_yn).toBe(true);
  expect(data.internet_address_display_yn).toBe(true);
  expect(data.idx_display_yn).toBe(true);
});

test("participant-only / owner-opt-out block display", async () => {
  await ensureLocalListing(ensureInputFromSearchDto({ ...dto, mlsStatus: "Active", permissions: { ownerOptOut: true, participantOnly: false } }, "sale"));
  expect(created()).toMatchObject({ owner_opt_out: true, idx_display_yn: false });
});

describe("NO FABRICATED PROVIDER FACTS — refused, never invented", () => {
  test("null ListPrice (nullable at Cotality) → unrepresentable; no $0 row", async () => {
    await expect(ensureLocalListing(ensureInputFromSearchDto({ ...dto, price: null }, "sale"))).rejects.toBeInstanceOf(UnrepresentableListingError);
    expect(createMock).not.toHaveBeenCalled();
  });
  test("absent status → unrepresentable; never Active by default", async () => {
    await expect(ensureLocalListing(ensureInputFromSearchDto({ ...dto, mlsStatus: "", status: "" }, "sale"))).rejects.toThrow(/status is absent/);
    expect(createMock).not.toHaveBeenCalled();
  });
  test("a status outside the live StandardStatus vocabulary (e.g. the CRM's UNKNOWN sentinel) → unrepresentable; it can never become a displayable row", async () => {
    await expect(ensureLocalListing(ensureInputFromSearchDto({ ...dto, mlsStatus: "", status: "UNKNOWN" }, "sale"))).rejects.toThrow(/not a live StandardStatus member/);
    expect(createMock).not.toHaveBeenCalled();
  });
  test("inventory type is never inferred from absence: no type stated → unrepresentable", async () => {
    await expect(ensureLocalListing(ensureInputFromSearchDto({ ...dto, listingCategory: undefined }))).rejects.toThrow(/inventory type/);
    expect(createMock).not.toHaveBeenCalled();
  });
  test("the saved search's known inventory type is used as stated", async () => {
    await ensureLocalListing(ensureInputFromSearchDto({ ...dto, mlsStatus: "Active" }, "rent"));
    expect(created().listing_type).toBe("rent");
  });
  test("the refusal names every missing fact", async () => {
    try { await ensureLocalListing(ensureInputFromSearchDto({ ...dto, price: null, mlsStatus: "", status: "" })); throw new Error("should have thrown"); }
    catch (e) { expect(e).toBeInstanceOf(UnrepresentableListingError); expect((e as UnrepresentableListingError).reasons).toHaveLength(3); }
  });
});

test("a race on the unique key returns the row the other writer created", async () => {
  createMock.mockRejectedValueOnce(new Error("Unique constraint failed on the fields: (`listing_id`)"));
  findUniqueMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 7n, listing_id: "RLS20059088" });
  const r = await ensureLocalListing(ensureInputFromSearchDto(dto, "sale"));
  expect(r).toEqual({ id: 7n, listing_id: "RLS20059088", created: false });
});
