/**
 * TRANCHE 1 — the closed checkbox criterion contract.
 *
 * `checkboxFilters` carries the amenity/feature/condition criteria for 45 field
 * families. It was assigned by the serializer and never forwarded, so every one
 * of those controls was silently inert: the broker ticked "City View", got an
 * unnarrowed result set, and nothing anywhere said the filter had not run.
 *
 * Restoring transport alone would have been wrong. The browser must not be able
 * to name an arbitrary Cotality field and value — that is the same hazard as the
 * caller-supplied `gridFilter` this codebase already rejects. So the server owns
 * a CLOSED registry and validates every field and value before any provider call.
 *
 * WHAT IS PROVEN HERE, AND WHAT DELIBERATELY IS NOT
 *
 * 69 selectable values across 11 fields are EXACT members of their field's live
 * picklist (probed 2026-08-26). Those are promoted.
 *
 * 18 are NOT, and are NOT mapped. A matching word is not proof. `CatsOnly` is
 * the clearest: the provider has `CatsOk`, which asserts cats are PERMITTED —
 * "only cats" is a different claim that would require composing `CatsOk` with
 * `NoDogs`. Mapping one onto the other is exactly how `PENDING` came to mean
 * `ActiveUnderContract`. Each unresolved value keeps its reason and fails by
 * name.
 */
import {
  checkboxFieldOData,
  isRegisteredCheckboxField,
  registeredCheckboxFields,
  checkboxFieldContract,
  UnsupportedCheckboxCriterionError,
} from "@/lib/search/canonical/checkbox-criteria";
import { buildCrmIdxODataFilter } from "@/lib/search/crm-idx-filter";

describe("the registry is closed", () => {
  it("registers every EXECUTION-PROVEN checkbox criterion — multi-enum AND boolean", () => {
    // Keyed by MALLAN CRITERION, not by Cotality field name. The booleans moved
    // in here from crm-idx-filter's own booleanFields table: one business
    // criterion must not have two mappings. PropertyCondition is absent because
    // it is provider-suppressed for filtering (proven live) — PROVIDER_UNAVAILABLE,
    // not "unmapped".
    expect(registeredCheckboxFields()).toEqual([
      "accessibility",
      "architectural_style",
      "building_amenities",
      "building_structure",
      "business_use",
      "cooling",
      "garage",
      "land_lease",
      "laundry",
      "new_construction",
      "outdoor_features",
      "pet_policy",
      "pool",
      "view",
    ]);
  });

  it("garage is garage, never a generic parking criterion", () => {
    expect(registeredCheckboxFields()).toContain("garage");
    expect(registeredCheckboxFields()).not.toContain("parking");
    expect(checkboxFieldContract("garage")?.cotalityField).toBe("GarageYN");
  });

  it("refuses a field it does not register", () => {
    expect(isRegisteredCheckboxField("NotARealField")).toBe(false);
    expect(() => checkboxFieldOData("NotARealField", ["x"])).toThrow(UnsupportedCheckboxCriterionError);
  });

  it("does not let the browser choose the Cotality field name", () => {
    // The registry maps a registered name to its own cotalityField. A caller
    // cannot smuggle in a different provider field.
    expect(checkboxFieldContract("View")?.cotalityField).toBe("View");
    expect(checkboxFieldContract("ListPrice")).toBeNull();
  });
});

describe("verified values render the proven predicate", () => {
  it("renders a single member as a parenthesised equality", () => {
    expect(checkboxFieldOData("View", ["City"])).toBe("(View eq 'City')");
  });

  it("ORs multiple selections within one field", () => {
    // Proven arithmetically against live Cotality:
    //   City 112,760 + Water 983 - overlap 763 = 112,980 = the OR count.
    expect(checkboxFieldOData("View", ["City", "Water"])).toBe(
      "(View eq 'City' or View eq 'Water')",
    );
  });

  it("de-duplicates a repeated selection", () => {
    expect(checkboxFieldOData("View", ["City", "City"])).toBe("(View eq 'City')");
  });

  it("returns null when nothing is selected", () => {
    expect(checkboxFieldOData("View", [])).toBeNull();
    expect(checkboxFieldOData("View", ["", "  "])).toBeNull();
  });
});

describe("unresolved values fail by name and say why", () => {
  it.each([
    ["PetsAllowed", "CatsOnly", /CatsOk/],
    ["PetsAllowed", "DogsOnly", /DogsOk/],
    // PropertyCondition is provider-SUPPRESSED, so the suppression reason is the
    // correct one to surface — a different fact from an unmapped value.
    ["PropertyCondition", "Fair", /suppressed \(provider/i],
    ["LaundryFeatures", "Common", /CommonArea/],
    ["View", "Park", /not a member|rejects Park/i],
  ])("%s.%s is rejected with its reason", (field, value, reasonPattern) => {
    try {
      checkboxFieldOData(field, [value]);
      throw new Error("expected a throw");
    } catch (err) {
      expect(err).toBeInstanceOf(UnsupportedCheckboxCriterionError);
      expect((err as Error).message).toContain(value);
      expect((err as Error).message).toMatch(reasonPattern);
    }
  });

  it("rejects the whole field rather than running the proven half", () => {
    // Executing only the valid selections answers a different question from the
    // one the broker asked, and does so under HTTP 200.
    expect(() => checkboxFieldOData("View", ["City", "Park"])).toThrow(
      UnsupportedCheckboxCriterionError,
    );
  });

  it("does NOT map CatsOnly onto CatsOk", () => {
    const contract = checkboxFieldContract("PetsAllowed");
    expect(contract?.allowed.has("CatsOnly")).toBe(false);
    expect(contract?.unresolved.has("CatsOnly")).toBe(true);
  });
});

describe("end to end through buildCrmIdxODataFilter", () => {
  const withCheckboxes = (obj: Record<string, string[]>) =>
    buildCrmIdxODataFilter(new URLSearchParams({ checkboxFilters: JSON.stringify(obj) }));

  it("a verified checkbox criterion reaches the OData filter", () => {
    expect(withCheckboxes({ View: ["City"] })).toContain("(View eq 'City')");
  });

  it("multiple fields combine with AND", () => {
    const filter = withCheckboxes({ View: ["City"], StructureType: ["HighRise"] });
    expect(filter).toContain("(View eq 'City')");
    expect(filter).toContain("(StructureType eq 'HighRise')");
    expect(filter).toContain(" and ");
  });

  it("booleans keep their own true/false shape", () => {
    expect(withCheckboxes({ CoolingYN: ["true"] })).toContain("CoolingYN eq true");
  });

  it("an unresolved value still fails closed at the filter boundary", () => {
    expect(() => withCheckboxes({ PetsAllowed: ["CatsOnly"] })).toThrow();
  });

  it("an unregistered field still fails closed", () => {
    expect(() => withCheckboxes({ AttendanceType: ["DoormanFullTime"] })).toThrow();
  });
});
