import { criteriaToPrismaWhere } from "@/lib/search/criteria-to-prisma";
import {
  buildSearchDisplayWhere,
  canDisplayListingAddress,
  isListingDisplayable,
  normalizeSearchStatuses,
} from "@/lib/search/listing-access-decision";
import { formatSearchAlertAddress, sanitizeSearchAddress } from "@/lib/search/core";

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
