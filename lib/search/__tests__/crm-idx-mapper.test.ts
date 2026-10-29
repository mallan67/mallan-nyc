import {
  classifyMediaCategory,
  classifyTourUrl,
  mapDisplayPropertyType,
  mapTrestleToCrmListing,
  remarksToText,
} from "@/lib/search/crm-idx-mapper";

describe("crm idx mapper", () => {
  it("maps display property type without using Apartment as a display label", () => {
    expect(mapDisplayPropertyType({ CommonInterest: "Condominium" })).toBe("Condo");
    expect(mapDisplayPropertyType({ CommonInterest: "StockCooperative" })).toBe("Co-op");
    expect(mapDisplayPropertyType({ PropertySubType: "Apartment" })).toBe("Residential");
  });

  it("classifies media category from the MediaCategory field", () => {
    expect(classifyMediaCategory({ MediaCategory: "Floor Plan" })).toBe("FloorPlan");
    expect(classifyMediaCategory({ MediaCategory: "Video" })).toBe("Video");
    expect(classifyMediaCategory({ MediaCategory: "Virtual Tour" })).toBe("VirtualTour");
    expect(classifyMediaCategory({ MediaCategory: "Photo" })).toBe("Photo");
  });

  // ── REBNY IDX Plus pre-filter semantics (Phase 0a, 2026-05-01) ────────────
  // The CRM mapper consumes raw Cotality records on the /api/idx/search live
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
      ListingKey: "1190000456",
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
      StandardStatus: "ActiveUnderContract",
      SubdivisionName: "Chelsea",
      CityRegion: "Manhattan",
      PostalCode: "10011",
      YearBuilt: 2018,
      BuildingName: "Test Building",
      BuildingKeyNumeric: 123,
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
      listingKey: "1190000456",
      wid: "1190000456",
      dom: null, // no OnMarketDate on this fixture; provider DaysOnMarket is suppressed
      cdom: null,
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

  it("takes monthly taxes from the REBNY custom field when Property.TaxAnnualAmount is absent", () => {
    // Live 2026-10-26: 2,374 of 4,413 active condos have no TaxAnnualAmount; their CustomFields carry
    // TaxMonthlyAmount (e.g. RLS20117661 → "1560.00"). The grid showed those as RE TAXES $0.
    const custom = mapTrestleToCrmListing({
      ListingId: "TAX1", PropertyType: "Residential", ListPrice: 1000000, AssociationFee: 2540,
      CustomProperty: [{ CustomFields: JSON.stringify({ TaxMonthlyAmount: "1560.00" }) }],
    }, 0);
    expect(custom.reTaxes).toBe(1560);
    expect(custom.totalMonthly).toBe(4100);
    const annual = mapTrestleToCrmListing({
      ListingId: "TAX2", PropertyType: "Residential", ListPrice: 1, TaxAnnualAmount: 12000, AssociationFee: 100,
      CustomProperty: [{ CustomFields: JSON.stringify({ TaxMonthlyAmount: "999" }) }],
    }, 0);
    expect(annual.reTaxes).toBe(1000); // the Property field wins when Cotality has it
    const none = mapTrestleToCrmListing({ ListingId: "TAX3", PropertyType: "Residential", ListPrice: 1 }, 0);
    expect(none.reTaxes).toBe(0); // neither source: renderers show "--"
  });

  // ═══════════════════════════════════════════════════════════════════
  // P0 COMPLIANCE — status mapper exhaustiveness (UCBA Art. I §5(D))
  //
  // UCBA prohibits "Off-Market" labeling. The prior fallback
  //   const status = statusMap[mlsStatus] || mlsStatus.toUpperCase()
  // could produce "OFF MARKET" if Cotality returned that string,
  // exposing the platform to UCBA fines. Tests below pin the
  // contract: any unmapped or off-market variant must NEVER produce
  // an "OFF MARKET" value in the rendered status field.
  //
  // Stage B cutover 1 (2026-10-02): fixtures below now set StandardStatus
  // instead of MlsStatus — Master Plan §0.6 forbids substituting one for
  // the other, and StandardStatus is what a real Cotality record always
  // carries. The protective intent of every test below (never leak a raw
  // or off-market-ish string into the displayed status) is unchanged.
  // ═══════════════════════════════════════════════════════════════════

  describe("status mapper — UCBA Art. I §5(D) compliance", () => {
    const offMarketVariants = ["Off Market", "Off-Market", "OffMarket", "off market"];

    for (const variant of offMarketVariants) {
      it(`maps StandardStatus "${variant}" to WITHDRAWN, never to "OFF MARKET"`, () => {
        const listing = mapTrestleToCrmListing({
          ListingId: "X",
          StandardStatus: variant,
          InternetEntireListingDisplayYN: true,
          InternetAddressDisplayYN: true,
        }, 0);
        expect(listing.status).toBe("WITHDRAWN");
        expect(listing.status).not.toBe("OFF MARKET");
        expect(listing.status).not.toMatch(/OFF.MARKET/i);
      });
    }

    it("ignores MlsStatus — it is suppressed by Cotality and never substituted for StandardStatus", () => {
      const listing = mapTrestleToCrmListing({
        ListingId: "X",
        MlsStatus: "Closed",
        InternetEntireListingDisplayYN: true,
      }, 0);
      expect(listing.status).toBe("UNKNOWN");
    });

    it("falls back unmapped values to UNKNOWN (not raw uppercase)", () => {
      // Vendor- or feed-specific status that nobody has mapped yet
      // must NOT surface as raw uppercase text in the UI. UNKNOWN is
      // a safe sentinel that renderers can suppress or display
      // neutrally.
      const listing = mapTrestleToCrmListing({
        ListingId: "X",
        StandardStatus: "SomeFutureStatusEnum",
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
          StandardStatus: input,
          InternetEntireListingDisplayYN: true,
          InternetAddressDisplayYN: true,
        }, 0);
        expect(listing.status).toBe(expected);
      }
    });

    it("[NEGATIVE TEST, Stage B cutover 1] MlsStatus is never consulted for the status label, even when it conflicts with StandardStatus", () => {
      const listing = mapTrestleToCrmListing({
        ListingId: "X",
        StandardStatus: "Active",
        MlsStatus: "Off Market", // deliberately conflicting — must NOT leak through.
        InternetEntireListingDisplayYN: true,
        InternetAddressDisplayYN: true,
      }, 0);
      expect(listing.status).toBe("ACTIVE");
      expect(listing.status).not.toBe("WITHDRAWN");
    });

    it("[NEGATIVE TEST, Stage B cutover 1 (corrected)] StandardStatus absent, only MlsStatus present: falls to UNKNOWN — never Active (not fabricated) and never Pending (not substituted)", () => {
      const listing = mapTrestleToCrmListing({
        ListingId: "X",
        MlsStatus: "Pending",
        InternetEntireListingDisplayYN: true,
        InternetAddressDisplayYN: true,
      }, 0);
      expect(listing.status).toBe("UNKNOWN");
      expect(listing.status).not.toBe("ACTIVE");
      expect(listing.status).not.toBe("PENDING");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // P0 COMPLIANCE — Coming Soon date (UCBA Art. I §16(C))
  //
  // Coming Soon listings must disclose "No Showings or Open House
  // until [date]." The date must be specific. Previously
  // comingSoonDate was hard-coded null, so the badge renderer fell
  // back to a vague "until active date" string. Now populated from
  // Cotality ActivationDate (preferred) or OnMarketDate (fallback).
  //
  // Stage B cutover 1 (2026-10-02): fixtures below now set StandardStatus
  // instead of MlsStatus, for the same reason as the compliance tests above.
  // ═══════════════════════════════════════════════════════════════════

  describe("comingSoonDate — UCBA Art. I §16(C)", () => {
    it("populates from raw.ActivationDate when status is Coming Soon", () => {
      const listing = mapTrestleToCrmListing({
        ListingId: "X",
        StandardStatus: "Coming Soon",
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
        StandardStatus: "ComingSoon",
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
        StandardStatus: "Coming Soon",
        InternetEntireListingDisplayYN: true,
        InternetAddressDisplayYN: true,
      }, 0);
      expect(listing.comingSoonDate).toBeNull();
    });

    it("does NOT populate comingSoonDate for non-Coming-Soon statuses", () => {
      const listing = mapTrestleToCrmListing({
        ListingId: "X",
        StandardStatus: "Active",
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

    // Live Cotality sends REBNY YN keys as the strings "1" / "0" (verified 2026-10-23).
    it('returns true for the live value SponsorUnitYN === "1"', () => {
      const l = mapTrestleToCrmListing(
        withCustomFields(JSON.stringify({ SponsorUnitYN: "1" })),
        0,
      );
      expect(l.sponsorUnit).toBe(true);
    });

    it('returns false for the live value SponsorUnitYN === "0"', () => {
      const l = mapTrestleToCrmListing(
        withCustomFields(JSON.stringify({ SponsorUnitYN: "0" })),
        0,
      );
      expect(l.sponsorUnit).toBe(false);
    });

    it("accepts JSON-typed true / 1 and false / 0", () => {
      expect(mapTrestleToCrmListing(withCustomFields(JSON.stringify({ SponsorUnitYN: true })), 0).sponsorUnit).toBe(true);
      expect(mapTrestleToCrmListing(withCustomFields(JSON.stringify({ SponsorUnitYN: 1 })), 0).sponsorUnit).toBe(true);
      expect(mapTrestleToCrmListing(withCustomFields(JSON.stringify({ SponsorUnitYN: false })), 0).sponsorUnit).toBe(false);
      expect(mapTrestleToCrmListing(withCustomFields(JSON.stringify({ SponsorUnitYN: 0 })), 0).sponsorUnit).toBe(false);
    });

    it("exposes every REBNY CustomFields key as sent", () => {
      const l = mapTrestleToCrmListing(
        withCustomFields(JSON.stringify({ AttendanceType: "DoormanFullTime,ConciergeYes", FlipTax: "2.00" })),
        0,
      );
      expect(l.rebny).toEqual({ AttendanceType: "DoormanFullTime,ConciergeYes", FlipTax: "2.00" });
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
  // ═══════════════════════════════════════════════════════════════════
  // Video and 3D — live Cotality carries them on the Property tour fields and VideosCount; the Media
  // resource holds only Photo and FloorPlan rows (0 Video / 0 UnbrandedVirtualTour rows, 2026-10-26).
  // Owner rule 2026-10-26: the CRM uses the UNBRANDED links only (VirtualTourURLUnbranded/2/3). Live,
  // every on-market branded link (336 of 15,364) is also the unbranded link; none is branded-only.
  // ═══════════════════════════════════════════════════════════════════

  describe("video and 3D tours from the Property tour fields", () => {
    it("classifies video and 3D hosts and gives playable embed URLs", () => {
      expect(classifyTourUrl("https://www.youtube.com/watch?v=abc123")).toEqual({ url: "https://www.youtube.com/watch?v=abc123", kind: "video", embedUrl: "https://www.youtube.com/embed/abc123" });
      expect(classifyTourUrl("https://youtu.be/xyz789").embedUrl).toBe("https://www.youtube.com/embed/xyz789");
      expect(classifyTourUrl("https://vimeo.com/123456789")).toMatchObject({ kind: "video", embedUrl: "https://player.vimeo.com/video/123456789" });
      expect(classifyTourUrl("https://my.matterport.com/show/?m=AbC")).toMatchObject({ kind: "3d", embedUrl: "https://my.matterport.com/show/?m=AbC" });
      expect(classifyTourUrl("https://listing3d.com/tour/1").kind).toBe("3d");
      expect(classifyTourUrl("https://www.zillow.com/view-imx/abc")).toMatchObject({ kind: "3d", embedUrl: null });
      expect(classifyTourUrl("https://www.zillow.com/view-3d-home/5c0b98ed")).toMatchObject({ kind: "3d", embedUrl: null });
      // Scheme-less links as Cotality carries some of them
      expect(classifyTourUrl("youtube.com/watch?v=pk-TbpwE9k0&feature=youtu.be")).toMatchObject({ url: "https://youtube.com/watch?v=pk-TbpwE9k0&feature=youtu.be", kind: "video", embedUrl: "https://www.youtube.com/embed/pk-TbpwE9k0" });
      // Only hosts the CRM CSP frames are embedded; other 3D hosts and direct files open as links
      expect(classifyTourUrl("https://matterport.com/discover/space/x")).toMatchObject({ kind: "3d", embedUrl: null });
      expect(classifyTourUrl("https://cdn.example.com/tour.mp4")).toMatchObject({ kind: "video", embedUrl: null });
      // Text before the address, as live Cotality carries one value
      expect(classifyTourUrl("_https://youtu.be/WIPldk_iXQo")).toMatchObject({ url: "https://youtu.be/WIPldk_iXQo", kind: "video", embedUrl: "https://www.youtube.com/embed/WIPldk_iXQo" });
      expect(classifyTourUrl("https://view.ricoh360.com/43e673b8")).toMatchObject({ kind: "3d", embedUrl: null });
    });

    it("maps the unbranded tour fields, de-duplicated, with VideosCount, and never a branded link", () => {
      const listing = mapTrestleToCrmListing({
        ListingId: "T1",
        StandardStatus: "Active",
        VideosCount: 2,
        VirtualTourURLUnbranded: "https://youtu.be/vid1",
        VirtualTourURLUnbranded2: "https://my.matterport.com/show/?m=tour1",
        VirtualTourURLUnbranded3: "https://youtu.be/vid1",
        VirtualTourURLBranded: "https://vimeo.com/99999999",
        VirtualTourURLBranded2: "https://my.matterport.com/show/?m=brandedOnly",
      }, 0);
      expect(listing.videosCount).toBe(2);
      const tours = listing.tours as Array<{ url: string }>;
      expect(tours.map((t) => t.url)).toEqual(["https://youtu.be/vid1", "https://my.matterport.com/show/?m=tour1"]);
      expect(JSON.stringify(listing.tours)).not.toMatch(/vimeo|brandedOnly|branded/);
      expect(listing.videoTourUrl).toBe("https://youtu.be/vid1");
      // virtualTourUrl is the 3D tour only — a YouTube link is never labeled as 3D
      expect(listing.virtualTourUrl).toBe("https://my.matterport.com/show/?m=tour1");
    });

    it("leaves virtualTourUrl null when only a video exists", () => {
      const listing = mapTrestleToCrmListing({ ListingId: "T2", VirtualTourURLUnbranded: "https://www.youtube.com/watch?v=only" }, 0);
      expect(listing.virtualTourUrl).toBeNull();
      expect(listing.videoTourUrl).toBe("https://www.youtube.com/watch?v=only");
    });

    it("shows no tour for a listing that only carries branded links", () => {
      const listing = mapTrestleToCrmListing({ ListingId: "T3", VirtualTourURLBranded: "https://youtu.be/brandedOnly", VirtualTourURLBranded2: "https://my.matterport.com/show/?m=b2" }, 0);
      expect(listing.tours).toEqual([]);
      expect(listing.videoTourUrl).toBeNull();
      expect(listing.virtualTourUrl).toBeNull();
    });
  });

  describe("days on market — derived from OnMarketDate (provider DOM is suppressed)", () => {
    it("counts a Closed listing from OnMarketDate to CloseDate", () => {
      const l = mapTrestleToCrmListing({ ListingId: "D1", StandardStatus: "Closed", OnMarketDate: "2026-01-01", CloseDate: "2026-03-02" }, 0);
      expect(l.dom).toBe(60);
    });

    it("counts an Active listing to today, ignoring a future OffMarketDate", () => {
      const start = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
      const l = mapTrestleToCrmListing({ ListingId: "D2", StandardStatus: "Active", OnMarketDate: start, OffMarketDate: "2099-01-01" }, 0);
      expect(l.dom).toBe(10);
    });

    it("is null without OnMarketDate, never a fabricated 0", () => {
      expect(mapTrestleToCrmListing({ ListingId: "D3", StandardStatus: "Active" }, 0).dom).toBeNull();
    });
  });
});

describe("agent and office contact from the live ListAgent / ListOffice / CoList fields", () => {
  const raw = {
    ListingId: "C1", ListingKey: "1", PropertyType: "Residential", StandardStatus: "Active", ListPrice: 1,
    ListAgentFullName: "Ann Agent", ListAgentMlsId: "111", ListAgentEmail: "ann@example.com",
    ListAgentDirectPhone: "212-555-0101", ListAgentPreferredPhone: "212-555-0101", ListAgentURL: "ann.example.com",
    ListOfficeName: "Office One", ListOfficeMlsId: "7041", ListOfficePhone: "212-555-0100", ListOfficeEmail: "info@one.example", ListOfficeURL: "https://one.example",
    CoListAgent2FullName: "Ben Co", CoListAgent2MlsId: "222", CoListAgent2MobilePhone: "917-555-0102", CoListAgent2StateLicense: "10401234567",
    CoListOffice2Name: "Office Two", CoListOffice2Phone: "212-555-0200",
  };
  it("carries every phone, email, website and licence Cotality has, without repeats", () => {
    const l = mapTrestleToCrmListing(raw as Record<string, unknown>, 0) as unknown as Record<string, any>;
    expect(l.agent).toMatchObject({ name: "Ann Agent", mlsId: "111", email: "ann@example.com", directPhone: "212-555-0101", url: "ann.example.com", photo: null });
    expect(l.office).toMatchObject({ name: "Office One", phone: "212-555-0100", email: "info@one.example", url: "https://one.example" });
    expect(l.agentPhone).toBe("212-555-0101");
  });
  it("pairs each co-listing agent with the office in the same slot", () => {
    const l = mapTrestleToCrmListing(raw as Record<string, unknown>, 0) as unknown as Record<string, any>;
    expect(l.coAgents).toHaveLength(1);
    expect(l.coAgents[0]).toMatchObject({ name: "Ben Co", mlsId: "222", mobilePhone: "917-555-0102", license: "10401234567", office: { name: "Office Two", phone: "212-555-0200" } });
  });
});

describe("remarks delivered as HTML (live: 6,561 of 10,184 Active listings on 2026-10-27)", () => {
  it("passes plain remarks through untouched", () => {
    expect(remarksToText("Sunny two bedroom. Pets welcome.")).toBe("Sunny two bedroom. Pets welcome.");
    expect(remarksToText(null)).toBe("");
    expect(remarksToText("")).toBe("");
  });

  it("keeps paragraphs, line breaks and bullets as text and drops every other tag", () => {
    expect(remarksToText("<p>Residence 2A is quietly exceptional.</p><p>Upon entry, the apartment reveals a gracious layout.</p>"))
      .toBe("Residence 2A is quietly exceptional.\n\nUpon entry, the apartment reveals a gracious layout.");
    expect(remarksToText("Line one<br>Line two<br/>Line three")).toBe("Line one\nLine two\nLine three");
    expect(remarksToText('<div style="font-size:18px"><strong>Big</strong> &amp; <em>bold</em> claim</div>')).toBe("Big & bold claim");
    expect(remarksToText("<p>a</p>\n\n\n<p>b</p>")).toBe("a\n\nb");
    expect(remarksToText("Features:<ul><li>Doorman</li><li>Roof deck</li></ul><p>Pets ok</p>")).toBe("Features:\n• Doorman\n• Roof deck\n\nPets ok");
    // markup an agent typed into the remarks is text here, never a tag (the renderers escape it)
    expect(remarksToText('<img src=x onerror="alert(1)">Open house Sunday')).toBe("Open house Sunday");
  });

  it("decodes the entities agents paste from word processors", () => {
    expect(remarksToText("Sch&ouml;n&nbsp;&amp;&nbsp;chic &ndash; it&rsquo;s &ldquo;rare&rdquo; &#8230; &#x2014; &lt;3"))
      .toBe("Sch&ouml;n & chic – it’s “rare” … — <3");
  });

  it("maps PublicRemarks through remarksToText so every consumer gets text", () => {
    const listing = mapTrestleToCrmListing({
      ListingId: "RLS20086084",
      StreetNumber: "151",
      StreetName: "East 83rd",
      StreetSuffix: "Street",
      ListPrice: 1195000,
      StandardStatus: "Active",
      PublicRemarks: "<p>Residence 2A at 151 East 83rd Street.</p><p>Upon entry&hellip;</p>",
    }, 0);
    expect(listing.description).toBe("Residence 2A at 151 East 83rd Street.\n\nUpon entry…");
  });
});

describe("crm idx mapper — PropertySubType raw contract (2026-10-02 cutover)", () => {
  it("preserves a live null PropertySubType as null, never a fabricated empty string", () => {
    const l = mapTrestleToCrmListing({
      ListingId: "X",
      InternetEntireListingDisplayYN: true,
      InternetAddressDisplayYN: true,
      PropertySubType: null,
    }, 0);
    expect(l.propertySubType).toBeNull();
  });

  it("preserves live enum values unchanged", () => {
    const l = mapTrestleToCrmListing({
      ListingId: "X",
      InternetEntireListingDisplayYN: true,
      InternetAddressDisplayYN: true,
      PropertySubType: "SingleFamilyResidence",
    }, 0);
    expect(l.propertySubType).toBe("SingleFamilyResidence");
  });

  it("[MALLAN_BUSINESS_RULE_UNRESOLVED] mapDisplayPropertyType returns SingleFamilyResidence verbatim -- the dead 'single family'/'house' branch was deleted (2026-10-03 Status residue cutover) without changing this output; no Mallan label has been authorized to replace it", () => {
    expect(mapDisplayPropertyType({ PropertySubType: "SingleFamilyResidence" })).toBe(
      "SingleFamilyResidence",
    );
  });
});

describe("crm idx mapper — ownership raw contract (2026-10-03 CommonInterest cutover)", () => {
  it("preserves a live null CommonInterest as null, never a fabricated empty string", () => {
    const l = mapTrestleToCrmListing({
      ListingId: "X",
      InternetEntireListingDisplayYN: true,
      InternetAddressDisplayYN: true,
      CommonInterest: null,
    }, 0);
    expect(l.ownership).toBeNull();
  });

  it("preserves live enum values unchanged", () => {
    const l = mapTrestleToCrmListing({
      ListingId: "X",
      InternetEntireListingDisplayYN: true,
      InternetAddressDisplayYN: true,
      CommonInterest: "StockCooperative",
    }, 0);
    expect(l.ownership).toBe("StockCooperative");
  });

  it("does not fall back to OwnershipType -- it is a separate, non-RLS-associated field with 0 current accessible rows", () => {
    const l = mapTrestleToCrmListing({
      ListingId: "X",
      InternetEntireListingDisplayYN: true,
      InternetAddressDisplayYN: true,
      CommonInterest: null,
      OwnershipType: "Condominium",
    }, 0);
    expect(l.ownership).toBeNull();
  });
});
