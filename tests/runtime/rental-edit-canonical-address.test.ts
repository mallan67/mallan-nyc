/**
 * S-RENT-005 replacement (Sentinel-L retirement).
 *
 * Rental edit reload (`_populateRentalFormFromApi` in RENTAL-FORM-REDESIGN.html)
 * must hydrate the address from the CANONICAL structured atoms — in particular
 * `StreetDirPrefix` — rather than preferring lossy raw_data. This mirrors the
 * sale-side coverage (sales-333-e-46th.test.ts) that the rental side previously
 * lacked, so a rental edit roundtrip cannot silently drop the E/W/N/S direction.
 *
 * Source-contract scan of the static form; no DB/network.
 */
import * as fs from "fs";
import * as path from "path";

const FORM = path.resolve(
  __dirname,
  "../../public/crm/RENTAL-FORM-REDESIGN.html",
);
const src = fs.readFileSync(FORM, "utf8");

describe("Rental edit hydration preserves canonical address atoms (S-RENT-005)", () => {
  it("has a _populateRentalFormFromApi hydration routine", () => {
    expect(src).toContain("_populateRentalFormFromApi");
  });

  it("hydrates StreetDirPrefix from the canonical address object (addr.StreetDirPrefix)", () => {
    const start = src.indexOf("_populateRentalFormFromApi");
    // scan the hydration routine body for the canonical direction atom read
    const body = src.slice(start, start + 6000);
    expect(body).toMatch(/addr\.StreetDirPrefix|canonical[\s\S]{0,200}StreetDirPrefix/i);
  });

  it("does not read the street-direction atom ONLY from raw_data (canonical-first)", () => {
    // guard against the lossy shape `raw_data.StreetDirPrefix || addr...`
    // (raw_data preferred over canonical) that the retired rule targeted.
    expect(src).not.toMatch(/(?:raw|raw_data|rawData)\.StreetDirPrefix\s*\|\|\s*(?:addr|address|canonical)/);
  });
});
