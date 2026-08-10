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
// The mock answers the SHARD query (string_starts_with on StreetNumber) with
// FULL keyset-pagination semantics (orderBy listing_id, cursor+skip, take) so
// the pagination/overflow/warm behaviors are exercised for real.
const FAIL_SHARDS = new Set<string>(); // warm failure-isolation injection
const REMOVED_STREETS = new Set<string>(); // writer-eviction simulation (listing left the gated set)
const OVERFLOW9 = { on: false, counter: 0 }; // shard '9' never-short pages → overflow
function mkRow(num: string, idx: number) {
  return {
    id: `dbid-${num}-${idx}`,
    listing_id: `L-${num}-${String(idx).padStart(5, "0")}`,
    status: "Active",
    list_price: 1000000 + idx,
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
      UnitNumber: `${idx}A`,
      BuildingName: "",
    },
    features: { CommonInterest: "Condominium", YearBuilt: 1990, StoriesTotal: 10 },
    media: [],
  };
}
function shardRows(shard: string) {
  const rows: Array<ReturnType<typeof mkRow>> = [];
  for (let i = 0; i < 200; i++) {
    const num = String(100 + i);
    if (num.startsWith(shard) && !REMOVED_STREETS.has(num)) rows.push(mkRow(num, 0));
  }
  // shard '8' carries 6,500 rows on ONE street — above the 1,500-row page
  // size (2 MB-safe cache pages), so its fill takes FIVE keyset pages.
  if (shard === "8") {
    for (let i = 1; i <= 6500; i++) rows.push(mkRow("888", i));
  }
  return rows.sort((a, b) => (a.listing_id < b.listing_id ? -1 : 1));
}
const findManyMock = jest.fn(async (q: Record<string, any>) => {
  const cond = (q?.where?.AND ?? []).find(
    (c: Record<string, any>) => c?.address?.string_starts_with,
  );
  const shard: string = cond?.address?.string_starts_with ?? "";
  if (FAIL_SHARDS.has(shard)) throw new Error("simulated Neon outage for warm test");
  const take: number = q?.take ?? 100000;
  if (shard === "9" && OVERFLOW9.on) {
    // pathological source that never returns a short page — ids ADVANCE
    // forever so the walk hits the TOTAL-ROW ceiling (not the cursor-repeat
    // invariant, which has its own test in the warm-behavior suite)
    return Array.from({ length: take }, () => mkRow("999", OVERFLOW9.counter++));
  }
  const all = shardRows(shard);
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

const { getBuildingDataCached, clearManifestPageMemory } = require("@/lib/buildings/public-building-data");
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
  it("BEHAVIORAL: 100 DISTINCT buildings perform ≤13 Neon queries (page bound), never one per building", async () => {
    await crawlAll();
    expect(tokenMock.mock.calls.length).toBe(100); // each building assembled once
    expect(findManyMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(findManyMock.mock.calls.length).toBeLessThanOrEqual(13); // ≤ total page count — NOT 100
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
    // previous test's `search` bump had expired) — never 100 queries.
    // CRAWL[7] lives on shard 8, whose fill takes FIVE keyset pages (6,501
    // rows > the 1,500-row page size) — still one bounded shard, not per-building.
    expect(findManyMock.mock.calls.length - q).toBeLessThanOrEqual(5);
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
    // UPDATED 2026-08-07 (commit 7B-2A): the three inlined copies of this
    // computation were replaced by ONE owner
    // (lib/cache/public-listing-change-tags.ts) that every site delegates to via
    // `recordPublicListingChange`. Counting literal `buildingInvalidationTags(`
    // calls pinned the implementation shape; it also could not detect that the
    // full-sync copy expired shard tags without ever recording them for warming.
    // Each site still passes an OLD and a NEW address, which is the invariant.
    const incr = (sync.match(/existing\?\.address,[\s\S]{0,40}?mapped\.address,/g) || []).length;
    const clock = (sync.match(/existingForClock\?\.address,[\s\S]{0,40}?mapped\.address,/g) || []).length;
    expect(incr).toBe(2); // listing upsert + projection
    expect(clock).toBe(1); // full-sync/agent-history clock path
    expect(sync).not.toMatch(/buildingInvalidationTags\(/); // no re-inlining
  });
});

// ─── Manifest completeness + wake clustering (building-only PR additions) ──

describe("manifest completeness — keyset pagination, explicit overflow", () => {
  it("BEHAVIORAL: a shard ABOVE the 1,500-row cache-page size fills COMPLETELY in exactly five keyset pages", async () => {
    const before = findManyMock.mock.calls.length;
    // street 888 carries 6,501 rows — crawled earlier, so shard 8 is cached;
    // force a fresh fill to observe the pagination itself
    revalidateTag("building-manifest");
    clearManifestPageMemory();
    revalidateTag("search");
    // the payload entry itself is cached from the earlier crawl — expire ITS
    // exact tag so the assembly (and therefore the shard fill) re-runs
    revalidateTag(buildingCacheTag("888", "888th Street Test", "10128"));
    const payload = await getBuildingDataCached({
      streetNumber: "888", streetName: "888th Street Test", postalCode: "10128", buildingName: null,
    });
    expect(payload.success).toBe(true);
    const shard8Calls = findManyMock.mock.calls.slice(before).filter((c) => {
      const conds = (c[0] as Record<string, any>)?.where?.AND ?? [];
      return conds.some((x: Record<string, any>) => x?.address?.string_starts_with === "8");
    });
    expect(shard8Calls.length).toBe(5); // 1,500 ×4 + remainder — run to exhaustion
    const second = shard8Calls[1][0] as Record<string, any>;
    expect(second.cursor?.listing_id).toBeDefined(); // keyset, not offset
    // completeness: the DB layer saw ALL 6,501 rows (payload caps display at
    // 50 by the ORIGINAL slice — same as production — but stats.totalActive
    // counts the merged active set, which includes the DB slice only; the
    // proof of completeness is the two-page exhaustion above)
  });

  it("BEHAVIORAL: pathological never-short shard THROWS an explicit OVERFLOW — never a silently truncated payload", async () => {
    OVERFLOW9.on = true;
    revalidateTag("building-manifest");
    clearManifestPageMemory();
    revalidateTag("search");
    try {
      await expect(
        getBuildingDataCached({ streetNumber: "901", streetName: "901th Street Test", postalCode: "10128", buildingName: null }),
      ).rejects.toThrow(/OVERFLOW/);
    } finally {
      OVERFLOW9.on = false;
      revalidateTag("building-manifest");
    clearManifestPageMemory();
      revalidateTag("search");
    }
  });
});

describe("wake clustering — sync-driven manifest warm-up", () => {
  const { warmBuildingManifestShards, BUILDING_MANIFEST_SHARDS } =
    require("@/lib/buildings/public-building-data");

  it("BEHAVIORAL: one warm-up fills EVERY shard while awake; a second warm-up is all cache hits (zero Neon)", async () => {
    revalidateTag("building-manifest");
    clearManifestPageMemory();
    revalidateTag("search");
    const before = findManyMock.mock.calls.length;
    const r1 = await warmBuildingManifestShards();
    expect(r1.shards_warmed).toBe(BUILDING_MANIFEST_SHARDS.length);
    expect(r1.shards_failed).toBe(0);
    const coldCalls = findManyMock.mock.calls.length - before;
    expect(coldCalls).toBeGreaterThanOrEqual(BUILDING_MANIFEST_SHARDS.length); // ≥1 page per shard
    expect(coldCalls).toBeLessThanOrEqual(BUILDING_MANIFEST_SHARDS.length + 4); // shard 8 = 5 pages
    // Scope A (2026-07-24): every executed page is exactly ONE Neon read —
    // pages_filled equals the cold-call count (no verification re-read).
    expect(r1.pages_filled).toBe(coldCalls);
    expect(r1.cache_hit_existing).toBe(0);
    const r2 = await warmBuildingManifestShards();
    expect(r2.shards_warmed).toBe(BUILDING_MANIFEST_SHARDS.length);
    expect(findManyMock.mock.calls.length - before).toBe(coldCalls); // second warm: ZERO new queries
  });

  it("BEHAVIORAL: after a warm-up, a distinct-building crawl performs ZERO Neon queries (fills clustered into the wake window)", async () => {
    const q = findManyMock.mock.calls.length;
    const t0 = tokenMock.mock.calls.length;
    // fresh building identities so every payload entry is a cold MISS —
    // yet the DB layer is already warm from the previous test
    for (let i = 0; i < 20; i++) {
      const num = String(110 + i);
      const p = await getBuildingDataCached({ streetNumber: num, streetName: num + "th Street Warmtest", postalCode: "10128", buildingName: null });
      expect(p.success).toBe(true);
    }
    expect(tokenMock.mock.calls.length).toBe(t0 + 20); // assemblies ran (cold entries)
    expect(findManyMock.mock.calls.length).toBe(q); // …with ZERO Neon queries
  });

  it("BEHAVIORAL: a failing shard is COUNTED, never thrown — warm-up cannot corrupt or block anything", async () => {
    revalidateTag("building-manifest");
    clearManifestPageMemory();
    revalidateTag("search");
    FAIL_SHARDS.add("3");
    try {
      const r = await warmBuildingManifestShards();
      expect(r.shards_failed).toBe(1);
      expect(r.shards_warmed).toBe(BUILDING_MANIFEST_SHARDS.length - 1);
      expect(typeof r.duration_ms).toBe("number");
    } finally {
      FAIL_SHARDS.delete("3");
    }
  });
});

describe("writer-driven eviction — expiration/withdrawal/display-off cache semantics", () => {
  it("BEHAVIORAL: the writer tag-set removes the listing from ITS building payload; an unrelated building in the SAME shard stays cached", async () => {
    const target = CRAWL.find((b) => b.streetNumber.startsWith("2"))!;
    const other = CRAWL.find((b) => b.streetNumber.startsWith("2") && b.streetNumber !== target.streetNumber)!;
    const gone = "L-" + target.streetNumber + "-00000";

    const before = await getBuildingDataCached({ ...target, buildingName: null });
    expect((before.activeUnits as Array<Record<string, unknown>>).map((u) => u.mlsId)).toContain(gone);

    // the writer's DATA change (listing left the gated set: expired /
    // withdrawn / display-off) …
    REMOVED_STREETS.add(target.streetNumber);
    try {
      // … and the EXACT tag-set every converted writer now revalidates
      // (buildingAndManifestInvalidationTags: listing + building + the
      // affected manifest SHARD — the coarse search tag no longer touches
      // manifest pages, so the shard tag is what makes the listing leave
      // the shared manifest):
      revalidateTag("listing:" + gone);
      // Blocker-2 proof: NO memory clear here — immediate tag invalidation
      // alone must make the removed listing disappear (no cross-request
      // page memory exists to hold it).
      revalidateTag(buildingCacheTag(target.streetNumber, target.streetName, target.postalCode));
      revalidateTag("building-manifest-shard:" + target.streetNumber.charAt(0));
      revalidateTag("search");

      const after = await getBuildingDataCached({ ...target, buildingName: null });
      expect((after.activeUnits as Array<Record<string, unknown>>).map((u) => u.mlsId)).not.toContain(gone);

      // unrelated building — SAME shard — remains cached: zero re-assembly
      const t0 = tokenMock.mock.calls.length;
      const untouched = await getBuildingDataCached({ ...other, buildingName: null });
      expect(untouched.success).toBe(true);
      expect(tokenMock.mock.calls.length).toBe(t0);
    } finally {
      REMOVED_STREETS.delete(target.streetNumber);
    }
  });
});
