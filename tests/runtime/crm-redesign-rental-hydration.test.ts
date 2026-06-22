/// <reference types="jest" />
/**
 * A3 (board #415) — `RENTAL-FORM-REDESIGN.html` existing-rental edit hydration.
 *
 * `_populateRentalFormFromApi()` previously wrote API values into ~21 nonexistent controls
 * (price/baths/size/rooms/dates/IDX+internet display flags/building/co-list/feature groups).
 * For controls the SAVE path reads (collectRentalFormData), that blanked the real control on
 * edit and a subsequent save could overwrite good data — including the compliance display gates.
 *
 * Static guard: every setVal/setChecked target must exist as an element id, and every setRadio
 * target must have matching name= radios. Comments are stripped before extracting targets.
 */
import { readFileSync } from "fs";
import { join } from "path";

const form = readFileSync(join(process.cwd(), "public", "crm", "RENTAL-FORM-REDESIGN.html"), "utf8");

// Body of _populateRentalFormFromApi, with // line comments stripped (comments legitimately
// mention old/phantom ids).
const body = (() => {
  const start = form.indexOf("function _populateRentalFormFromApi");
  const end = form.indexOf("document.addEventListener", start);
  return form.slice(start, end).replace(/\/\/.*$/gm, "");
})();

function targets(kind: "setVal" | "setChecked" | "setRadio"): string[] {
  const re = new RegExp(kind + "\\('([a-zA-Z0-9_]+)'", "g");
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) out.add(m[1]);
  return [...out];
}
const hasId = (id: string) => new RegExp(`id="${id}"`).test(form);
const hasName = (n: string) => new RegExp(`name="${n}"`).test(form);

describe("A3 static guard — every hydration target maps to a real control", () => {
  it.each(targets("setVal"))("setVal target '%s' exists as an element id", (id) => {
    expect(hasId(id)).toBe(true);
  });
  it.each(targets("setChecked"))("setChecked target '%s' exists as an element id", (id) => {
    expect(hasId(id)).toBe(true);
  });
  it.each(targets("setRadio"))("setRadio target '%s' has matching name= radios", (name) => {
    expect(hasName(name)).toBe(true);
  });
});

describe("A3 regression — known bad targets now hydrate into the REAL save controls", () => {
  it("price → rentalMonthlyRent (was the nonexistent rentalListPrice)", () => {
    expect(body).toMatch(/setVal\('rentalMonthlyRent', listing\.list_price/);
    expect(body).not.toContain("setVal('rentalListPrice'");
  });

  it("full baths → rentalFullBathrooms; half baths → rentalHalfBathrooms", () => {
    expect(body).toMatch(/setVal\('rentalFullBathrooms', listing\.bathrooms_full/);
    expect(body).toMatch(/setVal\('rentalHalfBathrooms', listing\.bathrooms_half/);
    expect(body).not.toContain("setVal('rentalBathsFull'");
    expect(body).not.toContain("setVal('rentalBathsHalf'");
  });

  it("size → rentalSqFt; rooms → rentalTotalRooms", () => {
    expect(body).toMatch(/setVal\('rentalSqFt', listing\.living_area/);
    expect(body).toMatch(/setVal\('rentalTotalRooms', features\.Rooms/);
    expect(body).not.toContain("setVal('rentalLivingArea'");
    expect(body).not.toContain("setVal('rentalRooms'");
  });

  it("IDX/internet display flags hydrate into the real compliance controls", () => {
    expect(body).toContain("setChecked('rentalIDXEntireListingDisplayYN', listing.idx_display_yn");
    expect(body).toContain(
      "setChecked('rentalInternetEntireListingDisplayYN', listing.internet_entire_listing_display_yn",
    );
    expect(body).toContain(
      "setChecked('rentalInternetAddressDisplayYN', listing.internet_address_display_yn",
    );
    expect(body).not.toContain("setChecked('rentalIdxDisplayYN'");
    expect(body).not.toContain("setChecked('rentalInternetDisplayYN'");
    expect(body).not.toContain("setChecked('rentalInternetAddressYN'");
  });

  it("expiration date → rentalExclusiveExpires (was the nonexistent rentalExpirationDate)", () => {
    expect(body).toContain("setVal('rentalExclusiveExpires', listing.listing_contract_date");
    expect(body).not.toContain("setVal('rentalExpirationDate'");
  });

  it("phantom group/building/co-list setVals removed (collected via checkbox groups/association)", () => {
    for (const dead of [
      "rentalHeating",
      "rentalCooling",
      "rentalAppliances",
      "rentalInteriorFeatures",
      "rentalLaundry",
      "rentalPets",
      "rentalYearBuilt",
      "rentalBuildingName",
      "rentalBuildingUnits",
      "rentalBuildingStories",
      "rentalCoListingAgent",
      "rentalCoListingCompany",
    ]) {
      expect(body).not.toContain("setVal('" + dead + "'");
    }
  });
});
