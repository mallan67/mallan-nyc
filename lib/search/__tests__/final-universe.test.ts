/**
 * FINAL UNIVERSE — total, hasMore and returned IDs must describe ONE population.
 *
 * The defect: `total` used the provider `@odata.count` unless bounds/borough/
 * neighborhood were present. Collection amenities filter LOCALLY (lambda filters
 * are HTTP 400) and were NOT in that list, so a request for elevators returned
 * elevator-only IDs beside the PRE-amenity provider total. The user is told
 * "3,000 results", pages through, and finds a few dozen.
 *
 * The subtler half: where a local filter WAS recognised, the code published
 * `filtered.length` — a locally-filtered slice of a BOUNDED head sample. That
 * looks authoritative and is not a corpus count.
 */
import { computeFinalUniverse, computeHasMore } from "@/lib/search/canonical/final-universe";

describe("total describes the FINAL eligible universe", () => {
  it("uses the provider count when nothing was filtered locally", () => {
    const u = computeFinalUniverse({
      providerCount: 8100, fetchedCount: 60, fetchTop: 80,
      locallyFilteredCount: 60, hasLocalFilter: false,
    });
    expect(u).toEqual({ total: 8100, corpusComplete: true, basis: "provider-count" });
  });

  it("NEVER publishes the provider count once a local filter ran", () => {
    // The exact defect: 5,096 listings have elevators, but this request pulled
    // 200 and 60 survived. Publishing 8,100 describes a different population.
    const u = computeFinalUniverse({
      providerCount: 8100, fetchedCount: 200, fetchTop: 1000,
      locallyFilteredCount: 60, hasLocalFilter: true,
    });
    expect(u.total).toBe(60);
    expect(u.total).not.toBe(8100);
    expect(u.corpusComplete).toBe(true); // head sample not saturated
  });

  it("refuses to present a truncated head sample as a corpus count", () => {
    // fetched === fetchTop means the provider had more to give. 300 is a LOWER
    // BOUND, not the answer.
    const u = computeFinalUniverse({
      providerCount: 8100, fetchedCount: 1000, fetchTop: 1000,
      locallyFilteredCount: 300, hasLocalFilter: true,
    });
    expect(u.total).toBe(300);
    expect(u.corpusComplete).toBe(false);
    expect(u.basis).toBe("local-filter-truncated");
  });

  it("keeps paging open when the total is only a lower bound", () => {
    // "No more results" cannot be asserted when more may exist beyond the head.
    const truncated = computeFinalUniverse({
      providerCount: 8100, fetchedCount: 1000, fetchTop: 1000,
      locallyFilteredCount: 300, hasLocalFilter: true,
    });
    expect(computeHasMore(truncated, 280, 20)).toBe(true);
  });

  it("closes paging normally when the count IS the corpus", () => {
    const complete = computeFinalUniverse({
      providerCount: 8100, fetchedCount: 120, fetchTop: 1000,
      locallyFilteredCount: 60, hasLocalFilter: true,
    });
    expect(computeHasMore(complete, 40, 20)).toBe(false);
    expect(computeHasMore(complete, 20, 20)).toBe(true);
  });

  it("hasMore and total always describe the same universe", () => {
    // Property check: hasMore must never claim exhaustion of a universe whose
    // size we do not know.
    for (const fetched of [50, 500, 1000]) {
      for (const surviving of [0, 25, 300]) {
        const u = computeFinalUniverse({
          providerCount: 8100, fetchedCount: fetched, fetchTop: 1000,
          locallyFilteredCount: surviving, hasLocalFilter: true,
        });
        if (!u.corpusComplete) expect(computeHasMore(u, u.total, 20)).toBe(true);
      }
    }
  });
});
