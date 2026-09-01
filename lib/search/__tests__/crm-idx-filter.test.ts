import { buildCrmIdxODataFilter, escapeOData, UnsupportedSearchCriterionError } from "@/lib/search/crm-idx-filter";
import { isMallanLocalIdentifier } from "@/lib/listings/mallan-source-identity";
import { maxBathsOData, minBathsOData } from "@/lib/search/canonical/bath-contract";
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
    // CHANGED 2026-08-30 (Section 5). These asserted
    // `BathroomsTotalInteger ge 1.5` / `le 3` — a field `bath-contract.ts` had
    // already REJECTED on an exhaustive 8,103-row live read, and an Edm.Int32
    // that cannot carry 1.5 at all. The test was pinning the defect: the Prisma
    // engine used the contract while this path used the rejected field, so the
    // two engines answered the same bath question differently.
    expect(filter).toContain(minBathsOData(1.5));
    expect(filter).toContain(maxBathsOData(3));
    expect(filter).not.toContain("BathroomsTotalInteger");
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

  // ── Geography is RELEASED, and still fail-closed ──────────────────────────
  //
  // This section read "Geography is HELD" and said the equivalence between
  // Cotality's geography facts and the Mallan concepts was not proven. That was
  // true when it was written and is no longer: the hold was lifted for borough on
  // 2026-08-26 against the live CityRegion probe, and for neighbourhood on
  // 2026-08-31 against a full-feed census of 591,409 rows that produced the
  // generated canonical vocabulary these tests now assert against.
  //
  // CountyOrParish is still a COUNTY and is never substituted for a borough, and
  // the retired alias files are still not provider authority — those parts of the
  // original note stand.
  //
  // What has NOT changed is the fail-closed rule: the criterion THROWS rather than
  // being dropped, because dropping it removes the geographic narrowing and
  // answers a broader question under HTTP 200 — strictly worse than a visible 400.
  it("renders a borough as the verified CityRegion predicate", () => {
    expect(buildCrmIdxODataFilter(new URLSearchParams({ borough: "Manhattan" })))
      .toContain("CityRegion eq 'Manhattan'");
  });

  it("sends the PROVIDER spelling for Staten Island, not the human one", () => {
    // The provider spells it 'StatenIsland'. The human spelling is a valid
    // filter that matches zero rows — a whole borough silently missing.
    const filter = buildCrmIdxODataFilter(new URLSearchParams({ borough: "Staten Island" }));
    expect(filter).toContain("CityRegion eq 'StatenIsland'");
    expect(filter).not.toContain("CityRegion eq 'Staten Island'");
  });

  it("renders a multi-borough selection as one disjunction", () => {
    expect(buildCrmIdxODataFilter(new URLSearchParams({ borough: "Manhattan,Brooklyn" })))
      .toContain("(CityRegion eq 'Manhattan' or CityRegion eq 'Brooklyn')");
  });

  it("renders a neighborhood as a SubdivisionName predicate", () => {
    expect(buildCrmIdxODataFilter(new URLSearchParams({ neighborhood: "Murray Hill" })))
      .toContain("SubdivisionName eq 'Murray Hill'");
  });

  it("still fails closed on a value with no live provider counterpart", () => {
    // Geography is released from hold, but the fail-closed rule is not: a
    // dropped criterion widens the search while returning HTTP 200.
    expect(() => buildCrmIdxODataFilter(new URLSearchParams({ borough: "Hoboken" }))).toThrow();
  });

  it("never silently drops geography, which would widen the search", () => {
    // The regression this has always guarded, now stated positively: a valid
    // borough must APPEAR in the filter, not vanish from it.
    const filter = buildCrmIdxODataFilter(new URLSearchParams({ type: "sale", borough: "Manhattan" }));
    expect(filter).toContain("CityRegion eq 'Manhattan'");
    expect(filter).toContain("PropertyType eq 'Residential'");
  });

  it("supports status wildcard for tracker-style total counts", () => {
    const filter = buildCrmIdxODataFilter(new URLSearchParams("status=*"));

    expect(filter).not.toContain("StandardStatus");
  });

  it("escapes OData strings and builds address filters", () => {
    expect(escapeOData("Broker's Open")).toBe("Broker''s Open");

    const withDirection = buildCrmIdxODataFilter(new URLSearchParams("address=400 East 90th Street"));
    expect(withDirection).toContain("StreetNumber eq '400'");
    expect(withDirection).toContain("StreetDirPrefix eq 'E'");
    expect(withDirection).toContain("contains(StreetName,'90')");

    const textOnly = buildCrmIdxODataFilter(new URLSearchParams("address=Park Avenue"));
    expect(textOnly).toContain("contains(StreetName,'PARK')");
    expect(textOnly).toContain("contains(BuildingName,'PARK AVENUE')");
  });

  describe("a street NUMBER is matched exactly, never as a prefix", () => {
    // LIVE COTALITY 2026-08-31. `startswith` was chosen because the provider
    // accepts it — which proves Cotality parses the function, not that it answers
    // the broker's question. Measured, it does not:
    //
    //   startswith(StreetNumber,'4')     64,603 rows, of which 63,362 (98.1%)
    //                                    are NOT street number 4 — they are 40,
    //                                    400, 4000, 4A…
    //   startswith(StreetNumber,'40')    12,582 rows, 9,465 (75.2%) not 40
    //   startswith(StreetNumber,'400')    3,561 rows,    73 (2.1%) not 400
    //
    // A broker who selects 400 East 90th Street is asking for one building, not
    // for every address beginning with 400. Prefix matching is a legitimate
    // DISCOVERY behaviour for free-text autocomplete; it is wrong for a Search
    // criterion, and the two must not be confused.
    it("400 East 90th Street asks for 400, not 400-anything", () => {
      const f = buildCrmIdxODataFilter(new URLSearchParams("address=400 East 90th Street"));
      expect(f).toContain("StreetNumber eq '400'");
      expect(f).not.toContain("startswith(StreetNumber");
    });

    it("4 does not silently mean 4, 40, 400 and 4000", () => {
      // The collision case, at its worst: 98.1% of what the old predicate
      // returned for `4` was not street number 4.
      const f = buildCrmIdxODataFilter(new URLSearchParams({ address: "4" }));
      expect(f).toContain("StreetNumber eq '4'");
      expect(f).not.toContain("startswith(StreetNumber");
    });

    it("each of 4 / 40 / 400 / 4000 asks only for itself", () => {
      for (const n of ["4", "40", "400", "4000"]) {
        const f = buildCrmIdxODataFilter(new URLSearchParams({ address: n }));
        expect(f).toContain(`StreetNumber eq '${n}'`);
        // The negative half: none of them may match another's rows.
        for (const other of ["4", "40", "400", "4000"].filter((x) => x !== n)) {
          expect(f).not.toContain(`StreetNumber eq '${other}'`);
        }
      }
    });

    it("STREET NAME still matches partially, because that is a name not an identifier", () => {
      // Exactness applies to the NUMBER. `contains(StreetName,'90')` is correct:
      // the broker types "90th" and the feed stores "90th"/"90" variously, and a
      // street name is descriptive rather than an identifier.
      const f = buildCrmIdxODataFilter(new URLSearchParams("address=400 East 90th Street"));
      expect(f).toContain("contains(StreetName,'90')");
    });
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

  it("unit → case-insensitive match, because the provider stores both cases", () => {
    // LIVE COTALITY 2026-08-31. Matching is CASE-EXACT, and the stored values are
    // not uniform: `UnitNumber eq '3E'` returns 2,403 rows while
    // `UnitNumber eq '3e'` returns 16 more. Uppercasing the broker's input and
    // comparing exactly — what this did — reaches the 2,403 and can never reach
    // the 16, whichever case the broker types.
    //
    // `toupper()` is supported, and `toupper(UnitNumber) eq '3E'` returns exactly
    // 2,419 = 2,403 + 16: the union, no more and no less. Proven rather than
    // assumed, since a function the provider silently ignored would return the
    // same 2,403 and look identical to a fix.
    const f = buildCrmIdxODataFilter(new URLSearchParams({ unit: "4a" }));
    expect(f).toContain("toupper(UnitNumber) eq '4A'");
  });

  it("keyword is REFUSED — the provider never answers this query", () => {
    // SECTION 5.F, 2026-08-31. `contains(PublicRemarks,...)` was probed five
    // times — with and without $count, at top=1, and narrowed to a single ZIP —
    // and every attempt aborted with NO HTTP STATUS. The provider did not reject
    // it; it never answered. `contains()` itself is fine: the identical shape on
    // BuildingName returns a row immediately, so this is PublicRemarks
    // specifically.
    //
    // UNVERIFIED is not UNSUPPORTED, so the registry keeps `needs_probe` rather
    // than asserting a refusal that was never observed. But a query that never
    // returns must not be sent. It happens not to run today only because the
    // serializer assigns `keyword` and api-client.js never forwards it — so the
    // clause sat here, one transport fix away from hanging every search that
    // used it. Refusing by name makes that impossible, and makes the reason
    // visible to whoever fixes the transport.
    expect(() => buildCrmIdxODataFilter(new URLSearchParams({ keyword: "renovated kitchen" })))
      .toThrow(UnsupportedSearchCriterionError);
    expect(() => buildCrmIdxODataFilter(new URLSearchParams({ keyword: "renovated kitchen" })))
      .toThrow(/keyword/);
  });

  it("minBaths / maxBaths route through the canonical bath contract", () => {
    // These asserted `BathroomsTotalInteger ge 2` / `le 5` — a field
    // `bath-contract.ts` had ALREADY REJECTED on an exhaustive 8,103-row live
    // read. The test was pinning the defect in place: two engines answered the
    // same bath question differently, the Prisma engine using the contract and
    // this path using the field the contract rejects.
    const f = buildCrmIdxODataFilter(new URLSearchParams({ minBaths: "2", maxBaths: "5" }));
    expect(f).not.toContain("BathroomsTotalInteger");
    expect(f).toContain("BathroomsFull");
    expect(f).toContain("BathroomsHalf");
  });

  it("expresses a HALF bath, which the integer field could not", () => {
    // The old assertion was `BathroomsTotalInteger ge 1.5`, and its own comment
    // conceded that is "not strictly OData-numeric on Edm.Int32". An Int32
    // cannot carry 1.5 at all, so half-baths were unexpressible on this path
    // while `BathroomsHalf` is non-zero on 2,023 Active rows — a broker asking
    // for 1.5+ baths silently lost every one of them.
    //
    // The contract renders it exactly: two full baths, OR one full plus at
    // least one half.
    const f = buildCrmIdxODataFilter(new URLSearchParams({ minBaths: "1.5" }));
    expect(f).not.toContain("BathroomsTotalInteger");
    expect(f).toContain("BathroomsFull ge 2");
    expect(f).toContain("BathroomsFull eq 1 and BathroomsHalf ge 1");
  });

  it("uses the SAME owner the Prisma engine uses", () => {
    // The consolidation itself: one mapping owner, so the two engines cannot
    // answer the same question differently.
    const f = buildCrmIdxODataFilter(new URLSearchParams({ minBaths: "2" }));
    expect(f).toContain(minBathsOData(2));
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

  describe("a max bound must not admit values that cannot be a real measurement", () => {
    // LIVE COTALITY, 2026-08-31. Several numeric fields encode "not specified"
    // as an in-band value instead of null, and a `le` bound admits everything
    // BELOW the range — so those rows come back as though they qualified.
    //
    //   LivingArea le 500          168,549 rows, 151,463 of them (89.9%) with
    //                              area 0 or negative — a max-square-feet search
    //                              is almost entirely listings of unknown size
    //   NumberOfUnitsTotal le 10   348,063 rows, 267,772 (76.9%) not-a-count
    //   StoriesTotal le 10         309,926 rows, 64,384 (20.8%) zero storeys
    //
    // The broker asked for "at most N". A row whose value is unknown is not
    // known to be at most N, so returning it is a wrong answer, not a generous
    // one. Fail closed: bound the low end at the smallest REAL value.
    it("maxSqft excludes listings whose area is 0 or negative", () => {
      const f = buildCrmIdxODataFilter(new URLSearchParams({ maxSqft: "3500" }));
      expect(f).toContain("LivingArea le 3500");
      expect(f).toContain("LivingArea ge 1");
    });

    it("maxUnits excludes the -1 not-a-count sentinel", () => {
      const f = buildCrmIdxODataFilter(new URLSearchParams({ maxUnits: "10" }));
      expect(f).toContain("NumberOfUnitsTotal le 10");
      expect(f).toContain("NumberOfUnitsTotal ge 1");
    });

    it("maxFloors excludes zero-storey buildings", () => {
      const f = buildCrmIdxODataFilter(new URLSearchParams({ maxFloors: "10" }));
      expect(f).toContain("StoriesTotal ge 1");
    });

    it("maxPrice and maxRooms are guarded too, on the same principle", () => {
      expect(buildCrmIdxODataFilter(new URLSearchParams({ maxPrice: "500000" }))).toContain("ListPrice ge 1");
      expect(buildCrmIdxODataFilter(new URLSearchParams({ maxRooms: "3" }))).toContain("RoomsTotal ge 1");
    });

    it("BUT maxBeds keeps studios — zero bedrooms is a REAL zero", () => {
      // The whole point of judging zero per field. 88,158 live rows have
      // BedroomsTotal 0 and every one is a studio a broker means to find.
      // Guarding this field at 1 would silently delete studios from Search,
      // turning a fix for unknown values into a worse defect than the one it fixes.
      const f = buildCrmIdxODataFilter(new URLSearchParams({ maxBeds: "2" }));
      expect(f).toContain("BedroomsTotal le 2");
      expect(f).not.toContain("BedroomsTotal ge 1");
    });

    it("and a studios-only search still resolves to exactly zero", () => {
      const f = buildCrmIdxODataFilter(new URLSearchParams({ maxBeds: "0", minBeds: "0" }));
      expect(f).toContain("BedroomsTotal le 0");
    });

    it("a MIN bound needs no guard — the sentinel is already below it", () => {
      // `LivingArea ge 800` cannot admit a 0 or -1 row, so adding a floor there
      // would be noise. Only the max side has the leak.
      const f = buildCrmIdxODataFilter(new URLSearchParams({ minSqft: "800" }));
      expect(f).toContain("LivingArea ge 800");
      expect(f).not.toContain("LivingArea ge 1");
    });
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

  it("multi-neighborhood (repeated params) becomes one disjunction", () => {
    // RE-RELEASED 2026-08-26. SubdivisionName is proven filterable and 100%
    // populated on sampled active rows, so the OR group is restored — and now
    // expands each canonical selection to every provider spelling Mallan knows
    // for it, so the result universe is complete rather than silently short.
    // REPEATED PARAMS, NOT CSV. The comma separator corrupted the accepted
    // Cotality names `Williamsburg,North` and `Williamsburg,South`, which the
    // executor read as four neighbourhoods instead of two.
    const qs = new URLSearchParams();
    qs.append("neighborhood", "Tribeca");
    qs.append("neighborhood", "SoHo");
    const filter = buildCrmIdxODataFilter(qs);
    expect(filter).toContain("SubdivisionName eq 'Tribeca'");
    expect(filter).toContain("SubdivisionName eq 'SoHo'");
    expect(filter).toContain(" or ");
    expect(filter).not.toContain("SubdivisionName eq 'Tribeca,SoHo'");
  });

  it("address parser — all-numeric input → StreetNumber + BuildingName fallback", () => {
    const f = buildCrmIdxODataFilter(new URLSearchParams({ address: "400" }));
    // EXACT since 2026-08-31 — see "a street NUMBER is matched exactly" above.
    expect(f).toContain("StreetNumber eq '400'");
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
    //   OwnerPays       — rental "owner pays X" (the control's yes/no `true`)
    //   Concessions     — "Concessions: Yes"
    //   BuildingRules   — Pied-a-terre / Guarantors / Co-purchasers / etc.
    //   RentingAllowedYN — "Subletting Allowed"
    //   MaximumFinancingPercent — "Financing Available" / "No Financing"
    //   RLSParticipantOnly — distribution gate (handled elsewhere)
    //   ListOfficeMlsId — "In-House" filter
    //
    // CORRECTED 2026-08-26 against the live feed. This list asserted PROVIDER
    // TRUTH that had never come from the provider, and two entries were wrong:
    //
    //   Furnished  MOVED OUT. It is FILTERABLE. Live: Unfurnished 77,944,
    //              Furnished 16,285, Negotiable 553, Partially 69. The control
    //              was refused for years while the field worked.
    //   OwnerPays  STAYS, but the value changed to the one the form actually
    //              ships. `AllUtilities` is a real member and now filters
    //              (4,816 rows); what cannot be answered is the control's
    //              `true`, because OwnerPays names WHICH charges the owner
    //              pays, not whether they pay.
    //
    // The others were re-probed and are refused for THREE DIFFERENT reasons
    // that must not be collapsed into "unsupported":
    //
    //   AttendanceType  ABSENT — "Could not find a property named
    //                   'AttendanceType' on type ...RESO.DD.Property"
    //   Concessions     PROVIDER_SUPPRESSED — "Invalid field 'Concessions' -
    //                   cannot be used for filtering, grouping or ordering
    //                   queries". Yes IS a declared member.
    //   the rest        no verified provider fact yet
    // OwnerPays is REGISTERED-but-unresolved, so it refuses through the
    // registry and carries a REASON. The others are unregistered and refuse
    // generically. Both are 400s on the same protocol; only the registered one
    // can tell the broker why, which is the point of registering a criterion
    // you cannot yet answer.
    expect(() => buildCrmIdxODataFilter(new URLSearchParams({
      checkboxFilters: JSON.stringify({ OwnerPays: ["true"] }),
    }))).toThrow(/OwnerPays names WHICH charges/);

    // Concessions likewise refuses WITH ITS REASON, and the reason is a
    // different one: the provider suppresses the whole field for filtering.
    // "Yes is not a member" and "the field cannot be filtered" are two states
    // and a broker who is told the wrong one goes looking for the wrong fix.
    expect(() => buildCrmIdxODataFilter(new URLSearchParams({
      checkboxFilters: JSON.stringify({ Concessions: ["Yes"] }),
    }))).toThrow(/cannot be used for filtering, grouping or ordering/);

    const unsupported: Record<string, string[]> = {
      AttendanceType: ["DoormanFullTime"],
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

  it("Furnished DOES filter — the control was refused while the field worked", () => {
    // The counterpart assertion. Proving a criterion is refused is only half a
    // contract; without this, moving a field out of the refused list is
    // invisible and it could silently drift back in.
    const filter = buildCrmIdxODataFilter(new URLSearchParams({
      checkboxFilters: JSON.stringify({ Furnished: ["Furnished"] }),
    }));
    expect(filter).toContain("Furnished eq 'Furnished'");
  });

  it("Furnished composes an OR group across its members", () => {
    const filter = buildCrmIdxODataFilter(new URLSearchParams({
      checkboxFilters: JSON.stringify({ Furnished: ["Furnished", "Unfurnished"] }),
    }));
    expect(filter).toContain("(Furnished eq 'Furnished' or Furnished eq 'Unfurnished')");
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

  it("dateType=ListedAndUpdated is REFUSED, not silently degraded to Listed", () => {
    // RETARGETED 2026-08-26. This test previously PINNED the silent
    // degradation: it asserted that `ListedAndUpdated` produced a filter
    // byte-identical to `Listed`, so that nobody could re-add the HTML option
    // without first wiring an OR-clause backend.
    //
    // The intent was right and the mechanism was the defect. Pinning a silent
    // default protects the FILTER from a bad option; it does not protect the
    // BROKER from a wrong answer. `dateType` was read as
    // `params.get("dateType") || "Listed"` feeding a lone `=== "Updated"`
    // ternary, so EVERY unrecognised value — a typo, a stale saved search, a
    // value from an older form revision — produced a perfectly valid-looking
    // ListingContractDate query for a question nobody asked. A broker asking
    // "listed OR updated in April" silently received "listed in April", and
    // listings updated in range but listed outside it were never fetched.
    // Narrower than the question is as wrong as wider.
    //
    // The guarantee is now stronger and it still meets the original goal: the
    // option cannot be re-added without wiring the clause, because an
    // unexecutable dateType fails BY NAME.
    expect(() =>
      buildCrmIdxODataFilter(new URLSearchParams({
        dateType: "ListedAndUpdated",
        dateFrom: "2026-04-01",
        dateTo: "2026-04-30",
      })),
    ).toThrow(UnsupportedSearchCriterionError);

    // And it still produces no date-column OR group, because it produces
    // nothing at all.
    const justListed = buildCrmIdxODataFilter(new URLSearchParams({
      dateType: "Listed",
      dateFrom: "2026-04-01",
      dateTo: "2026-04-30",
    }));
    expect(justListed).not.toContain("ModificationTimestamp");
    expect(justListed).not.toMatch(/ListingContractDate.+or.+ModificationTimestamp/);
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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * MAXIMUM FINANCING IS REFUSED BY NAME, AT EVERY BOUND COMBINATION.
 *
 * The value is real and densely populated — 6,803 of 8,010 Active records — but
 * it lives inside `CustomProperty.CustomFields`, an Edm.String that `$filter`
 * cannot reach into. Mallan-side execution over the complete universe is Section
 * 6 work and does not exist yet.
 *
 * Accepting the parameter and returning HTTP 200 would hand the broker a WIDER
 * result set than they asked for with nothing saying so. A named refusal is the
 * only honest answer until execution exists.
 */
describe("maximum financing fails loud until it can execute", () => {
  const build = (qs: string) => buildCrmIdxODataFilter(new URLSearchParams(qs));

  it("refuses a MIN-only request", () => {
    expect(() => build("financingMin=80")).toThrow(UnsupportedSearchCriterionError);
  });

  it("refuses a MAX-only request", () => {
    // The bound that used to vanish before reaching the server at all: the
    // serializer emitted it, nothing forwarded it, and the search silently ran
    // without it.
    expect(() => build("financingMax=90")).toThrow(UnsupportedSearchCriterionError);
  });

  it("refuses BOTH bounds together", () => {
    expect(() => build("financingMin=75&financingMax=90")).toThrow(
      UnsupportedSearchCriterionError,
    );
  });

  it("names the criterion and the offending values", () => {
    try {
      build("financingMin=75&financingMax=90");
      throw new Error("expected a refusal");
    } catch (e) {
      const err = e as InstanceType<typeof UnsupportedSearchCriterionError>;
      expect(err.criterion).toBe("financing");
      expect(err.unsupportedValues).toEqual(["75", "90"]);
    }
  });

  it("does NOT refuse when neither bound is supplied", () => {
    // A refusal on absence would block every ordinary search.
    expect(() => build("minPrice=500000")).not.toThrow();
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LISTING ID IS DUAL-DOMAIN, AND THE EXECUTOR NOW KNOWS IT.
 *
 * The canonical reference carries EITHER a Cotality `ListingId` OR a
 * Mallan-generated `SL-`/`RL-` identifier. Every value used to be sent to
 * Cotality as `ListingId eq`, so searching a Mallan listing by Mallan's own
 * identifier queried a provider that has never heard of it — returning an empty
 * result set indistinguishable from "no such listing".
 */
describe("listing ID respects the domain the identifier belongs to", () => {
  const build = (qs: string) => buildCrmIdxODataFilter(new URLSearchParams(qs));

  it("sends a COTALITY-domain id to Cotality", () => {
    expect(build("listingId=RLS20078109")).toContain("ListingId eq 'RLS20078109'");
  });

  it("REFUSES a Mallan-domain SL- identifier instead of querying the provider", () => {
    expect(() => build("listingId=SL-1042")).toThrow(UnsupportedSearchCriterionError);
  });

  it("REFUSES a Mallan-domain RL- identifier", () => {
    expect(() => build("listingId=RL-77")).toThrow(UnsupportedSearchCriterionError);
  });

  it("names the criterion and the Mallan-domain values", () => {
    try {
      build("listingId=SL-1042,RL-77");
      throw new Error("expected a refusal");
    } catch (e) {
      const err = e as InstanceType<typeof UnsupportedSearchCriterionError>;
      expect(err.criterion).toBe("listingId");
      expect(err.unsupportedValues).toEqual(["SL-1042", "RL-77"]);
    }
  });

  it("refuses a MIXED list rather than silently answering half of it", () => {
    // Sending only the Cotality half would return a result set missing the
    // Mallan listings the agent explicitly asked for, with nothing saying so.
    expect(() => build("listingId=RLS20078109,SL-1042")).toThrow(
      UnsupportedSearchCriterionError,
    );
  });

  it("asks the identity module rather than re-deriving the prefixes", () => {
    // The domain test is a fact about MALLAN IDENTITY. It was already duplicated
    // across the campaign gate and personal-participation; a fourth copy here
    // would be a fourth place for it to drift.
    expect(isMallanLocalIdentifier("SL-1")).toBe(true);
    expect(isMallanLocalIdentifier("RL-1")).toBe(true);
    expect(isMallanLocalIdentifier("RLS20078109")).toBe(false);
  });
});
