import {
  UNPOPULATED_AMENITIES,
  UNMAPPED_AMENITIES,
  UNSUPPORTED_AMENITIES,
} from "@/lib/search/types";
import {
  getUnsupportedAlertCriteria,
  getUnsupportedSearchCriteria,
  criteriaToProjectionWhere,
  criteriaToPrismaWhere,
  getUnsupportedProjectionCriteria,
} from "@/lib/search/criteria-to-prisma";
import {
  buildProjectionSearchWhere,
  buildSearchDisplayWhere,
  canDisplayListingAddress,
  isListingDisplayable,
  normalizeSearchStatuses,
  PROJECTION_DISPLAY_GATE,
} from "@/lib/search/listing-access-decision";
import {
  formatSearchAlertAddress,
  runProjectionListingSearch,
  sanitizeSearchAddress,
  serializeSearchListing,
} from "@/lib/search/core";

describe("SearchCore criteriaToPrismaWhere", () => {
  it("always applies the fail-closed display gate", () => {
    const where = criteriaToPrismaWhere({ listing_type: "sale" });

    expect(where).toMatchObject({
      idx_display_yn: true,
      owner_opt_out: false,
      participant_only: false,
      internet_entire_listing_display_yn: true,
      listing_type: "sale",
    });
  });

  it("normalizes rental aliases to DB listing_type=rent", () => {
    expect(criteriaToPrismaWhere({ listing_type: "rental" }).listing_type).toBe("rent");
    expect(criteriaToPrismaWhere({ type: "rent" }).listing_type).toBe("rent");
  });

  it("supports snake_case and camelCase criteria from existing surfaces", () => {
    const where = criteriaToPrismaWhere({
      type: "sale",
      propertyType: "Residential",
      neighborhood: "Chelsea",
      minPrice: "1,000,000",
      maxPrice: 2000000,
      bedsMin: 1,
      bedsMax: 3,
      minBaths: 2,
      minSqft: 900,
    });

    expect(where.listing_type).toBe("sale");
    expect(where.property_type).toEqual({ in: ["Residential"] });
    expect(where.neighborhood).toEqual({ in: ["Chelsea"] });
    expect(where.list_price).toEqual({ gte: 1000000, lte: 2000000 });
    expect(where.bedrooms_total).toEqual({ gte: 1, lte: 3 });
    expect(where.bathrooms_full).toEqual({ gte: 2 });
    expect(where.living_area).toEqual({ gte: 900 });
  });

  it("defaults to active display statuses only", () => {
    expect(buildSearchDisplayWhere().status).toEqual({
      in: ["Active", "ActiveUnderContract", "ComingSoon"],
    });
  });

  it("fails closed when requested statuses normalize to non-displayable values only", () => {
    expect(normalizeSearchStatuses(["Closed", "Expired"])).toEqual([]);
    expect(buildSearchDisplayWhere(["Closed", "Expired"]).status).toEqual({ in: [] });
  });

  it("adds modification timestamp for alert runs", () => {
    const since = new Date("2026-04-01T00:00:00Z");
    const where = criteriaToPrismaWhere({ listing_type: "sale" }, { modifiedSince: since });

    expect(where.modification_timestamp).toEqual({ gte: since });
  });
});

describe("SearchCore address display", () => {
  const fullAddress = {
    full: "100 Main St, New York",
    streetNumber: "100",
    streetName: "Main St",
    city: "New York",
    latitude: 40.7,
    longitude: -74,
    neighborhood: "Chelsea",
  };

  it("shows address only when entire-listing and address flags are explicitly true", () => {
    expect(canDisplayListingAddress({
      internet_entire_listing_display_yn: true,
      internet_address_display_yn: true,
    })).toBe(true);

    expect(canDisplayListingAddress({
      internet_entire_listing_display_yn: true,
      internet_address_display_yn: null,
    })).toBe(false);
  });

  it("requires idx display plus canonical distribution gates for portal/search display", () => {
    expect(isListingDisplayable({
      idx_display_yn: true,
      internet_entire_listing_display_yn: true,
      owner_opt_out: false,
      participant_only: false,
      status: "Active",
    })).toBe(true);

    expect(isListingDisplayable({
      idx_display_yn: null,
      internet_entire_listing_display_yn: true,
      owner_opt_out: false,
      participant_only: false,
      status: "Active",
    })).toBe(false);

    expect(isListingDisplayable({
      idx_display_yn: true,
      internet_entire_listing_display_yn: null,
      owner_opt_out: false,
      participant_only: false,
      status: "Active",
    })).toBe(false);
  });

  it("suppresses reverse-identifying address data when address display is not affirmative", () => {
    const address = sanitizeSearchAddress({
      address: fullAddress,
      neighborhood: "Chelsea",
      internet_entire_listing_display_yn: true,
      internet_address_display_yn: null,
    });

    expect(address).toEqual({
      neighborhood: "Chelsea",
      city: "New York",
      suppressed: true,
      label: "Chelsea, New York (Address Available on Request)",
    });
  });

  it("formats alert addresses through the same fail-closed policy", () => {
    const label = formatSearchAlertAddress({
      address: fullAddress,
      neighborhood: "Chelsea",
      internet_entire_listing_display_yn: true,
      internet_address_display_yn: false,
    });

    expect(label).toBe("Chelsea, New York (Address Available on Request)");
  });
});

// ── PR 5D — projection-backed search path ─────────────────────────────

describe("PROJECTION_DISPLAY_GATE", () => {
  it("mirrors the four projection-side gate columns and applies owner_opt_out via the listing relation", () => {
    expect(PROJECTION_DISPLAY_GATE).toEqual({
      rls_eligible: true,
      idx_display_yn: true,
      internet_entire_listing_display_yn: true,
      participant_only_yn: false,
      listing: { owner_opt_out: false },
    });
  });
});

describe("buildProjectionSearchWhere", () => {
  it("defaults to the active-display status set on mls_status", () => {
    expect(buildProjectionSearchWhere().mls_status).toEqual({
      in: ["Active", "ActiveUnderContract", "ComingSoon"],
    });
  });

  it("fails closed when every requested status normalizes to a non-displayable value", () => {
    expect(buildProjectionSearchWhere(["Closed", "Expired"]).mls_status).toEqual({ in: [] });
  });
});

describe("criteriaToProjectionWhere", () => {
  it("always carries the projection-side fail-closed gate (incl. listing.owner_opt_out)", () => {
    const where = criteriaToProjectionWhere({ listing_type: "sale" });

    expect(where).toMatchObject({
      rls_eligible: true,
      idx_display_yn: true,
      internet_entire_listing_display_yn: true,
      participant_only_yn: false,
      listing: { owner_opt_out: false },
      listing_type: "sale",
    });
  });

  it("normalizes rental aliases to listing_type=rent on the projection", () => {
    expect(criteriaToProjectionWhere({ listing_type: "rental" }).listing_type).toBe("rent");
    expect(criteriaToProjectionWhere({ type: "lease" }).listing_type).toBe("rent");
    expect(criteriaToProjectionWhere({ type: "rent" }).listing_type).toBe("rent");
  });

  it("renames numeric filter columns to their projection equivalents", () => {
    const where = criteriaToProjectionWhere({
      type: "sale",
      minPrice: "1,000,000",
      maxPrice: 2000000,
      bedsMin: 1,
      bedsMax: 3,
      minBaths: 2,
      minSqft: 900,
    });

    // Listing-side names (bedrooms_total / bathrooms_full / list_price Decimal)
    // do NOT appear on the projection where.
    expect((where as Record<string, unknown>).bedrooms_total).toBeUndefined();
    expect((where as Record<string, unknown>).bathrooms_full).toBeUndefined();

    // Projection-side names ARE used (Float for beds/baths, BigInt for price).
    expect(where.list_price).toEqual({ gte: 1000000, lte: 2000000 });
    expect(where.bedrooms).toEqual({ gte: 1, lte: 3 });
    expect(where.bathrooms).toEqual({ gte: 2 });
    expect(where.living_area).toEqual({ gte: 900 });
  });

  it("filters borough + neighborhoods + property_type the same way as the Listing-backed path", () => {
    const where = criteriaToProjectionWhere({
      borough: "Manhattan",
      neighborhoods: ["Chelsea", "Tribeca"],
      property_type: "Residential",
    });

    expect(where.borough).toBe("Manhattan");
    expect(where.neighborhood).toEqual({ in: ["Chelsea", "Tribeca"] });
    expect(where.property_type).toEqual({ in: ["Residential"] });
  });

  it("uses modified_at (not modification_timestamp) for modifiedSince filters", () => {
    const since = new Date("2026-04-01T00:00:00Z");
    const where = criteriaToProjectionWhere({ listing_type: "sale" }, { modifiedSince: since });

    expect(where.modified_at).toEqual({ gte: since });
    // Listing-side column name must NOT leak into the projection where.
    expect((where as Record<string, unknown>).modification_timestamp).toBeUndefined();
  });

  it("respects multi-status input via mls_status", () => {
    const where = criteriaToProjectionWhere({ statuses: ["Active", "ComingSoon"] });
    expect(where.mls_status).toEqual({ in: ["Active", "ComingSoon"] });
  });
});

describe("getUnsupportedProjectionCriteria", () => {
  it("returns no unsupported keys for supported criteria", () => {
    expect(getUnsupportedProjectionCriteria({
      listing_type: "sale",
      statuses: ["Active"],
      property_type: ["Residential"],
      borough: "Manhattan",
      neighborhoods: ["Chelsea"],
      min_price: 1000000,
      max_price: "2000000",
      min_beds: 1,
      max_beds: 3,
      min_baths: 1,
      max_baths: 2,
      min_sqft: 800,
      max_sqft: 1200,
    })).toEqual([]);
  });

  it("treats property_type as supported but ownership/CommonInterest as unsupported unless mapped", () => {
    expect(getUnsupportedProjectionCriteria({
      property_type: "Residential",
      CommonInterest: ["Condominium"],
    })).toEqual(["CommonInterest"]);
  });

  it("returns unsupported criteria for keys that projection does not support", () => {
    expect(getUnsupportedProjectionCriteria({
      zip: "10001",
      listing_id: "RLS20059088",
      propertySubType: "Condominium",
      min_year: 2000,
    }).sort()).toEqual([
      "listing_id",
      "min_year",
      "propertySubType",
      "zip",
    ]);
  });

  it("does not silently ignore nested unknown criteria", () => {
    expect(getUnsupportedProjectionCriteria({
      checkboxFilters: {
        MlsStatus: ["Active"],
      },
    })).toEqual(["checkboxFilters"]);
  });

  it("ignores reserved internal search-tab metadata", () => {
    expect(getUnsupportedProjectionCriteria({
      _search_tab: "sale",
      listing_type: "sale",
    })).toEqual([]);
  });
});

describe("runProjectionListingSearch", () => {
  type Row = { listing: Record<string, unknown> | null };

  function fakeDb(rows: Row[], total: number) {
    return {
      listingSearchProjection: {
        findMany: jest.fn().mockResolvedValue(rows),
        count: jest.fn().mockResolvedValue(total),
      },
    };
  }

  const sampleListing = {
    id: BigInt(1),
    listing_id: "RLS20059088",
    status: "Active",
    listing_type: "sale",
    property_type: "Residential",
    property_sub_type: "Condominium",
    list_price: "1850000",
    bedrooms_total: 2,
    bathrooms_full: 2,
    bathrooms_half: 0,
    living_area: "1320",
    borough: "Manhattan",
    neighborhood: "Tribeca",
    address: { streetNumber: "217", streetName: "W 57th Street", city: "New York" },
    // Deliberately present on the FIXTURE though absent from
    // SEARCH_RESULT_LISTING_SELECT: it makes the shape assertion below prove
    // `serializeSearchListing` drops media even when handed it, not merely that
    // the select stopped fetching it.
    media: [{ url: "https://legacy.example/1.jpg", mediaType: "Photo", order: 0 }],
    modification_timestamp: new Date("2026-04-29T12:00:00Z"),
    internet_entire_listing_display_yn: true,
    internet_address_display_yn: true,
  };

  it("queries the projection table with the projection-side where + 1:1 listing include", async () => {
    const db = fakeDb([{ listing: sampleListing }], 1);

    const result = await runProjectionListingSearch(db, { listing_type: "sale" });

    expect(db.listingSearchProjection.findMany).toHaveBeenCalledTimes(1);
    const args = db.listingSearchProjection.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual([{ modified_at: "desc" }, { id: "asc" }]);
    expect(args.include).toEqual({ listing: { select: expect.any(Object) } });
    expect(args.where).toMatchObject({
      rls_eligible: true,
      idx_display_yn: true,
      internet_entire_listing_display_yn: true,
      participant_only_yn: false,
      listing: { owner_opt_out: false },
      listing_type: "sale",
    });

    expect(result.total).toBe(1);
    expect(result.listings).toHaveLength(1);
    expect(result.listings[0].listing_id).toBe("RLS20059088");
    expect(result.projection_where).toBe(args.where);
  });

  it("filters out null listings (cascade race) without throwing", async () => {
    const db = fakeDb(
      [
        { listing: sampleListing },
        { listing: null },
        { listing: { ...sampleListing, listing_id: "RLS20060000" } },
      ],
      3,
    );

    const result = await runProjectionListingSearch(db, { listing_type: "sale" });

    expect(result.listings).toHaveLength(2);
    expect(result.listings.map((l) => l.listing_id)).toEqual(["RLS20059088", "RLS20060000"]);
    expect(result.total).toBe(3);
  });

  it("serializeSearchListing emits the saved-search response shape, WITHOUT media", () => {
    const serialized = serializeSearchListing(sampleListing as never);

    // `media` is deliberately absent (2026-08-13 CANONICAL-READER migration).
    // Neither consumer of this shape read it — the alert cron's formatter and
    // `listingAlertEmail` have no image field, and the execute route's `media`
    // key had zero first-party callers — so the raw legacy `Listing.media` JSON
    // blob was hydrated for up to 100 rows per request and discarded. Re-adding
    // it here would also re-admit the `media[0]` FloorPlan-hero hazard: any
    // future media on this shape must be composed via `composeDbPublicMedia`
    // from `listing_media` + the all-status `_count`, never the raw JSON.
    // See lib/search/core.ts SEARCH_RESULT_LISTING_SELECT.
    expect(Object.keys(serialized).sort()).toEqual([
      "address",
      "bathrooms_full",
      "bathrooms_half",
      "bedrooms_total",
      "borough",
      "id",
      "list_price",
      "listing_id",
      "listing_type",
      "living_area",
      "modification_timestamp",
      "neighborhood",
      "property_sub_type",
      "property_type",
      "status",
    ]);
    expect(serialized).not.toHaveProperty("media");

    // BigInt id is stringified, Decimal-shaped list_price round-trips as string.
    expect(serialized.id).toBe("1");
    expect(serialized.list_price).toBe("1850000");
  });

  it("preserves address suppression via sanitizeSearchAddress on the included listing", () => {
    const suppressedListing = {
      ...sampleListing,
      internet_address_display_yn: null, // not affirmatively true → suppressed
    };
    const serialized = serializeSearchListing(suppressedListing as never);
    const address = serialized.address as Record<string, unknown>;
    expect(address.suppressed).toBe(true);
    expect(address.label).toBe("Tribeca, New York (Address Available on Request)");
  });

  it("propagates limit, offset, and modifiedSince through to the projection query", async () => {
    const db = fakeDb([], 0);
    const since = new Date("2026-04-01T00:00:00Z");

    await runProjectionListingSearch(
      db,
      { listing_type: "sale" },
      { limit: 25, offset: 50, modifiedSince: since },
    );

    const args = db.listingSearchProjection.findMany.mock.calls[0][0];
    expect(args.take).toBe(25);
    expect(args.skip).toBe(50);
    expect(args.where.modified_at).toEqual({ gte: since });
  });
});

/**
 * PROVEN CRITERIA ON THE CANONICAL ENGINE.
 *
 * These criteria were verified against live Cotality on 2026-08-19 and are now
 * answered from the projection's DERIVED columns. The architectural rule they
 * guard: public Search, Saved Search and CMA must resolve the same user
 * question through the same engine. Evaluating them from
 * `listings.raw_data`/`features` in one reader and from the projection in
 * another is the split this consolidates.
 */
describe("criteriaToProjectionWhere — criteria proven against live Cotality", () => {
  const w = (criteria: Record<string, unknown>) => JSON.stringify(criteriaToProjectionWhere(criteria));

  it("resolves ownership through CommonInterest-derived flags, not PropertySubType", () => {
    // Live: PropertySubType Condominium/StockCooperative/Townhouse are ALL ZERO
    // in the NYC feed; ownership is carried by CommonInterest.
    expect(w({ ownershipTypes: ["Condo"] })).toContain("is_condo");
    expect(w({ ownershipTypes: ["Co-op"] })).toContain("is_coop");
    expect(w({ ownershipTypes: ["Condop"] })).toContain("is_condop");
  });

  it("accepts the casing the UI actually sends", () => {
    for (const variant of ["condo", "Condo", "CONDO", "condominium"]) {
      expect(w({ ownershipTypes: [variant] })).toContain("is_condo");
    }
    for (const variant of ["Co-op", "co-op", "COOP", "co op"]) {
      expect(w({ ownershipTypes: [variant] })).toContain("is_coop");
    }
  });

  it("fails CLOSED on an unmappable ownership value", () => {
    expect(w({ ownershipTypes: ["nonsense"] })).toContain('"in":[]');
  });

  it("filters year built on the promoted column", () => {
    expect(w({ yearBuilt: "pre-war" })).toContain('"year_built":{"lte":1946}');
    expect(w({ yearBuilt: "post-war" })).toContain('"year_built":{"gte":1947}');
    expect(w({ yearBuilt: "any" })).not.toContain("year_built");
  });

  it("reads furnished and pets from derived flags, never re-parsing provider JSON", () => {
    expect(w({ furnished: true })).toContain("is_furnished");
    expect(w({ pets: true })).toContain("is_pet_friendly");
    // A reader must not re-derive from the multi-value: "BuildingYes,No" means
    // the building permits pets and the UNIT does not.
    expect(w({ pets: true })).not.toContain("PetsAllowed");
  });

  it("matches new development by the provider boolean", () => {
    expect(w({ newDevelopment: true })).toContain('"is_new_development":true');
  });

  it("ANDs amenities against the derived keys", () => {
    const out = w({ amenities: ["elevator", "dishwasher"] });
    expect(out).toContain("amenity_keys");
    expect(out).toContain("elevator");
    expect(out).toContain("dishwasher");
  });

  it("never lets an unbacked amenity widen the result", () => {
    // `no-fee`/`renovated`/`natural-light`/`quiet` have no live provider
    // backing; ignoring one would return the whole corpus to a user who asked
    // to narrow it.
    expect(w({ amenities: ["renovated"] })).toContain('"in":[]');
  });

  it("searches keywords case-insensitively on the projected text", () => {
    const out = w({ keywords: ["Penthouse"] });
    expect(out).toContain("searchable_text");
    expect(out).toContain('"mode":"insensitive"');
  });

  it("uses the projection's FUSED bathroom total, so 1.5 needs no expansion", () => {
    // `bathrooms` is `full + half*0.5` at build time, so a 2-full/0-half unit
    // has bathrooms=2 and satisfies minBaths=1.5 naturally — the defect the
    // Listing-backed path had to expand a disjunction to avoid.
    expect(w({ minBaths: 1.5 })).toContain('"bathrooms":{"gte":1.5}');
    expect(w({ maxBaths: 1 })).toContain('"bathrooms":{"lte":1}');
  });

  it("separates SEARCH capability from ALERT eligibility", () => {
    // The engine MUST be able to execute these — gating execution on the alert
    // key list made verified criteria unrunnable rather than merely
    // un-alertable. Alerts remain conservative until the held CRM key list is
    // widened with approval. Invariant: ALERT ⊆ SEARCH, never equality.
    expect(getUnsupportedSearchCriteria({ amenities: ["elevator"] })).toEqual([]);
    expect(getUnsupportedAlertCriteria({ amenities: ["elevator"] })).toEqual(["amenities"]);
  });
});

/**
 * AMENITY AVAILABILITY TAXONOMY.
 *
 * "Cannot answer this today" has two distinct causes and they must not be
 * merged. One resolves itself when the feed changes; the other never does.
 */
describe("unavailable amenities are classified by CAUSE, not lumped together", () => {
  it("renovated is PROVIDER-SUPPORTED but currently UNPOPULATED", () => {
    // `PropertyCondition` is the correct field, its live enum carries
    // UpdatedRemodeled / UnderRenovation / Turnkey, and the sync already
    // selects it. An EXHAUSTIVE live read (8,110/8,110 Active rows, coverage
    // complete against the provider-declared count) found 0 populated.
    // If the feed ever populates it, this becomes available — so it must not
    // be recorded as a missing provider capability.
    expect(UNPOPULATED_AMENITIES.has("renovated")).toBe(true);
    expect(UNMAPPED_AMENITIES.has("renovated")).toBe(false);
  });

  it("no-fee / natural-light / quiet have NO live field at all", () => {
    // `ListingTerms` has 67 live members and includes neither NoFee nor
    // OwnerPays; the other two have no token in any live vocabulary.
    for (const key of ["no-fee", "natural-light", "quiet"]) {
      expect(UNMAPPED_AMENITIES.has(key)).toBe(true);
      expect(UNPOPULATED_AMENITIES.has(key)).toBe(false);
    }
  });

  it("both causes are unavailable today and neither may widen a result", () => {
    for (const key of [...UNPOPULATED_AMENITIES, ...UNMAPPED_AMENITIES]) {
      expect(UNSUPPORTED_AMENITIES.has(key)).toBe(true);
      expect(JSON.stringify(criteriaToProjectionWhere({ amenities: [key] }))).toContain('"in":[]');
    }
  });
});
