/// <reference types="jest" />
/**
 * Geocode — Neon-QUIET request path (re-land of the ex-#555 geocode slice).
 *
 * Contracts (from the approved neon-quiet design, 2026-07-23):
 *   1. Public geocoding performs ZERO writes and ZERO request-time Census
 *      calls — durable population is the operator-run batch script only.
 *   2. The whole geocode_cache table is served through ONE shared cached
 *      manifest (≤1 bounded Neon fill per revalidation window across ALL
 *      traffic); an ordinary anonymous request opens NO Neon connection.
 *   3. The manifest is COMPLETE: keyset pagination with an explicit
 *      overflow throw — never a silent row ceiling (proven with 53k rows
 *      against the retired fixed 50k take).
 */
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// ── TAG-AWARE memoizing stand-in for the Next data cache ───────────────────
jest.mock("next/cache", () => {
  const store = new Map<string, { value: unknown; tags: string[] }>();
  return {
    unstable_cache:
      (
        fn: (...a: unknown[]) => Promise<unknown>,
        keyParts: string[],
        opts?: { tags?: string[] },
      ) =>
      async (...args: unknown[]) => {
        const k = JSON.stringify([keyParts, args]);
        const hit = store.get(k);
        if (hit) return hit.value;
        const value = await fn(...args);
        store.set(k, { value, tags: opts?.tags ?? [] });
        return value;
      },
    revalidateTag: (tag: string) => {
      for (const [k, entry] of store) if (entry.tags.includes(tag)) store.delete(k);
    },
  };
});

// geocode manifest pagination source: default tiny; switchable to 53k rows
const GEO = { big: false };
function geoRow(i: number) {
  return {
    address_key: `K-${String(i).padStart(6, "0")}`,
    latitude: 40 + i / 1e6,
    longitude: -73 - i / 1e6,
  };
}
const GEO_BIG_TOTAL = 53000;
const geocodeFindMany = jest.fn(async (q: Record<string, any>) => {
  if (!GEO.big) {
    return [
      { address_key: "400|EAST 90TH STREET|10128", latitude: 40.7789, longitude: -73.9469 },
    ];
  }
  let start = 0;
  if (q?.cursor?.address_key) {
    start = Number(q.cursor.address_key.slice(2)) + (q.skip ?? 0);
  }
  const take = q?.take ?? GEO_BIG_TOTAL;
  const out = [];
  for (let i = start; i < Math.min(start + take, GEO_BIG_TOTAL); i++) out.push(geoRow(i));
  return out;
});

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    geocodeCache: {
      findMany: (...a: unknown[]) => geocodeFindMany(...(a as [Record<string, unknown>])),
    },
  },
}));

const { revalidateTag } = require("next/cache");

describe("geocode — complete manifest (no silent ceiling), write-free", () => {
  const src = read("lib/geo/geocode.ts");

  it("uses the SHARED prisma client; ZERO writes; no request-time Census; contract documented", () => {
    expect(src).toContain("from '@/lib/prisma'");
    expect(src).not.toContain("new PrismaClient");
    expect(src).not.toMatch(/prisma\.\w+\.(create|update|upsert|delete)/);
    expect(src).not.toContain("geocoding.geo.census.gov");
    expect(src).toContain("getGeocodeManifest");
    expect((src.match(/prisma\.geocodeCache\.findMany/g) ?? []).length).toBe(1);
    for (const term of ["OWNER:", "TRIGGER:", "RETRY:", "FRESHNESS SLA:", "VERIFIED vs FALLBACK:"]) {
      expect(src).toContain(term);
    }
  });

  it("SOURCE: the fixed 50k take is retired — keyset pagination with an EXPLICIT overflow throw", () => {
    expect(src).not.toContain("GEOCODE_ROW_BOUND");
    expect(src).toContain("GEOCODE_PAGE_SIZE");
    expect(src).toContain("GEOCODE_MAX_PAGES");
    expect(src).toMatch(/OVERFLOW[\s\S]*refusing to serve an incomplete manifest/);
  });

  it("BEHAVIORAL: different-address requests share ONE manifest fill; no per-request Neon", async () => {
    const { geocodeListings } = require("@/lib/geo/geocode");
    geocodeFindMany.mockClear();
    const mk = (num: string, street: string) => [
      {
        address: {
          streetNumber: num,
          streetName: street,
          postalCode: "10128",
          latitude: null,
          longitude: null,
        },
      },
    ];
    const a = mk("400", "East 90th Street");
    await geocodeListings(a);
    await geocodeListings(mk("155", "West 68th Street"));
    await geocodeListings(mk("77", "Park Avenue"));
    expect(geocodeFindMany).toHaveBeenCalledTimes(1);
    expect(a[0].address.latitude).toBeCloseTo(40.7789, 3);
  });

  it("BEHAVIORAL: 53,000 cached rows are served COMPLETELY — pagination advances past the retired 50k ceiling", async () => {
    const { geocodeListings, GEOCODE_PAGE_SIZE } = require("@/lib/geo/geocode");
    GEO.big = true;
    revalidateTag("geocode-manifest"); // force refill from the big source
    geocodeFindMany.mockClear();
    try {
      await geocodeListings([
        {
          address: {
            streetNumber: "1",
            streetName: "Nowhere",
            postalCode: "10128",
            latitude: null,
            longitude: null,
          },
        },
      ]);
      // ceil(53000 / GEOCODE_PAGE_SIZE) pages → bounded queries, ONE fill
      expect(geocodeFindMany.mock.calls.length).toBe(
        Math.ceil(GEO_BIG_TOTAL / GEOCODE_PAGE_SIZE),
      );
      // and the LAST page's cursor advanced past the old 50k boundary
      const lastCall = geocodeFindMany.mock.calls[
        geocodeFindMany.mock.calls.length - 1
      ][0] as Record<string, any>;
      expect(Number(lastCall.cursor.address_key.slice(2))).toBeGreaterThanOrEqual(49999);
    } finally {
      GEO.big = false;
      revalidateTag("geocode-manifest");
    }
  });
});
