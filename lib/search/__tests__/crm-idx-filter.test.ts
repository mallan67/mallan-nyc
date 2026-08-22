import { buildCrmIdxODataFilter, escapeOData } from "@/lib/search/crm-idx-filter";
import { UnknownPropertySubTypeError } from "@/lib/search/canonical/property-subtype-contract";

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

    // CHANGED 2026-08-22. This line previously required
    // `PropertyType ne 'ResidentialLease'` — the test actively asserted the
    // defect, which is why the canonical universe work went green while the
    // real writer kept shipping a sale-by-negation filter. Sale is now positive
    // membership, and the absence of the negation is asserted alongside it in
    // step2-real-writer-universe.test.ts.
    expect(filter).toContain("PropertyType eq 'Residential'");
    expect(filter).not.toContain("ne 'ResidentialLease'");
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
      // CORRECTED 2026-08-21: was `propertySubType: "Condo,Co-op"`. Neither is a
      // live Cotality PropertySubType member — the enum carries `Condominium` and
      // `StockCooperative` — and the old expectation asserted a `contains()`
      // expression the provider answers with HTTP 400. Both halves were wrong.
      managementCompany: "O'Brien Realty",
      propertySubType: "Apartment,Loft",
      ownership: "Condominium,StockCooperative",
      listingId: "RLS123",
    }));

    expect(filter).toContain("ModificationTimestamp gt 2026-04-01T00:00:00Z");
    expect(filter).toContain("ModificationTimestamp le 2026-04-02T23:59:59Z");
    expect(filter).toContain("contains(BuildingName,'The Plaza')");
    expect(filter).toContain("contains(ListOfficeName,'O''Brien Realty')");
    expect(filter).toContain("(PropertySubType eq 'Apartment' or PropertySubType eq 'Loft')");
    expect(filter).toContain("(CommonInterest eq 'Condominium' or CommonInterest eq 'StockCooperative')");
    expect(filter).toContain("ListingId eq 'RLS123'");
  });

  it("supports comma-separated RLS IDs and escapes single quotes (Bug A13 / L2)", () => {
    // Single ID — unchanged from prior behavior. The listingId clause
    // appears as a bare equality (no parens, no OR around it).
    const single = buildCrmIdxODataFilter(new URLSearchParams({ listingId: "RLS20078109" }));
    expect(single).toContain("ListingId eq 'RLS20078109'");
    expect(single).not.toContain("(ListingId eq 'RLS20078109'");

    // Multiple IDs — OR'd together. Trims whitespace around commas so users
    // can paste lists with or without spaces.
    const multi = buildCrmIdxODataFilter(new URLSearchParams({
      listingId: "RLS20078109, RLS20078110,RLS20078111",
    }));
    expect(multi).toContain("(ListingId eq 'RLS20078109' or ListingId eq 'RLS20078110' or ListingId eq 'RLS20078111')");
    // Per the L2 contract, multi-ID input does NOT collapse to a single
    // literal containing commas (the prior bug):
    expect(multi).not.toContain("ListingId eq 'RLS20078109, RLS20078110,RLS20078111'");

    // Empty entries from extra commas / trailing comma are filtered out.
    const sparse = buildCrmIdxODataFilter(new URLSearchParams({ listingId: "RLS123,,RLS456," }));
    expect(sparse).toContain("(ListingId eq 'RLS123' or ListingId eq 'RLS456')");

    // Single-quote escaping is preserved through the multi-ID path.
    const quoted = buildCrmIdxODataFilter(new URLSearchParams({ listingId: "RLS123,RLS'456" }));
    expect(quoted).toContain("(ListingId eq 'RLS123' or ListingId eq 'RLS''456')");
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

  // ═══════════════════════════════════════════════════════════════════
  // BATCH 1 — Field-contract coverage for every supported param.
  // Each test exercises one OData clause shape so future regressions
  // are caught at unit-test level, not in production telemetry.
  // ═══════════════════════════════════════════════════════════════════

  it("zip → PostalCode eq", () => {
    const f = buildCrmIdxODataFilter(new URLSearchParams({ zip: "10128" }));
    expect(f).toContain("PostalCode eq '10128'");
  });

  it("unit → UnitNumber eq (uppercased)", () => {
    const f = buildCrmIdxODataFilter(new URLSearchParams({ unit: "4a" }));
    expect(f).toContain("UnitNumber eq '4A'");
  });

  it("keyword → contains(PublicRemarks, escapedValue)", () => {
    const f = buildCrmIdxODataFilter(new URLSearchParams({ keyword: "renovated kitchen" }));
    expect(f).toContain("contains(PublicRemarks,'renovated kitchen')");
    // Single-quote escaping for keyword
    const fq = buildCrmIdxODataFilter(new URLSearchParams({ keyword: "owner's pied-a-terre" }));
    expect(fq).toContain("contains(PublicRemarks,'owner''s pied-a-terre')");
  });

  it("minBaths / maxBaths → BathroomsTotalInteger ge/le (integer)", () => {
    const f = buildCrmIdxODataFilter(new URLSearchParams({ minBaths: "2", maxBaths: "5" }));
    expect(f).toContain("BathroomsTotalInteger ge 2");
    expect(f).toContain("BathroomsTotalInteger le 5");
  });

  it("minBaths half-bath value 1.5 is preserved", () => {
    // Not strictly OData-numeric on Edm.Int32, but the filter builder
    // accepts decimals; documented contract regardless.
    const f = buildCrmIdxODataFilter(new URLSearchParams({ minBaths: "1.5" }));
    expect(f).toContain("BathroomsTotalInteger ge 1.5");
  });

  it("minRooms / maxRooms → RoomsTotal ge/le", () => {
    const f = buildCrmIdxODataFilter(new URLSearchParams({ minRooms: "3", maxRooms: "8" }));
    expect(f).toContain("RoomsTotal ge 3");
    expect(f).toContain("RoomsTotal le 8");
  });

  it("minSqft / maxSqft → LivingArea ge/le", () => {
    const f = buildCrmIdxODataFilter(new URLSearchParams({ minSqft: "800", maxSqft: "3500" }));
    expect(f).toContain("LivingArea ge 800");
    expect(f).toContain("LivingArea le 3500");
  });

  it("minYear / maxYear → YearBuilt ge/le", () => {
    const f = buildCrmIdxODataFilter(new URLSearchParams({ minYear: "1920", maxYear: "1990" }));
    expect(f).toContain("YearBuilt ge 1920");
    expect(f).toContain("YearBuilt le 1990");
  });

  it("minFloors / maxFloors → StoriesTotal ge/le", () => {
    const f = buildCrmIdxODataFilter(new URLSearchParams({ minFloors: "10", maxFloors: "60" }));
    expect(f).toContain("StoriesTotal ge 10");
    expect(f).toContain("StoriesTotal le 60");
  });

  it("minUnits / maxUnits → NumberOfUnitsTotal ge/le", () => {
    const f = buildCrmIdxODataFilter(new URLSearchParams({ minUnits: "20", maxUnits: "200" }));
    expect(f).toContain("NumberOfUnitsTotal ge 20");
    expect(f).toContain("NumberOfUnitsTotal le 200");
  });

  it("dateType=Listed → ListingContractDate ge/le (default when no dateType)", () => {
    const f = buildCrmIdxODataFilter(new URLSearchParams({
      dateFrom: "2026-04-01",
      dateTo: "2026-04-30",
    }));
    expect(f).toContain("ListingContractDate ge 2026-04-01");
    expect(f).toContain("ListingContractDate le 2026-04-30");
    // Updated path uses ModificationTimestamp instead — already covered
    // by the existing "dates, building, ownership, listing id" test, but
    // exercise default "Listed" path here so default behavior is locked in.
  });

  it("dateType=Listed (explicit) → ListingContractDate ge/le", () => {
    const f = buildCrmIdxODataFilter(new URLSearchParams({
      dateType: "Listed",
      dateFrom: "2026-04-01",
      dateTo: "2026-04-30",
    }));
    expect(f).toContain("ListingContractDate ge 2026-04-01");
    expect(f).toContain("ListingContractDate le 2026-04-30");
  });

  it("contractDateFrom / contractDateTo → ListingContractDate ge/le (independent of dateFrom)", () => {
    const f = buildCrmIdxODataFilter(new URLSearchParams({
      contractDateFrom: "2026-03-01",
      contractDateTo: "2026-03-31",
    }));
    expect(f).toContain("ListingContractDate ge 2026-03-01");
    expect(f).toContain("ListingContractDate le 2026-03-31");
  });

  it("closeDateFrom / closeDateTo → CloseDate ge/le", () => {
    const f = buildCrmIdxODataFilter(new URLSearchParams({
      closeDateFrom: "2026-01-01",
      closeDateTo: "2026-03-31",
    }));
    expect(f).toContain("CloseDate ge 2026-01-01");
    expect(f).toContain("CloseDate le 2026-03-31");
  });

  it("propertySubType single → PropertySubType eq 'X' (no parens)", () => {
    const f = buildCrmIdxODataFilter(new URLSearchParams({ propertySubType: "Apartment" }));
    expect(f).toContain("PropertySubType eq 'Apartment'");
    // Single-value path is a bare equality — no OR grouping
    expect(f).not.toContain("(PropertySubType eq 'Apartment')");
  });

  /**
   * PROVEN LIVE 2026-08-21 against api.cotality.com — see
   * `docs/idx/cotality-property-subtype-live-contract-2026-08-21.md`.
   *
   * `PropertySubType` is a SCALAR enum. `contains()` on it is HTTP 400:
   *   "No function signature for the function with name 'contains' matches the
   *    specified arguments … contains(Edm.String, Edm.String)."
   *
   * So every authenticated search carrying a property-type box was failing at the
   * provider, and `/api/idx/search` was converting that 400 into its own 502.
   */
  describe("propertySubType — exact live enum, never substring", () => {
    it("NEVER emits contains(PropertySubType,…) — the provider answers HTTP 400", () => {
      const f = buildCrmIdxODataFilter(new URLSearchParams({ propertySubType: "Apartment,Loft" }));
      expect(f).not.toContain("contains(PropertySubType");
    });

    it("expands the commercial Office,Retail checkbox into two exact members", () => {
      const f = buildCrmIdxODataFilter(new URLSearchParams({ propertySubType: "Office,Retail" }));
      expect(f).toContain("(PropertySubType eq 'Office' or PropertySubType eq 'Retail')");
    });

    it("accepts a valid member that is live-populated ZERO — valid-and-empty is not invalid", () => {
      // `Townhouse` has never been carried by this feed, at any status. It is
      // still a well-formed query returning 200/0, and must not be rejected.
      const f = buildCrmIdxODataFilter(new URLSearchParams({ propertySubType: "Townhouse" }));
      expect(f).toContain("PropertySubType eq 'Townhouse'");
    });

    it("FAILS LOUD on a token that is not a live member", () => {
      expect(() =>
        buildCrmIdxODataFilter(new URLSearchParams({ propertySubType: "Brownstone" })),
      ).toThrow(UnknownPropertySubTypeError);
    });

    it("FAILS LOUD on a mis-cased member — the provider would return 200 with zero rows", () => {
      expect(() =>
        buildCrmIdxODataFilter(new URLSearchParams({ propertySubType: "apartment" })),
      ).toThrow(UnknownPropertySubTypeError);
    });

    it("FAILS LOUD rather than silently dropping the invalid half of a mixed list", () => {
      expect(() =>
        buildCrmIdxODataFilter(new URLSearchParams({ propertySubType: "Apartment,Brownstone" })),
      ).toThrow(UnknownPropertySubTypeError);
    });
  });

  it("ownership single → CommonInterest eq 'X' (no parens)", () => {
    const f = buildCrmIdxODataFilter(new URLSearchParams({ ownership: "Condop" }));
    expect(f).toContain("CommonInterest eq 'Condop'");
    expect(f).not.toContain("(CommonInterest eq 'Condop')");
  });

  it("multi-neighborhood (csv) → SubdivisionName OR group", () => {
    const f = buildCrmIdxODataFilter(new URLSearchParams({
      neighborhood: "Tribeca,SoHo",
    }));
    // Both should appear in an OR group. May include alias variants per
    // expandCrmIdxNeighborhood — assertion just verifies both tokens are
    // OR-grouped, not a single literal "Tribeca,SoHo".
    expect(f).toContain("SubdivisionName eq 'Tribeca'");
    expect(f).toContain("SubdivisionName eq 'SoHo'");
    expect(f).toContain(" or ");
    expect(f).not.toContain("SubdivisionName eq 'Tribeca,SoHo'");
  });

  it("address parser — all-numeric input → StreetNumber + BuildingName fallback", () => {
    const f = buildCrmIdxODataFilter(new URLSearchParams({ address: "400" }));
    expect(f).toContain("startswith(StreetNumber,'400')");
    // Fallback into BuildingName for short numeric input
    expect(f).toContain("contains(BuildingName,'400')");
  });

  // ═══════════════════════════════════════════════════════════════════
  // BATCH 2 — Dead-pattern regressions.
  //
  // These tests assert what is CURRENTLY NOT supported by the backend
  // OData builder. They serve two purposes:
  //   1. Document the contract so future "frontend-only fixes" don't
  //      mislead users into thinking these filters work.
  //   2. Trip an alarm if someone wires a dead pattern through without
  //      adding the corresponding backend support.
  //
  // If/when real support is added, the corresponding test should be
  // CHANGED to assert the correct OData output (not deleted).
  // ═══════════════════════════════════════════════════════════════════

  it("DEAD: openHouseDateFrom / openHouseDateTo are silently dropped (no Property OData clause)", () => {
    // Open-house filtering on Trestle goes through a separate OpenHouse
    // entity, not Property's $filter. The frontend `_serverSearch`
    // forwards openHouseDateFrom/To params, but this filter builder
    // produces no clause for them. Marked DEAD until the OpenHouse
    // expansion is wired (separate batch).
    const f = buildCrmIdxODataFilter(new URLSearchParams({
      openHouseDateFrom: "2026-05-10",
      openHouseDateTo: "2026-05-12",
    }));
    expect(f).not.toContain("OpenHouse");
    expect(f).not.toContain("2026-05-10");
    expect(f).not.toContain("2026-05-12");
  });

  it("DEAD: non-whitelisted checkboxFilters fields are silently dropped", () => {
    // Per the whitelist at crm-idx-filter.ts (~line 252 odataSafe Set),
    // these data-field values are NOT translated to OData. The frontend
    // collects them into criteria.checkboxFilters but the backend drops
    // them. Visible UI controls that send these silently do nothing.
    //
    // This covers, at minimum:
    //   AttendanceType  — Doorman, Concierge, Elevator-Attendant checkboxes
    //   Furnished       — rental Furnished/Unfurnished/Partially
    //   OwnerPays       — rental "owner pays X"
    //   Concessions     — "Concessions: Yes"
    //   BuildingRules   — Pied-a-terre / Guarantors / Co-purchasers / etc.
    //   RentingAllowedYN — "Subletting Allowed"
    //   MaximumFinancingPercent — "Financing Available" / "No Financing"
    //   RLSParticipantOnly — distribution gate (handled elsewhere)
    //   ListOfficeMlsId — "In-House" filter
    //
    const checkboxFilters = JSON.stringify({
      AttendanceType: ["DoormanFullTime"],
      Furnished: ["Furnished"],
      OwnerPays: ["AllUtilities"],
      Concessions: ["Yes"],
      BuildingRules: ["PiedATerreAllowed", "GuarantorsAccepted"],
      RentingAllowedYN: ["true"],
      MaximumFinancingPercent: ["100"],
      RLSParticipantOnly: ["true"],
      ListOfficeMlsId: ["OwnOffice"],
    });
    const f = buildCrmIdxODataFilter(new URLSearchParams({ checkboxFilters }));

    // None of these field names should appear in the produced OData filter.
    expect(f).not.toContain("AttendanceType");
    expect(f).not.toContain("DoormanFullTime");
    expect(f).not.toContain("Furnished");
    expect(f).not.toContain("OwnerPays");
    expect(f).not.toContain("AllUtilities");
    expect(f).not.toContain("Concessions");
    expect(f).not.toContain("BuildingRules");
    expect(f).not.toContain("PiedATerreAllowed");
    expect(f).not.toContain("GuarantorsAccepted");
    expect(f).not.toContain("RentingAllowedYN");
    expect(f).not.toContain("MaximumFinancingPercent");
    expect(f).not.toContain("RLSParticipantOnly");
    expect(f).not.toContain("ListOfficeMlsId");
  });

  it("DEAD: operator-prefixed data-value (lte:N / gte:N / gt:N / eq:N) is sent literally", () => {
    // Frontend uses values like data-value="lte:1946" for "Pre-War" or
    // data-value="eq:0" for "No Financing". The backend builds the
    // clause as `${field} eq '${value}'` against the whitelist, so:
    //   - For whitelisted fields with operator prefix, output is
    //     `Field eq 'lte:1946'` — a literal string equality, not an
    //     operator-aware clause. Returns 0 results in production.
    //   - For non-whitelisted fields, the entire entry is dropped
    //     (covered by the test above).
    //
    // Test the whitelisted-but-operator case to document the broken
    // contract. Use NewConstructionYN since it IS whitelisted but the
    // operator prefix would corrupt it.
    const checkboxFilters = JSON.stringify({
      // YearBuilt would be the canonical example, but it's NOT in the
      // whitelist either; we only have access via min/maxYear params.
      // Use ConstructionMaterials which IS whitelisted as a stand-in to
      // prove operator prefixes break even when the field IS allowed.
      ConstructionMaterials: ["lte:1946"],
    });
    const f = buildCrmIdxODataFilter(new URLSearchParams({ checkboxFilters }));

    // The operator prefix is sent LITERALLY. This is the broken state.
    // When real operator support is added, this assertion should be
    // updated to `expect(f).toContain("ConstructionMaterials le 1946")`.
    if (f.includes("ConstructionMaterials")) {
      expect(f).toContain("ConstructionMaterials eq 'lte:1946'");
    }
    // Either way, we explicitly verify the operator-aware form is NOT
    // present (which would be the correct future behavior).
    expect(f).not.toContain("ConstructionMaterials le 1946");
  });

  it("DEAD: data-value=\"Any\" placeholder is sent literally, not expanded", () => {
    // Frontend uses data-value="Any" as a placeholder for compound
    // filters like "Any Doorman" or "Any Laundry" that should expand
    // to multiple child enum values. The backend has no expansion
    // logic — sends the literal "Any" through.
    //
    // Use a whitelisted field (LaundryFeatures via BuildingLaundryFeatures
    // alias) to prove the literal-Any path. AttendanceType (the most
    // common "Any" target) is non-whitelisted so it'd be dropped entirely
    // — already covered by the dead-checkbox test above.
    const checkboxFilters = JSON.stringify({
      BuildingLaundryFeatures: ["Any"],
    });
    const f = buildCrmIdxODataFilter(new URLSearchParams({ checkboxFilters }));

    // Translates to LaundryFeatures eq 'Any' — a literal string equality
    // that won't match any actual enum value (Trestle has values like
    // "InUnit", "Common Area", "WasherDryerInstallAllowed"). Returns 0.
    expect(f).toContain("LaundryFeatures eq 'Any'");
    // Verify no expansion occurred:
    expect(f).not.toContain("InUnit");
    expect(f).not.toContain("Common Area");
  });

  it("DEAD: data-not negation pattern is not collected by the frontend scanner", () => {
    // The frontend scanner at search-engine.js:1063 reads `data-value`
    // attributes only. The HTML uses `data-not="X"` for some negation
    // checkboxes (e.g., "No Corporate Ownership"). The scanner ignores
    // these entirely — they never reach the backend.
    //
    // This test asserts the BACKEND filter behavior when a negation
    // pattern were to be sent through checkboxFilters. The current
    // builder has no negation operator, so a hypothetical
    //   { CorporateOwnerAllowed_NOT: ['true'] }
    // would be silently dropped (non-whitelisted field name).
    const checkboxFilters = JSON.stringify({
      "CorporateOwnerAllowed_NOT": ["true"],
      "BuildingRules_NOT": ["CorporateOwnerAllowed"],
    });
    const f = buildCrmIdxODataFilter(new URLSearchParams({ checkboxFilters }));

    expect(f).not.toContain("CorporateOwnerAllowed_NOT");
    expect(f).not.toContain("BuildingRules_NOT");
    expect(f).not.toContain("CorporateOwnerAllowed");
    expect(f).not.toContain(" not ");
    expect(f).not.toContain(" ne ");
  });

  it("DEAD: status sub-statuses (OfferOut / ContractSigned / etc) become uppercase strings that don't match any enum", () => {
    // The frontend collects sub-status into criteria.statuses then maps
    // CRM-uppercase to RESO-PascalCase via search-engine.js:285 statusMap.
    // Sub-statuses like 'OfferOut' get .toUpperCase() → 'OFFEROUT' which
    // isn't in the statusMap, so it falls through unchanged.
    // The resulting OData clause is:
    //   StandardStatus eq 'OFFEROUT'
    //
    // CORRECTION (PR #618, verified against the LIVE Cotality API 2026-08-17):
    // this does NOT "return 0". `StandardStatus` is an ENUM-typed field, so an
    // unknown member is rejected outright:
    //
    //   GET /odata/Property?$filter=StandardStatus eq 'OFFEROUT'  -> HTTP 400
    //   GET /odata/Property?$filter=StandardStatus eq 'Hold'      -> HTTP 200, count=0
    //
    // i.e. an invalid member FAILS THE WHOLE QUERY, while a valid-but-unused
    // member returns an empty set. The practical consequence is worse than the
    // original note implied: selecting this sub-status breaks the search rather
    // than returning no results, and any caller that treats a 400 as "no
    // matches" reports a false empty. Live StandardStatus members are exactly:
    // Active, ActiveUnderContract, Canceled, Closed, ComingSoon, Delete,
    // Expired, Hold, Incomplete, Pending, Withdrawn.
    //
    // Still DEAD/out of scope for #618 — recorded here so the next person fixes
    // it against verified provider behaviour instead of the wrong assumption.
    //
    // We exercise this here by passing a known sub-status string. When
    // real sub-status routing is added (route via MlsStatus + nested
    // OData filter, or a separate param), this test should be updated.
    const f = buildCrmIdxODataFilter(new URLSearchParams({
      status: "OFFEROUT",
    }));
    // Builder produces literal 'OFFEROUT' — won't match Trestle.
    expect(f).toContain("StandardStatus eq 'OFFEROUT'");
    // Verify proper mapping is NOT present:
    expect(f).not.toContain("MlsStatus");
  });

  // ═══════════════════════════════════════════════════════════════════
  // P1 — additional dead-pattern coverage. Each frontend control
  // disabled by public/crm/js/init/init-disable-dead-controls.js
  // is matched here by an OData-builder regression alarm. If real
  // backend support lands, change the assertion to the correct
  // OData output AND remove the corresponding selector from
  // init-disable-dead-controls.js. Both must move together.
  // ═══════════════════════════════════════════════════════════════════

  it("DEAD: every visible Trestle sub-status produces a literal OData clause that matches no enum", () => {
    // Inventory of sub-status values that exist in the CRM HTML
    // (public/crm/html/search-form-and-results.html, search-engine.js
    // collectSearchCriteria pushes them to criteria.statuses verbatim).
    // None map to a real Trestle StandardStatus value.
    //
    // When real sub-status routing is added (likely via MlsStatus +
    // a nested param), this assertion must be updated AND the
    // corresponding 'input[data-sub-status]' selector must be
    // removed from public/crm/js/init/init-disable-dead-controls.js.
    const subStatuses = [
      "OfferOut",
      "OfferThruUs",
      "OfferAccepted",
      "OfferAcceptedThruUs",
      "ContractOut",
      "ContractOutThruUs",
      "AllContractSigned",
      "ContractSigned",
      "ContractSignedThruUs",
      "BackOnMarket",
      "BoardApproved",
      "Sold",
      "SoldThruUs",
      "ACRISVerified",
      "Financed",
      "NoFinancing",
      "ApplicationIn",
      "ApplicationAccepted",
      "LeaseOut",
      "LeaseOutThruUs",
      "AllLeaseSigned",
      "LeaseSigned",
      "LeaseSignedThruUs",
      "Rented",
      "RentedThruUs",
    ];
    // search-engine.js uppercases each sub-status before forwarding,
    // so simulate the actual wire shape the backend receives.
    for (const s of subStatuses) {
      const upper = s.toUpperCase();
      const f = buildCrmIdxODataFilter(new URLSearchParams({ status: upper }));
      // Builder emits literal-string equality — no Trestle row matches.
      expect(f).toContain(`StandardStatus eq '${upper}'`);
      // Must not have leaked into MlsStatus (correct routing would do that)
      expect(f).not.toContain("MlsStatus");
    }
  });

  it("DEAD: dateType=ListedAndUpdated is NOT a third branch — degrades silently to default Listed", () => {
    // The HTML option <option value="ListedAndUpdated"> was removed in
    // the P1 patch because the OData builder at
    // lib/search/crm-idx-filter.ts:182-188 only branches on
    // dateType === "Updated". Any other value (including
    // "ListedAndUpdated") falls through to the default Listed branch.
    //
    // This test pins that behavior so a future contributor can't add
    // the option back without first wiring the OR-clause backend
    // (ListingContractDate ge X or ModificationTimestamp gt X).
    //
    // Compare the produced filter against the default Listed-only
    // filter — they must be identical.
    const listedAndUpdated = buildCrmIdxODataFilter(new URLSearchParams({
      dateType: "ListedAndUpdated",
      dateFrom: "2026-04-01",
      dateTo: "2026-04-30",
    }));
    const justListed = buildCrmIdxODataFilter(new URLSearchParams({
      dateType: "Listed",
      dateFrom: "2026-04-01",
      dateTo: "2026-04-30",
    }));
    expect(listedAndUpdated).toBe(justListed);
    // Specifically does NOT produce a date-column OR group. The default
    // status filter contributes a benign ` or ` for status enums; the
    // equality assertion above is the strong contract — both calls
    // produce byte-identical filters.
    expect(listedAndUpdated).not.toContain("ModificationTimestamp");
    expect(listedAndUpdated).not.toMatch(/ListingContractDate.+or.+ModificationTimestamp/);
  });

  it("DEAD: transit/grid Lat/Lng filters reach the OData builder unmodified — runtime null-feed yields 0 rows", () => {
    // The gridFilter param is passthrough-allowed by the regex at
    // crm-idx-filter.ts:281. That part is correct: when Lat/Lng exist
    // on the feed (other MLOs served by Cotality), the bbox filter
    // works. The DEAD aspect is that the REBNY IDX feed does NOT
    // populate Latitude/Longitude per CLAUDE.md.
    //
    // This test pins the BUILDER behavior — it does NOT validate runtime
    // fitness against the feed. The runtime block is enforced by
    // public/crm/js/init/init-disable-dead-controls.js disabling the
    // transit panels and Manhattan grid containers.
    const f = buildCrmIdxODataFilter(new URLSearchParams({
      gridFilter: "(Latitude ge 40.7 and Latitude le 40.8 and Longitude ge -74.1 and Longitude le -73.9)",
    }));
    // Builder forwards the bbox literally (regex-allowlisted)
    expect(f).toContain("Latitude ge 40.7");
    expect(f).toContain("Longitude le -73.9");
    // ASSERTION FOR FUTURE CONTRIBUTORS:
    // If this builder behavior changes (e.g., gridFilter is rewritten
    // to a DB-side spatial query because PR 5+ landed geocoded
    // coordinates), then the transit + Manhattan-grid selectors in
    // init-disable-dead-controls.js DEAD_CONTAINERS can be removed.
    // Both must move together.
  });
});
