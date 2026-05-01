import {
  classifyMediaCategory,
  mapDisplayPropertyType,
  mapTrestleToCrmListing,
} from "@/lib/search/crm-idx-mapper";

describe("crm idx mapper", () => {
  it("maps display property type without using Apartment as a display label", () => {
    expect(mapDisplayPropertyType({ CommonInterest: "Condominium" })).toBe("Condo");
    expect(mapDisplayPropertyType({ CommonInterest: "StockCooperative" })).toBe("Co-op");
    expect(mapDisplayPropertyType({ PropertySubType: "Apartment" })).toBe("Residential");
  });

  it("classifies media category using RESO content category", () => {
    expect(classifyMediaCategory({ MediaCategory: "Floor Plan" })).toBe("FloorPlan");
    expect(classifyMediaCategory({ MediaCategory: "Video" })).toBe("Video");
    expect(classifyMediaCategory({ MediaCategory: "Virtual Tour" })).toBe("VirtualTour");
    expect(classifyMediaCategory({ MediaCategory: "Photo" })).toBe("Photo");
  });

  // ── REBNY IDX Plus pre-filter semantics (Phase 0a, 2026-05-01) ────────────
  // The CRM mapper consumes raw Trestle records on the /api/idx/search live
  // path. REBNY/Cotality pre-filter non-displayable rows out of the IDX Plus
  // feed at the provider level, leaving these two booleans null on the
  // survivors. The mapper must mirror the writer-side convention at
  // lib/idx/trestle-mapper.ts:705-706 (commit 0309875b): treat null as
  // displayable, honor explicit false. AVM / ConsumerComment fields are NOT
  // pre-filtered — those remain fail-closed via affirmPermission elsewhere.

  it("treats null InternetAddressDisplayYN as displayable (IDX Plus pre-filter)", () => {
    const listing = mapTrestleToCrmListing({
      ListingId: "RLS123",
      StreetNumber: "100",
      StreetDirPrefix: "W",
      StreetName: "72nd",
      StreetSuffix: "Street",
      ListPrice: 1500000,
      InternetEntireListingDisplayYN: true,
      InternetAddressDisplayYN: null,
      StandardStatus: "Active",
    }, 0);

    expect(listing.address).toBe("100 W 72ND STREET");
    expect(listing.addressDisplayYN).toBe(true);
    expect(listing.internetDisplayYN).toBe(true);
    expect(listing.permissions).toMatchObject({
      idxDisplay: true,
      internetDisplay: true,
      ownerOptOut: false,
      participantOnly: false,
    });
  });

  it("treats null InternetEntireListingDisplayYN as displayable (IDX Plus pre-filter)", () => {
    const listing = mapTrestleToCrmListing({
      ListingId: "RLS124",
      StreetNumber: "200",
      StreetName: "Broadway",
      ListPrice: 2200000,
      InternetEntireListingDisplayYN: null,
      InternetAddressDisplayYN: null,
      StandardStatus: "Active",
    }, 0);

    expect(listing.internetDisplayYN).toBe(true);
    expect(listing.addressDisplayYN).toBe(true);
    expect(listing.address).toBe("200 BROADWAY");
    expect(listing.permissions).toMatchObject({
      internetDisplay: true,
      idxDisplay: true,
    });
  });

  it("honors explicit false on InternetAddressDisplayYN (per-listing opt-out)", () => {
    const listing = mapTrestleToCrmListing({
      ListingId: "RLS125",
      StreetNumber: "300",
      StreetName: "5th",
      StreetSuffix: "Avenue",
      ListPrice: 3500000,
      InternetEntireListingDisplayYN: true,
      InternetAddressDisplayYN: false,
      StandardStatus: "Active",
    }, 0);

    expect(listing.address).toBe("ADDRESS AVAILABLE UPON REQUEST");
    expect(listing.addressDisplayYN).toBe(false);
    expect(listing.internetDisplayYN).toBe(true);
  });

  it("honors explicit false on InternetEntireListingDisplayYN", () => {
    const listing = mapTrestleToCrmListing({
      ListingId: "RLS126",
      StreetNumber: "400",
      StreetName: "Park",
      StreetSuffix: "Avenue",
      ListPrice: 4500000,
      InternetEntireListingDisplayYN: false,
      InternetAddressDisplayYN: true,
      StandardStatus: "Active",
    }, 0);

    expect(listing.internetDisplayYN).toBe(false);
    expect(listing.permissions).toMatchObject({
      internetDisplay: false,
    });
  });

  it("maps sales with status, price change, taxes, media proxying, and DPA fields", () => {
    const listing = mapTrestleToCrmListing({
      ListingId: "RLS456",
      SourceSystemKey: "KEY456",
      StreetNumber: "22",
      StreetName: "Main",
      StreetSuffix: "Street",
      UnitNumber: "4A",
      PropertyType: "Residential",
      PropertySubType: "Condominium",
      CommonInterest: "Condominium",
      ListPrice: 1200000,
      OriginalListPrice: 1300000,
      TaxAnnualAmount: 12000,
      AssociationFee: 1100,
      RoomsTotal: 5,
      BedroomsTotal: 2,
      BathroomsTotalInteger: 2.5,
      LivingArea: 1100,
      MlsStatus: "ActiveUnderContract",
      SubdivisionName: "Chelsea",
      CityRegion: "Manhattan",
      PostalCode: "10011",
      YearBuilt: 2018,
      BuildingName: "Test Building",
      BuildingKeyNumeric: 123,
      DaysOnMarket: 12,
      CumulativeDaysOnMarket: 20,
      ListingContractDate: "2026-04-01",
      ModificationTimestamp: "2026-04-10T12:00:00Z",
      ListOfficeName: "Mallan",
      ListAgentFullName: "Agent Name",
      InternetEntireListingDisplayYN: true,
      InternetAddressDisplayYN: true,
      Media: [
        { MediaURL: "https://img.cotality.com/photo.jpg", MediaCategory: "Photo", Order: 2 },
        { MediaURL: "https://cdn.example.com/floor.pdf", MediaCategory: "Floor Plan", Order: 3 },
      ],
      PhotosCount: 2,
      CustomProperty: [{ DownPaymentAssistanceAmount: 5000, DownPaymentAssistanceCount: 1 }],
    }, 4);

    expect(listing).toMatchObject({
      id: "RLS456",
      address: "22 MAIN STREET",
      unit: "4A",
      price: 1200000,
      totalMonthly: 2100,
      baths: 2.5,
      status: "PENDING",
      propertyType: "Condo",
      neighborhood: "Chelsea",
      borough: "Manhattan",
      zip: "10011",
      era: "New Construction",
      priceChange: "down",
      originalPrice: 1300000,
      downPaymentAssistanceAmount: 5000,
      downPaymentAssistanceCount: 1,
    });
    expect((listing.images as Array<Record<string, unknown>>)[0]).toMatchObject({
      url: "/api/media/proxy?url=https%3A%2F%2Fimg.cotality.com%2Fphoto.jpg",
      isPrimary: true,
      mediaType: "Photo",
    });
    expect((listing.images as Array<Record<string, unknown>>)[1]).toMatchObject({
      url: "https://cdn.example.com/floor.pdf",
      mediaType: "FloorPlan",
    });
  });

  it("maps rentals with monthly rent as total monthly", () => {
    const listing = mapTrestleToCrmListing({
      ListingId: "RENT1",
      PropertyType: "ResidentialLease",
      ListPrice: 4200,
      InternetEntireListingDisplayYN: true,
      InternetAddressDisplayYN: true,
    }, 0);

    expect(listing.price).toBe(4200);
    expect(listing.totalMonthly).toBe(4200);
    expect(listing.listingCategory).toBe("rental");
  });
});
