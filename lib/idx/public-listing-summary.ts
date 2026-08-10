/**
 * PUBLIC LIST SUMMARY CONTRACTION.
 *
 * Cards, search results, Featured, map pins and neighborhood widgets need ONE
 * image and a count. They were being sent the entire gallery: a 67-photo
 * listing serialized 68 media objects into a list response so a card could
 * render a single hero.
 *
 * This contracts an ALREADY-CANONICAL `PublicListingDTO` down to the card
 * contract. It is applied at the RESPONSE BOUNDARY, after every stage that
 * still needs complete media (post-filters, dedupe, geocode, live-media
 * fallback, co-listing and open-house annotation).
 *
 * WHAT THIS IS NOT
 * ----------------
 * This is RESPONSE / PRESENTATION shedding — smaller JSON, fewer serialized
 * media objects, less client transfer and browser work. It is **NOT**:
 *   - Neon row-read shedding — the list query still reads active media rows;
 *   - provider-fetch shedding — `fillEmptyMediaWithLiveFallback` may still
 *     fetch a complete Cotality gallery for listings with empty DB media, which
 *     this then contracts to one hero;
 *   - a Neon CPU fix.
 * Those require separate work and separate measurement. Do not claim them here.
 *
 * SCOPE: pure. No Prisma, no Cotality, no R2, no I/O. It only contracts a DTO
 * that has already been fully resolved.
 */

import { getValidPhotoMedia } from '@/lib/media/listing-card-media';
import type { PublicListingDTO } from './public-dto';

/**
 * Contract one listing to the card/summary shape.
 *
 * `media`        -> the canonical hero Photo only (or `[]` when none exists)
 * `photosCount`  -> PRESERVED from the full canonical DTO, never recomputed
 *
 * Every other public field — id, mlsId, slug, url, status, listingType, address
 * (including suppression), price, property fields, listOfficeName,
 * `_displayCompliance`, `_source`, `_assignedAgent`, coming-soon metadata,
 * open-house and co-listing annotations, tour URLs — passes through untouched.
 * Only gallery-sized presentation data shrinks.
 */
export function toPublicListingSummary(dto: PublicListingDTO): PublicListingDTO {
  // Hero selection uses the ESTABLISHED card helper, whose `isPhotoMedia`
  // delegates to the canonical `classifyMediaItem`. That is what stops a
  // FloorPlan (null category, DOCUMENT-*/.pdf URL) from being promoted to hero.
  // Deliberately NOT `media[0]`: the DTO is photo-first, but relying on
  // positional order here would silently break if that ordering ever changed.
  const hero = getValidPhotoMedia(dto.media as never)[0];

  return {
    ...dto,
    // No Photo -> empty array, and the card falls back to
    // LISTING_PLACEHOLDER_IMAGE via `getHeroPhoto`, exactly as it already does
    // for listings with no media. A FloorPlan/Video/VirtualTour is never
    // substituted in as a fake photo.
    media: hero ? [hero as unknown as PublicListingDTO['media'][number]] : [],
    // CRITICAL: the count describes the GALLERY, not the contracted array.
    // Recomputing from `media` here would report "1 photo" for a 67-photo
    // listing — the exact failure this contraction must not introduce.
    photosCount: dto.photosCount,
  };
}

/** Contract a whole list response. Order and length are preserved. */
export function toPublicListingSummaries(
  listings: readonly PublicListingDTO[],
): PublicListingDTO[] {
  return listings.map(toPublicListingSummary);
}
