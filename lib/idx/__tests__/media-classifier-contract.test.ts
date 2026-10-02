/// <reference types="jest" />
/**
 * Stage A (raw-mapper-convergence exception, Maya 2026-10-02): Media-resource
 * characterization, kept separate from the Property-resource tests in
 * raw-mapper-characterization.test.ts per Maya's explicit instruction that Property
 * and Media are separate Cotality resources and must be verified separately.
 *
 * TWICE-CORRECTED 2026-10-02 against live Cotality ROW data. Scope note: of the 18
 * GLOBAL MediaCategory enum members in $metadata, only 8 are associated with RLS (the
 * feed Mallan actually reads): Addendum, BrandedVirtualTour, Document, FloorPlan,
 * Other, Photo, UnbrandedVirtualTour, Video. Every case below uses only these 8.
 *
 * Live-observed combinations (as of this check — population counts drift and are not
 * durable facts; see docs/audits/raw-mapper-media-contract-resolution-2026-10-02.md):
 * Photo+PHOTO, FloorPlan+DOCUMENT (the dominant real floor-plan pattern — every sampled
 * FloorPlan row carries MediaClassification='DOCUMENT'), and MediaCategory=null+PHOTO.
 * Addendum, BrandedVirtualTour, Document, Other, UnbrandedVirtualTour, Video currently
 * have ZERO rows in Mallan's entitled feed — valid live RLS contract values, not
 * invalid, just unobserved today.
 *
 * Classification discipline (Maya's correction, applied here): a synthetic
 * category/classification combination that has NOT been observed live is NOT a
 * PROVEN_DEFECT merely because it's constructed. It is labeled PROVEN_RESOURCE_GAP only
 * when the function's current code demonstrably cannot produce the correct result for
 * that input (traced directly against source, not assumed), even though no bad row has
 * occurred yet. A bare disagreement between two old classifiers with no live row to
 * settle it either way stays LEGACY_UNVERIFIED.
 *
 * Evidence-level correction (Maya, same day): every case below constructs a plain object
 * reproducing a reported field combination and runs it through the real, unmodified
 * classifier functions — this is LIVE_PATTERN_REPRODUCTION_AGAINST_REAL_CODE, proving "the
 * real code returns X for exactly these fields." It is NOT live-row execution (feeding an
 * actual captured Cotality row through the classifier) — no literally-captured row fixture
 * exists yet for Photo+PHOTO, FloorPlan+DOCUMENT, or MediaCategory=null+PHOTO; see
 * docs/audits/raw-mapper-media-contract-resolution-2026-10-02.md Section 5.2, an open item,
 * not silently worked around. Also note: Document/Addendum/Other resolving to 'unknown' in
 * classifyMediaItem is NOT automatically a defect — that function is a GALLERY DISPLAY
 * projection with exactly 5 output classes (photo/floorplan/video/virtualTour/unknown) by
 * design; those three categories are not gallery image content. See the doc's Section 3/4.3
 * for the canonical-storage-vs-gallery-projection boundary this file respects.
 */
import { classifyMediaItem } from "@/lib/media/listing-media-resolver";
import { classifyTrestleMediaCategory } from "@/lib/media/media-sync-service";

describe("Media contract — LIVE_PATTERN_REPRODUCTION_AGAINST_REAL_CODE (reported live field combinations, not a captured row fixture — see doc Section 5.2)", () => {
  it("MediaCategory='FloorPlan' + MediaClassification='DOCUMENT' + a DOCUMENT-Jpeg URL — the dominant reported live floor-plan pattern — classifies correctly as floorplan", () => {
    const result = classifyMediaItem({
      MediaCategory: "FloorPlan",
      MediaClassification: "DOCUMENT",
      MediaURL: "https://cdn.example.com/Media/Property/DOCUMENT-Jpeg/abc123.jpg",
    });
    expect(result).toBe("floorplan");
    expect(classifyTrestleMediaCategory("FloorPlan")).toBe("FloorPlan");
  });

  it("MediaCategory=null + MediaClassification='PHOTO' (the other reported live combination) correctly falls back to photo", () => {
    const result = classifyMediaItem({ MediaCategory: null, MediaClassification: "PHOTO" });
    expect(result).toBe("photo");
    expect(classifyTrestleMediaCategory(null)).toBe("Photo");
  });
});

describe("Media contract — PROVEN_RESOURCE_GAP: classifyMediaItem has no real priority tiering between MediaCategory, MediaClassification and URL text", () => {
  // These combinations are NOT observed live today (0 population on the non-FloorPlan/Photo
  // side) — they are valid structural test cases proving the current implementation is
  // incomplete/unsafe for a valid live RLS category, not proof a bad row has occurred.
  it("[PROVEN_RESOURCE_GAP, unobserved combination] an explicit MediaCategory='Photo' can be overridden to 'floorplan' by MediaClassification alone, with no priority given to the category", () => {
    const result = classifyMediaItem({ MediaCategory: "Photo", MediaClassification: "DOCUMENT" });
    expect(result).toBe("floorplan"); // demonstrates the gap: category should win and did not. Photo+DOCUMENT has not been observed live.
  });

  it("MediaCategory='Document' alone (no URL) resolving to 'unknown' is NOT automatically a defect — classifyMediaItem is a gallery-display projection with no document class by design (see doc Section 3/4.3); but a DOCUMENT-Jpeg URL added on top wrongly overrides it to 'floorplan' — [PROVEN_RESOURCE_GAP] for that override specifically, unobserved live (Document-category rows: 0 today)", () => {
    expect(classifyMediaItem({ MediaCategory: "Document" })).toBe("unknown"); // plausibly correct: 'not gallery image content', not asserted as wrong here.
    const withUrl = classifyMediaItem({
      MediaCategory: "Document",
      MediaURL: "https://cdn.example.com/Media/Property/DOCUMENT-Jpeg/abc123.jpg",
    });
    expect(withUrl).toBe("floorplan"); // the actual gap: URL text overriding an explicit, already-resolved category into a DIFFERENT wrong class, not just 'unknown'.
  });

  it("[PROVEN_RESOURCE_GAP, unobserved combination] an explicit MediaCategory='Addendum' (valid RLS value, 0 rows today) is overridden to 'floorplan' by a blanket .pdf URL regex", () => {
    const result = classifyMediaItem({ MediaCategory: "Addendum", MediaURL: "https://cdn.example.com/docs/lease-addendum.pdf" });
    expect(result).toBe("floorplan"); // Addendum+.pdf has not been observed live; demonstrates the same unconditional-URL-override gap.
  });

  it("[PROVEN_RESOURCE_GAP] MediaCategory='BrandedVirtualTour' (valid RLS value, 0 rows today) has no path to a virtual-tour classification — falls through to 'unknown'", () => {
    const result = classifyMediaItem({ MediaCategory: "BrandedVirtualTour" });
    expect(result).toBe("unknown"); // the intended behavior is unambiguous (a virtual-tour category should not become 'unknown'); the gap is proven by direct trace even with 0 live rows.
    expect(classifyTrestleMediaCategory("BrandedVirtualTour")).toBe("VirtualTour"); // this sibling function has the no-space check and does not share the gap.
  });

  it("[PROVEN_RESOURCE_GAP] MediaCategory='UnbrandedVirtualTour' (the other valid RLS value, 0 rows today) has the same gap", () => {
    const result = classifyMediaItem({ MediaCategory: "UnbrandedVirtualTour" });
    expect(result).toBe("unknown");
    expect(classifyTrestleMediaCategory("UnbrandedVirtualTour")).toBe("VirtualTour");
  });
});

describe("Media contract — VALID_ZERO_POPULATION_CASE: classifyTrestleMediaCategory's Photo-default on zero-population RLS categories is UNVERIFIED, not confirmed correct", () => {
  it("[VALID_ZERO_POPULATION_CASE, explicit branch exists] MediaCategory='Video' (valid RLS value, 0 rows today) has a dedicated branch in both functions, unlike Document/Addendum/Other", () => {
    expect(classifyMediaItem({ MediaCategory: "Video" })).toBe("video");
    expect(classifyTrestleMediaCategory("Video")).toBe("Video");
  });

  it("[LEGACY_UNVERIFIED — old-code disagreement only, no live row to settle it] MediaCategory='Addendum' alone silently defaults to Photo in classifyTrestleMediaCategory but 'unknown' in classifyMediaItem; neither is proven correct for this valid, zero-population RLS category", () => {
    expect(classifyMediaItem({ MediaCategory: "Addendum" })).toBe("unknown");
    expect(classifyTrestleMediaCategory("Addendum")).toBe("Photo"); // silent Photo-default — not confirmed correct; zero population does not grant permission to assume this is fine.
  });

  it("[LEGACY_UNVERIFIED — old-code disagreement only, no live row to settle it] MediaCategory='Other' alone has the same unresolved disagreement", () => {
    expect(classifyMediaItem({ MediaCategory: "Other" })).toBe("unknown");
    expect(classifyTrestleMediaCategory("Other")).toBe("Photo");
  });
});

describe("Media contract — baselines (both categories have substantial live population)", () => {
  it("MediaCategory='FloorPlan' alone (no classification/URL) is correctly classified by both", () => {
    expect(classifyMediaItem({ MediaCategory: "FloorPlan" })).toBe("floorplan");
    expect(classifyTrestleMediaCategory("FloorPlan")).toBe("FloorPlan");
  });

  it("an ordinary Photo with no other signal is correctly classified by both", () => {
    expect(classifyMediaItem({ MediaCategory: "Photo" })).toBe("photo");
    expect(classifyTrestleMediaCategory("Photo")).toBe("Photo");
  });
});
