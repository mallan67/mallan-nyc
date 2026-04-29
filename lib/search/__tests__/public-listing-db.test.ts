import { buildPublicListingDbSearch } from "@/lib/search/public-listing-db";

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

    expect(where.AND).toEqual(expect.arrayContaining([
      { address: { path: ["StreetNumber"], equals: "400" } },
      { address: { path: ["StreetName"], string_contains: "90" } },
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
});
