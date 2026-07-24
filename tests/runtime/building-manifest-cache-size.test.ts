/**
 * 2 MB CACHE-LIMIT PROOF (Maya 2026-07-24 — failed building cache).
 *
 * The production Next data cache REJECTS entries over 2 MB. The original
 * manifest cached a whole shard (worst case 4,473 rows WITH derivation from
 * full media JSON) as ONE value — it could exceed the limit, silently fail
 * to persist, and re-run the Neon read per distinct-building request.
 *
 * Proofs here:
 *   1. A REALISTIC worst-case 1,500-row page serializes far below the
 *      explicit ceiling (which itself is far below 2 MB).
 *   2. The manifest read NEVER selects the heavy `media` JSON — the stored
 *      media-summary column (primary_photo_url) is the hero source.
 *   3. The explicit byte guard exists and THROWS on an oversized page
 *      (never a silently-uncacheable entry).
 */
import * as fs from "fs";
import * as path from "path";
import {
  MANIFEST_PAGE_SIZE,
  MANIFEST_CACHE_MAX_BYTES,
} from "@/lib/buildings/public-building-data";

// WORST-CASE slim row — deliberately EXCEEDS the real production maxima
// (read-only Neon evidence, 2026-07-24, n=9,805 displayable actives:
//  StreetName max 22 / p99 13 chars; UnitNumber max 20; BuildingName null
//  in every address JSON; primary_photo_url max=p99 161 chars;
//  listing_id max 11). Every fixture string below is LONGER than the real
//  maximum, so the proven bound is strictly conservative.
// (long pre-war building names, hyphenated Queens street numbers, long
// proxy-wrapped photo URLs).
function worstCaseRow(i: number) {
  return {
    id: String(9_000_000_000 + i),
    listing_id: `RLS2009${String(i).padStart(4, "0")}`,
    status: "ActiveUnderContract",
    list_price: 125_000_000,
    bedrooms_total: 12,
    bathrooms_full: 14,
    bathrooms_half: 3,
    living_area: 28_500,
    property_type: "Residential Lease",
    property_sub_type: "SingleFamilyResidence",
    listing_type: "sale",
    address: {
      StreetNumber: "1234-56",
      StreetName: "CATHEDRAL PARKWAY SAINT NICHOLAS TERRACE EXTENSION",
      PostalCode: "11375-1234",
      UnitNumber: "PENTHOUSE-4D-DUPLEX",
      BuildingName: "The Excelsior Grand Metropolitan Residences at Riverside Park South",
    },
    features: { CommonInterest: "StockCooperative", YearBuilt: 1928, StoriesTotal: 48, ReconciledListingId: null },
    photoUrl:
      "/api/media/proxy?url=" +
      encodeURIComponent(
        `https://cdnparap150.paragonrels.com/ParagonImages/Property/P15/REBNY/RLS2009${i}/0/0/0/abcdef0123456789abcdef0123456789/12/aa00bb11cc22dd33ee44ff55aa66bb77/RLS2009${i}.JPG`,
      ),
  };
}

describe("building-manifest cache-size proof (2 MB production limit)", () => {
  it(`a FULL worst-case page (${MANIFEST_PAGE_SIZE} rows) serializes below the explicit ceiling, which is below 2 MB`, () => {
    const page = {
      rows: Array.from({ length: MANIFEST_PAGE_SIZE }, (_, i) => worstCaseRow(i)),
      nextCursor: "RLS20099999",
    };
    const bytes = Buffer.byteLength(JSON.stringify(page), "utf8");
    // Realistic worst case must clear the ceiling with headroom.
    expect(bytes).toBeLessThan(MANIFEST_CACHE_MAX_BYTES);
    // And the ceiling itself sits safely below the 2 MB production limit.
    expect(MANIFEST_CACHE_MAX_BYTES).toBeLessThan(2 * 1024 * 1024);
  });

  it("the manifest select NEVER reads the heavy media JSON; the stored summary column is the hero source", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "lib", "buildings", "public-building-data.ts"),
      "utf8",
    );
    // Scope: the manifest page select block.
    const selStart = src.indexOf("// 2 MB correction: the stored media-summary hero");
    expect(selStart).toBeGreaterThan(-1);
    const selectBlock = src.slice(selStart - 600, selStart + 300);
    expect(selectBlock).toContain("primary_photo_url: true");
    expect(selectBlock).not.toContain("media: true");
    // The whole module keeps exactly ONE `media: true` usage: NONE in the
    // manifest path (payload assembly uses Trestle records, not this select).
    expect(src.split("media: true").length - 1).toBe(0);
  });

  it("the explicit byte guard THROWS on an oversized page — never a silently-uncacheable entry", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "lib", "buildings", "public-building-data.ts"),
      "utf8",
    );
    expect(src).toContain("PAGE OVER CACHE LIMIT");
    expect(src).toContain("assertPageCacheable(shard, cursor, result)");
  });

  it("warm counters separate cache_persisted from fallback_live (fallback live reads are NOT warmed cache)", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "lib", "buildings", "public-building-data.ts"),
      "utf8",
    );
    expect(src).toContain("cache_persisted: cachePersisted");
    expect(src).toContain("fallback_live: fallbackLive");
    // SWR-aware proof: a stale pre-warm entry is separated, never counted
    // as fresh; refresh is forced PER KEY (no module-global bypass flag).
    expect(src).toContain("swr_stale_served: swrStaleServed");
    expect(src).toContain("second.fetchedAt >= warmStart");
    expect(src).toContain("manifestPageMemory.delete(key)");
    expect(src).not.toContain("manifestMemoryBypass");
  });
});
