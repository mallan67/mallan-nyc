// lib/media/listing-media-resolver.ts
//
// Shared media classification + ordering helper used by every surface that
// renders listing imagery (public DTO, CRM mapper, /api/media/batch, search
// route inline-media backfill).
//
// THE PROBLEM THIS SOLVES
//
// Trestle's Media resource interleaves Photos, FloorPlans, Videos, and 3D
// items in arbitrary provider order. Surfaces that picked `media[0]` as the
// primary image were occasionally serving a FloorPlan or "placeholder-shaped"
// document because Trestle returned it first. The /api/media/batch detail
// mode also used `$orderby=MediaCategory asc,Order asc` — `FloorPlan` sorts
// alphabetically BEFORE `Photo`, so detail-panel galleries opened on a
// floor plan instead of a hero shot.
//
// THE RULE
//
// Every consumer goes through this module. The pipeline is:
//   1. Classify each item — `photo` | `floorplan` | `video` | `virtualTour` |
//      `unknown` — using the same heuristics for raw Trestle Media records,
//      DB JSONB rows, and CRM-mapper output.
//   2. Sort by class first (photos before floorplans before videos before
//      virtualTours before unknown), preserving provider order WITHIN each
//      class.
//   3. The first photo (real photo, after sort) is the primary. Mark its
//      `isPrimary` true; everything else false.
//   4. If no photo exists, fall back to the first floorplan, then video, then
//      virtual tour, then any remaining item, then null.
//   5. Trestle URLs are proxied through `/api/media/proxy?url=` so the WAF
//      doesn't block cross-origin <img> requests.
//
// AVM, ConsumerComment, owner_opt_out, participant_only have NOTHING to do
// with this module — they are gates evaluated separately in
// lib/compliance/gates.ts. This module deals only with which media item to
// show first; it does NOT decide whether the listing is displayable at all.

export type MediaClass = 'photo' | 'floorplan' | 'video' | 'virtualTour' | 'unknown';

const CLASS_PRIORITY: Record<MediaClass, number> = {
  photo: 0,
  floorplan: 1,
  video: 2,
  virtualTour: 3,
  unknown: 4,
};

/**
 * Hostnames whose URLs require server-side Bearer auth and must be proxied.
 *
 * We match the second-level domain (cotality.com / corelogic.com) so any
 * subdomain — `api.cotality.com`, `img.cotality.com`, future CDN hosts —
 * routes through the proxy. Mirrors the prior substring-matching behavior at
 * lib/search/crm-idx-mapper.ts and lib/idx/public-dto.ts which the resolver
 * replaces.
 */
const TRESTLE_PROXY_HOST_SUFFIXES = ['cotality.com', 'corelogic.com'];

/**
 * Trestle URL convention for FloorPlan media. Trestle stores floor-plan
 * documents under `/Media/Property/DOCUMENT-Gif/...`, `/DOCUMENT-Jpeg/...`,
 * `/DOCUMENT-Pdf/...`, `/DOCUMENT-Png/...` paths — distinct from
 * `/Media/Property/PHOTO-Jpeg/...` for actual photos.
 *
 * Some Media records ship from Trestle with `MediaCategory: null` even when
 * the URL is clearly a DOCUMENT- (FloorPlan). The default-to-Photo fallback
 * at the bottom of `classifyMediaItem` then misclassifies them, and after
 * the 2026-05-08 audit we counted 243 active listings rendering a FloorPlan
 * as the hero photo on cards because of this exact pattern.
 *
 * The pattern is anchored to `/Media/Property/DOCUMENT-` so it never matches
 * other URLs that happen to contain the word "DOCUMENT" — only Trestle's
 * documented URL shape.
 */
const TRESTLE_DOCUMENT_URL_PATTERN = /\/Media\/Property\/DOCUMENT-(Gif|Jpeg|Png|Pdf)\//i;

/**
 * Normalised media item used by every consumer.
 *
 * `providerOrder` is the original numeric Order field (or array index when
 * Trestle didn't supply one). Used for stable in-class sorting. `class` is
 * the canonical category; `mediaType` is its display-friendly form for older
 * consumers.
 */
export interface ResolvedMedia {
  url: string;
  mediaType: 'Photo' | 'FloorPlan' | 'Video' | 'VirtualTour' | 'Unknown';
  class: MediaClass;
  providerOrder: number;
  isPrimary: boolean;
  /** PreferredPhotoYN was true on the source row (Trestle's hint for hero photo). */
  preferred?: boolean;
}

export interface ResolveListingMediaOptions {
  mapUrl?: (rawUrl: string) => string;
}

/** Heuristic classification — works against raw Trestle Media records, DB JSONB, or DTO shapes. */
export function classifyMediaItem(raw: unknown): MediaClass {
  if (!raw || typeof raw !== 'object') return 'unknown';
  const m = raw as Record<string, unknown>;
  const cat = String(m.MediaCategory ?? m.mediaCategory ?? m.category ?? m.mediaType ?? '').toLowerCase();
  const cls = String(m.MediaClassification ?? m.mediaClassification ?? '').toLowerCase();
  const desc = String(m.ShortDescription ?? m.shortDescription ?? m.caption ?? '').toLowerCase();
  const url = String(m.MediaURL ?? m.mediaUrl ?? m.url ?? '').toLowerCase();

  // Floor plan signals (multiple to catch Trestle's inconsistent tagging)
  if (
    cat === 'floorplan' || cat.includes('floor plan') || cat.includes('floor_plan') || cat === 'floor plan' ||
    cls === 'document' ||
    desc.includes('floorplan') || desc.includes('floor plan') ||
    /\/floorplans?\//i.test(url) ||
    TRESTLE_DOCUMENT_URL_PATTERN.test(url)
  ) {
    return 'floorplan';
  }

  if (cat === 'video' || cat.includes('video') || /\.(mp4|mov|webm)(\?|$)/i.test(url)) {
    return 'video';
  }
  if (cat === 'virtualtour' || cat.includes('virtual tour') || cat === 'virtual tour') {
    return 'virtualTour';
  }
  if (cat === 'photo' || cat === 'image' || cat === '' /* default Trestle Media is Photo */) {
    return 'photo';
  }
  return 'unknown';
}

const CLASS_TO_DISPLAY: Record<MediaClass, ResolvedMedia['mediaType']> = {
  photo: 'Photo',
  floorplan: 'FloorPlan',
  video: 'Video',
  virtualTour: 'VirtualTour',
  unknown: 'Unknown',
};

/** Wrap Trestle/CoreLogic media URLs with the bearer-auth proxy. Pass through otherwise. */
export function proxyTrestleUrl(url: string): string {
  if (!url) return url;
  try {
    const host = new URL(url).hostname.toLowerCase();
    const matches = TRESTLE_PROXY_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith('.' + suffix),
    );
    if (matches) {
      return `/api/media/proxy?url=${encodeURIComponent(url)}`;
    }
  } catch {
    return url;
  }
  return url;
}

/**
 * Normalise + sort a media list so consumers can render it directly.
 *
 * Input may be: raw Trestle Media records (`MediaURL`, `MediaCategory`, …),
 * DB JSONB items (`url`, `mediaType`, `order`), or pre-mapped DTO entries.
 * The function tolerates all three shapes.
 *
 * Output is sorted photo-first (then floorplan, video, virtualTour, unknown),
 * preserving provider order within each class. Exactly one entry has
 * `isPrimary: true` — the first photo (or first floorplan if no photos
 * exist, etc.). If the input is empty, returns [].
 *
 * URLs are proxied through `/api/media/proxy?url=` when the host is a
 * Trestle/CoreLogic domain.
 */
export function resolveListingMedia(items: unknown, options: ResolveListingMediaOptions = {}): ResolvedMedia[] {
  if (!Array.isArray(items)) return [];
  const decorated = items
    .map((raw, idx) => {
      if (!raw || typeof raw !== 'object') return null;
      const m = raw as Record<string, unknown>;
      const rawUrl = String(m.MediaURL ?? m.mediaUrl ?? m.url ?? '').trim();
      if (!rawUrl) return null;
      const klass = classifyMediaItem(raw);
      const orderRaw = m.Order ?? m.order;
      const orderNum = orderRaw === '' || orderRaw == null || Number.isNaN(Number(orderRaw))
        ? idx
        : Number(orderRaw);
      const preferred =
        m.PreferredPhotoYN === true || m.PreferredPhotoYN === 'true' ||
        m.preferred === true || m.isPrimary === true;
      return {
        url: options.mapUrl ? options.mapUrl(rawUrl) : proxyTrestleUrl(rawUrl),
        klass,
        providerOrder: preferred && klass === 'photo' ? -1 : orderNum,
        idx,
        preferred,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  decorated.sort((a, b) => {
    const cp = CLASS_PRIORITY[a.klass] - CLASS_PRIORITY[b.klass];
    if (cp !== 0) return cp;
    if (a.providerOrder !== b.providerOrder) return a.providerOrder - b.providerOrder;
    return a.idx - b.idx;
  });

  return decorated.map((d, i) => ({
    url: d.url,
    mediaType: CLASS_TO_DISPLAY[d.klass],
    class: d.klass,
    providerOrder: d.providerOrder,
    isPrimary: i === 0,
    preferred: d.preferred,
  }));
}

/**
 * Pick the URL of the primary photo from a media list.
 *
 * Returns the first photo, or null if none exist. Use this for surfaces that
 * MUST show a real photo (e.g., featured carousel hero) and would rather
 * render a placeholder than a floor plan.
 *
 * For surfaces that are happy to fall back to a floor plan or other media
 * when no photo is available, use `resolveListingMedia(items)[0]?.url`
 * instead.
 */
export function pickPrimaryPhotoUrl(items: unknown): string | null {
  const resolved = resolveListingMedia(items);
  const photo = resolved.find(m => m.class === 'photo');
  return photo?.url ?? null;
}

/**
 * Pick the URL of the best available media item for a card thumbnail.
 *
 * Photo first, then floor plan, then any other media, then null. Use this
 * for surfaces that prefer to show SOMETHING (even a floor plan) over a
 * placeholder.
 */
export function pickBestThumbnailUrl(items: unknown): string | null {
  const resolved = resolveListingMedia(items);
  return resolved[0]?.url ?? null;
}

/**
 * Shape of a `listing_media` table row as read from Prisma.
 *
 * Decoupled from the generated Prisma client type so this module stays usable
 * from environments that don't bundle Prisma (tests, isolated mappers). The
 * field set is the subset the public reader needs — the resolver does NOT
 * read R2 timestamps, retry counters, dimensions, or audit fields.
 *
 * `media_url_cached` is the R2-mirrored public URL (preferred when present);
 * `media_url_original` is the Trestle source URL (used as fallback and as the
 * canonical reference for the proxy). When both are null the row is skipped.
 *
 * `status` is one of `'active' | 'deleted' | 'replaced'` per the schema's
 * soft-delete convention. Only `'active'` rows reach the public surface.
 */
export interface ListingMediaTableRow {
  media_url_original: string | null;
  media_url_cached: string | null;
  media_type: string;
  media_category: string | null;
  media_classification: string | null;
  order: number;
  preferred_photo_yn: boolean;
  status: string;
}

/**
 * Resolve a listing's media list from `listing_media` table rows.
 *
 * Prefers the R2-cached URL when populated — R2 URLs are public, already on a
 * CDN, and don't need bearer-auth proxying. Falls back to the Trestle
 * original URL when R2 isn't ready yet; the resolver then wraps Trestle hosts
 * with `/api/media/proxy` via {@link proxyTrestleUrl}.
 *
 * Only rows with `status === 'active'` are considered. The remaining rows
 * flow through the same classify→sort pipeline as raw Trestle / JSON inputs,
 * so FloorPlan, Video, VirtualTour, and Photo ordering match the legacy
 * surface exactly.
 *
 * PR 4 reader-swap path. Public consumers should call this first and fall
 * back to {@link resolveListingMedia} against the legacy `Listing.media` JSON
 * only when the table returns empty.
 */
export function resolveListingMediaFromRows(rows: ListingMediaTableRow[]): ResolvedMedia[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const active = rows.filter((r) => r && r.status === 'active');
  if (active.length === 0) return [];
  const items = active
    .map((r) => {
      const url = (r.media_url_cached || r.media_url_original || '').trim();
      if (!url) return null;
      return {
        MediaURL: url,
        // Pass both signals so classifyMediaItem can prefer MediaCategory when
        // present (Trestle's content-type tag) but still recognise FloorPlan /
        // Video / VirtualTour from media_type when category is null.
        MediaCategory: r.media_category ?? r.media_type,
        MediaClassification: r.media_classification,
        mediaType: r.media_type,
        Order: r.order,
        PreferredPhotoYN: r.preferred_photo_yn,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  return resolveListingMedia(items);
}

/** Listing context the media-fallback gate needs to tell a CRM-exclusive
 * (authoritative CRM media) from a Trestle-synced IDX/RLS listing (where CRM
 * rows are only supplemental). */
export interface MediaFallbackContext {
  /** Trestle MLS id. Present ⇒ Trestle-synced IDX/RLS listing; null/empty ⇒
   * CRM-created (Mallan exclusive). Mirrors the repo's `isCrmCreated = !mls_id`. */
  mlsId?: string | null;
  /** Listing id. CRM exclusives use the `SL-`/`RL-` namespace; IDX rows use RLS keys. */
  listingId?: string | null;
}

/**
 * Whether the detail page may fall back to a LIVE Trestle media fetch
 * (`fetchListingMedia`) when the relational rows resolve to zero photos.
 *
 * The `listing_media` table is AUTHORITATIVE only for a CRM-exclusive listing
 * (Mallan-owned media): there, CRM rows existing — even all soft-deleted — must
 * suppress the live fetch, or deleted CRM photos resurrect (the path Codex
 * found after #281/#282).
 *
 * On a Trestle-synced IDX/RLS listing, CRM rows are SUPPLEMENTAL — an agent may
 * have added only a CRM floor plan/video. Those must NOT suppress the live
 * Trestle photo fallback, or the listing loses its real RLS photos (the mixed
 * IDX/CRM edge case Codex found in #282). So we only treat CRM rows as
 * authoritative when the listing itself is CRM-created.
 *
 * CRM-created is detected by the absence of a Trestle `mls_id` (mirrors
 * `isCrmCreated = !mls_id` used by the CRM write routes), with the `SL-`/`RL-`
 * id namespace as a reinforcing signal. `rls_eligible` is deliberately NOT used
 * — an RLS-eligible Mallan exclusive still owns its CRM media.
 *
 * @param rows       listing_media rows fetched alongside the listing (any status)
 * @param photoCount number of resolved Photo items already in hand
 * @param ctx        listing context (mls_id / listing_id)
 */
export function shouldFetchTrestleMediaFallback(
  rows: ReadonlyArray<{ media_key?: string | null }>,
  photoCount: number,
  ctx: MediaFallbackContext,
): boolean {
  if (photoCount > 0) return false;
  const hasCrmRows =
    Array.isArray(rows) &&
    rows.some((r) => typeof r?.media_key === 'string' && r.media_key.startsWith('crm:'));
  // No CRM rows at all → IDX/un-synced → live fallback allowed.
  if (!hasCrmRows) return true;
  // CRM rows present. Authoritative ONLY for a CRM-created (exclusive) listing.
  const listingId = String(ctx?.listingId || '');
  const isCrmAuthoritative = !ctx?.mlsId || /^(SL|RL)-/i.test(listingId);
  // CRM-exclusive → suppress (authoritative table). IDX/RLS-backed with merely
  // supplemental CRM rows → allow the live Trestle photo fallback.
  return !isCrmAuthoritative;
}
