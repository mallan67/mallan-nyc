/// <reference types="jest" />
/**
 * Stage A (raw-mapper-convergence exception, Maya 2026-10-02): Media-resource
 * characterization, kept separate from the Property-resource tests in
 * raw-mapper-characterization.test.ts per Maya's explicit instruction that Property
 * and Media are separate Cotality resources and must be verified separately.
 *
 * THRICE-CORRECTED 2026-10-02 against live Cotality ROW data. Scope note: of the 18
 * GLOBAL MediaCategory enum members in $metadata, only 8 are associated with RLS (the
 * feed Mallan actually reads): Addendum, BrandedVirtualTour, Document, FloorPlan,
 * Other, Photo, UnbrandedVirtualTour, Video. Every case below uses only these 8.
 *
 * SANITIZED LIVE-ROW-DERIVED fixtures (this revision; corrected wording — these are not
 * "verbatim/exact" rows, since the real Cotality host and the opaque, rotating MediaURL
 * tail were intentionally replaced): Maya queried three live Media rows and supplied their
 * full field sets with MediaKey/ResourceRecordKey provenance — see
 * docs/audits/raw-mapper-media-contract-resolution-2026-10-02.md Section 5 for the full
 * record. Every classification-relevant field (MediaCategory, MediaClassification,
 * MediaType, Short/LongDescription, the stable `/Media/Property/<PREFIX>-Jpeg/` URL path
 * segment) is reproduced exactly; only the host and the non-classification-relevant URL
 * tail are sanitized, since fabricating the real opaque tail would misrepresent the source.
 *
 * Required 3-column distinction per row (Maya's correction): PROVIDER ROW FACTS (what
 * Cotality actually sent) → CURRENT CODE OUTPUT (what classifyMediaItem/
 * classifyTrestleMediaCategory return today, provable by running the real code) →
 * VERIFIED SEMANTIC RESULT (whether that output is actually correct — only provable when
 * every signal on the row agrees; left explicitly UNVERIFIED when they don't). Rows 1 and
 * 2 below have every signal agreeing and so earn CONFIRMED CORRECT. Row 3 does NOT: its
 * MediaClassification/URL path say "photo" but its LongDescription says "floor plan" —
 * classifyMediaItem structurally never reads LongDescription at all (only
 * ShortDescription), so it never even sees that signal. Per Maya's correction, this does
 * NOT mean LongDescription resolves the conflict either — it is just another unverified
 * provider signal, with no established rule for whether free text outranks
 * MediaClassification/the URL path. Recorded as OBSERVED_LIVE_PROVIDER_CONFLICT, semantic
 * result unresolved, not "confirmed correct" and not "resolved by LongDescription."
 *
 * Classification discipline (unchanged): a synthetic category/classification combination
 * that has NOT been observed live is NOT a PROVEN_DEFECT merely because it's constructed —
 * only PROVEN_RESOURCE_GAP, and only when direct code tracing proves the gap. A bare
 * disagreement between two old classifiers with no live row to settle it stays
 * LEGACY_UNVERIFIED. Document/Addendum/Other resolving to 'unknown' in classifyMediaItem is
 * NOT automatically a defect — that function is a GALLERY DISPLAY projection with exactly 5
 * output classes (photo/floorplan/video/virtualTour/unknown) by design; those categories
 * are not gallery image content. See the doc's Section 3/4.3 for that boundary.
 */
import { classifyMediaItem } from "@/lib/media/listing-media-resolver";
import { classifyTrestleMediaCategory } from "@/lib/media/media-sync-service";

// Sanitized live-row-derived fixtures, as supplied by Maya with MediaKey/ResourceRecordKey
// provenance. Every classification-relevant field is reproduced exactly; MediaURL below
// preserves only the stable classification-relevant path prefix — the real host and the
// opaque, rotating URL tail are intentionally sanitized (see file header).
const LIVE_ROW_PHOTO = {
  MediaKey: "2005927277918",
  ResourceName: "Property",
  ResourceRecordKey: "1185755400",
  MediaCategory: "Photo",
  MediaClassification: "PHOTO",
  MediaType: "Jpeg",
  Order: 6,
  ShortDescription: null,
  LongDescription: "Photo 6",
  MediaStatus: "Active",
  InternetEntireListingDisplayYN: false,
  MediaURL: "https://cdn.cotality.example/Media/Property/PHOTO-Jpeg/",
};

const LIVE_ROW_FLOORPLAN = {
  MediaKey: "2005917243395",
  ResourceName: "Property",
  ResourceRecordKey: "1185008759",
  MediaCategory: "FloorPlan",
  MediaClassification: "DOCUMENT",
  MediaType: "Jpeg",
  Order: 2,
  ShortDescription: "FloorPlan",
  LongDescription: null,
  MediaStatus: "Active",
  InternetEntireListingDisplayYN: true,
  MediaURL: "https://cdn.cotality.example/Media/Property/DOCUMENT-Jpeg/",
};

// The conflicting row: MediaCategory is null, MediaClassification and the URL path both
// say "photo," but LongDescription says "floor plan" — a genuine, unresolved provider-side
// signal conflict, not a code defect to fix by guessing a precedence rule.
const LIVE_ROW_CONFLICTING = {
  MediaKey: "2003600763305",
  ResourceName: "Property",
  ResourceRecordKey: "1091333591",
  MediaCategory: null,
  MediaClassification: "PHOTO",
  MediaType: "Jpeg",
  Order: 1,
  ShortDescription: null,
  LongDescription: "floor plan",
  MediaStatus: "Active",
  InternetEntireListingDisplayYN: true,
  MediaURL: "https://cdn.cotality.example/Media/Property/PHOTO-Jpeg/",
};

describe("Media contract — sanitized live-row-derived fixtures (MediaKey/ResourceRecordKey provenance in the fixture comments above)", () => {
  it("[CONFIRMED CORRECT — every signal agrees] LIVE_ROW_PHOTO (MediaKey 2005927277918): MediaCategory/MediaClassification/URL path/LongDescription all say photo", () => {
    expect(classifyMediaItem(LIVE_ROW_PHOTO)).toBe("photo");
    expect(classifyTrestleMediaCategory(LIVE_ROW_PHOTO.MediaCategory)).toBe("Photo");
  });

  it("[CONFIRMED CORRECT — every signal agrees] LIVE_ROW_FLOORPLAN (MediaKey 2005917243395): MediaCategory/MediaClassification/ShortDescription/URL path all say floor plan — the exact live evidence that DOCUMENT classification does not mean 'generic document,' Cotality uses it for FloorPlan rows", () => {
    expect(classifyMediaItem(LIVE_ROW_FLOORPLAN)).toBe("floorplan");
    expect(classifyTrestleMediaCategory(LIVE_ROW_FLOORPLAN.MediaCategory)).toBe("FloorPlan");
  });

  it("[OBSERVED_LIVE_PROVIDER_CONFLICT — semantic result UNVERIFIED, not confirmed correct] LIVE_ROW_CONFLICTING (MediaKey 2003600763305): MediaCategory=null, MediaClassification='PHOTO', and the URL path all say photo, but LongDescription literally says 'floor plan' — classifyMediaItem never reads LongDescription at all, so it never even sees that conflicting signal", () => {
    // PROVIDER ROW FACTS: see LIVE_ROW_CONFLICTING above — the row itself carries
    // conflicting signals; this is not a reconstruction, Cotality sent exactly this.
    expect(LIVE_ROW_CONFLICTING.LongDescription).toBe("floor plan");
    expect(LIVE_ROW_CONFLICTING.MediaClassification).toBe("PHOTO");

    // CURRENT CODE OUTPUT: provable by running the real, unmodified functions.
    expect(classifyMediaItem(LIVE_ROW_CONFLICTING)).toBe("photo");
    expect(classifyTrestleMediaCategory(LIVE_ROW_CONFLICTING.MediaCategory)).toBe("Photo");

    // VERIFIED SEMANTIC RESULT: deliberately NOT asserted as "photo" here. The current
    // code's output is provable; whether this item truly is a photo (vs. a floor plan
    // mislabeled by whoever/whatever wrote "floor plan" into LongDescription) is not —
    // no precedence between MediaClassification and LongDescription is invented by this
    // test. See docs/audits/raw-mapper-media-contract-resolution-2026-10-02.md Section 5.
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
