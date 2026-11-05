/// <reference types="jest" />
/**
 * The unit's floors (Duplex, Triplex) and Cotality's `Levels` (Maya, 2026-11-05: a duplex can be in a condo, in a co-op and in a townhouse; "do not guess, map it").
 *
 * What live Cotality holds (Active sales, read 2026-11-05; live-cotality-sale-levels.test.ts re-reads it): every Duplex unit of a condo, co-op or condop says Levels "Two" (319 of 319) and every
 * Triplex unit "TriLevel" (47 of 47). The Sale form's floors radios use other words (SingleLevelUnit, BiLevel, TriLevel, QuadLevel), and the map that fills them from a pull knew only the words
 * Single / Duplex / Triplex / Quadruplex, which Cotality never sends: a duplex's floors never filled from a pull, and only the Single Floor radio carried the Levels tag, so Duplex and Triplex sent
 * nothing while the page's default (Single Floor) was sent as "SingleLevelUnit" for every listing.
 *
 * These tests run the real page: what a pull of each live word does to the boxes, and what the form sends.
 */
import { bootAddForm, sleep, type BootedForm } from "./add-form-harness";
import { LIVE_RLS20123633 } from "./rls-fixtures";
import { val, waitUntil } from "./sale-form-filler";

jest.setTimeout(300000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const WITHHELD = /^(ListingId|ListingKey|ListingKeyNumeric|StandardStatus|Permission|Internet\w+|ListOffice\w*|ListAgent\w*|ActivationDate|PhotosCount|VideosCount|DocumentsCount|VirtualTour\w*|OriginatingSystem\w*|SourceSystem\w*|ModificationTimestamp|CustomProperty)$/;
const BUILDING = { address: "800 2ND Avenue", name: "", borough: "Manhattan", city: "New York City", state: "NY", zip: "10017", neighborhood: "Turtle Bay", common_interest: "Condominium", structure_type: "HighRise", year_built: 1957, stories_total: 18, units_total: 120, tax_block: "01335" };

function answer(levels: unknown) {
  const record: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(LIVE_RLS20123633)) if (!WITHHELD.test(k)) record[k] = v;
  if (levels !== undefined) record.Levels = levels;
  return { rls: { listing_id: "RLS20123633", listing_key: "1194314473", status: "Active", list_office_mls_id: "7041" }, record, skipped: [] };
}
const floors = (f: BootedForm) => (f.d.querySelector('input[name="saleNumFloors"]:checked') as HTMLInputElement | null)?.value ?? "";
const levelsSent = (f: BootedForm) => (f.w as any).collectSaleFormData().Levels;
const choose = (f: BootedForm, value: string) => { const r = f.d.querySelector(`input[name="saleNumFloors"][value="${value}"]`) as HTMLInputElement; r.checked = true; r.dispatchEvent(new f.w.Event("change", { bubbles: true })); };

async function pulledWith(levels: unknown) {
  const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600, buildings: [BUILDING], rlsPull: () => ({ body: answer(levels) }) });
  const box = f.d.getElementById("saleBuildingSearch") as HTMLInputElement;
  box.value = "RLS20123633";
  box.dispatchEvent(new f.w.Event("input", { bubbles: true }));
  await sleep(450);
  (f.d.querySelector("[data-rls-pull]") as HTMLElement).click();
  await waitUntil(() => val(f, "saleRlsId") === "RLS20123633");
  await sleep(500);
  return f;
}

describe("a pull fills the unit's floors from Cotality's own words", () => {
  // the townhouse tab's select has the words a house carries live (One, OneAndOneHalf, Two, ThreeOrMore, MultiSplit): TriLevel is a triplex UNIT's word (47 of 47 live), and no live townhouse says it
  it.each([
    ["Two", "BiLevel", "Duplex", "Two"],
    ["TriLevel", "TriLevel", "Triplex", ""],
    ["One", "SingleLevelUnit", "Single Floor", "One"],
  ])("Levels %j -> the %s radio (%s), and the townhouse select shows %j", async (word, radio, _label, townhouse) => {
    const f = await pulledWith(word);
    try {
      expect(floors(f)).toBe(radio);
      expect(val(f, "saleTHLevels")).toBe(townhouse);
    } finally { f.close(); }
  });

  it("a Multi value (a comma list) fills from the first word the radios know: Two,ThreeOrMore is a duplex", async () => {
    const f = await pulledWith("Two,ThreeOrMore");
    try { expect(floors(f)).toBe("BiLevel"); } finally { f.close(); }
  });

  it.each(["ThreeOrMore", "MultiSplit", "OneAndOneHalf"])("Levels %j has no floors radio: the radio keeps the page's default and the townhouse select shows the word", async (word) => {
    const f = await pulledWith(word);
    try {
      expect(floors(f)).toBe("SingleLevelUnit");
      expect(val(f, "saleTHLevels")).toBe(word);
    } finally { f.close(); }
  });

  it("no Levels at all leaves the page as it is", async () => {
    const f = await pulledWith(undefined);
    try { expect(floors(f)).toBe("SingleLevelUnit"); expect(val(f, "saleTHLevels")).toBe(""); } finally { f.close(); }
  });
});

describe("what the form sends as Levels", () => {
  it("Duplex sends Two and Triplex sends TriLevel (Cotality's words), whatever the type: condo, co-op or townhouse", async () => {
    for (const type of ["Condo", "Coop", "SingleFamilyTownhouse"]) {
      const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 500 });
      try {
        const t = f.d.querySelector(`input[name="salePropertyType"][value="${type}"]`) as HTMLInputElement; t.checked = true; t.dispatchEvent(new f.w.Event("change", { bubbles: true })); (f.w as any).applySalesFieldRules();
        choose(f, "BiLevel"); expect([type, levelsSent(f)]).toEqual([type, ["Two"]]);
        choose(f, "TriLevel"); expect([type, levelsSent(f)]).toEqual([type, ["TriLevel"]]);
      } finally { f.close(); }
    }
  });

  it("Single Floor is the page's default and sends nothing, and the radio's own words (SingleLevelUnit, BiLevel, QuadLevel) are never sent as Levels", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 500 });
    try {
      expect(floors(f)).toBe("SingleLevelUnit");
      expect(levelsSent(f)).toBeUndefined();
      choose(f, "QuadLevel"); expect(levelsSent(f)).toBeUndefined();            // no live word for it: nothing is made up
      for (const w of ["SingleLevelUnit", "BiLevel", "QuadLevel"]) { choose(f, w); expect(JSON.stringify((f.w as any).collectSaleFormData().Levels ?? null)).not.toContain(w); }
    } finally { f.close(); }
  });

  it("a townhouse's own Levels select wins over the unit's floors", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 500 });
    try {
      choose(f, "BiLevel");
      const sel = f.d.getElementById("saleTHLevels") as HTMLSelectElement; sel.value = "ThreeOrMore"; sel.dispatchEvent(new f.w.Event("change", { bubbles: true }));
      expect(levelsSent(f)).toEqual(["ThreeOrMore"]);
    } finally { f.close(); }
  });
});
