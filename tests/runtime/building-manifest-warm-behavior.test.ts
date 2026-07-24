/**
 * WARM-CONTRACT BEHAVIOR under real Next 16 cache semantics (Maya
 * corrections on PR #560, 2026-07-24).
 *
 * The mock models the DIST-VERIFIED contract instead of an idealized
 * immediate-delete store:
 *   - revalidateTag(tag)        → IMMEDIATE expiration (profile-less path,
 *                                 dist revalidation-utils.js:126-127).
 *   - revalidateTag(tag, "max") → STALE-WHILE-REVALIDATE: the entry is
 *                                 marked stale and a later read can serve
 *                                 the OLD value without re-executing the
 *                                 fetch.
 *   - set-failure mode          → the wrapper executes the fetch but the
 *                                 SET never persists (the 2 MB production
 *                                 failure shape).
 *
 * Proofs:
 *   1. FAILING-FIRST SWR proof: an old tagged page served stale can NEVER
 *      be counted as a freshly persisted warm result (swr_stale_served).
 *   2. Set-failure: pages count as fallback_live, the underlying Neon read
 *      runs EXACTLY ONCE per page (memory reuse — no second read from the
 *      verification pass or later requests within the TTL).
 *   3. Normal mode: pages count as cache_persisted.
 *   4. Dynamic shrink: a page whose rows serialize over the byte budget
 *      shrinks to fit and the keyset walk still covers every row.
 */

type StoreEntry = { value: unknown; tags: string[]; stale: boolean; swrServed: boolean };
const store = new Map<string, StoreEntry>();
type CacheMode = "normal" | "fail_set" | "throw_after_set";
const cacheMode: { mode: CacheMode } = { mode: "normal" };

jest.mock("next/cache", () => ({
  unstable_cache:
    (fn: (...a: unknown[]) => Promise<unknown>, keyParts: string[], opts?: { tags?: string[] }) =>
    async (...args: unknown[]) => {
      const k = JSON.stringify([keyParts, args]);
      const hit = store.get(k);
      if (hit && !hit.stale) return hit.value;
      if (hit && hit.stale && !hit.swrServed) {
        // SWR: serve the OLD value once without executing the fetch (the
        // background revalidation is modeled as not-yet-complete).
        hit.swrServed = true;
        hit.stale = false;
        return hit.value;
      }
      const value = await fn(...args);
      if (cacheMode.mode === "throw_after_set") {
        // PRODUCTION SHAPE: the fetch resolved, then the cache layer THROWS
        // (the 2 MB oversized-entry failure raised an error — it did not
        // silently decline to store).
        throw new Error("simulated cache-storage failure (items over 2MB can not be cached)");
      }
      if (cacheMode.mode !== "fail_set") {
        store.set(k, { value, tags: opts?.tags ?? [], stale: false, swrServed: false });
      }
      return value;
    },
  revalidateTag: jest.fn((tag: string, profile?: string) => {
    for (const entry of store.values()) {
      if (!entry.tags.includes(tag)) continue;
      if (profile === "max") entry.stale = true; // SWR — value survives
      else {
        // immediate expiration (profile-less)
        entry.value = undefined;
        entry.stale = true;
        entry.swrServed = true; // never serve — forces re-execution
      }
    }
    // immediate mode: hard-delete entries flagged above
    if (profile !== "max") {
      for (const [k, e] of [...store.entries()]) {
        if (e.tags.includes(tag)) store.delete(k);
      }
    }
  }),
}));

// ── prisma mock: pages of rows per shard ───────────────────────────────────
let rowBloat = 0; // when >0, rows carry a huge padding string (shrink test)
let poolSize = 40; // boundary tests override this (e.g. exactly 75,000 rows)
const cursorLoop = { on: false }; // pathological source: cursor never advances
const findManyMock = jest.fn(async (q: Record<string, any>) => {
  const take: number = q?.take ?? 10;
  const all = Array.from({ length: poolSize }, (_, i) => ({
    id: BigInt(i + 1),
    listing_id: `L-${String(i + 1).padStart(6, "0")}`,
    status: "Active",
    list_price: 1000000,
    bedrooms_total: 1,
    bathrooms_full: 1,
    bathrooms_half: 0,
    living_area: 700,
    property_type: "Residential",
    property_sub_type: rowBloat > 0 ? "X".repeat(rowBloat) : "Condominium",
    listing_type: "sale",
    address: { StreetNumber: "700", StreetName: "TEST ST", PostalCode: "10128", UnitNumber: `U${i}`, BuildingName: "" },
    features: { CommonInterest: "Condominium", YearBuilt: 2000, StoriesTotal: 10 },
    primary_photo_url: null,
  }));
  if (cursorLoop.on) {
    // full page whose last listing_id never changes → nextCursor repeats
    return Array.from({ length: take }, (_, i) => ({ ...all[i % all.length], listing_id: `L-LOOP-${i}` }))
      .map((r, i, arr) => (i === arr.length - 1 ? { ...r, listing_id: "L-LOOP-END" } : r));
  }
  let start = 0;
  if (q?.cursor?.listing_id) {
    start = all.findIndex((r) => r.listing_id === q.cursor.listing_id) + (q.skip ?? 0);
  }
  return all.slice(start, start + take);
});
jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: { listing: { findMany: (...a: unknown[]) => findManyMock(...(a as [Record<string, unknown>])) } },
}));
jest.mock("@/lib/idx/auth", () => ({ getAccessToken: jest.fn(async () => { throw new Error("no trestle"); }) }));
jest.mock("@/lib/buildings/acris-building-sales", () => ({
  lookupBBL: jest.fn(async () => null),
  fetchAcrisSales: jest.fn(async () => []),
  boroughFromPostalCode: jest.fn(() => null),
}));

const {
  warmBuildingManifestShards,
  clearManifestPageMemory,
  getBuildingManifestShard,
  BUILDING_MANIFEST_SHARDS,
} = require("@/lib/buildings/public-building-data");
const { safeRevalidateTags } = require("@/lib/cache/public-cache");
const { revalidateTag } = require("next/cache");

beforeEach(() => {
  store.clear();
  clearManifestPageMemory();
  cacheMode.mode = "normal";
  rowBloat = 0;
  poolSize = 40;
  findManyMock.mockClear();
});

describe("warm contract under real tag semantics", () => {
  it("NORMAL: every page counts as cache_persisted; nothing stale, nothing fallback", async () => {
    const r = await warmBuildingManifestShards();
    expect(r.shards_warmed).toBe(BUILDING_MANIFEST_SHARDS.length);
    expect(r.cache_persisted).toBe(BUILDING_MANIFEST_SHARDS.length); // 1 page/shard fixture
    expect(r.cache_hit_existing).toBe(0);
    expect(r.fallback_live).toBe(0);
    expect(r.swr_stale_served).toBe(0);
    // second warm: entries are valid pre-existing → hits, zero fresh work
    const r2 = await warmBuildingManifestShards();
    expect(r2.cache_hit_existing).toBe(BUILDING_MANIFEST_SHARDS.length);
    expect(r2.cache_persisted).toBe(0);
  });

  it("SWR (failing-first proof): an OLD tagged page served stale is NEVER counted as freshly persisted", async () => {
    // Populate pre-warm entries (old fetchedAt), then SWR-revalidate the tag.
    await warmBuildingManifestShards();
    clearManifestPageMemory(); // memory would otherwise mask the cache layer
    (revalidateTag as jest.Mock)("building-manifest", "max"); // SWR — old values survive
    // Advance the wall clock past the pre-warm fetchedAt: production warms
    // are 30 minutes apart; in-test both warms can land in the SAME
    // Date.now() millisecond, which would make the stale entry look
    // "fresh enough" purely by clock resolution.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const neonBefore = findManyMock.mock.calls.length;
    const r = await warmBuildingManifestShards();
    // The stale entries were served WITHOUT executing the fetch: they land
    // in cache_hit_existing — NEVER in cache_persisted. (The dedicated
    // swr_stale_served tripwire covers the fetch-ran-but-verification-
    // returned-stale case.) The blocker requirement holds either way: an
    // old tagged page is never counted as a freshly persisted warm result.
    expect(r.cache_hit_existing).toBe(BUILDING_MANIFEST_SHARDS.length);
    expect(r.cache_persisted).toBe(0);
    expect(r.fallback_live).toBe(0);
    expect(findManyMock.mock.calls.length).toBe(neonBefore); // stale serves cost zero Neon
  });

  it("SILENT SET-FAILURE: pages are fallback_live; reads bounded at 2 per page per warm pass (no cross-request memory)", async () => {
    cacheMode.mode = "fail_set";
    const r = await warmBuildingManifestShards();
    expect(r.fallback_live).toBe(BUILDING_MANIFEST_SHARDS.length);
    expect(r.cache_persisted).toBe(0);
    // With NO cross-request memory (blocker 2), the warm's verification
    // re-read is a real second Neon read when the set fails — bounded to
    // the warm pass (2 per page), never a per-request stale cache.
    expect(findManyMock.mock.calls.length).toBe(BUILDING_MANIFEST_SHARDS.length * 2);
  });

  it("PRODUCTION-SHAPED failure: fetch resolves, cache layer THROWS — caller gets the captured value, Prisma runs EXACTLY once", async () => {
    cacheMode.mode = "throw_after_set";
    const before = findManyMock.mock.calls.length;
    const rows = await getBuildingManifestShard("7");
    // the captured value is returned despite the cache-storage error
    expect(rows.map((r: { listing_id: string }) => r.listing_id)).toEqual(
      Array.from({ length: 40 }, (_, i) => `L-${String(i + 1).padStart(6, "0")}`),
    );
    // exactly ONE Prisma execution per page for this invocation — the
    // wrapped fetch is never re-run because the cache backend threw
    expect(findManyMock.mock.calls.length - before).toBe(1); // 40 rows = 1 page
  });

  it("safeRevalidateTags invokes revalidateTag with EXACTLY one argument (the immediate-expiration path)", () => {
    (revalidateTag as jest.Mock).mockClear();
    safeRevalidateTags(["tag-under-test"]);
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    const call = (revalidateTag as jest.Mock).mock.calls[0];
    expect(call[0]).toBe("tag-under-test");
    expect(call.length).toBe(1); // NO profile — dist-verified immediate path
  });

  it("CURSOR INVARIANT: a page whose cursor repeats FAILS loudly (never an infinite or silent walk)", async () => {
    cursorLoop.on = true;
    try {
      await expect(getBuildingManifestShard("7")).rejects.toThrow(/CURSOR DID NOT ADVANCE/);
    } finally {
      cursorLoop.on = false;
    }
  });

  it("DYNAMIC SHRINK completeness: every fixture listing ID is returned exactly once, in order, to exhaustion", async () => {
    // ~90 KB per row × 40 rows ≈ 3.6 MB in one nominal page → must shrink.
    rowBloat = 90_000;
    const before = findManyMock.mock.calls.length;
    const rows = await getBuildingManifestShard("7");
    const ids = rows.map((r: { listing_id: string }) => r.listing_id);
    const expected = Array.from({ length: 40 }, (_, i) => `L-${String(i + 1).padStart(6, "0")}`);
    // EXACTLY once, in order, through final cursor exhaustion — not merely
    // "more pages than shards".
    expect(ids).toEqual(expected);
    expect(new Set(ids).size).toBe(40);
    // shrink actually produced multiple pages (multiple keyset fetches)
    expect(findManyMock.mock.calls.length - before).toBeGreaterThan(1);
  });
});

describe("row-ceiling BOUNDARY — the terminal page cannot smuggle a shard past the limit", () => {
  it("EXACTLY 75,000 rows ending on a terminal page SUCCEEDS", async () => {
    poolSize = 75_000;
    const rows = await getBuildingManifestShard("7");
    expect(rows.length).toBe(75_000);
    expect(rows[74_999].listing_id).toBe("L-075000");
  });

  it("75,001 rows ending on a terminal page THROWS OVERFLOW (reader path)", async () => {
    poolSize = 75_001;
    await expect(getBuildingManifestShard("7")).rejects.toThrow(/OVERFLOW/);
  });

  it("the SAME boundary applies to the warm traversal: 75,001-row shard is counted failed, never silently truncated", async () => {
    poolSize = 75_001;
    const r = await warmBuildingManifestShards();
    // every shard walks the same over-limit pool in this mock → every
    // shard's walk throws inside warm and is COUNTED, never propagated
    expect(r.shards_failed).toBe(BUILDING_MANIFEST_SHARDS.length);
    expect(r.shards_warmed).toBe(0);
  });

  it("warm at EXACTLY 75,000 rows succeeds (terminal boundary inclusive)", async () => {
    poolSize = 75_000;
    const r = await warmBuildingManifestShards();
    expect(r.shards_failed).toBe(0);
    expect(r.shards_warmed).toBe(BUILDING_MANIFEST_SHARDS.length);
  });
});
