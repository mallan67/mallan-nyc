/// <reference types="jest" />
/**
 * Two tax lots, two lookups (Maya, 2026-11-03): "When you load the address it should record the building tax lot ... when it loads the unit then the unit tax lot should be pulled",
 * "it should be linked to the Cotality API that pulls it".
 *
 *  - the BUILDING's lot arrives with the address (the building lookup's building_tax_lot -> the Building window's box)
 *  - the UNIT's lot is asked of the live Cotality API once the unit number is known (GET /api/buildings/search?q=&unit=&zip=), for a unit that has a lot of its own (a condo)
 *  - a number the agent typed is never replaced; a pulled one follows the unit; a slow answer for an earlier unit never lands on the current one
 */
import { bootAddForm, storedListing, sleep, type BootedForm } from "./add-form-harness";
import { completeForm, saveDraft, missing, setValue, val, change, waitUntil, loaded } from "./sale-form-filler";

jest.setTimeout(300000);
/* eslint-disable @typescript-eslint/no-explicit-any */

// Live, 800 2ND Avenue (Cotality, 2026-11-03): #806 -> TaxLot 1025 on RLS20123633, building lot 7501
const LOTS: Record<string, any> = {
  "806": { unit_number: "806", tax_lot: "1025", tax_block: "01335", building_tax_lot: "7501", same_as_building: false, source_listing_id: "RLS20123633", source_status: "Active" },
  "1203": { unit_number: "1203", tax_lot: "1099", tax_block: "01335", building_tax_lot: "7501", same_as_building: false, source_listing_id: "RLS1", source_status: "Closed" },
  "800": { unit_number: "800", tax_lot: "7501", tax_block: "01335", building_tax_lot: "7501", same_as_building: true, source_listing_id: "RLS2", source_status: "Closed" },
};
const answer = (_q: string, unit: string) => LOTS[unit] ?? null;
const unitLot = (f: BootedForm) => val(f, "saleUnitTaxLot");
const pickType = (f: BootedForm, t: string) => { const r = f.d.querySelector(`input[name="salePropertyType"][value="${t}"]`) as HTMLInputElement; r.checked = true; change(f, r); };
/** Enters the unit, then waits for the lot to show `expected` (a wait on the page, not a guess), or, when nothing is expected to change, for a settled quarter second. */
async function enterUnit(f: BootedForm, unit: string, expected?: string) {
  setValue(f, "saleUnitNumber", unit);
  if (expected === undefined) await sleep(250);
  else await waitUntil(() => unitLot(f) === expected);
}
async function condoWithAddress(opts: Record<string, any> = {}) {
  const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600, unitLots: answer, ...opts });
  pickType(f, "Condo");
  setValue(f, "saleStreetAddress", "800 2nd Ave");
  setValue(f, "saleZipCode", "10017");
  return f;
}

describe("the unit's tax lot is pulled from Cotality when the unit is entered", () => {
  it("unit 806 at 800 2nd Ave asks Cotality once and fills 1025, saying where it came from", async () => {
    const f = await condoWithAddress();
    try {
      await enterUnit(f, "806", "1025");
      expect(f.unitLookups).toEqual(["800 2nd Ave|806|10017"]);
      expect(unitLot(f)).toBe("1025");
      expect((f.d.getElementById("saleUnitTaxLot") as HTMLInputElement).title).toMatch(/Pulled from Cotality: unit 806 on RLS20123633/);
      expect(missing(f).map((m: any) => m.label)).not.toContain("Tax Lot (unit)");
    } finally { f.close(); }
  });

  it("the building's lot comes with the address and the unit's with the unit: two different numbers in two boxes", async () => {
    const f = await condoWithAddress();
    try {
      (f.w as any).populateBuildingFromIDX("sale", { name: "Test Tower", building_tax_lot: "7501" });
      await enterUnit(f, "806", "1025");
      expect(val(f, "saleBldgTaxLot")).toBe("7501");
      expect(unitLot(f)).toBe("1025");
    } finally { f.close(); }
  });

  it("a number the agent typed is never replaced, and Cotality is not even asked", async () => {
    const f = await condoWithAddress();
    try {
      setValue(f, "saleUnitTaxLot", "1999");
      await enterUnit(f, "806");
      expect(unitLot(f)).toBe("1999");
      expect(f.unitLookups).toEqual([]);
    } finally { f.close(); }
  });

  it("a pulled lot follows the unit: a new unit replaces it, and a unit Cotality has no lot for clears it (the old unit's lot is not this one's)", async () => {
    const f = await condoWithAddress();
    try {
      await enterUnit(f, "806", "1025");
      await enterUnit(f, "1203", "1099");
      await enterUnit(f, "9Z", "");
      expect(missing(f).map((m: any) => m.label)).toContain("Tax Lot (unit)");        // nothing guessed: the checklist asks
    } finally { f.close(); }
  });

  it.each([["the network is down", "throw"], ["the server answers 503", 503]])("when the lookup for the NEW unit fails (%s), the previous unit's pulled lot is cleared, never saved under the new unit (review on #677)", async (_why, fail) => {
    const f = await condoWithAddress({ unitFail: (u: string) => (u === "1203" ? fail : undefined) });
    try {
      await enterUnit(f, "806", "1025");
      await enterUnit(f, "1203", "");                          // the failed ask clears the 806 lot
      expect(unitLot(f)).toBe("");
      expect(missing(f).map((m: any) => m.label)).toContain("Tax Lot (unit)");
    } finally { f.close(); }
  });

  it("a failed lookup never touches a number the agent typed", async () => {
    const f = await condoWithAddress({ unitFail: () => "throw" });
    try {
      setValue(f, "saleUnitTaxLot", "1999");
      await enterUnit(f, "806");
      expect(unitLot(f)).toBe("1999");
    } finally { f.close(); }
  });

  it("the moment the unit changes the old unit's pulled lot is gone from the box and from a save, while the new answer is still on its way (review on #677)", async () => {
    const f = await condoWithAddress({ unitDelay: (u: string) => (u === "1203" ? 500 : 10) });
    try {
      await enterUnit(f, "806", "1025");
      setValue(f, "saleUnitNumber", "1203");                    // the answer for 1203 takes half a second
      await waitUntil(() => f.unitLookups.length === 2);
      expect(unitLot(f)).toBe("");                              // 806's lot is already gone ...
      expect((f.w as any).collectSaleFormData().TaxLot ?? "").toBe("");   // ... so a save or autosave now cannot store it under 1203
      await waitUntil(() => unitLot(f) === "1099");             // and 1203's own lot arrives
    } finally { f.close(); }
  });

  it("a lot Cotality only repeats from the building is not the unit's: nothing is filled", async () => {
    const f = await condoWithAddress();
    try {
      await enterUnit(f, "800");
      expect(unitLot(f)).toBe("");
    } finally { f.close(); }
  });

  it("a slow answer for an earlier unit never lands on the current one", async () => {
    const f = await condoWithAddress({ unitDelay: (u: string) => (u === "806" ? 400 : 10) });
    try {
      setValue(f, "saleUnitNumber", "806");                    // slow (400 ms)
      await waitUntil(() => f.unitLookups.length === 1);
      setValue(f, "saleUnitNumber", "1203");                   // fast, asked later
      await waitUntil(() => unitLot(f) === "1099");
      await sleep(700);                                        // the slow 806 answer arrives meanwhile
      expect(f.unitLookups.length).toBe(2);
      expect(unitLot(f)).toBe("1099");
    } finally { f.close(); }
  });

  it("a co-op (the building's lot is the lot) never asks for a unit lot", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600, unitLots: answer });
    try {
      pickType(f, "Coop");
      setValue(f, "saleStreetAddress", "800 2nd Ave");
      await enterUnit(f, "806");
      expect(f.unitLookups).toEqual([]);
      expect(unitLot(f)).toBe("");
    } finally { f.close(); }
  });

  it("no lookup without an address or a unit", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600, unitLots: answer });
    try {
      pickType(f, "Condo");
      await enterUnit(f, "806");                               // no address yet
      expect(f.unitLookups).toEqual([]);
    } finally { f.close(); }
  });

  it("an opened saved listing whose unit lot is still empty asks Cotality once and fills it", async () => {
    const a = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
    let saved: Record<string, any>;
    try {
      await completeForm(a, { type: "Condo", omit: ["saleUnitTaxLot"], values: { saleUnitNumber: "806" } });
      saved = await saveDraft(a);
    } finally { a.close(); }
    const b = await bootAddForm("SALE-FORM-REDESIGN", { search: "?id=1", listing: storedListing(saved, "sale"), settle: 1000, unitLots: answer });
    try {
      await loaded(b);
      await waitUntil(() => unitLot(b) === "1025");
    } finally { b.close(); }
  });

  it("a pulled lot is saved as the unit's TaxLot, separate from the building's BuildingTaxLot", async () => {
    const f = await condoWithAddress();
    try {
      (f.w as any).populateBuildingFromIDX("sale", { name: "Test Tower", building_tax_lot: "7501" });
      await enterUnit(f, "806", "1025");
      await completeForm(f, { type: "Condo", omit: ["saleUnitTaxLot", "saleBldgTaxLot"] });
      const p = await saveDraft(f);
      expect(String(p.TaxLot)).toBe("1025");
      expect(String(p.BuildingTaxLot)).toBe("7501");
    } finally { f.close(); }
  });
});
