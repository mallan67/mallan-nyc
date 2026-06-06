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
  /** Full-size display URL — used for the MAIN gallery image and the lightbox.
   *  For CRM uploads this is the 1600px `-hero.webp` variant. */
  url: string;
  /** Small display URL — used for the thumbnail strip / card grids. For CRM
   *  uploads this is the 800px `-card.webp` variant. Defaults to `url` when the
   *  source has no distinct small variant (Trestle/legacy) so consumers can
   *  always read it. */
  thumbUrl: string;
  mediaType: 'Photo' | 'FloorPlan' | 'Video' | 'VirtualTour' | 'Unknown';
  class: MediaClass;
  providerOrder: number;
  isPrimary: boolean;
  /** PreferredPhotoYN was true on the source row (Trestle's hint for hero photo). */
  preferred?: boolean;
}

export interface ResolveListingMediaOptions {
  mapUrl?: (rawUrl: string) => string;
  /**
   * Skip the display-URL dedupe pass. Used by {@link resolveListingMediaFromRows},
   * which has ALREADY collapsed rows by the richer `(cached, original)` visual
   * identity — there, two genuinely-distinct photos can legitimately share a
   * cached display URL, and a second dedupe on the display URL would wrongly
   * merge them (regression caught by media-display-p0, 2026-06-06).
   */
  skipDedupe?: boolean;
}

/** Heuristic classification — works against raw Trestle Media records, DB JSONB, or DTO shapes. */
export function classifyMediaItem(raw: unknown): MediaClass {
  if (!raw || typeof raw !== 'object') return 'unknown';
  const m = raw as Record<string, unknown>;
  const cat = String(m.MediaCategory ?? m.mediaCategory ?? m.category ?? m.mediaType ?? '').toLowerCase();
  const cls = String(m.MediaClassification ?? m.mediaClassification ?? '').toLowerCase();
  const desc = String(m.ShortDescription ?? m.shortDescription ?? m.caption ?? '').toLowerCase();
  const url = String(m.MediaURL ?? m.mediaUrl ?? m.url ?? '').toLowerCase();

  // Floor plan / document signals (multiple to catch Trestle's inconsistent
  // tagging AND the legacy `listings.media` JSON, where ~2,000 first-position
  // items are floor plans/documents carrying an EMPTY MediaCategory. Without
  // URL-shape detection those fall through to the `cat === ''` photo default
  // below and become a card hero (PR-Hero, 2026-06-06). The URL checks are
  // conservative — `floorplan`/`floor_plan`/`floor plan` tokens, `.pdf`
  // documents, and `/site-plan/`÷`/diagram/` path/filename forms — none of
  // which appear in a real listing photo URL.
  if (
    cat === 'floorplan' || cat.includes('floor plan') || cat.includes('floor_plan') || cat === 'floor plan' ||
    cls === 'document' ||
    desc.includes('floorplan') || desc.includes('floor plan') ||
    /\/floorplans?\//i.test(url) ||
    /floor[\s_-]?plans?/i.test(url) ||
    /\.pdf(\?|$)/i.test(url) ||
    /(?:^|[/_-])(?:site[\s_-]?plans?|diagrams?)(?:[/_.-]|$)/i.test(url) ||
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

/**
 * R2 variant suffix the CRM upload route writes: `…/{timestamp}-{hero|card|thumb}.webp`.
 * The optimizer emits all three sizes (hero 1600px / card 800px / thumb 400px)
 * to the same path, so given any one variant URL we can address its siblings.
 */
const R2_VARIANT_RE = /-(hero|card|thumb)\.webp(\?[^#]*)?$/i;

/** Swap an R2 variant URL to another size. Returns null for non-variant URLs
 *  (Trestle source URLs, legacy `.jpg`) so callers fall back cleanly. */
export function toVariant(url: string, variant: 'hero' | 'card' | 'thumb'): string | null {
  if (!url || !R2_VARIANT_RE.test(url)) return null;
  return url.replace(R2_VARIANT_RE, `-${variant}.webp$2`);
}

/**
 * Full-size URL for the main image + lightbox. Prefers an explicit `-hero.webp`
 * (the upload route stores the 1600px hero in `media_url_original`); otherwise
 * derives the hero sibling from a `-card`/`-thumb` variant — no re-upload needed
 * because the optimizer already wrote all three. Falls back to the stored URL
 * for Trestle/legacy media (no variant naming → main == thumb, unchanged).
 */
export function pickFullSizeUrl(cached: string, original: string): string {
  if (/-hero\.webp(\?|$)/i.test(original)) return original;
  if (/-hero\.webp(\?|$)/i.test(cached)) return cached;
  return toVariant(original, 'hero') || toVariant(cached, 'hero') || cached || original;
}

/**
 * Thumbnail URL for the strip / card grids. Prefers an explicit `-card.webp`
 * (the upload route stores the 800px card in `media_url_cached`); otherwise
 * derives it. Falls back to the stored URL for Trestle/legacy media.
 */
function pickThumbUrl(cached: string, original: string): string {
  if (/-card\.webp(\?|$)/i.test(cached)) return cached;
  if (/-card\.webp(\?|$)/i.test(original)) return original;
  return toVariant(cached, 'card') || toVariant(original, 'card') || cached || original;
}

/**
 * The R2 upload's timestamped path, variant-independent:
 * `…/listings/SL-0004/1779898434281-card.webp` → `…/listings/sl-0004/1779898434281`.
 * This is the CONTENT identity — the optimizer writes hero/card/thumb to the
 * same `{timestamp}-{variant}.webp` stem, so card and hero of one upload share it.
 * Returns null for non-R2-variant URLs (Trestle source, legacy `.jpg`).
 */
function r2VariantStem(url: string): string | null {
  if (!url) return null;
  const m = url.match(/^(.*\/\d{10,})-(?:hero|card|thumb)\.webp(?:\?[^#]*)?$/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Stable visual identity for de-duplication. Two rows collapse to one rendered
 * item only when they are the SAME underlying image — a card-variant row and a
 * hero-variant row of the same upload, or a genuine re-import of the same photo.
 *
 * Identity is the R2 timestamp stem and is taken from `media_url_original`
 * FIRST: that is the canonical full image. `media_url_cached` must NOT drive
 * identity, because legacy rows cache a shared INDEX path (`/photos/SL-0004/13.jpg`)
 * that DISTINCT uploads reused — keying on it would wrongly merge different
 * photos (verified against SL-0004, 2026-05-30). Only when neither field is an
 * R2-variant URL (Trestle / true-legacy) do we fall back to the full path, which
 * collapses exact-URL duplicates only.
 */
export function visualIdentity(cached: string, original: string): string {
  const stem = r2VariantStem(original) || r2VariantStem(cached);
  if (stem) return stem;
  // No R2-variant URL (Trestle / true-legacy): the CANONICAL `media_url_original`
  // (source URL) drives identity. `media_url_cached` is an index / mirror path
  // that DISTINCT uploads can reuse (e.g. legacy `/photos/SL-0004/13.jpg`), so it
  // must NOT collapse different real photos — use it only when there is no
  // original at all. (Codex review on PR #286, 2026-05-30.)
  const raw = (original || cached || '').trim();
  if (!raw) return '';
  let s = raw;
  try {
    s = new URL(raw).pathname;
  } catch {
    /* relative / opaque URL — key on the raw string */
  }
  return s.replace(/\?[^#]*$/, '').toLowerCase();
}

/** Tie-break when two rows share a visual identity: the preferred (hero) row
 *  wins, else the lower display order, else the incumbent (first-seen). */
function isBetterDuplicate(candidate: ListingMediaTableRow, current: ListingMediaTableRow): boolean {
  if (candidate.preferred_photo_yn !== current.preferred_photo_yn) {
    return candidate.preferred_photo_yn;
  }
  return candidate.order < current.order;
}

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
  const mapFn = options.mapUrl ?? proxyTrestleUrl;
  const decorated = items
    .map((raw, idx) => {
      if (!raw || typeof raw !== 'object') return null;
      const m = raw as Record<string, unknown>;
      const rawUrl = String(m.MediaURL ?? m.mediaUrl ?? m.url ?? '').trim();
      if (!rawUrl) return null;
      // Distinct small variant for the thumbnail strip; defaults to the full URL
      // when the source has no separate thumbnail (Trestle/legacy/JSON).
      const rawThumb = String(m.ThumbURL ?? m.thumbUrl ?? '').trim();
      const klass = classifyMediaItem(raw);
      const orderRaw = m.Order ?? m.order;
      const orderNum = orderRaw === '' || orderRaw == null || Number.isNaN(Number(orderRaw))
        ? idx
        : Number(orderRaw);
      const preferred =
        m.PreferredPhotoYN === true || m.PreferredPhotoYN === 'true' ||
        m.preferred === true || m.isPrimary === true;
      const url = mapFn(rawUrl);
      return {
        url,
        // Keep the pre-map source URL for dedupe identity. `mapFn` (default
        // `proxyTrestleUrl`) rewrites Cotality/CoreLogic URLs to
        // `/api/media/proxy?url=<encoded>`; `visualIdentity` strips the query,
        // so keying dedupe on the mapped `url` would give EVERY proxied item
        // the same identity (`/api/media/proxy`) and collapse the gallery to
        // one image (Codex review, PR #363, 2026-06-06).
        rawUrl,
        thumbUrl: rawThumb ? mapFn(rawThumb) : url,
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

  // Collapse by visual identity — parity with `resolveListingMediaFromRows`.
  // The legacy `listings.media` JSON often repeats the same image (re-imports,
  // mirrored index paths), which without dedupe renders duplicate photos in the
  // card strip / detail gallery (PR-Hero, 2026-06-06). Iterating in sorted order
  // keeps the best survivor first (photo before floorplan, then lowest order),
  // exactly as the table path does.
  const seen = new Set<string>();
  const deduped = options.skipDedupe
    ? decorated
    : decorated.filter((d) => {
        // Key on the SOURCE URL (pre-proxy), never the mapped `d.url`.
        const key = visualIdentity(d.rawUrl, d.rawUrl) || d.rawUrl;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

  return deduped.map((d, i) => ({
    url: d.url,
    thumbUrl: d.thumbUrl,
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

  // De-duplicate by VISUAL identity (not just media_key): the same underlying
  // image can exist as multiple active rows — legacy basis-key vs content-hash
  // key, or a card-variant row alongside a hero-variant row. Keep ONE row per
  // identity (preferred → lowest order → first-seen) so the gallery never shows
  // the same photo twice, even before the DB itself is de-duplicated.
  const bestByIdentity = new Map<string, ListingMediaTableRow>();
  const firstSeen = new Map<string, number>();
  let seen = 0;
  for (const r of active) {
    const cached = (r.media_url_cached || '').trim();
    const original = (r.media_url_original || '').trim();
    if (!cached && !original) continue;
    const id = visualIdentity(cached, original) || `__row_${seen}`;
    const prev = bestByIdentity.get(id);
    if (!prev) {
      bestByIdentity.set(id, r);
      firstSeen.set(id, seen++);
    } else if (isBetterDuplicate(r, prev)) {
      bestByIdentity.set(id, r); // survivor changes; keep the identity's first-seen slot
    }
  }

  const items = [...bestByIdentity.entries()]
    .sort((a, b) => (firstSeen.get(a[0]) ?? 0) - (firstSeen.get(b[0]) ?? 0))
    .map(([, r]) => {
      const cached = (r.media_url_cached || '').trim();
      const original = (r.media_url_original || '').trim();
      return {
        // Main image / lightbox = full-size hero; thumbnail strip = small card.
        MediaURL: pickFullSizeUrl(cached, original),
        ThumbURL: pickThumbUrl(cached, original),
        // Pass both signals so classifyMediaItem can prefer MediaCategory when
        // present (Trestle's content-type tag) but still recognise FloorPlan /
        // Video / VirtualTour from media_type when category is null.
        MediaCategory: r.media_category ?? r.media_type,
        MediaClassification: r.media_classification,
        mediaType: r.media_type,
        Order: r.order,
        PreferredPhotoYN: r.preferred_photo_yn,
      };
    });
  return resolveListingMedia(items, { skipDedupe: true });
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
