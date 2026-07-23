/**
 * Neon-quiet buildings / sitemap / geocode (2026-07-23) — the crawler-driven
 * public surface must be a PURE READ served from the tagged data cache.
 *
 * Live root cause these tests pin down: /api/buildings (121 API + 179 page
 * executions/6h, distinct crawler-walked slugs → every one a cache MISS)
 * ran prisma.listing.findMany on each request and carried a fire-and-forget
 * building upsert; the sitemap re-scanned the full listing table on
 * regeneration; the geocode path constructed a SECOND PrismaClient and wrote
 * geocode_cache during public requests (13,499 lifetime inserts).
 *
 * Contracts:
 *   1. Public building GET performs ZERO writes and delegates ALL assembly
 *      to ONE shared cached accessor (no internal HTTP from the page).
 *   2. A repeated building request executes ZERO Prisma queries after the
 *      cache fills (behavioral).
 *   3. No public code path calls the building upsert — building/unit sync is
 *      exclusively owned by an explicit workflow (dormant path removed).
 *   4. Sitemap regeneration is cached + bounded + deterministic, with every
 *      distribution gate preserved (behavioral + source).
 *   5. No public route/lib constructs a second PrismaClient.
 *   6. The geocode request path is read-only (no Census call, no upserts,
 *      no fire-and-forget writes).
 */
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// ── shared mocks for the behavioral tests ──────────────────────────────────

// Memoizing stand-in for the Next data cache: same keyParts+args → one
// underlying execution. This is exactly the property the production cache
// provides between sync-driven revalidations.
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

const prismaMock = {
  listing: { findMany: jest.fn(async () => []) },
  agent: { findMany: jest.fn(async () => []) },
  building: { findMany: jest.fn(async () => []) },
  geocodeCache: { findMany: jest.fn(async () => []) },
};
jest.mock("@/lib/prisma", () => ({ __esModule: true, default: prismaMock }));

// Trestle auth fails fast → the payload builder's try/catch degrades to the
// DB-only path, which is all these tests need.
jest.mock("@/lib/idx/auth", () => ({
  getAccessToken: jest.fn(async () => {
    throw new Error("no trestle in tests");
  }),
}));

// ACRIS enrichment: return nothing, quickly.
jest.mock("@/lib/buildings/acris-building-sales", () => ({
  lookupBBL: jest.fn(async () => null),
  fetchAcrisSales: jest.fn(async () => []),
  boroughFromPostalCode: jest.fn(() => null),
}));

// ─── 1+2. Buildings: pure read, shared cached accessor, zero DB on repeat ──

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
    // no fire-and-forget prisma write pattern
    expect(lib).not.toMatch(/prisma\.[^\n]*\.catch\(\(\)\s*=>/);
  });

  it("the accessor is wrapped in cachedPublicRead with the canonical building tag + search tag", () => {
    const lib = read("lib/buildings/public-building-data.ts");
    expect(lib).toContain("cachedPublicRead(");
    expect(lib).toMatch(/buildingCacheTag\(/);
    expect(lib).toContain("SEARCH_CACHE_TAG");
  });

  it("BEHAVIORAL: repeated requests for the same building execute ZERO additional Prisma queries", async () => {
    const { getBuildingDataCached } = require("@/lib/buildings/public-building-data");
    const params = { streetNumber: "400", streetName: "East 90th Street", postalCode: "10128", buildingName: null };

    const first = await getBuildingDataCached(params);
    expect(first.success).toBe(true);
    const queriesAfterFill = prismaMock.listing.findMany.mock.calls.length;
    expect(queriesAfterFill).toBe(1);

    const second = await getBuildingDataCached(params);
    const third = await getBuildingDataCached({ ...params, buildingName: null });
    expect(second.success).toBe(true);
    expect(third.success).toBe(true);
    // cache fill happened once; repeats hit the memo — zero new DB work
    expect(prismaMock.listing.findMany.mock.calls.length).toBe(queriesAfterFill);
  });

  it("BEHAVIORAL: the cached payload is JSON-safe (survives serialization round-trip identically)", async () => {
    const { getBuildingDataCached } = require("@/lib/buildings/public-building-data");
    const payload = await getBuildingDataCached({
      streetNumber: "400", streetName: "East 90th Street", postalCode: "10128", buildingName: null,
    });
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
  });
});

// ─── 3. Building writes are owned by an explicit workflow only ─────────────

describe("building/unit writes — no public path, sync ownership only", () => {
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

// ─── 4. Sitemap: cached, bounded, deterministic, gates preserved ───────────

describe("sitemap — cached + bounded regeneration, compliance gates intact", () => {
  const src = read("app/sitemap.ts");

  it("DB sections go through cachedPublicRead tagged with the search tag", () => {
    expect(src).toContain("cachedPublicRead(");
    expect(src).toContain("SEARCH_CACHE_TAG");
  });

  it("the listing scan is bounded with a deterministic order (no unbounded scan per regeneration)", () => {
    expect(src).toContain("SITEMAP_LISTING_BOUND");
    expect(src).toMatch(/take:\s*SITEMAP_LISTING_BOUND/);
    expect(src).toMatch(/orderBy:\s*\[\{\s*modification_timestamp:\s*'desc'\s*\},\s*\{\s*listing_id:\s*'asc'\s*\}\]/);
    // no silent caps: hitting the bound logs loudly
    expect(src).toContain("LISTING BOUND HIT");
  });

  it("the bound preserves every canonical URL (≥ 2× current ~10.3k population, ≤ protocol 50k)", () => {
    const m = src.match(/SITEMAP_LISTING_BOUND = (\d+)/);
    expect(m).not.toBeNull();
    const bound = Number(m![1]);
    expect(bound).toBeGreaterThanOrEqual(20000);
    expect(bound).toBeLessThanOrEqual(50000);
  });

  it("every distribution gate + status filter is preserved verbatim", () => {
    expect(src).toContain("idx_display_yn: true");
    expect(src).toContain("internet_entire_listing_display_yn: true");
    expect(src).toContain("owner_opt_out: false");
    expect(src).toContain("participant_only: false");
    expect(src).toContain("status: { in: [...ACTIVE_DISPLAY_VALUES] }");
    // suppressed-address handling + CRM-vs-IDX dedupe still applied
    expect(src).toContain("internetAddressDisplayYN");
    expect(src).toContain("dedupeRawDbRows(");
  });

  it("BEHAVIORAL: repeated sitemap generation executes ZERO additional Prisma queries", async () => {
    const sitemap = require("@/app/sitemap").default;
    prismaMock.listing.findMany.mockClear();
    prismaMock.agent.findMany.mockClear();
    prismaMock.building.findMany.mockClear();

    const first = await sitemap();
    expect(first.length).toBeGreaterThan(0); // static + legal pages always present
    const listingCalls = prismaMock.listing.findMany.mock.calls.length;
    const agentCalls = prismaMock.agent.findMany.mock.calls.length;
    expect(listingCalls).toBe(1);
    expect(agentCalls).toBe(1);

    await sitemap();
    await sitemap();
    expect(prismaMock.listing.findMany.mock.calls.length).toBe(listingCalls);
    expect(prismaMock.agent.findMany.mock.calls.length).toBe(agentCalls);
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

// ─── 6. Geocode: read-only request path ────────────────────────────────────

describe("geocode — read-only public path, shared client, durable population is explicit", () => {
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

  it("makes NO request-time Census call (durable population = scripts/batch-geocode.js)", () => {
    expect(src).not.toContain("geocoding.geo.census.gov");
    expect(src).not.toContain("geocodeViaCensus");
    // the deliberate population path is documented in the module
    expect(src).toContain("scripts/batch-geocode.js");
    // ...and actually exists with its own Census + upsert ownership
    const batch = read("scripts/batch-geocode.js");
    expect(batch).toContain("geocodeViaCensus");
    expect(batch).toContain("geocodeCache.upsert");
  });

  it("BEHAVIORAL: geocodeListings never issues a write — only the cache READ", async () => {
    const { geocodeListings } = require("@/lib/geo/geocode");
    prismaMock.geocodeCache.findMany.mockClear();
    const listings = [
      { address: { streetNumber: "400", streetName: "East 90th Street", postalCode: "10128", latitude: null, longitude: null } },
    ];
    await geocodeListings(listings);
    expect(prismaMock.geocodeCache.findMany).toHaveBeenCalledTimes(1);
    // ZIP centroid fallback filled coordinates without any write
    expect(listings[0].address.latitude).not.toBeNull();
    expect(listings[0].address.longitude).not.toBeNull();
  });
});
