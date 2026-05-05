import {
  canEnableAlertForCriteria,
  getUnsupportedProjectionCriteria,
} from "@/lib/search/criteria-to-prisma";

// ──────────────────────────────────────────────────────────────────────
// P0-3 alert-gate contract tests
//
// canEnableAlertForCriteria is the single source of truth for whether
// a saved-search may have alerts enabled. The same function is used by:
//   - app/api/crm/saved-searches POST/PATCH
//   - app/api/cron/search-alerts (defense in depth)
//   - public/crm/js/search/saved-searches.js (frontend mirror — duplicated
//     by selector list, kept in sync by the comment in that file)
//
// Failure of any of these tests means a saved-search alert path can leak
// listings derived from a strict subset of the agent's saved criteria —
// the original Engine A vs Engine B divergence the gate exists to close.
// ──────────────────────────────────────────────────────────────────────

describe("canEnableAlertForCriteria — P0-3 alert gate", () => {
  describe("supported criteria → ok=true", () => {
    it("accepts the minimal sale criteria (listing_type only)", () => {
      const decision = canEnableAlertForCriteria({ listing_type: "sale" });
      expect(decision.ok).toBe(true);
      expect(decision.unsupported).toEqual([]);
      expect(decision.code).toBe("ok");
    });

    it("accepts the full projection-supported set", () => {
      const decision = canEnableAlertForCriteria({
        listing_type: "rental",
        status: ["Active", "ComingSoon"],
        property_type: ["Condominium"],
        borough: "Manhattan",
        neighborhoods: ["Tribeca", "SoHo"],
        min_price: 500000,
        max_price: 2_000_000,
        min_beds: 1,
        max_beds: 3,
        min_baths: 1,
        max_baths: 2,
        min_sqft: 800,
        max_sqft: 2500,
      });
      expect(decision.ok).toBe(true);
      expect(decision.unsupported).toEqual([]);
    });

    it("treats _search_tab as a reserved key, not unsupported", () => {
      const decision = canEnableAlertForCriteria({
        listing_type: "sale",
        _search_tab: "sale",
      });
      expect(decision.ok).toBe(true);
    });

    it("accepts the camelCase aliases (priceMin / bedsMax / etc.)", () => {
      const decision = canEnableAlertForCriteria({
        listingType: "sale",
        priceMin: 1000000,
        priceMax: 5000000,
        bedsMin: 2,
        bedsMax: 4,
        bathsMin: 1.5,
        sqftMin: 1000,
      });
      expect(decision.ok).toBe(true);
    });

    it("treats undefined/null/empty values as supported (ignored)", () => {
      const decision = canEnableAlertForCriteria({
        listing_type: "sale",
        min_price: undefined as unknown as number,
        max_price: null as unknown as number,
        borough: "",
      });
      expect(decision.ok).toBe(true);
    });
  });

  describe("unsupported criteria → ok=false, code=unsupported_criteria", () => {
    it("flags free-text address as unsupported", () => {
      const decision = canEnableAlertForCriteria({
        listing_type: "sale",
        address: "400 East 90th",
      });
      expect(decision.ok).toBe(false);
      expect(decision.code).toBe("unsupported_criteria");
      expect(decision.unsupported).toContain("address");
    });

    it("flags PublicRemarks keyword search", () => {
      const decision = canEnableAlertForCriteria({
        listing_type: "sale",
        keyword: "renovated kitchen",
      });
      expect(decision.ok).toBe(false);
      expect(decision.unsupported).toContain("keyword");
    });

    it("flags Trestle-only fields not mirrored on the projection", () => {
      const decision = canEnableAlertForCriteria({
        listing_type: "sale",
        management_company: "O'Brien Realty",
        property_sub_type: "Condop",
        unit: "4A",
        listing_id: "RLS123",
      });
      expect(decision.ok).toBe(false);
      // All four should appear in the unsupported list
      expect(decision.unsupported).toEqual(
        expect.arrayContaining([
          "management_company",
          "property_sub_type",
          "unit",
          "listing_id",
        ]),
      );
    });

    it("flags building-tab inputs (year, floors, units, name)", () => {
      const decision = canEnableAlertForCriteria({
        listing_type: "sale",
        min_year: 1920,
        max_year: 1990,
        min_floors: 6,
        max_units: 200,
        building_name: "The Plaza",
      });
      expect(decision.ok).toBe(false);
      expect(decision.unsupported).toEqual(
        expect.arrayContaining([
          "min_year",
          "max_year",
          "min_floors",
          "max_units",
          "building_name",
        ]),
      );
    });

    it("flags date ranges (Listed/Updated, contract, close)", () => {
      const decision = canEnableAlertForCriteria({
        listing_type: "sale",
        date_from: "2026-04-01",
        date_to: "2026-04-30",
        date_type: "Updated",
        contract_date_from: "2026-03-01",
        close_date_from: "2026-01-01",
      });
      expect(decision.ok).toBe(false);
      expect(decision.unsupported).toEqual(
        expect.arrayContaining(["date_from", "date_to", "date_type"]),
      );
    });

    it("flags the saved-form checkboxFilters JSON blob", () => {
      const decision = canEnableAlertForCriteria({
        listing_type: "sale",
        checkbox_filters: JSON.stringify({ CoolingYN: ["true"], LaundryFeatures: ["InUnit"] }),
      });
      expect(decision.ok).toBe(false);
      expect(decision.unsupported).toContain("checkbox_filters");
    });

    it("flags grid/transit bounding-box filters", () => {
      const decision = canEnableAlertForCriteria({
        listing_type: "sale",
        grid_filter: "Latitude ge 40.7 and Latitude le 40.8",
        transit_lines: ["1", "2", "3"],
      });
      expect(decision.ok).toBe(false);
      expect(decision.unsupported).toEqual(
        expect.arrayContaining(["grid_filter", "transit_lines"]),
      );
    });

    it("returns sorted unsupported keys for stable error messages", () => {
      const decision = canEnableAlertForCriteria({
        listing_type: "sale",
        zip: "10128",
        address: "400 E 90th",
        keyword: "park",
      });
      expect(decision.ok).toBe(false);
      // Sorted alphabetically
      expect(decision.unsupported).toEqual(["address", "keyword", "zip"]);
    });

    it("includes the unsupported keys in a human-readable message", () => {
      const decision = canEnableAlertForCriteria({
        listing_type: "sale",
        address: "400 E 90th",
      });
      expect(decision.message).toContain("address");
      expect(decision.message).toContain("alert engine does not support");
    });
  });

  describe("invariants", () => {
    it("ok=true ⇒ unsupported.length === 0 (and vice versa)", () => {
      const positive = canEnableAlertForCriteria({ listing_type: "sale" });
      expect(positive.ok && positive.unsupported.length === 0).toBe(true);

      const negative = canEnableAlertForCriteria({
        listing_type: "sale",
        keyword: "x",
      });
      expect(negative.ok === false && negative.unsupported.length > 0).toBe(true);
    });

    it("matches getUnsupportedProjectionCriteria for the same input", () => {
      const criteria = {
        listing_type: "sale",
        address: "x",
        keyword: "y",
        zip: "10001",
      };
      const decision = canEnableAlertForCriteria(criteria);
      const direct = getUnsupportedProjectionCriteria(criteria);
      expect(decision.unsupported).toEqual(direct);
    });

    it("does not mutate input criteria object", () => {
      const criteria = { listing_type: "sale", keyword: "x" };
      const before = JSON.stringify(criteria);
      canEnableAlertForCriteria(criteria);
      expect(JSON.stringify(criteria)).toBe(before);
    });

    it("handles empty criteria object (treats as supported)", () => {
      const decision = canEnableAlertForCriteria({});
      expect(decision.ok).toBe(true);
      expect(decision.unsupported).toEqual([]);
    });
  });
});
