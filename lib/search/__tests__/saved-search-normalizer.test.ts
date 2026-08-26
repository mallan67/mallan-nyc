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
  savedSearchDisposition,
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

/**
 * REGRESSION GUARDS FOR THE THREE DEFECTS FOUND IN THIS MODULE ITSELF.
 *
 * Independent review reproduced all three on head 3669d8a1. The module's
 * documentation was stronger than its behaviour — the exact failure mode this
 * workstream keeps catching elsewhere, committed inside the module whose job is
 * to prevent it. These pin the corrections.
 */
describe("a malformed criterion is PRESERVED, never silently removed", () => {
  it("a malformed VALUE stays in the criteria instead of vanishing", () => {
    // Was: {View: "City"} -> {} — the criterion disappeared and the saved
    // search became BROADER. That is the invariant this file claims to hold.
    const out = normalizeSavedSearchCriteria({ checkbox_filters: { View: "City" } });
    const cb = out.criteria.checkbox_filters as Record<string, unknown>;
    expect(Object.keys(cb)).toContain("View");
    expect(cb).not.toEqual({});
  });

  it("a malformed CONTAINER is left intact, not replaced with an empty object", () => {
    const out = normalizeSavedSearchCriteria({ checkbox_filters: "{not valid json" });
    expect(out.criteria.checkbox_filters).toBe("{not valid json");
    expect(out.criteria.checkbox_filters).not.toEqual({});
  });

  it("hasUnresolved is set so the route can refuse the write", () => {
    expect(normalizeSavedSearchCriteria({ checkbox_filters: { View: "City" } }).hasUnresolved).toBe(true);
    expect(normalizeSavedSearchCriteria({ checkbox_filters: "{bad" }).hasUnresolved).toBe(true);
  });
});

describe("elements must be real scalars, not coerced through String()", () => {
  it.each([
    ["an object element", [{ x: 1 }]],
    ["a nested array", [["City"]]],
    ["a null element", [null]],
    ["an undefined element", [undefined]],
  ])("%s is malformed, not fabricated into a string criterion", (_label, values) => {
    const out = normalizeCheckboxFilters({ View: values });
    expect(out.malformed).toContain("View");
    // The specific corruptions: "[object Object]", a silently flattened
    // ["City"], and the string "null" — each a criterion the broker never chose.
    expect(JSON.stringify(out.canonical)).not.toContain("[object Object]");
    expect(out.canonical.view).toBeUndefined();
  });

  it("accepts the scalar types a criterion legitimately uses", () => {
    const out = normalizeCheckboxFilters({ View: ["City"], CoolingYN: [true], StoriesTotal: [6] });
    expect(out.malformed).toEqual([]);
  });
});

describe("this module owns no vocabulary of its own", () => {
  it("resolves booleans through the ONE checkbox registry", () => {
    // Was a private BOOLEAN_CANONICAL map here while crm-idx-filter kept its own
    // booleanFields set — two mappings for one business criterion, recreated
    // inside the module meant to end that split.
    expect(canonicalSavedSearchKey("CoolingYN")).toBe("cooling");
    expect(canonicalSavedSearchKey("GarageYN")).toBe("garage");
    expect(canonicalSavedSearchKey("NewConstruction")).toBe("new_construction");
  });

  it("garage never becomes a generic parking criterion", () => {
    expect(canonicalSavedSearchKey("GarageYN")).not.toBe("parking");
  });
});

/**
 * A CANONICAL KEY IS NOT A VERIFIED CRITERION.
 *
 * `view` is canonical and `view: Park` is still unexecutable — the provider
 * rejects Park outright. Key canonicalization alone let a new Saved Search be
 * stored as executable with a value that cannot run, so value validation is
 * delegated to the ONE registry authority rather than a second table here.
 */
describe("values are validated against the registry, not just keys", () => {
  it.each([
    ["view", { View: ["Park"] }],
    ["pet_policy", { PetsAllowed: ["CatsOnly"] }],
    ["laundry", { LaundryFeatures: ["Common"] }],
    ["building_structure", { StructureType: ["WalkUp"] }],
  ])("%s with an unresolved value is not executable", (_criterion, cb) => {
    const out = normalizeSavedSearchCriteria({ checkbox_filters: cb });
    expect(out.hasUnresolved).toBe(true);
    expect(out.checkboxes.unexecutableValues.length).toBeGreaterThan(0);
  });

  it("a boolean asking true AND false is a contradiction, not a widening", () => {
    const out = normalizeSavedSearchCriteria({ checkbox_filters: { CoolingYN: ["true", "false"] } });
    expect(out.hasUnresolved).toBe(true);
  });

  it("a verified value stays executable", () => {
    const out = normalizeSavedSearchCriteria({ checkbox_filters: { View: ["City"] } });
    expect(out.hasUnresolved).toBe(false);
    expect(out.checkboxes.unexecutableValues).toEqual([]);
  });
});

describe("the execution disposition travels with a stored record", () => {
  it("a fully canonical record is executable", () => {
    const d = savedSearchDisposition({ checkbox_filters: { View: ["City"] } });
    expect(d.criteria_status).toBe("executable");
  });

  it("a malformed record is malformed_criteria, never executable", () => {
    const d = savedSearchDisposition({ checkbox_filters: "{bad" });
    expect(d.criteria_status).toBe("malformed_criteria");
    expect(d.criteria_issues.malformed).toContain("checkbox_filters");
  });

  it("an unavailable legacy control makes the record unsupported_criteria", () => {
    const d = savedSearchDisposition({ checkbox_filters: { AttendanceType: ["DoormanFullTime"] } });
    expect(d.criteria_status).toBe("unsupported_criteria");
    expect(d.criteria_issues.unavailable).toContain("AttendanceType");
  });

  it("an unexecutable VALUE also blocks execution", () => {
    // The case key-only canonicalisation missed entirely.
    const d = savedSearchDisposition({ checkbox_filters: { View: ["Park"] } });
    expect(d.criteria_status).toBe("unsupported_criteria");
    expect(d.criteria_issues.unexecutable_values.join()).toContain("Park");
  });

  it("readable is not runnable — the criteria still come back for repair", () => {
    // A legacy row must stay openable so an agent can fix it. What it must not
    // do is run.
    const out = normalizeSavedSearchCriteria({ checkbox_filters: { AttendanceType: ["x"] } });
    expect(out.criteria.checkbox_filters).toBeDefined();
    expect(savedSearchDisposition({ checkbox_filters: { AttendanceType: ["x"] } }).criteria_status)
      .not.toBe("executable");
  });
});
