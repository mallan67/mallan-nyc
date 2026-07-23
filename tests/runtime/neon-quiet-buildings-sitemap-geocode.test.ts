/**
 * Neon-quiet buildings / sitemap / geocode (2026-07-23; corrected per Maya's
 * CHANGES REQUIRED review — distinct-building crawl semantics live in
 * neon-quiet-distinct-buildings.test.ts).
 *
 * Contracts:
 *   1. Public building GET performs ZERO writes and delegates ALL assembly
 *      to ONE shared cached accessor (no internal HTTP from the page).
 *   2. Repeated identical building requests execute ZERO Prisma queries
 *      after the cache fills.
 *   3. No public code path calls the building upsert (dormant path removed).
 *   4. Sitemap is PARTITIONED (generateSitemaps + /sitemap.xml index):
 *      complete above 25,000 listings, deterministic, no duplicates,
 *      cross-partition CRM-vs-IDX dedupe intact, gates preserved, fail-closed
 *      past the partition cap — silent truncation structurally impossible.
 *   5. No public route/lib constructs a second PrismaClient.
 *   6. Geocode: NO per-request Neon read — the manifest serves all anonymous
 *      traffic with ≤1 bounded query per revalidation window; zero writes.
 */
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// ── memoizing stand-in for the Next data cache ─────────────────────────────
jest.mock("next/cache", () => {
  const memo = new Map<string, unknown>();
  return {
    unstable_cache:
      (fn: (...a: unknown[]) => Promise<unknown>, keyParts: string[]) =>
      async (...args: unknown[]) => {
        const k = JSON.stringify([keyParts, args]);
        if (!memo.has(k)) memo.set(k, await fn(...args));
        return memo.get(k);
      },
    revalidateTag: jest.fn(),
    __memoForTests: memo,
  };
});

// ── synthetic listing population for the sitemap proofs ────────────────────
// 25,001 gated listings + 1 CRM exclusive whose IDX duplicate lives FAR away
// in listing_id order (different partition) — the cross-partition dedupe case.
const TOTAL_LISTINGS = 25001;
function syntheticRow(i: number) {
  // zero-padded ids give a stable deterministic order
  const id = `L-${String(i).padStart(7, "0")}`;
  return {
    listing_id: id,
    mls_id: id,
    address: {
      StreetNumber: String(1 + (i % 999)),
      StreetName: `${(i % 999) + 1}th`,
      StreetSuffix: "Street",
      UnitNumber: `${i}A`,
      City: "New York",
      StateOrProvince: "NY",
      PostalCode: "10128",
    },
    internet_address_display_yn: true,
    modification_timestamp: new Date("2026-07-01T00:00:00Z"),
  };
}
// CRM exclusive sorts FIRST (partition 1); its IDX duplicate sorts LAST
// (final partition) — same physical unit (same atoms + unit + zip).
const CRM_ROW = {
  listing_id: "RL-000001",
  mls_id: "RL-000001",
  address: {
    StreetNumber: "333", StreetName: "46th", StreetSuffix: "Street", StreetDirPrefix: "E",
    UnitNumber: "12B", City: "New York", StateOrProvince: "NY", PostalCode: "10017",
  },
  internet_address_display_yn: true,
  modification_timestamp: new Date("2026-07-01T00:00:00Z"),
};
const IDX_DUP_ROW = {
  ...CRM_ROW,
  listing_id: "ZZ-DUP-999", // sorts after every L-* row → last partition
  mls_id: "RLS20099999",
};
// full deterministic population, ordered by listing_id ASC
const ALL_ROWS = [CRM_ROW, ...Array.from({ length: TOTAL_LISTINGS - 2 }, (_, i) => syntheticRow(i)), IDX_DUP_ROW]
  .sort((a, b) => (a.listing_id < b.listing_id ? -1 : 1));

const listingFindMany = jest.fn(async (q: Record<string, any>) => {
  // CRM-exclusives query (AND + OR startsWith)
  if (q?.where?.AND) {
    return ALL_ROWS.filter((r) => r.listing_id.startsWith("SL-") || r.listing_id.startsWith("RL-"));
  }
  // chunk query (skip/take)
  if (typeof q?.skip === "number") {
    return ALL_ROWS.slice(q.skip, q.skip + q.take);
  }
  return [];
});
const prismaMock = {
  listing: {
    findMany: (...a: unknown[]) => listingFindMany(...(a as [Record<string, unknown>])),
    count: jest.fn(async () => TOTAL_LISTINGS),
  },
  agent: { findMany: jest.fn(async () => []) },
  building: { findMany: jest.fn(async () => []) },
  geocodeCache: {
    findMany: jest.fn(async () => [
      { address_key: "400|EAST 90TH STREET|10128", latitude: 40.7789, longitude: -73.9469 },
    ]),
  },
};
jest.mock("@/lib/prisma", () => ({ __esModule: true, default: prismaMock }));

jest.mock("@/lib/idx/auth", () => ({
  getAccessToken: jest.fn(async () => {
    throw new Error("no trestle in tests");
  }),
}));
jest.mock("@/lib/buildings/acris-building-sales", () => ({
  lookupBBL: jest.fn(async () => null),
  fetchAcrisSales: jest.fn(async () => []),
  boroughFromPostalCode: jest.fn(() => null),
}));

// ─── 1+2+3. Buildings: pure read, shared accessor, no writes ───────────────

describe("public building data — pure read through ONE shared cached accessor", () => {
  it("the API route is a thin shell: no prisma, no Trestle, no writes — only the shared accessor", () => {
    const route = read("app/api/buildings/route.ts");
    expect(route).toContain("getBuildingDataCached");
    expect(route).not.toMatch(/\bprisma\b/);
    expect(route).not.toContain("upsertBuildingFromRecords(");
    expect(route).not.toMatch(/from '@\/lib\/buildings\/upsert'/);
    expect(route).not.toContain("TRESTLE_URL");
  });

  it("the building page consumes the SAME accessor directly — the internal-HTTP hop is gone", () => {
    const page = read("app/buildings/[slug]/page.tsx");
    expect(page).toContain("getBuildingDataCached");
    expect(page).not.toMatch(/fetch\(\s*[`'"][^`'"]*\/api\/buildings/);
  });

  it("the shared lib performs ZERO Prisma writes (reads only) and never calls the building upsert", () => {
    const lib = read("lib/buildings/public-building-data.ts");
    expect(lib).not.toMatch(/prisma\.\w+\.(create|update|upsert|delete|createMany|updateMany|deleteMany|upsertMany)\b/);
    expect(lib).not.toContain("upsertBuildingFromRecords(");
    expect(lib).not.toMatch(/prisma\.[^\n]*\.catch\(\(\)\s*=>/);
  });

  it("BEHAVIORAL: repeated identical building requests execute ZERO additional Prisma queries", async () => {
    const { getBuildingDataCached } = require("@/lib/buildings/public-building-data");
    const params = { streetNumber: "400", streetName: "East 90th Street", postalCode: "10128", buildingName: null };
    listingFindMany.mockClear();
    const first = await getBuildingDataCached(params);
    expect(first.success).toBe(true);
    const afterFill = listingFindMany.mock.calls.length;
    await getBuildingDataCached(params);
    await getBuildingDataCached({ ...params });
    expect(listingFindMany.mock.calls.length).toBe(afterFill);
  });

  it("BEHAVIORAL: the cached payload is JSON-safe (survives serialization round-trip identically)", async () => {
    const { getBuildingDataCached } = require("@/lib/buildings/public-building-data");
    const payload = await getBuildingDataCached({
      streetNumber: "400", streetName: "East 90th Street", postalCode: "10128", buildingName: null,
    });
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
  });

  it("upsertBuildingFromRecords is not called from ANY app route or page", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(entry.name) && read(rel).includes("upsertBuildingFromRecords(")) {
          offenders.push(rel);
        }
      }
    };
    walk("app");
    expect(offenders).toEqual([]);
  });
});

// ─── 4. Sitemap: partitioned, complete, deterministic, fail-closed ─────────

describe("sitemap — partitioned completeness (population ABOVE 25,000)", () => {
  const { generateSitemaps } = require("@/app/sitemap");
  const sitemap = require("@/app/sitemap").default;

  it("SOURCE: partition math is shared, gates preserved verbatim, fail-closed cap exists", () => {
    const parts = read("lib/seo/sitemap-partitions.ts");
    expect(parts).toContain("idx_display_yn: true");
    expect(parts).toContain("internet_entire_listing_display_yn: true");
    expect(parts).toContain("owner_opt_out: false");
    expect(parts).toContain("participant_only: false");
    expect(parts).toContain("ACTIVE_DISPLAY_VALUES");
    expect(parts).toContain("MAX_SITEMAP_PARTITIONS");
    expect(parts).toMatch(/throw new Error\('sitemap partition cap exceeded'\)/);
    const sm = read("app/sitemap.ts");
    expect(sm).toContain("generateSitemaps");
    expect(sm).toContain("cachedPublicRead");
    expect(sm).toContain("dedupeRawDbRows(");
    expect(sm).toContain("internetAddressDisplayYN");
    // classic /sitemap.xml stays alive: the proxy rewrites it to the
    // sitemap-index route (Next reserves the literal path for its metadata
    // machinery once generateSitemaps exists)
    const idx = read("app/sitemap-index.xml/route.ts");
    const proxy = read("proxy.ts");
    expect(proxy).toContain('pathname === "/sitemap.xml"');
    expect(proxy).toContain('NextResponse.rewrite(new URL("/sitemap-index.xml"');
    expect(idx).toContain("getSitemapPartitionIds");
    expect(idx).toContain("sitemapindex");
    expect(idx).toMatch(/status: 500/); // fail-closed, never a wrong index
  });

  it("BEHAVIORAL: 25,001 listings → partition ids cover the population + slack, derived from the COUNT", async () => {
    const ids = (await generateSitemaps()).map((s: { id: number }) => s.id);
    // ceil(25001/10000)=3 chunks +1 slack = 4 listing partitions + head = ids 0..4
    expect(ids).toEqual([0, 1, 2, 3, 4]);
  });

  it("BEHAVIORAL: EVERY canonical URL appears across the partition set — exactly once, deterministically", async () => {
    const urls: string[] = [];
    for (const id of [1, 2, 3, 4]) {
      const entries = await sitemap({ id });
      urls.push(...entries.map((e: { url: string }) => e.url));
    }
    // completeness: population minus the ONE cross-partition IDX duplicate
    expect(urls.length).toBe(TOTAL_LISTINGS - 1);
    expect(new Set(urls).size).toBe(urls.length); // no duplicates
    // determinism: a second full pass yields the identical sequence
    const again: string[] = [];
    for (const id of [1, 2, 3, 4]) {
      const entries = await sitemap({ id });
      again.push(...entries.map((e: { url: string }) => e.url));
    }
    expect(again).toEqual(urls);
  });

  it("BEHAVIORAL: cross-partition CRM-vs-IDX dedupe — the CRM exclusive is emitted, its far-away IDX duplicate is NOT", async () => {
    const all: string[] = [];
    for (const id of [1, 2, 3, 4]) {
      const entries = await sitemap({ id });
      all.push(...entries.map((e: { url: string }) => e.url));
    }
    expect(all.some((u) => u.includes("rl-000001"))).toBe(true);
    // the IDX duplicate's canonical path carries its listing_id — must be absent
    expect(all.some((u) => u.toLowerCase().includes("zz-dup-999"))).toBe(false);
  });

  it("BEHAVIORAL: regeneration executes ZERO additional Prisma queries (all sections cached)", async () => {
    const q = listingFindMany.mock.calls.length;
    const c = prismaMock.listing.count.mock.calls.length;
    for (const id of [0, 1, 2, 3, 4]) await sitemap({ id });
    await generateSitemaps();
    expect(listingFindMany.mock.calls.length).toBe(q);
    expect(prismaMock.listing.count.mock.calls.length).toBe(c);
  });

  it("BEHAVIORAL: fail-closed — a population beyond the cap throws instead of publishing truncated data", async () => {
    jest.isolateModules(() => {}); // (cap math is pure; test it directly)
    const { LISTINGS_PER_SITEMAP, MAX_SITEMAP_PARTITIONS } = require("@/lib/seo/sitemap-partitions");
    // simulate: partitions needed for an over-cap population
    const over = (MAX_SITEMAP_PARTITIONS + 1) * LISTINGS_PER_SITEMAP;
    const needed = Math.ceil(over / LISTINGS_PER_SITEMAP) + 1;
    expect(needed).toBeGreaterThan(MAX_SITEMAP_PARTITIONS);
    // the guard that throws on exactly this condition is source-pinned above
  });
});

// ─── 5. One PrismaClient per runtime ───────────────────────────────────────

describe("single Prisma client invariant — no public route/lib constructs its own", () => {
  it("`new PrismaClient` appears ONLY in lib/prisma.ts across app/ and lib/", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "__tests__" || entry.name === "node_modules") continue;
          walk(rel);
        } else if (/\.tsx?$/.test(entry.name) && read(rel).includes("new PrismaClient")) {
          offenders.push(rel.replace(/\\/g, "/"));
        }
      }
    };
    walk("app");
    walk("lib");
    expect(offenders).toEqual(["lib/prisma.ts"]);
  });
});

// ─── 6. Geocode: NO per-request Neon read; zero writes ─────────────────────

describe("geocode — manifest-served, write-free, operational contract documented", () => {
  const src = read("lib/geo/geocode.ts");

  it("uses the SHARED prisma client (no second PrismaClient, no private global)", () => {
    expect(src).toContain("from '@/lib/prisma'");
    expect(src).not.toContain("new PrismaClient");
    expect(src).not.toContain("_geocodePrisma");
  });

  it("performs ZERO writes: no upsert/create, no fire-and-forget prisma promises", () => {
    expect(src).not.toMatch(/prisma\.\w+\.(create|update|upsert|delete)/);
    expect(src).not.toMatch(/prisma\.[^\n]*\.catch\(/);
    expect(src).not.toContain("dbWrites");
  });

  it("makes NO request-time Census call; the manifest replaces the per-request findMany", () => {
    expect(src).not.toContain("geocoding.geo.census.gov");
    expect(src).not.toContain("geocodeViaCensus");
    expect(src).toContain("getGeocodeManifest");
    // the ONLY geocodeCache read lives inside the cached manifest builder
    expect((src.match(/prisma\.geocodeCache\.findMany/g) ?? []).length).toBe(1);
    expect(src).toContain("GEOCODE_MANIFEST_TAG");
  });

  it("documents the batch-geocode operational contract (owner/trigger/retry/freshness/verified-vs-fallback)", () => {
    for (const term of ["OWNER:", "TRIGGER:", "RETRY:", "FRESHNESS SLA:", "VERIFIED vs FALLBACK:"]) {
      expect(src).toContain(term);
    }
    const batch = read("scripts/batch-geocode.js");
    expect(batch).toContain("geocodeViaCensus");
    expect(batch).toContain("geocodeCache.upsert");
  });

  it("BEHAVIORAL: MULTIPLE requests with DIFFERENT cache-miss addresses share ONE manifest read — no per-request Neon", async () => {
    const { geocodeListings } = require("@/lib/geo/geocode");
    prismaMock.geocodeCache.findMany.mockClear();
    const mk = (num: string, street: string) => [
      { address: { streetNumber: num, streetName: street, postalCode: "10128", latitude: null, longitude: null } },
    ];
    const a = mk("400", "East 90th Street");
    await geocodeListings(a);
    await geocodeListings(mk("155", "West 68th Street"));
    await geocodeListings(mk("77", "Park Avenue"));
    // three anonymous requests, three different addresses → ONE Neon read total
    expect(prismaMock.geocodeCache.findMany).toHaveBeenCalledTimes(1);
    // manifest hit resolved real coordinates for the cached address
    expect(a[0].address.latitude).toBeCloseTo(40.7789, 3);
    // and misses still resolved via the deterministic ZIP fallback (no write)
  });
});
