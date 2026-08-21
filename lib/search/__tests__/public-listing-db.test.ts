import {
  applyPublicListingPostFilters,
  buildPublicListingDbSearch,
} from "@/lib/search/public-listing-db";

describe("buildPublicListingDbSearch", () => {
  it("applies the shared fail-closed RLS gate while preserving website-only path", () => {
    const { where, orderBy } = buildPublicListingDbSearch(new URLSearchParams("type=sale"));

    expect(where).toMatchObject({
      status: { in: ["Active", "ActiveUnderContract", "ComingSoon"] },
      listing_type: "sale",
      OR: [
        {
          rls_eligible: true,
          idx_display_yn: true,
          owner_opt_out: false,
          participant_only: false,
          internet_entire_listing_display_yn: true,
        },
        { rls_eligible: false },
      ],
    });
    expect(orderBy).toEqual({ list_price: "desc" });
  });

  it("translates public filter params into DB filters", () => {
    const { where, orderBy } = buildPublicListingDbSearch(new URLSearchParams({
      minPrice: "1000000",
      maxPrice: "2000000",
      beds: "2",
      maxBeds: "4",
      minBaths: "1.5",
      maxBaths: "3",
      minSqft: "900",
      maxSqft: "1800",
      borough: "Manhattan",
      zipCodes: "10021,10022",
      statuses: "Active,Closed,ComingSoon",
      propertySubTypes: "Co-op,New Development",
      sort: "newest",
    }));

    expect(where.list_price).toEqual({ gte: 1000000, lte: 2000000 });
    expect(where.bedrooms_total).toEqual({ gte: 2, lte: 4 });
    expect(where.bathrooms_full).toEqual({ gte: 1, lte: 3 });
    expect(where.bathrooms_half).toEqual({ gte: 1 });
    expect(where.living_area).toEqual({ gte: 900, lte: 1800 });
    expect(where.borough).toEqual({ contains: "Manhattan", mode: "insensitive" });
    expect(where.postal_code).toEqual({ in: ["10021", "10022"] });
    expect(where.status).toEqual({ in: ["Active", "ComingSoon"] });
    expect(where.property_sub_type).toEqual({
      in: ["StockCooperative", "NewConstruction", "New Construction"],
    });
    expect(orderBy).toEqual({ listing_contract_date: "desc" });
  });

  it("pushes address search into JSON conditions so pagination remains DB-backed", () => {
    const { where } = buildPublicListingDbSearch(new URLSearchParams("address=400 East 90th Street"));

    // PR #106 (audit-fix A · Fix 2) wrapped each address segment in an
    // OR-of-{PascalCase, camelCase} for defensive dual-key support. The
    // production DB stores PascalCase (21,983/21,983 rows verified); the
    // camelCase branch is inert today but prevents the audit's claimed
    // failure mode if a future writer ever skews shape. The assertion
    // checks both branches survive in each OR member.
    expect(where.AND).toEqual(expect.arrayContaining([
      {
        OR: expect.arrayContaining([
          { address: { path: ["StreetNumber"], equals: "400" } },
          { address: { path: ["streetNumber"], equals: "400" } },
        ]),
      },
      {
        OR: expect.arrayContaining([
          { address: { path: ["StreetName"], string_contains: "90" } },
          { address: { path: ["streetName"], string_contains: "90" } },
        ]),
      },
    ]));
  });

  it("applies special public sorts with their required filters", () => {
    const exclusives = buildPublicListingDbSearch(new URLSearchParams("sort=exclusives"));
    expect(exclusives.where.agent_id).toEqual({ not: null });
    expect(exclusives.orderBy).toEqual({ modification_timestamp: "desc" });

    const newDev = buildPublicListingDbSearch(new URLSearchParams("sort=new-development"));
    expect(newDev.where.property_sub_type).toEqual({ in: ["NewConstruction", "New Construction"] });
    expect(newDev.orderBy).toEqual({ modification_timestamp: "desc" });
  });

  it("restricts exclusive=mallan to TRUE Mallan exclusives (SL-/RL- or website-only), never agent_id", () => {
    // Requirement: the homepage exclusives feed must be provably Mallan-only.
    // syncAgentHistory stamps agent_id onto THIRD-PARTY (buyer-side) Trestle rows
    // (lib/idx/fetch.ts:427 matches BuyerAgentMlsId), so agent_id != null is unsafe.
    const { where } = buildPublicListingDbSearch(
      new URLSearchParams("type=sale&exclusive=mallan"),
    );

    // Identity is an AND-ed OR over the robust CRM/website-only signal.
    expect(where.AND).toEqual(
      expect.arrayContaining([
        {
          OR: [
            { listing_id: { startsWith: "SL-" } },
            { listing_id: { startsWith: "RL-" } },
            { rls_eligible: false },
          ],
        },
      ]),
    );
    // It must NOT fall back to agent_id (which can be set on third-party IDX rows).
    expect(where.agent_id).toBeUndefined();
  });

  it("keeps the general-feed minBeds floor (third-party studios excluded)", () => {
    // The general Featured feed passes beds=1 (minBeds); a 0-bed third-party
    // studio is filtered out at the DB by bedrooms_total >= 1.
    const { where } = buildPublicListingDbSearch(
      new URLSearchParams("type=sale&beds=1"),
    );
    expect(where.bedrooms_total).toEqual({ gte: 1 });
  });
});

describe("applyPublicListingPostFilters", () => {
  type Listing = {
    id: string;
    propertyType?: string | null;
    yearBuilt?: number | null;
    furnished?: string | null;
    petsAllowed?: string | null;
    publicRemarks?: string | null;
    interiorFeatures?: string | null;
    appliances?: string | null;
  };

  const listings: Listing[] = [
    {
      id: "a",
      propertyType: "Condo",
      yearBuilt: 1920,
      furnished: "Furnished",
      petsAllowed: "CatsOk",
      publicRemarks: "Sun-drenched corner unit with high floor and southern exposure",
      interiorFeatures: "HighCeilings, NaturalLight",
      appliances: "Dishwasher, Washer",
    },
    {
      id: "b",
      propertyType: "Condop",
      yearBuilt: 1965,
      furnished: "Unfurnished",
      petsAllowed: "No",
      publicRemarks: "Renovated quiet rear-facing studio in a postwar building",
      interiorFeatures: "Renovated",
      appliances: "Dishwasher",
    },
    {
      id: "c",
      propertyType: "Co-op",
      yearBuilt: 1972,
      furnished: null,
      petsAllowed: null,
      publicRemarks: "Renovated kitchen, oversized windows, washer dryer in unit",
      interiorFeatures: null,
      appliances: null,
    },
  ];

  const featuresById = new Map<string, Record<string, unknown>>([
    ["a", { PublicRemarks: listings[0].publicRemarks, InteriorFeatures: "HighCeilings,NaturalLight", Appliances: "Dishwasher,Washer", PetsAllowed: "CatsOk" }],
    ["b", { PublicRemarks: listings[1].publicRemarks, InteriorFeatures: "Renovated", Appliances: "Dishwasher", PetsAllowed: "No" }],
    ["c", { PublicRemarks: listings[2].publicRemarks, Appliances: "WasherDryer" }],
  ]);

  it("returns the input list unchanged when no filter params are supplied", () => {
    const result = applyPublicListingPostFilters(listings, featuresById, new URLSearchParams());
    expect(result).toHaveLength(3);
    expect(result.map((l) => l.id)).toEqual(["a", "b", "c"]);
  });

  it("filters by ownershipTypes using DTO propertyType substring rules", () => {
    const result = applyPublicListingPostFilters(
      listings,
      featuresById,
      new URLSearchParams("ownershipTypes=Co-op"),
    );
    expect(result.map((l) => l.id)).toEqual(["c"]);

    // Condo MUST NOT match Condop, per the existing inline filter behavior.
    const condoOnly = applyPublicListingPostFilters(
      listings,
      featuresById,
      new URLSearchParams("ownershipTypes=Condo"),
    );
    expect(condoOnly.map((l) => l.id)).toEqual(["a"]);
  });

  it("filters by yearBuilt pre-war and post-war using the same threshold as Trestle", () => {
    const preWar = applyPublicListingPostFilters(
      listings,
      featuresById,
      new URLSearchParams("yearBuilt=pre-war"),
    );
    expect(preWar.map((l) => l.id)).toEqual(["a"]);

    const postWar = applyPublicListingPostFilters(
      listings,
      featuresById,
      new URLSearchParams("yearBuilt=post-war"),
    );
    expect(postWar.map((l) => l.id)).toEqual(["b", "c"]);
  });

  it("filters by furnished only when the DTO value matches Furnished", () => {
    const result = applyPublicListingPostFilters(
      listings,
      featuresById,
      new URLSearchParams("furnished=true"),
    );
    expect(result.map((l) => l.id)).toEqual(["a"]);
  });

  it("ANDs amenity filters across DTO + features JSON, with pet-friendly handling negative values", () => {
    const dishwasher = applyPublicListingPostFilters(
      listings,
      featuresById,
      new URLSearchParams("amenities=dishwasher"),
    );
    expect(dishwasher.map((l) => l.id)).toEqual(["a", "b"]);

    // pet-friendly excludes "No" but includes CatsOk / DogsOk / null falls through.
    const petFriendly = applyPublicListingPostFilters(
      listings,
      featuresById,
      new URLSearchParams("amenities=pet-friendly"),
    );
    expect(petFriendly.map((l) => l.id)).toEqual(["a"]);

    // AND logic across multiple amenities.
    const dishAndRenovated = applyPublicListingPostFilters(
      listings,
      featuresById,
      new URLSearchParams("amenities=dishwasher,renovated"),
    );
    expect(dishAndRenovated.map((l) => l.id)).toEqual(["b"]);
  });

  it("ANDs keyword search across PublicRemarks substring (case-insensitive)", () => {
    const single = applyPublicListingPostFilters(
      listings,
      featuresById,
      new URLSearchParams("keywords=renovated"),
    );
    expect(single.map((l) => l.id)).toEqual(["b", "c"]);

    const both = applyPublicListingPostFilters(
      listings,
      featuresById,
      new URLSearchParams("keywords=renovated,washer"),
    );
    expect(both.map((l) => l.id)).toEqual(["c"]);
  });

  it("does not throw when a listing has no features map entry", () => {
    const sparse = new Map<string, Record<string, unknown>>();
    const result = applyPublicListingPostFilters(
      listings,
      sparse,
      new URLSearchParams("keywords=renovated"),
    );
    // Falls back to listing.publicRemarks when the features map is empty.
    expect(result.map((l) => l.id)).toEqual(["b", "c"]);
  });
});
