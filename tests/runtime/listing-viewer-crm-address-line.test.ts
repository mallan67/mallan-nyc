/// <reference types="jest" />
/**
 * Sales / Rental Tools viewers — the header address of a Mallan (SL-/RL-) listing
 * is the whole street line the CRM stored.
 *
 * Observed 2026-10-28 on /crm/sale-view?listingId=SL-0008: the header read
 * "400 90TH #ACCEPTANCE-17C" for a listing saved as 400 E 90TH Street — a loader
 * joined StreetNumber + StreetName only, dropping the direction and the street
 * type (and the direction suffix of "425 Park Avenue S"). The viewers compose the
 * line through the hydration module (MallanListingHydration.streetLine), from the
 * canonical address bucket first and raw_data as the fallback.
 */
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "../..");
const win: any = {};
new Function("window", readFileSync(resolve(ROOT, "public/crm/js/forms/listing-hydration.js"), "utf8"))(win);
const streetLine = (address: Record<string, unknown>, raw_data: Record<string, unknown> = {}) => win.MallanListingHydration.streetLine({ address, raw_data });

describe("the viewers' street line keeps every atom the CRM stored", () => {
  it("keeps the direction prefix and the street type", () => {
    expect(streetLine({ StreetNumber: "400", StreetDirPrefix: "E", StreetName: "90TH", StreetSuffix: "Street", UnitNumber: "17C" })).toBe("400 E 90TH Street");
  });

  it("keeps a direction suffix (Park Avenue South is PARK / Avenue / S in Cotality's shape)", () => {
    expect(streetLine({ StreetNumber: "425", StreetName: "Park", StreetSuffix: "Avenue", StreetDirSuffix: "S", UnitNumber: "4D" })).toBe("425 Park Avenue S");
  });

  it("a number + name address is unchanged", () => {
    expect(streetLine({ StreetNumber: "400", StreetName: "East 90th Street", UnitNumber: "17C" })).toBe("400 East 90th Street");
  });

  it("falls back to raw_data when the address bucket is empty", () => {
    expect(streetLine({}, { StreetNumber: "60", StreetName: "Sutton", StreetSuffix: "Place", StreetDirSuffix: "S" })).toBe("60 Sutton Place S");
  });

  it.each(["public/crm/SALE-FORM-WITH-TOOLS.html", "public/crm/RENTAL-FORM-WITH-TOOLS.html"])("%s composes the header address through the module", (rel) => {
    expect(readFileSync(resolve(ROOT, rel), "utf8")).toContain("address: MallanListingHydration.streetLine(apiData),");
  });
});
