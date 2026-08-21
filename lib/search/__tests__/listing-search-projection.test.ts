import { Prisma } from "@prisma/client";

import {
  buildListingSearchProjectionFromListing,
  buildProjectionUpsertPayload,
  dualWriteProjectionForListingId,
  extractProjectionAmenityKeys,
  extractProjectionFeatureFlags,
  normalizeProjectionSearchText,
  type DualWriteProjectionPrisma,
  type ListingProjectionSource,
  type ListingSearchProjectionUpsertPayload,
} from "@/lib/search/listing-search-projection";
import { isMallanExclusiveListing } from "@/lib/listings/exclusive-agent-assignment";

const baseSale: ListingProjectionSource = {
  listing_id: "RLS20059088",
  status: "Active",
  listing_type: "sale",
  property_type: "Residential",
  property_sub_type: "Condominium",
  list_price: "1850000.00",
  bedrooms_total: 2,
  bathrooms_full: 2,
  bathrooms_half: 1,
  living_area: "1320.50",
  borough: "Manhattan",
  neighborhood: "Tribeca",
  city: "New York City",
  postal_code: "10013",
  rls_eligible: true,
  commercial_sub_type: null,
  idx_display_yn: true,
  internet_entire_listing_display_yn: true,
  internet_address_display_yn: true,
  participant_only: false,
  agent_id: null,
  modification_timestamp: "2026-04-29T12:00:00Z",
  address: {
    StreetNumber: "217",
    StreetDirPrefix: "W",
    StreetName: "57th Street",
    UnitNumber: "127",
    BuildingName: "The Apthorp",
    City: "New York City",
    StateOrProvince: "NY",
    Latitude: 40.7659,
    Longitude: -73.9808,
    ListingKey: "Trestle-217W57",
  },
  features: {
    PublicRemarks: "Sun-drenched corner unit with high ceilings and renovated kitchen.",
    YearBuilt: 1908,
    BuildingFeatures: "Concierge,FitnessCenter,Elevators,SteamRoom",
    InteriorFeatures: "HighCeilings,WalkInClosets,Renovated",
    Appliances: "Dishwasher,Washer,Dryer",
    Cooling: "CentralAir",
    PetsAllowed: "CatsOk",
    Furnished: "Unfurnished",
    MlsStatus: "Active",
    SourceSystem: "Trestle",
  },
  media: [
    { MediaCategory: "Photo", MediaURL: "https://cdn/x.jpg" },
    { MediaCategory: "Floor Plan", MediaURL: "https://cdn/fp.jpg" },
  ],
};

const baseRental: ListingProjectionSource = {
  ...baseSale,
  listing_id: "RLS20070000",
  listing_type: "rent",
  property_sub_type: "Apartment",
  list_price: 6500,
  bedrooms_total: 1,
  bathrooms_full: 1,
  bathrooms_half: 0,
  living_area: 720,
  features: {
    ...baseSale.features,
    Furnished: "Furnished",
    PetsAllowed: "DogsOk",
    PublicRemarks: "Sunny one-bedroom in a doorman building. Newly renovated, washer/dryer in unit.",
  },
};

describe("buildListingSearchProjectionFromListing", () => {
  it("projects a sale listing into the canonical row shape", () => {
    const row = buildListingSearchProjectionFromListing(baseSale);

    expect(row.listing_id).toBe("RLS20059088");
    expect(row.listing_type).toBe("sale");
    expect(row.property_sub_type).toBe("Condominium");
    expect(row.borough).toBe("Manhattan");
    expect(row.neighborhood).toBe("Tribeca");
    expect(row.postal_code).toBe("10013");
    expect(row.city).toBe("New York City");
    expect(row.state).toBe("NY");
    expect(row.list_price).toBe(BigInt(1850000));
    expect(row.bedrooms).toBe(2);
    expect(row.bathrooms).toBe(2.5); // 2 full + 1 half
    expect(row.living_area).toBe(1320.5);
    expect(row.year_built).toBe(1908);
    expect(row.latitude).toBe(40.7659);
    expect(row.longitude).toBe(-73.9808);
    expect(row.is_rental).toBe(false);
    expect(row.is_commercial).toBe(false);
    expect(row.is_new_development).toBe(false);
    expect(row.is_exclusive).toBe(false);
    expect(row.rls_eligible).toBe(true);
    expect(row.modified_at).toEqual(new Date("2026-04-29T12:00:00Z"));
    expect(row.listing_key).toBe("Trestle-217W57");
    expect(row.source_system).toBe("Trestle");
    expect(row.mls_status).toBe("Active");
  });

  it("projects a rental listing with the correct flags and bath math", () => {
    const row = buildListingSearchProjectionFromListing(baseRental);

    expect(row.listing_type).toBe("rent");
    expect(row.is_rental).toBe(true);
    expect(row.list_price).toBe(BigInt(6500));
    expect(row.bedrooms).toBe(1);
    expect(row.bathrooms).toBe(1); // 1 full + 0 half
    expect(row.living_area).toBe(720);
    expect(row.feature_flags?.is_furnished).toBe(true);
    expect(row.feature_flags?.is_pet_friendly).toBe(true);
  });

  it("preserves fail-closed permission fields verbatim (nullable, never coerced)", () => {
    const row = buildListingSearchProjectionFromListing({
      ...baseSale,
      idx_display_yn: null,
      internet_entire_listing_display_yn: null,
      internet_address_display_yn: null,
      participant_only: null,
      rls_eligible: null,
    });

    // Every gate input was null — projection mirrors null without inventing a
    // truthy default. rls_eligible defaults to true only when the source is
    // strictly false (mirrors the column default in the schema).
    expect(row.idx_display_yn).toBeNull();
    expect(row.internet_entire_listing_display_yn).toBeNull();
    expect(row.internet_address_display_yn).toBeNull();
    expect(row.participant_only_yn).toBeNull();
    expect(row.rls_eligible).toBe(true);

    // And the fail-closed false case round-trips without mutation.
    const closed = buildListingSearchProjectionFromListing({
      ...baseSale,
      idx_display_yn: false,
      internet_entire_listing_display_yn: false,
      internet_address_display_yn: false,
      participant_only: true,
      rls_eligible: false,
    });
    expect(closed.idx_display_yn).toBe(false);
    expect(closed.internet_entire_listing_display_yn).toBe(false);
    expect(closed.internet_address_display_yn).toBe(false);
    expect(closed.participant_only_yn).toBe(true);
    expect(closed.rls_eligible).toBe(false);
  });
});

describe("normalizeProjectionSearchText", () => {
  it("lowercases and joins PublicRemarks, address parts, and neighborhood", () => {
    const text = normalizeProjectionSearchText(baseSale);
    expect(text).toContain("sun-drenched corner unit");
    expect(text).toContain("217");
    expect(text).toContain("57th street");
    expect(text).toContain("the apthorp");
    expect(text).toContain("tribeca");
    expect(text).toContain("new york city");
    // Whitespace is collapsed to single spaces.
    expect(text).not.toMatch(/\s{2,}/);
  });

  it("returns null when no source field is populated", () => {
    expect(
      normalizeProjectionSearchText({
        listing_id: "X",
        address: {},
        features: {},
      }),
    ).toBeNull();
  });
});

describe("extractProjectionAmenityKeys", () => {
  it("returns the canonical amenity keys that match the features JSON", () => {
    const keys = extractProjectionAmenityKeys(baseSale);
    // SEMANTIC LEAK GUARD. The fixture carries `Concierge`, which matches the
    // `doorman` token list mechanically. Deriving `doorman` would launder an
    // unproven equivalence into the projection, where Search, Saved Search,
    // alerts, CMA and reports would all subsequently treat it as established.
    //
    // The observation is preserved; only the CONCLUSION is withheld.
    expect(keys).not.toContain("doorman");
    expect(keys).toContain("concierge-present");
    expect(keys).toContain("gym");
    expect(keys).toContain("elevator");
    expect(keys).toContain("steam-room");
    expect(keys).toContain("walk-in-closet");
    expect(keys).toContain("high-ceilings");
    expect(keys).toContain("dishwasher");
    expect(keys).toContain("washer-dryer");
    expect(keys).toContain("central-air");
    expect(keys).toContain("pet-friendly"); // CatsOk is an affirmative UNIT token
    // `renovated` has NO live provider backing. `PropertyCondition` is the
    // correct field and DOES carry UpdatedRemodeled / UnderRenovation / Turnkey
    // as enum members, but it is populated 0/500 on live Active listings, so no
    // renovation filter can be answered today. It must not be derived from a
    // substring of InteriorFeatures, whose 45-token live vocabulary has no
    // renovation token at all.
    expect(keys).not.toContain("renovated");
  });

  it("returns null when features is missing", () => {
    expect(
      extractProjectionAmenityKeys({
        listing_id: "X",
      }),
    ).toBeNull();
  });

  it("does not flag pet-friendly when PetsAllowed is exactly 'No'", () => {
    const keys = extractProjectionAmenityKeys({
      listing_id: "X",
      features: { PetsAllowed: "No" },
    });
    expect(keys ?? []).not.toContain("pet-friendly");
  });
});

describe("extractProjectionFeatureFlags", () => {
  it("derives media + features flags", () => {
    const flags = extractProjectionFeatureFlags(baseSale);
    expect(flags?.has_floorplan).toBe(true);
    expect(flags?.has_video).toBe(false);
    expect(flags?.has_virtual_tour).toBe(false);
    expect(flags?.is_furnished).toBe(false);
    expect(flags?.is_pet_friendly).toBe(true); // CatsOk
  });

  it("returns null when both features and media are absent", () => {
    expect(
      extractProjectionFeatureFlags({
        listing_id: "X",
      }),
    ).toBeNull();
  });

  it("flags is_pet_friendly false when features.PetsAllowed is 'No'", () => {
    const flags = extractProjectionFeatureFlags({
      listing_id: "X",
      features: { PetsAllowed: "No" },
    });
    expect(flags?.is_pet_friendly).toBe(false);
  });
});

describe("extractProjectionFeatureFlags — canonical listing_media migration", () => {
  // The media flags now derive from the distinct `media_type` values of the
  // listing's ACTIVE `listing_media` rows. Live production values are exactly
  // Photo | FloorPlan | VirtualTour | Video (DB census 2026-08-13). 6,978
  // displayable listings have canonical rows but an EMPTY legacy media JSON —
  // the legacy derivation reported no floorplan/video/tour for all of them.

  it("derives has_floorplan from a canonical FloorPlan row", () => {
    const flags = extractProjectionFeatureFlags({
      listing_id: "RLS1",
      mediaTypes: ["Photo", "FloorPlan"],
    });
    expect(flags?.has_floorplan).toBe(true);
    expect(flags?.has_video).toBe(false);
    expect(flags?.has_virtual_tour).toBe(false);
  });

  it("derives has_video from a canonical Video row", () => {
    const flags = extractProjectionFeatureFlags({
      listing_id: "RLS2",
      mediaTypes: ["Photo", "Video"],
    });
    expect(flags?.has_video).toBe(true);
    expect(flags?.has_floorplan).toBe(false);
    expect(flags?.has_virtual_tour).toBe(false);
  });

  it("derives has_virtual_tour from a canonical VirtualTour row", () => {
    // Cotality MediaCategory carries both BrandedVirtualTour and
    // UnbrandedVirtualTour; classifyTrestleMediaCategory
    // (lib/media/media-sync-service.ts:142) folds both to "VirtualTour"
    // before the row is written, so the projection only ever sees the
    // canonical token.
    const flags = extractProjectionFeatureFlags({
      listing_id: "RLS3",
      mediaTypes: ["Photo", "VirtualTour"],
    });
    expect(flags?.has_virtual_tour).toBe(true);
    expect(flags?.has_floorplan).toBe(false);
    expect(flags?.has_video).toBe(false);
  });

  it("sets ALL THREE flags when the canonical set carries every media type", () => {
    const flags = extractProjectionFeatureFlags({
      listing_id: "RLS4",
      mediaTypes: ["Photo", "FloorPlan", "VirtualTour", "Video"],
    });
    expect(flags?.has_floorplan).toBe(true);
    expect(flags?.has_video).toBe(true);
    expect(flags?.has_virtual_tour).toBe(true);
  });

  it("matches canonical media types case-insensitively", () => {
    const flags = extractProjectionFeatureFlags({
      listing_id: "RLS5",
      mediaTypes: ["floorplan", "VIRTUALTOUR", "video"],
    });
    expect(flags?.has_floorplan).toBe(true);
    expect(flags?.has_virtual_tour).toBe(true);
    expect(flags?.has_video).toBe(true);
  });

  // ── EMPTY canonical set is AMBIGUOUS on its own ────────────────────────────
  // It means either "every row was deleted" (authoritative) or "no row was ever
  // imported" (the legacy JSON is still the only source). Only the ALL-STATUS
  // signal separates them, so these three cases must diverge.

  it("EMPTY canonical + rows EXISTED -> authoritative deletion, flags false", () => {
    // hadRelationalRows: true means listing_media rows exist(ed) for this
    // listing and none are active now. That is a definitive "no media", so the
    // stale legacy JSON must NOT be consulted.
    const flags = extractProjectionFeatureFlags({
      ...baseSale,
      mediaTypes: [],
      hadRelationalRows: true,
    });
    expect(flags?.has_floorplan).toBe(false);
    expect(flags?.has_video).toBe(false);
    expect(flags?.has_virtual_tour).toBe(false);
    // Non-media flags are untouched by the media precedence rule.
    expect(flags?.is_pet_friendly).toBe(true);
    expect(flags?.is_furnished).toBe(false);
  });

  it("EMPTY canonical + NEVER imported -> legacy JSON still governs", () => {
    // The 97-listing residual: displayable, legacy media JSON populated, ZERO
    // listing_media rows, and a source PhotosChangeTimestamp below the live
    // media cursor so the forward-only lane can never import them
    // (docs/audits/listing-media-reader-ownership-2026-08-13.md §4.1). Treating
    // their empty active set as authoritative would silently clear the flags for
    // that entire class until bounded recovery runs.
    const flags = extractProjectionFeatureFlags({
      ...baseSale,
      mediaTypes: [],
      hadRelationalRows: false,
    });
    expect(flags?.has_floorplan).toBe(true); // from the legacy JSON "Floor Plan"
  });

  it("EMPTY canonical + UNKNOWN existence -> fails closed for Mallan-owned media", () => {
    // rls_eligible === false marks a Mallan-owned listing. With existence
    // unknown, resurrecting its legacy JSON could republish photos the agent
    // deleted, so the canonical (empty) answer stands. Third-party listings
    // keep falling back, because their JSON is Cotality-sourced.
    const mallan = extractProjectionFeatureFlags({
      ...baseSale,
      listing_id: "SL-0007",
      rls_eligible: false,
      mediaTypes: [],
      hadRelationalRows: undefined,
    });
    expect(mallan?.has_floorplan).toBe(false);

    const thirdParty = extractProjectionFeatureFlags({
      ...baseSale,
      mediaTypes: [],
      hadRelationalRows: undefined,
    });
    expect(thirdParty?.has_floorplan).toBe(true);
  });

  it("NON-EMPTY canonical wins outright regardless of the existence signal", () => {
    for (const hadRelationalRows of [true, false, undefined]) {
      const flags = extractProjectionFeatureFlags({
        ...baseSale,
        mediaTypes: ["Video"],
        hadRelationalRows,
      });
      expect(flags?.has_video).toBe(true);
      // The legacy JSON's floor plan is NOT consulted once canonical rows exist.
      expect(flags?.has_floorplan).toBe(false);
    }
  });

  it("falls back to the legacy JSON when mediaTypes is undefined (un-migrated caller)", () => {
    const flags = extractProjectionFeatureFlags(baseSale);
    expect(flags?.has_floorplan).toBe(true); // from media[].MediaCategory "Floor Plan"
    expect(flags?.has_video).toBe(false);
    expect(flags?.has_virtual_tour).toBe(false);
  });

  it("falls back to the legacy JSON when mediaTypes is null", () => {
    const flags = extractProjectionFeatureFlags({ ...baseSale, mediaTypes: null });
    expect(flags?.has_floorplan).toBe(true);
  });

  it("canonical set OVERRIDES a disagreeing legacy JSON in both directions", () => {
    // JSON says floorplan-only, canonical says video-only. Canonical wins.
    const flags = extractProjectionFeatureFlags({
      ...baseSale,
      mediaTypes: ["Photo", "Video"],
    });
    expect(flags?.has_floorplan).toBe(false);
    expect(flags?.has_video).toBe(true);
  });

  it("flows through buildListingSearchProjectionFromListing into feature_flags", () => {
    const row = buildListingSearchProjectionFromListing({
      ...baseSale,
      mediaTypes: ["Photo", "FloorPlan", "Video"],
    });
    expect(row.feature_flags?.has_floorplan).toBe(true);
    expect(row.feature_flags?.has_video).toBe(true);
    expect(row.feature_flags?.has_virtual_tour).toBe(false);
  });
});

describe("dualWriteProjectionForListingId — canonical listing_media wiring", () => {
  function mockPrisma(listingRow: Record<string, unknown> | null) {
    const listingFindUnique = jest.fn(async () => listingRow);
    const upsert = jest.fn(async () => ({}));
    const prisma = {
      listing: { findUnique: listingFindUnique },
      listingSearchProjection: {
        findUnique: jest.fn(async () => null), // no existing row → upsert always fires
        upsert,
      },
    } as unknown as DualWriteProjectionPrisma;
    return { prisma, listingFindUnique, upsert };
  }

  const listingRowBase = {
    listing_id: "RLS20059088",
    status: "Active",
    listing_type: "sale",
    address: {},
    features: { PublicRemarks: "Bright corner unit." },
    // Legacy JSON is EMPTY — the exact shape of the 6,978 rows this
    // migration fixes.
    media: [],
  };

  it("selects the ACTIVE listing_media media_type values on the SAME round-trip", async () => {
    const { prisma, listingFindUnique } = mockPrisma({
      ...listingRowBase,
      listing_media: [{ media_type: "FloorPlan" }],
    });
    await dualWriteProjectionForListingId(prisma, "RLS20059088");

    expect(listingFindUnique).toHaveBeenCalledTimes(1); // no second round-trip
    const args = listingFindUnique.mock.calls[0][0] as {
      select: Record<string, unknown>;
    };
    expect(args.select.listing_media).toEqual({
      where: { status: "active" },
      select: { media_type: true },
      distinct: ["media_type"],
    });
    // The legacy column stays selected for the un-migrated fallback path.
    expect(args.select.media).toBe(true);
  });

  it("writes has_floorplan=true from canonical rows even when the legacy media JSON is empty", async () => {
    const { prisma, upsert } = mockPrisma({
      ...listingRowBase,
      listing_media: [{ media_type: "FloorPlan" }, { media_type: "VirtualTour" }],
    });
    await dualWriteProjectionForListingId(prisma, "RLS20059088");

    expect(upsert).toHaveBeenCalledTimes(1);
    const create = (upsert.mock.calls[0][0] as ListingSearchProjectionUpsertPayload)
      .create as unknown as Record<string, unknown>;
    const featureFlags = create.feature_flags as Record<string, boolean>;
    expect(featureFlags.has_floorplan).toBe(true);
    expect(featureFlags.has_virtual_tour).toBe(true);
    expect(featureFlags.has_video).toBe(false);
  });

  it("keeps the legacy JSON derivation when the relation is absent from the result", async () => {
    // A mock/older client that does not return `listing_media` must not be
    // read as "zero active rows" — absent means "not queried".
    const { prisma, upsert } = mockPrisma({
      ...listingRowBase,
      media: [{ MediaCategory: "FloorPlan", MediaURL: "https://cdn/fp.jpg" }],
    });
    await dualWriteProjectionForListingId(prisma, "RLS20059088");

    const create = (upsert.mock.calls[0][0] as ListingSearchProjectionUpsertPayload)
      .create as unknown as Record<string, unknown>;
    expect((create.feature_flags as Record<string, boolean>).has_floorplan).toBe(true);
  });
});

describe("commercial / new-development / exclusive / rental flags", () => {
  it("flags commercial when commercial_sub_type is set", () => {
    const row = buildListingSearchProjectionFromListing({
      ...baseSale,
      property_sub_type: null,
      commercial_sub_type: "RetailStore",
    });
    expect(row.is_commercial).toBe(true);
  });

  it("flags commercial when property_sub_type is in the commercial set", () => {
    for (const subType of ["Office", "Retail", "Industrial", "MixedUse", "Warehouse"]) {
      const row = buildListingSearchProjectionFromListing({
        ...baseSale,
        property_sub_type: subType,
        commercial_sub_type: null,
      });
      expect(row.is_commercial).toBe(true);
    }
  });

  it("flags new-development from the NewConstructionYN boolean", () => {
    // Live-verified: `NewConstructionYN` is a Boolean Property field, true on
    // 950 live Active listings.
    const row = buildListingSearchProjectionFromListing({
      ...baseSale,
      features: { ...(baseSale.features ?? {}), NewConstructionYN: true },
    });
    expect(row.is_new_development).toBe(true);
  });

  it("does NOT flag new-development from a PropertySubType that cannot exist", () => {
    // The previous derivation matched `property_sub_type` against
    // "NewConstruction" / "New Construction". NEITHER is a member of the live
    // PropertySubType enum — the provider answers $filter on them with HTTP 400
    // — so the flag was false for every listing ever projected and
    // sort=new-development returned nothing.
    const row = buildListingSearchProjectionFromListing({
      ...baseSale,
      property_sub_type: "NewConstruction",
    });
    expect(row.is_new_development).toBe(false);
  });

  it("reads NewConstructionYN from raw_data when features lacks it", () => {
    const row = buildListingSearchProjectionFromListing({
      ...baseSale,
      raw_data: { NewConstructionYN: true },
    });
    expect(row.is_new_development).toBe(true);
  });

  it("flags exclusive by the Mallan-exclusive rule, never by agent_id presence", () => {
    // baseSale is a third-party RLS row (listing_id "RLS…", rls_eligible true).
    // Stamping agent_id on it (as syncAgentHistory does for IDX rows) must NOT
    // make it a Mallan exclusive.
    const thirdPartyWithAgent = buildListingSearchProjectionFromListing({
      ...baseSale,
      agent_id: BigInt(42),
    });
    expect(thirdPartyWithAgent.is_exclusive).toBe(false);

    // A genuine Mallan exclusive (SL- prefix) is exclusive even with no agent_id.
    const crmExclusive = buildListingSearchProjectionFromListing({
      ...baseSale,
      listing_id: "SL-0004",
      agent_id: null,
    });
    expect(crmExclusive.is_exclusive).toBe(true);
  });

  it("flags rental purely from listing_type === 'rent'", () => {
    const sale = buildListingSearchProjectionFromListing({ ...baseSale, listing_type: "sale" });
    expect(sale.is_rental).toBe(false);
    const rent = buildListingSearchProjectionFromListing({ ...baseSale, listing_type: "rent" });
    expect(rent.is_rental).toBe(true);
  });
});

describe("is_exclusive derivation — canonical isMallanExclusiveListing() rule (F13)", () => {
  // The projection's is_exclusive must mean "Mallan-authored exclusive", i.e.
  // listing_id SL-/RL- prefix OR rls_eligible === false. It must NOT be derived
  // from agent_id, because syncAgentHistory stamps agent_id onto third-party
  // IDX rows — using agent_id mislabels them and (PR 5B parity) would drop the
  // required RLS courtesy/disclaimer on third-party rows.

  it("does NOT flag a third-party RLS listing as exclusive even when agent_id is set", () => {
    const row = buildListingSearchProjectionFromListing({
      ...baseSale, // listing_id "RLS20059088", rls_eligible: true
      agent_id: BigInt(42),
    });
    expect(row.is_exclusive).toBe(false);
  });

  it("flags an SL- listing as exclusive (CRM sale exclusive)", () => {
    const row = buildListingSearchProjectionFromListing({
      ...baseSale,
      listing_id: "SL-0004",
      agent_id: null,
    });
    expect(row.is_exclusive).toBe(true);
  });

  it("flags an RL- listing as exclusive (CRM rental exclusive)", () => {
    const row = buildListingSearchProjectionFromListing({
      ...baseRental,
      listing_id: "RL-0012",
      agent_id: null,
    });
    expect(row.is_exclusive).toBe(true);
  });

  it("flags a website-only (rls_eligible === false) manual listing as exclusive", () => {
    const row = buildListingSearchProjectionFromListing({
      ...baseSale,
      listing_id: "WEBONLY-1", // no SL-/RL- prefix
      rls_eligible: false,
      agent_id: null,
    });
    expect(row.is_exclusive).toBe(true);
  });

  it("never flags exclusive merely because agent_id is present", () => {
    const withAgent = buildListingSearchProjectionFromListing({
      ...baseSale,
      listing_id: "RLS20059088",
      rls_eligible: true,
      agent_id: BigInt(7),
    });
    const withoutAgent = buildListingSearchProjectionFromListing({
      ...baseSale,
      listing_id: "RLS20059088",
      rls_eligible: true,
      agent_id: null,
    });
    expect(withAgent.is_exclusive).toBe(false);
    expect(withoutAgent.is_exclusive).toBe(false);
  });

  it("matches isMallanExclusiveListing() for every fixture (builder parity)", () => {
    const fixtures: ListingProjectionSource[] = [
      { ...baseSale, listing_id: "RLS20059088", rls_eligible: true, agent_id: BigInt(42) }, // third-party + agent → false
      { ...baseSale, listing_id: "SL-0004", agent_id: null }, // SL- → true
      { ...baseRental, listing_id: "RL-0012", agent_id: null }, // RL- → true
      { ...baseSale, listing_id: "WEBONLY-1", rls_eligible: false, agent_id: null }, // website-only → true
      { ...baseSale, listing_id: "RLS20070001", rls_eligible: true, agent_id: null }, // third-party, no agent → false
    ];
    for (const fixture of fixtures) {
      const row = buildListingSearchProjectionFromListing(fixture);
      expect(row.is_exclusive).toBe(
        isMallanExclusiveListing({
          listing_id: fixture.listing_id,
          rls_eligible: fixture.rls_eligible,
        }),
      );
    }
  });
});

describe("buildProjectionUpsertPayload (PR 5B dual-write)", () => {
  it("produces a Prisma upsert payload whose create branch carries every column", () => {
    const projection = buildListingSearchProjectionFromListing(baseSale);
    const payload = buildProjectionUpsertPayload(projection);

    expect(payload.where).toEqual({ listing_id: "RLS20059088" });

    const createData = payload.create as Record<string, unknown>;
    expect(createData.listing_id).toBe("RLS20059088");
    expect(createData.listing_type).toBe("sale");
    expect(createData.borough).toBe("Manhattan");
    expect(createData.list_price).toBe(BigInt(1850000));
    expect(createData.bedrooms).toBe(2);
    expect(createData.bathrooms).toBe(2.5);
    expect(createData.living_area).toBe(1320.5);
    expect(createData.is_rental).toBe(false);
    expect(createData.is_exclusive).toBe(false);
    expect(createData.is_commercial).toBe(false);
    expect(createData.is_new_development).toBe(false);
    expect(createData.rls_eligible).toBe(true);
    expect(createData.modified_at).toEqual(new Date("2026-04-29T12:00:00Z"));
  });

  it("uses the same data on the update branch (idempotent overwrite)", () => {
    const projection = buildListingSearchProjectionFromListing(baseSale);
    const payload = buildProjectionUpsertPayload(projection);

    // Every key in `create` must appear in `update` with the same value —
    // a projection is fully determined by the source Listing, so re-syncing
    // overwrites every column rather than diff-merging.
    const create = payload.create as Record<string, unknown>;
    const update = payload.update as Record<string, unknown>;
    for (const key of Object.keys(create)) {
      expect(update[key]).toEqual(create[key]);
    }
  });

  it("preserves null permission inputs as Prisma SQL-null on the JSON columns and bare null on scalars", () => {
    const projection = buildListingSearchProjectionFromListing({
      ...baseSale,
      idx_display_yn: null,
      internet_entire_listing_display_yn: null,
      internet_address_display_yn: null,
      participant_only: null,
      // Strip features + media so the JSON columns must serialize as null.
      address: {},
      features: undefined,
      media: undefined,
    });
    const payload = buildProjectionUpsertPayload(projection);

    const create = payload.create as Record<string, unknown>;
    expect(create.idx_display_yn).toBeNull();
    expect(create.internet_entire_listing_display_yn).toBeNull();
    expect(create.internet_address_display_yn).toBeNull();
    expect(create.participant_only_yn).toBeNull();
    // Nullable Json columns must use Prisma.JsonNull for SQL NULL — bare
    // null is rejected by strict Prisma types on a `Json?` field.
    expect(create.amenity_keys).toBe(Prisma.JsonNull);
    expect(create.feature_flags).toBe(Prisma.JsonNull);
  });

  it("preserves false permission inputs verbatim through the payload", () => {
    const projection = buildListingSearchProjectionFromListing({
      ...baseSale,
      idx_display_yn: false,
      internet_entire_listing_display_yn: false,
      internet_address_display_yn: false,
      participant_only: true,
      rls_eligible: false,
    });
    const payload = buildProjectionUpsertPayload(projection);

    const create = payload.create as Record<string, unknown>;
    expect(create.idx_display_yn).toBe(false);
    expect(create.internet_entire_listing_display_yn).toBe(false);
    expect(create.internet_address_display_yn).toBe(false);
    expect(create.participant_only_yn).toBe(true);
    expect(create.rls_eligible).toBe(false);
  });
});
