/// <reference types="jest" />
/**
 * The Sale form follows Cotality for a listing linked to an RLS ID (Maya, 2026-11-04: "the form should auto updated when the information updates").
 *
 * 800 2nd Avenue #806 (SL-0010) is maintained in RealPlus. Maya changed it there (bedrooms 0 -> 8, full baths 2 -> 3) and the Mallan form kept the saved numbers: the facts were copied once, at the pull.
 * A saved listing that carries an RLS ID now asks Cotality when it opens (and when the agent comes back to the page) and takes the facts that changed, lists each one (old -> new), and saves nothing until
 * Submit. It never replaces a box the agent typed in, never blanks a box Cotality has no value for, never takes a 0 unit count or the text "null", and says so when Cotality cannot be reached.
 */
import { bootAddForm, sleep, type BootedForm } from "./add-form-harness";
import { val, waitUntil } from "./sale-form-filler";

jest.setTimeout(300000);

// SL-0010 as it was saved after the first pull (what RealPlus said then)
const SAVED = {
  id: 7, listing_id: "SL-0010", status: "Active", listing_type: "sale", property_type: "Commercial",
  list_price: 1200000, bedrooms_total: 0, bathrooms_full: 2, bathrooms_half: 0, living_area: 1482,
  address: { StreetNumber: "800", StreetName: "2ND", StreetSuffix: "Avenue", UnitNumber: "806", City: "New York City", StateOrProvince: "NY", PostalCode: "10017", CityRegion: "Manhattan" },
  features: {}, agent_info: {}, media: [],
  raw_data: {
    saleRlsId: "RLS20123633", saleRlsListingKey: "1194314473", RoomsTotal: 8, LivingArea: 1482, StoriesTotal: 18, YearBuilt: 1957, BuildingName: "Tudor Tower",
    PublicRemarks: "Our own description of the office.", PrivateRemarks: "Broker note.",
  },
};
// what live Cotality now says for RLS20123633 (the fields that changed in RealPlus: bedrooms 8, full baths 3)
const COTALITY_NOW = { BedroomsTotal: 8, BathroomsFull: 3, BathroomsHalf: 0, RoomsTotal: 8, LivingArea: 1482, ListPrice: 1200000, StoriesTotal: 18, YearBuilt: 1957, NumberOfUnitsTotal: 0 };
const answer = (record: Record<string, unknown>) => ({ body: { rls: { listing_id: "RLS20123633", listing_key: "1194314473", status: "Active", list_office_mls_id: "7041" }, record, skipped: [] } });

async function opened(record: Record<string, unknown> | null, o: Record<string, any> = {}) {
  const f = await bootAddForm("SALE-FORM-REDESIGN", {
    settle: 800, search: "?id=7", listing: o.listing ?? SAVED,
    rlsPull: record ? () => answer(record) : () => ({ status: 502, body: { error: "Cotality could not be reached right now. Try again in a minute." } }),
    ...o.boot,
  });
  await waitUntil(() => (f.w as any)._saleEditLoad === "loaded");
  return f;
}
const banner = (f: BootedForm) => (f.d.getElementById("saleCotalityFollowText") as HTMLElement).textContent ?? "";
const bannerShown = (f: BootedForm) => !(f.d.getElementById("saleCotalityFollow") as HTMLElement).classList.contains("hidden");
const settled = async (f: BootedForm) => { await waitUntil(() => banner(f) !== ""); await sleep(100); };

describe("opening a saved listing that is linked to an RLS ID", () => {
  it("asks Cotality about its own link, takes what changed in RealPlus (bedrooms 0 -> 8, full baths 2 -> 3), lists each change, and leaves what did not change alone", async () => {
    const f = await opened(COTALITY_NOW);
    try {
      expect(val(f, "saleRlsId")).toBe("RLS20123633");                          // the saved link comes back with the listing
      await settled(f);
      expect(f.rlsPulls).toEqual(["RLS20123633"]);
      expect(f.requests.some((r) => /\/api\/crm\/rls-pull\?rlsId=RLS20123633&listingId=7$/.test(r.url))).toBe(true);
      expect(val(f, "saleBedrooms")).toBe("8");
      expect(val(f, "saleFullBaths")).toBe("3");
      expect(val(f, "saleTotalRooms")).toBe("8");
      expect(val(f, "saleUnitSqFt")).toBe("1482");
      expect(val(f, "salePrice")).toBe("1200000");
      expect(bannerShown(f)).toBe(true);
      expect(banner(f)).toMatch(/Updated from Cotality \(RLS ID RLS20123633/);
      expect(banner(f)).toMatch(/Bedrooms[^;]*0 → 8/);
      expect(banner(f)).toMatch(/Full Bathrooms[^;]*2 → 3/);
      expect(banner(f)).toMatch(/Press Submit to save them/);
      expect(banner(f)).not.toMatch(/Rooms[^;]*→/);                              // total rooms did not change: not listed
      expect([...new Set(f.errors)]).toEqual([]);
      expect(f.saved).toEqual([]);                                               // nothing is saved by the check itself
    } finally { f.close(); }
  });

  it("when nothing changed, it says so", async () => {
    const f = await opened({ ...COTALITY_NOW, BedroomsTotal: 0, BathroomsFull: 2 });
    try {
      await settled(f);
      expect(banner(f)).toMatch(/Checked against Cotality at .*: nothing has changed\./);
      expect(val(f, "saleBedrooms")).toBe("0");
    } finally { f.close(); }
  });

  it("a box the agent typed in before Cotality answered is not replaced; the rest follows, and the banner says what was kept", async () => {
    // Cotality answers 4 s after the page asks, however slow the machine: the agent types in that time, once the page has noted what its boxes held (a race on a fast answer is no test)
    const f = await opened(COTALITY_NOW, { boot: { rlsPullDelay: 4000 } });
    try {
      await waitUntil(() => !!(f.w as any)._saleFollow.loaded && (f.w as any)._saleFollow.busy);
      (f.d.getElementById("saleBedrooms") as HTMLInputElement).value = "2";      // typed while Cotality was answering
      await settled(f);
      expect(val(f, "saleBedrooms")).toBe("2");
      expect(val(f, "saleFullBaths")).toBe("3");
      expect(banner(f)).toMatch(/Not replaced, because you changed them here: Bedrooms \(Cotality has 8\)/);
    } finally { f.close(); }
  });

  it("never takes what is not a fact: no value, the text \"null\", a 0 unit count, the text of the description, the status and the sold price stay as they are", async () => {
    const f = await opened({
      ...COTALITY_NOW, BuildingName: "null", NumberOfUnitsTotal: 0, TaxBlock: "undefined", StructureType: "None",
      PublicRemarks: "RealPlus wording that is not ours.", PrivateRemarks: "x", StandardStatus: "Closed", ClosePrice: 1, ListAgentFullName: "Someone Else", OnMarketDate: "2020-01-01",
    });
    try {
      await settled(f);
      expect(val(f, "saleBldgName")).toBe("Tudor Tower");
      expect(val(f, "saleBldgTotalUnits")).toBe("");
      expect(val(f, "saleBldgTaxBlock")).toBe("");
      expect(val(f, "saleDescription")).toBe("Our own description of the office.");
      expect(val(f, "saleBrokerComments")).toBe("Broker note.");
      expect(val(f, "saleStatus")).toBe("Active");
      expect(val(f, "saleSoldPrice")).toBe("");
      expect(banner(f)).not.toMatch(/Tudor|Description|Status|Sold|Agent/i);
    } finally { f.close(); }
  });

  it("a real unit count does follow, and so does the price", async () => {
    const f = await opened({ ...COTALITY_NOW, NumberOfUnitsTotal: 22, ListPrice: 1150000 });
    try {
      await settled(f);
      expect(val(f, "saleBldgTotalUnits")).toBe("22");
      expect(val(f, "salePrice")).toBe("1150000");
      expect(banner(f)).toMatch(/Price[^;]*1200000 → 1150000/);
    } finally { f.close(); }
  });

  it("says so when Cotality cannot be reached, and keeps the saved facts", async () => {
    const f = await opened(null);
    try {
      await settled(f);
      expect(bannerShown(f)).toBe(true);
      expect(banner(f)).toMatch(/Cotality could not be checked just now/);
      expect(banner(f)).toMatch(/saved with this listing/);
      expect(val(f, "saleBedrooms")).toBe("0");
      expect(val(f, "saleFullBaths")).toBe("2");
    } finally { f.close(); }
  });

  it("does not ask again every time the page gains focus (once a minute at most); Check Cotality now asks at once", async () => {
    const f = await opened(COTALITY_NOW);
    try {
      await settled(f);
      expect(f.rlsPulls).toHaveLength(1);
      f.w.dispatchEvent(new f.w.Event("focus"));
      await sleep(200);
      expect(f.rlsPulls).toHaveLength(1);
      (f.d.getElementById("saleCotalityFollowBtn") as HTMLElement).click();
      await waitUntil(() => f.rlsPulls.length === 2);
      await waitUntil(() => !(f.w as any)._saleFollow.busy);                      // the answer has been taken before the window closes
      expect(f.rlsPulls).toEqual(["RLS20123633", "RLS20123633"]);
    } finally { f.close(); }
  });

  it("a later change in RealPlus is taken when the agent comes back to the page after a minute", async () => {
    let n = 0;
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 800, search: "?id=7", listing: SAVED, rlsPull: () => answer(++n === 1 ? COTALITY_NOW : { ...COTALITY_NOW, BathroomsFull: 4 }) });
    try {
      await waitUntil(() => (f.w as any)._saleEditLoad === "loaded");
      await settled(f);
      expect(val(f, "saleFullBaths")).toBe("3");
      (f.w as any)._saleFollow.at = Date.now() - 61000;                          // a minute has passed
      f.w.dispatchEvent(new f.w.Event("focus"));
      await waitUntil(() => val(f, "saleFullBaths") === "4");
      await waitUntil(() => !(f.w as any)._saleFollow.busy);
      expect(banner(f)).toMatch(/Full Bathrooms[^;]*3 → 4/);
    } finally { f.close(); }
  });
});

describe("a listing that is not linked, or not saved yet", () => {
  it("a saved listing with no RLS link asks Cotality nothing and shows no banner", async () => {
    const unlinked = { ...SAVED, raw_data: { ...SAVED.raw_data, saleRlsId: "", saleRlsListingKey: "" } };
    const f = await opened(COTALITY_NOW, { listing: unlinked });
    try {
      await sleep(600);
      expect(f.rlsPulls).toEqual([]);
      expect(bannerShown(f)).toBe(false);
    } finally { f.close(); }
  });

  it("a new blank listing asks nothing", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 800, rlsPull: () => answer(COTALITY_NOW) });
    try {
      f.w.dispatchEvent(new f.w.Event("focus"));
      await sleep(300);
      expect(f.rlsPulls).toEqual([]);
      expect(bannerShown(f)).toBe(false);
    } finally { f.close(); }
  });
});

describe("the buttons of a saved listing", () => {
  it("still say Submit, not Update: Submit saves the listing (the header's button and the one at the bottom)", async () => {
    const f = await opened(COTALITY_NOW);
    try {
      await settled(f);
      const labels = [...f.d.querySelectorAll('[onclick*="submitSalesListing"]')].map((b) => (b.textContent ?? "").replace(/\s+/g, " ").trim());
      expect(labels.length).toBeGreaterThanOrEqual(2);
      for (const label of labels) {
        expect(label).toMatch(/Submit/);
        expect(label).not.toMatch(/Update/i);
      }
    } finally { f.close(); }
  });
});
