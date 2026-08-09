/**
 * WARM-CONTRACT BEHAVIOR under real Next 16 cache semantics (Maya
 * corrections on PR #560 + the 2026-07-24 follow-up directive).
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
 * Scope-A/B proofs (Maya directive 2026-07-24 — "Warm should perform one
 * read per page… Not by rereading inside the request that invalidated the
 * tag"; "if records changed only in shards 1, 4, and 7, do not query the
 * other six"):
 *   1. Warm performs EXACTLY ONE Neon read per page filled — the
 *      same-request verification re-read is GONE, in every cache mode.
 *   2. Warm is TARGETED: only the requested shards are touched; an empty
 *      shard set performs zero reads.
 *   3. Persistence is verified by probeManifestPersistence — a first-page
 *      read per shard in a LATER request (before that request revalidates
 *      anything): a persisted entry probes as cache_hits with zero Neon; a
 *      lost entry probes as live_fills (one bounded read that itself
 *      refills the page).
 *   4. An old SWR-stale page served without executing is never counted as
 *      a fill.
 *   5. Dynamic shrink: a page whose rows serialize over the byte budget
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
  probeManifestPersistence,
  clearManifestPageMemory,
  getBuildingManifestShard,
  BUILDING_MANIFEST_SHARDS,
} = require("@/lib/buildings/public-building-data");
const { safeRevalidateTags, manifestShardTag } = require("@/lib/cache/public-cache");
const { revalidateTag } = require("next/cache");

beforeEach(() => {
  store.clear();
  clearManifestPageMemory();
  cacheMode.mode = "normal";
  rowBloat = 0;
  poolSize = 40;
  findManyMock.mockClear();
});

describe("warm contract — single read per page, targeted shards", () => {
  it("NORMAL: cold warm fills every page with EXACTLY ONE Neon read each; re-warm is all hits with zero reads", async () => {
    const r = await warmBuildingManifestShards();
    expect(r.shards_requested).toBe(BUILDING_MANIFEST_SHARDS.length);
    expect(r.shards_warmed).toBe(BUILDING_MANIFEST_SHARDS.length);
    expect(r.pages_filled).toBe(BUILDING_MANIFEST_SHARDS.length); // 1 page/shard fixture
    expect(r.cache_hit_existing).toBe(0);
    // Scope A acceptance: at most one Neon query per page actually warmed.
    expect(findManyMock.mock.calls.length).toBe(BUILDING_MANIFEST_SHARDS.length);
    // second warm: entries are valid pre-existing → hits, zero fresh work
    const neonBefore = findManyMock.mock.calls.length;
    const r2 = await warmBuildingManifestShards();
    expect(r2.cache_hit_existing).toBe(BUILDING_MANIFEST_SHARDS.length);
    expect(r2.pages_filled).toBe(0);
    expect(findManyMock.mock.calls.length).toBe(neonBefore);
  });

  it("TARGETED (scope B): only the requested shards are walked; the empty set performs ZERO reads", async () => {
    const r = await warmBuildingManifestShards(["7", "4", "7"]); // dedupes
    expect(r.shards_requested).toBe(2);
    expect(r.shards_warmed).toBe(2);
    expect(r.pages_filled).toBe(2);
    expect(findManyMock.mock.calls.length).toBe(2);
    const rEmpty = await warmBuildingManifestShards([]);
    expect(rEmpty).toEqual({
      shards_requested: 0,
      shards_warmed: 0,
      shards_failed: 0,
      pages_filled: 0,
      cache_hit_existing: 0,
      duration_ms: expect.any(Number),
    });
    expect(findManyMock.mock.calls.length).toBe(2); // unchanged — zero Neon
  });

  it("SWR: an OLD tagged page served stale costs zero Neon and is NEVER counted as a fill", async () => {
    await warmBuildingManifestShards();
    clearManifestPageMemory(); // memory would otherwise mask the cache layer
    (revalidateTag as jest.Mock)("building-manifest", "max"); // SWR — old values survive
    await new Promise((resolve) => setTimeout(resolve, 5));
    const neonBefore = findManyMock.mock.calls.length;
    const r = await warmBuildingManifestShards();
    expect(r.cache_hit_existing).toBe(BUILDING_MANIFEST_SHARDS.length);
    expect(r.pages_filled).toBe(0);
    expect(findManyMock.mock.calls.length).toBe(neonBefore); // stale serves cost zero Neon
  });

  it("SET-FAILURE: NO same-request verification re-read (exactly one read per page); the NEXT-request probe reports the loss as live_fills", async () => {
    cacheMode.mode = "fail_set";
    const r = await warmBuildingManifestShards();
    // Scope A: the warm itself no longer re-reads to verify — one read per
    // page, in EVERY cache mode. It cannot (and does not claim to) know
    // whether the SET persisted.
    expect(r.pages_filled).toBe(BUILDING_MANIFEST_SHARDS.length);
    expect(findManyMock.mock.calls.length).toBe(BUILDING_MANIFEST_SHARDS.length);
    // The next request's probe is the honest instrument: nothing persisted,
    // so every first-page probe re-executes (one bounded read each, which
    // itself refills the page when the store recovers).
    const neonBefore = findManyMock.mock.calls.length;
    const probe = await probeManifestPersistence();
    expect(probe.live_fills).toBe(BUILDING_MANIFEST_SHARDS.length);
    expect(probe.cache_hits).toBe(0);
    expect(findManyMock.mock.calls.length).toBe(neonBefore + BUILDING_MANIFEST_SHARDS.length);
  });

  it("PRODUCTION SHAPE (Maya #561 review): previous run warmed ONLY shard 4; a GLOBAL purge follows; the scoped canary touches shard 4 only — shards 1-3 and 5-9 execute ZERO queries", async () => {
    // Previous run: targeted warm of shard 4 only.
    const r = await warmBuildingManifestShards(["4"]);
    expect(r.pages_filled).toBe(1);
    // Every manifest entry receives the global invalidation (full purge —
    // the worst case that made an all-shard canary recreate broad reads).
    (revalidateTag as jest.Mock)("building-manifest"); // profile-less → immediate
    const neonBefore = findManyMock.mock.calls.length;
    // Next run's canary probes ONLY the previously warmed set.
    const probe = await probeManifestPersistence(["4"]);
    expect(probe.shards_probed).toBe(1);
    expect(probe.live_fills).toBe(1); // the purge is honestly reported…
    expect(probe.cache_hits).toBe(0);
    // …at the cost of exactly ONE bounded read. The other eight shard
    // classes are NEVER queried.
    expect(findManyMock.mock.calls.length).toBe(neonBefore + 1);
    const probedShards = findManyMock.mock.calls
      .slice(neonBefore)
      // SHAPE-based, not positional. This read `AND.at(-1)`, which silently
      // returned undefined the moment another gate clause was appended after the
      // shard selector. Find the address clause by its shape instead.
      .map((c) =>
        (c[0]?.where?.AND ?? []).find(
          (x: { address?: { string_starts_with?: string } }) => x?.address?.string_starts_with !== undefined,
        )?.address?.string_starts_with,
      );
    expect(probedShards).toEqual(["4"]);
  });

  it("PER-SHARD INVALIDATION (Maya #561 review): a shard-4 change invalidates and refills shard 4 while cached shard 7 stays a HIT", async () => {
    // All shards cached (e.g. from lazy traffic).
    await warmBuildingManifestShards();
    // A price change in shard 4: the writer revalidates ONLY that shard's
    // manifest tag (plus its building/listing tags — irrelevant here).
    (revalidateTag as jest.Mock)(manifestShardTag("4")); // profile-less → immediate
    const neonBefore = findManyMock.mock.calls.length;
    const r = await warmBuildingManifestShards(["4"]);
    expect(r.pages_filled).toBe(1); // shard 4 refilled — one read
    expect(findManyMock.mock.calls.length).toBe(neonBefore + 1);
    // Shard 7 SURVIVED the shard-4 invalidation: reading it is a pure
    // cache hit — zero further Neon queries.
    const rows = await getBuildingManifestShard("7");
    expect(rows.length).toBe(40);
    expect(findManyMock.mock.calls.length).toBe(neonBefore + 1);
  });

  it("PROBE: a persisted warm probes as cache_hits with ZERO Neon; immediate invalidation probes as live_fills (one read each)", async () => {
    await warmBuildingManifestShards();
    const neonBefore = findManyMock.mock.calls.length;
    const persisted = await probeManifestPersistence();
    expect(persisted.shards_probed).toBe(BUILDING_MANIFEST_SHARDS.length);
    expect(persisted.cache_hits).toBe(BUILDING_MANIFEST_SHARDS.length);
    expect(persisted.live_fills).toBe(0);
    expect(persisted.failed).toBe(0);
    expect(findManyMock.mock.calls.length).toBe(neonBefore); // zero Neon on full persistence
    (revalidateTag as jest.Mock)("building-manifest"); // profile-less → immediate expiration
    const lost = await probeManifestPersistence(["7", "4"]);
    expect(lost.shards_probed).toBe(2);
    expect(lost.live_fills).toBe(2);
    expect(lost.cache_hits).toBe(0);
    expect(findManyMock.mock.calls.length).toBe(neonBefore + 2);
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
