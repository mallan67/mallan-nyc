/**
 * Unified system — Phase 1, Task 3: single hero resolver.
 *
 * Rule (live-grounded): active Photo → PreferredPhotoYN → lowest valid Order →
 * stable MediaKey. Live probe (2026-07-21) showed PreferredPhotoYN = null on
 * every sampled row, so null MUST be treated as not-preferred and Order is the
 * live primary signal. A FloorPlan/Video/Document/VirtualTour is NEVER hero.
 */
import { selectHero, sortGallery, type HeroCandidate } from "@/lib/media/hero-resolver";

const c = (o: Partial<HeroCandidate>): HeroCandidate => ({ mediaKey: "MK", canonicalType: "Photo", order: 1, preferredPhotoYN: null, ...o });

describe("selectHero", () => {
  it("PreferredPhotoYN=true wins over a lower order", () => {
    expect(selectHero([c({ mediaKey: "A", order: 1, preferredPhotoYN: false }), c({ mediaKey: "B", order: 9, preferredPhotoYN: true })])!.mediaKey).toBe("B");
  });
  it("null preferred = not-preferred → lowest valid Order wins (live: all null)", () => {
    expect(selectHero([c({ mediaKey: "A", order: 5, preferredPhotoYN: null }), c({ mediaKey: "B", order: 2, preferredPhotoYN: null })])!.mediaKey).toBe("B");
  });
  it("false and null preferred are equivalent (neither wins over order)", () => {
    expect(selectHero([c({ mediaKey: "A", order: 2, preferredPhotoYN: false }), c({ mediaKey: "B", order: 5, preferredPhotoYN: null })])!.mediaKey).toBe("A");
  });
  it("ties on order break on stable MediaKey; null order sorts last", () => {
    expect(selectHero([c({ mediaKey: "Z", order: 1 }), c({ mediaKey: "A", order: 1 })])!.mediaKey).toBe("A");
    expect(selectHero([c({ mediaKey: "A", order: null }), c({ mediaKey: "B", order: 3 })])!.mediaKey).toBe("B");
  });
  it("a FloorPlan/Video/Document/VirtualTour is NEVER hero", () => {
    expect(selectHero([c({ mediaKey: "F", canonicalType: "FloorPlan", order: 0 }), c({ mediaKey: "P", canonicalType: "Photo", order: 5 })])!.mediaKey).toBe("P");
    expect(selectHero([c({ canonicalType: "FloorPlan" }), c({ canonicalType: "Video" }), c({ canonicalType: "Document" }), c({ canonicalType: "VirtualTour" })])).toBeNull();
  });
  it("returns null on empty input", () => {
    expect(selectHero([])).toBeNull();
  });
});

describe("sortGallery — photos first, then non-photos, deterministic", () => {
  it("orders photos by hero rule, then keeps floorplans/videos/tours after, documents/unknown excluded", () => {
    const g = sortGallery([
      c({ mediaKey: "P2", canonicalType: "Photo", order: 2 }),
      c({ mediaKey: "F1", canonicalType: "FloorPlan", order: 1 }),
      c({ mediaKey: "P1", canonicalType: "Photo", order: 1, preferredPhotoYN: true }),
      c({ mediaKey: "D1", canonicalType: "Document", order: 1 }),
      c({ mediaKey: "V1", canonicalType: "Video", order: 1 }),
    ]);
    // P1 (preferred) first, then P2, then non-photo media (FloorPlan/Video) in stable order; Document excluded
    expect(g.map((x) => x.mediaKey)).toEqual(["P1", "P2", "F1", "V1"]);
  });
});
