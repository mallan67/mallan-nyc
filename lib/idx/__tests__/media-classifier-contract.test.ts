/// <reference types="jest" />
/**
 * Stage A (raw-mapper-convergence exception, Maya 2026-10-02): Media-resource
 * characterization, kept separate from the Property-resource tests in
 * raw-mapper-characterization.test.ts per Maya's explicit instruction that Property
 * and Media are separate Cotality resources and must be verified separately.
 *
 * LEGACY OBSERVATION TESTS — these pin CURRENT, CONFIRMED-DEFECTIVE behavior of
 * classifyMediaItem (lib/media/listing-media-resolver.ts) against the live Media
 * MediaCategory/MediaClassification contract (18 and 7 values respectively, confirmed
 * live via mcp__trestle-fields__trestle_get_picklist; see
 * docs/audits/raw-mapper-media-contract-resolution-2026-10-02.md, Section 3, for the
 * full 14-case test matrix this file's cases are drawn from). Every "wrong" assertion
 * below is expected to flip when Stage B fixes the function — that is the point: this
 * is the regression harness for the fix, not a claim that the current output is
 * correct. classifyTrestleMediaCategory (lib/media/media-sync-service.ts) had ZERO
 * proven defects across the full 14-case matrix and is included here only as the
 * correct-contrast baseline for the same inputs.
 */
import { classifyMediaItem } from "@/lib/media/listing-media-resolver";
import { classifyTrestleMediaCategory } from "@/lib/media/media-sync-service";

describe("Media contract — classifyMediaItem PROVEN_DEFECTs (pins current wrong behavior; Stage B must fix)", () => {
  it("[PROVEN_DEFECT] a Document stored as a .jpg (the exact live anomaly Maya found: URL contains the Document-URL pattern) is wrongly classified 'floorplan', not 'document'", () => {
    const wrong = classifyMediaItem({
      MediaCategory: "Document",
      MediaURL: "https://cdn.example.com/Media/Property/DOCUMENT-Jpeg/abc123.jpg",
    });
    expect(wrong).toBe("floorplan"); // WRONG — a Document is not a FloorPlan. Fix target: a dedicated 'document' class, or at minimum not 'floorplan'.
    // classifyTrestleMediaCategory has no URL parameter and cannot fall into this trap.
    expect(classifyTrestleMediaCategory("Document")).toBe("Photo"); // its own documented 13-of-18-categories-default-to-Photo behavior, not a proven defect on its own.
  });

  it("[PROVEN_DEFECT] MediaCategory='BrandedVirtualTour' (the real, no-space live enum value) falls through to 'unknown', not 'virtualTour'", () => {
    const wrong = classifyMediaItem({ MediaCategory: "BrandedVirtualTour" });
    expect(wrong).toBe("unknown"); // WRONG — real virtual tours are rendered/sorted as mediaType 'Unknown' today, findable in production by that string.
    expect(classifyTrestleMediaCategory("BrandedVirtualTour")).toBe("VirtualTour"); // correct baseline — has the no-space cat.includes('virtualtour') check classifyMediaItem lacks.
  });

  it("[PROVEN_DEFECT] MediaCategory='UnbrandedVirtualTour' (the other real live enum value) also falls through to 'unknown'", () => {
    const wrong = classifyMediaItem({ MediaCategory: "UnbrandedVirtualTour" });
    expect(wrong).toBe("unknown");
    expect(classifyTrestleMediaCategory("UnbrandedVirtualTour")).toBe("VirtualTour");
  });

  it("[PROVEN_DEFECT] MediaCategory='Photo' with MediaClassification='DOCUMENT' (all-caps, a real distinct enum member) is wrongly overridden to 'floorplan'", () => {
    const wrong = classifyMediaItem({ MediaCategory: "Photo", MediaClassification: "DOCUMENT" });
    expect(wrong).toBe("floorplan"); // WRONG twice over: Document != FloorPlan, and a legitimate Photo category should not be overridden by this check at all.
  });

  it("[PROVEN_DEFECT] any .pdf URL is wrongly classified 'floorplan' regardless of MediaCategory (here: Addendum, a real live category with no dedicated branch)", () => {
    const wrong = classifyMediaItem({ MediaCategory: "Addendum", MediaURL: "https://cdn.example.com/docs/lease-addendum.pdf" });
    expect(wrong).toBe("floorplan"); // WRONG — an Addendum PDF is not a floor plan. The blanket /\.pdf(\?|$)/ regex is the cause.
  });

  it("[baseline, not a defect] MediaCategory='FloorPlan' (real spelling, no space) IS correctly classified by both — only the dead crm-idx-mapper.ts classifier (not tested here, already confirmed dead/unused) fails this case", () => {
    expect(classifyMediaItem({ MediaCategory: "FloorPlan" })).toBe("floorplan");
    expect(classifyTrestleMediaCategory("FloorPlan")).toBe("FloorPlan");
  });

  it("[baseline, not a defect] an ordinary Photo with no URL/classification signal is correctly classified by both", () => {
    expect(classifyMediaItem({ MediaCategory: "Photo" })).toBe("photo");
    expect(classifyTrestleMediaCategory("Photo")).toBe("Photo");
  });
});
