/**
 * COTALITY / ACRIS SOURCE BOUNDARY (Maya approved scope, 2026-07-23).
 *
 * The public building payload must distinguish:
 *   building + activeUnits          → Cotality/Trestle (REBNY RLS attribution)
 *   recordedTransfers (saleHistory) → NYC ACRIS public records — recorded
 *                                     transfer documents, NOT verified
 *                                     unit-level sales
 *   statistics                      → Mallan-derived from the EFFECTIVE
 *                                     publicly displayed active inventory
 *                                     (suppressed feed twins + ACRIS excluded)
 *
 * Required proofs (each is a test below):
 *   - ACRIS rows explicitly attributed to ACRIS; Cotality layers to Cotality.
 *   - The response never describes ACRIS records as IDX records.
 *   - ACRIS amounts never enter avgPrice / avgSqft / avgPricePerSqft.
 *   - Missing ACRIS unit/beds/baths/sqft remain missing (null / ''), never 0.
 *   - Whole-building or unverified deeds are recorded transfers, not unit sales.
 *   - ACRIS failure leaves Cotality building + activeUnits available.
 *   - No Prisma write and no R2 upload is introduced.
 *   - Distribution gates unchanged; Cotality output stays compatible.
 *
 * All data is fixtures + mocks. NO production traffic, NO Neon.
 */
import { NextRequest } from "next/server";
import * as fs from "fs";
import * as path from "path";

// ── tag-aware memoizing stand-in for the Next data cache ───────────────────
jest.mock("next/cache", () => {
  const store = new Map<string, { value: unknown; tags: string[] }>();
  return {
    unstable_cache:
      (fn: (...a: unknown[]) => Promise<unknown>, keyParts: string[], opts?: { tags?: string[] }) =>
      async (...args: unknown[]) => {
        const k = JSON.stringify([keyParts, args]);
        const hit = store.get(k);
        if (hit) return hit.value;
        const value = await fn(...args);
        store.set(k, { value, tags: opts?.tags ?? [] });
        return value;
      },
    revalidateTag: jest.fn(),
  };
});

// ── scenario control by street number ──────────────────────────────────────
// 100 = normal: effective active inventory + ACRIS transfers (incl. a whole-building
//       $50M deed and an amount-without-sqft record — all ACRIS rows lack units)
// 200 = NO active inventory at all, ACRIS transfers exist
// 300 = active inventory present, NO ACRIS records
// 400 = ACRIS service failure (adapter throws)
// 500 = Neon down (DB layer throws) — Trestle-only assembly
// 600 = Cotality/Trestle down — DB-only assembly
// 800 = MALLAN OVERRIDE ACTIVE: SL exclusive (unit PH1) + its Cotality twin
//       (same unit PH1, different price) both exist — twin must be suppressed
// 900 = MALLAN OVERRIDE ENDED: SL row gone from DB; the still-eligible
//       Cotality twin must be restored WITHOUT duplication
// 400 = THE REAL PRODUCTION PAIR (Maya fixture requirement): Mallan
//       website-only exclusive SL-0007 (400 East 90th St, Unit 4D, $560,000,
//       rls_eligible=false) + its Cotality/RLS twin RLS20099289 + Compass
//       Unit 23B + a DRAFT SL row and an owner-opt-out SL row that the
//       eligibility contract must EXCLUDE (proves the mock enforces `where`)
// 450 = ACRIS service failure (adapter throws)
// 460 = sale/rental at the SAME unit must NOT suppress each other
// 470 = MULTIPLE Cotality candidates, no explicit evidence → suppress NONE
// 480 = multiple candidates + explicit provenance link → ONLY the verified
//       twin is suppressed
// 490 = no unit → no reconciliation
const FAIL_DB = new Set(["500"]);
const FAIL_TRESTLE = new Set(["600"]);
const NO_ACTIVE = new Set(["200"]);
const ACRIS_EMPTY = new Set(["300"]);
const ACRIS_THROW = new Set(["450"]);
const HAS_COTALITY_TWIN = new Set(["800", "900"]);
const OVERRIDE_ENDED = new Set(["900"]);
const ALL_SCENARIOS = ["100", "200", "300", "400", "450", "460", "470", "480", "490", "500", "600", "800", "900"];

// Eligibility field sets. Website-only Mallan publications carry
// rls_eligible=false and do NOT satisfy the feed-only display gates.
const FEED_ELIGIBLE = {
  rls_eligible: true, owner_opt_out: false, idx_display_yn: true,
  internet_entire_listing_display_yn: true, participant_only: false,
};
const WEBSITE_ONLY = {
  rls_eligible: false, owner_opt_out: false, idx_display_yn: false,
  internet_entire_listing_display_yn: false, participant_only: false,
};

function slRow(num: string, over: Record<string, unknown>) {
  return {
    id: `dbid-${num}-${over.listing_id}`,
    status: "Active",
    list_price: 3000000,
    bedrooms_total: 3,
    bathrooms_full: 2,
    bathrooms_half: 0,
    living_area: 1500,
    property_type: "Residential",
    property_sub_type: "Condominium",
    listing_type: "sale",
    address: {
      StreetNumber: num, StreetName: "EAST 90TH STREET", PostalCode: "10128",
      UnitNumber: "PH1", BuildingName: "",
    },
    features: { CommonInterest: "Condominium", YearBuilt: 1999, StoriesTotal: 23 },
    media: [{ MediaURL: "https://img.example/crm.jpg", MediaCategory: "Photo", Order: 0 }],
    raw_data: null,
    ...WEBSITE_ONLY,
    ...over,
  };
}

function dbRows(num: string): Array<Record<string, unknown>> {
  if (NO_ACTIVE.has(num) || OVERRIDE_ENDED.has(num)) return [];
  if (num === "400") {
    return [
      // THE REAL PAIR: website-only Mallan exclusive, local asking $560,000
      slRow(num, {
        listing_id: "SL-0007", list_price: 560000, living_area: 550,
        bedrooms_total: 1, bathrooms_full: 1,
        address: { StreetNumber: "400", StreetName: "EAST 90TH STREET", PostalCode: "10128", UnitNumber: "4D", BuildingName: "" },
      }),
      // its Cotality/RLS twin ALSO exists in the operational copy
      slRow(num, {
        listing_id: "RLS20099289", list_price: 565000, living_area: 550,
        bedrooms_total: 1, bathrooms_full: 1,
        address: { StreetNumber: "400", StreetName: "EAST 90TH STREET", PostalCode: "10128", UnitNumber: "4D", BuildingName: "" },
        ...FEED_ELIGIBLE,
      }),
      // NONPUBLIC CRM rows the contract must EXCLUDE (mock enforces where):
      slRow(num, { listing_id: "SL-DRAFT-1", status: "Draft", address: { StreetNumber: "400", StreetName: "EAST 90TH STREET", PostalCode: "10128", UnitNumber: "6F", BuildingName: "" } }),
      slRow(num, { listing_id: "SL-OPTOUT-1", owner_opt_out: true, address: { StreetNumber: "400", StreetName: "EAST 90TH STREET", PostalCode: "10128", UnitNumber: "7G", BuildingName: "" } }),
    ];
  }
  if (num === "460") {
    return [
      slRow(num, { listing_id: "RL-RENT-8A", listing_type: "rent", list_price: 4500, address: { StreetNumber: "460", StreetName: "EAST 90TH STREET", PostalCode: "10128", UnitNumber: "8A", BuildingName: "" } }),
      slRow(num, { listing_id: "SL-SALE-9B", list_price: 900000, address: { StreetNumber: "460", StreetName: "EAST 90TH STREET", PostalCode: "10128", UnitNumber: "9B", BuildingName: "" } }),
    ];
  }
  if (num === "470") {
    return [slRow(num, { listing_id: "SL-MULTI-5C", list_price: 800000, address: { StreetNumber: "470", StreetName: "EAST 90TH STREET", PostalCode: "10128", UnitNumber: "5C", BuildingName: "" } })];
  }
  if (num === "480") {
    return [slRow(num, {
      listing_id: "SL-EXPL-5C", list_price: 800000,
      address: { StreetNumber: "480", StreetName: "EAST 90TH STREET", PostalCode: "10128", UnitNumber: "5C", BuildingName: "" },
      features: { CommonInterest: "Condominium", ReconciledListingId: "RLS-C2" },
    })];
  }
  if (num === "490") {
    return [slRow(num, { listing_id: "SL-NOUNIT", list_price: 700000, address: { StreetNumber: "490", StreetName: "EAST 90TH STREET", PostalCode: "10128", UnitNumber: "", BuildingName: "" } })];
  }
  return [slRow(num, { listing_id: "SL-3001" })];
}

function trestleRecords(num: string) {
  if (NO_ACTIVE.has(num)) return [];
  const base = {
    BuildingName: "Boundary Tower",
    YearBuilt: 1999,
    StoriesTotal: 23,
    CommonInterest: "Condominium",
    PropertyType: "Residential",
    StandardStatus: "Active",
    MlsStatus: "Active",
  };
  if (num === "400") {
    return [
      { ...base, ListingId: "RLS20099289", ListingKey: "KEY-400-TWIN", ListPrice: 565000, BedroomsTotal: 1, BathroomsFull: 1, BathroomsHalf: 0, LivingArea: 550, UnitNumber: "4D", PropertySubType: "Condominium", ListOfficeName: "Corcoran Group", Media: [] },
      { ...base, ListingId: "RLS-COMPASS-23B", ListingKey: "KEY-400-23B", ListPrice: 1200000, BedroomsTotal: 2, BathroomsFull: 2, BathroomsHalf: 0, LivingArea: 900, UnitNumber: "23B", PropertySubType: "Condominium", ListOfficeName: "Compass", Media: [] },
    ];
  }
  if (num === "460") {
    return [
      { ...base, ListingId: "TRE-460-SALE-8A", ListingKey: "KEY-460-S8A", ListPrice: 2000000, BedroomsTotal: 2, BathroomsFull: 2, BathroomsHalf: 0, LivingArea: 1000, UnitNumber: "8A", PropertySubType: "Condominium", ListOfficeName: "Other Brokerage LLC", Media: [] },
      { ...base, PropertyType: "Residential Lease", ListingId: "TRE-460-RENT-9B", ListingKey: "KEY-460-R9B", ListPrice: 5000, BedroomsTotal: 1, BathroomsFull: 1, BathroomsHalf: 0, LivingArea: 700, UnitNumber: "9B", PropertySubType: "Apartment", ListOfficeName: "Rental Group Inc", Media: [] },
    ];
  }
  if (num === "470" || num === "480") {
    return [
      { ...base, ListingId: "RLS-C1", ListingKey: `KEY-${num}-C1`, ListPrice: 810000, BedroomsTotal: 1, BathroomsFull: 1, BathroomsHalf: 0, LivingArea: 600, UnitNumber: "5C", PropertySubType: "Condominium", ListOfficeName: "Other Brokerage LLC", Media: [] },
      { ...base, ListingId: "RLS-C2", ListingKey: `KEY-${num}-C2`, ListPrice: 820000, BedroomsTotal: 1, BathroomsFull: 1, BathroomsHalf: 0, LivingArea: 600, UnitNumber: "5C", PropertySubType: "Condominium", ListOfficeName: "Another Brokerage LLC", Media: [] },
    ];
  }
  if (num === "490") {
    return [
      { ...base, ListingId: "TRE-490-NOUNIT", ListingKey: "KEY-490-NU", ListPrice: 750000, BedroomsTotal: 1, BathroomsFull: 1, BathroomsHalf: 0, LivingArea: 600, UnitNumber: "", PropertySubType: "Condominium", ListOfficeName: "Other Brokerage LLC", Media: [] },
    ];
  }
  const twin = HAS_COTALITY_TWIN.has(num)
    ? [{
        // Cotality/RLS representation of the SAME physical unit as the
        // SL-3001 Mallan exclusive (unit PH1) — the reconciled twin.
        ...base,
        ListingId: `RLS-TWIN-${num}`, ListingKey: `KEY-${num}-TW1`,
        ListPrice: 2750000, BedroomsTotal: 3, BathroomsFull: 2, BathroomsHalf: 0,
        LivingArea: 1500, UnitNumber: "PH1", PropertySubType: "Condominium",
        ListOfficeName: "Mallan Real Estate Inc.",
        Media: [],
      }]
    : [];
  return [
    ...twin,
    {
      ...base,
      ListingId: `TRE-${num}-A1`, ListingKey: `KEY-${num}-A1`,
      ListPrice: 2000000, BedroomsTotal: 2, BathroomsFull: 2, BathroomsHalf: 0,
      LivingArea: 1000, UnitNumber: "10A", PropertySubType: "Condominium",
      ListOfficeName: "Other Brokerage LLC",
      Media: [{ MediaURL: "https://img.cotality.example/a1.jpg", MediaCategory: "Photo", Order: 0 }],
    },
    {
      // priced but NO sqft — must join avgPrice population but NOT the
      // consistent price-per-sqft population
      ...base,
      ListingId: `TRE-${num}-A2`, ListingKey: `KEY-${num}-A2`,
      ListPrice: 1000000, BedroomsTotal: 1, BathroomsFull: 1, BathroomsHalf: 0,
      LivingArea: 0, UnitNumber: "2B", PropertySubType: "Condominium",
      ListOfficeName: "Other Brokerage LLC",
      Media: [],
    },
    {
      // DISPLAY-GATED record — must stay out of activeUnits and count as gated
      ...base,
      ListingId: `TRE-${num}-G1`, ListingKey: `KEY-${num}-G1`,
      ListPrice: 9999999, BedroomsTotal: 4, BathroomsFull: 4, BathroomsHalf: 0,
      LivingArea: 3000, UnitNumber: "PH9", PropertySubType: "Condominium",
      ListOfficeName: "Other Brokerage LLC",
      InternetEntireListingDisplayYN: false,
      Media: [],
    },
  ];
}

// ── prisma mock: findMany only; ANY other model/method access throws ───────
// The mock ENFORCES the supplied `where` (Maya requirement): it evaluates
// every condition against the fixture rows instead of returning rows
// regardless of the query — a row is admitted ONLY if the query's actual
// eligibility contract admits it (no false positives).
function rowMatchesWhere(row: Record<string, any>, where: Record<string, any> | undefined): boolean {
  if (!where) return true;
  for (const [k, v] of Object.entries(where)) {
    if (k === "AND") { if (!(v as any[]).every((c) => rowMatchesWhere(row, c))) return false; continue; }
    if (k === "OR") { if (!(v as any[]).some((c) => rowMatchesWhere(row, c))) return false; continue; }
    if (k === "address") {
      const addr = row.address as Record<string, unknown> | null;
      const cond = v as Record<string, any>;
      if ("not" in cond) { if (addr == null) return false; continue; } // { not: Prisma.DbNull }
      if (Array.isArray(cond.path) && cond.string_starts_with !== undefined) {
        if (!String(addr?.[cond.path[0]] ?? "").startsWith(cond.string_starts_with)) return false;
        continue;
      }
      if (Array.isArray(cond.path) && cond.equals !== undefined) {
        if (String(addr?.[cond.path[0]] ?? "") !== cond.equals) return false;
        continue;
      }
      return false; // unknown address operator — fail closed
    }
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      const cond = v as Record<string, any>;
      if ("in" in cond) { if (!cond.in.includes(row[k])) return false; continue; }
      if ("gt" in cond) { if (!(Number(row[k]) > cond.gt)) return false; continue; }
      return false; // unknown operator — fail closed
    }
    if (row[k] !== v) return false;
  }
  return true;
}

const listingFindMany = jest.fn(async (q: Record<string, any>) => {
  const conds: Array<Record<string, any>> = q?.where?.AND ?? [];
  const shardCond = conds.find((c) => c?.address?.string_starts_with);
  const numCond = conds.find((c) => c?.address?.path?.[0] === "StreetNumber" && c?.address?.equals);
  const shard: string | null = shardCond ? shardCond.address.string_starts_with : null;
  const num: string = shard ? shard + "00" : (numCond?.address?.equals ?? "");
  if (FAIL_DB.has(num)) throw new Error("simulated Neon outage");
  // Shard query: candidate rows = every scenario in this shard; the query's
  // OWN where decides admission (enforced, never bypassed).
  const candidates = shard
    ? ALL_SCENARIOS.filter((n) => n.startsWith(shard)).flatMap((n) => dbRows(n))
    : dbRows(num);
  const matched = candidates.filter((r) => rowMatchesWhere(r, q?.where));
  matched.sort((a, b) => (String(a.listing_id) < String(b.listing_id) ? -1 : 1));
  let start = 0;
  if (q?.cursor?.listing_id) {
    start = matched.findIndex((r) => r.listing_id === q.cursor.listing_id) + (q.skip ?? 0);
  }
  return matched.slice(start, start + (q?.take ?? matched.length));
});
const prismaWriteAttempts: string[] = [];
jest.mock("@/lib/prisma", () => {
  const listing = new Proxy(
    { findMany: (...a: unknown[]) => listingFindMany(...(a as [Record<string, unknown>])) },
    {
      get(target, prop: string) {
        if (prop in target) return (target as Record<string, unknown>)[prop];
        prismaWriteAttempts.push(`listing.${String(prop)}`);
        throw new Error(`prisma.listing.${String(prop)} must not be used by the public building payload`);
      },
    },
  );
  const root = new Proxy(
    { listing },
    {
      get(target, prop: string) {
        if (prop in target || prop === "then" || typeof prop === "symbol") return (target as Record<string, unknown>)[prop as string];
        prismaWriteAttempts.push(String(prop));
        throw new Error(`prisma.${String(prop)} must not be used by the public building payload`);
      },
    },
  );
  return { __esModule: true, default: root };
});

jest.mock("@/lib/idx/auth", () => ({ getAccessToken: jest.fn(async () => "test-token") }));

// ── ACRIS adapter mock: scenario-controlled, returns the NEW record shape ──
const RETRIEVED_AT = "2026-07-23T20:00:00.000Z";
function acrisRecords() {
  return [
    {
      id: "acris-2026070100001001",
      documentId: "2026070100001001",
      bbl: "1-01555-0001",
      closePrice: 2100000,
      amount: 2100000,
      closeDate: "2024-05-01",
      recordedDate: "2024-05-01",
      unit: "",
      source: "acris" as const,
      retrievedAt: RETRIEVED_AT,
    },
    {
      // whole-building-scale deed — must appear as a recorded transfer and
      // must NEVER touch any statistic
      id: "acris-2022091400002002",
      documentId: "2022091400002002",
      bbl: "1-01555-0001",
      closePrice: 50000000,
      amount: 50000000,
      closeDate: "2022-09-14",
      recordedDate: "2022-09-14",
      unit: "",
      source: "acris" as const,
      retrievedAt: RETRIEVED_AT,
    },
  ];
}
const lookupBBLMock = jest.fn(async (streetNumber: string) => {
  if (ACRIS_THROW.has(streetNumber)) throw new Error("simulated ACRIS resolver outage");
  return "1-01555-0001";
});
const fetchAcrisSalesMock = jest.fn(async () => acrisRecords());
jest.mock("@/lib/buildings/acris-building-sales", () => ({
  boroughFromPostalCode: jest.fn(() => "MANHATTAN"),
  lookupBBL: (...a: unknown[]) => lookupBBLMock(...(a as [string])),
  fetchAcrisSales: (...a: unknown[]) => fetchAcrisSalesMock(...(a as [])),
  isDuplicate: jest.fn(() => false),
}));

beforeAll(() => {
  global.fetch = jest.fn(async (url: unknown) => {
    const u = String(url);
    const m = /StreetNumber\s+eq\s+'(\d+)'/.exec(decodeURIComponent(u.replace(/\+/g, " ")));
    const num = m?.[1] ?? "";
    if (FAIL_TRESTLE.has(num)) throw new Error("simulated Cotality outage");
    return { ok: true, json: async () => ({ value: trestleRecords(num) }) } as unknown as Response;
  }) as unknown as typeof fetch;
});

beforeEach(() => {
  fetchAcrisSalesMock.mockImplementation(async () => acrisRecords());
});

const { getBuildingDataCached } = require("@/lib/buildings/public-building-data");

async function payload(num: string) {
  const scenario = ACRIS_EMPTY.has(num) ? "empty" : "records";
  if (scenario === "empty") fetchAcrisSalesMock.mockImplementation(async () => []);
  const body = await getBuildingDataCached({
    streetNumber: num, streetName: "East 90th Street", postalCode: "10128", buildingName: null,
  });
  return JSON.parse(JSON.stringify(body));
}

// ═══════════════════════════════════════════════════════════════════════════
describe("source layers + attribution", () => {
  it("recordedTransfers is an explicit ACRIS-attributed layer; every row carries source/provenance", async () => {
    const p = await payload("100");
    expect(Array.isArray(p.recordedTransfers)).toBe(true);
    expect(p.recordedTransfers.length).toBe(2);
    for (const t of p.recordedTransfers) {
      expect(t.source).toBe("acris");
      expect(t.documentId).toBeTruthy();
      expect(t.bbl).toBe("1-01555-0001");
      expect(t.retrievedAt).toBe(RETRIEVED_AT);
      expect(typeof t.amount).toBe("number");
    }
  });

  it("sourceAttribution separates Cotality/REBNY, NYC ACRIS, and Mallan-derived statistics", async () => {
    const p = await payload("100");
    expect(p.sourceAttribution.building.source).toBe("effective-public-inventory");
    expect(p.sourceAttribution.activeUnits.source).toBe("effective-public-inventory");
    expect(p.sourceAttribution.building.attribution).toContain("REBNY");
    expect(p.sourceAttribution.activeUnits.attribution).toContain("Mallan Real Estate Inc.");
    expect(p.sourceAttribution.activeUnits.attribution).toContain("suppressed duplicate feed representations are excluded");
    expect(p.sourceAttribution.recordedTransfers.source).toBe("nyc-acris");
    expect(p.sourceAttribution.recordedTransfers.attribution).toContain("ACRIS");
    // ACRIS layer attribution must NOT carry the REBNY attribution
    expect(p.sourceAttribution.recordedTransfers.attribution).not.toContain("REBNY");
    // and must state these are recorded transfers, not verified unit sales
    expect(p.sourceAttribution.recordedTransfers.attribution.toLowerCase()).toContain("recorded transfer");
    expect(p.sourceAttribution.recordedTransfers.attribution.toLowerCase()).toContain("not verified");
    expect(p.sourceAttribution.statistics.source).toBe("mallan-derived");
    expect(p.sourceAttribution.statistics.attribution).toContain("effective publicly displayed active inventory");
    expect(p.sourceAttribution.statistics.attribution).toContain("Suppressed duplicate feed representations and NYC ACRIS recorded transfers are excluded");
  });

  it("the payload never describes ACRIS content as IDX: blanket source 'idx' is gone", async () => {
    const p = await payload("100");
    expect(p._compliance.source).not.toBe("idx");
    expect(p._compliance.source).toContain("acris");
    expect(p._compliance.source).toContain("cotality");
    // the combined attribution names both sources truthfully
    expect(p._compliance.attribution).toContain("REBNY Listing Service");
    expect(p._compliance.attribution).toContain("ACRIS");
    expect(p._compliance.attribution.toLowerCase()).toContain("not verified unit");
  });

  it("activeUnits keep the compatible key contract (+ documented additive provenance)", async () => {
    const p = await payload("100");
    expect(p.activeUnits.length).toBeGreaterThan(0);
    const keys = Object.keys(p.activeUnits[0]).sort();
    // ADDITIVE contract change (documented): per-row provenance field
    // `source` (+ optional `publication` on overridden Mallan exclusives).
    expect(keys).toEqual([
      "baths", "bathsHalf", "beds", "id", "listPrice", "listingType", "mlsId",
      "office", "photoUrl", "propertyType", "source", "sqft", "status", "unit",
    ].sort());
  });
});

describe("missing stays missing — no zero-fill, no inference", () => {
  it("ACRIS rows carry null beds/baths/sqft and blank unit — never 0, never inferred", async () => {
    const p = await payload("100");
    for (const rows of [p.recordedTransfers, p.saleHistory]) {
      for (const t of rows) {
        expect(t.beds).toBeNull();
        expect(t.baths).toBeNull();
        expect(t.sqft).toBeNull();
        expect(t.unit).toBe("");
      }
    }
    // compat alias keeps the legacy '' propertyType; the canonical layer
    // omits the field entirely (no inferred property type on transfers)
    for (const s of p.saleHistory) expect(s.propertyType).toBe("");
    for (const t of p.recordedTransfers) expect(t.propertyType).toBeUndefined();
  });

  it("whole-building-scale deeds are recorded transfers, labeled as such — not unit sales", async () => {
    const p = await payload("100");
    const big = p.recordedTransfers.find((t: { amount: number }) => t.amount === 50000000);
    expect(big).toBeTruthy();
    expect(big.label).toBe("recorded-transfer");
    for (const s of p.saleHistory) expect(s.label).toBe("recorded-transfer");
  });
});

describe("statistics — EFFECTIVE displayed active inventory only (never ACRIS, never suppressed twins)", () => {
  it("avgPrice is the mean of active asking prices; ACRIS amounts (incl. $50M deed) excluded", async () => {
    const p = await payload("100");
    // active priced: 3,000,000 (CRM) + 2,000,000 + 1,000,000 → mean 2,000,000
    expect(p.stats.avgPrice).toBe(2000000);
    expect(p.stats.active.avgListPrice).toBe(2000000);
  });

  it("avgPricePerSqft uses ONE consistent population (rows with BOTH price and sqft)", async () => {
    const p = await payload("100");
    // both-population: (3,000,000 / 1,500) and (2,000,000 / 1,000) →
    // avg price 2,500,000 / avg sqft 1,250 = 2,000 exactly.
    // The priced-but-no-sqft unit and ALL ACRIS rows are excluded from BOTH
    // numerator and denominator.
    expect(p.stats.avgPricePerSqft).toBe(2000);
    expect(p.stats.avgSqft).toBe(1250);
  });

  it("no amount-based transfer statistics ship; transfers contribute a count only", async () => {
    const p = await payload("100");
    expect(p.stats.recordedTransfers).toEqual({ count: 2 });
    expect(p.stats.totalSales).toBe(2); // compat: same number as before
    const statsJson = JSON.stringify(p.stats);
    expect(statsJson).not.toContain("50000000");
    expect(statsJson).not.toContain("2100000");
  });

  it("empty populations produce null, never zero", async () => {
    const p = await payload("200"); // no active inventory at all
    expect(p.stats.avgPrice).toBeNull();
    expect(p.stats.avgSqft).toBeNull();
    expect(p.stats.avgPricePerSqft).toBeNull();
    expect(p.stats.totalActive).toBe(0);
    // transfers still present and still ACRIS-attributed
    expect(p.recordedTransfers.length).toBe(2);
  });
});

describe("failure isolation", () => {
  it("ACRIS failure leaves the Cotality building + activeUnits fully available", async () => {
    const p = await payload("450"); // lookupBBL throws
    expect(p.success).toBe(true);
    expect(p.activeUnits.length).toBeGreaterThan(0);
    expect(p.building.name).toBeTruthy();
    expect(p.recordedTransfers).toEqual([]);
    expect(p.saleHistory).toEqual([]);
    expect(p.stats.avgPrice).toBe(2000000); // Cotality stats unaffected
  });

  it("no ACRIS records → empty transfer layer, stats untouched", async () => {
    const p = await payload("300");
    expect(p.recordedTransfers).toEqual([]);
    expect(p.stats.recordedTransfers).toEqual({ count: 0 });
    expect(p.stats.avgPrice).toBe(2000000);
  });

  it("Cotality outage still yields the DB layer; Neon outage still yields the Trestle layer", async () => {
    const pTrestleDown = await payload("600");
    expect(pTrestleDown.success).toBe(true);
    expect(pTrestleDown.activeUnits.some((u: { mlsId: string }) => u.mlsId === "SL-3001")).toBe(true);
    const pDbDown = await payload("500");
    expect(pDbDown.success).toBe(true);
    expect(pDbDown.activeUnits.some((u: { mlsId: string }) => u.mlsId.startsWith("TRE-500"))).toBe(true);
  });
});

describe("non-persistence + gates", () => {
  it("no Prisma write path is ever touched (read-only findMany is the ONLY access)", async () => {
    await payload("100");
    expect(prismaWriteAttempts).toEqual([]);
  });

  it("the module introduces no R2 upload and no prisma write calls (source pins)", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "lib", "buildings", "public-building-data.ts"), "utf8");
    expect(src).not.toMatch(/uploadToR2|r2-client|lib\/images\/r2/);
    expect(src).not.toMatch(/\.(create|update|upsert|delete|createMany|updateMany|deleteMany)\(/);
    const adapterSrc = fs.readFileSync(
      path.join(process.cwd(), "lib", "buildings", "acris-building-sales.ts"), "utf8");
    expect(adapterSrc).not.toMatch(/from ['"]@\/lib\/prisma|PrismaClient|uploadToR2\s*\(/);
  });

  it("distribution gates keep gated records out of activeUnits (existing gate contract unchanged)", async () => {
    const p = await payload("100");
    // The InternetEntireListingDisplayYN=false record is dropped by
    // checkDistributionGates exactly as before this PR…
    expect(p.activeUnits.some((u: { unit: string }) => u.unit === "PH9")).toBe(false);
    // …and gatedRecordsCount keeps its existing module contract (0 — the IDX
    // Plus feed pre-filters gated listings; the gate filter is defense).
    expect(p.gatedRecordsCount).toBe(0);
  });
});

describe("consumer-facing language — ACRIS transfers are NEVER presented as sales (Maya verified defect, 2026-07-23 review)", () => {
  const SURFACES = [
    ["app", "building", "page.tsx"],
    ["app", "buildings", "[slug]", "page.tsx"],
    ["app", "components", "BuildingUnits.tsx"],
  ];
  const readSurface = (parts: string[]) =>
    fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");
  // strip block + line comments: the prohibition may be STATED in comments,
  // but no rendered/SEO string may use sale-language for transfers.
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

  it("forbidden sale-language is absent from every building surface (render + metadata + OG + empty states + seller CTA)", () => {
    const FORBIDDEN = [
      /sales history/i,
      /recent sales?/i,
      /average sale price/i,
      /sale price/i,
      /price history/i,
      /closing price/i,
      />\s*Sold\s*</,
    ];
    for (const parts of SURFACES) {
      const rendered = stripComments(readSurface(parts));
      for (const bad of FORBIDDEN) {
        expect({ file: parts.join("/"), matches: rendered.match(bad) }).toEqual({
          file: parts.join("/"),
          matches: null,
        });
      }
    }
  });

  it("approved language + visible ACRIS source disclosure present on every surface", () => {
    for (const parts of SURFACES) {
      const src = readSurface(parts);
      expect(src).toContain("Recorded Transfers");
      expect(src).toContain("Source: NYC ACRIS");
      expect(src).toContain("not verified unit-level sales");
    }
  });

  it("column headers use Recorded Date / Recorded Amount on the building pages", () => {
    for (const parts of [SURFACES[0], SURFACES[1]]) {
      const src = readSurface(parts);
      expect(src).toContain(">Recorded Date</th>");
      expect(src).toContain(">Recorded Amount</th>");
    }
    expect(readSurface(SURFACES[2])).toContain("Recorded Amount");
  });

  it("seller CTA derives from public-record + asking-price wording, never sale claims", () => {
    const src = readSurface(SURFACES[1]);
    expect(src).toContain("on public record");
    expect(src).toContain("average asking price");
    expect(src).toContain("among active listings");
  });

  it("SEO metadata + OG advertise recorded transfers, not sales history", () => {
    const slug = readSurface(SURFACES[1]);
    expect(slug).toContain("Units, Recorded Transfers & Amenities");
    expect(slug).toContain("recorded transfer");
    const legacy = readSurface(SURFACES[0]);
    expect(legacy).toContain("recorded transfer records");
  });
});

describe("legacy /api/listings/building route — same boundary rules", () => {
  it("row semantics: nulls not zeros; per-layer attribution; no blanket idx label", async () => {
    const { GET } = require("@/app/api/listings/building/route");
    const res = await GET(new NextRequest(
      "https://mallan.nyc/api/listings/building?streetNumber=100&streetName=East%2090th%20Street&postalCode=10128"));
    const body = await res.json();
    expect(body.success).toBe(true);
    for (const s of body.saleHistory) {
      expect(s.source).toBe("acris");
      expect(s.beds).toBeNull();
      expect(s.baths).toBeNull();
      expect(s.sqft).toBeNull();
      expect(s.label).toBe("recorded-transfer");
    }
    expect(body.sourceAttribution.recordedTransfers.source).toBe("nyc-acris");
    expect(body.sourceAttribution.activeUnits.source).toBe("cotality-trestle");
    expect(body._compliance.source).toContain("acris");
    expect(body._compliance.source).toContain("cotality");
    expect(body._compliance.attribution).not.toBe("REBNY RLS");
    expect(body._compliance.attribution).toContain("ACRIS");
  });
});

// ═══ Maya correction round (2026-07-23): exclusive override + canonical contract ═══

describe("Mallan-exclusive local-publication override — ONE listing identity, twin suppressed", () => {
  it("override ACTIVE: the SL exclusive is the public representation; the Cotality twin is suppressed; counted ONCE", async () => {
    const p = await payload("800");
    const ph1Rows = p.activeUnits.filter((u: { unit: string }) => u.unit === "PH1");
    expect(ph1Rows).toHaveLength(1);
    expect(ph1Rows[0].mlsId).toBe("SL-3001");
    expect(p.activeUnits.some((u: { mlsId: string }) => u.mlsId === "RLS-TWIN-800")).toBe(false);
    expect(p.stats.totalActive).toBe(3); // SL + A1 + A2, twin NOT double-counted
  });

  it("override ACTIVE: local record carries Mallan attribution + explicit publication state", async () => {
    const p = await payload("800");
    const sl = p.activeUnits.find((u: { mlsId: string }) => u.mlsId === "SL-3001");
    expect(sl.source).toBe("mallan-exclusive");
    expect(sl.office).toBe("Mallan Real Estate Inc.");
    expect(sl.publication).toEqual({
      authority: "mallan-local",
      reconciledCotalityId: "RLS-TWIN-800",
      cotalityDisplaySuppressed: true,
    });
    const a1 = p.activeUnits.find((u: { mlsId: string }) => u.mlsId === "TRE-800-A1");
    expect(a1.source).toBe("cotality-trestle");
  });

  it("override ACTIVE: statistics use the LOCAL asking price; the suppressed twin price enters nothing", async () => {
    const p = await payload("800");
    // active priced: 3,000,000 (LOCAL) + 2,000,000 + 1,000,000 → mean 2,000,000
    expect(p.stats.avgPrice).toBe(2000000);
    // ppsf population: SL(3M/1500) + A1(2M/1000) → 2,500,000 / 1,250 = 2,000
    expect(p.stats.avgPricePerSqft).toBe(2000);
    expect(JSON.stringify(p.stats)).not.toContain("2750000");
  });

  it("override ENDED: the still-eligible Cotality twin is restored WITHOUT duplication", async () => {
    const p = await payload("900");
    const ph1Rows = p.activeUnits.filter((u: { unit: string }) => u.unit === "PH1");
    expect(ph1Rows).toHaveLength(1);
    expect(ph1Rows[0].mlsId).toBe("RLS-TWIN-900");
    expect(ph1Rows[0].source).toBe("cotality-trestle");
    expect(ph1Rows[0].publication).toBeUndefined();
    expect(p.stats.totalActive).toBe(3);
  });

  it("suppression is read-time only: no Prisma mutation is ever attempted", async () => {
    await payload("800");
    expect(prismaWriteAttempts).toEqual([]);
  });

  it("ACRIS amounts STILL enter no active-listing statistic in the override scenario", async () => {
    const p = await payload("800");
    const statsJson = JSON.stringify(p.stats);
    expect(statsJson).not.toContain("50000000");
    expect(statsJson).not.toContain("2100000");
  });
});

describe("canonical recordedTransfers contract (saleHistory = deprecated alias)", () => {
  it("the shared payload returns BOTH fields and they stay row-equivalent during the compat period", async () => {
    const p = await payload("100");
    expect(p.recordedTransfers.map((t: { id: string }) => t.id))
      .toEqual(p.saleHistory.map((s: { id: string }) => s.id));
    for (let i = 0; i < p.recordedTransfers.length; i++) {
      expect(p.recordedTransfers[i].amount).toBe(p.saleHistory[i].closePrice);
      expect(p.recordedTransfers[i].recordedDate).toBe(p.saleHistory[i].closeDate);
    }
  });

  it("all three public consumers use the canonical field via toRecordedTransfers (no new saleHistory consumer)", () => {
    for (const parts of [
      ["app", "building", "page.tsx"],
      ["app", "buildings", "[slug]", "page.tsx"],
      ["app", "components", "BuildingUnits.tsx"],
    ]) {
      const src = fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");
      expect(src).toContain("toRecordedTransfers(");
      expect(src).not.toMatch(/data\.saleHistory|setSaleHistory|=\s*saleHistory\b/);
    }
  });

  it("the consumer helper prefers recordedTransfers and normalizes the deprecated alias identically", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { toRecordedTransfers } = require("@/lib/buildings/recorded-transfers");
    const canonical = toRecordedTransfers({
      recordedTransfers: [{ id: "a", amount: 5, recordedDate: "2024-01-01", unit: "", beds: null, baths: null, sqft: null, source: "acris" }],
      saleHistory: [{ id: "WRONG", closePrice: 9 }],
    });
    expect(canonical).toHaveLength(1);
    expect(canonical[0].id).toBe("a");
    const fallback = toRecordedTransfers({ saleHistory: [{ id: "b", closePrice: 7, closeDate: "2023-02-02" }] });
    expect(fallback[0].amount).toBe(7);
    expect(fallback[0].recordedDate).toBe("2023-02-02");
  });
});

describe("BuildingUnits — table-scoped labels (Asking Price vs Recorded Amount)", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "app", "components", "BuildingUnits.tsx"), "utf8");
  const marker = "Available Units in";
  const availableSection = src.slice(src.indexOf(marker));
  const transferSections = src.slice(0, src.indexOf(marker));

  it("the Available Units table (unit.listPrice) says Asking Price — never Recorded Amount", () => {
    expect(availableSection).toContain("Asking Price");
    expect(availableSection).toContain("{formatPrice(unit.listPrice)}");
    expect(availableSection).not.toContain("Recorded Amount");
  });

  it("the recorded-transfer tables (sale.amount) say Recorded Amount — never Asking Price, never $0 for missing", () => {
    expect(transferSections).toContain("Recorded Amount");
    // null-guarded render: a missing amount shows an em-dash, never $0
    expect(transferSections).toContain("sale.amount != null ? formatPrice(sale.amount)");
    expect(transferSections).not.toContain("Asking Price");
    expect((transferSections.match(/Recorded Amount/g) ?? []).length).toBe(2);
  });
});

describe("legacy route — ACRIS survives Cotality-closed dedupe (regression) + canonical field", () => {
  it("an ACRIS record that MATCHES a withheld Cotality closed row still ships (isDuplicate=true)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const acrisModule = require("@/lib/buildings/acris-building-sales");
    (acrisModule.isDuplicate as jest.Mock).mockReturnValue(true);
    const { GET } = require("@/app/api/listings/building/route");
    const res = await GET(new NextRequest(
      "https://mallan.nyc/api/listings/building?streetNumber=100&streetName=East%2090th%20Street&postalCode=10128"));
    const body = await res.json();
    expect(body.saleHistory.length).toBe(2);
    expect(body.recordedTransfers.length).toBe(2);
    for (const t of body.recordedTransfers) {
      expect(t.source).toBe("acris");
      expect(t.label).toBe("recorded-transfer");
      expect(typeof t.amount).toBe("number");
    }
    (acrisModule.isDuplicate as jest.Mock).mockReturnValue(false);
  });
});

// ═══ Maya round 3: manifest eligibility + real-pair proof + strengthened twins ═══

describe("manifest eligibility — the ONE canonical public contract (SL-0007 / RLS20099289 real pair)", () => {
  it("the manifest query carries the canonical two-branch eligibility OR (enforced by the mock, not assumed)", async () => {
    await payload("400");
    const shardCall = listingFindMany.mock.calls.map((c) => c[0]).find((q) =>
      (q?.where?.AND ?? []).some((c: Record<string, any>) => c?.address?.string_starts_with));
    expect(shardCall).toBeTruthy();
    const orCond = (shardCall!.where.AND as Array<Record<string, any>>).find((c) => Array.isArray(c.OR));
    expect(orCond).toBeTruthy();
    const branches = orCond!.OR as Array<Record<string, any>>;
    expect(branches.some((b) => b.rls_eligible === true && b.idx_display_yn === true)).toBe(true);
    const web = branches.find((b) => b.rls_eligible === false);
    expect(web).toBeTruthy();
    expect(web!.owner_opt_out).toBe(false);
    expect(web!.list_price).toEqual({ gt: 0 });
    expect(web!.status.in).toEqual(expect.arrayContaining(["Active", "ComingSoon", "ActiveUnderContract"]));
  });

  it("REAL PAIR: Unit 4D appears exactly ONCE as SL-0007; the RLS20099289 twin is suppressed; Compass 23B remains", async () => {
    const p = await payload("400");
    const unit4d = p.activeUnits.filter((u: { unit: string }) => u.unit === "4D");
    expect(unit4d).toHaveLength(1);
    expect(unit4d[0].mlsId).toBe("SL-0007");
    expect(unit4d[0].listPrice).toBe(560000);
    expect(unit4d[0].source).toBe("mallan-exclusive");
    expect(unit4d[0].office).toBe("Mallan Real Estate Inc.");
    expect(unit4d[0].publication).toEqual({
      authority: "mallan-local",
      reconciledCotalityId: "RLS20099289",
      cotalityDisplaySuppressed: true,
    });
    expect(p.activeUnits.some((u: { mlsId: string }) => u.mlsId === "RLS20099289")).toBe(false);
    const compass = p.activeUnits.find((u: { unit: string }) => u.unit === "23B");
    expect(compass).toBeTruthy();
    expect(compass.mlsId).toBe("RLS-COMPASS-23B");
    expect(compass.office).toBe("Compass");
    expect(compass.source).toBe("cotality-trestle");
  });

  it("REAL PAIR statistics: the local $560,000 enters ONCE; the twin's $565,000 and ACRIS amounts enter nothing", async () => {
    const p = await payload("400");
    expect(p.stats.totalActive).toBe(2); // SL-0007 + Compass 23B
    // (560,000 + 1,200,000) / 2
    expect(p.stats.avgPrice).toBe(880000);
    // consistent both-population: (560k/550) + (1.2M/900) → 880,000 / 725
    expect(p.stats.avgPricePerSqft).toBe(1214);
    const statsJson = JSON.stringify(p.stats);
    expect(statsJson).not.toContain("565000");
    expect(statsJson).not.toContain("2100000");
    expect(statsJson).not.toContain("50000000");
  });

  it("nonpublic CRM rows stay out: a Draft SL row and an owner-opt-out SL row exist in the fixture but are NOT admitted", async () => {
    const p = await payload("400");
    expect(p.activeUnits.some((u: { mlsId: string }) => u.mlsId === "SL-DRAFT-1")).toBe(false);
    expect(p.activeUnits.some((u: { mlsId: string }) => u.mlsId === "SL-OPTOUT-1")).toBe(false);
    expect(p.activeUnits.some((u: { unit: string }) => u.unit === "6F" || u.unit === "7G")).toBe(false);
  });
});

describe("strengthened twin reconciliation — verified twin only, never blanket suppression", () => {
  it("sale and rental at the SAME unit never suppress each other (both directions)", async () => {
    const p = await payload("460");
    const ids = p.activeUnits.map((u: { mlsId: string }) => u.mlsId).sort();
    expect(ids).toEqual(["RL-RENT-8A", "SL-SALE-9B", "TRE-460-RENT-9B", "TRE-460-SALE-8A"]);
    for (const u of p.activeUnits) expect(u.publication).toBeUndefined();
  });

  it("MULTIPLE Cotality candidates without explicit evidence → suppress NONE (truthful separate records)", async () => {
    const p = await payload("470");
    const ids = p.activeUnits.map((u: { mlsId: string }) => u.mlsId).sort();
    expect(ids).toEqual(["RLS-C1", "RLS-C2", "SL-MULTI-5C"]);
    const sl = p.activeUnits.find((u: { mlsId: string }) => u.mlsId === "SL-MULTI-5C");
    expect(sl.publication).toBeUndefined();
  });

  it("explicit provenance link (features.ReconciledListingId) → ONLY that verified twin is suppressed", async () => {
    const p = await payload("480");
    const ids = p.activeUnits.map((u: { mlsId: string }) => u.mlsId).sort();
    expect(ids).toEqual(["RLS-C1", "SL-EXPL-5C"]);
    const sl = p.activeUnits.find((u: { mlsId: string }) => u.mlsId === "SL-EXPL-5C");
    expect(sl.publication).toEqual({
      authority: "mallan-local",
      reconciledCotalityId: "RLS-C2",
      cotalityDisplaySuppressed: true,
    });
  });

  it("no unit → no reconciliation (both no-unit rows remain)", async () => {
    const p = await payload("490");
    const ids = p.activeUnits.map((u: { mlsId: string }) => u.mlsId).sort();
    expect(ids).toEqual(["SL-NOUNIT", "TRE-490-NOUNIT"]);
  });
});

describe("toRecordedTransfers — malformed compatibility rows never fabricate values", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { toRecordedTransfers } = require("@/lib/buildings/recorded-transfers");

  it("a missing amount stays null — it never becomes a $0 recorded amount", () => {
    const rows = toRecordedTransfers({ saleHistory: [{ id: "x", closeDate: "2024-01-01", source: "acris" }] });
    expect(rows[0].amount).toBeNull();
    expect(rows[0].amount).not.toBe(0);
  });

  it("a missing source stays 'unknown' — it never silently becomes ACRIS provenance", () => {
    const rows = toRecordedTransfers({ saleHistory: [{ id: "y", closePrice: 100000 }] });
    expect(rows[0].source).toBe("unknown");
    expect(rows[0].source).not.toBe("acris");
  });

  it("valid legacy closePrice/closeDate still normalize; canonical recordedTransfers stays preferred", () => {
    const legacy = toRecordedTransfers({ saleHistory: [{ id: "z", closePrice: 250000, closeDate: "2022-03-03", source: "acris" }] });
    expect(legacy[0].amount).toBe(250000);
    expect(legacy[0].recordedDate).toBe("2022-03-03");
    const preferred = toRecordedTransfers({
      recordedTransfers: [{ id: "canon", amount: 1, recordedDate: "2020-01-01", unit: "", beds: null, baths: null, sqft: null, source: "acris" }],
      saleHistory: [{ id: "IGNORED", closePrice: 9 }],
    });
    expect(preferred).toHaveLength(1);
    expect(preferred[0].id).toBe("canon");
  });
});
