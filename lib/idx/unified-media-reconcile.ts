/**
 * Unified media pipeline adapter (Phase 2, Task 10) — flag-gated glue between
 * the live Cotality Media feed and the fail-closed spine (reconciler + strict
 * classifier + identity comparator + hero resolver).
 *
 * Behind UNIFIED_MEDIA_PIPELINE (default OFF): when off, the legacy media-sync
 * path is unchanged, so merging this is behavior-neutral. When on, media-sync
 * routes gallery reconciliation through here.
 *
 * Protections implemented here (each has a failing-first test):
 *  - Property-scoped Cotality Media query (`ResourceName eq 'Property'`).
 *  - Completeness is an EXPLICIT `pageChainComplete` signal (the caller must set
 *    it only after draining `@odata.nextLink`); an incomplete chain fails closed.
 *  - MediaKey-based identity with the rotating URL EXCLUDED from change compare.
 *  - Fail-closed empty/shrink reconciliation (delegated to reconcileGallery).
 *  - Feed-provenance: the reconciler governs ONLY Cotality-feed-sourced rows;
 *    non-feed (locally-uploaded) rows are removed from its input and can never be
 *    tombstoned by feed absence.
 *  - All-status distinction preserved: all existing rows are passed through; the
 *    reconciler never hard-deletes, resurrects, or re-tombstones deleted rows.
 *  - Hero is resolved via the single hero resolver over the strict classifier, so
 *    a FloorPlan/Document can never become the hero.
 */
import {
  reconcileGallery,
  type ExistingMediaRow,
  type IncomingMedia,
  type ReconcileResult,
} from "@/lib/sync/gallery-reconcile";
import { classifyMedia } from "@/lib/media/media-classifier";
import { selectHero, type HeroCandidate } from "@/lib/media/hero-resolver";

/**
 * Marker prefix for media NOT sourced from the Cotality feed (locally uploaded).
 * Cotality never emits MediaKeys with this prefix, so it is a safe provenance
 * discriminator. Mirrors the existing `CRM_MEDIA_KEY_PREFIX` in media-sync.
 */
export const UNIFIED_NON_FEED_PREFIX = "crm:";

/** Flag read — default OFF; only the exact string "true" enables the pipeline. */
export function isUnifiedPipelineEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.UNIFIED_MEDIA_PIPELINE === "true";
}

/** Field list selected from the Cotality Media resource for the unified path. */
const MEDIA_SELECT = [
  "MediaKey", "ResourceName", "ResourceRecordKey", "ResourceRecordID", "MediaURL",
  "MediaCategory", "MediaClassification", "MediaType", "MediaStatus", "Order",
  "PreferredPhotoYN", "ModificationTimestamp", "MediaModificationTimestamp",
].join(",");

/**
 * Property-scoped Media query for one listing. `ResourceName eq 'Property'`
 * (live-proven to return 200 and to leave the sampled keysets unchanged) plus a
 * stable `Order asc,MediaKey asc` order. The caller follows `@odata.nextLink` to
 * exhaustion — this is the FIRST page only.
 */
export function buildPropertyScopedMediaQuery(resourceRecordKey: string): URLSearchParams {
  const esc = String(resourceRecordKey).replace(/'/g, "''");
  const p = new URLSearchParams();
  p.set("$filter", `ResourceName eq 'Property' and ResourceRecordKey eq '${esc}'`);
  p.set("$select", MEDIA_SELECT);
  p.set("$orderby", "Order asc,MediaKey asc");
  return p;
}

export interface UnifiedReconcileInput {
  /** ALL existing DB rows for the listing (every status — preserves the
   * never-imported vs all-deleted distinction). */
  existing: ExistingMediaRow[];
  /** Feed rows for the listing; null = the fetch itself failed. */
  incoming: IncomingMedia[] | null;
  /** TRUE only when the `@odata.nextLink` chain was drained to exhaustion. */
  pageChainComplete: boolean;
  /** Property.PhotosCount corroboration, or null. */
  photosCount: number | null;
  runId: string;
}

export type UnifiedReconcileResult = ReconcileResult & {
  /** Non-feed rows removed from the reconciler's authority (never tombstoned). */
  protectedNonFeed: ExistingMediaRow[];
};

const isNonFeed = (mediaKey: string): boolean => mediaKey.startsWith(UNIFIED_NON_FEED_PREFIX);

/**
 * Plan the gallery reconciliation for one listing under the unified pipeline.
 *
 * Feed-provenance is enforced BEFORE the reconciler runs: non-feed rows are
 * split out into `protectedNonFeed` and never enter the reconciler, so an
 * absent-from-feed local upload can never be tombstoned. `pageChainComplete`
 * maps to the reconciler's `fetchComplete`, so an un-drained page chain fails
 * closed (no destructive action).
 */
export function planUnifiedReconcile(input: UnifiedReconcileInput): UnifiedReconcileResult {
  const feedExisting = input.existing.filter((r) => !isNonFeed(r.media_key));
  const protectedNonFeed = input.existing.filter((r) => isNonFeed(r.media_key));

  const result = reconcileGallery({
    existing: feedExisting,
    incoming: input.incoming,
    fetchComplete: input.pageChainComplete,
    photosCount: input.photosCount,
    runId: input.runId,
  });

  return { ...result, protectedNonFeed };
}

/** Map a feed row to a hero candidate using the strict (MediaCategory-based)
 * classifier — MediaType is the file format and is NOT the classification. */
function toHeroCandidate(m: IncomingMedia): HeroCandidate {
  return {
    mediaKey: m.media_key,
    canonicalType: classifyMedia({
      mediaCategory: m.media_category,
      mediaType: m.media_type,
      mediaUrl: m.media_url_original ?? null,
    }),
    order: m.order,
    preferredPhotoYN: m.preferred_photo_yn,
  };
}

/**
 * Resolve the hero for a listing's feed gallery via the single hero resolver.
 * Because `selectHero` considers only active Photos, a FloorPlan/Document/Video/
 * VirtualTour can never be returned — even at a lower `Order` than the photos.
 * Returns null when the gallery has no photo.
 */
export function resolveHeroFromFeed(incoming: IncomingMedia[]): HeroCandidate | null {
  return selectHero(incoming.map(toHeroCandidate));
}
