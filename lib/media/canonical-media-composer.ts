/**
 * CANONICAL MEDIA COMPOSER — the single place that combines Mallan's two media
 * authorities into one view for the website, CRM, cards, reports and CMA.
 *
 *   listing_media          = ASSETS   (Photo, FloorPlan, and any real
 *                                      Media-resource Video/VirtualTour)
 *   listing_external_media = LINKS    (YouTube/Vimeo video, Matterport/iGuide
 *                                      tour, and safe-but-unclassified URLs)
 *
 * Both are PRELOADED by the caller. This module performs ZERO database queries,
 * which is what keeps a page of N cards from becoming N extra round-trips.
 *
 * It reuses `classifyMediaItem` from listing-media-resolver for assets and
 * `kind` from the canonical external-media classifier for links — there is no
 * second taxonomy here.
 */
import { classifyMediaItem, type MediaClass } from './listing-media-resolver';
import {
  dedupeForPresentation,
  isSafeExternalUrl,
  type ExternalMediaKind,
  type ExternalMediaSource,
} from './external-media';

/** A `listing_media` row, narrowed to what composition needs. */
export interface ComposerAssetRow {
  media_key: string | null;
  media_type: string;
  media_category?: string | null;
  media_classification?: string | null;
  media_url_original?: string | null;
  media_url_cached?: string | null;
  order?: number;
  preferred_photo_yn?: boolean;
  status?: string;
  r2_key?: string | null;
}

/** A `listing_external_media` row. */
export interface ComposerExternalRow {
  source: ExternalMediaSource;
  source_key: string;
  url: string;
  branded: boolean;
  kind: ExternalMediaKind;
}

export interface ComposedExternalRef {
  url: string;
  kind: ExternalMediaKind;
  branded: boolean;
  source: ExternalMediaSource;
  source_key: string;
}

export interface ComposedMedia {
  /** Active canonical photos, provider order preserved. */
  photos: ComposerAssetRow[];
  floorPlans: ComposerAssetRow[];
  /** Real Media-resource video/tour ASSETS — distinct from external links. */
  videoAssets: ComposerAssetRow[];
  tourAssets: ComposerAssetRow[];
  /** Hero: an ACTIVE canonical Photo, or null. Never a floorplan/video/tour. */
  hero: ComposerAssetRow | null;
  photoCount: number;
  /** Deduped for presentation; unbranded wins an equivalent branded URL. */
  videos: ComposedExternalRef[];
  virtualTours: ComposedExternalRef[];
  /** Safe URLs whose class is unproven. Preserved, never labelled video/tour. */
  unknownExternal: ComposedExternalRef[];
  hasVideo: boolean;
  hasVirtualTour: boolean;
}

function isActive(r: ComposerAssetRow): boolean {
  return (r.status ?? 'active') === 'active';
}

/**
 * Asset class via the existing resolver taxonomy — no second classifier.
 *
 * The key names matter. `classifyMediaItem` derives its category from
 * `MediaCategory ?? mediaCategory ?? category ?? mediaType` — note the LOWERCASE
 * `mediaType`; a `MediaType` key is not in that chain and silently yields an
 * empty category, which defaults to `photo`. Passing the relational
 * `media_type` under the wrong casing therefore turns every FloorPlan into a
 * photo, inflating photo_count and letting a floorplan win hero selection.
 *
 * The URL is supplied too so the resolver's floor-plan/document URL-shape
 * detection still works for rows whose category is empty or mistagged.
 */
function assetClass(r: ComposerAssetRow): MediaClass {
  return classifyMediaItem({
    MediaCategory: r.media_category ?? undefined,
    mediaType: r.media_type,
    MediaClassification: r.media_classification ?? undefined,
    MediaURL: r.media_url_original ?? r.media_url_cached ?? undefined,
  });
}

function byOrder(a: ComposerAssetRow, b: ComposerAssetRow): number {
  return (a.order ?? 0) - (b.order ?? 0);
}

function toRef(r: ComposerExternalRow): ComposedExternalRef {
  return {
    // Storage writers normalize today, but presentation stays defensive for
    // historical/CRM rows. The dedupe identity is trimmed too, so returning the
    // same normalized value prevents whitespace variants from leaking back as
    // visually duplicated embeds.
    url: r.url.trim(),
    kind: r.kind,
    branded: r.branded,
    source: r.source,
    source_key: r.source_key,
  };
}

/**
 * Compose one listing's media. Pure: no I/O, no Prisma, no fetch.
 *
 * Hero selection filters to ACTIVE + canonical Photo BEFORE consulting
 * `preferred_photo_yn`, so a FloorPlan or a deleted row carrying a source
 * PreferredPhotoYN flag can never become the hero. Those flags are source
 * metadata and are left untouched rather than rewritten.
 */
export function composeListingMedia(
  assets: readonly ComposerAssetRow[],
  external: readonly ComposerExternalRow[],
): ComposedMedia {
  const active = assets.filter(isActive);

  const photos: ComposerAssetRow[] = [];
  const floorPlans: ComposerAssetRow[] = [];
  const videoAssets: ComposerAssetRow[] = [];
  const tourAssets: ComposerAssetRow[] = [];

  for (const row of active) {
    switch (assetClass(row)) {
      case 'photo':
        photos.push(row);
        break;
      case 'floorplan':
        floorPlans.push(row);
        break;
      case 'video':
        videoAssets.push(row);
        break;
      case 'virtualTour':
        tourAssets.push(row);
        break;
      default:
        break; // unknown asset class: retained in listing_media, not surfaced here
    }
  }

  photos.sort(byOrder);
  floorPlans.sort(byOrder);
  videoAssets.sort(byOrder);
  tourAssets.sort(byOrder);

  // Hero: preferred flag only breaks ties WITHIN active canonical photos.
  const hero = photos.find((p) => p.preferred_photo_yn === true) ?? photos[0] ?? null;

  // External links: drop anything unsafe before it can reach a player or iframe,
  // then dedupe for presentation only (storage stays source-faithful).
  const safe = external.filter((r) => isSafeExternalUrl(r.url));
  const shown = dedupeForPresentation(safe);

  const videos = shown.filter((r) => r.kind === 'video').map(toRef);
  const virtualTours = shown.filter((r) => r.kind === 'virtual_tour').map(toRef);
  const unknownExternal = shown.filter((r) => r.kind === 'unknown').map(toRef);

  return {
    photos,
    floorPlans,
    videoAssets,
    tourAssets,
    hero,
    photoCount: photos.length,
    videos,
    virtualTours,
    unknownExternal,
    // A real Media-resource asset counts too — the badge reflects capability,
    // not which authority happened to supply it.
    hasVideo: videos.length > 0 || videoAssets.length > 0,
    hasVirtualTour: virtualTours.length > 0 || tourAssets.length > 0,
  };
}
