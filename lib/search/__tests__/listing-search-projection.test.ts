import { Prisma } from "@prisma/client";

import {
  buildListingSearchProjectionFromListing,
  buildProjectionUpsertPayload,
  extractProjectionAmenityKeys,
  extractProjectionFeatureFlags,
  normalizeProjectionSearchText,
  type ListingProjectionSource,
} from "@/lib/search/listing-search-projection";

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
    expect(keys).toContain("doorman");
    expect(keys).toContain("gym");
    expect(keys).toContain("elevator");
    expect(keys).toContain("steam-room");
    expect(keys).toContain("walk-in-closet");
    expect(keys).toContain("high-ceilings");
    expect(keys).toContain("dishwasher");
    expect(keys).toContain("washer-dryer");
    expect(keys).toContain("central-air");
    expect(keys).toContain("renovated");
    expect(keys).toContain("pet-friendly"); // CatsOk satisfies pet-friendly
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

  it("flags new-development when property_sub_type is NewConstruction", () => {
    const row = buildListingSearchProjectionFromListing({
      ...baseSale,
      property_sub_type: "NewConstruction",
    });
    expect(row.is_new_development).toBe(true);
  });

  it("flags exclusive when agent_id is set (regardless of rls_eligible)", () => {
    const exclusive = buildListingSearchProjectionFromListing({
      ...baseSale,
      agent_id: BigInt(42),
    });
    expect(exclusive.is_exclusive).toBe(true);

    const notExclusive = buildListingSearchProjectionFromListing({
      ...baseSale,
      agent_id: null,
    });
    expect(notExclusive.is_exclusive).toBe(false);
  });

  it("flags rental purely from listing_type === 'rent'", () => {
    const sale = buildListingSearchProjectionFromListing({ ...baseSale, listing_type: "sale" });
    expect(sale.is_rental).toBe(false);
    const rent = buildListingSearchProjectionFromListing({ ...baseSale, listing_type: "rent" });
    expect(rent.is_rental).toBe(true);
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
