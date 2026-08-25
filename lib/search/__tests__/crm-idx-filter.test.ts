import { buildCrmIdxODataFilter, escapeOData, UnsupportedSearchCriterionError } from "@/lib/search/crm-idx-filter";
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
    expect(filter).toContain("(StandardStatus eq 'Active' or StandardStatus eq 'ComingSoon' or StandardStatus eq 'ActiveUnderContract')");
  });

  it("builds rental status filters", () => {
    const filter = buildCrmIdxODataFilter(new URLSearchParams({
      type: "rental",
      // RETARGETED 2026-08-22: criteria carry EXACT Cotality members. The spaced
      // spellings are not members; a saved search holding them is migrated at
      // lib/search/legacy-saved-search-status-migration.ts before it reaches the
      // writer, and reaching the writer un-migrated now fails loudly by design.
      status: "ComingSoon,ActiveUnderContract",
    }));

    expect(filter).toContain("PropertyType eq 'ResidentialLease'");
    expect(filter).toContain("(StandardStatus eq 'ComingSoon' or StandardStatus eq 'ActiveUnderContract')");
  });

  // ── Geography is HELD, and the hold is fail-closed ────────────────────────
  //
  // RETARGETED 2026-08-24 (48978094). These previously asserted
  // `borough -> CityRegion eq` and `neighborhood -> SubdivisionName eq`.
  // Cotality exposes SubdivisionName, CityRegion, CountyOrParish,
  // MLSAreaMajor/Minor and PostalCity as distinct facts whose equivalence to
  // the Mallan neighborhood/borough concepts is not proven against the live
  // contract, and the old alias files are not provider authority.
  //
  // The criterion THROWS rather than being dropped. Dropping it would remove
  // the geographic narrowing and answer a broader question under HTTP 200 —
  // strictly worse than a visible 400, and the same silent-widening failure
  // mode the status pass exists to remove.
  it("fails closed on a borough criterion instead of guessing a provider field", () => {
    expect(() => buildCrmIdxODataFilter(new URLSearchParams({ borough: "Manhattan" })))
      .toThrow(UnsupportedSearchCriterionError);
  });

  it("fails closed on a neighborhood criterion instead of guessing a provider field", () => {
    expect(() => buildCrmIdxODataFilter(new URLSearchParams({ neighborhood: "NoSuchNeighborhoodForAlias" })))
      .toThrow(UnsupportedSearchCriterionError);
  });

  it("never silently drops geography, which would widen the search", () => {
    // The specific regression guarded: a dropped criterion returns a filter
    // that looks successful while answering a different question.
    let filter: string | null = null;
    try {
      filter = buildCrmIdxODataFilter(new URLSearchParams({ type: "sale", borough: "Manhattan" }));
    } catch {
      filter = null;
    }
    expect(filter).toBeNull();
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
      propertySubType: "Apartment,Loft",
      ownership: "Condominium,StockCooperative",
      listingId: "RLS123",
    }));

    expect(filter).toContain("ModificationTimestamp gt 2026-04-01T00:00:00Z");
    expect(filter).toContain("ModificationTimestamp le 2026-04-02T23:59:59Z");
    expect(filter).toContain("contains(BuildingName,'The Plaza')");
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

  it("fails closed on a managementCompany criterion", () => {
    // Cotality declares no ManagementCompany Property field. Listing office is
    // a DIFFERENT fact; substituting `ListOfficeName` answered a question the
    // broker did not ask while looking like a successful management-company
    // search.
    expect(() => buildCrmIdxODataFilter(new URLSearchParams({ managementCompany: "O'Brien Realty" })))
      .toThrow(UnsupportedSearchCriterionError);
  });

  it("applies a boolean checkbox filter", () => {
    const filter = buildCrmIdxODataFilter(new URLSearchParams({
      checkboxFilters: JSON.stringify({ CoolingYN: ["true"] }),
    }));
    expect(filter).toContain("CoolingYN eq true");
  });

  it("fails closed on a non-boolean checkbox field rather than dropping it", () => {
    // RETARGETED 2026-08-24 (48978094). Previously these were silently dropped
    // and the test asserted the DROP. A dropped narrowing criterion widens the
    // result set under HTTP 200 — the broker sees more inventory than they
    // asked for with nothing to indicate the filter never ran.
    for (const field of ["BuildingLaundryFeatures", "AvailableLeaseType", "UnsafeField"]) {
      expect(() => buildCrmIdxODataFilter(new URLSearchParams({
        checkboxFilters: JSON.stringify({ [field]: ["x"] }),
      }))).toThrow(UnsupportedSearchCriterionError);
    }
  });

  it("fails closed on a caller-supplied coordinate gridFilter", () => {
    // Coordinates are map support, not a canonical Search axis, and a raw
    // caller-supplied predicate is never accepted as a provider criterion.
    expect(() => buildCrmIdxODataFilter(new URLSearchParams({
      gridFilter: "(Latitude ge 40.7 and Latitude le 40.8 and Longitude ge -74.1 and Longitude le -73.9)",
    }))).toThrow(UnsupportedSearchCriterionError);
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

  it("multi-neighborhood (csv) fails closed and names every rejected value", () => {
    // RETARGETED 2026-08-24 (48978094). Previously asserted a SubdivisionName
    // OR group. Geography is held: SubdivisionName is one of several distinct
    // Cotality facts and its equivalence to the Mallan neighborhood concept is
    // unproven, so it is not silently chosen as the neighborhood field.
    try {
      buildCrmIdxODataFilter(new URLSearchParams({ neighborhood: "Tribeca,SoHo" }));
      throw new Error("expected buildCrmIdxODataFilter to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(UnsupportedSearchCriterionError);
      // Every rejected value is reported, not just the first — a broker
      // restoring a saved search needs the whole list to repair it.
      expect((err as UnsupportedSearchCriterionError).message).toContain("Tribeca");
      expect((err as UnsupportedSearchCriterionError).message).toContain("SoHo");
    }
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

  it("UNSUPPORTED: non-boolean checkboxFilters fields fail closed instead of being dropped", () => {
    // RETARGETED 2026-08-24 (48978094). This group previously asserted that
    // these controls were SILENTLY DROPPED, and called that "DEAD". Silence was
    // the defect: a broker ticking "Doorman" got every listing back, HTTP 200,
    // with nothing to say the filter never ran. The backend now throws, so an
    // unsupported control is visible as a typed 400 instead of a wider result
    // set wearing the costume of a narrower one.
    //
    // These UI controls remain unsupported by the provider contract. What
    // changed is only that saying so is now loud.
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
    const unsupported: Record<string, string[]> = {
      AttendanceType: ["DoormanFullTime"],
      Furnished: ["Furnished"],
      OwnerPays: ["AllUtilities"],
      Concessions: ["Yes"],
      BuildingRules: ["PiedATerreAllowed", "GuarantorsAccepted"],
      MaximumFinancingPercent: ["100"],
      ListOfficeMlsId: ["OwnOffice"],
    };

    for (const [field, values] of Object.entries(unsupported)) {
      expect(() => buildCrmIdxODataFilter(new URLSearchParams({
        checkboxFilters: JSON.stringify({ [field]: values }),
      }))).toThrow(UnsupportedSearchCriterionError);
    }
  });

  it("names the rejected criterion so the broker learns which control failed", () => {
    // A 400 that does not say WHICH filter is unsupported just moves the
    // confusion rather than removing it.
    try {
      buildCrmIdxODataFilter(new URLSearchParams({
        checkboxFilters: JSON.stringify({ AttendanceType: ["DoormanFullTime"] }),
      }));
      throw new Error("expected buildCrmIdxODataFilter to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(UnsupportedSearchCriterionError);
      expect((err as UnsupportedSearchCriterionError).message).toContain("AttendanceType");
    }
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
    // RETARGETED 2026-08-24. Previously this asserted the prefix was sent
    // LITERALLY as `ConstructionMaterials eq 'lte:1946'` — a clause that
    // matches zero rows while returning HTTP 200, i.e. "Pre-War" quietly
    // meaning "nothing". The criterion is now rejected outright.
    expect(() => buildCrmIdxODataFilter(new URLSearchParams({
      checkboxFilters: JSON.stringify({ ConstructionMaterials: ["lte:1946"] }),
    }))).toThrow(UnsupportedSearchCriterionError);
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
    // RETARGETED 2026-08-24. Previously asserted `LaundryFeatures eq 'Any'` —
    // a literal equality against a value the provider enum does not contain,
    // so "Any Laundry" reliably returned zero. Rejected outright now.
    expect(() => buildCrmIdxODataFilter(new URLSearchParams({
      checkboxFilters: JSON.stringify({ BuildingLaundryFeatures: ["Any"] }),
    }))).toThrow(UnsupportedSearchCriterionError);
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
    // RETARGETED 2026-08-24. The builder still has no negation operator, and a
    // `_NOT` field name is still not a provider field. It is now rejected
    // rather than dropped, so a negation that cannot be expressed can no
    // longer masquerade as one that ran.
    for (const field of ["CorporateOwnerAllowed_NOT", "BuildingRules_NOT"]) {
      expect(() => buildCrmIdxODataFilter(new URLSearchParams({
        checkboxFilters: JSON.stringify({ [field]: ["true"] }),
      }))).toThrow(UnsupportedSearchCriterionError);
    }
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
    // FIXED 2026-08-22 (was: "Still DEAD/out of scope for #618"). The writer now
    // admits only real StandardStatus members and drops anything else with a
    // warning, so a Mallan-only sub-status can no longer break a whole search by
    // reaching the provider as an invalid enum member.
    //
    // We exercise this here by passing a known sub-status string. When
    // real sub-status routing is added (route via MlsStatus + nested
    // OData filter, or a separate param), this test should be updated.
    // FIXED 2026-08-22, then CORRECTED. An invalid enum member fails the WHOLE
    // query with HTTP 400, so a caller treating that as "no matches" reports a
    // false empty. Dropping the criterion instead is WORSE — it removes the
    // status clause and widens the search to every status, with an HTTP 200 and
    // nothing to show the question changed. It now throws, and the route renders
    // the typed UNSUPPORTED_CRITERION 400 already used for PropertySubType.
    expect(() => buildCrmIdxODataFilter(new URLSearchParams({ status: "OFFEROUT" }))).toThrow(
      /Unsupported status criterion/,
    );
    // And a VALID status still renders normally, so the fail-closed behaviour is
    // scoped to unsupported tokens rather than disabling the criterion wholesale.
    // MlsStatus must never appear either way: it is a different vocabulary AND
    // the provider suppresses it for filtering (HTTP 400), verified live.
    const valid = buildCrmIdxODataFilter(new URLSearchParams({ status: "Active" }));
    expect(valid).toContain("StandardStatus eq 'Active'");
    expect(valid).not.toContain("MlsStatus");
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
      // FIXED 2026-08-22, then CORRECTED to fail CLOSED. These Mallan-only
      // sub-statuses used to be emitted as `StandardStatus eq '<UPPER>'`, and an
      // unknown enum member fails the WHOLE query with HTTP 400 rather than
      // returning zero rows. Silently dropping them is worse still: the status
      // clause disappears and the search widens to every status. Each one now
      // raises UnsupportedStatusCriterionError, which the route renders as a
      // typed 400 naming the offending value.
      expect(() => buildCrmIdxODataFilter(new URLSearchParams({ status: upper }))).toThrow(
        /Unsupported status criterion/,
      );
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

  it("UNSUPPORTED: a caller-supplied Lat/Lng gridFilter is rejected, not forwarded", () => {
    // RETARGETED 2026-08-24 (48978094). This previously asserted that the
    // builder FORWARDED a caller-supplied bbox literally, via a regex
    // allowlist. Two problems collapsed into one: the REBNY IDX feed does not
    // populate Latitude/Longitude, so the clause matched zero rows at runtime;
    // and accepting a raw caller-authored OData fragment as a provider
    // criterion is a passthrough this codebase should not have.
    //
    // Coordinates are map support, not a canonical Search axis. The criterion
    // is now rejected at the boundary instead of producing a query that
    // returns nothing while looking like it ran.
    //
    // FOR FUTURE CONTRIBUTORS: if geocoded coordinates land on the projection
    // (master plan PR 5) and a real spatial axis is added, it must arrive as a
    // structured criterion the builder composes — never as a caller-supplied
    // fragment — and the transit + Manhattan-grid selectors in
    // init-disable-dead-controls.js DEAD_CONTAINERS move at the same time.
    expect(() => buildCrmIdxODataFilter(new URLSearchParams({
      gridFilter: "(Latitude ge 40.7 and Latitude le 40.8 and Longitude ge -74.1 and Longitude le -73.9)",
    }))).toThrow(UnsupportedSearchCriterionError);
  });
});
