/**
 * ONE canonical DB→public media composition.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * `dbListingToPublicDTO` and the listing-detail page both turned the same two
 * Neon sources (relational `listing_media` rows + the legacy `Listing.media`
 * JSON) into public media — independently. They already shared
 * `resolveDbListingMedia` and `toDtoMedia`, so identity, ordering and hero
 * selection agreed. Two policies did NOT:
 *
 *   proxy timing
 *     db-to-public-dto : `legacyMapUrl: proxyDbMediaUrl`   — during resolution
 *     detail page      : `legacyMapUrl: identity`, then re-mapped EVERY url
 *                        through `proxyDetailMediaUrl` afterwards
 *
 *   photo count
 *     db-to-public-dto : media.filter(m => m.mediaType === 'Photo').length
 *     detail page      : mediaArr.filter(m => classifyMediaItem(m) === 'photo')
 *
 * The two counts are NOT provably equivalent: one reads the serialized
 * `mediaType` produced by the resolver, the other re-runs classification over
 * the already-serialized DTO. Any disagreement in FloorPlan/Photo handling would
 * make the detail page's "N photos" differ from every card for the same listing.
 *
 * The second URL map was also how the original production incident happened:
 * `resolveDbListingMedia` had ALREADY proxied each row, and the detail page's
 * own mapper re-wrapped the result, producing a nested proxy URL whose inner
 * value is relative — rejected by the proxy allowlist with a 403 before Cotality
 * was ever contacted.
 *
 * Composing once removes the class of defect rather than the instance.
 *
 * SCOPE
 * -----
 * Pure. No Prisma query, no provider fetch, no per-asset Neon read. Callers pass
 * facts they have ALREADY fetched. Query shape is deliberately NOT this module's
 * concern — read shedding is a separate change.
 */

import {
  resolveDbListingMedia,
  toDtoMedia,
  type ListingMediaTableRow,
} from './listing-media-resolver';
import { toPublicMediaUrl } from './proxy-url-policy';

export interface DbMediaCompositionInput {
  listingId: string;
  rlsEligible?: boolean;
  /** Relational rows already selected by the caller. */
  tableRows: ListingMediaTableRow[];
  /** Legacy `Listing.media` JSON, used only when the resolver permits fallback. */
  legacyMedia: unknown[];
  /**
   * ALL-STATUS existence signal.
   *
   * `true`  — rows exist (or existed) for this listing
   * `false` — no row was ever imported → legacy fallback may apply
   * `undefined` — UNKNOWN → the resolver FAILS CLOSED for Mallan-owned media
   *
   * Never derive this from `tableRows.length` when the caller selected
   * active-only rows: an all-deleted listing would read as "never imported" and
   * RESURRECT deleted Mallan media from the legacy JSON. Derive it from an
   * all-status count (`_count.listing_media`), or pass the length only when the
   * query genuinely fetched every status.
   */
  hadRelationalRows: boolean | undefined;
  /**
   * ALL-STATUS **FEED** existence signal for THIRD-PARTY listings: did any non-`crm:`
   * `listing_media` row ever exist, in any status?
   *
   * Deliberately SEPARATE from `hadRelationalRows`, which also counts `crm:` supplemental history
   * — reusing that here would make a third-party listing with since-deleted CRM rows look like a
   * materialized-then-deleted feed and cost it a valid Cotality gallery.
   *
   * This module stays PURE: it performs no query. The value is supplied by the caller, which gets
   * it from `lib/media/feed-media-authority.ts` in ONE batched lookup over the ambiguous listings.
   *
   * `undefined` = not looked up → the resolver keeps today's fallback behaviour. A FAILED lookup
   * must propagate, never arrive here as `false`.
   */
  hadFeedRelationalRows?: boolean | undefined;
}

export interface DbMediaComposition {
  /** Canonical public media, already proxied exactly once and photo-first. */
  media: ReturnType<typeof toDtoMedia>;
  /** Canonical photo count — derived from the SAME array the DTO publishes. */
  photoCount: number;
}

/**
 * THE canonical composition. Both `dbListingToPublicDTO` and the detail page
 * consume this and must not post-process its output.
 *
 * URL mapping happens ONCE, inside resolution, via the canonical
 * `toPublicMediaUrl` — which is idempotent, so even a double application cannot
 * produce a nested proxy URL.
 */
export function composeDbPublicMedia(
  input: DbMediaCompositionInput,
): DbMediaComposition {
  const resolved = resolveDbListingMedia(
    input.tableRows,
    input.legacyMedia,
    { listingId: input.listingId, rlsEligible: input.rlsEligible },
    {
      hadRelationalRows: input.hadRelationalRows,
      hadFeedRelationalRows: input.hadFeedRelationalRows,
      legacyMapUrl: toPublicMediaUrl,
    },
  );

  // Photo-first serialization: `order` = resolved index, `isPrimary` = resolved
  // hero flag, so no downstream surface can hero a FloorPlan via media[0] or an
  // order re-sort.
  const media = toDtoMedia(resolved);

  // Counted from the SAME array that becomes the public DTO, so the detail page
  // and every card cannot disagree.
  const photoCount = media.filter((m) => m.mediaType === 'Photo').length;

  return { media, photoCount };
}
