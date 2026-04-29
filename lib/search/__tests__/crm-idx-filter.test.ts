import { buildCrmIdxODataFilter, escapeOData } from "@/lib/search/crm-idx-filter";

describe("buildCrmIdxODataFilter", () => {
  it("builds core sale filters with default active statuses", () => {
    const filter = buildCrmIdxODataFilter(new URLSearchParams({
      type: "sale",
      minPrice: "1000000",
      maxPrice: "2000000",
      minBeds: "2",
      maxBeds: "4",
      minBaths: "1.5",
      maxBaths: "3",
      borough: "Manhattan",
    }));

    expect(filter).toContain("PropertyType ne 'ResidentialLease'");
    expect(filter).toContain("ListPrice ge 1000000");
    expect(filter).toContain("ListPrice le 2000000");
    expect(filter).toContain("BedroomsTotal ge 2");
    expect(filter).toContain("BedroomsTotal le 4");
    expect(filter).toContain("BathroomsTotalInteger ge 1.5");
    expect(filter).toContain("BathroomsTotalInteger le 3");
    expect(filter).toContain("CityRegion eq 'Manhattan'");
    expect(filter).toContain("(StandardStatus eq 'Active' or StandardStatus eq 'ComingSoon' or StandardStatus eq 'ActiveUnderContract')");
  });

  it("builds rental status and neighborhood filters", () => {
    const filter = buildCrmIdxODataFilter(new URLSearchParams({
      type: "rental",
      neighborhood: "NoSuchNeighborhoodForAlias",
      status: "Coming Soon,Active Under Contract",
    }));

    expect(filter).toContain("PropertyType eq 'ResidentialLease'");
    expect(filter).toContain("SubdivisionName eq 'NoSuchNeighborhoodForAlias'");
    expect(filter).toContain("(StandardStatus eq 'ComingSoon' or StandardStatus eq 'ActiveUnderContract')");
  });

  it("supports status wildcard for tracker-style total counts", () => {
    const filter = buildCrmIdxODataFilter(new URLSearchParams("status=*"));

    expect(filter).not.toContain("StandardStatus");
  });

  it("escapes OData strings and builds address filters", () => {
    expect(escapeOData("Broker's Open")).toBe("Broker''s Open");

    const withDirection = buildCrmIdxODataFilter(new URLSearchParams("address=400 East 90th Street"));
    expect(withDirection).toContain("startswith(StreetNumber,'400')");
    expect(withDirection).toContain("StreetDirPrefix eq 'E'");
    expect(withDirection).toContain("contains(StreetName,'90')");

    const textOnly = buildCrmIdxODataFilter(new URLSearchParams("address=Park Avenue"));
    expect(textOnly).toContain("contains(StreetName,'PARK')");
    expect(textOnly).toContain("contains(BuildingName,'PARK AVENUE')");
  });

  it("builds date, building, ownership, and listing id filters", () => {
    const filter = buildCrmIdxODataFilter(new URLSearchParams({
      dateType: "Updated",
      dateFrom: "2026-04-01",
      dateTo: "2026-04-02",
      buildingName: "The Plaza",
      managementCompany: "O'Brien Realty",
      propertySubType: "Condo,Co-op",
      ownership: "Condominium,StockCooperative",
      listingId: "RLS123",
    }));

    expect(filter).toContain("ModificationTimestamp gt 2026-04-01T00:00:00Z");
    expect(filter).toContain("ModificationTimestamp le 2026-04-02T23:59:59Z");
    expect(filter).toContain("contains(BuildingName,'The Plaza')");
    expect(filter).toContain("contains(ListOfficeName,'O''Brien Realty')");
    expect(filter).toContain("(contains(PropertySubType,'Condo') or contains(PropertySubType,'Co-op'))");
    expect(filter).toContain("(CommonInterest eq 'Condominium' or CommonInterest eq 'StockCooperative')");
    expect(filter).toContain("ListingId eq 'RLS123'");
  });

  it("applies only safe checkbox and grid filters", () => {
    const checkboxFilters = JSON.stringify({
      CoolingYN: ["true"],
      BuildingLaundryFeatures: ["Common Area"],
      AvailableLeaseType: ["ShortTerm"],
      UnsafeField: ["x"],
    });
    const filter = buildCrmIdxODataFilter(new URLSearchParams({
      checkboxFilters,
      gridFilter: "(Latitude ge 40.7 and Latitude le 40.8 and Longitude ge -74.1 and Longitude le -73.9)",
    }));

    expect(filter).toContain("CoolingYN eq true");
    expect(filter).toContain("LaundryFeatures eq 'Common Area'");
    expect(filter).toContain("Latitude ge 40.7");
    expect(filter).not.toContain("AvailableLeaseType");
    expect(filter).not.toContain("UnsafeField");
  });
});
