import {
  classifyMediaCategory,
  hasUsableListingIdentity,
  mapDisplayPropertyType,
  mapTrestleToCrmListing,
} from "@/lib/search/crm-idx-mapper";

describe("crm idx mapper — live Cotality contract", () => {
  it("maps display property type without inventing ownership", () => {
    expect(mapDisplayPropertyType({ CommonInterest: "Condominium" })).toBe("Condo");
    expect(mapDisplayPropertyType({ CommonInterest: "StockCooperative" })).toBe("Co-op");
    expect(mapDisplayPropertyType({ PropertySubType: "Apartment" })).toBe("Residential");
    expect(mapDisplayPropertyType({})).toBeNull();
  });

  it("groups only exact proven Cotality MediaCategory members", () => {
    expect(classifyMediaCategory({ MediaCategory: "FloorPlan" })).toBe("FloorPlan");
    expect(classifyMediaCategory({ MediaCategory: "Video" })).toBe("Video");
    expect(classifyMediaCategory({ MediaCategory: "Photo" })).toBe("Photo");

    // Not exact members / not proven Mallan groups.
    expect(classifyMediaCategory({ MediaCategory: "Floor Plan" })).toBe("Unclassified");
    expect(classifyMediaCategory({ MediaCategory: "VirtualTour" })).toBe("Unclassified");
    expect(classifyMediaCategory({ MediaCategory: "BrandedVirtualTour" })).toBe("Unclassified");
    expect(classifyMediaCategory({ MediaCategory: "Other" })).toBe("Unclassified");
    expect(classifyMediaCategory({})).toBe("Unclassified");
  });

  describe("provider identity", () => {
    it("uses non-nullable Cotality ListingKey as the provider identity", () => {
      const raw = { ListingKey: "12345", ListingId: "RLS123", SourceSystemKey: "LINEAGE123" };
      expect(hasUsableListingIdentity(raw)).toBe(true);
      const listing = mapTrestleToCrmListing(raw, 0);
      expect(listing.id).toBe("12345");
      expect(listing._listingKey).toBe("12345");
      expect(listing.wid).toBe("12345");
      expect(listing.providerListingId).toBe("RLS123");
      expect(listing.providerSourceSystemKey).toBe("LINEAGE123");
    });

    it("does not let ListingId or SourceSystemKey impersonate ListingKey", () => {
      expect(hasUsableListingIdentity({ ListingId: "RLS123" })).toBe(false);
      expect(hasUsableListingIdentity({ SourceSystemKey: "LINEAGE123" })).toBe(false);
      expect(hasUsableListingIdentity({ ListingId: "RLS123", SourceSystemKey: "LINEAGE123" })).toBe(false);
    });
  });

  it("honors address/display flags without inventing opt-out values", () => {
    const listing = mapTrestleToCrmListing({
      ListingKey: "1",
      StreetNumber: "100",
      StreetDirPrefix: "W",
      StreetName: "72nd",
      StreetSuffix: "Street",
      InternetEntireListingDisplayYN: true,
      InternetAddressDisplayYN: false,
      StandardStatus: "Active",
    }, 0);

    expect(listing.address).toBe("ADDRESS AVAILABLE UPON REQUEST");
    expect(listing.addressDisplayYN).toBe(false);
    expect(listing.internetDisplayYN).toBe(true);
    expect(listing.permissions).toMatchObject({
      ownerOptOut: null,
      participantOnly: null,
      idxDisplay: true,
      internetDisplay: true,
      syndication: null,
    });
  });

  it("maps exact Cotality facts while keeping unresolved geography raw", () => {
    const listing = mapTrestleToCrmListing({
      ListingKey: "456",
      ListingId: "RLS456",
      SourceSystemKey: "LINEAGE456",
      StreetNumber: "22",
      StreetName: "Main",
      StreetSuffix: "Street",
      UnitNumber: "4A",
      PropertyType: "Residential",
      PropertySubType: "Condominium",
      CommonInterest: "Condominium",
      OwnershipType: "Individual",
      ListPrice: 1200000,
      OriginalListPrice: 1300000,
      TaxAnnualAmount: 12000,
      AssociationFee: 1100,
      AssociationFeeFrequency: "Monthly",
      RoomsTotal: 5,
      BedroomsTotal: 2,
      BathroomsTotalInteger: 2.5,
      LivingArea: 1100,
      StandardStatus: "ActiveUnderContract",
      SubdivisionName: "Chelsea",
      CityRegion: "Manhattan",
      CountyOrParish: "New York",
      PostalCode: "10011",
      YearBuilt: 2018,
      BuildingName: "Test Building",
      BuildingKeyNumeric: 123,
      Latitude: 40.1,
      Longitude: -73.9,
      InternetEntireListingDisplayYN: true,
      InternetAddressDisplayYN: true,
      Media: [
        { MediaURL: "https://img.cotality.com/photo.jpg", MediaCategory: "Photo", Order: 2 },
        { MediaURL: "https://cdn.example.com/floor.pdf", MediaCategory: "FloorPlan", Order: 3 },
      ],
      PhotosCount: 2,
      CustomProperty: [{ DownPaymentAssistanceAmount: 5000, DownPaymentAssistanceCount: 1 }],
    }, 4);

    expect(listing).toMatchObject({
      id: "456",
      lid: "RLS456",
      wid: "456",
      price: 1200000,
      reTaxes: 1000,
      maintCC: 1100,
      associationFee: 1100,
      associationFeeFrequency: "Monthly",
      totalMonthly: 2100,
      status: "ActiveUnderContract",
      ownership: "Condominium",
      providerOwnershipType: "Individual",
      propertyType: "Condo",
      neighborhood: null,
      borough: null,
      providerSubdivisionName: "Chelsea",
      providerCityRegion: "Manhattan",
      providerCountyOrParish: "New York",
      latitude: null,
      longitude: null,
      providerLatitude: 40.1,
      providerLongitude: -73.9,
      originalPrice: 1300000,
      downPaymentAssistanceAmount: 5000,
      downPaymentAssistanceCount: 1,
    });
    expect((listing.images as Array<Record<string, unknown>>)[0]).toMatchObject({
      isPrimary: true,
      mediaType: "Photo",
    });
    expect((listing.images as Array<Record<string, unknown>>)[1]).toMatchObject({
      mediaType: "FloorPlan",
    });
  });

  it("does not present a non-monthly AssociationFee as monthly maintenance", () => {
    const listing = mapTrestleToCrmListing({
      ListingKey: "fee-quarterly",
      PropertyType: "Residential",
      TaxAnnualAmount: 12000,
      AssociationFee: 3000,
      AssociationFeeFrequency: "Quarterly",
    }, 0);
    expect(listing.associationFee).toBe(3000);
    expect(listing.associationFeeFrequency).toBe("Quarterly");
    expect(listing.maintCC).toBeNull();
    expect(listing.totalMonthly).toBeNull();
  });

  it("does not pretend an unknown AssociationFee frequency is monthly", () => {
    const listing = mapTrestleToCrmListing({
      ListingKey: "fee-remarks",
      PropertyType: "Residential",
      AssociationFee: 2000,
      AssociationFeeFrequency: "SeeRemarks",
    }, 0);
    expect(listing.maintCC).toBeNull();
    expect(listing.totalMonthly).toBeNull();
  });

  it("keeps rental ListPrice as a provider fact without changing its identity", () => {
    const listing = mapTrestleToCrmListing({
      ListingKey: "rent-key",
      ListingId: "RENT1",
      PropertyType: "ResidentialLease",
      ListPrice: 4200,
    }, 0);
    expect(listing.id).toBe("rent-key");
    expect(listing.price).toBe(4200);
    expect(listing.totalMonthly).toBe(4200);
    expect(listing.listingCategory).toBe("rental");
  });

  describe("StandardStatus", () => {
    const exactMembers = [
      "Active",
      "ActiveUnderContract",
      "Canceled",
      "Closed",
      "ComingSoon",
      "Delete",
      "Expired",
      "Hold",
      "Incomplete",
      "Pending",
      "Withdrawn",
    ];

    for (const member of exactMembers) {
      it(`preserves exact member ${member}`, () => {
        const listing = mapTrestleToCrmListing({ ListingKey: member, StandardStatus: member }, 0);
        expect(listing.status).toBe(member);
      });
    }

    it("keeps raw MlsStatus separate and never lets it override StandardStatus", () => {
      const listing = mapTrestleToCrmListing({
        ListingKey: "status",
        StandardStatus: "Pending",
        MlsStatus: "AttorneyReview",
      }, 0);
      expect(listing.status).toBe("Pending");
      expect(listing.mlsStatus).toBe("Pending");
      expect(listing.providerMlsStatus).toBe("AttorneyReview");
    });

    it("maps missing/unrecognized StandardStatus to UNKNOWN, never Active", () => {
      expect(mapTrestleToCrmListing({ ListingKey: "missing" }, 0).status).toBe("UNKNOWN");
      expect(mapTrestleToCrmListing({ ListingKey: "future", StandardStatus: "SomeFutureStatusEnum" }, 0).status).toBe("UNKNOWN");
    });
  });

  describe("Coming Soon date", () => {
    it("uses ActivationDate then OnMarketDate only for exact ComingSoon", () => {
      expect(mapTrestleToCrmListing({
        ListingKey: "cs1",
        StandardStatus: "ComingSoon",
        ActivationDate: "2026-06-15T00:00:00Z",
        OnMarketDate: "2026-06-10T00:00:00Z",
      }, 0).comingSoonDate).toBe("2026-06-15");

      expect(mapTrestleToCrmListing({
        ListingKey: "cs2",
        StandardStatus: "ComingSoon",
        OnMarketDate: "2026-07-01",
      }, 0).comingSoonDate).toBe("2026-07-01");

      expect(mapTrestleToCrmListing({
        ListingKey: "active",
        StandardStatus: "Active",
        ActivationDate: "2026-06-15T00:00:00Z",
      }, 0).comingSoonDate).toBeNull();
    });
  });

  describe("CustomProperty legacy observation parsing", () => {
    const mapSponsor = (value: unknown) => mapTrestleToCrmListing({
      ListingKey: "sponsor",
      CustomProperty: [{ CustomFields: value }],
    }, 0).sponsorUnit;

    it("parses explicit SponsorUnitYN values without inventing missing values", () => {
      expect(mapSponsor(JSON.stringify({ SponsorUnitYN: true }))).toBe(true);
      expect(mapSponsor(JSON.stringify({ SponsorUnitYN: "Yes" }))).toBe(true);
      expect(mapSponsor(JSON.stringify({ SponsorUnitYN: false }))).toBe(false);
      expect(mapSponsor(JSON.stringify({ SponsorUnitYN: "No" }))).toBe(false);
      expect(mapSponsor(JSON.stringify({ Other: true }))).toBeNull();
      expect(mapSponsor("{bad json")).toBeNull();
    });
  });
});
