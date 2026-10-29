/// <reference types="jest" />
/**
 * lib/idx/public-dto.ts::mapPropertyTypeToDisplay — PropertySubType
 * characterization (2026-10-02 PropertySubType cutover).
 *
 * This function is reached from app/api/open-houses/route.ts,
 * lib/buildings/public-building-data.ts, and lib/idx/db-to-public-dto.ts --
 * all live, non-frozen production paths. Its "single family"/"house"
 * substring branch is a PROVEN_DEAD_BRANCH: live Cotality's PropertySubType
 * uses SingleFamilyResidence (no space; confirmed live via
 * trestle_lookup_field, 19,434 current rows), which never contains "single
 * family" or "house" as a substring.
 *
 * What this function SHOULD display for SingleFamilyResidence is
 * MALLAN_BUSINESS_RULE_UNRESOLVED -- the search-filter layer
 * (lib/search/public-listing-db.ts, app/api/listings/route.ts) already uses
 * "Single Family" (with space) as its own established Mallan-facing label
 * for the identical raw value, and this function's own dead branch suggests
 * a different intent ("House"). These tests pin the CURRENT fallthrough
 * behavior only -- not a target, not an endorsement of either label.
 */
import { mapPropertyTypeToDisplay } from "../public-dto";

describe("mapPropertyTypeToDisplay — SingleFamilyResidence (PropertySubType cutover 2026-10-02)", () => {
  it("[CHARACTERIZATION, MALLAN_BUSINESS_RULE_UNRESOLVED] SingleFamilyResidence falls through the dead 'single family'/'house' branch and returns the raw value verbatim", () => {
    expect(mapPropertyTypeToDisplay(undefined, "SingleFamilyResidence", "Residential")).toBe(
      "SingleFamilyResidence",
    );
  });

  it("CommonInterest still takes priority over PropertySubType when both are present", () => {
    expect(mapPropertyTypeToDisplay("Condominium", "SingleFamilyResidence", "Residential")).toBe("Condo");
  });

  it("other live PropertySubType values with a resolved Mallan label are unaffected", () => {
    expect(mapPropertyTypeToDisplay(undefined, "Townhouse", "Residential")).toBe("Townhouse");
    expect(mapPropertyTypeToDisplay(undefined, "MultiFamily", "Residential")).toBe("Multi-Family");
    expect(mapPropertyTypeToDisplay(undefined, "Loft", "Residential")).toBe("Loft");
  });

  it("missing PropertySubType falls back to the fallback parameter, never a fabricated value", () => {
    expect(mapPropertyTypeToDisplay(undefined, null, "Residential")).toBe("Residential");
    expect(mapPropertyTypeToDisplay(undefined, undefined, "Residential")).toBe("Residential");
  });
});
