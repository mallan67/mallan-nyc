/// <reference types="jest" />
/**
 * `lib/compliance/rebny-validator.ts` had zero tests before this file. Added when its
 * required/conditional field-rule source was migrated off the deleted, legacy
 * `lib/compliance/rls-rules.json` onto `lib/compliance/rebny-field-tables.ts` — the
 * live-Cotality-verified table `lib/compliance/rls-enforcement.ts`'s write-path gate
 * already reads — so the migration lands with coverage, not just a successful build.
 *
 * Proves:
 *   1. an unconditionally required field (agentSubmitted) missing -> error
 *   2. Concessions='Yes' without ConcessionsAmount/ConcessionsComments -> conditional error
 *   3. Concessions='Yes' WITH both sub-fields -> no conditional error for them
 *   4. Concessions='No' -> the sub-fields are not required (condition does not apply)
 *   5. NYC (Manhattan, NY) listing missing TaxLot -> NYC TaxLot error
 *   6. NYC county mismatch (Manhattan listed under Kings county) -> error
 *   7. Fair Housing prohibited term in PublicRemarks -> error + sanitized enhancedData
 *   8. getRequiredFields() includes both an unconditional field and a PropertyType-
 *      conditional field, read structurally off `appliesWhen` (not string-matched)
 */
import { validateListing, getRequiredFields } from "@/lib/compliance/rebny-validator";

describe("rebny-validator: validateListing", () => {
  it("1. flags a missing unconditionally-required field (PropertyType)", () => {
    const result = validateListing({ Concessions: "No" });
    expect(result.valid).toBe(false);
    expect(result.compliance.rebnyRls).toBe(false);
    expect(result.errors.some((e) => e.includes("Required field missing: PropertyType"))).toBe(true);
    expect(
      result.fieldResults.find((f) => f.field === "PropertyType" && f.status === "error")
    ).toBeTruthy();
  });

  it("2. Concessions='Yes' without ConcessionsAmount/ConcessionsComments triggers the conditional rule", () => {
    const result = validateListing({ Concessions: "Yes" });
    expect(result.errors.some((e) => e.includes("Conditional field required: ConcessionsAmount"))).toBe(
      true
    );
    expect(
      result.errors.some((e) => e.includes("Conditional field required: ConcessionsComments"))
    ).toBe(true);
  });

  it("3. Concessions='Yes' with both sub-fields present satisfies the conditional rule", () => {
    const result = validateListing({
      Concessions: "Yes",
      ConcessionsAmount: 5000,
      ConcessionsComments: "One month free",
    });
    expect(result.errors.some((e) => e.includes("ConcessionsAmount"))).toBe(false);
    expect(result.errors.some((e) => e.includes("ConcessionsComments"))).toBe(false);
  });

  it("4. Concessions='No' does not require ConcessionsAmount/ConcessionsComments", () => {
    const result = validateListing({ Concessions: "No" });
    expect(result.errors.some((e) => e.includes("ConcessionsAmount"))).toBe(false);
    expect(result.errors.some((e) => e.includes("ConcessionsComments"))).toBe(false);
  });

  it("5. NYC listing (Manhattan, NY) missing TaxLot is flagged", () => {
    const result = validateListing({ City: "Manhattan", StateOrProvince: "NY" });
    expect(result.errors.some((e) => e.includes("[NYC] TaxLot is required"))).toBe(true);
  });

  it("5b. NYC listing with TaxLot present is not flagged for TaxLot", () => {
    const result = validateListing({ City: "Manhattan", StateOrProvince: "NY", TaxLot: "1234-5" });
    expect(result.errors.some((e) => e.includes("TaxLot is required"))).toBe(false);
  });

  it("6. county mismatch is flagged (Manhattan listed under Kings county)", () => {
    const result = validateListing({
      City: "Manhattan",
      StateOrProvince: "NY",
      CountyOrParish: "Kings",
      TaxLot: "1234-5",
    });
    expect(result.errors.some((e) => e.includes("[NYC] County mismatch"))).toBe(true);
  });

  it("7. a Fair Housing prohibited term in PublicRemarks is flagged and sanitized", () => {
    // "55+" is one of the canonical data/compliance/prohibited-terms.json terms confirmed present by
    // tests/runtime/guardrails-prohibited-terms-single-source.test.ts; used here so this test does not
    // depend on guessing which exact strings the canonical list contains.
    const result = validateListing({ PublicRemarks: "Great building, 55+ community preferred." });
    expect(result.compliance.fairHousing).toBe(false);
    expect(result.errors.some((e) => e.includes("[Fair Housing] Prohibited terms found in PublicRemarks"))).toBe(
      true
    );
    expect(result.enhancedData?.PublicRemarks).toBeDefined();
    expect(String(result.enhancedData?.PublicRemarks)).not.toMatch(/55\+/);
  });

  it("7b. clean PublicRemarks text is not flagged for Fair Housing", () => {
    const result = validateListing({ PublicRemarks: "Spacious two bedroom with a renovated kitchen." });
    expect(result.compliance.fairHousing).toBe(true);
  });
});

describe("rebny-validator: getRequiredFields", () => {
  it("8. includes an unconditionally-required field for any property type", () => {
    const required = getRequiredFields("Residential");
    expect(required).toContain("PropertyType");
  });

  it("8b. includes a PropertyType-conditional field when PropertyType matches", () => {
    const required = getRequiredFields("Residential");
    // CONDO-COOP-001's appliesWhen.PropertyType includes 'Residential'.
    expect(required).toContain("AssociationFee");
  });
});
