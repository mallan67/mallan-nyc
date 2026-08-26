/**
 * SAVED SEARCH PERSISTENCE MUST SPEAK THE CANONICAL VOCABULARY.
 *
 * Execution became canonical in Tranche 1; storage did not. `checkbox_filters`
 * was written as a JSON STRING of provider-style keys, so a saved search was a
 * SECOND TRUTH. A saved search is not a cache of a query — it IS the query,
 * replayed days later. If storage and execution speak different vocabularies
 * they drift, and the broker reloads something other than what they saved.
 *
 * The rule these tests defend hardest: AN UNRECOGNISED CRITERION IS NEVER
 * DROPPED. Dropping one converts a RESTRICTIVE saved search into a BROADER one
 * — the broker saved "doorman only" and reloads "everything". That is the same
 * silent-widening failure as a dropped status, arriving through storage.
 */
import {
  normalizeSavedSearchCriteria,
  normalizeCheckboxFilters,
  canonicalSavedSearchKey,
} from "@/lib/search/canonical/saved-search-normalizer";

describe("legacy provider keys become canonical Mallan criteria", () => {
  it.each([
    ["View", "view"],
    ["PetsAllowed", "pet_policy"],
    ["LaundryFeatures", "laundry"],
    ["StructureType", "building_structure"],
    ["BuildingFeatures", "building_amenities"],
  ])("%s -> %s", (legacy, canonical) => {
    expect(canonicalSavedSearchKey(legacy)).toBe(canonical);
  });

  it("canonicalises the pre-Tranche-1 booleans too", () => {
    // These predate the registry and were still persisted under provider names.
    expect(canonicalSavedSearchKey("CoolingYN")).toBe("cooling");
    expect(canonicalSavedSearchKey("LandLeaseYN")).toBe("land_lease");
    expect(canonicalSavedSearchKey("NewConstructionYN")).toBe("new_construction");
  });

  it("GarageYN becomes garage, NOT a generic parking criterion", () => {
    // Garage is not all parking. A broader word here would be an invented
    // equivalence of exactly the kind this workstream keeps removing.
    expect(canonicalSavedSearchKey("GarageYN")).toBe("garage");
    expect(canonicalSavedSearchKey("GarageYN")).not.toBe("parking");
  });

  it("a canonical key passed back in stays itself (idempotent)", () => {
    for (const k of ["view", "pet_policy", "cooling", "garage"]) {
      expect(canonicalSavedSearchKey(k)).toBe(k);
    }
  });
});

describe("legacy records read without any database rewrite", () => {
  it("reads the legacy JSON-STRING shape", () => {
    const out = normalizeCheckboxFilters('{"View":["City"],"LaundryFeatures":["InUnit"]}');
    expect(out.canonical).toEqual({ view: ["City"], laundry: ["InUnit"] });
  });

  it("reads the object shape identically", () => {
    const out = normalizeCheckboxFilters({ View: ["City"], LaundryFeatures: ["InUnit"] });
    expect(out.canonical).toEqual({ view: ["City"], laundry: ["InUnit"] });
  });

  it("normalization is idempotent, so a re-save cannot double-translate", () => {
    const once = normalizeCheckboxFilters({ View: ["City"] }).canonical;
    const twice = normalizeCheckboxFilters(once).canonical;
    expect(twice).toEqual(once);
  });

  it("merges two legacy spellings of the same criterion without losing values", () => {
    const out = normalizeCheckboxFilters({ NewConstruction: ["true"], NewConstructionYN: ["true"] });
    expect(out.canonical.new_construction).toEqual(["true"]);
  });
});

describe("an unrecognised criterion is NEVER dropped", () => {
  it("carries an unavailable legacy control forward and names it", () => {
    // AttendanceType (Doorman/Concierge) is a real control with no verified
    // provider contract. Dropping it would silently widen the saved search.
    const out = normalizeCheckboxFilters({ AttendanceType: ["DoormanFullTime"] });
    expect(out.unavailable).toContain("AttendanceType");
    expect(out.canonical.AttendanceType).toEqual(["DoormanFullTime"]);
  });

  it("carries an unknown key forward and names it", () => {
    const out = normalizeCheckboxFilters({ somethingNobodyKnows: ["x"] });
    expect(out.unknown).toContain("somethingNobodyKnows");
    expect(out.canonical.somethingNobodyKnows).toEqual(["x"]);
  });

  it("reports a malformed value shape instead of discarding it", () => {
    const out = normalizeCheckboxFilters({ View: "City" });
    expect(out.malformed).toContain("View");
  });

  it("a malformed CONTAINER does not read as 'no filters'", () => {
    // The dangerous case: unreadable JSON silently becoming an empty filter set
    // turns a narrow saved search into an unrestricted one.
    const out = normalizeCheckboxFilters("{not valid json");
    expect(out.malformed).toContain("checkbox_filters");
  });

  it("flags hasUnresolved so a caller can raise UNSUPPORTED_CRITERION", () => {
    expect(normalizeSavedSearchCriteria({ checkbox_filters: { AttendanceType: ["x"] } }).hasUnresolved).toBe(true);
    expect(normalizeSavedSearchCriteria({ checkbox_filters: { View: ["City"] } }).hasUnresolved).toBe(false);
  });
});

describe("the persisted shape", () => {
  it("is an OBJECT, never a JSON string inside a JSON column", () => {
    const out = normalizeSavedSearchCriteria({
      listing_type: "sale",
      checkbox_filters: '{"View":["City"]}',
    });
    expect(typeof out.criteria.checkbox_filters).toBe("object");
    expect(out.criteria.checkbox_filters).toEqual({ view: ["City"] });
  });

  it("never persists a provider field name for a promoted criterion", () => {
    const out = normalizeSavedSearchCriteria({
      checkbox_filters: { View: ["City"], PetsAllowed: ["DogsOk"], LaundryFeatures: ["InUnit"] },
    });
    const keys = Object.keys(out.criteria.checkbox_filters as Record<string, unknown>);
    for (const provider of ["View", "PetsAllowed", "LaundryFeatures"]) {
      expect(keys).not.toContain(provider);
    }
  });

  it("leaves every other criterion key untouched", () => {
    // This boundary owns the checkbox vocabulary, not the whole schema.
    // Normalising keys it has not proven would be the overreach it prevents.
    const input = { listing_type: "sale", min_price: 1000000, min_year: 1920, neighborhoods: ["Tribeca"] };
    const out = normalizeSavedSearchCriteria(input);
    expect(out.criteria).toMatchObject(input);
  });

  it("tolerates a criteria object with no checkbox_filters at all", () => {
    const out = normalizeSavedSearchCriteria({ listing_type: "rent" });
    expect(out.criteria.checkbox_filters).toBeUndefined();
    expect(out.hasUnresolved).toBe(false);
  });

  it("does not invent a checkbox_filters key that was absent", () => {
    const out = normalizeSavedSearchCriteria({ listing_type: "sale" });
    expect("checkbox_filters" in out.criteria).toBe(false);
  });
});

describe("save -> reload keeps the same effective criteria", () => {
  it("a legacy record round-trips to the same canonical meaning", () => {
    const stored = { listing_type: "sale", checkbox_filters: '{"View":["City"],"CoolingYN":["true"]}' };
    const read = normalizeSavedSearchCriteria(stored).criteria;
    const resaved = normalizeSavedSearchCriteria(read).criteria;
    expect(resaved.checkbox_filters).toEqual({ view: ["City"], cooling: ["true"] });
  });
});
