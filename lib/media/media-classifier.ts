// lib/media/media-classifier.ts
//
// THE single strict media classifier for the unified feed→DB→R2 system.
//
// Category members are the LIVE-verified Cotality `MediaCategory` enum
// (authenticated probe 2026-07-21T06:22Z — 18 members; evidence at
// docs/superpowers/specs/evidence/2026-07-21-live-cotality-contract-probe.json).
// Truth is the live API, never metadata/code/docs.
//
// HARD RULE: nothing defaults to Photo. An unrecognized or absent category
// resolves to `Unknown`, never `Photo`. `Document`/`Unknown` rows are stored but
// never treated as listing photos (no hero, no photo count, no `photos/` R2
// namespace, not mirrored). This closes the collision + wrong-hero defect where
// the legacy classifier mapped every unknown category to Photo.

export type CanonicalMediaType = "Photo" | "FloorPlan" | "Video" | "VirtualTour" | "Document" | "Unknown";

export interface ClassifyMediaInput {
  mediaCategory?: string | null;
  mediaType?: string | null;
  mediaUrl?: string | null;
}

// ─── Live-verified MediaCategory → canonical type (18 members) ──────────────
const CATEGORY_MAP: Record<string, CanonicalMediaType> = {
  photo: "Photo",
  floorplan: "FloorPlan",
  video: "Video",
  aerialview: "Video",
  brandedvirtualtour: "VirtualTour",
  unbrandedvirtualtour: "VirtualTour",
  // document-family (stored, never a listing photo)
  document: "Document",
  disclosure: "Document",
  map: "Document",
  survey: "Document",
  addendum: "Document",
  rentaldocuments: "Document",
  restriction: "Document",
  topography: "Document",
  // present-but-not-a-listing-photo → Unknown (never Photo)
  agentphoto: "Unknown",
  officephoto: "Unknown",
  officelogo: "Unknown",
  other: "Unknown",
};

// MediaType (file format) — consulted ONLY when category is absent.
const IMAGE_TYPES = new Set(["jpeg", "jpg", "png", "gif", "bmp", "tiff", "tif", "webp"]);
const VIDEO_TYPES = new Set(["mp4", "mov", "mpeg", "quicktime", "wmv", "avi", "m4v"]);
const DOCUMENT_TYPES = new Set(["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "rtf", "txt", "wps", "svg"]);

const norm = (v: string | null | undefined): string | null => {
  if (v == null) return null;
  const s = String(v).toLowerCase().trim();
  return s === "" ? null : s;
};

/**
 * Classify one media row. Precedence:
 *   1. MediaCategory (explicit allowlist; unknown → Unknown, NEVER Photo)
 *   2. MediaType (only when category absent; raster → Photo, video/doc types)
 *   3. URL-shape (only when category+type absent; DOCUMENT-/FLOORPLAN/.pdf …)
 *   4. Unknown
 */
export function classifyMedia(input: ClassifyMediaInput): CanonicalMediaType {
  const cat = norm(input.mediaCategory);
  if (cat) return CATEGORY_MAP[cat] ?? "Unknown";

  const type = norm(input.mediaType);
  if (type) {
    if (IMAGE_TYPES.has(type)) return "Photo";
    if (VIDEO_TYPES.has(type)) return "Video";
    if (DOCUMENT_TYPES.has(type)) return "Document";
    return "Unknown";
  }

  const url = norm(input.mediaUrl);
  if (url) {
    if (url.includes("floorplan") || url.includes("floor-plan") || url.includes("floor_plan")) return "FloorPlan";
    if (url.includes("virtualtour") || url.includes("virtual-tour") || url.includes("virtual_tour")) return "VirtualTour";
    if (url.includes("/video") || url.includes("video-")) return "Video";
    if (url.includes("/document") || url.includes("document-") || url.includes("disclosure") || /\.pdf(\?|$)/.test(url)) return "Document";
    if (url.includes("/photo") || url.includes("photo-") || url.includes("/image") || /\.(jpe?g|png|gif|bmp|tiff?|webp)(\?|$)/.test(url)) return "Photo";
  }
  return "Unknown";
}

/** True only for a canonical type that is a displayable LISTING photo. */
export function isListingPhoto(t: CanonicalMediaType): boolean {
  return t === "Photo";
}

/** R2 namespace folder for a canonical type; null = not mirrored (Document/Unknown). */
export function r2FolderFor(t: CanonicalMediaType): "photos" | "floorplans" | "videos" | "virtualtours" | null {
  switch (t) {
    case "Photo": return "photos";
    case "FloorPlan": return "floorplans";
    case "Video": return "videos";
    case "VirtualTour": return "virtualtours";
    default: return null; // Document / Unknown — stored, not mirrored
  }
}
