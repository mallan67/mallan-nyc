/// <reference types="jest" />
/**
 * THE PROPERTY SUB-TYPE CRITERION — one meaning, two renderers.
 *
 * These tests encode the LIVE contract probed 2026-08-21 against
 * api.cotality.com/trestle and recorded in
 * `docs/idx/cotality-property-subtype-live-contract-2026-08-21.md`:
 *
 *   PropertySubType is a SCALAR nullable Enum with 75 members.
 *   `eq` and `in` are SUPPORTED. `contains(...)` is HTTP 400 PROVIDER_REJECTED.
 *   A mis-cased literal is NOT rejected — it returns 200 with count 0.
 *
 * That last fact is why validation has to happen Mallan-side: the provider will
 * not catch `'apartment'` for us, it will hand back a legitimate-looking empty
 * result set. Nothing in this file may be relaxed without a fresh live probe.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FIELD_REGISTRY } from "../canonical/field-registry";
import {
  PROPERTY_SUB_TYPE_LIVE,
  isPropertySubTypeMember,
  parsePropertySubTypeCriterion,
  UnknownPropertySubTypeError,
  propertySubTypeOData,
  propertySubTypePrisma,
} from "../canonical/property-subtype-contract";

describe("live vocabulary", () => {
  it("carries the 75 members the provider declares", () => {
    expect(PROPERTY_SUB_TYPE_LIVE.members).toHaveLength(75);
  });

  it("records the provider shape as a scalar enum, not a multi-enum", () => {
    expect(PROPERTY_SUB_TYPE_LIVE.shape).toBe("scalar_enum");
  });

  it("names PropertySubType and never PropertySubTypeAdditional", () => {
    expect(PROPERTY_SUB_TYPE_LIVE.cotalityField).toBe("PropertySubType");
    expect(JSON.stringify(PROPERTY_SUB_TYPE_LIVE)).not.toContain("PropertySubTypeAdditional");
  });

  it("records contains() as PROVIDER_REJECTED so no renderer may reach for it", () => {
    expect(PROPERTY_SUB_TYPE_LIVE.operators.contains).toBe("PROVIDER_REJECTED");
    expect(PROPERTY_SUB_TYPE_LIVE.operators.eq).toBe("SUPPORTED");
    expect(PROPERTY_SUB_TYPE_LIVE.operators.in).toBe("SUPPORTED");
  });

  it("separates live-populated members from valid-but-never-populated ones", () => {
    // Both are VALID literals. Only the census distinguishes them, and the
    // distinction may never collapse into "invalid".
    expect(PROPERTY_SUB_TYPE_LIVE.populatedActive.Apartment).toBe(6625);
    expect(PROPERTY_SUB_TYPE_LIVE.neverPopulatedAnyStatus).toContain("Townhouse");
    expect(isPropertySubTypeMember("Townhouse")).toBe(true);
  });

  it("census of populated members sums to the live non-null count", () => {
    const sum = Object.values(PROPERTY_SUB_TYPE_LIVE.populatedActive).reduce((a, b) => a + b, 0);
    expect(sum).toBe(PROPERTY_SUB_TYPE_LIVE.coverage.activeNonNull);
  });
});

describe("membership", () => {
  it("accepts an exact live member", () => {
    expect(isPropertySubTypeMember("Apartment")).toBe(true);
    expect(isPropertySubTypeMember("SingleFamilyResidence")).toBe(true);
  });

  it("rejects a mis-cased member — the provider returns 200/0 and will not catch it", () => {
    expect(isPropertySubTypeMember("apartment")).toBe(false);
    expect(isPropertySubTypeMember("APARTMENT")).toBe(false);
  });

  it("rejects a legacy display label that is not a provider member", () => {
    expect(isPropertySubTypeMember("Condo")).toBe(false);
    expect(isPropertySubTypeMember("Co-op")).toBe(false);
    expect(isPropertySubTypeMember("Single Family")).toBe(false);
  });
});

describe("parsing a criterion", () => {
  it("parses one exact subtype", () => {
    expect(parsePropertySubTypeCriterion("Apartment")).toEqual(["Apartment"]);
  });

  it("parses multiple exact subtypes", () => {
    expect(parsePropertySubTypeCriterion("Apartment,Loft")).toEqual(["Apartment", "Loft"]);
  });

  it("expands the commercial Office,Retail pair into two exact members", () => {
    expect(parsePropertySubTypeCriterion("Office,Retail")).toEqual(["Office", "Retail"]);
  });

  it("accepts an array as well as a comma string", () => {
    expect(parsePropertySubTypeCriterion(["MixedUse", "MultiFamily"])).toEqual([
      "MixedUse",
      "MultiFamily",
    ]);
  });

  it("trims surrounding whitespace but never alters case", () => {
    expect(parsePropertySubTypeCriterion(" Apartment , Loft ")).toEqual(["Apartment", "Loft"]);
  });

  it("de-duplicates repeated members", () => {
    expect(parsePropertySubTypeCriterion("Apartment,Apartment")).toEqual(["Apartment"]);
  });

  it("FAILS LOUD on an unknown token rather than dropping it", () => {
    expect(() => parsePropertySubTypeCriterion("Brownstone")).toThrow(UnknownPropertySubTypeError);
  });

  it("FAILS LOUD on a mis-cased token rather than silently matching nothing", () => {
    expect(() => parsePropertySubTypeCriterion("apartment")).toThrow(UnknownPropertySubTypeError);
  });

  it("FAILS LOUD on a mixed valid/invalid list — never a partial universe", () => {
    expect(() => parsePropertySubTypeCriterion("Apartment,Brownstone")).toThrow(
      UnknownPropertySubTypeError,
    );
  });

  it("names the offending token in the error", () => {
    expect(() => parsePropertySubTypeCriterion("Apartment,Brownstone")).toThrow(/Brownstone/);
  });

  it("treats an empty criterion as no criterion, not as an error", () => {
    expect(parsePropertySubTypeCriterion("")).toEqual([]);
    expect(parsePropertySubTypeCriterion([])).toEqual([]);
  });
});

describe("OData rendering (provider execution)", () => {
  it("renders one member as an exact eq, without parentheses", () => {
    expect(propertySubTypeOData(["Apartment"])).toBe("PropertySubType eq 'Apartment'");
  });

  it("renders several members as a parenthesised OR of exact eq", () => {
    expect(propertySubTypeOData(["Office", "Retail"])).toBe(
      "(PropertySubType eq 'Office' or PropertySubType eq 'Retail')",
    );
  });

  it("NEVER emits contains() — the provider answers HTTP 400", () => {
    const rendered = propertySubTypeOData(["Apartment", "Loft", "MixedUse"]);
    expect(rendered).not.toContain("contains(");
  });

  it("renders nothing for an empty member list", () => {
    expect(propertySubTypeOData([])).toBe("");
  });
});

describe("Prisma rendering (projection execution)", () => {
  it("renders one member as an exact IN of one", () => {
    expect(propertySubTypePrisma(["Apartment"])).toEqual({ in: ["Apartment"] });
  });

  it("renders several members as an exact IN", () => {
    expect(propertySubTypePrisma(["Office", "Retail"])).toEqual({ in: ["Office", "Retail"] });
  });

  it("renders undefined for an empty member list so no predicate is added", () => {
    expect(propertySubTypePrisma([])).toBeUndefined();
  });
});

describe("the two renderers describe ONE universe", () => {
  it("covers exactly the same member set", () => {
    const members = ["Apartment", "Loft", "MixedUse"] as const;
    const odata = propertySubTypeOData([...members]);
    const prisma = propertySubTypePrisma([...members]);

    for (const m of members) {
      expect(odata).toContain(`PropertySubType eq '${m}'`);
      expect(prisma?.in).toContain(m);
    }
    expect(prisma?.in).toHaveLength(members.length);
    expect(odata.split(" or ")).toHaveLength(members.length);
  });

  it("no substring false-positive: MultiFamily does not admit Family, and Apartment does not admit Apart", () => {
    // The old substring path matched `sub.indexOf(v) !== -1`, so a criterion of
    // "Family" swept in MultiFamily and SingleFamilyResidence alike.
    expect(() => parsePropertySubTypeCriterion("Family")).toThrow(UnknownPropertySubTypeError);
    expect(() => parsePropertySubTypeCriterion("Apart")).toThrow(UnknownPropertySubTypeError);
  });
});

describe("CommonInterest stays a separate provider fact", () => {
  it("does not expose an ownership mapping", () => {
    expect(JSON.stringify(PROPERTY_SUB_TYPE_LIVE)).not.toContain("CommonInterest");
  });

  it("records that the ownership-shaped members are never populated, so they cannot proxy ownership", () => {
    expect(PROPERTY_SUB_TYPE_LIVE.neverPopulatedAnyStatus).toEqual(
      expect.arrayContaining(["Condominium", "StockCooperative"]),
    );
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE REGISTRY MUST AGREE WITH THE LIVE CONTRACT.
 *
 * The registry is the canonical mapping AUTHORITY, so a wrong entry there
 * propagates into every consumer that trusts it. Before 2026-08-21 it declared
 * `property_sub_type` a `multi_enum` while pointing at the SCALAR
 * `PropertySubType`, and attributed Mallan's own 502 to the provider.
 */
describe("FIELD_REGISTRY agrees with the live provider contract", () => {
  const entry = FIELD_REGISTRY.find((f) => f.canonicalKey === "property_sub_type")!;

  it("is present", () => {
    expect(entry).toBeDefined();
  });

  it("declares the SCALAR enum shape the provider declares, not multi_enum", () => {
    expect(entry.type).toBe("enum");
  });

  it("points at PropertySubType and never at the separate PropertySubTypeAdditional", () => {
    expect(entry.cotalityField).toBe("PropertySubType");
  });

  it("is mapped and filterable now that eq/in are proven SUPPORTED", () => {
    expect(entry.providerMappingStatus).toBe("mapped");
    expect(entry.filterable).toBe("yes");
  });

  it("records the storage columns that actually exist", () => {
    expect(entry.dbColumn).toBe("property_sub_type");
    expect(entry.projectionColumn).toBe("property_sub_type");
  });

  it("names the search param the authenticated collector really emits", () => {
    // The CRM collector emits `propertySubType`. `subTypes` is read only by the
    // PUBLIC /api/listings route, which is a separate product surface.
    expect(entry.searchParam).toBe("propertySubType");
  });

  /**
   * These assert what the note must SAY, not which strings it must lack. The
   * corrected note deliberately quotes the old wrong claim in order to refute
   * it, so an absence-of-substring test cannot tell "asserts X" from "records
   * that X was wrong" — it would fail the honest version and pass a note that
   * simply deleted the history.
   */
  it("attributes the 400 to the provider and the 502 to Mallan's own route", () => {
    expect(entry.notes).toMatch(/HTTP 400/);
    expect(entry.notes).toMatch(/502 was Mallan['’]s own/);
  });

  it("records the operators that are actually SUPPORTED", () => {
    expect(entry.notes).toMatch(/`eq` and `in` are SUPPORTED/);
  });

  it("carries the correction date so the claim can be re-probed against it", () => {
    expect(entry.notes).toMatch(/CORRECTED 2026-08-21/);
    expect(entry.notes).toMatch(/PROPERTY_SUB_TYPE_LIVE|property-subtype-contract/);
  });

  it("records that a mis-cased literal is NOT rejected by the provider", () => {
    expect(entry.notes).toMatch(/MIS-CASED/i);
  });
});

describe("the field-registry factory comment does not contradict itself", () => {
  const source = readFileSync(
    join(__dirname, "..", "canonical", "field-registry.ts"),
    "utf8",
  );

  it("does not still claim sourceAuthority is REQUIRED before explaining it is conditional", () => {
    // A source-text assertion is the right shape here: the claim IS about the
    // comment. The stale line survived two corrections because nothing tested it.
    expect(source).not.toMatch(/`sourceAuthority` is REQUIRED here, not defaulted/);
  });

  it("still states the rule that IS true — authorityResolution mandatory, sourceAuthority conditional", () => {
    expect(source).toMatch(/`authorityResolution` is MANDATORY/);
    expect(source).toMatch(/`sourceAuthority` is CONDITIONAL/);
  });
});
