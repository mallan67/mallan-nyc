// lib/media/hero-resolver.ts
//
// THE single hero-selection + gallery-ordering authority for the unified
// system. Every rendering surface (listing detail, search cards, featured,
// agent listings, similar, /api/listings, CRM cards/reports) must consume this
// — no divergent implementation is permitted (enforced by a source-scan test in
// Phase 6). Note: CRM is a rendering surface here, not a source of media-contract
// truth; the media contract is the live Cotality API alone.
//
// Rule (live-grounded, probe 2026-07-21): the hero is the first ACTIVE Photo by
//   PreferredPhotoYN (true wins; null/false = not-preferred) →
//   lowest valid Order (null sorts last) →
//   stable MediaKey (deterministic final tiebreak).
// A FloorPlan / Video / Document / VirtualTour can NEVER be the hero.

import { isListingPhoto, type CanonicalMediaType } from "./media-classifier";

export interface HeroCandidate {
  mediaKey: string;
  canonicalType: CanonicalMediaType;
  order: number | null;
  preferredPhotoYN: boolean | null;
}

// Preferred ranking: true(0) beats null/false(1). null === not-preferred (live).
const preferredRank = (p: boolean | null): number => (p === true ? 0 : 1);
// null order sorts last.
const orderKey = (o: number | null): number => (o == null ? Number.POSITIVE_INFINITY : o);

/** Compare two photo candidates by the hero rule (preferred → order → mediaKey). */
function comparePhotos(a: HeroCandidate, b: HeroCandidate): number {
  const pr = preferredRank(a.preferredPhotoYN) - preferredRank(b.preferredPhotoYN);
  if (pr !== 0) return pr;
  const or = orderKey(a.order) - orderKey(b.order);
  if (or !== 0) return or;
  return a.mediaKey.localeCompare(b.mediaKey);
}

/** The hero photo, or null if there is no active listing photo. */
export function selectHero(candidates: HeroCandidate[]): HeroCandidate | null {
  const photos = candidates.filter((c) => isListingPhoto(c.canonicalType));
  if (photos.length === 0) return null;
  return photos.slice().sort(comparePhotos)[0];
}

// Non-photo display order: FloorPlan, VirtualTour, Video (Document/Unknown excluded).
const NONPHOTO_ORDER: Record<string, number> = { FloorPlan: 0, VirtualTour: 1, Video: 2 };
const isGalleryNonPhoto = (t: CanonicalMediaType) => t in NONPHOTO_ORDER;

/**
 * Ordered gallery: photos first (hero rule), then displayable non-photo media
 * (floor plans, tours, videos) in a stable order. Document/Unknown are excluded
 * from the gallery (they are stored but not rendered as gallery items).
 */
export function sortGallery(candidates: HeroCandidate[]): HeroCandidate[] {
  const photos = candidates.filter((c) => isListingPhoto(c.canonicalType)).slice().sort(comparePhotos);
  const nonPhotos = candidates
    .filter((c) => isGalleryNonPhoto(c.canonicalType))
    .slice()
    .sort((a, b) => {
      const t = NONPHOTO_ORDER[a.canonicalType] - NONPHOTO_ORDER[b.canonicalType];
      if (t !== 0) return t;
      const or = orderKey(a.order) - orderKey(b.order);
      return or !== 0 ? or : a.mediaKey.localeCompare(b.mediaKey);
    });
  return [...photos, ...nonPhotos];
}
