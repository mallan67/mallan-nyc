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

  it("/api/market wraps all four Neon reads in the tagged cache", () => {
    const src = read("app/api/market/route.ts");
    expect((src.match(/cachedPublicRead\(/g) || []).length).toBe(4);
    expect(src).toMatch(/api-market-active/);
    expect(src).toMatch(/api-market-new-count/);
    expect(src).toMatch(/api-market-closed/);
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

  it("listing detail page ISR window equals the sync cadence (literal 1800)", () => {
    const src = read("app/listing/[...slug]/page.tsx");
    expect(src).toMatch(/export const revalidate = 1800;/);
  });

  it("the cache module defaults its fallback window to the sync cadence (30 min)", () => {
    const src = read("lib/cache/public-cache.ts");
    expect(src).toMatch(/SYNC_CADENCE_SECONDS = 30 \* 60/);
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
    expect(src).toMatch(/listingCacheTag\(/);
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
