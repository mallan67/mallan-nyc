/// <reference types="jest" />
/**
 * LIVE: the Sale form's pull from Cotality, against the real Cotality API. Nothing about Cotality is stubbed here: the token and the Property query are the real ones.
 *
 * It runs only when IDX_CLIENT_ID and IDX_CLIENT_SECRET are in the environment (pull-request CI has none, by design). Without them every test here is SKIPPED, and a skipped live test is
 * not a pass: say "offline" about the run, never "verified". Run it locally with the credentials from the Vercel Development scope (tools/mallan-cotality-env.js in mallan-ops does that in memory).
 *
 * What it proves, for the Mallan listing SL-0010 <-> RLS20123633:
 *   1. PULL    the real GET /api/crm/rls-pull returns the facts the live Property record holds (checked against an independent live query, the oracle)
 *   2. MATCH   the real Sale form, fed that real answer, ends with those facts in its boxes (bedrooms, baths, rooms, area, price ...)
 *   3. FIXTURE the committed copy of the live record (rls-fixtures.ts), which the offline tests rely on, still says what live says for every fact the form follows
 */
import { NextRequest } from "next/server";

const requireAgentOrBroker = jest.fn();
const findFirst = jest.fn();
jest.mock("@/lib/prisma", () => ({ __esModule: true, default: { listing: { findFirst: (...a: unknown[]) => findFirst(...a) } } }));
jest.mock("@/lib/auth", () => ({
  requireAgentOrBroker: (...a: unknown[]) => requireAgentOrBroker(...a),
  isAuthError: (v: { error?: boolean }) => !!v?.error,
}));
// NOT mocked: @/lib/idx/auth (the real token) and fetch (the real Cotality)

import { GET } from "@/app/api/crm/rls-pull/route";
import { getAccessToken } from "@/lib/idx/auth";
import { bootAddForm } from "./add-form-harness";
import { val, waitUntil } from "./sale-form-filler";
import { LIVE_RLS20123633 } from "./rls-fixtures";

/* eslint-disable @typescript-eslint/no-explicit-any */
const LIVE = !!((process.env.IDX_CLIENT_ID || process.env.IDX_API_KEY) && (process.env.IDX_CLIENT_SECRET || process.env.IDX_API_SECRET));
const live = LIVE ? describe : describe.skip;
jest.setTimeout(180000);

const RLS = "RLS20123633";
const BASE = (process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle").replace(/\/+$/, "");

// the box of the Sale form that shows each Cotality fact (the facts the form follows that have one box each)
const BOX: Record<string, string> = {
  BedroomsTotal: "saleBedrooms", BathroomsFull: "saleFullBaths", BathroomsHalf: "saleHalfBaths", RoomsTotal: "saleTotalRooms", LivingArea: "saleUnitSqFt", ListPrice: "salePrice",
  AssociationFee: "saleMaintCC", TaxMonthlyAmount: "saleTaxMonthly", EntryLevel: "saleFloorInBuilding", TaxLot: "saleUnitTaxLot", YearBuilt: "saleBldgYearBuilt", StoriesTotal: "saleBldgTotalFloors",
};
// a box holds text; live holds a number or a string such as "1571.00": the same amount is the same fact
const sameValue = (box: string, live: unknown) => box === String(live) || (box !== "" && String(live).trim() !== "" && Number.isFinite(Number(box)) && Number.isFinite(Number(live)) && Number(box) === Number(live));

let oracle: Record<string, unknown> = {};        // the live Property record, read independently of the route under test
let pulled: { status: number; body: any } = { status: 0, body: {} };
let followed: string[] = [];                     // SALE_COTALITY_FOLLOWS, read from the form itself

// A Property row with its REBNY custom keys (CustomProperty.CustomFields, a JSON text) flattened in: RE tax, for one, arrives there as TaxMonthlyAmount. A Property column wins over a custom key of the same name.
const flat = (row: Record<string, unknown>): Record<string, unknown> => {
  let custom: Record<string, unknown> = {};
  try {
    const cp = row.CustomProperty as Array<{ CustomFields?: unknown }> | undefined;
    const raw = cp && cp[0] && cp[0].CustomFields;
    custom = typeof raw === "string" ? JSON.parse(raw) : ((raw as Record<string, unknown>) || {});
  } catch { custom = {}; }
  const out = { ...custom, ...row };
  delete out.CustomProperty;
  return out;
};

beforeAll(async () => {
  if (!LIVE) return;
  const token = await getAccessToken();
  const r = await fetch(`${BASE}/odata/Property?$filter=${encodeURIComponent(`ListingId eq '${RLS}'`)}&$top=2&$expand=${encodeURIComponent("CustomProperty($select=CustomFields,ListingKey)")}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (!r.ok) throw new Error(`the oracle query failed: HTTP ${r.status}`);
  const rows = (await r.json()).value as Array<Record<string, unknown>>;
  if (rows.length !== 1) throw new Error(`expected one live record for ${RLS}, found ${rows.length}`);
  oracle = flat(rows[0]);

  requireAgentOrBroker.mockReset().mockResolvedValue({ role: "BROKER" });
  findFirst.mockReset().mockResolvedValue({ id: BigInt(7), listing_id: "SL-0010" });      // the listing is linked to this RLS ID and asks about its own link, as the form does
  const res = await GET(new NextRequest(`http://localhost/api/crm/rls-pull?rlsId=${RLS}&listingId=7`, { headers: { "x-forwarded-for": "10.9.9.9" } }));
  pulled = { status: res.status, body: await res.json() };

  const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 300 });
  try { followed = [...(f.w as any).SALE_COTALITY_FOLLOWS]; } finally { f.close(); }
});

live("LIVE: pulling RLS20123633 from Cotality", () => {
  it("the real route answers 200 with the live record's identity and the Mallan listing office", () => {
    expect(pulled.status).toBe(200);
    expect(pulled.body.rls).toEqual({ listing_id: RLS, listing_key: String(oracle.ListingKey), status: String(oracle.StandardStatus), list_office_mls_id: String(oracle.ListOfficeMlsId) });
    expect(pulled.body.rls.list_office_mls_id).toBe("7041");
  });

  it("a real listing of ANOTHER office is refused (403) and none of its facts come back", async () => {
    const token = await getAccessToken();
    const q = `ListOfficeMlsId ne '7041' and StandardStatus eq 'Active'`;
    const r = await fetch(`${BASE}/odata/Property?$filter=${encodeURIComponent(q)}&$select=ListingId,ListOfficeMlsId&$top=1`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    expect(r.ok).toBe(true);
    const other = ((await r.json()).value as Array<Record<string, any>>)[0];
    expect(other?.ListingId).toMatch(/^RLS\d{6,12}$/);                                      // live data gave us a real listing that is not Mallan's
    expect(String(other.ListOfficeMlsId)).not.toBe("7041");
    findFirst.mockReset().mockResolvedValue(null);                                           // it is linked to no Mallan listing
    const res = await GET(new NextRequest(`http://localhost/api/crm/rls-pull?rlsId=${other.ListingId}`, { headers: { "x-forwarded-for": "10.9.9.10" } }));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.record).toBeUndefined();
  });

  it("every fact the form follows that live Cotality holds comes back from the route exactly as live holds it", () => {
    const wrong: string[] = [];
    for (const field of followed) {
      const liveValue = oracle[field];
      if (liveValue === null || liveValue === undefined || liveValue === "") continue;       // the route leaves out what Cotality has no value for
      if (JSON.stringify(pulled.body.record[field]) !== JSON.stringify(liveValue)) wrong.push(`${field}: live ${JSON.stringify(liveValue)}, route ${JSON.stringify(pulled.body.record[field])}`);
    }
    expect(wrong).toEqual([]);
  });

  it("nothing the route returns contradicts the live record", () => {
    const wrong = Object.entries(pulled.body.record as Record<string, unknown>)
      .filter(([k, v]) => k in oracle && JSON.stringify(oracle[k]) !== JSON.stringify(v))
      .map(([k, v]) => `${k}: live ${JSON.stringify(oracle[k])}, route ${JSON.stringify(v)}`);
    expect(wrong).toEqual([]);
  });
});

live("LIVE: the Sale form matches what the real route pulled", () => {
  // SL-0010 as Mallan holds it before the check: the numbers the first pull saved, and Mallan's own classification (the form stores the unit type in raw_data.salePropertyType as well as the property_type column)
  const SAVED = {
    id: 7, listing_id: "SL-0010", status: "Active", listing_type: "sale", property_type: "Commercial",
    list_price: 1200000, bedrooms_total: 0, bathrooms_full: 2, bathrooms_half: 0, living_area: 1482,
    address: { StreetNumber: "800", StreetName: "2ND", StreetSuffix: "Avenue", UnitNumber: "806", City: "New York City", StateOrProvince: "NY", PostalCode: "10017", CityRegion: "Manhattan" },
    features: {}, agent_info: {}, media: [],
    raw_data: { salePropertyType: "Commercial", saleRlsId: RLS, saleRlsListingKey: "1194314473",PublicRemarks: "Our own description of the office.", PrivateRemarks: "Broker note." },
  };

  it("the boxes hold what live Cotality holds for beds, baths, rooms, area and price, and the form saves nothing by itself", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 800, search: "?id=7", listing: SAVED, rlsPull: () => ({ status: pulled.status, body: pulled.body }) });
    try {
      await waitUntil(() => (f.w as any)._saleEditLoad === "loaded");
      await waitUntil(() => (f.d.getElementById("saleCotalityFollowText") as HTMLElement).textContent !== "");
      const wrong: string[] = [];
      for (const [field, box] of Object.entries(BOX)) {
        const liveValue = oracle[field];
        if (liveValue === null || liveValue === undefined || liveValue === "") continue;
        if (!sameValue(String(val(f, box) ?? ""), liveValue)) wrong.push(`${field} (${box}): live ${JSON.stringify(liveValue)}, form ${JSON.stringify(val(f, box))}`);
      }
      // RealPlus and Cotality send the RE tax as a MONTHLY figure; the form keeps the annual one beside it (monthly x 12)
      const monthly = oracle.TaxMonthlyAmount;
      if (monthly !== null && monthly !== undefined && oracle.TaxAnnualAmount == null && !sameValue(String(val(f, "saleRETaxes") ?? ""), Number(monthly) * 12)) {
        wrong.push(`annual RE tax (saleRETaxes): live monthly ${JSON.stringify(monthly)} x 12 = ${Number(monthly) * 12}, form ${JSON.stringify(val(f, "saleRETaxes"))}`);
      }
      expect(wrong).toEqual([]);
      expect(f.saved).toEqual([]);
      expect([...new Set(f.errors)]).toEqual([]);
    } finally { f.close(); }
  });

  it("a commercial unit stays commercial: the pull never turns it into the Residential / Apartment that Cotality's type fields say (SL-0010 is a commercial medical office; RealPlus carries that as CurrentUse)", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 800, search: "?id=7", listing: SAVED, rlsPull: () => ({ status: pulled.status, body: pulled.body }) });
    try {
      await waitUntil(() => (f.w as any)._saleEditLoad === "loaded");
      await waitUntil(() => (f.d.getElementById("saleCotalityFollowText") as HTMLElement).textContent !== "");
      const chosen = (f.d.querySelector('input[name="salePropertyType"]:checked') as HTMLInputElement | null)?.value ?? null;
      const sent = (f.w as any).collectSaleFormData();
      expect({ unitType: chosen, PropertyType: sent.PropertyType, PropertySubType: sent.PropertySubType }).toEqual({ unitType: "Commercial", PropertyType: "Commercial", PropertySubType: "" });
    } finally { f.close(); }
  });

  it("the agent's own words are not overwritten by the pull", async () => {
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 800, search: "?id=7", listing: SAVED, rlsPull: () => ({ status: pulled.status, body: pulled.body }) });
    try {
      await waitUntil(() => (f.w as any)._saleEditLoad === "loaded");
      await waitUntil(() => (f.d.getElementById("saleCotalityFollowText") as HTMLElement).textContent !== "");
      expect(val(f, "saleDescription")).toBe("Our own description of the office.");
    } finally { f.close(); }
  });
});

live("LIVE: the committed copy of the live record still says what live says", () => {
  it("rls-fixtures.ts LIVE_RLS20123633 equals the live record for every fact the form follows (refresh the fixture from a new live read when this fails)", () => {
    const drift: string[] = [];
    for (const field of followed) {
      const was = flat(LIVE_RLS20123633 as Record<string, unknown>)[field] ?? null;
      const now = oracle[field] ?? null;
      if (JSON.stringify(was) !== JSON.stringify(now)) drift.push(`${field}: committed ${JSON.stringify(was)}, live now ${JSON.stringify(now)}`);
    }
    expect(drift).toEqual([]);
  });
});

if (!LIVE) {
  describe("LIVE Cotality tests", () => {
    it.skip("SKIPPED: no IDX_CLIENT_ID / IDX_CLIENT_SECRET in the environment, so nothing here ran against Cotality (offline, not verified)", () => undefined);
  });
}
