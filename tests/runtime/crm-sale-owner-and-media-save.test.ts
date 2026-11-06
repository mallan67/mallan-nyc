/// <reference types="jest" />
/**
 * The Sale form on the two records of one unit, and on a video that never reached the site (Maya, 2026-11-05: 333 E 46th St #2G).
 *
 *   1. The feed's (REBNY / Cotality) copy of a listing is owned by the feed: the CRM refuses every save of it. The form now says so at the top, names the Mallan listing of the same unit, and offers no save
 *      that cannot work (it used to offer Save Draft / Update, which "did nothing").
 *   2. "Save Media" used to upload new FILES only: a YouTube link typed into the Video URL boxes and "saved" there was lost unless the listing itself was saved. It now saves the links, reads them back from the
 *      CRM, and says which listing holds them (or that they are not saved).
 *   3. A co-op's tax lot, tax block and year built, filled from the building lookup, survive a save and a reload without being typed again.
 */
import { bootAddForm, sleep, storedListing, type AddFormOpts, type BootedForm } from "./add-form-harness";
import { waitUntil } from "./sale-form-filler";

jest.setTimeout(180000);

const YOUTUBE = "https://youtu.be/bawq6mNSd30";
const ADDRESS = { StreetNumber: "333", StreetName: "46TH", StreetDirPrefix: "E", StreetSuffix: "Street", UnitNumber: "2G", City: "New York City", StateOrProvince: "NY", PostalCode: "10017", CityRegion: "Manhattan" };
const BASE = { status: "Active", listing_type: "sale", property_type: "Co-op", list_price: "765000", bedrooms_total: 1, bathrooms_full: 1, bathrooms_half: 0, living_area: "860", address: ADDRESS, features: {}, agent_info: {}, media: [], created_at: "2026-05-27T00:00:00.000Z", updated_at: "2026-10-28T15:33:27.000Z" };

const feedCopy = (twin: Record<string, unknown>) => ({ ...BASE, id: "312086", listing_id: "RLS20093870", raw_data: {}, source_owned: true, source_class: "mallan-rls-return-copy", mallan_twin: twin });
const mallanListing = () => ({ ...BASE, id: "4", listing_id: "SL-0004", raw_data: { salePropertyType: "Coop" } as Record<string, unknown>, source_owned: false, source_class: "mallan-local" });

async function open(listing: Record<string, any>, over: Partial<AddFormOpts> = {}) {
  const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 800, search: `?id=${listing.id}`, listing, ...over });
  await waitUntil(() => (f.w as any)._saleEditLoad === "loaded");
  const toasts: string[] = [];
  (f.w as any).showToast = (m: string, t?: string) => { toasts.push(`${t ?? "info"}: ${m}`); };
  return { f, toasts };
}
const saveButtons = (f: BootedForm) => [...f.d.querySelectorAll('button[onclick^="manualSaveDraft"], button[onclick^="submitSalesListing"]')] as HTMLButtonElement[];
const typeInto = (f: BootedForm, id: string, value: string) => { const el = f.d.getElementById(id) as HTMLInputElement; el.value = value; el.dispatchEvent(new f.w.Event("input", { bubbles: true })); };
const val = (f: BootedForm, id: string) => (f.d.getElementById(id) as HTMLInputElement).value;

describe("the feed's copy of a listing is read-only, and says which Mallan listing to open", () => {
  it("shows the banner with the copy's RLS ID and a link to the Mallan listing, and disables every save", async () => {
    const { f } = await open(feedCopy({ listing_id: "SL-0004" }));
    try {
      const banner = f.d.getElementById("saleSourceOwnedBanner") as HTMLElement;
      expect(banner.textContent).toMatch(/Read-only: this is the REBNY \/ Cotality copy of the listing \(RLS20093870\)/);
      const link = banner.querySelector("a") as HTMLAnchorElement;
      expect(link.textContent).toBe("SL-0004");
      expect(link.getAttribute("href")).toMatch(/\?id=SL-0004$/);
      expect(saveButtons(f).length).toBeGreaterThanOrEqual(2);              // the header's Save Draft and Submit (Update)
      for (const b of saveButtons(f)) expect(b.disabled).toBe(true);
    } finally { f.close(); }
  });

  it("nothing is sent whichever way a save is tried: Submit, Save Draft, Save Media, or the automatic save", async () => {
    const { f } = await open(feedCopy({ listing_id: "SL-0004" }));
    try {
      typeInto(f, "saleVideoUrl", YOUTUBE);
      await (f.w as any).submitSalesListing();
      await (f.w as any).manualSaveDraft();
      await (f.w as any).saveSaleMedia();
      expect((f.w as any)._saleAutoSaveReady).toBe(false);                   // the automatic save never starts
      expect(f.saved).toEqual([]);
    } finally { f.close(); }
  });

  it("says so, and does not invent a link, when no Mallan listing of this unit was found, or when two were", async () => {
    for (const [twin, words] of [[{ listing_id: null, reason: "no-local-twin" }, /no Mallan listing of this unit was found/], [{ listing_id: null, reason: "ambiguous-local-twins" }, /More than one Mallan listing matches this unit/]] as const) {
      const { f } = await open(feedCopy(twin));
      try {
        const banner = f.d.getElementById("saleSourceOwnedBanner") as HTMLElement;
        expect(banner.textContent).toMatch(words);
        expect(banner.querySelector("a")).toBeNull();
      } finally { f.close(); }
    }
  });

  it("the Mallan listing is NOT read-only: no banner, the saves are on, and the automatic save is ready", async () => {
    const { f } = await open(mallanListing());
    try {
      expect(f.d.getElementById("saleSourceOwnedBanner")).toBeNull();
      for (const b of saveButtons(f)) expect(b.disabled).toBe(false);
      await sleep(50);
      expect((f.w as any)._saleAutoSaveReady).toBe(true);
    } finally { f.close(); }
  });
});

describe("Save Media saves the video links, reads them back, and says which listing holds them", () => {
  const LINK_KEYS = ["VideosCount", "VirtualTourURLBranded", "VirtualTourURLUnbranded", "VirtualTourURLUnbranded2", "VirtualTourURLUnbranded3", "saleMatterportUrl", "saleVideoTourUrl", "saleVideoUrl", "saleVirtualTourUnbranded", "saleVirtualTourUnbranded2", "saleVirtualTourUnbranded3"];
  // the fake CRM remembers what it is sent, as the real one merges it into the record
  const remember = (listing: Record<string, any>) => ({ onUpdate: (_id: string, payload: Record<string, unknown>) => { Object.assign(listing.raw_data, payload); } });

  it("a link typed into BOTH video boxes (what Maya did) is saved: one small save, only the link boxes, and the toast names SL-0004", async () => {
    const listing = mallanListing();
    const { f, toasts } = await open(listing, remember(listing));
    try {
      typeInto(f, "saleVideoUrl", YOUTUBE);
      typeInto(f, "saleVideoTourUrl", YOUTUBE);
      await (f.w as any).saveSaleMedia();
      expect(f.saved).toHaveLength(1);
      const sent = f.saved[0] as Record<string, unknown>;
      expect(Object.keys(sent).sort()).toEqual(LINK_KEYS);                   // nothing else of the listing rides along: no status, no description
      expect(sent).toMatchObject({ VirtualTourURLUnbranded: "", VirtualTourURLUnbranded2: YOUTUBE, VirtualTourURLUnbranded3: YOUTUBE, VideosCount: 2 });
      const said = toasts.filter((t) => t.startsWith("success:")).join(" | ");
      expect(said).toMatch(/2 video \/ tour links saved to SL-0004 and read back from the CRM/);
      expect(toasts.filter((t) => t.startsWith("error:") || t.startsWith("warning:"))).toEqual([]);
    } finally { f.close(); }
  });

  it("after a reload, each link is back in the box it was typed in", async () => {
    const listing = mallanListing();
    const first = await open(listing, remember(listing));
    try { typeInto(first.f, "saleVideoUrl", YOUTUBE); await (first.f.w as any).saveSaleMedia(); } finally { first.f.close(); }
    const { f } = await open(listing);                                       // the record as the CRM now holds it
    try {
      expect(val(f, "saleVideoUrl")).toBe(YOUTUBE);
      expect(val(f, "saleVideoTourUrl")).toBe("");
    } finally { f.close(); }
  });

  it("a CRM that refuses the save is reported: the links are NOT saved, and no success is claimed", async () => {
    const { f, toasts } = await open(mallanListing(), { updateError: "This listing is source-owned by the RLS/Cotality feed and cannot be modified in the CRM", updateErrorStatus: 403 });
    try {
      typeInto(f, "saleVideoUrl", YOUTUBE);
      await (f.w as any).saveSaleMedia();
      expect(toasts.some((t) => /^error: The video and tour links were NOT saved: This listing is source-owned/.test(t))).toBe(true);
      expect(toasts.some((t) => t.startsWith("success:"))).toBe(false);
    } finally { f.close(); }
  });

  it("a CRM that answers but does not hold the link is reported, and so is one that answers with another listing", async () => {
    const a = await open(mallanListing(), { onUpdate: () => undefined });    // it forgets what it was sent
    try {
      typeInto(a.f, "saleVideoUrl", YOUTUBE);
      await (a.f.w as any).saveSaleMedia();
      expect(a.toasts.some((t) => /^error: The CRM answered but does not hold: VirtualTourURLUnbranded2/.test(t))).toBe(true);
      expect(a.toasts.some((t) => t.startsWith("success:"))).toBe(false);
    } finally { a.f.close(); }
    const listing = mallanListing();
    const b = await open(listing, { onUpdate: (_id, payload) => { Object.assign(listing.raw_data, payload); listing.listing_id = "SL-9999"; } });
    try {
      typeInto(b.f, "saleVideoUrl", YOUTUBE);
      await (b.f.w as any).saveSaleMedia();
      expect(b.toasts.some((t) => /^error: The links were sent, but the CRM answered with a different listing \(SL-9999\)/.test(t))).toBe(true);
    } finally { b.f.close(); }
  });

  it("a listing that has not been saved yet says so and sends nothing (the links go with the listing)", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 500 });
    const toasts: string[] = [];
    (f.w as any).showToast = (m: string, t?: string) => { toasts.push(`${t ?? "info"}: ${m}`); };
    try {
      typeInto(f, "saleVideoUrl", YOUTUBE);
      await (f.w as any).saveSaleMedia();
      expect(toasts.some((t) => /^warning: Save the listing first/.test(t))).toBe(true);
      expect(f.saved).toEqual([]);
    } finally { f.close(); }
  });
});

describe("a co-op's tax lot, tax block and year built survive a save and a reload", () => {
  const COOP = { address: "333 E 46th St", name: "", borough: "Manhattan", zip: "10017", neighborhood: "Turtle Bay", common_interest: "StockCooperative", structure_type: "HighRise", year_built: 1959, stories_total: 20, units_total: 160, tax_block: "01339", tax_lot: "0012" };

  it("filled by the building lookup, sent by the form, restored by the form, and none of the three is asked of the agent", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { buildings: [COOP], settle: 700 });
    let payload: Record<string, any> = {};
    try {
      const box = f.d.getElementById("saleBuildingSearch") as HTMLInputElement;
      box.value = "333 E 46th";
      box.dispatchEvent(new f.w.Event("input", { bubbles: true }));
      await sleep(500);
      (f.d.querySelector("#saleBuildingSearchResults > div") as HTMLElement).click();
      await sleep(200);
      payload = (f.w as any).collectSaleFormData();
    } finally { f.close(); }
    expect([payload.TaxBlock, payload.TaxLot, String(payload.YearBuilt), payload.BuildingTaxLot]).toEqual(["01339", "0012", "1959", "0012"]);

    const { f: g } = await open(storedListing(payload, "sale") as Record<string, any>);
    try {
      expect([val(g, "saleBldgTaxBlock"), val(g, "saleBldgYearBuilt"), val(g, "saleBldgTaxLot")]).toEqual(["01339", "1959", "0012"]);
      const red = (g.w as any).validateREBNYRequired("sale") as string[];
      expect(red.filter((l) => /^Tax Lot|Tax Block|Year Built/.test(l))).toEqual([]);
    } finally { g.close(); }
  });
});
