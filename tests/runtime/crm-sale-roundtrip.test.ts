/// <reference types="jest" />
/**
 * Save -> reload -> edit -> reload for the two things a listing can silently lose (review of #677, 2026-11-02): the garage ANSWER and the TWO tax lots.
 *
 * Every step goes through the real form: it saves through submitSalesListing, the payload is stored the way the real create route stores it (storedListing: normalizer ->
 * persistence record -> row), and the next form opens that row in edit mode (?id=1) exactly as the CRM does.
 *
 * Garage: an untouched default "No" is not an answer (nothing is sent, the checklist still asks); an explicit No is GarageYN false and GarageSpaces 0, and survives a reload; a
 * saved Yes taken back to No is not resurrected by the stale value that came back with the row.
 * Tax Lot: the unit's lot (Property.TaxLot) and the building's (CustomFields.BuildingTaxLot) are separate boxes, saved and restored separately; a building lot never stands in for a
 * condo's missing unit lot.
 */
import { bootAddForm, storedListing, type BootedForm } from "./add-form-harness";
import { completeForm, saveDraft, missing, pickRadio, setValue, val, checkedValue, loaded } from "./sale-form-filler";

jest.setTimeout(300000);
/* eslint-disable @typescript-eslint/no-explicit-any */

type Kind = { name: string; type: string; units: boolean };
const KINDS: Kind[] = [
  { name: "condo", type: "Condo", units: true },
  { name: "co-op", type: "Coop", units: true },
  { name: "house", type: "SingleFamilyTownhouse", units: false },
];

const open = async (payload: Record<string, any>) => {
  const f = await bootAddForm("SALE-FORM-REDESIGN", { search: "?id=1", listing: storedListing(payload, "sale"), settle: 300 });
  await loaded(f);                                   // restored into the form, however slow the machine
  return f;
};
const unanswered = (f: BootedForm) => missing(f).some((m: any) => m.field.type === "garage");

/** Where the agent answers the garage question: the Unit tab for a unit, the TH tab for a house. */
function answer(f: BootedForm, k: Kind, a: "Yes" | "No", count?: string) {
  if (k.units) {
    pickRadio(f, "saleGarageSpaces", a);
    if (count !== undefined) setValue(f, "saleGarageSpacesCount", count);
  } else {
    setValue(f, "saleTHGarageYN", a);
    if (count !== undefined) setValue(f, "saleTHGarageSpaces", count);
  }
}
/** What the form shows the agent for that question. */
function shown(f: BootedForm, k: Kind) {
  return k.units
    ? { answer: checkedValue(f, "saleGarageSpaces"), count: val(f, "saleGarageSpacesCount") }
    : { answer: val(f, "saleTHGarageYN"), count: val(f, "saleTHGarageSpaces") };
}

describe.each(KINDS)("the garage answer of a $name survives save -> reload -> edit -> reload", (k) => {
  it("an explicit No is saved as GarageYN false + 0 spaces, comes back as answered, and stays false when saved again untouched", async () => {
    const a = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
    let first: Record<string, any>;
    try {
      await completeForm(a, { type: k.type, garage: "unanswered" });
      expect(unanswered(a)).toBe(true);                              // nobody answered: the checklist asks
      answer(a, k, "No");
      expect(unanswered(a)).toBe(false);
      first = await saveDraft(a);
    } finally { a.close(); }
    expect(first.GarageYN).toBe(false);
    expect(first.GarageSpaces).toBe(0);

    const b = await open(first);
    try {
      expect(b.errors).toEqual([]);
      expect(shown(b, k).answer).toBe("No");
      expect(unanswered(b)).toBe(false);                             // a saved No is an answer, not a blank
      const again = await saveDraft(b);                              // saved again without touching the question
      expect(again.GarageYN).toBe(false);
      expect(again.GarageSpaces).toBe(0);
    } finally { b.close(); }
  });

  it("a question nobody answered sends nothing and is still asked after a reload (the default No is not an answer)", async () => {
    const a = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
    let first: Record<string, any>;
    try {
      await completeForm(a, { type: k.type, garage: "unanswered" });
      first = await saveDraft(a);
    } finally { a.close(); }
    expect(first).not.toHaveProperty("GarageYN");
    expect(first.GarageSpaces == null).toBe(true);

    const b = await open(first);
    try {
      expect(unanswered(b)).toBe(true);
      expect((await saveDraft(b))).not.toHaveProperty("GarageYN");
    } finally { b.close(); }
  });

  it("Yes with 2 spaces comes back as Yes / 2; taking it back to No saves false + 0 and the saved Yes does not return", async () => {
    const a = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
    let saved1: Record<string, any>;
    try {
      await completeForm(a, { type: k.type, garage: "unanswered" });
      answer(a, k, "Yes", "2");
      saved1 = await saveDraft(a);
    } finally { a.close(); }
    expect(saved1.GarageYN).toBe(true);
    expect(saved1.GarageSpaces).toBe(2);

    const b = await open(saved1);
    let saved2: Record<string, any>;
    try {
      expect(shown(b, k)).toEqual({ answer: "Yes", count: "2" });
      expect(unanswered(b)).toBe(false);
      answer(b, k, "No");                                            // the agent changes their mind
      saved2 = await saveDraft(b);
    } finally { b.close(); }
    expect(saved2.GarageYN).toBe(false);
    expect(saved2.GarageSpaces).toBe(0);

    const c = await open(saved2);
    try {
      expect(shown(c, k).answer).toBe("No");
      expect((await saveDraft(c)).GarageYN).toBe(false);             // and a third save does not bring the Yes back
    } finally { c.close(); }
  });

  it("a saved No changed to Yes / 1 comes back as Yes / 1", async () => {
    const a = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
    let saved1: Record<string, any>;
    try {
      await completeForm(a, { type: k.type, garage: "unanswered" });
      answer(a, k, "No");
      saved1 = await saveDraft(a);
    } finally { a.close(); }

    const b = await open(saved1);
    let saved2: Record<string, any>;
    try {
      answer(b, k, "Yes", "1");
      saved2 = await saveDraft(b);
    } finally { b.close(); }
    expect(saved2.GarageYN).toBe(true);
    expect(saved2.GarageSpaces).toBe(1);

    const c = await open(saved2);
    try {
      expect(shown(c, k)).toEqual({ answer: "Yes", count: "1" });
    } finally { c.close(); }
  });
});

describe("the unit's Tax Lot and the building's Tax Lot are saved and restored separately", () => {
  it("a condo: both lots come back in their own boxes; the building's lot never fills the unit's", async () => {
    const a = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
    let saved1: Record<string, any>;
    try {
      await completeForm(a, { type: "Condo" });                      // unit lot 1218, building lot 7502
      saved1 = await saveDraft(a);
    } finally { a.close(); }
    expect(String(saved1.TaxLot)).toBe("1218");
    expect(String(saved1.BuildingTaxLot)).toBe("7502");

    const b = await open(saved1);
    try {
      expect(val(b, "saleUnitTaxLot")).toBe("1218");
      expect(val(b, "saleBldgTaxLot")).toBe("7502");
      expect(missing(b).map((m: any) => m.label)).not.toContain("Tax Lot (unit)");
    } finally { b.close(); }
  });

  it("a condo whose unit lot is cleared: the unit lot saves empty, the building lot stays, and the checklist asks for the unit lot after a reload", async () => {
    const a = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
    let saved1: Record<string, any>;
    try {
      await completeForm(a, { type: "Condo", omit: ["saleUnitTaxLot"] });
      saved1 = await saveDraft(a);
    } finally { a.close(); }
    expect(saved1.TaxLot || "").toBe("");                            // 7502 did not become the unit's lot
    expect(String(saved1.BuildingTaxLot)).toBe("7502");

    const b = await open(saved1);
    try {
      expect(val(b, "saleUnitTaxLot")).toBe("");
      expect(val(b, "saleBldgTaxLot")).toBe("7502");
      expect(missing(b).map((m: any) => m.label)).toContain("Tax Lot (unit)");
      setValue(b, "saleUnitTaxLot", "1301");                         // now the agent types it
      const saved2 = await saveDraft(b);
      expect(String(saved2.TaxLot)).toBe("1301");
      expect(String(saved2.BuildingTaxLot)).toBe("7502");
    } finally { b.close(); }
  });

  it("a co-op (the building's lot is the lot): one box, saved as both TaxLot and BuildingTaxLot, restored into the building's box", async () => {
    const a = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
    let saved1: Record<string, any>;
    try {
      await completeForm(a, { type: "Coop", omit: ["saleUnitTaxLot"], values: { saleCommonInterest: "StockCooperative" } });
      saved1 = await saveDraft(a);
    } finally { a.close(); }
    expect(String(saved1.BuildingTaxLot)).toBe("7502");
    expect(String(saved1.TaxLot)).toBe("7502");                      // a co-op has no lot of its own: Property.TaxLot carries the building's

    const b = await open(saved1);
    try {
      expect(val(b, "saleBldgTaxLot")).toBe("7502");
      expect(missing(b).map((m: any) => m.label)).not.toContain("Tax Lot");
    } finally { b.close(); }
  });
});

describe("the building's garage fills itself from the address; only the unit's garage is a Yes/No (Maya, 2026-11-03)", () => {
  const bldgBox = (f: BootedForm) => (f.d.getElementById("saleBldgParking") as HTMLInputElement).checked;
  const members = (v: unknown) => ([] as string[]).concat((v as string[]) ?? []);

  it("there is no Yes/No for the building: its garage is the auto-filled amenity box", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
    try {
      expect(f.d.getElementById("saleBldgGarageYN")).toBeNull();
      expect(f.d.getElementById("saleBldgParking")).not.toBeNull();
      expect(f.d.querySelectorAll('input[name="saleGarageSpaces"]').length).toBe(2);       // the unit's Yes / No
    } finally { f.close(); }
  });

  it("picking the address fills the building's garage from the building's own parking/garage amenity", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
    try {
      (f.w as any).populateBuildingFromIDX("sale", { name: "Test Tower", parking: true });
      expect(bldgBox(f)).toBe(true);
    } finally { f.close(); }
  });

  it("a unit's own GarageYN / AttachedGarageYN in the record does NOT make the building a garage building", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
    try {
      (f.w as any).populateBuildingFromIDX("sale", { name: "Test Tower", garage_yn: true, attached_garage_yn: true });
      expect(bldgBox(f)).toBe(false);
    } finally { f.close(); }
  });

  it("building garage + unit No, then no building garage + unit Yes: each goes to its own field and neither changes the other, through save and reload", async () => {
    const a = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
    let p1: Record<string, any>;
    try {
      await completeForm(a, { garage: "unanswered" });
      (a.w as any).populateBuildingFromIDX("sale", { name: "Test Tower", parking: true });      // the address was picked: the building has a garage
      pickRadio(a, "saleGarageSpaces", "No");                                                    // this unit has none assigned
      p1 = await saveDraft(a);
    } finally { a.close(); }
    expect(members(p1.ParkingFeatures)).toContain("Garage");
    expect(p1.GarageYN).toBe(false);
    expect(p1.GarageSpaces).toBe(0);

    const b = await open(p1);
    let p2: Record<string, any>;
    try {
      expect(bldgBox(b)).toBe(true);
      expect(checkedValue(b, "saleGarageSpaces")).toBe("No");
      (b.d.getElementById("saleBldgParking") as HTMLInputElement).checked = false;               // the agent corrects the building
      pickRadio(b, "saleGarageSpaces", "Yes");                                                   // and this unit has a space assigned
      setValue(b, "saleGarageSpacesCount", "1");
      p2 = await saveDraft(b);
    } finally { b.close(); }
    expect(members(p2.ParkingFeatures)).not.toContain("Garage");
    expect(p2.GarageYN).toBe(true);
    expect(p2.GarageSpaces).toBe(1);

    const c = await open(p2);
    try {
      expect(bldgBox(c)).toBe(false);
      expect(checkedValue(c, "saleGarageSpaces")).toBe("Yes");
      expect(val(c, "saleGarageSpacesCount")).toBe("1");
    } finally { c.close(); }
  });

  it("one click on the already-checked No is an answer (a click on it fires no change event)", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
    try {
      await completeForm(f, { garage: "unanswered" });
      expect(unanswered(f)).toBe(true);
      (f.d.querySelector('input[name="saleGarageSpaces"][value="No"]') as HTMLInputElement).click();
      expect(unanswered(f)).toBe(false);
    } finally { f.close(); }
  });
});

describe("Tax Lot restore never moves one lot into the other box (compliance review)", () => {
  it("a condo saved with only a unit lot reopens with the unit lot in the unit box and the building box empty", async () => {
    const a = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
    let p: Record<string, any>;
    try {
      await completeForm(a, { type: "Condo", omit: ["saleBldgTaxLot"] });
      p = await saveDraft(a);
    } finally { a.close(); }
    const b = await open(p);
    try {
      expect(val(b, "saleUnitTaxLot")).toBe("1218");
      expect(val(b, "saleBldgTaxLot")).toBe("");
    } finally { b.close(); }
  });

  it("a listing saved before the split (one lot in the old building box, none in the unit box) shows that lot as the building's and still asks for the unit's", async () => {
    const a = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
    let p: Record<string, any>;
    try {
      await completeForm(a, { type: "Condo" });
      p = await saveDraft(a);
    } finally { a.close(); }
    const old: Record<string, any> = { ...p, TaxLot: "7502", saleBldgTaxLot: "7502" };
    delete old.saleUnitTaxLot; delete old.BuildingTaxLot;
    const b = await open(old);
    try {
      expect(val(b, "saleBldgTaxLot")).toBe("7502");
      expect(val(b, "saleUnitTaxLot")).toBe("");
      expect(missing(b).map((m: any) => m.label)).toContain("Tax Lot (unit)");
    } finally { b.close(); }
  });
});
