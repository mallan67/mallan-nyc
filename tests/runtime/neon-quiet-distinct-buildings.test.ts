/**
 * Neon-quiet DISTINCT-building crawl (2026-07-23, Maya correction #1).
 *
 * The live root cause was distinct crawler-walked building slugs — a
 * different building every ~3 minutes, each a cache MISS running its own
 * prisma.listing.findMany. Caching each building individually does NOT fix
 * that, and tagging every building with the coarse `search` tag would
 * re-expire ALL of them on every sync that changed any listing.
 *
 * The corrected design, proven here BEHAVIORALLY with a tag-aware cache:
 *   - the Neon layer is a building MANIFEST sharded by street-number first
 *     character (≤ ~10 shards) → ANY distinct-building crawl performs at
 *     most ~10 bounded Neon queries per sync window, never one per building;
 *   - per-building payload entries carry ONLY their exact building tag;
 *   - a sync's coarse `search` revalidation refreshes the manifest but does
 *     NOT expire building payload entries;
 *   - a sync that materially changes a listing revalidates that building's
 *     EXACT tag (derived sync-side via buildingTagFromAddress) and only that
 *     building re-assembles.
 */
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// ── tag-aware memoizing stand-in for the Next data cache ───────────────────
// Entries remember their tags; revalidateTag(tag) evicts matching entries —
// the exact production semantics this design depends on.
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
      for (const [k, entry] of store) {
        if (entry.tags.includes(tag)) store.delete(k);
      }
    },
    __storeForTests: store,
  };
});

// Manifest-shaped prisma rows: every queried street gets one gated listing.
// The mock answers the SHARD query (string_starts_with on StreetNumber).
const findManyMock = jest.fn(async (q: Record<string, any>) => {
  const cond = (q?.where?.AND ?? []).find(
    (c: Record<string, any>) => c?.address?.string_starts_with,
  );
  const shard: string = cond?.address?.string_starts_with ?? "";
  const rows = [];
  for (let i = 0; i < 200; i++) {
    const num = String(100 + i);
    if (!num.startsWith(shard)) continue;
    rows.push({
      id: `dbid-${num}`,
      listing_id: `L-${num}`,
      status: "Active",
      list_price: 1000000 + i,
      bedrooms_total: 2,
      bathrooms_full: 1,
      bathrooms_half: 0,
      living_area: 800,
      property_type: "Residential",
      property_sub_type: "Condominium",
      listing_type: "sale",
      address: {
        StreetNumber: num,
        StreetName: `${num}TH STREET TEST`,
        PostalCode: "10128",
        UnitNumber: "1A",
        BuildingName: "",
      },
      features: { CommonInterest: "Condominium", YearBuilt: 1990, StoriesTotal: 10 },
      media: [],
    });
  }
  return rows;
});
jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: { listing: { findMany: (...a: unknown[]) => findManyMock(...(a as [Record<string, unknown>])) } },
}));

// Trestle auth: rejects fast — its CALL COUNT is our per-building assembly
// counter (each buildBuildingPayload execution calls it exactly once).
const tokenMock = jest.fn(async () => {
  throw new Error("no trestle in tests");
});
jest.mock("@/lib/idx/auth", () => ({ getAccessToken: () => tokenMock() }));

jest.mock("@/lib/buildings/acris-building-sales", () => ({
  lookupBBL: jest.fn(async () => null),
  fetchAcrisSales: jest.fn(async () => []),
  boroughFromPostalCode: jest.fn(() => null),
}));

const { getBuildingDataCached } = require("@/lib/buildings/public-building-data");
const { revalidateTag } = require("next/cache");
const { buildingCacheTag, buildingTagFromAddress } = require("@/lib/cache/public-cache");

/** 100 DISTINCT building identities spread across street-number shards 1-9. */
const CRAWL: Array<{ streetNumber: string; streetName: string; postalCode: string }> = [];
for (let i = 0; i < 100; i++) {
  const num = String(100 + i); // shard '1' … but vary leading digit:
  const spread = String(((i % 9) + 1)) + num.slice(1); // leading 1..9
  CRAWL.push({
    streetNumber: spread,
    streetName: `${spread}th Street Test`,
    postalCode: "10128",
  });
}

async function crawlAll() {
  for (const b of CRAWL) {
    const payload = await getBuildingDataCached({ ...b, buildingName: null });
    expect(payload.success).toBe(true);
  }
}

describe("distinct-building crawl — bounded Neon, exact invalidation", () => {
  it("BEHAVIORAL: 100 DISTINCT buildings perform ≤10 Neon queries (shard bound), never one per building", async () => {
    await crawlAll();
    expect(tokenMock.mock.calls.length).toBe(100); // each building assembled once
    expect(findManyMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(findManyMock.mock.calls.length).toBeLessThanOrEqual(10); // ≤ shard count — NOT 100
  });

  it("BEHAVIORAL: re-crawling all 100 performs ZERO additional Neon queries and ZERO re-assembly", async () => {
    const q = findManyMock.mock.calls.length;
    const t = tokenMock.mock.calls.length;
    await crawlAll();
    expect(findManyMock.mock.calls.length).toBe(q);
    expect(tokenMock.mock.calls.length).toBe(t);
  });

  it("BEHAVIORAL: a sync's coarse `search` revalidation does NOT expire building payloads — the crawler wake pattern cannot recur", async () => {
    const t = tokenMock.mock.calls.length;
    const q = findManyMock.mock.calls.length;
    revalidateTag("search"); // what every changed sync run bumps
    await crawlAll();
    // building entries survived: zero re-assembly of any of the 100
    expect(tokenMock.mock.calls.length).toBe(t);
    // EVEN STRONGER than the shard bound: since no building payload expired,
    // nothing consults the (now-expired) manifest at all — ZERO Neon queries.
    // The manifest refills lazily, only when some building actually
    // re-assembles (next test), and then still ≤ once per shard.
    expect(findManyMock.mock.calls.length - q).toBe(0);
  });

  it("BEHAVIORAL: revalidating ONE building's exact tag re-assembles ONLY that building (one bounded shard refill)", async () => {
    const target = CRAWL[7];
    const t = tokenMock.mock.calls.length;
    const q = findManyMock.mock.calls.length;
    revalidateTag(buildingCacheTag(target.streetNumber, target.streetName, target.postalCode));
    await crawlAll();
    expect(tokenMock.mock.calls.length).toBe(t + 1); // exactly one rebuild
    // that rebuild refills at most ITS shard of the manifest (which the
    // previous test's `search` bump had expired) — never 100 queries
    expect(findManyMock.mock.calls.length - q).toBeLessThanOrEqual(1);
  });

  it("BEHAVIORAL: buildingName variants do NOT mint separate cache identities for the same canonical building", async () => {
    const t = tokenMock.mock.calls.length;
    const q = findManyMock.mock.calls.length;
    const base = { streetNumber: "555", streetName: "555th Street Test", postalCode: "10128" };
    const p1 = await getBuildingDataCached({ ...base, buildingName: null });
    const p2 = await getBuildingDataCached({ ...base, buildingName: "The Grand Test" });
    const p3 = await getBuildingDataCached({ ...base, buildingName: "GRAND TEST TOWER" });
    // ONE assembly total — bn= variants share the canonical entry
    expect(tokenMock.mock.calls.length).toBe(t + 1);
    expect(findManyMock.mock.calls.length - q).toBeLessThanOrEqual(1);
    // the display decoration still works, POST-cache
    expect(p1.success).toBe(true);
    expect(p2.building.name).toBe("The Grand Test");
    expect(p3.building.name).toBe("GRAND TEST TOWER");
  });

  it("tag canon: link-side, raw-stored, and sync-side derivations produce the SAME tag", () => {
    const linkSide = buildingCacheTag("400", "East 90th Street", "10128");
    const rawStored = buildingCacheTag("400", "EAST 90TH STREET", "10128");
    const variant = buildingCacheTag("400", "E 90th St", "10128");
    const syncSide = buildingTagFromAddress({
      StreetNumber: "400",
      StreetName: "EAST 90TH STREET",
      PostalCode: "10128",
    });
    expect(rawStored).toBe(linkSide);
    expect(variant).toBe(linkSide);
    expect(syncSide).toBe(linkSide);
    // masked addresses never form a tag
    expect(buildingTagFromAddress({ StreetNumber: "", StreetName: "X" })).toBeNull();
    expect(buildingTagFromAddress({ StreetNumber: "1", StreetName: "Address Undisclosed" })).toBeNull();
  });

  it("SOURCE: per-building entries carry ONLY the exact building tag (no coarse search tag)", () => {
    const lib = read("lib/buildings/public-building-data.ts");
    const site = lib.match(/tags: \[buildingCacheTag\([^\]]*\]/);
    expect(site).not.toBeNull();
    expect(site![0]).not.toContain("SEARCH_CACHE_TAG");
  });

  it("SOURCE: sync derives EXACT building tags at every mapped listing-change site", () => {
    const sync = read("lib/idx/sync.ts");
    const count = (sync.match(/buildingTagFromAddress\(mapped\.address\)/g) ?? []).length;
    expect(count).toBe(3); // listing upsert, projection, full-sync clock path
  });
});
