/// <reference types="jest" />
/**
 * Pull from Cotality by RLS ID, in the Sale form (Maya, 2026-11-03).
 *
 * RLS ID = the listing's Cotality `ListingId` (RLS20123633). The Cotality `ListingKey` (1194314473) is a DIFFERENT identifier, and the Mallan listing keeps its own SL ID. The RLS ID is
 * never typed into a listing: typing it in the Building Lookup box offers "Pull from Cotality", and the pull records it (with the ListingKey) as the link.
 *
 * The server's answer here has the shape of the live record for RLS20123633 (tests/runtime/rls-fixtures.ts) after the route has withheld what is the provider's own
 * (tests/runtime/rls-pull-route.test.ts proves that half). These tests prove the form half: what fills, what does not, what stays, and what still needs the broker.
 */
import { bootAddForm, storedListing, sleep, type BootedForm } from "./add-form-harness";
import { LIVE_RLS20123633 } from "./rls-fixtures";
import { completeForm, saveDraft, setValue, val, waitUntil, loaded } from "./sale-form-filler";

jest.setTimeout(300000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const WITHHELD = /^(ListingId|ListingKey|ListingKeyNumeric|StandardStatus|Permission|Internet\w+|ListOffice\w*|ListAgent\w*|ActivationDate|PhotosCount|VideosCount|DocumentsCount|VirtualTour\w*|OriginatingSystem\w*|SourceSystem\w*|ModificationTimestamp|CustomProperty)$/;
function serverAnswer() {
  // what the route does: the REBNY custom keys flattened in (a Property column wins), the provider's own data withheld
  const cp = (LIVE_RLS20123633.CustomProperty as Array<{ CustomFields: string }>)[0];
  const merged: Record<string, unknown> = { ...JSON.parse(cp.CustomFields), ...LIVE_RLS20123633 };
  delete merged.CustomProperty;
  const record: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(merged)) if (!WITHHELD.test(k)) record[k] = v;
  return { rls: { listing_id: "RLS20123633", listing_key: "1194314473", status: "Active", list_office_mls_id: "7041" }, record, skipped: [] };
}
// what the building lookup answers for 800 2ND Avenue
const BUILDING = { address: "800 2ND Avenue", name: "", borough: "Manhattan", city: "New York City", state: "NY", zip: "10017", neighborhood: "Turtle Bay", common_interest: "Condominium", structure_type: "HighRise", year_built: 1957, stories_total: 18, units_total: 120, tax_block: "01335" };

const toasts = (f: BootedForm) => [...f.d.querySelectorAll('body > div[style*="99999"]')].map((t) => t.textContent ?? "");
const missingLabels = (f: BootedForm) => (f.w as any).collectSaleMissingRequired().map((m: any) => m.label as string);
async function typeRlsId(f: BootedForm, text: string) {
  const box = f.d.getElementById("saleBuildingSearch") as HTMLInputElement;
  box.value = text;
  box.dispatchEvent(new f.w.Event("input", { bubbles: true }));
  await sleep(450);
}
const pullRow = (f: BootedForm) => f.d.querySelector("[data-rls-pull]") as HTMLElement | null;
async function pulled(opts: Record<string, any> = {}) {
  const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600, buildings: [BUILDING], rlsPull: () => ({ body: serverAnswer() }), ...opts });
  await typeRlsId(f, "RLS20123633");
  pullRow(f)!.click();
  await waitUntil(() => val(f, "saleRlsId") === "RLS20123633");
  await sleep(500);                                   // the building lookup that follows the pull
  return f;
}

describe("typing an RLS ID in the Building Lookup box", () => {
  it("offers Pull from Cotality for that RLS ID and does not search buildings for it", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600, rlsPull: () => ({ body: serverAnswer() }) });
    try {
      await typeRlsId(f, "rls20123633");
      expect(pullRow(f)!.textContent).toMatch(/Pull RLS ID RLS20123633 from Cotality/);
      expect(f.searched).toEqual([]);
      expect(f.rlsPulls).toEqual([]);                 // nothing is asked until the agent chooses to pull
    } finally { f.close(); }
  });

  it("an address still searches buildings exactly as before", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600, buildings: [BUILDING] });
    try {
      await typeRlsId(f, "800 2nd Ave");
      expect(pullRow(f)).toBeNull();
      expect(f.searched).toContain("800 2nd Ave");
    } finally { f.close(); }
  });

  it("a ListingKey is not an RLS ID: nothing is offered for it", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600, rlsPull: () => ({ body: serverAnswer() }) });
    try {
      await typeRlsId(f, "1194314473");
      expect(pullRow(f)).toBeNull();
    } finally { f.close(); }
  });
});

describe("pulling RLS20123633 into a blank listing", () => {
  it("asks for that RLS ID once, fills the listing's facts, and leaves it a Draft", async () => {
    const f = await pulled();
    try {
      expect(f.rlsPulls).toEqual(["RLS20123633"]);
      expect([...new Set(f.errors)]).toEqual([]);
      expect(val(f, "salePrice")).toBe("1200000");
      expect(val(f, "saleUnitNumber")).toBe("806");
      expect(val(f, "saleZipCode")).toBe("10017");
      expect(val(f, "saleBedrooms")).toBe("0");
      expect(val(f, "saleFullBaths")).toBe("2");
      expect(val(f, "saleUnitSqFt")).toBe("1482");
      expect(val(f, "saleLivingArea")).toBe("1482");            // the Condo Details box the Active checklist asks for
      expect(val(f, "saleTotalRooms")).toBe("8");
      expect(val(f, "saleCommonInterest")).toBe("Condominium");
      expect(val(f, "saleBldgYearBuilt")).toBe("1957");
      expect(val(f, "saleBldgTotalFloors")).toBe("18");
      expect(val(f, "saleBldgTaxBlock")).toBe("01335");
      expect(val(f, "saleTHZoning")).toBe("C5-2");
      expect(val(f, "saleStatus")).toBe("Draft");               // the provider's Active is not copied
    } finally { f.close(); }
  });

  it("the unit's tax lot and the building's tax lot land in their own boxes (1025 and 7501)", async () => {
    const f = await pulled();
    try {
      expect(val(f, "saleUnitTaxLot")).toBe("1025");
      expect(val(f, "saleBldgTaxLot")).toBe("7501");
    } finally { f.close(); }
  });

  it("the current use (MedicalDental) is its own setting, not overridden by the Condominium ownership", async () => {
    const f = await pulled();
    try {
      expect((f.d.querySelector('input[name="saleCurrentUse"]:checked') as HTMLInputElement | null)?.value).toBe("MedicalDental");
      expect(val(f, "saleCommonInterest")).toBe("Condominium");
    } finally { f.close(); }
  });

  it("the description arrives as plain text, without the provider's HTML tags", async () => {
    const f = await pulled();
    try {
      const d = val(f, "saleDescription")!;
      expect(d).toContain("800 Second Avenue - Midtown East");
      expect(d.split(/\n/).filter(Boolean).length).toBeGreaterThan(1);              // the paragraphs stay paragraphs
      expect(d).not.toMatch(/<\/?(p|strong)>/);
    } finally { f.close(); }
  });

  it("the garage answer Cotality holds (GarageYN false) counts as answered; the building lookup supplied the building's facts", async () => {
    const f = await pulled();
    try {
      expect(missingLabels(f)).not.toContain("Garage Spaces Assigned (answer Yes or No)");
      expect(missingLabels(f)).not.toContain("Living Area (Sq Ft)");
      expect(missingLabels(f)).not.toContain("Total Units in Building");
      expect(missingLabels(f)).not.toContain("Tax Lot (unit)");
    } finally { f.close(); }
  });

  it("the two identifiers show side by side, kept apart: the SL ID is the listing's own, the RLS ID and ListingKey are Cotality's", async () => {
    const f = await pulled();
    try {
      expect(f.d.getElementById("saleRlsIdDisplay")!.textContent).toBe("RLS20123633");
      expect(val(f, "saleRlsId")).toBe("RLS20123633");
      expect(val(f, "saleRlsListingKey")).toBe("1194314473");
      expect(f.d.getElementById("saleRlsLinkState")!.textContent).toMatch(/Linked: .*RLS ID RLS20123633 \(ListingKey 1194314473\).*keeps its own SL ID/);
      expect(f.d.getElementById("saleListingIdDisplay")!.textContent).toBe("New");        // no SL ID is made up before the first save
    } finally { f.close(); }
  });

  it("half baths, maintenance, flip tax, floor, views, cooling and the financing limit come from their Cotality sections (Property fields and REBNY custom keys)", async () => {
    const f = await pulled();
    try {
      expect(val(f, "saleHalfBaths")).toBe("0");                       // Property.BathroomsHalf
      expect(val(f, "saleMaintCC")).toBe("1588");                      // Property.AssociationFee (Monthly)
      expect(val(f, "saleFlipTaxAmount")).toBe("0.00");                // CustomFields.FlipTax
      expect(val(f, "saleFloorInBuilding")).toBe("8");                 // Property.EntryLevel
      expect([...f.d.querySelectorAll('input[name="saleViewList"]:checked')].map((e: any) => e.value)).toContain("City");   // Property.View
      expect([...f.d.querySelectorAll('input[name="saleCooling"]:checked')].map((e: any) => e.value)).toContain("Other");   // Property.Cooling
      expect(val(f, "saleMaxFinancing") ?? val(f, "saleBldgMaxFinancing")).toBe("90.00");   // CustomFields.MaximumFinancingPercent
    } finally { f.close(); }
  });

  it("the real estate tax: Cotality holds it monthly (CustomFields.TaxMonthlyAmount 1571.00); the annual box is that x 12, the monthly figure stays, and the box says where the number came from", async () => {
    const f = await pulled();
    try {
      expect(val(f, "saleTaxMonthly")).toBe("1571.00");
      expect(val(f, "saleRETaxes")).toBe("18852");
      expect((f.d.getElementById("saleRETaxes") as HTMLInputElement).title).toMatch(/Calculated from the monthly real estate tax of \$1571.00 x 12/);
    } finally { f.close(); }
  });

  it("First Date To Co-Broke is the date the listing went active on the market (Cotality OnMarketDate), and the box says so", async () => {
    const f = await pulled();
    try {
      expect(val(f, "saleFirstCoBroke")).toBe("2026-11-01");
      expect((f.d.getElementById("saleFirstCoBroke") as HTMLInputElement).title).toMatch(/OnMarketDate/);
    } finally { f.close(); }
  });

  it("what Cotality really does not hold for this listing stays for the broker: named, never defaulted", async () => {
    const f = await pulled();
    try {
      // Live (1,982 active Cotality listings sampled 2026-11-03): ExpirationDate, ShowingInstructions, PropertyCondition and every compensation field are never populated for
      // this license (Concessions is a rental field and no longer on the Sale form), there is no co-broke field in any section, and this listing has no Heating. The broker enters them; nothing is defaulted.
      expect(missingLabels(f).sort()).toEqual([
        "Buyer Agent Commission", "CoBroke Agreement Type", "Condition of Apartment", "Exclusive Agent Commission", "Exclusive Expires", "Heating", "Showing Instructions",
      ].sort());
    } finally { f.close(); }
  });
});

describe("the building the pull looks up (live shape for 800 2ND Avenue)", () => {
  // The doorman answer is Cotality's AttendanceType (a Property custom key). Its value "None" is on 38% of live listings and cannot be told from an unfilled default, so it is never
  // taken as "no doorman" (Maya: "no attended won't be right"); a real value still fills the staffing group.
  const withAttendance = (value: string | null) => () => { const a = serverAnswer(); const r = a.record as Record<string, unknown>; if (value === null) delete r.AttendanceType; else r.AttendanceType = value; return { body: a }; };
  const staff = (f: BootedForm) => [...f.d.querySelectorAll('input[name="saleAttendanceType"]:checked')].map((c: any) => c.value);

  it("the listing's AttendanceType None (what this listing carries) does NOT tick 'None': the staffing group is left for the broker", async () => {
    const f = await pulled();
    try { expect(staff(f)).toEqual([]); } finally { f.close(); }
  });

  it("the building lookup's AttendanceType None does not tick it either", async () => {
    const f = await pulled({ rlsPull: withAttendance(null), buildings: [{ ...BUILDING, attendance_type: "None" }] });
    try { expect(staff(f)).toEqual([]); } finally { f.close(); }
  });

  it("800 2nd Avenue as Cotality really holds it: the new listing says None but the building's other listing says doorman + lobby attendant, so both boxes are ticked", async () => {
    const f = await pulled({ buildings: [{ ...BUILDING, attendance_type: "DoormanFullTime,LobbyAttendantFullTime" }] });   // the live record carries AttendanceType = None
    try { expect(staff(f).sort()).toEqual(["DoormanFullTime", "LobbyAttendantFullTime"]); } finally { f.close(); }
  });

  it("a real value fills it: a full-time doorman on the listing, or on the building", async () => {
    const a = await pulled({ rlsPull: withAttendance("DoormanFullTime") });
    try { expect(staff(a)).toEqual(["DoormanFullTime"]); } finally { a.close(); }
    const b = await pulled({ rlsPull: withAttendance(null), buildings: [{ ...BUILDING, attendance_type: "DoormanFullTime" }] });
    try { expect(staff(b)).toEqual(["DoormanFullTime"]); } finally { b.close(); }
  });

  it("the building window gets the building's own facts: type, year, floors, zoning, ownership, elevators, tax block and the BUILDING's tax lot", async () => {
    const f = await pulled({ buildings: [{ ...BUILDING, structure_type: "HighRise", zoning_description: "C5-2", elevators_total: 0, building_tax_lot: "7501" }] });
    try {
      expect(val(f, "saleBldgType")).toBe("HighRise");
      expect(val(f, "saleBldgYearBuilt")).toBe("1957");
      expect(val(f, "saleBldgTotalFloors")).toBe("18");
      expect(val(f, "saleBldgZoning")).toBe("C5-2");
      expect(val(f, "saleBldgOwnership")).toBe("Condominium");
      expect(val(f, "saleBldgTaxBlock")).toBe("01335");
      expect(val(f, "saleBldgTaxLot")).toBe("7501");
    } finally { f.close(); }
  });
});

describe("what the pull will not do", () => {
  it("refuses a listing that already has an address or a price, and asks Cotality nothing (nothing typed is replaced)", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600, rlsPull: () => ({ body: serverAnswer() }) });
    try {
      setValue(f, "saleStreetAddress", "1 Other Street");
      await typeRlsId(f, "RLS20123633");
      pullRow(f)!.click();
      await sleep(200);
      expect(f.rlsPulls).toEqual([]);
      expect(toasts(f).some((t) => /already has an address or a price/.test(t))).toBe(true);
      expect(val(f, "saleStreetAddress")).toBe("1 Other Street");
    } finally { f.close(); }
  });

  it("shows the server's refusal in words and changes nothing (another office's listing)", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600, rlsPull: () => ({ status: 403, body: { error: "RLS20123633 is not a Mallan listing (listing office 9999), so it cannot be pulled into a Mallan listing." } }) });
    try {
      await typeRlsId(f, "RLS20123633");
      pullRow(f)!.click();
      await waitUntil(() => f.rlsPulls.length === 1);
      await waitUntil(() => toasts(f).some((t) => /not a Mallan listing/.test(t)));
      expect(val(f, "saleRlsId")).toBe("");
      expect(val(f, "salePrice")).toBe("");
    } finally { f.close(); }
  });

  it("an RLS ID already linked to a Mallan listing offers to open that one, and fills nothing (no duplicate)", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600, rlsPull: () => ({ body: { existing: { id: "688026", listing_id: "SL-0009" }, rls: { listing_id: "RLS20123633" } } }) });
    try {
      await typeRlsId(f, "RLS20123633");
      pullRow(f)!.click();
      await waitUntil(() => !!f.d.querySelector('#saleBuildingSearchResults a'));
      const a = f.d.querySelector("#saleBuildingSearchResults a") as HTMLAnchorElement;
      expect(a.textContent).toMatch(/already linked to SL-0009/);
      expect(a.getAttribute("href")).toMatch(/\?id=688026$/);
      expect(val(f, "salePrice")).toBe("");
    } finally { f.close(); }
  });

  it("once linked, a second pull is refused", async () => {
    const f = await pulled();
    try {
      await typeRlsId(f, "RLS20123633");
      pullRow(f)!.click();
      await sleep(250);
      expect(f.rlsPulls.length).toBe(1);
    } finally { f.close(); }
  });
});

describe("the link survives save and reload", () => {
  it("saved with the listing (RLS ID and ListingKey as the listing's own record of the link), shown again on reload, never re-pullable", async () => {
    const a = await pulled();
    let payload: Record<string, any>;
    try {
      await completeForm(a, { type: "Condo", garage: "No", omit: ["saleStreetAddress", "saleZipCode", "salePrice", "saleBldgTaxLot"] });   // the pulled values stand; only what the checklist still asks is filled
      payload = await saveDraft(a);
    } finally { a.close(); }
    expect(payload.saleRlsId).toBe("RLS20123633");
    expect(payload.saleRlsListingKey).toBe("1194314473");
    expect(String(payload.TaxLot)).toBe("1025");
    expect(String(payload.BuildingTaxLot)).toBe("7501");
    expect(payload.GarageYN).toBe(false);

    const b = await bootAddForm("SALE-FORM-REDESIGN", { search: "?id=1", listing: storedListing(payload, "sale"), settle: 300 });
    try {
      await loaded(b);
      expect(b.d.getElementById("saleRlsIdDisplay")!.textContent).toBe("RLS20123633");
      expect(val(b, "saleRlsListingKey")).toBe("1194314473");
      expect(b.d.getElementById("saleRlsLinkState")!.textContent).toMatch(/Linked/);
      expect(val(b, "salePrice")).toBe("1200000");
    } finally { b.close(); }
  });

  it("a listing never pulled says RLS link not verified", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600 });
    try {
      expect(f.d.getElementById("saleRlsIdDisplay")!.textContent).toBe("not linked");
      expect(f.d.getElementById("saleRlsLinkState")!.textContent).toMatch(/RLS link not verified/);
    } finally { f.close(); }
  });
});
