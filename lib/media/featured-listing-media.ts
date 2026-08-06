/**
 * Featured-card media model.
 *
 * WHY THIS EXISTS
 * ---------------
 * `FeaturedListings` previously ran `listing.media` through
 * `getValidPhotoMedia()` BEFORE the gallery ever saw it — and `PhotoGallery`
 * ran the same filter a second time. That helper is correctly scoped to
 * photo-only hero selection, so Video, VirtualTour and FloorPlan were stripped
 * at the door. The homepage therefore could not display Cotality video or 3D
 * even when the API supplied it.
 *
 * `getValidPhotoMedia()` is deliberately NOT changed. It stays a photo-only
 * helper; this builder is the wider model the featured card needs.
 *
 * The builder is pure and DB-free so it can be tested against a Cotality-shaped
 * fixture without a browser or a database.
 */

import { classifyMediaItem } from '@/lib/media/listing-media-resolver';
import { isValidPublicImageUrl } from '@/lib/media/listing-card-media';

/** Loose input shape — accepts DTO media entries as delivered by /api/listings. */
export interface FeaturedMediaInput {
  url?: unknown;
  mediaType?: unknown;
  mediaCategory?: unknown;
  order?: unknown;
  [key: string]: unknown;
}

export interface FeaturedListingLike {
  media?: readonly FeaturedMediaInput[] | null;
  /** Host-split playable video (UCBA §5(C) unbranded-preferred), from the DTO. */
  videoUrl?: string | null;
  /** Host-split interactive 3D tour, from the DTO. */
  virtualTourURL?: string | null;
}

export interface FeaturedPhoto {
  url: string;
  order: number;
}

export interface FeaturedListingMedia {
  /** Every valid photo, in provider order. Floor plans are NEVER included. */
  photos: FeaturedPhoto[];
  /** First playable video, if any. */
  videoUrl: string | null;
  /** First interactive 3D tour, if any. */
  virtualTourUrl: string | null;
  /** True photo count for the "Photos N" control. */
  photoCount: number;
  hasVideo: boolean;
  hasVirtualTour: boolean;
}

/**
 * Normalized identity for de-duplication.
 *
 * Compares on origin + pathname with the query string dropped, lower-cased, so
 * the same asset arriving once as a Media record and again via `videoUrl`
 * collapses to one entry. A malformed URL falls back to its trimmed raw form
 * rather than throwing.
 */
function normalizeForDedupe(url: string): string {
  const raw = url.trim();
  try {
    const u = new URL(raw);
    return `${u.origin}${u.pathname}`.replace(/\/+$/, '').toLowerCase();
  } catch {
    return raw.replace(/\?[^#]*$/, '').toLowerCase();
  }
}

function readUrl(item: FeaturedMediaInput): string | null {
  const raw = item?.url;
  if (!isValidPublicImageUrl(raw)) return null;
  return String(raw).trim();
}

/**
 * Build the featured card's media model.
 *
 * Order of authority for video / 3D: a CLASSIFIED Media record wins, and the
 * DTO's host-split `videoUrl` / `virtualTourURL` are appended only when that
 * class produced nothing. The DTO fields already resolve the primary unbranded
 * field, the secondary and third fields, and the branded fallback — so this
 * builder never inspects `VirtualTourURLUnbranded2/3` itself.
 */
export function buildFeaturedListingMedia(
  listing: FeaturedListingLike | null | undefined,
): FeaturedListingMedia {
  const photos: FeaturedPhoto[] = [];
  let videoUrl: string | null = null;
  let virtualTourUrl: string | null = null;

  // One dedupe namespace across every class: an asset offered twice — say a
  // tour present both as a Media row and as `virtualTourURL` — must appear once.
  const seen = new Set<string>();

  const items = Array.isArray(listing?.media) ? listing!.media! : [];
  for (const item of items) {
    const url = readUrl(item);
    if (!url) continue; // rejects unsafe / non-HTTP / whitespace URLs
    const key = normalizeForDedupe(url);
    if (seen.has(key)) continue;

    const cls = classifyMediaItem(item);
    if (cls === 'photo') {
      seen.add(key);
      const rawOrder = Number(item?.order);
      photos.push({ url, order: Number.isFinite(rawOrder) ? rawOrder : photos.length });
    } else if (cls === 'video') {
      seen.add(key);
      if (!videoUrl) videoUrl = url;
    } else if (cls === 'virtualTour') {
      seen.add(key);
      if (!virtualTourUrl) virtualTourUrl = url;
    }
    // 'floorplan' and 'unknown' are intentionally dropped: a floor plan is not a
    // photograph and must never enter the photo carousel or become the hero.
  }

  // Provider order, stable for equal orders.
  photos.sort((a, b) => a.order - b.order);

  // DTO fallbacks — only when no Media record of that class supplied one.
  const dtoVideo = listing?.videoUrl;
  if (!videoUrl && isValidPublicImageUrl(dtoVideo)) {
    const u = String(dtoVideo).trim();
    if (!seen.has(normalizeForDedupe(u))) {
      seen.add(normalizeForDedupe(u));
      videoUrl = u;
    }
  }
  const dtoTour = listing?.virtualTourURL;
  if (!virtualTourUrl && isValidPublicImageUrl(dtoTour)) {
    const u = String(dtoTour).trim();
    if (!seen.has(normalizeForDedupe(u))) {
      seen.add(normalizeForDedupe(u));
      virtualTourUrl = u;
    }
  }

  return {
    photos,
    videoUrl,
    virtualTourUrl,
    photoCount: photos.length,
    hasVideo: Boolean(videoUrl),
    hasVirtualTour: Boolean(virtualTourUrl),
  };
}
