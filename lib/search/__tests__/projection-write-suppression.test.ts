/**
 * Phase 3 write-suppression — listing_search_projection identity (failing-first TDD).
 *
 * The projection upsert must compare the COMPLETE material projection row
 * before writing. Every projection column is derived from the source listing
 * (price, status, geography, search text, flags, amenities, display gates,
 * modified_at = source ModificationTimestamp), so ALL of them are material.
 * The only non-material columns are Prisma-managed id/created_at/updated_at,
 * which are never part of the upsert payload.
 */

import {
  buildListingSearchProjectionFromListing,
  projectionRowMateriallyEqual,
  dualWriteProjectionForListingId,
  type ListingProjectionSource,
  type DualWriteProjectionPrisma,
} from "../listing-search-projection";

function sourceFixture(overrides: Partial<ListingProjectionSource> = {}): ListingProjectionSource {
  return {
    listing_id: "RLS200001",
    status: "Active",
    listing_type: "sale",
    property_type: "Residential",
    property_sub_type: "Condominium",
    list_price: "985000",
    bedrooms_total: 2,
    bathrooms_full: 2,
    bathrooms_half: 1,
    living_area: "1200",
    borough: "Manhattan",
    neighborhood: "Upper East Side",
    city: "New York",
    postal_code: "10128",
    rls_eligible: true,
    commercial_sub_type: null,
    idx_display_yn: true,
    internet_entire_listing_display_yn: true,
    internet_address_display_yn: true,
    participant_only: false,
    agent_id: null,
    modification_timestamp: new Date("2026-07-01T00:00:00Z"),
    address: { StreetNumber: "400", StreetName: "East 90th Street", City: "New York" },
    features: { PublicRemarks: "Bright two bedroom." },
    media: [],
    ...overrides,
  };
}

/** Simulate the DB row a previous upsert of this projection produced. */
function dbProjectionRow(source: ListingProjectionSource): Record<string, unknown> {
  const row = buildListingSearchProjectionFromListing(source);
  return {
    ...row,
    // DB adds Prisma-managed columns the comparator must ignore.
    id: BigInt(7),
    created_at: new Date("2026-01-01T00:00:00Z"),
    updated_at: new Date("2026-07-20T09:00:00Z"),
  };
}

describe("projectionRowMateriallyEqual", () => {
  it("identical projection (fresh Prisma-managed timestamps) → EQUAL", () => {
    const source = sourceFixture();
    const next = buildListingSearchProjectionFromListing(source);
    expect(projectionRowMateriallyEqual(dbProjectionRow(source), next)).toBe(true);
  });

  it("price change → NOT equal", () => {
    const existing = dbProjectionRow(sourceFixture());
    const next = buildListingSearchProjectionFromListing(sourceFixture({ list_price: "990000" }));
    expect(projectionRowMateriallyEqual(existing, next)).toBe(false);
  });

  it("status change → NOT equal", () => {
    const existing = dbProjectionRow(sourceFixture());
    const next = buildListingSearchProjectionFromListing(sourceFixture({ status: "Pending" }));
    expect(projectionRowMateriallyEqual(existing, next)).toBe(false);
  });

  it("geography change (neighborhood) → NOT equal", () => {
    const existing = dbProjectionRow(sourceFixture());
    const next = buildListingSearchProjectionFromListing(sourceFixture({ neighborhood: "Yorkville" }));
    expect(projectionRowMateriallyEqual(existing, next)).toBe(false);
  });

  it("search-text change (PublicRemarks) → NOT equal", () => {
    const existing = dbProjectionRow(sourceFixture());
    const next = buildListingSearchProjectionFromListing(
      sourceFixture({ features: { PublicRemarks: "Price improved!" } }),
    );
    expect(projectionRowMateriallyEqual(existing, next)).toBe(false);
  });

  it("display-gate change (idx_display_yn true→false) → NOT equal (fail-closed §2.05 hide must write)", () => {
    const existing = dbProjectionRow(sourceFixture());
    const next = buildListingSearchProjectionFromListing(sourceFixture({ idx_display_yn: false }));
    expect(projectionRowMateriallyEqual(existing, next)).toBe(false);
  });

  it("amenity/feature-flag change → NOT equal", () => {
    const existing = dbProjectionRow(sourceFixture());
    const next = buildListingSearchProjectionFromListing(
      sourceFixture({ features: { PublicRemarks: "Bright two bedroom.", PetsAllowed: "CatsOk" } }),
    );
    expect(projectionRowMateriallyEqual(existing, next)).toBe(false);
  });

  it("source-modification change (modified_at) → NOT equal", () => {
    const existing = dbProjectionRow(sourceFixture());
    const next = buildListingSearchProjectionFromListing(
      sourceFixture({ modification_timestamp: new Date("2026-07-02T00:00:00Z") }),
    );
    expect(projectionRowMateriallyEqual(existing, next)).toBe(false);
  });

  it("missing existing row → NOT equal (insert must flow)", () => {
    const next = buildListingSearchProjectionFromListing(sourceFixture());
    expect(projectionRowMateriallyEqual(null, next)).toBe(false);
    expect(projectionRowMateriallyEqual(undefined, next)).toBe(false);
  });
});

describe("dualWriteProjectionForListingId — suppression behavior", () => {
  const listingDbShape = (source: ListingProjectionSource): Record<string, unknown> => ({
    listing_id: source.listing_id,
    status: source.status,
    listing_type: source.listing_type,
    property_type: source.property_type,
    property_sub_type: source.property_sub_type,
    list_price: source.list_price,
    bedrooms_total: source.bedrooms_total,
    bathrooms_full: source.bathrooms_full,
    bathrooms_half: source.bathrooms_half,
    living_area: source.living_area,
    borough: source.borough,
    neighborhood: source.neighborhood,
    city: source.city,
    postal_code: source.postal_code,
    rls_eligible: source.rls_eligible,
    commercial_sub_type: source.commercial_sub_type,
    idx_display_yn: source.idx_display_yn,
    internet_entire_listing_display_yn: source.internet_entire_listing_display_yn,
    internet_address_display_yn: source.internet_address_display_yn,
    participant_only: source.participant_only,
    agent_id: source.agent_id,
    modification_timestamp: source.modification_timestamp,
    address: source.address,
    features: source.features,
    media: source.media,
  });

  function mockPrisma(
    listingRow: Record<string, unknown> | null,
    projectionRow: Record<string, unknown> | null,
  ) {
    const upsert = jest.fn(async () => ({}));
    const prisma = {
      listing: {
        findUnique: jest.fn(async () => listingRow),
      },
      listingSearchProjection: {
        findUnique: jest.fn(async () => projectionRow),
        upsert,
      },
    } as unknown as DualWriteProjectionPrisma;
    return { prisma, upsert };
  }

  it("unchanged projection → upsert is SUPPRESSED", async () => {
    const source = sourceFixture();
    const { prisma, upsert } = mockPrisma(listingDbShape(source), dbProjectionRow(source));
    await dualWriteProjectionForListingId(prisma, source.listing_id);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("changed projection → upsert fires", async () => {
    const source = sourceFixture();
    const changed = sourceFixture({ list_price: "1000000" });
    const { prisma, upsert } = mockPrisma(listingDbShape(changed), dbProjectionRow(source));
    await dualWriteProjectionForListingId(prisma, source.listing_id);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("missing projection row → upsert fires (insert)", async () => {
    const source = sourceFixture();
    const { prisma, upsert } = mockPrisma(listingDbShape(source), null);
    await dualWriteProjectionForListingId(prisma, source.listing_id);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("missing listing row → silent no-op (unchanged contract)", async () => {
    const { prisma, upsert } = mockPrisma(null, null);
    await dualWriteProjectionForListingId(prisma, "RLS-GONE");
    expect(upsert).not.toHaveBeenCalled();
  });
});
