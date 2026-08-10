/// <reference types="jest" />
/**
 * One Cycle W1 — cache-scope source contract.
 *
 * Positive: every mapped ANONYMOUS public read surface is wired to the
 * tagged public cache (or ISR at the sync cadence), and every data-changing
 * pipeline (idx-sync, media-sync summary, §2.05 removal, expiration,
 * reconcile) revalidates through safeRevalidateTags.
 *
 * Negative: NO authenticated / CRM / portal surface may use the shared
 * anonymous cache — user-specific data must never be served from a cache
 * shared across anonymous visitors.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

describe("W1 — anonymous read surfaces are cache-wired (positive contract)", () => {
  it("/api/listings/similar caches its full computation with listing + search tags", () => {
    const src = read("app/api/listings/similar/route.ts");
    expect(src).toMatch(/cachedPublicRead\(/);
    expect(src).toMatch(/SEARCH_CACHE_TAG/);
    expect(src).toMatch(/listingCacheTag\(excludeId\)/);
    expect(src).toMatch(/computeSimilarListings/);
  });

  it("/api/market wraps every Neon read in the tagged cache", () => {
    const src = read("app/api/market/route.ts");
    // Seven tagged reads: active sample + active count + under-contract count +
    // new-listings count + closed sample + closed count + neighborhood groupBy.
    // (The exact count() reads were added so market COUNTS are never truncated
    // by the MARKET_STATS_ROW_CAP sample bound — NEON-001 overflow fix.)
    expect((src.match(/cachedPublicRead\(/g) || []).length).toBe(7);
    expect(src).toMatch(/api-market-active/);
    expect(src).toMatch(/api-market-active-count/);
    expect(src).toMatch(/api-market-uc-count/);
    expect(src).toMatch(/api-market-new-count/);
    expect(src).toMatch(/api-market-closed/);
    expect(src).toMatch(/api-market-closed-count/);
    expect(src).toMatch(/api-market-neighborhoods/);
  });

  it("/api/listings wraps the count read (findMany deferred with documented BigInt reason)", () => {
    const src = read("app/api/listings/route.ts");
    expect(src).toMatch(/cachedPublicRead\(\(\) => prisma\.listing\.count/);
    expect(src).toMatch(/BigInt/); // the documented deferral reason
  });

  it("/api/listings/building caches Trestle queries with the rotating token OUTSIDE the key", () => {
    const src = read("app/api/listings/building/route.ts");
    expect(src).toMatch(/cachedPublicRead\(trestleFetchJson/);
    expect(src).toMatch(/buildingCacheTag\(/);
    // Token must be resolved INSIDE the cached fn, not passed via key/args.
    expect(src).toMatch(/async function trestleFetchJson\(url: string\)/);
  });

  it("listing detail page ISR window equals the unified One Cycle cadence (literal 600 = 10 min)", () => {
    const src = read("app/listing/[...slug]/page.tsx");
    expect(src).toMatch(/export const revalidate = 600;/);
  });

  // ── Codex P2 fix: the detail page's ISR HTML itself must be tag-evictable ──
  //
  // Version-semantics premise VERIFIED against the installed Next 16.2.4:
  //   - node_modules/next/dist/server/web/spec-extension/unstable-cache.js
  //     L119-127: an unstable_cache invocation ACCUMULATES its tags into the
  //     surrounding render's workUnitStore.tags.
  //   - node_modules/next/dist/server/app-render/app-render.js L900-902 +
  //     L1600-1601: the render's collected tags become the route entry's
  //     metadata.fetchTags — so revalidateTag(tag, "max") expires the ISR
  //     HTML of EVERY URL variant that rendered the listing (id-form,
  //     canonical address-slug form, and legacy alias forms alike — which
  //     revalidatePath could never fully enumerate).
  it("detail page attaches listing/building cache tags to its render (revalidateTag evicts the ISR HTML)", () => {
    const page = read("app/listing/[...slug]/page.tsx");
    expect(page).toMatch(/attachListingCacheTags\(/);
    // The attach happens on the single fetch seam every URL variant funnels
    // through, AFTER the listing resolves (so the tag is the resolved id).
    expect(page).toMatch(/const fetchListing = cache\([\s\S]*?attachListingCacheTags[\s\S]*?\}\);/);
  });

  it("the tag-attach helper registers tags via a tagged unstable_cache read (fail-open, never throws)", () => {
    const src = read("lib/cache/public-cache.ts");
    expect(src).toMatch(/export async function attachListingCacheTags/);
    expect(src).toMatch(/unstable_cache\(async \(\) => tags/);
  });

  it("the cache module defaults its fallback window to the unified One Cycle cadence (10 min)", () => {
    const src = read("lib/cache/public-cache.ts");
    expect(src).toMatch(/SYNC_CADENCE_SECONDS = 10 \* 60/);
    expect(src).toMatch(/unstable_cache/);
  });
});

describe("W1 — data-changing pipelines revalidate (positive contract)", () => {
  it.each([
    ["lib/idx/sync.ts"],
    ["lib/idx/media-sync.ts"],
    ["app/api/cron/data-retention/route.ts"],
    ["app/api/cron/feed-reconcile/route.ts"],
    ["app/api/cron/listing-expiration/route.ts"],
  ])("%s calls safeRevalidateTags", (rel) => {
    const src = read(rel as string);
    expect(src).toMatch(/safeRevalidateTags\(/);
    // The listing tag may be named DIRECTLY or produced by the canonical owner
    // `publicListingChangeTags` (commit 7B-2A), which every media/listing writer
    // now delegates to so the EXPIRED tag set cannot diverge between them.
    expect(src).toMatch(/listingCacheTag\(|publicListingChangeTags\(/);
  });

  it("idx-sync bumps the coarse search tag at most once per run (set-based)", () => {
    const src = read("lib/idx/sync.ts");
    expect(src).toMatch(/changedCacheTags\.add\(SEARCH_CACHE_TAG\)/);
  });
});

describe("W1 — authenticated surfaces are NEVER cache-wrapped (negative contract)", () => {
  const FORBIDDEN_DIRS = [
    "app/api/crm",
    "app/api/portal",
    "app/portal",
    "app/api/auth",
    "app/admin",
  ];

  function walk(dir: string, out: string[] = []): string[] {
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return out;
    }
    for (const e of entries) {
      const full = path.join(dir, e);
      const st = statSync(full);
      if (st.isDirectory()) walk(full, out);
      else if (/\.(ts|tsx)$/.test(e)) out.push(full);
    }
    return out;
  }

  it("no CRM/portal/auth/admin file imports the anonymous public cache", () => {
    const offenders: string[] = [];
    for (const dir of FORBIDDEN_DIRS) {
      for (const file of walk(path.join(ROOT, dir))) {
        const src = readFileSync(file, "utf8");
        if (/cachedPublicRead|unstable_cache/.test(src)) offenders.push(path.relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
