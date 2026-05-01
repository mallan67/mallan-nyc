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
  order?: number;
  Order?: number;
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
  if (cat === "floorplan" || cat === "floor plan" || cat.includes("floorplan") || cat.includes("floor plan")) {
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

export function buildMediaR2Key(listingId: string, mediaType: string, order: number): string {
  const safeListingId = listingId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const canonical = classifyTrestleMediaCategory(mediaType);
  // Namespace by canonical mediaType. Photo→photos/, FloorPlan→floorplans/,
  // Video→videos/, VirtualTour→virtualtours/. This guarantees that two media
  // items with the same listingId + same Order but different mediaType
  // (which is the common Trestle case — Photo Order=1 and FloorPlan Order=1
  // both legitimately exist for the same listing) produce distinct R2 keys
  // and cannot overwrite each other.
  const folder =
    canonical === "FloorPlan" ? "floorplans" :
    canonical === "Video" ? "videos" :
    canonical === "VirtualTour" ? "virtualtours" :
    "photos";
  return `${folder}/${safeListingId}/${order}.jpg`;
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
        order: getMediaOrder(item, idx),
      }))
      .filter(({ url }) => !!url && isTrestleMediaUrl(url));

    result.scanned_media += mediaItems.length;
    if (mediaItems.length === 0) continue;

    for (let i = 0; i < mediaItems.length; i += batchSize) {
      const batch = mediaItems.slice(i, i + batchSize);
      await Promise.allSettled(
        batch.map(async ({ url, mediaType, order }) => {
          const key = buildMediaR2Key(listing.listing_id, mediaType, order);

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
                order,
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
