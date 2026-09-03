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

  it("records Townhouse as PROVEN EXCLUSIVE across all four surfaces", () => {
    const notes = entry("structure_type")!.notes ?? "";
    expect(notes).toMatch(/610/);
    expect(notes).toMatch(/EXCLUSIVE/i);
    // PropertySubTypeAdditional was omitted from the first census; its zero is
    // what makes the exclusivity claim provable rather than assumed.
    expect(notes).toMatch(/PropertySubTypeAdditional/);
  });

  it("records Multi-Family across FOUR surfaces, with the union and the exclusives", () => {
    const notes = entry("structure_type")!.notes ?? "";
    expect(notes).toMatch(/981/);   // union
    expect(notes).toMatch(/424/);   // PropertySubType
    expect(notes).toMatch(/714/);   // StructureType
  });

  it("does NOT assert the union as the business criterion", () => {
    // Four surfaces mean four different things. Token equality is not semantics.
    const notes = entry("structure_type")!.notes ?? "";
    expect(notes).toMatch(/BUSINESS decision|NEEDS_PROBE/);
  });
});

describe("Land is zero-population, NOT unsupported", () => {
  it("distinguishes a supported-but-empty criterion from an unsupported one", () => {
    const notes = entry("property_sub_type")!.notes ?? "";
    expect(notes).toMatch(/VERIFIED_ZERO_POPULATION_CURRENT_FEED/);
    expect(notes).toMatch(/capability is retained/i);
  });

  it("records that every candidate surface was probed, not just PropertySubType", () => {
    expect(entry("property_sub_type")!.notes ?? "").toMatch(/eleven probes|PropertySubTypeAdditional/i);
  });
});

describe("CustomFields keys are OBSERVED EXTENSION keys, not metadata fields", () => {
  it("models the declared field and the observed key as different layers", () => {
    const notes = entry("max_financing_percent")!.notes ?? "";
    expect(notes).toMatch(/OBSERVED EXTENSION KEY/i);
    expect(notes).toMatch(/declared type=Edm\.String/);
  });

  it("records 0.00 as a sentinel rather than a real limit", () => {
    expect(entry("max_financing_percent")!.notes ?? "").toMatch(/SENTINEL/i);
  });

  it("records that it is LISTING-level, because buildings disagree", () => {
    const notes = entry("max_financing_percent")!.notes ?? "";
    expect(notes).toMatch(/LISTING-LEVEL/i);
    expect(notes).toMatch(/380/);
  });

  it("refuses the AttendanceType -> doorman substitution", () => {
    // Population is not meaning. The system already learned Concierge != Doorman.
    expect(entry("max_financing_percent")!.notes ?? "").toMatch(/VideoDoormanYes is not a doorman/);
  });
});

describe("ownership — CommonInterest is the ONE canonical condo/co-op criterion", () => {
  it("names CommonInterest", () => {
    expect(entry("ownership")!.cotalityField).toBe("CommonInterest");
  });

  it("is filterable, with the live census recorded STRUCTURALLY", () => {
    expect(entry("ownership")!.filterable).toBe("yes");
    // 'yes' means verified against live Cotality, so the probe record must be a
    // field rather than a phrase in prose. Seven other Search criteria were
    // demoted to needs_probe on 2026-08-28 for lacking exactly this.
    expect(entry("ownership")!.liveEvidence?.probedAt).toBe("2026-08-21");
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

describe("max_financing_percent — live, populated, and INVISIBLE to $metadata", () => {
  it("exists in the registry", () => {
    expect(entry("max_financing_percent")).toBeDefined();
  });

  it("names the DECLARED field, and records the observed key as a separate layer", () => {
    // `cotalityField` used to read
    // 'CustomProperty.CustomFields -> MaximumFinancingPercent' — a prose
    // composite occupying a slot that means "a provider field name". The declared
    // provider field is CustomProperty.CustomFields, an Edm.String; the observed
    // key lives INSIDE that string and is not a field at all. Collapsing the two
    // layers into one slot is what made it look queryable.
    expect(entry("max_financing_percent")!.cotalityField).toBe("CustomProperty.CustomFields");
    expect(entry("max_financing_percent")!.notes ?? "").toMatch(
      /observed key=MaximumFinancingPercent/,
    );
    expect(entry("max_financing_percent")!.notes ?? "").toMatch(/declared type=Edm\.String/);
  });

  it("is ONE entry — the duplicate identity was merged", () => {
    // Two entries described this one fact until 2026-08-28: an older
    // `max_financing` carrying the live census, and a `max_financing_percent`
    // added the same week claiming needs_probe with no Cotality field, which
    // contradicted evidence already in the registry.
    const all = FIELD_REGISTRY.filter((f) => /financing/i.test(f.canonicalKey));
    expect(all.map((f) => f.canonicalKey)).toEqual(["max_financing_percent"]);
  });

  it("records a Mallan-side execution strategy, so it is repairable rather than dead", () => {
    // `$filter` cannot reach inside an Edm.String, so a PROVIDER filter is
    // impossible — but the raw fact is retrievable and derivable onto the
    // projection like amenity_keys. Modelling readiness purely on "is there a
    // provider clause" would make this permanently unexecutable even after
    // Mallan implements it correctly.
    expect(entry("max_financing_percent")!.executionStrategy).toBe("mallan_projection_filter");
  });

  it("is NOT provider-filterable — CustomFields is a JSON string, not a queryable field", () => {
    // The capability constraint must be recorded here, not discovered later by a
    // failing query. `$filter` cannot reach inside an Edm.String blob.
    expect(entry("max_financing_percent")!.filterable).toBe("unsupported");
  });

  it("records the live coverage of the exhaustive census", () => {
    expect(entry("max_financing_percent")!.notes ?? "").toMatch(/84\.9%|6,803/);
  });

  it("records that the DECLARED financing fields are empty", () => {
    const notes = entry("max_financing_percent")!.notes ?? "";
    expect(notes).toMatch(/CurrentFinancing|BuyerFinancing|ListingTerms/);
  });
});

/**
 * MALLAN CAN AUTHOR THIS ON A MALLAN LISTING.
 *
 * A listing has exactly TWO origins: the live Cotality API, or Mallan Real
 * Estate local input. `max_financing` was declared `fixed` / `cotality`,
 * which asserts the provider authored it on EVERY listing — false on every
 * Mallan-authored one, where a Mallan agent enters it.
 *
 * Same category error the registry already documents for `list_price`: a single
 * static authority per FIELD is wrong for authorable listing facts.
 */
describe("max_financing_percent authority follows the listing, not the field", () => {
  const e = () => FIELD_REGISTRY.find((f) => f.canonicalKey === "max_financing_percent")!;

  it("is resolved BY LISTING AUTHORITY, not fixed to the provider", () => {
    expect(e().authorityResolution).toBe("by_listing_authority");
  });

  it("carries no static sourceAuthority — no single value could be truthful", () => {
    expect(e().sourceAuthority).toBeUndefined();
  });

  it("names Mallan as the author on a Mallan-authored listing", () => {
    expect(e().authorityByListingKind).toEqual({
      mallanLocal: "mallan_crm",
      providerListing: "cotality",
    });
  });
});
