/// <reference types="jest" />
/**
 * ensure-local-listing: the CRM's existing "give a provider listing a local identity"
 * mechanism, extracted for the alert cron. Same row as the route always created.
 */
const findUniqueMock = jest.fn<Promise<unknown>, unknown[]>(async () => null);
const findFirstMock = jest.fn<Promise<unknown>, unknown[]>(async () => null);
const createMock = jest.fn<Promise<unknown>, [unknown]>(async (args: unknown) => ({ id: 9001n, listing_id: (args as { data: { listing_id: string } }).data.listing_id }));
jest.mock("@/lib/prisma", () => ({ __esModule: true, default: { listing: { findUnique: findUniqueMock, findFirst: findFirstMock, create: createMock } } }));
const dualWriteMock = jest.fn(async () => undefined);
jest.mock("@/lib/search/listing-search-projection", () => ({ __esModule: true, dualWriteProjectionForListingId: dualWriteMock }));

import { ensureInputFromSearchDto, ensureLocalListing } from "@/lib/listings/ensure-local-listing";

beforeEach(() => { jest.clearAllMocks(); findUniqueMock.mockResolvedValue(null); findFirstMock.mockResolvedValue(null); });

const dto = { id: "RLS20059088", mlsStatus: "ComingSoon", status: "COMING_SOON", address: "217 W 57TH STREET", unit: "4A", neighborhood: "Tribeca", borough: "Manhattan", zip: "10019", price: 1850000, beds: 2, baths: 2.5, fullBaths: 2, halfBaths: 1, intSqft: 1320, propertyType: "Condo", propertySubType: "Apartment", listingCategory: undefined, agentName: "L A", agentEmail: "l@x.test", agentPhone: "212", company: "Other Brokerage", latitude: 40.7, longitude: -73.9, crossStreet: "7th Ave", images: [{ url: "https://cdn.test/1.jpg" }], internetDisplayYN: true, addressDisplayYN: false };

test("existing row by listing_id → returned, nothing created", async () => {
  findUniqueMock.mockResolvedValue({ id: 5n, listing_id: "RLS20059088" });
  const r = await ensureLocalListing(ensureInputFromSearchDto(dto));
  expect(r).toEqual({ id: 5n, listing_id: "RLS20059088", created: false });
  expect(createMock).not.toHaveBeenCalled();
});

test("creates the minimal external row from the DTO: provider status normalized exactly, external flag, fail-closed gates, cursor-safe, dual-write", async () => {
  const audit = jest.fn(async () => undefined);
  const r = await ensureLocalListing(ensureInputFromSearchDto(dto), audit);
  expect(r).toEqual({ id: 9001n, listing_id: "RLS20059088", created: true });
  const data = (createMock.mock.calls[0][0] as { data: Record<string, unknown> }).data;
  expect(data).toMatchObject({
    listing_id: "RLS20059088", mls_id: "RLS20059088", listing_type: "sale", status: "ComingSoon",
    list_price: 1850000, bedrooms_total: 2, bathrooms_full: 2, bathrooms_half: 1, living_area: 1320,
    borough: "Manhattan", neighborhood: "Tribeca", postal_code: "10019", property_type: "Condo",
    rls_eligible: false, idx_display_yn: true, internet_entire_listing_display_yn: true, internet_address_display_yn: false, sync_status: "pending",
  });
  expect(data.last_synced_from_trestle).toBeUndefined();
  expect((data.address as Record<string, unknown>).full).toBe("217 W 57TH STREET");
  expect(audit).toHaveBeenCalledWith({ id: 9001n, listing_id: "RLS20059088" });
  expect(dualWriteMock).toHaveBeenCalledWith(expect.anything(), "RLS20059088");
});

test("a terminal provider status never becomes displayable; missing display flags fail closed", async () => {
  await ensureLocalListing(ensureInputFromSearchDto({ ...dto, mlsStatus: "Closed", internetDisplayYN: undefined, addressDisplayYN: undefined }));
  const data = (createMock.mock.calls[0][0] as { data: Record<string, unknown> }).data;
  expect(data.status).toBe("Closed");
  expect(data.idx_display_yn).toBe(false);
  expect(data.internet_entire_listing_display_yn).toBe(false);
  expect(data.internet_address_display_yn).toBe(false);
});

test("a race on the unique key returns the row the other writer created", async () => {
  createMock.mockRejectedValueOnce(new Error("Unique constraint failed on the fields: (`listing_id`)"));
  findUniqueMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 7n, listing_id: "RLS20059088" });
  const r = await ensureLocalListing(ensureInputFromSearchDto(dto));
  expect(r).toEqual({ id: 7n, listing_id: "RLS20059088", created: false });
});

test("no listing id → throws (nothing is fabricated)", async () => {
  await expect(ensureLocalListing({ listing_id: "" })).rejects.toThrow(/listing_id is required/);
});
