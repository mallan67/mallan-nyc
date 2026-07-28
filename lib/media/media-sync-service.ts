import { isListingDisplayable } from "@/lib/search/listing-access-decision";
import { getAccessToken } from "@/lib/idx/auth";
import {
  existsInR2,
  hasR2Config,
  uploadToR2,
} from "./r2-client";

const TRESTLE_API_URL = (process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle").replace(/\/$/, "");
const TRESTLE_MEDIA_HOSTS = new Set([
  new URL(TRESTLE_API_URL).hostname.toLowerCase(),
  "img.cotality.com",
]);

export interface MediaSyncItem {
  url?: string;
  MediaURL?: string;
  mediaType?: string;
  MediaCategory?: string;
  /** Presentation/display ordinal ONLY — never object identity (#575). */
  order?: number;
  Order?: number;
  /**
   * Trestle `Media.MediaKey` — the STABLE per-asset identity (#575). Both the
   * Trestle-shape (`MediaKey`) and DB-shape (`media_key`) spellings are
   * accepted because this interface is fed from both `Listing.media` JSON and
   * `listing_media` rows.
   */
  MediaKey?: string;
  media_key?: string;
}

export interface MediaSyncListing {
  listing_id: string;
  status: string;
  media: unknown;
  rls_eligible?: boolean | null;
  idx_display_yn?: boolean | null;
  internet_entire_listing_display_yn?: boolean | null;
  owner_opt_out?: boolean | null;
  participant_only?: boolean | null;
}

export interface MediaSyncLogger {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export interface MediaSyncDeps {
  hasR2Config: typeof hasR2Config;
  getAccessToken: typeof getAccessToken;
  existsInR2: typeof existsInR2;
  uploadToR2: typeof uploadToR2;
  fetchFn: typeof fetch;
}

export interface MediaSyncOptions {
  execute?: boolean;
  batchSize?: number;
  logger?: Partial<MediaSyncLogger>;
}

export interface MediaSyncResult {
  dry_run: boolean;
  scanned_listings: number;
  eligible_listings: number;
  scanned_media: number;
  would_copy: number;
  copied: number;
  skipped_existing: number;
  skipped_ineligible: number;
  failed: number;
}

export const defaultMediaSyncDeps: MediaSyncDeps = {
  hasR2Config,
  getAccessToken,
  existsInR2,
  uploadToR2,
  fetchFn: fetch,
};

/**
 * Canonical Trestle media-category values, matching the public/CRM DTO shape.
 *
 * `"Photo"` is the default — both for legitimately-uncategorized media (Trestle
 * leaves MediaCategory null on bare photo rows) and for any string we don't
 * recognise. This matches the resolver convention at
 * `lib/media/listing-media-resolver.ts:classifyMediaItem`.
 */
export type CanonicalMediaType = "Photo" | "FloorPlan" | "Video" | "VirtualTour";

/**
 * Classify a Trestle MediaCategory string into a canonical mediaType.
 *
 * THE BUG THIS REPLACES (2026-05-01 audit):
 *   Three sync sites in `lib/idx/sync.ts` previously used `cat.toLowerCase()
 *   .includes("floor plan")` (with space) to detect floor plans. Trestle's
 *   actual `MediaCategory` enum value is `"FloorPlan"` (no space). When
 *   lowercased the value becomes `"floorplan"` — `"floorplan".includes("floor
 *   plan")` is FALSE. Every floor-plan media item was therefore mis-tagged
 *   as `"Photo"` on write, then `buildMediaR2Key` (which DOES correctly
 *   namespace by mediaType) routed the floorplan into `photos/{id}/{order}.jpg`
 *   where it collided with the actual photo at the same Order. Trestle's
 *   `Order` field is per-MediaCategory sequential, so Photo Order=1 and
 *   FloorPlan Order=1 collide on the R2 key. Last-writer-wins meant 5/6
 *   homepage Featured listings ended up with floorplans visible at /1.jpg.
 *
 * This function accepts every MediaCategory variant Trestle has emitted
 * (verified live 2026-05-01) and returns the canonical mediaType that:
 *   - downstream `buildMediaR2Key` uses for namespace routing
 *   - the public DTO and CRM mapper render in the UI
 *   - the resolver in `lib/media/listing-media-resolver.ts` classifies on
 *     read
 *
 * @param category — raw value from Trestle Media `MediaCategory` field, or
 *   the DB `mediaType` field on already-mirrored items. Accepts string,
 *   undefined, null, empty.
 */
export function classifyTrestleMediaCategory(
  category: string | null | undefined,
): CanonicalMediaType {
  if (!category) return "Photo";
  const cat = String(category).toLowerCase().trim();

  // Floor-plan detection — multiple forms because Trestle emits "FloorPlan"
  // (the actual enum value, no space) but downstream systems and DB rows
  // sometimes carry "Floor Plan" (with space) or other lowercase variants.
  if (cat === "floorplan" || cat === "floor plan" || cat === "floor_plan" || cat.includes("floorplan") || cat.includes("floor plan") || cat.includes("floor_plan")) {
    return "FloorPlan";
  }
  // Virtual-tour detection — Trestle uses "VirtualTour" (no space); we accept
  // "Virtual Tour" (with space) defensively.
  if (cat === "virtualtour" || cat === "virtual tour" || cat.includes("virtual tour") || cat.includes("virtualtour")) {
    return "VirtualTour";
  }
  // Video detection
  if (cat === "video" || cat.includes("video")) {
    return "Video";
  }
  // Photo is the explicit value AND the default for any unrecognised string.
  // Trestle leaves MediaCategory null/empty on bare photo rows, so empty
  // already returned "Photo" via the early null guard above.
  return "Photo";
}

/**
 * Encode one path segment INJECTIVELY for use in an R2 object key.
 *
 * Why not `replace(/[^a-zA-Z0-9_-]/g, "_")`: that mapping is LOSSY. `"MK/1"`
 * and `"MK_1"` both collapse to `"MK_1"`, so two distinct media identities
 * would resolve to the SAME object key and silently overwrite each other —
 * the exact class of bug #575 exists to eliminate. A sanitiser used for
 * IDENTITY must be injective, not merely safe.
 *
 * Scheme: characters outside `[A-Za-z0-9_-]` are escaped as `~HH` per UTF-8
 * byte. `~` itself is outside the set, so it escapes to `~7E` and the encoding
 * stays unambiguous (prefix-free). Distinct inputs therefore always produce
 * distinct outputs. `~` is an RFC 3986 unreserved character, so the result is
 * safe both as an S3/R2 key and inside the public `media_url_cached` URL
 * without further encoding.
 *
 * Also makes path traversal structurally impossible: `/` and `.` are escaped,
 * so no segment can escape its prefix.
 */
export function encodeR2Segment(raw: string): string {
  let out = "";
  for (const ch of String(raw)) {
    if (/^[A-Za-z0-9_-]$/.test(ch)) {
      out += ch;
      continue;
    }
    for (const byte of Buffer.from(ch, "utf8")) {
      out += "~" + byte.toString(16).toUpperCase().padStart(2, "0");
    }
  }
  return out;
}

/**
 * Read the STABLE Trestle media identity off an item, or null when absent.
 *
 * Returns null rather than substituting anything, so every caller must make
 * the fail-closed decision explicitly.
 */
export function getMediaKey(item: MediaSyncItem): string | null {
  const raw = item.MediaKey ?? item.media_key;
  if (raw === null || raw === undefined) return null;
  const value = String(raw).trim();
  return value.length > 0 ? value : null;
}

/**
 * Build the R2 object key for a media asset, addressed by its STABLE Trestle
 * `MediaKey`.
 *
 * THE BUG THIS REPLACES (#575):
 *   The key used to be `{folder}/{listingId}/{order}.jpg`. Trestle's `Order` is
 *   a PRESENTATION ordinal, not an identity — it is per-MediaCategory
 *   sequential and the feed reassigns it whenever photos are reordered,
 *   inserted or removed. Two consequences, both observed as unbounded R2
 *   growth:
 *
 *     1. Reordering a gallery changed the key of an UNCHANGED asset, so the
 *        same bytes were re-uploaded under a new key and the old object was
 *        orphaned — one duplicate per reorder, forever.
 *     2. Different assets across a listing's media history reused the same
 *        ordinal key, so `photos/X/1.jpg` did not name one specific Cotality
 *        asset over time.
 *
 *   `MediaKey` is Trestle's per-asset primary key and is `@unique` on
 *   `listing_media.media_key`, so it is stable across reordering, across
 *   signed-URL rotation, and across re-sync.
 *
 * `Order` remains display-order metadata (it still drives gallery sequence and
 * hero selection) — it is simply no longer part of object IDENTITY.
 *
 * FAIL-CLOSED: `mediaKey` is required and this throws when it is missing.
 * There is deliberately NO order-based fallback: falling back would silently
 * reintroduce the defect for exactly the rows least likely to be noticed.
 * Callers must SKIP such rows. Verified safe to require: all 320,913
 * production `listing_media` rows have a non-null `media_key` (0 NULL,
 * measured read-only 2026-07-28).
 *
 * MIGRATION NOTE: this changes the key only for media not yet mirrored.
 * `mirrorMediaToR2` prefers an existing `row.r2_key` and derives one ONLY when
 * absent, so already-mirrored objects keep their current key and are neither
 * renamed, copied, nor re-uploaded.
 *
 * The mediaType→folder namespace is retained. With a globally-unique MediaKey
 * it is no longer needed to prevent Photo/FloorPlan collisions, but
 * `lib/ops/r2-orphan-plan.ts` keys its safety filters off exactly these four
 * prefixes (`LISTING_MEDIA_PREFIXES`), so changing them would break orphan
 * planning.
 */
export function buildMediaR2Key(listingId: string, mediaType: string, mediaKey: string): string {
  const rawKey = String(mediaKey ?? "").trim();
  if (!rawKey) {
    throw new Error(
      "buildMediaR2Key: mediaKey is required (#575 — Order is presentation, not identity). " +
        "Callers must skip media without a MediaKey rather than fall back to Order.",
    );
  }
  const safeListingId = encodeR2Segment(listingId);
  const safeMediaKey = encodeR2Segment(rawKey);
  const canonical = classifyTrestleMediaCategory(mediaType);
  // Namespace by canonical mediaType. Photo→photos/, FloorPlan→floorplans/,
  // Video→videos/, VirtualTour→virtualtours/. Must stay in sync with
  // LISTING_MEDIA_PREFIXES in lib/ops/r2-orphan-plan.ts.
  const folder =
    canonical === "FloorPlan" ? "floorplans" :
    canonical === "Video" ? "videos" :
    canonical === "VirtualTour" ? "virtualtours" :
    "photos";
  return `${folder}/${safeListingId}/${safeMediaKey}.jpg`;
}

export function isTrestleMediaUrl(rawUrl: string): boolean {
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase();
    return Array.from(TRESTLE_MEDIA_HOSTS).some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

export function normalizeMediaItems(media: unknown): MediaSyncItem[] {
  if (!Array.isArray(media)) return [];
  return media.filter((item): item is MediaSyncItem => !!item && typeof item === "object") as MediaSyncItem[];
}

export function getMediaUrl(item: MediaSyncItem): string {
  return String(item.url || item.MediaURL || "");
}

export function getMediaType(item: MediaSyncItem): CanonicalMediaType {
  // Use the centralised classifier so both DB-shape items (mediaType field)
  // and Trestle-shape items (MediaCategory field) are normalised identically.
  // Defends against the floor-plan-as-photo bug at the read boundary too —
  // any DB row whose mediaType field carries a non-canonical value gets
  // re-classified rather than silently passed through as "Photo".
  return classifyTrestleMediaCategory(item.mediaType ?? item.MediaCategory);
}

export function getMediaOrder(item: MediaSyncItem, fallback: number): number {
  const order = item.order ?? item.Order ?? fallback;
  const value = Number(order);
  return Number.isFinite(value) ? value : fallback;
}

export function canMirrorListingMedia(listing: MediaSyncListing): boolean {
  if (listing.rls_eligible === false) return false;
  return isListingDisplayable(listing);
}

async function fetchMediaBuffer(url: string, token: string, fetchFn: typeof fetch): Promise<{ buffer: Buffer; contentType: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetchFn(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "image/*",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`fetch failed with status ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      throw new Error(`non-image response: ${contentType}`);
    }

    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      contentType,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function mirrorListingMediaBatch(
  listings: MediaSyncListing[],
  options: MediaSyncOptions = {},
  deps: MediaSyncDeps = defaultMediaSyncDeps,
): Promise<MediaSyncResult> {
  const logger = {
    log: options.logger?.log ?? console.log,
    warn: options.logger?.warn ?? console.warn,
    error: options.logger?.error ?? console.error,
  };
  const execute = options.execute === true;
  const batchSize = Math.max(1, options.batchSize ?? 5);

  const result: MediaSyncResult = {
    dry_run: !execute,
    scanned_listings: listings.length,
    eligible_listings: 0,
    scanned_media: 0,
    would_copy: 0,
    copied: 0,
    skipped_existing: 0,
    skipped_ineligible: 0,
    failed: 0,
  };

  if (!deps.hasR2Config()) {
    logger.warn("[Media Sync] R2 is not configured; nothing to do.");
    return result;
  }

  let tokenPromise: Promise<string> | null = null;
  const getToken = async () => {
    tokenPromise ??= deps.getAccessToken();
    return tokenPromise;
  };

  for (const listing of listings) {
    if (!canMirrorListingMedia(listing)) {
      result.skipped_ineligible++;
      continue;
    }
    result.eligible_listings++;

    const mediaItems = normalizeMediaItems(listing.media)
      .map((item, idx) => ({
        item,
        url: getMediaUrl(item),
        mediaType: getMediaType(item),
        // Retained for display/telemetry only — NOT used to derive the R2 key.
        order: getMediaOrder(item, idx),
        // #575: object identity comes from MediaKey.
        mediaKey: getMediaKey(item),
      }))
      // FAIL-CLOSED: an item without a stable MediaKey is skipped, never keyed
      // by Order. Guessing a key here is what produced a duplicate object on
      // every gallery reorder.
      .filter(
        (m): m is typeof m & { mediaKey: string } =>
          !!m.url && isTrestleMediaUrl(m.url) && !!m.mediaKey,
      );

    result.scanned_media += mediaItems.length;
    if (mediaItems.length === 0) continue;

    for (let i = 0; i < mediaItems.length; i += batchSize) {
      const batch = mediaItems.slice(i, i + batchSize);
      await Promise.allSettled(
        batch.map(async ({ url, mediaType, mediaKey }) => {
          const key = buildMediaR2Key(listing.listing_id, mediaType, mediaKey);

          try {
            if (await deps.existsInR2(key)) {
              result.skipped_existing++;
              return;
            }

            if (!execute) {
              result.would_copy++;
              return;
            }

            const token = await getToken();
            const { buffer, contentType } = await fetchMediaBuffer(url, token, deps.fetchFn);
            await deps.uploadToR2(key, buffer, contentType);
            result.copied++;
          } catch (err) {
            result.failed++;
            logger.warn(
              "[Media Sync] media item failed:",
              {
                listing_id: listing.listing_id,
                media_type: mediaType,
                // Log the stable identity, not the presentation ordinal —
                // `order` changes between cycles, which made these lines
                // impossible to correlate across runs.
                media_key: mediaKey,
                error: err instanceof Error ? err.message : String(err),
              },
            );
          }
        }),
      );
    }
  }

  logger.log("[Media Sync] complete", {
    dry_run: result.dry_run,
    scanned_listings: result.scanned_listings,
    eligible_listings: result.eligible_listings,
    scanned_media: result.scanned_media,
    would_copy: result.would_copy,
    copied: result.copied,
    skipped_existing: result.skipped_existing,
    skipped_ineligible: result.skipped_ineligible,
    failed: result.failed,
  });

  return result;
}
