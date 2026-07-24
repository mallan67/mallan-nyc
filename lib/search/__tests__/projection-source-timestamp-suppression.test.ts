/**
 * Scope D (Maya directive 2026-07-24) — stop timestamp-only projection
 * rewrites (failing-first TDD).
 *
 * `projectionRowMateriallyEqual` deliberately treats `modified_at` (the
 * mirrored source ModificationTimestamp) as material, so a feed-side
 * timestamp bump with ZERO search-visible changes rewrote the projection
 * row, bumped listing/building/search cache tags, and triggered a full
 * manifest warm every cycle — "likely the biggest remaining
 * write-amplification issue".
 *
 * New contract proven here:
 *   - `projectionRowSearchVisiblyEqual` compares every projection column
 *     EXCEPT the provenance clock (`modified_at`).
 *   - timestamp-only delta → search-visibly EQUAL (callers skip the write;
 *     the source revision clock stays on the LISTING row for provenance).
 *   - any search-visible delta (price, status, display gate, searchable
 *     text, amenities, geography) → NOT equal (write proceeds).
 *   - fail-closed: missing row / missing column / comparison error → NOT
 *     equal.
 *
 * Consumer note (verified 2026-07-24): projection `modified_at` feeds the
 * search-alerts `modifiedSince` filter and `modified_at desc` ordering
 * (lib/search/core.ts:132-155, lib/search/criteria-to-prisma.ts:374).
 * Skipping timestamp-only rewrites therefore also stops false-positive
 * "updated listing" alerts where nothing visible changed — intended.
 */

import {
  buildListingSearchProjectionFromListing,
  projectionRowMateriallyEqual,
  projectionRowSearchVisiblyEqual,
  PROJECTION_PROVENANCE_ONLY_FIELDS,
  PROJECTION_MATERIAL_SELECT,
  type ListingProjectionSource,
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
    modification_timestamp: new Date("2026-07-20T10:00:00.000Z"),
    address: {
      StreetNumber: "400",
      StreetName: "EAST 90 STREET",
      PostalCode: "10128",
      UnitNumber: "17C",
    },
    features: { CommonInterest: "Condominium", YearBuilt: 1987 },
    media: [],
    ...overrides,
  } as ListingProjectionSource;
}

/** DB-shaped existing row for the freshly-built projection (identity case). */
function existingRowFor(source: ListingProjectionSource): Record<string, unknown> {
  return { ...buildListingSearchProjectionFromListing(source) } as unknown as Record<
    string,
    unknown
  >;
}

describe("PROJECTION_PROVENANCE_ONLY_FIELDS", () => {
  it("contains exactly modified_at (the mirrored source revision clock)", () => {
    expect([...PROJECTION_PROVENANCE_ONLY_FIELDS]).toEqual(["modified_at"]);
  });

  it("every provenance-only field is part of the material select (sanity)", () => {
    for (const f of PROJECTION_PROVENANCE_ONLY_FIELDS) {
      expect((PROJECTION_MATERIAL_SELECT as Record<string, unknown>)[f]).toBe(true);
    }
  });
});

describe("projectionRowSearchVisiblyEqual — timestamp-only suppression seam", () => {
  it("identical rows are search-visibly equal (and materially equal)", () => {
    const source = sourceFixture();
    const next = buildListingSearchProjectionFromListing(source);
    const existing = existingRowFor(source);
    expect(projectionRowMateriallyEqual(existing, next)).toBe(true);
    expect(projectionRowSearchVisiblyEqual(existing, next)).toBe(true);
  });

  it("modified_at-only delta: materially UNEQUAL but search-visibly EQUAL — the write skips", () => {
    const existing = existingRowFor(sourceFixture());
    const next = buildListingSearchProjectionFromListing(
      sourceFixture({ modification_timestamp: new Date("2026-07-24T10:00:00.000Z") }),
    );
    expect(projectionRowMateriallyEqual(existing, next)).toBe(false); // old comparator: would write
    expect(projectionRowSearchVisiblyEqual(existing, next)).toBe(true); // new comparator: suppress
  });

  it("price change → NOT search-visibly equal (write proceeds)", () => {
    const existing = existingRowFor(sourceFixture());
    const next = buildListingSearchProjectionFromListing(
      sourceFixture({
        list_price: "949000",
        modification_timestamp: new Date("2026-07-24T10:00:00.000Z"),
      }),
    );
    expect(projectionRowSearchVisiblyEqual(existing, next)).toBe(false);
  });

  it("status change → NOT search-visibly equal", () => {
    const existing = existingRowFor(sourceFixture());
    const next = buildListingSearchProjectionFromListing(sourceFixture({ status: "Closed" }));
    expect(projectionRowSearchVisiblyEqual(existing, next)).toBe(false);
  });

  it("display-gate flip → NOT search-visibly equal (Sec 2.05 removals must invalidate)", () => {
    const existing = existingRowFor(sourceFixture());
    const next = buildListingSearchProjectionFromListing(
      sourceFixture({ idx_display_yn: false }),
    );
    expect(projectionRowSearchVisiblyEqual(existing, next)).toBe(false);
  });

  it("searchable-text-affecting change (address unit) → NOT search-visibly equal", () => {
    const existing = existingRowFor(sourceFixture());
    const next = buildListingSearchProjectionFromListing(
      sourceFixture({
        address: {
          StreetNumber: "400",
          StreetName: "EAST 90 STREET",
          PostalCode: "10128",
          UnitNumber: "18A",
        },
      }),
    );
    expect(projectionRowSearchVisiblyEqual(existing, next)).toBe(false);
  });

  it("fail-closed: missing existing row → NOT equal", () => {
    const next = buildListingSearchProjectionFromListing(sourceFixture());
    expect(projectionRowSearchVisiblyEqual(null, next)).toBe(false);
    expect(projectionRowSearchVisiblyEqual(undefined, next)).toBe(false);
  });

  it("fail-closed: column missing from the existing selection → NOT equal", () => {
    const source = sourceFixture();
    const next = buildListingSearchProjectionFromListing(source);
    const existing = existingRowFor(source);
    delete existing.searchable_text;
    expect(projectionRowSearchVisiblyEqual(existing, next)).toBe(false);
  });
});
