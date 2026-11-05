/// <reference types="jest" />
/**
 * The type of the listing decides which fields are live (Maya, 2026-11-05: "if it is condo all condo fields are available and the others are locked; if the address is coop all coop fields activate and
 * everything else is suppressed"). Before, a section the type does not use was only hidden: its boxes stayed enabled and what was typed in them was still sent (measured on 8 types: 0 locked, every hidden
 * value still sent: a co-op sent the Condo-only percent of common elements and the RE tax; a condo sent the co-op Unit Shares; a townhouse sent shares, flip tax and maintenance).
 *
 * Now a section the type does not use is LOCKED (its boxes disabled) and never sent, by whichever code reads it; what it holds stays on the page, so the type chosen again brings it back.
 * The real page runs: the type is chosen the way an agent (or the address pull) chooses it.
 */
import { bootAddForm, type BootedForm } from "./add-form-harness";

jest.setTimeout(300000);
/* eslint-disable @typescript-eslint/no-explicit-any */

type T = [label: string, radio: string, ownership?: string];
const TYPES: T[] = [
  ["Condo", "Condo"], ["Co-op", "Coop"], ["Condop", "Condop"], ["Single-family townhouse", "SingleFamilyTownhouse"], ["Mixed use", "MixedUse"],
  ["Multi-family", "MultiFamily"], ["Commercial condo", "Commercial", "CommercialCondo"], ["Commercial co-op", "Commercial", "CommercialCoop"],
];

const check = (f: BootedForm, name: string, value: string) => { const b = f.d.querySelector(`input[name="${name}"][value="${value}"]`) as HTMLInputElement | null; if (!b) throw new Error(`no box ${name}=${value}`); b.checked = true; b.dispatchEvent(new f.w.Event("change", { bubbles: true })); };
function chooseType(f: BootedForm, radio: string, own?: string) {
  check(f, "salePropertyType", radio);
  if (own) (f.w as any).toggleSaleCommercialOwnership?.();
  (f.w as any).applySalesFieldRules();
  if (own) { check(f, "saleCommercialOwnership", own); (f.w as any).applySalesFieldRules(); }
}
const rules = (f: BootedForm): Record<string, string[]> => (f.w as any).eval("SALES_FIELD_VISIBILITY_RULES");
const subtypeOf = (f: BootedForm, radio: string, own?: string): string => (f.w as any).resolveListingSubtype(radio, own || null, "Resale");
const sections = (f: BootedForm, sub: string) => {
  const r = rules(f);
  const pick = (hidden: boolean) => Object.keys(r).filter((id) => r[id].includes(sub) !== hidden).map((id) => f.d.getElementById(id) as HTMLElement | null).filter(Boolean) as HTMLElement[];
  return { hidden: pick(true), visible: pick(false) };
};
const typed = (box: HTMLElement) => [...box.querySelectorAll("input[type=text],input[type=number],textarea")] as HTMLInputElement[];
const sent = (f: BootedForm) => JSON.stringify((f.w as any).collectSaleFormData());

describe.each(TYPES)("%s", (label, radio, own) => {
  it("every box in a section this type does not use is locked, and nothing typed there is sent", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 700 });
    try {
      chooseType(f, radio, own);
      const { hidden } = sections(f, subtypeOf(f, radio, own));
      expect(hidden.length).toBeGreaterThan(0);
      const open: string[] = [], leaks: string[] = [];
      let n = 0;
      for (const box of hidden) {
        for (const c of box.querySelectorAll("input,select,textarea") as NodeListOf<HTMLInputElement>) if (!c.disabled) open.push(`${box.id}.${c.id || c.name}`);
        const first = typed(box)[0]; if (!first) continue;
        n++; const marker = first.type === "number" ? String(900000 + n) : `ZQ${n}`;
        first.value = marker;                                                   // set from outside: a person cannot type into a disabled box, but a script (a pull, a restore) can
        if (sent(f).includes(marker)) leaks.push(`${box.id}.${first.id || first.name}`);
        first.value = "";
      }
      expect({ notLocked: open, stillSent: leaks }).toEqual({ notLocked: [], stillSent: [] });
    } finally { f.close(); }
  });

  it("a section this type uses stays open and what is typed there is sent", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 700 });
    try {
      chooseType(f, radio, own);
      const { visible } = sections(f, subtypeOf(f, radio, own));
      let checkedOne = 0;
      for (const box of visible) {
        const first = typed(box)[0]; if (!first) continue;
        expect(first.disabled).toBe(false);
        const marker = first.type === "number" ? "777123" : "LIVE-OK";
        first.value = marker;
        if (sent(f).includes(marker)) checkedOne++;
        first.value = "";
      }
      expect(checkedOne).toBeGreaterThan(0);
    } finally { f.close(); }
  });
});

describe("changing the type", () => {
  it("co-op shares: locked and not sent for a condo, back and sent for a co-op, and the value was kept the whole time", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 700 });
    try {
      chooseType(f, "Coop");
      const shares = f.d.getElementById("saleUnitShares") as HTMLInputElement;
      expect(shares.disabled).toBe(false);
      shares.value = "500";
      expect(sent(f)).toContain('"500"');
      chooseType(f, "Condo");
      expect(shares.disabled).toBe(true);
      expect(shares.value).toBe("500");                                         // kept on the page
      expect(sent(f)).not.toContain('"saleUnitShares":"500"');                  // but not sent for a condo
      chooseType(f, "Coop");
      expect(shares.disabled).toBe(false);
      expect(shares.value).toBe("500");
      expect(sent(f)).toContain('"saleUnitShares":"500"');
      expect(shares.hasAttribute("data-type-locked")).toBe(false);
    } finally { f.close(); }
  });

  it("the RE tax typed for a condo is not sent once the type is a co-op (no annual tax, no monthly tax), and is back for a condo", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 700 });
    try {
      chooseType(f, "Condo");
      const tax = f.d.getElementById("saleRETaxes") as HTMLInputElement;
      tax.value = "18852";
      expect(sent(f)).toContain("18852");
      chooseType(f, "Coop");
      expect(tax.disabled).toBe(true);
      expect(sent(f)).not.toContain("18852");                                   // the derived TaxAnnualAmount too: the readers that look the box up by id see it empty
      chooseType(f, "Condo");
      expect(tax.value).toBe("18852");
      expect(sent(f)).toContain("18852");
    } finally { f.close(); }
  });

  it("a Cotality pull does not fill a locked box: a saved co-op takes the maintenance and leaves the RE tax boxes (a co-op has none) empty", async () => {
    const listing = {
      id: 7, listing_id: "SL-0099", status: "Draft", listing_type: "sale", property_type: "Residential", address: { StreetNumber: "333", StreetName: "East 46th", UnitNumber: "2G" }, features: {}, agent_info: {}, media: [],
      raw_data: { salePropertyType: "Coop", saleRlsId: "RLS20093870", saleRlsListingKey: "1" },
    };
    const f = await bootAddForm("SALE-FORM-REDESIGN", {
      settle: 800, search: "?id=7", listing,
      rlsPull: () => ({ body: { rls: { listing_id: "RLS20093870", listing_key: "1", status: "Active", list_office_mls_id: "7041" }, record: { AssociationFee: 1748.69, TaxMonthlyAmount: "300.00", ListPrice: 765000 }, skipped: [] } }),
    });
    try {
      await new Promise<void>((resolve, reject) => { const t0 = Date.now(); const tick = () => ((f.w as any)._saleEditLoad === "loaded" && (f.d.getElementById("saleCotalityFollowText") as HTMLElement).textContent !== "") ? resolve() : (Date.now() - t0 > 20000 ? reject(new Error("timed out")) : setTimeout(tick, 25)); tick(); });
      expect((f.d.getElementById("saleMaintCC") as HTMLInputElement).value).toBe("1748.69");        // the maintenance follows
      expect((f.d.getElementById("saleRETaxes") as HTMLInputElement).value).toBe("");               // the locked tax boxes do not
      expect((f.d.getElementById("saleTaxMonthly") as HTMLInputElement).value).toBe("");
    } finally { f.close(); }
  });
});

describe("the address dictates the commercial kind (800 2nd Avenue #806: a commercial unit in a condominium building)", () => {
  const building = (common_interest: string) => ({ address: "800 2ND Avenue", name: "", borough: "Manhattan", zip: "10017", neighborhood: "Turtle Bay", subdivisionName: "Turtle Bay", streetNumber: "800", streetName: "2ND", streetSuffix: "Avenue", common_interest, source: "cotality", type: "Condo", building_kind: "Condo" });
  const ownership = (f: BootedForm) => (f.d.querySelector('input[name="saleCommercialOwnership"]:checked') as HTMLInputElement | null)?.value ?? null;

  it.each([["Condominium", "CommercialCondo"], ["StockCooperative", "CommercialCoop"], ["Condop", "CommercialCondop"]])(
    "a Commercial listing with no ownership chosen takes it from the building when the address is pulled: %s -> %s, and the unit's own boxes (maintenance) are open",
    async (commonInterest, expected) => {
      const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 700 });
      try {
        check(f, "salePropertyType", "Commercial"); (f.w as any).applySalesFieldRules();
        expect(ownership(f)).toBeNull();                                                                   // not chosen: the form shows a commercial BUILDING
        (f.w as any).selectBuildingFromIDX("sale", building(commonInterest));
        expect(ownership(f)).toBe(expected);
        expect((f.d.getElementById("saleMaintCC") as HTMLInputElement).disabled).toBe(false);
      } finally { f.close(); }
    },
  );

  it("an ownership the agent chose is never replaced by the building's", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 700 });
    try {
      chooseType(f, "Commercial", "CommercialCoop");
      (f.w as any).selectBuildingFromIDX("sale", building("Condominium"));
      expect(ownership(f)).toBe("CommercialCoop");
    } finally { f.close(); }
  });

  it("a building whose ownership Cotality does not give chooses nothing, and a Condo listing is not touched", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 700 });
    try {
      check(f, "salePropertyType", "Commercial"); (f.w as any).applySalesFieldRules();
      (f.w as any).selectBuildingFromIDX("sale", building(""));
      expect(ownership(f)).toBeNull();
      chooseType(f, "Condo");
      (f.w as any).selectBuildingFromIDX("sale", building("Condominium"));
      expect(ownership(f)).toBeNull();                                                                     // the ownership radios belong to Commercial only
    } finally { f.close(); }
  });

  it("a saved Commercial listing with no ownership opens as a commercial condo once its record names the building's ownership (a restored Ownership Type box)", async () => {
    const listing = { id: 7, listing_id: "SL-0010", status: "Active", listing_type: "sale", property_type: "Commercial", address: {}, features: {}, agent_info: {}, media: [], raw_data: { salePropertyType: "Commercial", saleCommonInterest: "Condominium" } };
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 900, search: "?id=7", listing });
    try {
      await new Promise<void>((resolve, reject) => { const t0 = Date.now(); const tick = () => ((f.w as any)._saleEditLoad === "loaded") ? resolve() : (Date.now() - t0 > 20000 ? reject(new Error("timed out")) : setTimeout(tick, 25)); tick(); });
      expect(ownership(f)).toBe("CommercialCondo");
    } finally { f.close(); }
  });
});

describe("the unit's living area is one value in its three boxes", () => {
  const val = (f: BootedForm, id: string) => (f.d.getElementById(id) as HTMLInputElement).value;
  const typeIn = (f: BootedForm, id: string, v: string) => { const el = f.d.getElementById(id) as HTMLInputElement; el.value = v; el.dispatchEvent(new f.w.Event("input", { bubbles: true })); };

  it("typing in one live box fills the others, and clearing it clears them", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 700 });
    try {
      chooseType(f, "Condo");
      typeIn(f, "saleLivingArea", "1482");
      expect([val(f, "saleInteriorSqFt"), val(f, "saleUnitSqFt"), val(f, "saleLivingArea")]).toEqual(["1482", "1482", "1482"]);
      expect((f.w as any).collectSaleFormData().LivingArea).toBe(1482);
      typeIn(f, "saleInteriorSqFt", "");
      expect([val(f, "saleInteriorSqFt"), val(f, "saleUnitSqFt"), val(f, "saleLivingArea")]).toEqual(["", "", ""]);
      expect((f.w as any).collectSaleFormData().LivingArea).toBeNull();
    } finally { f.close(); }
  });

  it("a stale value in a box the type locks can no longer outrank the one typed in", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 700 });
    try {
      chooseType(f, "Condo");
      (f.d.getElementById("saleUnitSqFt") as HTMLInputElement).value = "999";                              // a locked box holding an old value (set from outside: nothing mirrors it)
      typeIn(f, "saleLivingArea", "1482");
      expect((f.w as any).collectSaleFormData().LivingArea).toBe(1482);
    } finally { f.close(); }
  });

  it("an area stored only in a box this type does not use still opens in the boxes that are live, and is sent", async () => {
    const listing = { id: 7, listing_id: "SL-0011", status: "Draft", listing_type: "sale", property_type: "Residential", address: {}, features: {}, agent_info: {}, media: [], raw_data: { salePropertyType: "Condo", saleUnitSqFt: "1482" } };
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 900, search: "?id=7", listing });
    try {
      await new Promise<void>((resolve, reject) => { const t0 = Date.now(); const tick = () => ((f.w as any)._saleEditLoad === "loaded") ? resolve() : (Date.now() - t0 > 20000 ? reject(new Error("timed out")) : setTimeout(tick, 25)); tick(); });
      expect([val(f, "saleInteriorSqFt"), val(f, "saleLivingArea")]).toEqual(["1482", "1482"]);
      expect((f.w as any).collectSaleFormData().LivingArea).toBe(1482);
    } finally { f.close(); }
  });
});
