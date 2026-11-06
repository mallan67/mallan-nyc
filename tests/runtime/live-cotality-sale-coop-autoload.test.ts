/// <reference types="jest" />
/**
 * LIVE: a Mallan co-op listing linked to its Cotality record fills its tax lot, tax block and year built by itself, against the real Cotality API. Nothing about Cotality is stubbed: the token, the
 * Property query and the pull route are the real ones, and the record is a real co-op listed by Mallan's office (7041).
 *
 * It runs only when IDX_CLIENT_ID and IDX_CLIENT_SECRET are in the environment (pull-request CI has none, by design). Without them every test here is SKIPPED, and a skipped live test is not a pass:
 * say "offline" about the run, never "verified". tools/mallan-live-tests.js in mallan-ops runs it with the credentials from the Vercel Development scope, in memory.
 *
 * Maya, 2026-11-05, reading the red "REBNY Required Fields Missing" box of 333 E 46th St #2G, a co-op: "tax lot for coop should be automatic, i should not look for it", and the same for the year built and
 * the tax block; "showing instructions should not lock the file". Cotality carries all three facts on every co-op record it was asked about and carries ShowingInstructions on none.
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

const LIVE = !!((process.env.IDX_CLIENT_ID || process.env.IDX_API_KEY) && (process.env.IDX_CLIENT_SECRET || process.env.IDX_API_SECRET));
const live = LIVE ? describe : describe.skip;
jest.setTimeout(240000);

const BASE = (process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle").replace(/\/+$/, "");
const clean = (v: unknown) => { const t = String(v ?? "").trim(); return t === "" || /^(0+|na|null|none)$/i.test(t) ? "" : t; };       // what Cotality sends for a value nobody entered is no fact

let record: Record<string, any> = {};        // a real co-op record of Mallan's office, read independently of the route under test
let pulled: { status: number; body: any } = { status: 0, body: {} };

beforeAll(async () => {
  if (!LIVE) return;
  const token = await getAccessToken();
  const q = "ListOfficeMlsId eq '7041' and CommonInterest eq 'StockCooperative' and TaxBlock ne null and YearBuilt ne null";
  const r = await fetch(`${BASE}/odata/Property?$filter=${encodeURIComponent(q)}&$orderby=ModificationTimestamp desc&$top=1&$select=ListingId,ListingKey,UnitNumber,StreetNumber,StreetName,StreetSuffix,StandardStatus,TaxBlock,TaxLot,YearBuilt,ShowingInstructions`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (!r.ok) throw new Error(`the live co-op query failed: HTTP ${r.status}`);
  const rows = (await r.json()).value as Array<Record<string, any>>;
  if (rows.length !== 1) throw new Error("expected a live co-op record listed by Mallan's office, found none");
  record = rows[0];

  requireAgentOrBroker.mockReset().mockResolvedValue({ role: "BROKER" });
  findFirst.mockReset().mockResolvedValue({ id: BigInt(9), listing_id: "SL-9999" });
  const res = await GET(new NextRequest(`http://localhost/api/crm/rls-pull?rlsId=${record.ListingId}&listingId=9`, { headers: { "x-forwarded-for": "10.9.9.31" } }));
  pulled = { status: res.status, body: await res.json() };
});

live("LIVE: a Mallan co-op linked to its Cotality record", () => {
  it("the live record carries a tax block and a year built, and no showing instructions", () => {
    expect(clean(record.TaxBlock)).not.toBe("");
    expect(Number(record.YearBuilt)).toBeGreaterThan(1700);
    expect(clean(record.ShowingInstructions)).toBe("");
  });

  it("the real Sale form, fed the real pull, fills the tax lot, the tax block and the year built, and asks the agent for none of them nor for Showing Instructions", async () => {
    expect(pulled.status).toBe(200);
    const SAVED = {
      id: 9, listing_id: "SL-9999", status: "Active", listing_type: "sale", property_type: "Co-op",
      list_price: 1, bedrooms_total: 1, bathrooms_full: 1, bathrooms_half: 0, living_area: 1,
      address: { StreetNumber: String(record.StreetNumber), StreetName: String(record.StreetName), StreetSuffix: String(record.StreetSuffix || ""), UnitNumber: String(record.UnitNumber || ""), City: "New York City", StateOrProvince: "NY", CityRegion: "Manhattan" },
      features: {}, agent_info: {}, media: [],
      raw_data: { salePropertyType: "Coop", saleRlsId: record.ListingId, saleRlsListingKey: String(record.ListingKey) },
    };
    const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 800, search: "?id=9", listing: SAVED, rlsPull: () => ({ status: pulled.status, body: pulled.body }) });
    try {
      await waitUntil(() => (f.w as any)._saleEditLoad === "loaded");
      await waitUntil(() => (f.d.getElementById("saleCotalityFollowText") as HTMLElement).textContent !== "");
      const checked: string[] = [];
      for (const [fact, box] of [["TaxBlock", "saleBldgTaxBlock"], ["YearBuilt", "saleBldgYearBuilt"], ["TaxLot", "saleUnitTaxLot"]] as const) {
        const liveValue = clean(record[fact]);
        if (liveValue === "") continue;                       // Cotality has no lot for this record: nothing to compare
        expect([fact, String(val(f, box))]).toEqual([fact, liveValue]);
        checked.push(fact);
      }
      expect(checked).toEqual(expect.arrayContaining(["TaxBlock", "YearBuilt"]));
      const red = (f.w as any).validateREBNYRequired("sale") as string[];
      expect(red.filter((l) => /^Tax Lot|Tax Block|Year Built|Showing Instructions|Concession/i.test(l))).toEqual([]);
    } finally { f.close(); }
  });
});
