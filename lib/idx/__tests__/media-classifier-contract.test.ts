/// <reference types="jest" />
/**
 * Stage A (raw-mapper-convergence exception, Maya 2026-10-02): Media-resource
 * characterization, kept separate from the Property-resource tests in
 * raw-mapper-characterization.test.ts per Maya's explicit instruction that Property
 * and Media are separate Cotality resources and must be verified separately.
 *
 * CORRECTED 2026-10-02 against live Cotality ROW data (not just $metadata): for
 * Mallan's RLS feed, live MediaCategory population is Photo=1,487,153,
 * FloorPlan=588,924, and BrandedVirtualTour/UnbrandedVirtualTour/Video/Document/
 * Addendum/Other=0 rows today (zero population does NOT mean invalid — the live
 * contract still supports them, and the classifier must handle them structurally).
 * Critically: ALL sampled FloorPlan rows carry MediaClassification='DOCUMENT' and a
 * MediaURL containing 'DOCUMENT-Jpeg'/'DOCUMENT-Pdf' — Cotality itself uses DOCUMENT
 * classification/URL-naming for floor plans in this feed. The correct priority model,
 * verified against live rows: MediaCategory is PRIMARY (exact semantic meaning,
 * authoritative when present); MediaClassification is SECONDARY (fallback only when
 * MediaCategory is null/missing — confirmed live: a MediaCategory=null,
 * MediaClassification='PHOTO' row exists); MediaType is file-format only, never a
 * classification signal; URL text is never primary authority.
 *
 * The real, corrected defect in classifyMediaItem is NOT "Document can never mean
 * FloorPlan" (that claim is contradicted by live data — see above) — it is that the
 * function has NO priority tiering at all: MediaCategory, MediaClassification, and
 * URL-pattern checks are OR'd together at the same level, so a lower-priority signal
 * (classification or URL) can override an explicit, different, non-empty
 * MediaCategory instead of MediaCategory being checked and resolved first. This file's
 * PROVEN_DEFECT cases below are reframed around that precise mechanism, not a blanket
 * claim about what DOCUMENT/FloorPlan "mean." The dominant live pattern
 * (MediaCategory='FloorPlan' + MediaClassification='DOCUMENT' + a DOCUMENT-Jpeg/Pdf
 * URL, 588,924 rows) is verified CORRECT today, by coincidence of check order (the
 * `cat === 'floorplan'` condition is itself one of the OR'd floorplan-branch checks,
 * so an explicit FloorPlan category resolves correctly regardless of the structural
 * flaw) — see the dedicated test below. Every "wrong" assertion in this file is
 * expected to flip when Stage B adds real priority tiering; this is the regression
 * harness for that fix, not a claim the current output is correct.
 */
import { classifyMediaItem } from "@/lib/media/listing-media-resolver";
import { classifyTrestleMediaCategory } from "@/lib/media/media-sync-service";

describe("Media contract — the dominant live pattern (588,924 FloorPlan rows) is correctly classified today", () => {
  it("MediaCategory='FloorPlan' + MediaClassification='DOCUMENT' + a DOCUMENT-Jpeg URL (the verified live pattern) classifies correctly as floorplan, not document", () => {
    const result = classifyMediaItem({
      MediaCategory: "FloorPlan",
      MediaClassification: "DOCUMENT",
      MediaURL: "https://cdn.example.com/Media/Property/DOCUMENT-Jpeg/abc123.jpg",
    });
    expect(result).toBe("floorplan"); // CORRECT today — MediaCategory='floorplan' is itself one of the OR'd conditions, so this resolves right even though the function has no real priority tiering.
    expect(classifyTrestleMediaCategory("FloorPlan")).toBe("FloorPlan"); // also correct — this function only ever sees MediaCategory.
  });

  it("MediaCategory=null + MediaClassification='PHOTO' (the other verified live combination) correctly falls back to photo", () => {
    const result = classifyMediaItem({ MediaCategory: null, MediaClassification: "PHOTO" });
    expect(result).toBe("photo"); // CORRECT — the cat === '' default-to-photo branch fires; MediaClassification is the right fallback signal per the corrected priority model, even though this function doesn't literally read `cls` to decide this particular case.
    expect(classifyTrestleMediaCategory(null)).toBe("Photo"); // also correct — the `!category` null-guard.
  });
});

describe("Media contract — classifyMediaItem PROVEN_DEFECTs: no real priority tiering between MediaCategory, MediaClassification and URL text", () => {
  it("[PROVEN_DEFECT] an explicit, non-floorplan MediaCategory='Photo' is wrongly overridden to 'floorplan' by MediaClassification alone — Photo has 1,487,153 live rows and must never be reclassified by a secondary signal", () => {
    const wrong = classifyMediaItem({ MediaCategory: "Photo", MediaClassification: "DOCUMENT" });
    expect(wrong).toBe("floorplan"); // WRONG — MediaCategory is explicit and authoritative here; a secondary signal must not override it. This is the clearest case: unlike the dominant FloorPlan+DOCUMENT pattern above, nothing in the live data suggests a real Photo row ever needs reclassifying away from Photo.
  });

  it("[PROVEN_DEFECT] an explicit MediaCategory='Document' (valid live value, 0 population today — must still be supported per Maya's instruction) is overridden to 'floorplan' by a URL pattern instead of being resolved by category first", () => {
    const wrong = classifyMediaItem({
      MediaCategory: "Document",
      MediaURL: "https://cdn.example.com/Media/Property/DOCUMENT-Jpeg/abc123.jpg",
    });
    expect(wrong).toBe("floorplan"); // WRONG under the corrected priority model (category should resolve first, before any URL check runs), though this exact combination is unobserved live today (Document category currently has 0 rows) — a structural gap, not an observed production failure.
    // Without the URL, an explicit Document category alone resolves to 'unknown' today (no dedicated document bucket exists) — a separate, smaller gap, not asserted as "wrong" here since no live row exists to say what the output should be instead.
    expect(classifyMediaItem({ MediaCategory: "Document" })).toBe("unknown");
  });

  it("[PROVEN_DEFECT] an explicit MediaCategory='Addendum' (valid live value, 0 population today) is overridden to 'floorplan' by a blanket .pdf URL regex instead of being resolved by category first", () => {
    const wrong = classifyMediaItem({ MediaCategory: "Addendum", MediaURL: "https://cdn.example.com/docs/lease-addendum.pdf" });
    expect(wrong).toBe("floorplan"); // WRONG under the corrected priority model, same reasoning as the Document case above — unobserved live today, structural gap.
  });

  it("[PROVEN_DEFECT] MediaCategory='BrandedVirtualTour' (valid live RLS value, 0 population today) falls through to 'unknown' instead of a virtual-tour class", () => {
    const wrong = classifyMediaItem({ MediaCategory: "BrandedVirtualTour" });
    expect(wrong).toBe("unknown"); // WRONG — real virtual tours would render/sort as mediaType 'Unknown' if/when population moves off zero.
    expect(classifyTrestleMediaCategory("BrandedVirtualTour")).toBe("VirtualTour"); // correct baseline — has the no-space cat.includes('virtualtour') check classifyMediaItem lacks.
  });

  it("[PROVEN_DEFECT] MediaCategory='UnbrandedVirtualTour' (the other valid live RLS value, 0 population today) also falls through to 'unknown'", () => {
    const wrong = classifyMediaItem({ MediaCategory: "UnbrandedVirtualTour" });
    expect(wrong).toBe("unknown");
    expect(classifyTrestleMediaCategory("UnbrandedVirtualTour")).toBe("VirtualTour");
  });
});

describe("Media contract — structural support for zero-population-but-valid live RLS MediaCategory values (Maya: zero rows today does not mean invalid)", () => {
  it("MediaCategory='Video' (0 population today) is already classified correctly by both", () => {
    expect(classifyMediaItem({ MediaCategory: "Video" })).toBe("video");
    expect(classifyTrestleMediaCategory("Video")).toBe("Video");
  });

  it("[LEGACY_DISAGREEMENT, not proven either way — 0 live rows to check] MediaCategory='Addendum' alone (no URL) disagrees between classifiers: classifyMediaItem says 'unknown', classifyTrestleMediaCategory says 'Photo'", () => {
    expect(classifyMediaItem({ MediaCategory: "Addendum" })).toBe("unknown");
    expect(classifyTrestleMediaCategory("Addendum")).toBe("Photo");
  });

  it("[LEGACY_DISAGREEMENT, not proven either way — 0 live rows to check] MediaCategory='Other' alone disagrees the same way", () => {
    expect(classifyMediaItem({ MediaCategory: "Other" })).toBe("unknown");
    expect(classifyTrestleMediaCategory("Other")).toBe("Photo");
  });
});

describe("Media contract — baselines", () => {
  it("MediaCategory='FloorPlan' alone (no classification/URL) is correctly classified by both", () => {
    expect(classifyMediaItem({ MediaCategory: "FloorPlan" })).toBe("floorplan");
    expect(classifyTrestleMediaCategory("FloorPlan")).toBe("FloorPlan");
  });

  it("an ordinary Photo with no other signal is correctly classified by both", () => {
    expect(classifyMediaItem({ MediaCategory: "Photo" })).toBe("photo");
    expect(classifyTrestleMediaCategory("Photo")).toBe("Photo");
  });
});
