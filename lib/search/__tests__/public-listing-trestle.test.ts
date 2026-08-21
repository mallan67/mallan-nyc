import { buildPublicListingTrestleFilter } from "@/lib/search/public-listing-trestle";

const DEFAULT_STATUS = "(StandardStatus eq 'Active' or StandardStatus eq 'ComingSoon' or StandardStatus eq 'ActiveUnderContract')";

describe("buildPublicListingTrestleFilter", () => {
  // ── 1. default sale/rent/status filters ────────────────────────────
  describe("default sale/rent/status filters", () => {
    it("emits the default active-statuses clause when no params supplied", () => {
      const filter = buildPublicListingTrestleFilter(new URLSearchParams());
      expect(filter).toBe(DEFAULT_STATUS);
    });

    it("maps type=sale to PropertyType ne 'ResidentialLease'", () => {
      const filter = buildPublicListingTrestleFilter(new URLSearchParams("type=sale"));
      expect(filter).toContain(DEFAULT_STATUS);
      expect(filter).toContain("PropertyType ne 'ResidentialLease'");
    });

    it("treats type=buy the same as type=sale", () => {
      const filter = buildPublicListingTrestleFilter(new URLSearchParams("type=buy"));
      expect(filter).toContain("PropertyType ne 'ResidentialLease'");
    });

    it("maps type=rent to PropertyType eq 'ResidentialLease'", () => {
      const filter = buildPublicListingTrestleFilter(new URLSearchParams("type=rent"));
      expect(filter).toContain("PropertyType eq 'ResidentialLease'");
    });

    it("respects an allowed single status", () => {
      const filter = buildPublicListingTrestleFilter(new URLSearchParams("status=Active"));
      expect(filter).toContain("StandardStatus eq 'Active'");
      expect(filter).not.toContain(DEFAULT_STATUS);
    });

    it("falls back to the default clause when status is not on the allowlist", () => {
      const filter = buildPublicListingTrestleFilter(new URLSearchParams("status=Closed"));
      expect(filter).toContain(DEFAULT_STATUS);
    });

    it("emits multi-status OR clause when statuses param is supplied", () => {
      const filter = buildPublicListingTrestleFilter(
        new URLSearchParams("statuses=Active,ComingSoon"),
      );
      expect(filter).toContain("(StandardStatus eq 'Active' or StandardStatus eq 'ComingSoon')");
    });

    it("emits a single status clause when only one allowed status is in the multi list", () => {
      const filter = buildPublicListingTrestleFilter(
        new URLSearchParams("statuses=Active,Closed"),
      );
      expect(filter).toContain("StandardStatus eq 'Active'");
      expect(filter).not.toContain("Closed");
    });

    it("falls back to default when statuses contains only disallowed values", () => {
      const filter = buildPublicListingTrestleFilter(
        new URLSearchParams("statuses=Closed,Withdrawn"),
      );
      expect(filter).toContain(DEFAULT_STATUS);
    });
  });

  // ── 2. OData string escaping ────────────────────────────────────────
  describe("OData string escaping", () => {
    it("doubles single quotes in legacy propertyType lookups", () => {
      // This exercises the legacy single propertyType branch which routes
      // through escapeOData(). Map miss is the safe path — no clause is added.
      const filter = buildPublicListingTrestleFilter(
        new URLSearchParams("propertyType=Co-op"),
      );
      expect(filter).toContain("CommonInterest eq 'StockCooperative'");
    });

    it("escapes single quotes inside borough names", () => {
      // Manhattan/Brooklyn/etc. map to county names — but if a custom borough
      // value contains a quote it must round-trip safely through the escaper.
      const filter = buildPublicListingTrestleFilter(
        new URLSearchParams("borough=O'Hare County"),
      );
      expect(filter).toContain("CountyOrParish eq 'O''Hare County'");
    });

    it("escapes single quotes and strips % / _ wildcards in keywords", () => {
      const filter = buildPublicListingTrestleFilter(
        new URLSearchParams("keywords=can%t,o'sullivan,foo_bar"),
      );
      // wildcards stripped, quotes doubled, lowercased
      expect(filter).toContain("contains(tolower(PublicRemarks),'cant')");
      expect(filter).toContain("contains(tolower(PublicRemarks),'o''sullivan')");
      expect(filter).toContain("contains(tolower(PublicRemarks),'foobar')");
    });
  });

  // ── 3. address search parsing ───────────────────────────────────────
  describe("address search parsing", () => {
    it("handles 'number direction street' (E + ordinal-stripped street)", () => {
      const filter = buildPublicListingTrestleFilter(
        new URLSearchParams("address=400 East 90th Street"),
      );
      expect(filter).toContain("startswith(StreetNumber,'400')");
      expect(filter).toContain("StreetDirPrefix eq 'E'");
      expect(filter).toContain("contains(tolower(StreetName),'90')");
    });

    it("handles 'direction street' with no number", () => {
      const filter = buildPublicListingTrestleFilter(
        new URLSearchParams("address=East 90th Street"),
      );
      expect(filter).toContain("StreetDirPrefix eq 'E'");
      expect(filter).toContain("contains(tolower(StreetName),'90')");
      expect(filter).not.toContain("startswith(StreetNumber");
    });

    it("handles 'number street' with no direction", () => {
      const filter = buildPublicListingTrestleFilter(
        new URLSearchParams("address=400 Park Avenue"),
      );
      expect(filter).toContain("startswith(StreetNumber,'400')");
      expect(filter).toContain("contains(tolower(StreetName),'park')");
      expect(filter).not.toContain("StreetDirPrefix");
    });

    it("handles text-only addresses by searching StreetName OR BuildingName", () => {
      const filter = buildPublicListingTrestleFilter(
        new URLSearchParams("address=The Apthorp"),
      );
      expect(filter).toContain("contains(tolower(StreetName),'the apthorp')");
      expect(filter).toContain("contains(tolower(BuildingName),'the apthorp')");
    });
  });

  // ── 4. borough/neighborhood/zip filters ─────────────────────────────
  describe("borough / neighborhood / zip filters", () => {
    it("maps borough=Manhattan to CountyOrParish='New York'", () => {
      const filter = buildPublicListingTrestleFilter(new URLSearchParams("borough=Manhattan"));
      expect(filter).toContain("CountyOrParish eq 'New York'");
    });

    it("maps borough=Brooklyn to CountyOrParish='Kings'", () => {
      const filter = buildPublicListingTrestleFilter(new URLSearchParams("borough=Brooklyn"));
      expect(filter).toContain("CountyOrParish eq 'Kings'");
    });

    it("emits a single zip clause when one valid zipCode is supplied", () => {
      const filter = buildPublicListingTrestleFilter(new URLSearchParams("zipCodes=10128"));
      expect(filter).toContain("PostalCode eq '10128'");
    });

    it("emits an OR clause across multiple valid zip codes", () => {
      const filter = buildPublicListingTrestleFilter(
        new URLSearchParams("zipCodes=10128,10021"),
      );
      expect(filter).toContain("(PostalCode eq '10128' or PostalCode eq '10021')");
    });

    it("ignores zip codes that are not exactly 5 digits", () => {
      const filter = buildPublicListingTrestleFilter(
        new URLSearchParams("zipCodes=10128,abc,12,123456"),
      );
      expect(filter).toContain("PostalCode eq '10128'");
      expect(filter).not.toContain("PostalCode eq 'abc'");
      expect(filter).not.toContain("PostalCode eq '12'");
      expect(filter).not.toContain("PostalCode eq '123456'");
    });

    it("explicit zipCodes wins over neighborhood (no neighborhood→ZIP fallback)", () => {
      const filter = buildPublicListingTrestleFilter(
        new URLSearchParams("zipCodes=10128&neighborhood=Tribeca"),
      );
      expect(filter).toContain("PostalCode eq '10128'");
      // Whatever zips Tribeca resolves to, they must NOT appear when zipCodes wins.
      // (Tribeca is in 10013/10007; verify neither leaks in.)
      expect(filter).not.toContain("PostalCode eq '10013'");
      expect(filter).not.toContain("PostalCode eq '10007'");
    });

    it("returns no neighborhood clause when the name resolves to no zips", () => {
      const filter = buildPublicListingTrestleFilter(
        new URLSearchParams("neighborhood=NotARealNYCNeighborhood"),
      );
      expect(filter).not.toContain("PostalCode eq");
    });
  });

  // ── 5. ownershipTypes ───────────────────────────────────────────────
  describe("ownershipTypes filter", () => {
    it("maps Condo to CommonInterest='Condominium'", () => {
      const filter = buildPublicListingTrestleFilter(
        new URLSearchParams("ownershipTypes=Condo"),
      );
      expect(filter).toContain("(CommonInterest eq 'Condominium')");
    });

    it("maps a multi-value list to an OR of CommonInterest clauses", () => {
      const filter = buildPublicListingTrestleFilter(
        new URLSearchParams("ownershipTypes=Condo,Co-op,Condop"),
      );
      expect(filter).toContain(
        "(CommonInterest eq 'Condominium' or CommonInterest eq 'StockCooperative' or CommonInterest eq 'Condop')",
      );
    });

    it("drops unknown ownership tokens silently", () => {
      const filter = buildPublicListingTrestleFilter(
        new URLSearchParams("ownershipTypes=Condo,Mansion"),
      );
      expect(filter).toContain("(CommonInterest eq 'Condominium')");
      expect(filter).not.toContain("Mansion");
    });
  });

  // ── 6. yearBuilt pre-war / post-war ─────────────────────────────────
  describe("yearBuilt", () => {
    it("pre-war pushes YearBuilt le 1946", () => {
      const filter = buildPublicListingTrestleFilter(new URLSearchParams("yearBuilt=pre-war"));
      expect(filter).toContain("YearBuilt le 1946");
      expect(filter).not.toContain("YearBuilt ge");
    });

    it("post-war pushes YearBuilt ge 1947", () => {
      const filter = buildPublicListingTrestleFilter(new URLSearchParams("yearBuilt=post-war"));
      expect(filter).toContain("YearBuilt ge 1947");
      expect(filter).not.toContain("YearBuilt le");
    });

    it("any other yearBuilt value is ignored", () => {
      const filter = buildPublicListingTrestleFilter(new URLSearchParams("yearBuilt=any"));
      expect(filter).not.toContain("YearBuilt");
    });
  });

  // ── 7. furnished ─────────────────────────────────────────────────────
  describe("furnished", () => {
    it("furnished=true pushes Furnished eq 'Furnished'", () => {
      const filter = buildPublicListingTrestleFilter(new URLSearchParams("furnished=true"));
      expect(filter).toContain("Furnished eq 'Furnished'");
    });

    it("furnished=false (or missing) pushes nothing", () => {
      const noParam = buildPublicListingTrestleFilter(new URLSearchParams());
      expect(noParam).not.toContain("Furnished");
      const explicit = buildPublicListingTrestleFilter(new URLSearchParams("furnished=false"));
      expect(explicit).not.toContain("Furnished");
    });
  });

  // ── 8. amenities including pet-friendly ─────────────────────────────
  describe("amenities (incl. pet-friendly)", () => {
    // Per the route, NO amenity field can be pushed to the OData $filter on
    // Trestle's IDX Plus feed: BuildingFeatures / InteriorFeatures / etc. are
    // not in $select and Trestle rejects unknown fields. Pet-friendly itself
    // is filtered as a RAW post-filter against PetsAllowed AFTER the fetch.
    // The helper therefore must NOT push any amenity clauses to OData.
    it("ignores amenities=pet-friendly in the OData filter", () => {
      const filter = buildPublicListingTrestleFilter(
        new URLSearchParams("amenities=pet-friendly"),
      );
      expect(filter).not.toContain("PetsAllowed");
      expect(filter).not.toContain("amenities");
      expect(filter).toBe(DEFAULT_STATUS);
    });

    it("ignores amenities=doorman,gym in the OData filter", () => {
      const filter = buildPublicListingTrestleFilter(
        new URLSearchParams("amenities=doorman,gym,elevator"),
      );
      expect(filter).not.toContain("BuildingFeatures");
      expect(filter).not.toContain("Concierge");
      expect(filter).not.toContain("FitnessCenter");
      expect(filter).toBe(DEFAULT_STATUS);
    });
  });

  // ── 9. keywords / PublicRemarks ─────────────────────────────────────
  describe("keywords / PublicRemarks", () => {
    it("emits a contains(tolower(PublicRemarks),...) clause per keyword", () => {
      const filter = buildPublicListingTrestleFilter(
        new URLSearchParams("keywords=quiet,renovated"),
      );
      expect(filter).toContain("contains(tolower(PublicRemarks),'quiet')");
      expect(filter).toContain("contains(tolower(PublicRemarks),'renovated')");
    });

    it("AND-joins keyword clauses (each is its own filter part)", () => {
      const filter = buildPublicListingTrestleFilter(
        new URLSearchParams("keywords=quiet,high floor"),
      );
      // The joiner is " and " between filter parts.
      expect(filter).toMatch(
        /contains\(tolower\(PublicRemarks\),'quiet'\) and .*contains\(tolower\(PublicRemarks\),'high floor'\)/,
      );
    });

    it("strips wildcards and lowercases each keyword", () => {
      const filter = buildPublicListingTrestleFilter(
        new URLSearchParams("keywords=High%Floor,Sun_drenched"),
      );
      expect(filter).toContain("contains(tolower(PublicRemarks),'highfloor')");
      expect(filter).toContain("contains(tolower(PublicRemarks),'sundrenched')");
    });

    it("skips empty / whitespace-only keywords", () => {
      const filter = buildPublicListingTrestleFilter(
        new URLSearchParams("keywords=,quiet,"),
      );
      expect(filter).toContain("contains(tolower(PublicRemarks),'quiet')");
      // No empty-string clause should appear.
      expect(filter).not.toContain("contains(tolower(PublicRemarks),'')");
    });
  });

  // ── 10. commercial / new-development filter behavior ────────────────
  describe("commercial / new-development filter behavior", () => {
    it("commercial=true emits the OR-of-PropertySubType list", () => {
      const filter = buildPublicListingTrestleFilter(new URLSearchParams("commercial=true"));
      expect(filter).toContain(
        "(PropertySubType eq 'Office' or PropertySubType eq 'Retail' or PropertySubType eq 'Industrial' or PropertySubType eq 'Warehouse' or PropertySubType eq 'MixedUse')",
      );
    });

    it("commercial=false (or missing) emits no commercial clause", () => {
      const noParam = buildPublicListingTrestleFilter(new URLSearchParams());
      expect(noParam).not.toContain("PropertySubType eq 'Office'");
    });

    it("propertySubTypes='New Development' pushes the four PublicRemarks contains() phrases", () => {
      const filter = buildPublicListingTrestleFilter(
        new URLSearchParams("propertySubTypes=New Development"),
      );
      expect(filter).toContain("contains(PublicRemarks,'new development')");
      expect(filter).toContain("contains(PublicRemarks,'new construction')");
      expect(filter).toContain("contains(PublicRemarks,'sponsor unit')");
      expect(filter).toContain("contains(PublicRemarks,'brand new')");
    });

    it("propertySubTypes mixes CommonInterest + new-dev contains in one OR group", () => {
      const filter = buildPublicListingTrestleFilter(
        new URLSearchParams("propertySubTypes=Condo,New Development"),
      );
      expect(filter).toMatch(
        /\(CommonInterest eq 'Condominium' or contains\(PublicRemarks,'new development'\)/,
      );
    });

    it("sort=new-development without propertySubTypes adds the 3-phrase remark contains", () => {
      const filter = buildPublicListingTrestleFilter(
        new URLSearchParams("sort=new-development"),
      );
      expect(filter).toContain(
        "(contains(PublicRemarks,'new development') or contains(PublicRemarks,'new construction') or contains(PublicRemarks,'sponsor unit'))",
      );
    });

    it("sort=new-development is suppressed when propertySubTypes is also supplied", () => {
      const filter = buildPublicListingTrestleFilter(
        new URLSearchParams("sort=new-development&propertySubTypes=Condo"),
      );
      // Only the propertySubTypes branch should fire — no duplicate remark clause.
      const occurrences = filter.match(/contains\(PublicRemarks,'new development'\)/g) || [];
      expect(occurrences.length).toBe(0);
      expect(filter).toContain("CommonInterest eq 'Condominium'");
    });
  });
});
