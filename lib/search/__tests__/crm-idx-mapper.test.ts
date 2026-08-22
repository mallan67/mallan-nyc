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
    // CORRECTED (Step 1): ownerOptOut/participantOnly were hard-coded `false`,
    // which is an AFFIRMATIVE claim that the owner did not opt out. The provider
    // supplied no such fact, so they are now null. Every consumer tests `=== true`
    // (compliance-gates-and-output.js:21,27), so behaviour is unchanged — the
    // value is simply no longer an invention.
    // The two DISPLAY flags stay true: on IDX Plus they are REBNY-pre-filtered and
    // null genuinely means displayable (2026-04-30 incident contract).
    expect(listing.permissions).toMatchObject({
      idxDisplay: true,
      internetDisplay: true,
      ownerOptOut: null,
      participantOnly: null,
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
      // CORRECTED 2026-08-07: img.cotality.com is NOT on the proxy route's
      // exact allowlist, so proxying it produced a guaranteed 403. The mapper
      // now delegates to the canonical policy and passes unapproved hosts
      // through unchanged. See lib/media/__tests__/listing-media-resolver.test.ts.
      url: "https://img.cotality.com/photo.jpg",
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

  // ═══════════════════════════════════════════════════════════════════
  // P0 COMPLIANCE — status mapper exhaustiveness (UCBA Art. I §5(D))
  //
  // UCBA prohibits "Off-Market" labeling. The prior fallback
  //   const status = statusMap[mlsStatus] || mlsStatus.toUpperCase()
  // could produce "OFF MARKET" if Trestle returned that string,
  // exposing the platform to UCBA fines. Tests below pin the
  // contract: any unmapped or off-market variant must NEVER produce
  // an "OFF MARKET" value in the rendered status field.
  // ═══════════════════════════════════════════════════════════════════

  describe("status mapper — UCBA Art. I §5(D) compliance", () => {
    const offMarketVariants = ["Off Market", "Off-Market", "OffMarket", "off market"];

    for (const variant of offMarketVariants) {
      it(`maps MlsStatus "${variant}" to WITHDRAWN, never to "OFF MARKET"`, () => {
        const listing = mapTrestleToCrmListing({
          ListingId: "X",
          MlsStatus: variant,
          InternetEntireListingDisplayYN: true,
          InternetAddressDisplayYN: true,
        }, 0);
        expect(listing.status).toBe("WITHDRAWN");
        expect(listing.status).not.toBe("OFF MARKET");
        expect(listing.status).not.toMatch(/OFF.MARKET/i);
      });
    }

    it("falls back unmapped values to UNKNOWN (not raw uppercase)", () => {
      // Vendor- or feed-specific status that nobody has mapped yet
      // must NOT surface as raw uppercase text in the UI. UNKNOWN is
      // a safe sentinel that renderers can suppress or display
      // neutrally.
      const listing = mapTrestleToCrmListing({
        ListingId: "X",
        MlsStatus: "SomeFutureStatusEnum",
        InternetEntireListingDisplayYN: true,
        InternetAddressDisplayYN: true,
      }, 0);
      expect(listing.status).toBe("UNKNOWN");
      expect(listing.status).not.toBe("SOMEFUTURESTATUSENUM");
    });

    it("preserves all canonical mappings (regression guard)", () => {
      const cases: Array<[string, string]> = [
        ["Active", "ACTIVE"],
        ["ComingSoon", "COMING_SOON"],
        ["Coming Soon", "COMING_SOON"],
        ["ActiveUnderContract", "PENDING"],
        ["Active Under Contract", "PENDING"],
        ["Pending", "PENDING"],
        ["Closed", "CLOSED"],
        ["Expired", "EXPIRED"],
        ["Withdrawn", "WITHDRAWN"],
        ["Hold", "HOLD"],
        ["Incomplete", "INCOMPLETE"],
        ["Canceled", "CANCELLED"],
        ["Cancelled", "CANCELLED"],
      ];
      for (const [input, expected] of cases) {
        const listing = mapTrestleToCrmListing({
          ListingId: "X",
          MlsStatus: input,
          InternetEntireListingDisplayYN: true,
          InternetAddressDisplayYN: true,
        }, 0);
        expect(listing.status).toBe(expected);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // P0 COMPLIANCE — Coming Soon date (UCBA Art. I §16(C))
  //
  // Coming Soon listings must disclose "No Showings or Open House
  // until [date]." The date must be specific. Previously
  // comingSoonDate was hard-coded null, so the badge renderer fell
  // back to a vague "until active date" string. Now populated from
  // Trestle ActivationDate (preferred) or OnMarketDate (fallback).
  // ═══════════════════════════════════════════════════════════════════

  describe("comingSoonDate — UCBA Art. I §16(C)", () => {
    it("populates from raw.ActivationDate when status is Coming Soon", () => {
      const listing = mapTrestleToCrmListing({
        ListingId: "X",
        MlsStatus: "Coming Soon",
        ActivationDate: "2026-06-15T00:00:00Z",
        OnMarketDate: "2026-06-10T00:00:00Z",
        InternetEntireListingDisplayYN: true,
        InternetAddressDisplayYN: true,
      }, 0);
      expect(listing.status).toBe("COMING_SOON");
      expect(listing.comingSoonDate).toBe("2026-06-15");
    });

    it("falls back to raw.OnMarketDate when ActivationDate is missing", () => {
      const listing = mapTrestleToCrmListing({
        ListingId: "X",
        MlsStatus: "ComingSoon",
        OnMarketDate: "2026-07-01",
        InternetEntireListingDisplayYN: true,
        InternetAddressDisplayYN: true,
      }, 0);
      expect(listing.comingSoonDate).toBe("2026-07-01");
    });

    it("returns null when neither ActivationDate nor OnMarketDate is provided", () => {
      // Renderer must treat null as "no specific date" and either
      // suppress the date phrase or show a neutral indicator —
      // never invent a vague "until active date" string.
      const listing = mapTrestleToCrmListing({
        ListingId: "X",
        MlsStatus: "Coming Soon",
        InternetEntireListingDisplayYN: true,
        InternetAddressDisplayYN: true,
      }, 0);
      expect(listing.comingSoonDate).toBeNull();
    });

    it("does NOT populate comingSoonDate for non-Coming-Soon statuses", () => {
      const listing = mapTrestleToCrmListing({
        ListingId: "X",
        MlsStatus: "Active",
        ActivationDate: "2026-06-15T00:00:00Z",
        OnMarketDate: "2026-06-10T00:00:00Z",
        InternetEntireListingDisplayYN: true,
        InternetAddressDisplayYN: true,
      }, 0);
      expect(listing.status).toBe("ACTIVE");
      expect(listing.comingSoonDate).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SponsorUnit parsing from CustomFields JSON (Bug A11/A12 coverage)
  //
  // CustomProperty.CustomFields is a JSON-string field carrying 41
  // REBNY-specific flags including SponsorUnitYN. The mapper parses
  // it once and exposes listing.sponsorUnit (true | false | null).
  // Prior to this test, no unit coverage existed for the parsing
  // branches — a malformed JSON or missing field could silently turn
  // a real sponsor listing into "—" in the UI.
  // ═══════════════════════════════════════════════════════════════════

  describe("sponsorUnit parsing from CustomProperty.CustomFields JSON", () => {
    function withCustomFields(customFields: unknown): Record<string, unknown> {
      return {
        ListingId: "X",
        InternetEntireListingDisplayYN: true,
        InternetAddressDisplayYN: true,
        CustomProperty: [{ CustomFields: customFields }],
      };
    }

    it("returns true for SponsorUnitYN === true (boolean)", () => {
      const l = mapTrestleToCrmListing(
        withCustomFields(JSON.stringify({ SponsorUnitYN: true })),
        0,
      );
      expect(l.sponsorUnit).toBe(true);
    });

    it('returns true for SponsorUnitYN === "true" (string variant)', () => {
      const l = mapTrestleToCrmListing(
        withCustomFields(JSON.stringify({ SponsorUnitYN: "true" })),
        0,
      );
      expect(l.sponsorUnit).toBe(true);
    });

    it('returns true for SponsorUnitYN === "Yes" (REBNY-style)', () => {
      const l = mapTrestleToCrmListing(
        withCustomFields(JSON.stringify({ SponsorUnitYN: "Yes" })),
        0,
      );
      expect(l.sponsorUnit).toBe(true);
    });

    it("returns true for SponsorUnitYN === 1 (numeric)", () => {
      const l = mapTrestleToCrmListing(
        withCustomFields(JSON.stringify({ SponsorUnitYN: 1 })),
        0,
      );
      expect(l.sponsorUnit).toBe(true);
    });

    it("returns false for SponsorUnitYN === false", () => {
      const l = mapTrestleToCrmListing(
        withCustomFields(JSON.stringify({ SponsorUnitYN: false })),
        0,
      );
      expect(l.sponsorUnit).toBe(false);
    });

    it("returns false for SponsorUnitYN === \"No\"", () => {
      const l = mapTrestleToCrmListing(
        withCustomFields(JSON.stringify({ SponsorUnitYN: "No" })),
        0,
      );
      expect(l.sponsorUnit).toBe(false);
    });

    it("returns null when SponsorUnitYN field is absent", () => {
      const l = mapTrestleToCrmListing(
        withCustomFields(JSON.stringify({ SomeOtherField: "x" })),
        0,
      );
      expect(l.sponsorUnit).toBeNull();
    });

    it("returns null when CustomFields is empty string", () => {
      const l = mapTrestleToCrmListing(withCustomFields(""), 0);
      expect(l.sponsorUnit).toBeNull();
    });

    it("returns null when CustomFields is malformed JSON (no log spam)", () => {
      const l = mapTrestleToCrmListing(
        withCustomFields("{not valid json"),
        0,
      );
      expect(l.sponsorUnit).toBeNull();
    });

    it("returns null when CustomProperty is entirely absent", () => {
      const l = mapTrestleToCrmListing({
        ListingId: "X",
        InternetEntireListingDisplayYN: true,
        InternetAddressDisplayYN: true,
      }, 0);
      expect(l.sponsorUnit).toBeNull();
    });

    it("returns null when SponsorUnitYN is an unrecognized value (defensive)", () => {
      const l = mapTrestleToCrmListing(
        withCustomFields(JSON.stringify({ SponsorUnitYN: "maybe" })),
        0,
      );
      expect(l.sponsorUnit).toBeNull();
    });
  });
});
