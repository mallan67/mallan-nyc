/// <reference types="jest" />
/**
 * A commercial condo is one unit, and its Unit Info does not ask for a building's facts (Maya, 2026-11-04: "it should not be expanding for commercial condo unit number of units").
 *
 * Walking RLS20123633 (800 2nd Avenue #806, a medical office condominium) through the Sale form against live Cotality showed three things:
 *  - Unit Info's "Commercial Specifications" panel carried a whole building's facts (lot size, building size, zoning, FAR, air rights, Number of Units, Number of Retail Units). Those are the building's, and the Building
 *    window already has them; a commercial condo / condop / co-op (or an office / retail condo) does not ask for them. A commercial whole building still does.
 *  - The pull selected the Commercial listing but left Unit Info's Unit Type on Residential, so a medical office offered Alcove Studio / Penthouse.
 *  - Cotality serves ONE unit count for a building (NumberOfUnitsTotal, 0 when nobody counted). The form copied it into Residential Units as well, and a 0 became "Total Units: 0" for an 18-story building.
 */
import { bootAddForm, sleep, type BootedForm } from "./add-form-harness";
import { LIVE_RLS20123633 } from "./rls-fixtures";
import { val, waitUntil } from "./sale-form-filler";

jest.setTimeout(300000);

const WITHHELD = /^(ListingId|ListingKey|ListingKeyNumeric|StandardStatus|Permission|Internet\w+|ListOffice\w*|ListAgent\w*|ActivationDate|PhotosCount|VideosCount|DocumentsCount|VirtualTour\w*|OriginatingSystem\w*|SourceSystem\w*|ModificationTimestamp|CustomProperty)$/;
function serverAnswer(patch: Record<string, unknown> = {}) {
  const cp = (LIVE_RLS20123633.CustomProperty as Array<{ CustomFields: string }>)[0];
  const merged: Record<string, unknown> = { ...JSON.parse(cp.CustomFields), ...LIVE_RLS20123633, ...patch };
  delete merged.CustomProperty;
  const record: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(merged)) if (!WITHHELD.test(k)) record[k] = v;
  return { rls: { listing_id: "RLS20123633", listing_key: "1194314473", status: "Active", list_office_mls_id: "7041" }, record, skipped: [] };
}
// what the live building lookup answers for 800 2ND Avenue: no unit count (units_total null)
const BUILDING = { address: "800 2ND Avenue", name: "", borough: "Manhattan", city: "New York City", state: "NY", zip: "10017", neighborhood: "Turtle Bay", common_interest: "Condominium", structure_type: "HighRise", year_built: 1957, stories_total: 18, units_total: null, tax_block: "01335" };

async function pulled(answer: any = serverAnswer(), building: Record<string, unknown> = BUILDING) {
  const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600, buildings: [building], rlsPull: () => ({ body: answer }) });
  const box = f.d.getElementById("saleBuildingSearch") as HTMLInputElement;
  box.value = "RLS20123633";
  box.dispatchEvent(new f.w.Event("input", { bubbles: true }));
  await sleep(450);
  (f.d.querySelector("[data-rls-pull]") as HTMLElement).click();
  await waitUntil(() => val(f, "saleRlsId") === "RLS20123633");
  await sleep(500);                                   // the building lookup that follows the pull
  return f;
}

const BUILDING_FACT_BOXES = ["saleCommercialLotSize", "saleCommercialBuildingSize", "saleCommercialZoning", "saleCommercialFAR", "saleCommercialAirRights", "saleCommercialUnitsTotal", "saleCommercialRetailUnits"];
const UNIT_BOXES = ["saleCommercialCeilingHeightFt", "saleCommercialFrontageFt", "saleCommercialCapRate", "saleCommercialNOI", "saleCommercialLeaseType", "saleCommercialMinLeaseTerm", "saleCommercialCurrentTenant", "saleCommercialLeaseExpiration"];
const hiddenBox = (f: BootedForm, id: string) => (f.d.getElementById(id) as HTMLElement).closest("[data-bldg-scale]") as HTMLElement | null;
const shown = (f: BootedForm, ids: string[]) => ids.map((id) => { const box = hiddenBox(f, id); return !box || box.style.display !== "none"; });
const click = (f: BootedForm, sel: string) => (f.d.querySelector(sel) as HTMLElement).click();
const note = (f: BootedForm) => f.d.getElementById("saleCommercialUnitNote") as HTMLElement;

describe("800 2nd Avenue, pulled from Cotality: Unit Info is the unit's own", () => {
  it("Unit Type follows the pull (Commercial), and the panel shows the unit's facts: no lot, building size, zoning, FAR, air rights or unit counts", async () => {
    const f = await pulled();
    try {
      expect([...new Set(f.errors)]).toEqual([]);
      expect((f.d.querySelector('input[name="saleUnitType2"]:checked') as HTMLInputElement).value).toBe("Commercial");
      expect((f.d.getElementById("saleCommercialSection2") as HTMLElement).style.display).toBe("block");
      expect((f.d.getElementById("saleResidentialSection2") as HTMLElement).style.display).toBe("none");   // no Alcove Studio / Penthouse for a medical office
      expect(shown(f, BUILDING_FACT_BOXES)).toEqual(BUILDING_FACT_BOXES.map(() => false));
      expect(shown(f, UNIT_BOXES)).toEqual(UNIT_BOXES.map(() => true));
      expect(note(f).classList.contains("hidden")).toBe(false);
      expect(note(f).textContent).toMatch(/one unit in a building/);
      expect(note(f).textContent).toMatch(/Building window/);
    } finally { f.close(); }
  });

  it("a commercial whole building keeps every box, and the note goes away", async () => {
    const f = await pulled();
    try {
      click(f, 'input[name="saleCommercialOwnership"][value="WholeBuilding"]');
      expect(shown(f, BUILDING_FACT_BOXES)).toEqual(BUILDING_FACT_BOXES.map(() => true));
      expect(note(f).classList.contains("hidden")).toBe(true);
      click(f, 'input[name="saleCommercialOwnership"][value="CommercialCondop"]');
      expect(shown(f, BUILDING_FACT_BOXES)).toEqual(BUILDING_FACT_BOXES.map(() => false));
      click(f, 'input[name="saleCommercialOwnership"][value="LandOnly"]');
      expect(shown(f, BUILDING_FACT_BOXES)).toEqual(BUILDING_FACT_BOXES.map(() => true));
    } finally { f.close(); }
  });

  it("a building fact typed while the listing was a whole building is cleared when it becomes a condo: a hidden value would still be saved", async () => {
    const f = await pulled();
    try {
      click(f, 'input[name="saleCommercialOwnership"][value="WholeBuilding"]');
      for (const [id, v] of [["saleCommercialUnitsTotal", "12"], ["saleCommercialRetailUnits", "3"], ["saleCommercialLotSize", "2500"], ["saleCommercialZoning", "C5"]]) {
        const el = f.d.getElementById(id) as HTMLInputElement | HTMLSelectElement; el.value = v;
      }
      (f.d.getElementById("saleCommercialCeilingHeightFt") as HTMLInputElement).value = "11";
      click(f, 'input[name="saleCommercialOwnership"][value="CommercialCondo"]');
      expect(["saleCommercialUnitsTotal", "saleCommercialRetailUnits", "saleCommercialLotSize", "saleCommercialZoning"].map((id) => val(f, id))).toEqual(["", "", "", ""]);
      expect(val(f, "saleCommercialCeilingHeightFt")).toBe("11");                  // the unit's own fact is never touched
    } finally { f.close(); }
  });

  it("an office or retail condo is a unit too; an office or retail building is not", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
    try {
      click(f, 'input[name="saleUnitType2"][value="Commercial"]');
      click(f, 'input[name="salePropertyType"][value="Office"]');
      click(f, 'input[name="saleOfficeRetailOwnership"][value="Condo"]');
      expect(shown(f, BUILDING_FACT_BOXES)).toEqual(BUILDING_FACT_BOXES.map(() => false));
      click(f, 'input[name="saleOfficeRetailOwnership"][value="FeeSimple"]');
      expect(shown(f, BUILDING_FACT_BOXES)).toEqual(BUILDING_FACT_BOXES.map(() => true));
      click(f, 'input[name="salePropertyType"][value="Retail"]');
      click(f, 'input[name="saleOfficeRetailOwnership"][value="Coop"]');
      expect(shown(f, BUILDING_FACT_BOXES)).toEqual(BUILDING_FACT_BOXES.map(() => false));
    } finally { f.close(); }
  });

  it("a Unit Type set without a click (a pull, a saved listing) still shows its own panel", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
    try {
      (f.d.querySelector('input[name="saleUnitType2"][value="Commercial"]') as HTMLInputElement).checked = true;
      (f.w as any).applySalesFieldRules();
      expect((f.d.getElementById("saleCommercialSection2") as HTMLElement).style.display).toBe("block");
      expect((f.d.getElementById("saleResidentialSection2") as HTMLElement).style.display).toBe("none");
      (f.d.querySelector('input[name="saleUnitType2"][value="Residential"]') as HTMLInputElement).checked = true;
      (f.w as any).applySalesFieldRules();
      expect((f.d.getElementById("saleCommercialSection2") as HTMLElement).style.display).toBe("none");
      expect((f.d.getElementById("saleResidentialSection2") as HTMLElement).style.display).toBe("block");
    } finally { f.close(); }
  });
});

describe("the building's unit count: one number, never invented", () => {
  it("live Cotality's NumberOfUnitsTotal 0 (nobody counted) leaves Total Units for the agent, and Residential Units stays empty", async () => {
    const f = await pulled();
    try {
      expect(val(f, "saleBldgTotalFloors")).toBe("18");
      expect(val(f, "saleBldgTotalUnits")).toBe("");
      expect(val(f, "saleBldgResidentialUnits")).toBe("");
    } finally { f.close(); }
  });

  it("a real count fills Total Units only: it is not a residential count (a building with medical offices does not have all its units residential)", async () => {
    const f = await pulled(serverAnswer({ NumberOfUnitsTotal: 22 }), { ...BUILDING, units_total: 22 });
    try {
      expect(val(f, "saleBldgTotalUnits")).toBe("22");
      expect(val(f, "saleBldgResidentialUnits")).toBe("");
      expect(val(f, "saleBldgCommercialUnits")).toBe("");
    } finally { f.close(); }
  });

  it("a count the building lookup returns as 0 is no count either", async () => {
    const f = await pulled(serverAnswer(), { ...BUILDING, units_total: 0 });
    try {
      expect(val(f, "saleBldgTotalUnits")).toBe("");
      expect(val(f, "saleBldgResidentialUnits")).toBe("");
    } finally { f.close(); }
  });
});
