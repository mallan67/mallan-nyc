/// <reference types="jest" />
/**
 * What does NOT lock a sale, and what loads by itself (Maya, 2026-11-05, reading the red "REBNY Required Fields Missing" box of a co-op: "showing instructions should not lock the file, concessions
 * should not lock the file, this is not in the sale form; tax lot for coop should be automatic, i should not look for it").
 *
 *  - Showing Instructions: a private note no public page shows, and Cotality serves it on no listing. A SALE is not asked for it (the form's red list, the REBNY validator and the RLS write gate all
 *    agree); a RENTAL still is, so the rule is kept where it was not relaxed.
 *  - Concessions: a rental term (CONCESSIONS-RENTAL-001). It is not in the Sale form's required list and no sale validator asks for it.
 *  - A co-op has ONE tax lot, the building's, and a record's TaxLot IS it (live 333 E 46th: every record says 0012): the building lookup fills it. A condo's record carries one UNIT's lot, which is
 *    never the building's.
 */
import { validateListing, getRequiredFields } from "@/lib/compliance/rebny-validator";
import { assertRlsCompliantPayload } from "@/lib/compliance/rls-enforcement";
import { bootAddForm, sleep, type BootedForm } from "./add-form-harness";

jest.setTimeout(120000);

describe("Showing Instructions: a sale is not asked for it, a rental still is", () => {
  const missing = (listing: Record<string, unknown>) => validateListing(listing as any).errors.filter((e) => /ShowingInstructions/.test(e));

  it("the REBNY validator: a sale missing it has no error about it; a rental missing it still does", () => {
    expect(missing({ PropertyType: "Residential" })).toEqual([]);
    expect(missing({ PropertyType: "ResidentialLease" })).not.toEqual([]);
    expect(missing({ PropertyType: "CommercialLease" })).not.toEqual([]);
  });

  it("the REBNY validator: a value that IS there is still read (nothing is switched off for a sale that has one)", () => {
    expect(missing({ PropertyType: "Residential", ShowingInstructions: "Call the agent." })).toEqual([]);
  });

  it("getRequiredFields lists it for a rental and not for a sale", () => {
    expect(getRequiredFields("Residential")).not.toContain("ShowingInstructions");
    expect(getRequiredFields("ResidentialLease")).toContain("ShowingInstructions");
  });

  it("the RLS write gate: a sale is not blocked for it, a rental is", () => {
    const blockedFor = (listingType: "sale" | "rent") => assertRlsCompliantPayload({}, { listingType }).blockers.some((b) => b.field === "ShowingInstructions");
    expect(blockedFor("sale")).toBe(false);
    expect(blockedFor("rent")).toBe(true);
  });

  it("the Sale form's red list does not carry it or Concessions, with the box empty", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 500 });
    try {
      expect((f.d.getElementById("saleShowingInstructions") as HTMLTextAreaElement).value).toBe("");
      const red = (f.w as any).validateREBNYRequired("sale") as string[];
      expect(red.length).toBeGreaterThan(0);                              // the list itself still works
      expect(red.filter((l) => /showing instructions|concession/i.test(l))).toEqual([]);
    } finally { f.close(); }
  });

  it("the Sale form still HAS the Showing Instructions box (optional, not removed)", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 300 });
    try { expect(f.d.getElementById("saleShowingInstructions")).not.toBeNull(); } finally { f.close(); }
  });
});

describe("a co-op's building lot loads by itself", () => {
  // What GET /api/buildings/search answers for a building (snake_case). A co-op record carries TaxLot (the building's) and, on some records, the custom key BuildingTaxLot.
  const COOP = { address: "333 E 46th St", name: "", borough: "Manhattan", zip: "10017", neighborhood: "Turtle Bay", common_interest: "StockCooperative", structure_type: "HighRise", year_built: 1959, stories_total: 20, units_total: 160, tax_block: "01339", tax_lot: "0012" };
  const CONDO = { ...COOP, address: "800 2nd Ave", common_interest: "Condominium", tax_block: "01335", tax_lot: "1218" };       // a condo record's TaxLot is ONE UNIT's lot

  async function pick(row: Record<string, unknown>): Promise<BootedForm> {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { buildings: [row], settle: 700 });
    const box = f.d.getElementById("saleBuildingSearch") as HTMLInputElement;
    box.value = String(row.address).slice(0, 9);
    box.dispatchEvent(new f.w.Event("input", { bubbles: true }));
    await sleep(500);
    const offered = f.d.querySelector("#saleBuildingSearchResults > div") as HTMLElement;
    expect(offered).not.toBeNull();
    offered.click();
    await sleep(200);
    return f;
  }
  const val = (f: BootedForm, id: string) => (f.d.getElementById(id) as HTMLInputElement).value;

  it("a co-op with no BuildingTaxLot key takes the record's TaxLot as the building's lot, with its block and year", async () => {
    const f = await pick(COOP);
    try {
      expect(val(f, "saleBldgTaxLot")).toBe("0012");
      expect(val(f, "saleBldgTaxBlock")).toBe("01339");
      expect(val(f, "saleBldgYearBuilt")).toBe("1959");
      const red = (f.w as any).validateREBNYRequired("sale") as string[];
      expect(red.filter((l) => /^Tax Lot|Tax Block|Year Built/.test(l))).toEqual([]);          // none of the three is asked of the agent
    } finally { f.close(); }
  });

  it("the custom key BuildingTaxLot, when the record carries it, wins over TaxLot", async () => {
    const f = await pick({ ...COOP, building_tax_lot: "7502" });
    try { expect(val(f, "saleBldgTaxLot")).toBe("7502"); } finally { f.close(); }
  });

  it.each(["0", "0000", "NA", "", "12A"])("a record whose TaxLot is %j is no answer: the box stays empty", async (lot) => {
    const f = await pick({ ...COOP, tax_lot: lot });
    try { expect(val(f, "saleBldgTaxLot")).toBe(""); } finally { f.close(); }
  });

  it("a condo's record TaxLot is one UNIT's lot: it never becomes the building's", async () => {
    const f = await pick(CONDO);
    try { expect(val(f, "saleBldgTaxLot")).toBe(""); } finally { f.close(); }
  });
});
