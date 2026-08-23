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

import { isMallanExclusiveListing } from '@/lib/listings/exclusive-agent-assignment';
import { toPublicMediaUrl } from '@/lib/media/proxy-url-policy';
import { isCrmMediaKey } from '@/lib/media/crm-media';

export type MediaClass = 'photo' | 'floorplan' | 'video' | 'virtualTour' | 'unknown';

const CLASS_PRIORITY: Record<MediaClass, number> = {
  photo: 0,
  floorplan: 1,
  video: 2,
  virtualTour: 3,
  unknown: 4,
};

// REMOVED 2026-08-07 — `TRESTLE_PROXY_HOST_SUFFIXES`.
//
// It listed second-level domains ('cotality.com' / 'corelogic.com') and matched
// any subdomain, on the assumption that "future CDN hosts" should route through
// the proxy automatically. But the proxy ROUTE validates against an EXACT
// allowlist, so a subdomain match here produced a proxy URL the route refused —
// a guaranteed 403 rather than a working image. Widening reach on this side
// without widening the route's allowlist can only break, never help.
//
// The single owner is now `lib/media/proxy-url-policy.ts`, which the proxy route
// itself imports. Adding a genuinely-live media host is a one-line change THERE.

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
  // Decode an already-proxied URL (`/api/media/proxy?url=<encoded source>`)
  // back to its source before URL-shape classification. For pre-mapped DTO
  // input the document/floor-plan signal is percent-encoded inside the `?url=`
  // param (`%2FMedia%2FProperty%2FDOCUMENT-…`), which hides the anchored
  // `/Media/Property/DOCUMENT-…/` path — the item would then default to photo
  // and could become the card hero (Codex review, PR #363, 2026-06-06).
  const url = unwrapProxyUrl(String(m.MediaURL ?? m.mediaUrl ?? m.url ?? '')).toLowerCase();

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
  // STEP 1, DELIBERATELY UNCHANGED BEHAVIOUR — and now labelled honestly.
  //
  // An absent category still DISPLAYS as a photo. This is a fail-safe display
  // fallback, NOT a verified Cotality semantic. It stays because `resolvePhotos`
  // (below) keeps only `class === 'photo'`: reclassifying here would drop real
  // media out of galleries on an assumption exactly as unverified as the one
  // Step 1 removed from the writer, and tell the broker a listing has no photos.
  // That is the 2026-04-30 failure shape approached from the other side.
  //
  // 'unclassified' is the value the sync now writes into media_type in place of
  // a fabricated 'Photo'. It must resolve identically to the empty case or every
  // such row would silently vanish from the gallery on the next sync.
  //
  // What an empty MediaCategory actually MEANS is an open question for Step 2,
  // to be answered against the live Cotality Media contract — not here.
  if (cat === 'photo' || cat === 'image' || cat === '' || cat === 'unclassified') {
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

/**
 * Recover the original source URL from a `/api/media/proxy?url=<encoded>`
 * wrapper. Returns the input unchanged when it is not a proxy URL.
 *
 * Used for DEDUPE IDENTITY only. `resolveListingMedia` accepts already-proxied
 * "pre-mapped DTO entries" (persisted `listings.media` JSON / DTO re-feed) as a
 * supported input shape; `visualIdentity` strips the query string, so without
 * unwrapping, two DISTINCT proxied photos both reduce to the `/api/media/proxy`
 * pathname and collapse to one image (Codex review, PR #363, 2026-06-06). This
 * keys identity on the encoded source instead. Render URLs are unaffected.
 */
function unwrapProxyUrl(url: string): string {
  if (!url || !url.includes('/api/media/proxy')) return url;
  const m = url.match(/[?&]url=([^&]+)/);
  if (!m) return url;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return url;
  }
}

/**
 * Wrap approved Trestle/CoreLogic media URLs with the bearer-auth proxy.
 * Pass through otherwise.
 *
 * THIN DELEGATE — the canonical policy lives in `lib/media/proxy-url-policy.ts`,
 * the SAME module `app/api/media/proxy/route.ts` imports. This function owns no
 * host list of its own, so the resolver and the proxy route cannot disagree.
 *
 * WHY THE SUFFIX RULE WAS REMOVED (2026-08-07)
 * --------------------------------------------
 * This previously matched `host === suffix || host.endsWith('.' + suffix)` over
 * `['cotality.com', 'corelogic.com']`. The proxy ROUTE accepts only an EXACT
 * allowlist, so any other subdomain — `img.cotality.com`, `cdn.cotality.com`,
 * `evil.cotality.com` — was wrapped into a proxy URL the route then REFUSED.
 * The suffix rule could only ever manufacture a guaranteed 403; it could never
 * make such a host load. Passing the URL through unchanged is strictly better,
 * and declining to mint a proxy request for an unapproved host is the
 * security-correct behaviour.
 *
 * If a legitimate Cotality media subdomain is ever confirmed live, the fix is to
 * ADD it to `ALLOWED_MEDIA_HOSTS` in the canonical policy — ONE place, which the
 * proxy route also reads — NOT to reintroduce suffix matching here.
 */
export const proxyTrestleUrl = toPublicMediaUrl;

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
        // Key on the SOURCE URL, never the mapped `d.url`. `rawUrl` may itself
        // already be proxied (pre-mapped DTO input), so unwrap the proxy
        // wrapper first — otherwise every proxied item shares the
        // `/api/media/proxy` identity and the gallery collapses to one image.
        const src = unwrapProxyUrl(d.rawUrl);
        const key = visualIdentity(src, src) || src;
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

/** The public DTO media shape. `order` is the COTALITYLVED (photo-first) index; `isPrimary` is the hero flag. */
export interface DtoMedia {
  url: string;
  thumbUrl: string;
  mediaType: string;
  order: number;
  isPrimary: boolean;
}

/**
 * Serialize resolved media into the public/card DTO shape. The input is ALREADY photo-first
 * (resolver sort), so `order` is emitted as the resolved array index — NEVER the raw
 * `providerOrder`. This makes the raw-order fragility inert: no consumer can surface a FloorPlan
 * first by reading `media[0]` OR by re-sorting on `order`. `isPrimary` carries the resolved
 * photo-first hero flag explicitly for surfaces that want the hero without re-deriving it.
 */
export function toDtoMedia(resolved: ResolvedMedia[]): DtoMedia[] {
  return resolved.map((m, i) => ({
    url: m.url,
    thumbUrl: m.thumbUrl,
    mediaType: m.mediaType,
    order: i,
    isPrimary: m.isPrimary,
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
  /**
   * Namespace evidence for MIXED-GALLERY COMPOSITION (`resolveDbListingMedia`):
   * a non-`crm:` key means the feed is materialized relationally and is
   * authoritative; an all-`crm:` set is a supplement to the legacy feed JSON.
   *
   * OPTIONAL, and its ABSENCE deliberately reproduces the previous behavior —
   * with no key the set cannot be shown to be CRM-only, so the relational rows
   * are treated as authoritative exactly as before. Public callers select it so
   * the supplement case is actually reachable.
   */
  media_key?: string | null;
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

/** Listing context the media-fallback gate needs to tell a Mallan-owned listing
 * (authoritative media) from a third-party Cotality/IDX/RLS listing.
 *
 * Provenance mirrors `classifyDbListing` in lib/idx/db-to-public-dto.ts — the
 * repo's established signal set — NOT `mls_id`. A caller (e.g. /api/listings)
 * may not even select `mls_id`, so a missing `mls_id` must never be read as
 * "CRM-owned" (that was the earlier bug). `mlsId` remains on the interface ONLY
 * for the legacy {@link shouldFetchTrestleMediaFallback} live-fetch gate; the
 * DB-only helpers below deliberately ignore it. */
export interface MediaFallbackContext {
  /** @deprecated Authority signal for the legacy live-fetch gate only. The
   * DB-only helpers ({@link shouldFallbackToLegacyMedia} /
   * {@link resolveDbListingMedia}) do NOT use it — a caller may omit `mls_id`. */
  mlsId?: string | null;
  /** Listing id. A `SL-`/`RL-` prefix marks a Mallan-authored exclusive. */
  listingId?: string | null;
  /** Prisma `rls_eligible`. `false` ⇒ website-only Mallan listing (Mallan-owned
   * media). One of the two authoritative Mallan-ownership signals. */
  rlsEligible?: boolean | null;
}

/**
 * Whether the listing's media is Mallan-owned (CRM exclusive or website-only) —
 * so its `listing_media` deletions are AUTHORITATIVE and the legacy JSON must
 * NOT be resurrected. Third-party Cotality/IDX/RLS listings return `false`.
 *
 * DELEGATES to the repo's canonical `isMallanExclusiveListing`
 * (lib/listings/exclusive-agent-assignment.ts) — the single source of truth —
 * rather than reimplementing the rule, so the media read path, the R2
 * admission path, and every other consumer can never disagree about
 * Mallan-ownership (including prefix casing: the canonical rule is a
 * case-sensitive `SL-`/`RL-` `startsWith`):
 *   • `SL-`/`RL-` listing-id namespace → Mallan-authored, OR
 *   • `rls_eligible === false` → website-only (Mallan-owned).
 *
 * `agent_id` and `owner_client_id` are DELIBERATELY NOT used: `syncAgentHistory`
 * stamps `agent_id` onto third-party Cotality/IDX rows (buyer-side agent history),
 * so treating `agent_id != null` as Mallan ownership mislabels third-party
 * listings and would BLOCK their legitimate Cotality legacy-JSON fallback, leaving
 * a placeholder (Codex review on the 2026-07-16 media P0; mirrors the
 * `listing-search-projection` F13 rule: "NEVER by agent_id"). `mls_id` is also
 * not consulted — a missing `mls_id` is not proof of ownership.
 */
export function isMallanOwnedListing(ctx: MediaFallbackContext | undefined): boolean {
  if (!ctx) return false;
  return isMallanExclusiveListing({
    listing_id: ctx.listingId ?? null,
    rls_eligible: ctx.rlsEligible ?? null,
  });
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

/**
 * Whether a DB-only render may fall back to the legacy `Listing.media` JSON when
 * the relational `listing_media` rows resolve to ZERO usable (active) media.
 *
 * This is the DB-ONLY sibling of {@link shouldFetchTrestleMediaFallback} — it
 * gates the legacy **JSON column**, never a live Cotality call (the public
 * detail render is DB-only per PR #511). It keys ownership on the LISTING'S
 * PROVENANCE (see {@link isMallanOwnedListing}), because a Mallan-owned listing's
 * `Listing.media` JSON is itself Mallan media — resurrecting it after the agent
 * deleted the relational rows is the "deleted photos must not resurrect"
 * violation. Third-party listings' JSON is Cotality-sourced, so falling back to
 * it keeps the display Cotality-only.
 *
 * Decision (fail-closed for Mallan-owned media):
 *   • Third-party Cotality/IDX/RLS → ALWAYS fall back to the legacy JSON when the
 *     relational path resolves empty. That JSON is Cotality-sourced, so it can
 *     never resurrect Mallan media — safe regardless of `hadRelationalRows`.
 *   • Mallan-owned (SL-/RL- or website-only) → fall back ONLY when we can PROVE no
 *     relational row was ever imported (`hadRelationalRows === false`):
 *        – `true`      → rows existed but all deleted/replaced → authoritative empty.
 *        – `undefined` → existence UNKNOWN (an active-only caller that did not pass
 *          an all-status signal such as `_count.listing_media`) → FAIL-CLOSED, no
 *          fallback, so intentionally-deleted Mallan photos never resurrect.
 *
 * `hadRelationalRows` is a caller-supplied ALL-STATUS existence signal, NOT
 * derived from the passed rows' length: an active-only caller's row count reflects
 * ACTIVE rows only, so deriving from it would read "all deleted" as "never
 * imported" and resurrect deleted Mallan media (Codex review, 2026-07-16).
 *
 * @param hadRelationalRows did ANY `listing_media` row (any status) ever exist?
 *        `undefined` = unknown (active-only caller) → fail-closed for Mallan-owned.
 * @param ctx               listing provenance (SL-/RL- listing_id or rls_eligible)
 */
export function shouldFallbackToLegacyMedia(
  hadRelationalRows: boolean | undefined,
  ctx: MediaFallbackContext,
  hadFeedRelationalRows?: boolean | undefined,
): boolean {
  if (!isMallanOwnedListing(ctx)) {
    // Third-party: the legacy JSON is Cotality-sourced, so fallback remains the DEFAULT — that is
    // what the 134 never-imported displayable listings still depend on.
    //
    // But provenance is not current truth. When FEED rows provably existed and none are active, the
    // canonical lane observed a COMPLETE source view and tombstoned them: `defaultFetchMedia()`
    // only returns after full pagination (an incomplete page throws), which is what makes
    // `tombstoneVanished` trustworthy. That is authoritative feed-empty, and replaying the legacy
    // JSON there republishes photos the provider deleted (verified live: RLS20082303).
    //
    // Deliberately keyed to FEED history, never `hadRelationalRows`: that signal also counts `crm:`
    // supplemental history, so a third-party listing whose Cotality gallery lives only in the legacy
    // JSON and which once had since-deleted CRM rows would lose a valid gallery.
    //
    // `undefined` (not looked up) → fallback, preserving today's behaviour. Only a proven `true`
    // suppresses it — a failed lookup must propagate, never arrive here as `false`.
    return hadFeedRelationalRows !== true;
  }
  // Mallan-owned: fall back to its Mallan-authored legacy JSON ONLY when provably
  // never-imported. `true` (all-deleted) and `undefined` (unknown) → no fallback.
  // UNCHANGED — Mallan authoritative deletion does not use the feed signal.
  return hadRelationalRows === false;
}

/**
 * SHARED DB-only media selection — the single policy both the public detail page
 * and the card/search DTO use so a listing can never show photos on the card and
 * a gray placeholder on its detail page (the 2026-07-16 card/detail P0).
 *
 * Order of precedence:
 *   1. Resolve the relational `listing_media` rows first (active-only, photo-first,
 *      deduped) via {@link resolveListingMediaFromRows}. When that yields ANY
 *      usable media, it wins — R2-cached URLs, authoritative ordering.
 *   2. Only when the relational path resolves to ZERO usable media do we consult
 *      {@link shouldFallbackToLegacyMedia}: third-party Cotality/IDX/RLS (and
 *      un-synced / not-yet-migrated) listings fall back to the legacy
 *      `Listing.media` JSON; a Mallan-owned listing with deleted rows stays
 *      authoritatively empty.
 *
 * NEVER keys the fallback on raw `rows.length`. Callers MUST pass an ALL-STATUS
 * existence signal via `options.hadRelationalRows` (e.g. `_count.listing_media > 0`
 * for active-only queries, or `rows.length > 0` when the query already fetched
 * every status). When it is omitted, existence is treated as UNKNOWN and
 * {@link shouldFallbackToLegacyMedia} FAILS CLOSED for Mallan-owned media — an
 * active-only caller's row length must never be mistaken for the all-status count
 * (that mistake resurrects deleted Mallan photos — Codex review, 2026-07-16).
 *
 * DB-ONLY: touches only the two synchronized Neon sources (the relational table
 * and the JSON column). Performs NO live Cotality call — safe on the ISR/DB-only
 * render path (PR #511).
 *
 * @param rows        relational rows the caller fetched (all-status OR active-only)
 * @param legacyMedia the legacy `Listing.media` JSON value (array or unknown)
 * @param ctx         listing provenance for the Mallan-vs-Cotality authority test
 * @param options.hadRelationalRows all-status existence signal; omit ⇒ unknown ⇒
 *        fail-closed for Mallan-owned. REQUIRED from active-only callers to enable
 *        the never-imported legacy fallback on Mallan exclusives.
 * @param options.legacyMapUrl URL mapper applied to the LEGACY branch only, so
 *        each caller preserves its own proxy convention (the detail page proxies
 *        separately downstream, so it passes identity; the card DTO passes its own).
 */
export function resolveDbListingMedia(
  rows: ListingMediaTableRow[],
  legacyMedia: unknown,
  ctx: MediaFallbackContext,
  options: {
    hadRelationalRows?: boolean;
    /** ALL-STATUS feed-history signal for THIRD-PARTY listings. `undefined` = not looked up. */
    hadFeedRelationalRows?: boolean;
    legacyMapUrl?: (rawUrl: string) => string;
  } = {},
): ResolvedMedia[] {
  const relational = resolveListingMediaFromRows(rows);
  if (relational.length > 0) {
    // MIXED-GALLERY COMPOSITION. Having SOME relational rows does not mean the
    // relational set IS the gallery.
    //
    // If any ACTIVE relational row is a FEED row (non-`crm:` media_key), the
    // feed has been materialized relationally and is authoritative: return it
    // and do NOT replay the legacy JSON, or tombstoned/deleted feed photos
    // would resurrect.
    //
    // If every active relational row is `crm:`, they are a SUPPLEMENT, not the
    // gallery — this listing's Cotality photos still live only in the legacy
    // JSON. Returning just the CRM rows made a single upload hide the entire
    // Cotality gallery. That was masked while `importJsonMediaToRows` copied the
    // feed JSON into `crm:` rows; the provenance gate correctly stops that, so
    // the composition has to be right on its own now.
    const hasFeedRow = rows.some(
      (r) => r && r.status === 'active' && !isCrmMediaKey(r.media_key),
    );
    if (hasFeedRow) return relational;

    // Mallan-owned listings keep authoritative deletions: the same predicate
    // that governs the zero-relational case governs the supplement case, so a
    // deleted Mallan photo is never restored from its own legacy JSON.
    if (!shouldFallbackToLegacyMedia(options.hadRelationalRows, ctx, options.hadFeedRelationalRows))
      return relational;

    const legacy = resolveListingMedia(legacyMedia, { mapUrl: options.legacyMapUrl });
    if (legacy.length === 0) return relational;
    return mergeGalleryByVisualIdentity(legacy, relational);
  }
  // Pass the all-status signal THROUGH (undefined when the caller omitted it) —
  // do NOT coerce from `rows.length`, which for active-only callers is the active
  // count, not existence, and would resurrect deleted Mallan media.
  if (!shouldFallbackToLegacyMedia(options.hadRelationalRows, ctx, options.hadFeedRelationalRows)) return [];
  return resolveListingMedia(legacyMedia, { mapUrl: options.legacyMapUrl });
}

/**
 * Merge the legacy feed gallery with a relational CRM supplement, keeping ONE
 * entry per visual identity.
 *
 * `relational` wins a collision: a historical contamination clone (the same feed
 * image ALSO present as a `crm:` row) must render once, and the relational row
 * carries the better URLs (R2/cached variants). Feed order is preserved and the
 * CRM supplement is appended, then the combined set is re-run through the
 * canonical pipeline so photo-first ordering and `isPrimary` are computed over
 * the WHOLE gallery rather than over either half.
 */
function mergeGalleryByVisualIdentity(
  legacy: ResolvedMedia[],
  relational: ResolvedMedia[],
): ResolvedMedia[] {
  const identityOf = (m: ResolvedMedia) => visualIdentity('', unwrapProxyUrl(m.url));
  const relationalIds = new Set(relational.map(identityOf));
  const feedOnly = legacy.filter((m) => !relationalIds.has(identityOf(m)));

  const combined = [...feedOnly, ...relational].map((m, i) => ({
    MediaURL: m.url,
    ThumbURL: m.thumbUrl,
    MediaCategory: m.mediaType,
    mediaType: m.mediaType,
    Order: i,
    PreferredPhotoYN: m.preferred === true,
  }));
  return resolveListingMedia(combined, { skipDedupe: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// VIRTUAL-TOUR / VIDEO SPLIT  (fix/listing-media-pipeline)
//
// REBNY IDX Plus delivers "video" and "3D tour" through the SAME Property fields
// (`VirtualTourURLBranded` / `VirtualTourURLUnbranded[2,3]`) — there is no separate
// playable video field (`VideosCount` is a count only, no URL). A YouTube/Vimeo
// link and a Matterport link both land in those fields. Consumers previously
// mapped ALL of them to one `virtualTourURL` (the "3D Tour" tab), so real videos
// (the majority — YouTube/Vimeo) were hidden and rendered as "3D".
//
// Split by HOST: video-hosting domains → Video section; everything else
// (Matterport/iGuide/Kuula/…) → 3D/Virtual-Tour section. Prefer the UNBRANDED
// URL over the branded one (UCBA Art. I §5(C): branded media may carry agent
// name/contact and must not be shown publicly when an unbranded URL exists).
// ─────────────────────────────────────────────────────────────────────────────

/** Video-hosting domains. A tour URL on one of these is a VIDEO, not a 3D walk-through. */
const VIDEO_TOUR_HOSTS = [
  'youtube.com', 'youtu.be', 'youtube-nocookie.com',
  'vimeo.com', 'player.vimeo.com',
  'wistia.com', 'wistia.net', 'wi.st',
  'dailymotion.com', 'dai.ly',
];

/**
 * Classify a tour URL as a playable `video` or an interactive `virtualTour` (3D).
 * Video = a known video host or a direct video-file extension; everything else
 * (Matterport, iGuide, Kuula, generic tour hosts) is treated as a 3D virtual tour
 * (rendered in an iframe). Empty/invalid → 'virtualTour' (safe iframe default).
 */
export function classifyTourUrl(url: string | null | undefined): 'video' | 'virtualTour' {
  const raw = (url || '').trim();
  if (!raw) return 'virtualTour';
  const lower = raw.toLowerCase();
  if (/\.(mp4|mov|webm|m4v)(\?|$)/i.test(lower)) return 'video';
  let host = '';
  try { host = new URL(raw).hostname.toLowerCase(); } catch { host = ''; }
  const hit = (h: string) =>
    host === h || host.endsWith('.' + h) || (!host && lower.includes(h));
  return VIDEO_TOUR_HOSTS.some(hit) ? 'video' : 'virtualTour';
}

/** One candidate tour URL from Trestle, tagged branded/unbranded. */
export interface TourUrlCandidate {
  url: string | null | undefined;
  /** true = `VirtualTourURLBranded` (agent-branded — public-suppressed when an unbranded exists). */
  branded?: boolean;
}

/**
 * Split Trestle virtual-tour candidates into a single public `videoUrl` and a
 * single public `virtualTourUrl`, preferring the UNBRANDED URL within each class
 * (§5(C)). A listing may legitimately have BOTH (e.g. an unbranded Matterport +
 * a YouTube video) — both are returned. Returns nulls when absent.
 */
export function splitTourUrls(candidates: TourUrlCandidate[]): { videoUrl: string | null; virtualTourUrl: string | null } {
  let video: { url: string; branded: boolean } | null = null;
  let tour: { url: string; branded: boolean } | null = null;
  for (const c of candidates || []) {
    const url = (c?.url || '').trim();
    if (!url) continue;
    const branded = !!c?.branded;
    if (classifyTourUrl(url) === 'video') {
      if (!video || (video.branded && !branded)) video = { url, branded };
    } else {
      if (!tour || (tour.branded && !branded)) tour = { url, branded };
    }
  }
  return { videoUrl: video?.url ?? null, virtualTourUrl: tour?.url ?? null };
}

/**
 * DTO-shaped convenience wrapper around {@link splitTourUrls}. Accepts the raw
 * unbranded candidate list (`VirtualTourURLUnbranded[,2,3]`) + the branded URL,
 * coerces unknown values, and returns the DTO field names/shape: `videoUrl` and
 * `virtualTourURL` (capital URL), `undefined` (not null) when absent. Unbranded
 * is preferred over branded within each class (UCBA §5(C)).
 */
export function tourUrlsForDto(unbranded: unknown[], branded?: unknown): { videoUrl?: string; virtualTourURL?: string } {
  const norm = (v: unknown) => (v == null || v === '' ? undefined : String(v));
  const s = splitTourUrls([
    ...(unbranded || []).map((url) => ({ url: norm(url), branded: false })),
    { url: norm(branded), branded: true },
  ]);
  return { videoUrl: s.videoUrl ?? undefined, virtualTourURL: s.virtualTourUrl ?? undefined };
}

// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL GETTERS — every surface (public + backend) uses these instead of
// re-implementing `media[0]` / `find(photo)` / its own class filter. Each runs
// the shared classify→photo-first→dedupe pipeline. Input may be raw Trestle
// records, DB JSONB, or pre-resolved DTO items.
// ─────────────────────────────────────────────────────────────────────────────

/** Photos only, in canonical order (photo-first sort already applied). */
export function getPhotoGallery(items: unknown): ResolvedMedia[] {
  return resolveListingMedia(items).filter((m) => m.class === 'photo');
}
/** The primary (hero) PHOTO — never a floorplan/video/tour. Null if no photo exists. */
export function getPrimaryPhoto(items: unknown): ResolvedMedia | null {
  return getPhotoGallery(items)[0] ?? null;
}
/** Floorplans only, in source order. */
export function getFloorplans(items: unknown): ResolvedMedia[] {
  return resolveListingMedia(items).filter((m) => m.class === 'floorplan');
}
/** Media-resource videos only (rare — most video comes via splitTourUrls). */
export function getVideos(items: unknown): ResolvedMedia[] {
  return resolveListingMedia(items).filter((m) => m.class === 'video');
}
/** Media-resource virtual tours only (rare — most 3D comes via splitTourUrls). */
export function getVirtualTours(items: unknown): ResolvedMedia[] {
  return resolveListingMedia(items).filter((m) => m.class === 'virtualTour');
}
/**
 * Search/card thumbnail URL — the first valid PHOTO only. Returns null when the
 * listing has no photo, so the caller renders an explicit placeholder rather than
 * silently heroing a floorplan. NEVER returns a floorplan/video/tour.
 */
export function getSearchThumbnail(items: unknown): string | null {
  return getPrimaryPhoto(items)?.url ?? null;
}
