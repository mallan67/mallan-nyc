/// <reference types="jest" />
/**
 * THE PROPERTY TYPE / OWNERSHIP FAMILY, CORRECTED AGAINST LIVE COTALITY.
 *
 * Evidence: `docs/idx/cotality-property-type-family-and-customfields-2026-08-21.md`.
 *
 * Four UI controls were pointed at valid-but-empty enum members. Zero population
 * on the first field checked was never evidence the capability was dead — it was
 * evidence of a mis-mapping, and the inventory proves it:
 *
 *   Townhouse   PropertySubType 0        StructureType  612 Active / 5,951 all
 *   Condo       PropertySubType 0        CommonInterest 3,722 Active
 *   Co-op       PropertySubType 0        CommonInterest 2,509 Active
 *   Land        PropertySubType 0        PropertyType   0 — genuinely absent
 *   MultiFamily PropertySubType 426      + StructureType 715, overlap only 159
 *
 * These entries go in the EXISTING registry. No second registry is introduced.
 */
import { FIELD_REGISTRY } from "../canonical/field-registry";

const entry = (key: string) => FIELD_REGISTRY.find((f) => f.canonicalKey === key);

describe("structure_type — the field that actually carries Townhouse and Multi-Family", () => {
  it("exists in the registry", () => {
    expect(entry("structure_type")).toBeDefined();
  });

  it("is declared a MULTI-enum, because it is queried with `has`, not `eq`", () => {
    expect(entry("structure_type")!.type).toBe("multi_enum");
  });

  it("names StructureType", () => {
    expect(entry("structure_type")!.cotalityField).toBe("StructureType");
  });

  it("is mapped and filterable — 7,152 of 8,032 Active carry it", () => {
    expect(entry("structure_type")!.providerMappingStatus).toBe("mapped");
    expect(entry("structure_type")!.filterable).toBe("yes");
  });

  it("records the Townhouse correction with its live counts", () => {
    const notes = entry("structure_type")!.notes ?? "";
    expect(notes).toMatch(/612/);
    expect(notes).toMatch(/Townhouse/);
  });

  it("records that Multi-Family needs BOTH fields, not a choice between them", () => {
    expect(entry("structure_type")!.notes ?? "").toMatch(/MultiFamily/);
  });
});

describe("ownership — CommonInterest is the ONE canonical condo/co-op criterion", () => {
  it("names CommonInterest", () => {
    expect(entry("ownership")!.cotalityField).toBe("CommonInterest");
  });

  it("is filterable, with the live census recorded", () => {
    expect(entry("ownership")!.filterable).toBe("yes");
    const notes = entry("ownership")!.notes ?? "";
    expect(notes).toMatch(/3,722/); // Condominium, Active
    expect(notes).toMatch(/2,509/); // StockCooperative, Active
  });

  it("records that PropertySubType must NOT be used for condo/co-op", () => {
    expect(entry("ownership")!.notes ?? "").toMatch(/PropertySubType/);
  });
});

describe("property_sub_type records the mis-mapping rather than hiding it", () => {
  it("points at the fields that actually carry the four controls", () => {
    const notes = entry("property_sub_type")!.notes ?? "";
    expect(notes).toMatch(/StructureType/);
    expect(notes).toMatch(/CommonInterest/);
  });

  it("does not describe any control as dead", () => {
    expect(entry("property_sub_type")!.notes ?? "").not.toMatch(/\bdead\b/i);
  });
});

describe("max_financing — live, populated, and INVISIBLE to $metadata", () => {
  it("exists in the registry", () => {
    expect(entry("max_financing")).toBeDefined();
  });

  it("names the undeclared JSON path, not a declared field", () => {
    expect(entry("max_financing")!.cotalityField).toMatch(/CustomFields/);
    expect(entry("max_financing")!.cotalityField).toMatch(/MaximumFinancingPercent/);
  });

  it("is NOT provider-filterable — CustomFields is a JSON string, not a queryable field", () => {
    // The capability constraint must be recorded here, not discovered later by a
    // failing query. `$filter` cannot reach inside an Edm.String blob.
    expect(entry("max_financing")!.filterable).toBe("unsupported");
  });

  it("records the live coverage of the exhaustive census", () => {
    expect(entry("max_financing")!.notes ?? "").toMatch(/84\.9%|6,803/);
  });

  it("records that the DECLARED financing fields are empty", () => {
    const notes = entry("max_financing")!.notes ?? "";
    expect(notes).toMatch(/CurrentFinancing|BuyerFinancing|ListingTerms/);
  });
});
