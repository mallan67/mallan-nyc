/**
 * COTALITY / ACRIS SOURCE BOUNDARY (Maya approved scope, 2026-07-23).
 *
 * The public building payload must distinguish:
 *   building + activeUnits          → Cotality/Trestle (REBNY RLS attribution)
 *   recordedTransfers (saleHistory) → NYC ACRIS public records — recorded
 *                                     transfer documents, NOT verified
 *                                     unit-level sales
 *   statistics                      → Mallan-derived from Cotality active
 *                                     listings ONLY
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
// 100 = normal: Cotality active units + ACRIS transfers (incl. a whole-building
//       $50M deed and an amount-without-sqft record — all ACRIS rows lack units)
// 200 = NO Cotality active units, ACRIS transfers exist
// 300 = Cotality active units, NO ACRIS records
// 400 = ACRIS service failure (adapter throws)
// 500 = Neon down (DB layer throws) — Trestle-only assembly
// 600 = Cotality/Trestle down — DB-only assembly
const FAIL_DB = new Set(["500"]);
const FAIL_TRESTLE = new Set(["600"]);
const NO_ACTIVE = new Set(["200"]);
const ACRIS_EMPTY = new Set(["300"]);
const ACRIS_THROW = new Set(["400"]);

function dbRows(num: string) {
  if (NO_ACTIVE.has(num)) return [];
  return [
    {
      id: `dbid-${num}-crm`,
      listing_id: "SL-3001",
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
    },
  ];
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
  return [
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
const listingFindMany = jest.fn(async (q: Record<string, any>) => {
  const conds: Array<Record<string, any>> = q?.where?.AND ?? [];
  const shardCond = conds.find((c) => c?.address?.string_starts_with);
  const numCond = conds.find((c) => c?.address?.path?.[0] === "StreetNumber" && c?.address?.equals);
  const num: string = shardCond ? shardCond.address.string_starts_with + "00" : (numCond?.address?.equals ?? "");
  if (FAIL_DB.has(num)) throw new Error("simulated Neon outage");
  return dbRows(num);
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
    expect(p.sourceAttribution.building.source).toBe("cotality-trestle");
    expect(p.sourceAttribution.activeUnits.source).toBe("cotality-trestle");
    expect(p.sourceAttribution.building.attribution).toContain("REBNY");
    expect(p.sourceAttribution.recordedTransfers.source).toBe("nyc-acris");
    expect(p.sourceAttribution.recordedTransfers.attribution).toContain("ACRIS");
    // ACRIS layer attribution must NOT carry the REBNY attribution
    expect(p.sourceAttribution.recordedTransfers.attribution).not.toContain("REBNY");
    // and must state these are recorded transfers, not verified unit sales
    expect(p.sourceAttribution.recordedTransfers.attribution.toLowerCase()).toContain("recorded transfer");
    expect(p.sourceAttribution.recordedTransfers.attribution.toLowerCase()).toContain("not verified");
    expect(p.sourceAttribution.statistics.source).toBe("mallan-derived");
    expect(p.sourceAttribution.statistics.attribution.toLowerCase()).toContain("active listings only");
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

  it("Cotality activeUnits remain Cotality-shaped and compatible (key contract unchanged)", async () => {
    const p = await payload("100");
    expect(p.activeUnits.length).toBeGreaterThan(0);
    const keys = Object.keys(p.activeUnits[0]).sort();
    expect(keys).toEqual([
      "baths", "bathsHalf", "beds", "id", "listPrice", "listingType", "mlsId",
      "office", "photoUrl", "propertyType", "sqft", "status", "unit",
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

describe("statistics — Cotality active population ONLY", () => {
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
    const p = await payload("200"); // no Cotality active units at all
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
    const p = await payload("400"); // lookupBBL throws
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
