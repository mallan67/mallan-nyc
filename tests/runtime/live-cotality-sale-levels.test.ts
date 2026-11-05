/// <reference types="jest" />
/**
 * LIVE: the unit's floors (Duplex, Triplex) and Cotality's `Levels`, against the real Cotality API. Nothing about Cotality is stubbed: the token and the Property queries are the real ones, and the
 * records the Sale form is fed are real live records.
 *
 * It runs only when IDX_CLIENT_ID and IDX_CLIENT_SECRET are in the environment (pull-request CI has none, by design). Without them every test here is SKIPPED, and a skipped live test is not a pass:
 * say "offline" about the run, never "verified". tools/mallan-live-tests.js in mallan-ops runs it with the credentials from the Vercel Development scope, in memory.
 *
 * What it proves (Maya, 2026-11-05: a duplex can be in a condo, in a co-op and in a townhouse; "do not guess, map it"):
 *   1. BASIS  live Duplex units (PropertySubType Duplex in a condo, co-op or condop) say Levels "Two" and live Triplex units "TriLevel" (read 2026-11-05: 319 of 319 and 47 of 47). If Cotality stops saying
 *             so, the form's mapping has lost its basis and this fails.
 *   2. FORM   a real live Duplex unit, a real Triplex unit and a real one-floor apartment, fed to the real form as the pull's answer, end with the Duplex, Triplex and Single Floor radios.
 */
import { getAccessToken } from "@/lib/idx/auth";
import { bootAddForm, sleep, type BootedForm } from "./add-form-harness";
import { val, waitUntil } from "./sale-form-filler";

/* eslint-disable @typescript-eslint/no-explicit-any */
const LIVE = !!((process.env.IDX_CLIENT_ID || process.env.IDX_API_KEY) && (process.env.IDX_CLIENT_SECRET || process.env.IDX_API_SECRET));
const live = LIVE ? describe : describe.skip;
jest.setTimeout(240000);

const BASE = (process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle").replace(/\/+$/, "");
const WITHHELD = /^(ListingId|ListingKey|ListingKeyNumeric|StandardStatus|Permission|Internet\w+|ListOffice\w*|ListAgent\w*|ActivationDate|PhotosCount|VideosCount|DocumentsCount|VirtualTour\w*|OriginatingSystem\w*|SourceSystem\w*|ModificationTimestamp|CustomProperty)$/;
const UNIT = "(CommonInterest eq 'Condominium' or CommonInterest eq 'StockCooperative' or CommonInterest eq 'Condop')";
const ACTIVE_SALE = "StandardStatus eq 'Active' and PropertyType eq 'Residential'";
const BUILDING = { address: "800 2ND Avenue", name: "", borough: "Manhattan", city: "New York City", state: "NY", zip: "10017", neighborhood: "Turtle Bay", common_interest: "Condominium", structure_type: "HighRise", year_built: 1957, stories_total: 18, units_total: 120, tax_block: "01335" };

let token = "";
const odata = async (path: string) => {
  const r = await fetch(`${BASE}/odata/${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (!r.ok) throw new Error(`Cotality answered HTTP ${r.status} for ${path.slice(0, 120)}`);
  return r.json();
};
const count = async (filter: string): Promise<number> => (await odata(`Property?$top=0&$count=true&$filter=${encodeURIComponent(filter)}`))["@odata.count"];
const one = async (filter: string): Promise<Record<string, unknown>> => {
  const rows = (await odata(`Property?$top=1&$filter=${encodeURIComponent(filter)}`)).value as Array<Record<string, unknown>>;
  if (!rows.length) throw new Error(`no live record for: ${filter}`);
  return rows[0];
};

beforeAll(async () => { if (LIVE) token = await getAccessToken(); });

async function pullOf(row: Record<string, unknown>): Promise<BootedForm> {
  const record: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) if (!WITHHELD.test(k) && v !== null) record[k] = v;
  const body = { rls: { listing_id: "RLS20123633", listing_key: "1194314473", status: "Active", list_office_mls_id: "7041" }, record, skipped: [] };
  const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 600, buildings: [BUILDING], rlsPull: () => ({ body }) });
  const box = f.d.getElementById("saleBuildingSearch") as HTMLInputElement;
  box.value = "RLS20123633";
  box.dispatchEvent(new f.w.Event("input", { bubbles: true }));
  await sleep(450);
  (f.d.querySelector("[data-rls-pull]") as HTMLElement).click();
  await waitUntil(() => val(f, "saleRlsId") === "RLS20123633");
  await sleep(500);
  return f;
}
const floors = (f: BootedForm) => (f.d.querySelector('input[name="saleNumFloors"]:checked') as HTMLInputElement | null)?.value ?? "";

live("LIVE: Cotality's Levels and the unit's floors", () => {
  it("BASIS: live Duplex units say Levels Two, and live Triplex units say TriLevel (at least 95%: an agent can leave it out)", async () => {
    const duplexUnits = await count(`${ACTIVE_SALE} and PropertySubType eq 'Duplex' and ${UNIT}`);
    const duplexTwo = await count(`${ACTIVE_SALE} and PropertySubType eq 'Duplex' and ${UNIT} and Levels has 'Two'`);
    const triplexUnits = await count(`${ACTIVE_SALE} and PropertySubType eq 'Triplex' and ${UNIT}`);
    const triplexTri = await count(`${ACTIVE_SALE} and PropertySubType eq 'Triplex' and ${UNIT} and Levels has 'TriLevel'`);
    expect(duplexUnits).toBeGreaterThan(50);
    expect(triplexUnits).toBeGreaterThan(10);
    expect(duplexTwo / duplexUnits).toBeGreaterThanOrEqual(0.95);
    expect(triplexTri / triplexUnits).toBeGreaterThanOrEqual(0.95);
  });

  it.each([
    ["a live Duplex unit (Levels Two)", `${ACTIVE_SALE} and PropertySubType eq 'Duplex' and ${UNIT} and Levels has 'Two'`, "BiLevel"],
    ["a live Triplex unit (Levels TriLevel)", `${ACTIVE_SALE} and PropertySubType eq 'Triplex' and ${UNIT} and Levels has 'TriLevel'`, "TriLevel"],
    ["a live one-floor apartment (Levels One)", `${ACTIVE_SALE} and PropertySubType eq 'Apartment' and ${UNIT} and Levels has 'One'`, "SingleLevelUnit"],
  ])("FORM: %s, fed to the real form as the pull's answer, ends with the %s radio, and the form sends Cotality's word back", async (_label, filter, radio) => {
    const row = await one(filter);
    const f = await pullOf(row);
    try {
      expect(floors(f)).toBe(radio);
      const sent = (f.w as any).collectSaleFormData().Levels;
      if (radio === "BiLevel") expect(sent).toEqual(["Two"]);
      else if (radio === "TriLevel") expect(sent).toEqual(["TriLevel"]);
      else expect(sent === undefined || sent === null || (Array.isArray(sent) && sent.every((w) => w === "One"))).toBe(true);       // Single Floor is the default: nothing is sent for it
    } finally { f.close(); }
  });
});
