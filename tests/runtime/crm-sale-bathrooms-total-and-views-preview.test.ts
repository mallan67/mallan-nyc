/// <reference types="jest" />
/**
 * Two defects of the Sale form found by pulling the live Mallan listings in a real browser and by a reviewer reading the code (2026-11-06).
 *
 *  1. Total Bathrooms is read-only and required, and it was recomputed only when someone TYPED in Full or Half Bathrooms. A fill from code (the pull from Cotality, a saved listing opening)
 *     fires no oninput, so after the pull of RLS20123633 (3 full baths) the Total stayed empty: a required box the agent cannot type in, which keeps the form from submitting.
 *  2. The Preview read its Views from checkboxes named "saleViews"; the boxes are named "saleViewList", so the Preview's Views row was always "--".
 */
import { bootAddForm, sleep, type BootedForm } from "./add-form-harness";
import { LIVE_RLS20123633 } from "./rls-fixtures";
import { val, waitUntil } from "./sale-form-filler";

jest.setTimeout(240000);

const WITHHELD = /^(ListingId|ListingKey|ListingKeyNumeric|StandardStatus|Permission|Internet\w+|ListOffice\w*|ListAgent\w*|ActivationDate|PhotosCount|VideosCount|DocumentsCount|VirtualTour\w*|Origina\w*|Modification\w*|PhotosChange\w*|Media\w*)$/;
function serverAnswer() {
  const cp = (LIVE_RLS20123633.CustomProperty as Array<{ CustomFields: string }>)[0];
  const merged: Record<string, unknown> = { ...JSON.parse(cp.CustomFields), ...LIVE_RLS20123633 };
  delete merged.CustomProperty;
  const record: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(merged)) if (!WITHHELD.test(k)) record[k] = v;
  return { rls: { listing_id: "RLS20123633", listing_key: "1194314473", status: "Active", list_office_mls_id: "7041" }, record, skipped: [] };
}
const BUILDING = { address: "800 2ND Avenue", name: "", borough: "Manhattan", city: "New York City", state: "NY", zip: "10017", neighborhood: "Turtle Bay", common_interest: "Condominium", structure_type: "HighRise", year_built: 1957, stories_total: 18, units_total: 120, tax_block: "01335" };

describe("Total Bathrooms follows Full + Half however the boxes were filled", () => {
  let f: BootedForm;
  beforeAll(async () => { f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600, buildings: [BUILDING], rlsPull: () => ({ body: serverAnswer() }) }); });
  afterAll(() => f.close());

  it("after a pull from Cotality the Total equals Full + Half (RLS20123633: 3 full, 0 half)", async () => {
    const box = f.d.getElementById("saleBuildingSearch") as HTMLInputElement;
    box.value = "RLS20123633";
    box.dispatchEvent(new f.w.Event("input", { bubbles: true }));
    await sleep(450);
    (f.d.querySelector("[data-rls-pull]") as HTMLElement).click();
    await waitUntil(() => val(f, "saleRlsId") === "RLS20123633");
    await sleep(500);
    expect(val(f, "saleFullBaths")).toBe("3");
    expect(val(f, "saleHalfBaths")).toBe("0");
    expect(val(f, "saleBathroomsTotal")).toBe("3");
  });

  it("a saved listing opening fills the boxes from code and the Total is computed too", () => {
    (f.w as any)._populateSaleFormFromApi({ bathrooms_full: 2, bathrooms_half: 1, address: {}, raw_data: {}, features: {}, agent_info: {}, media: [] });
    expect(val(f, "saleFullBaths")).toBe("2");
    expect(val(f, "saleHalfBaths")).toBe("1");
    expect(val(f, "saleBathroomsTotal")).toBe("3");
  });

  it("typing still updates the Total, as before", () => {
    const full = f.d.getElementById("saleFullBaths") as HTMLInputElement;
    full.value = "4";
    full.dispatchEvent(new f.w.Event("input", { bubbles: true }));
    expect(val(f, "saleBathroomsTotal")).toBe("5");   // 4 full + the 1 half already there
  });
});

describe("Total Bathrooms after the form follows Cotality (SL-0010: RealPlus changed full baths 2 -> 3)", () => {
  it("the follow sets Full Bathrooms from code with a change event, and the Total follows it", async () => {
    const saved = {
      id: 7, listing_id: "SL-0010", status: "Active", listing_type: "sale", property_type: "Commercial",
      list_price: 1200000, bedrooms_total: 0, bathrooms_full: 2, bathrooms_half: 0, living_area: 1482,
      address: { StreetNumber: "800", StreetName: "2ND", StreetSuffix: "Avenue", UnitNumber: "806", City: "New York City", StateOrProvince: "NY", PostalCode: "10017", CityRegion: "Manhattan" },
      features: {}, agent_info: {}, media: [],
      raw_data: { saleRlsId: "RLS20123633", saleRlsListingKey: "1194314473", RoomsTotal: 8, LivingArea: 1482, StoriesTotal: 18, YearBuilt: 1957 },
    };
    const record = { BedroomsTotal: 8, BathroomsFull: 3, BathroomsHalf: 0, RoomsTotal: 8, LivingArea: 1482, ListPrice: 1200000, StoriesTotal: 18, YearBuilt: 1957, NumberOfUnitsTotal: 0 };
    const f = await bootAddForm("SALE-FORM-REDESIGN", {
      settle: 800, search: "?id=7", listing: saved,
      rlsPull: () => ({ body: { rls: { listing_id: "RLS20123633", listing_key: "1194314473", status: "Active", list_office_mls_id: "7041" }, record, skipped: [] } }),
    });
    try {
      await waitUntil(() => (f.w as any)._saleEditLoad === "loaded");
      await waitUntil(() => val(f, "saleFullBaths") === "3");                  // Cotality's answer arrives and is applied
      await sleep(100);
      expect(val(f, "saleBathroomsTotal")).toBe("3");                          // 2 as saved, then 3 + 0 after the follow: not left at 2
    } finally { f.close(); }
  });
});

describe("the Preview lists the Views the agent ticked", () => {
  it("shows the ticked views, and '--' when none is ticked", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
    try {
      const shown = () => (f.d.getElementById("salePreviewSiteDetailViews") as HTMLElement).textContent;
      (f.w as any).updateSalePreview();
      expect(shown()).toBe("--");
      for (const v of ["City", "River"]) (f.d.querySelector(`input[name="saleViewList"][value="${v}"]`) as HTMLInputElement).checked = true;
      (f.w as any).updateSalePreview();
      expect(shown()).toBe("City, River");
    } finally { f.close(); }
  });
});
