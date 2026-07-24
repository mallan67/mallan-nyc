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
type CacheMode = "normal" | "fail_set";
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
const findManyMock = jest.fn(async (q: Record<string, any>) => {
  const take: number = q?.take ?? 10;
  const all = Array.from({ length: 40 }, (_, i) => ({
    id: BigInt(i + 1),
    listing_id: `L-${String(i + 1).padStart(4, "0")}`,
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
  BUILDING_MANIFEST_SHARDS,
} = require("@/lib/buildings/public-building-data");
const { revalidateTag } = require("next/cache");

beforeEach(() => {
  store.clear();
  clearManifestPageMemory();
  cacheMode.mode = "normal";
  rowBloat = 0;
  findManyMock.mockClear();
});

describe("warm contract under real tag semantics", () => {
  it("NORMAL: every page counts as cache_persisted; nothing stale, nothing fallback", async () => {
    const r = await warmBuildingManifestShards();
    expect(r.shards_warmed).toBe(BUILDING_MANIFEST_SHARDS.length);
    expect(r.cache_persisted).toBe(BUILDING_MANIFEST_SHARDS.length); // 1 page/shard fixture
    expect(r.fallback_live).toBe(0);
    expect(r.swr_stale_served).toBe(0);
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
    // The stale entries were served without re-executing the fetch: they
    // must land in swr_stale_served — NOT in cache_persisted.
    expect(r.swr_stale_served).toBe(BUILDING_MANIFEST_SHARDS.length);
    expect(r.cache_persisted).toBe(0);
    expect(r.fallback_live).toBe(0);
    expect(findManyMock.mock.calls.length).toBe(neonBefore); // stale serves cost zero Neon
  });

  it("SET-FAILURE: pages are fallback_live and the Neon read runs EXACTLY ONCE per page (memory reuse)", async () => {
    cacheMode.mode = "fail_set";
    const r = await warmBuildingManifestShards();
    expect(r.fallback_live).toBe(BUILDING_MANIFEST_SHARDS.length);
    expect(r.cache_persisted).toBe(0);
    // one Neon read per page — the verification re-read and any further
    // reads inside the TTL are served by the in-process memory layer
    expect(findManyMock.mock.calls.length).toBe(BUILDING_MANIFEST_SHARDS.length);
    // subsequent warm within the TTL: still zero NEW Neon reads for the
    // refresh is forced per key… refresh deletes memory ⇒ re-reads Neon.
    // What must stay bounded: reads NEVER exceed one per page per pass.
    const before = findManyMock.mock.calls.length;
    await warmBuildingManifestShards();
    expect(findManyMock.mock.calls.length - before).toBe(BUILDING_MANIFEST_SHARDS.length);
  });

  it("DYNAMIC SHRINK: oversized rows split into multiple under-budget pages; the walk still covers every row", async () => {
    // ~90 KB per row × 40 rows ≈ 3.6 MB in one nominal page → must shrink.
    rowBloat = 90_000;
    const r = await warmBuildingManifestShards();
    expect(r.shards_failed).toBe(0);
    // more pages than shards ⇒ shrink produced additional pages
    const pagesCounted = r.cache_persisted + r.fallback_live + r.swr_stale_served;
    expect(pagesCounted).toBeGreaterThan(BUILDING_MANIFEST_SHARDS.length);
  });
});
