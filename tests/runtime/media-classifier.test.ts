/**
 * Unified system — Phase 1, Task 1: strict media classifier.
 *
 * The classifier NEVER defaults an unrecognized/absent category to Photo.
 * Category members are the live-verified Cotality MediaCategory enum
 * (probe 2026-07-21T06:22Z; docs/superpowers/specs/evidence/…): 18 members.
 * No DB / network — pure function.
 */
import { classifyMedia, type CanonicalMediaType } from "@/lib/media/media-classifier";

describe("classifyMedia — strict, never defaults to Photo", () => {
  it("maps each live Cotality MediaCategory member to a canonical type", () => {
    expect(classifyMedia({ mediaCategory: "Photo" })).toBe("Photo");
    expect(classifyMedia({ mediaCategory: "FloorPlan" })).toBe("FloorPlan");
    expect(classifyMedia({ mediaCategory: "Video" })).toBe("Video");
    expect(classifyMedia({ mediaCategory: "AerialView" })).toBe("Video");
    expect(classifyMedia({ mediaCategory: "BrandedVirtualTour" })).toBe("VirtualTour");
    expect(classifyMedia({ mediaCategory: "UnbrandedVirtualTour" })).toBe("VirtualTour");
    for (const doc of ["Document", "Disclosure", "Map", "Survey", "Addendum", "RentalDocuments", "Restriction", "Topography"]) {
      expect(classifyMedia({ mediaCategory: doc })).toBe("Document");
    }
    for (const other of ["AgentPhoto", "OfficePhoto", "OfficeLogo", "Other"]) {
      expect(classifyMedia({ mediaCategory: other })).toBe("Unknown");
    }
  });

  it("NEVER defaults an unrecognized/absent category to Photo", () => {
    expect(classifyMedia({ mediaCategory: "SomethingNew" })).toBe("Unknown");
    expect(classifyMedia({ mediaCategory: "" })).toBe("Unknown");
    expect(classifyMedia({ mediaCategory: null })).toBe("Unknown");
    expect(classifyMedia({})).toBe("Unknown");
  });

  it("is case/whitespace tolerant on the category", () => {
    expect(classifyMedia({ mediaCategory: "  floorplan " })).toBe("FloorPlan");
    expect(classifyMedia({ mediaCategory: "PHOTO" })).toBe("Photo");
  });

  it("uses MediaType ONLY when category is absent (raster image → Photo)", () => {
    expect(classifyMedia({ mediaCategory: null, mediaType: "Jpeg" })).toBe("Photo");
    expect(classifyMedia({ mediaCategory: null, mediaType: "Png" })).toBe("Photo");
    expect(classifyMedia({ mediaCategory: null, mediaType: "Gif" })).toBe("Photo");
    expect(classifyMedia({ mediaCategory: null, mediaType: "Pdf" })).toBe("Document");
    expect(classifyMedia({ mediaCategory: null, mediaType: "Mp4" })).toBe("Video");
    expect(classifyMedia({ mediaCategory: null, mediaType: "weirdtype" })).toBe("Unknown");
    // category ALWAYS wins over type
    expect(classifyMedia({ mediaCategory: "FloorPlan", mediaType: "Jpeg" })).toBe("FloorPlan");
  });

  it("URL-shape fallback catches a null-category floor plan/document", () => {
    expect(classifyMedia({ mediaCategory: null, mediaType: null, mediaUrl: "https://api.cotality.com/trestle/Media/Property/DOCUMENT-Pdf/1/1/x" })).toBe("Document");
    // a floor-plan path wins over the file extension (path category > format)
    expect(classifyMedia({ mediaCategory: null, mediaUrl: "https://cdn/floorplan/a.pdf" })).toBe("FloorPlan");
    expect(classifyMedia({ mediaCategory: null, mediaUrl: "https://cdn/floor-plan/a.png" })).toBe("FloorPlan");
    // a pure disclosure/document path with no floorplan token → Document
    expect(classifyMedia({ mediaCategory: null, mediaUrl: "https://cdn/disclosures/x.pdf" })).toBe("Document");
    // a genuine photo URL with no category still needs a positive raster signal, not a default
    expect(classifyMedia({ mediaCategory: null, mediaUrl: "https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1/1/x.jpg" })).toBe("Photo");
  });

  it("exposes the canonical union including Document + Unknown", () => {
    const t: CanonicalMediaType[] = ["Photo", "FloorPlan", "Video", "VirtualTour", "Document", "Unknown"];
    expect(t).toHaveLength(6);
  });
});
