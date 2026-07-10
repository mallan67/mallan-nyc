/**
 * Public Listing DTO — safe for API responses.
 *
 * COMPLIANCE: This module converts IDXListing → PublicListingDTO by:
 * - Stripping private remarks (never exposed)
 * - Stripping agent PII (email, phone, MLS IDs)
 * - Suppressing address when InternetAddressDisplayYN = false
 * - Suppressing lat/lng when address is suppressed
 * - Including REBNY attribution metadata
 *
 * @module lib/idx/public-dto
 */

import type { IDXListing } from './types';
import { generateListingSlug, stripListingIdSuffix } from '@/lib/listing-slug';
import { buildCanonicalListingPath } from '@/lib/listing-canonical-url';
import { isComingSoonStatus } from '@/lib/compliance/status';
import { isAddressDisplayable } from '@/lib/compliance/gates';
import { resolveListingMedia, toDtoMedia, tourUrlsForDto } from '@/lib/media/listing-media-resolver';

/** Map Trestle property fields to user-friendly property type */
export function mapPropertyTypeToDisplay(commonInterest?: string, propertySubType?: string | null, fallback?: string): string {
  // 1. CommonInterest is the most reliable for co-op/condo distinction
  if (commonInterest) {
    switch (commonInterest) {
      case 'Condominium': return 'Condo';
      case 'StockCooperative': return 'Co-op';
      case 'Condop': return 'Condop';
    }
  }
  // 2. PropertySubType often has the actual type
  if (propertySubType) {
    const sub = propertySubType.toLowerCase();
    if (sub.includes('condo')) return 'Condo';
    if (sub.includes('co-op') || sub.includes('coop') || sub.includes('stock cooperative')) return 'Co-op';
    if (sub.includes('condop')) return 'Condop';
    if (sub.includes('townhouse')) return 'Townhouse';
    if (sub.includes('single family') || sub.includes('house')) return 'House';
    if (sub.includes('multi') || sub.includes('multi-family')) return 'Multi-Family';
    if (sub.includes('loft')) return 'Loft';
    // "Apartment" is not useful — NYC listings are Co-op, Condo, or Condop
    if (sub === 'apartment') return fallback || 'Residential';
    return propertySubType;
  }
  return fallback || 'Residential';
}

// Trestle MediaURL proxying + photo-first ordering moved to
// lib/media/listing-media-resolver.ts (single source of truth shared by
// public DTO, CRM mapper, /api/media/batch, and /api/idx/search).

/**
 * Coerce an arbitrary value (string | Date | null | undefined) to ISO 8601.
 * Used for auction date fields which can arrive as Prisma DateTime objects
 * (DB path) or pre-stringified ISO timestamps (Trestle path).
 */
function toIsoOrNull(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

/**
 * Build the public auction object from a listing source that may carry the
 * snake_case auction columns directly on the listing (DB path) or alongside
 * the canonical IDXListing shape (Trestle path).
 *
 * Returns null when auction_yn is not strictly true. This is the single
 * source of truth for the AuctionBanner render-or-not decision —
 * non-auction listings MUST yield null so the banner short-circuits.
 */
export function buildAuctionPublic(source: unknown): AuctionPublic | null {
  if (!source || typeof source !== 'object') return null;
  const s = source as Record<string, unknown>;
  if (s.auction_yn !== true) return null;
  const rawType = s.auction_type;
  // Type guard the picklist — reject any value the validator wouldn't accept.
  const type =
    rawType === 'Absolute' || rawType === 'WithReserve' || rawType === 'Minimum'
      ? rawType
      : null;
  const endDate = toIsoOrNull(s.auction_end_date);
  // Validator AU-002/AU-003 already block submission without these — but we
  // still defensively return null if either is missing so the banner won't
  // render half-information ("auction! …no end date").
  if (!type || !endDate) return null;
  return {
    type,
    startDate: toIsoOrNull(s.auction_start_date),
    endDate,
    termsUrl: safeHttpUrl(s.auction_terms_url),
  };
}

/**
 * Return the input only when it parses as an absolute http(s):// URL.
 * Anything else — `javascript:`, `data:`, relative paths, garbage — yields
 * null. The validator's AU-006 blocker rejects unsafe schemes at submit
 * time; this is the second layer (defence-in-depth) for any row that
 * pre-dates AU-006 or arrives via a path that bypasses the validator.
 */
function safeHttpUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const protocol = new URL(trimmed).protocol.toLowerCase();
    return protocol === 'http:' || protocol === 'https:' ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * Auction details exposed to the public DTO when auction_yn=true.
 *
 * UCBA Art. I auction exception path. The auction end date is binding —
 * standard 24-hour price-change rules don't apply to auction listings —
 * so we surface it publicly with a strict shape.
 *
 * type values mirror the validator (lib/compliance/rls-enforcement.ts AU-002):
 *   - "Absolute"     no reserve
 *   - "WithReserve"  reserve price set
 *   - "Minimum"      minimum bid stated
 */
export interface AuctionPublic {
  type: 'Absolute' | 'WithReserve' | 'Minimum';
  /** ISO 8601 string when present, otherwise null. */
  startDate: string | null;
  /** ISO 8601 string. Required by validator AU-003 when auction_yn=true. */
  endDate: string;
  /** Public terms doc (minimum bid, registration, inspection, buyer's premium). */
  termsUrl: string | null;
}

/**
 * Public listing shape returned by GET /api/listings and GET /api/listings/:id.
 * No private remarks, no agent PII, address suppressed when required.
 */
export interface PublicListingDTO {
  id: string;
  mlsId: string;
  /** URL slug — address-based when allowed, MLS-ID-based when address is suppressed */
  slug: string;
  /** Canonical public path — the ONE URL to emit:
   *  `/listing/{address-slug}/{id-lower}` (or `/listing/listing-{id}` when the
   *  address is suppressed). Built via buildCanonicalListingPath. Consumers
   *  MUST link to this — never `/listing/${slug}`, never `?key=`. (2026-05-28) */
  url: string;
  status: string;
  listingType: 'sale' | 'rent';
  address: {
    streetNumber: string;
    streetName: string;
    unitNumber: string | null;
    city: string;
    stateOrProvince: string;
    postalCode: string;
    county: string;
    neighborhood?: string;
    latitude?: number;
    longitude?: number;
  };
  listPrice: number;
  originalListPrice: number;
  previousListPrice?: number;
  closePrice: number | null;
  propertyType: string;
  propertySubType: string | null;
  bedroomsTotal: number;
  bathroomsFull: number;
  bathroomsHalf: number;
  livingArea: number | null;
  lotSizeArea: number | null;
  yearBuilt: number | null;
  storiesTotal?: number;
  roomsTotal?: number;
  // Agent — office/broker name only (REBNY: public attribution = office, not agent)
  listOfficeName: string;
  // Media
  media: { url: string; thumbUrl?: string; mediaType: string; order: number; isPrimary?: boolean }[];
  photosCount?: number;
  virtualTourURL?: string;
  /** Playable video URL (YouTube/Vimeo/etc.) split out of the Trestle tour fields. */
  videoUrl?: string;
  // Remarks (public only — private remarks NEVER included)
  publicRemarks?: string;
  // Dates
  listingContractDate: string;
  modificationTimestamp: string;
  onMarketDate?: string;
  closeDate?: string;
  // Building & Amenities
  buildingName?: string;
  architecturalStyle?: string;
  interiorFeatures?: string;
  buildingFeatures?: string;
  exteriorFeatures?: string;
  appliances?: string;
  laundryFeatures?: string;
  securityFeatures?: string;
  attendanceType?: string;
  communityFeatures?: string;
  associationAmenities?: string;
  parkingFeatures?: string;
  poolFeatures?: string;
  spaFeatures?: string;
  heating?: string;
  cooling?: string;
  flooring?: string;
  petsAllowedDetail?: string;
  // Financial
  associationFee?: number;
  associationFeeFrequency?: string;
  taxAnnualAmount?: number;
  taxYear?: number;
  // Rental-specific
  leaseAmount?: number;
  leaseAmountFrequency?: string;
  petsAllowed?: string;
  furnished?: string;
  availabilityDate?: string;
  // Days on Market
  daysOnMarket?: number;
  cumulativeDaysOnMarket?: number;
  // FARE Act fee transparency
  moveInCosts?: string;
  // Move-in fee amount (Property MoveInCostsAmount, live 2026-06-04) with read-time
  // legacy fallback (AdditionalFee → MoveInCostsAmountTotal) resolved in the builders.
  moveInCostsAmount?: number;
  moveInCostsComments?: string;
  ongoingFees?: string;
  tenantPays?: string;
  tenantPaysDescription?: string;
  additionalFeeYN?: boolean;
  additionalFee?: number;
  additionalFeeDescription?: string;
  feeFrequency?: string;
  // Auction (UCBA Art. I exception path) — null on non-auction listings.
  // Substantive listing facts (not a Trestle distribution-gate field): when
  // auction_yn=true, the auction details are surfaced publicly so the
  // detail page can render an unmissable banner with the bidding deadline.
  auction: AuctionPublic | null;
  // Compliance metadata
  _source: string;
  _displayCompliance: {
    requiresAttribution: boolean;
    attributionText: string;
    disclaimerRequired: boolean;
    comingSoon?: boolean;
    comingSoonDate?: string;
  };
  /**
   * Assigned listing-agent contact card — populated ONLY for Mallan
   * exclusives (`_source === 'exclusive'`), where Mallan IS the listing
   * broker and the named agent is our own licensee. For third-party
   * IDX/RLS rows this is `undefined`: the NAR settlement + REBNY rules
   * strip the *other* brokerage's agent email/phone from public display,
   * so we never surface a non-Mallan agent's PII here.
   *
   * `name`  → the listing agent's display name (e.g. "Maya Allan").
   * `email` / `phone` → Mallan's own contact for this exclusive; safe to
   *          publish because it is OUR advertising of OUR listing
   *          (19 NYCRR §175.25 attribution, not third-party PII).
   * `company` → the listing brokerage name (mirrors `listOfficeName`).
   *
   * Always optional. Consumers must fall back to the brokerage block when
   * absent so the §175.25 attribution line is never dropped.
   */
  _assignedAgent?: {
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
    /** Headshot URL from the Agent record; absent → render initials fallback. */
    photo?: string;
    /** Stored license title / role (e.g. "Licensed Real Estate Broker") —
     *  the NY DOS §175.25 designation. Omitted when the Agent has none. */
    title?: string;
    /** Agent public_slug → optional link to /agents/{slug}. */
    slug?: string;
  };
  /**
   * Option C (PR-FE.2, 2026-05-15) — siblings annotation.
   *
   * `_coListedCount` is the number of OTHER distinct REBNY listings
   * (different listing_id) on the same response page that share this
   * listing's physical address (streetNumber + streetName + unitNumber +
   * postalCode). It is 0 (or undefined) when this listing is the only
   * row for its address in the current result set.
   *
   * `_coListedBrokerages` is the list of `listOfficeName` values for
   * those sibling listings — used by the search card to render a small
   * "Also listed by Corcoran, Douglas Elliman" badge that visually
   * differentiates 3 cards which would otherwise look identical to the
   * user (same address, same price, same photos, different brokerage).
   *
   * REBNY UCBA Art. III §2(C) compliance is preserved: each card still
   * attributes to its own actual listing broker via
   * `_displayCompliance.attributionText`. The badge is supplementary
   * information about co-listings, NOT a substitution for attribution.
   *
   * Both fields are OPTIONAL. They are populated only at the API-route
   * level after publicListings is assembled, NOT at the per-row DTO
   * conversion level (per-row conversion can't see siblings). Single-
   * card consumers (`/api/listings/[id]`) leave them undefined.
   */
  _coListedCount?: number;
  _coListedBrokerages?: string[];
  /**
   * Upcoming PUBLIC open house for this listing, for the card "Open House · Sun 12–1 PM" banner.
   * Populated at the API-route level (like _coListedCount) from the Mallan-scoped open-house index
   * (lib/open-houses/upcoming-open-houses.ts) AFTER the DTO list is assembled — matched by listing id
   * OR normalized address (twin-safe: SL-0007 card ↔ RLS20099289 open house). Absent when none.
   * Only public/active/future open houses; ET times; no agent contact info.
   */
  nextOpenHouse?: import('@/lib/open-houses/upcoming-open-houses').NextOpenHouse;
}

/**
 * FARE Act move-in fee resolution — shared by every DTO builder (DB path,
 * Trestle-direct path) so disclosure is path-independent and the canonical-first
 * fallback is defined once.
 *
 * Canonical Property fields win; legacy fields are read-time fallback ONLY when
 * the canonical field is blank. "Blank" = null/undefined/'' — NOT 0, so a
 * legitimate canonical 0 wins over a stale legacy AdditionalFee (Codex #346).
 *   amount   = MoveInCostsAmount → AdditionalFee → MoveInCostsAmountTotal
 *   comments = MoveInCostsComments → AdditionalFeeDescription
 * `source` keys are PascalCase Trestle field names (works for listing.features
 * and a raw Trestle record alike).
 */
export function resolveMoveInFees(
  source: Record<string, unknown> | null | undefined,
): { moveInCostsAmount?: number; moveInCostsComments?: string } {
  const s = source || {};
  const blank = (v: unknown) => v == null || v === '';
  const amount = !blank(s.MoveInCostsAmount)
    ? s.MoveInCostsAmount
    : !blank(s.AdditionalFee)
      ? s.AdditionalFee
      // MoveInCostsAmountTotal: legacy field — does not exist on live Trestle;
      // intentional read-only fallback for old raw_data only (never written).
      : !blank(s.MoveInCostsAmountTotal)
        ? s.MoveInCostsAmountTotal
        : undefined;
  const comments = !blank(s.MoveInCostsComments)
    ? s.MoveInCostsComments
    : !blank(s.AdditionalFeeDescription)
      ? s.AdditionalFeeDescription
      : undefined;
  return {
    moveInCostsAmount: amount != null ? Number(amount) : undefined,
    moveInCostsComments: comments != null ? String(comments) : undefined,
  };
}

/**
 * Convert an IDXListing to a public-safe DTO.
 *
 * Strips: privateRemarks, listAgentEmail, listAgentMlsId, listOfficeMlsId,
 *         showing instructions, compensation fields.
 * Suppresses: address + lat/lng when internetAddressDisplayYN is false.
 */
export function toPublicDTO(listing: IDXListing): PublicListingDTO {
  // Address display cascades through the internet-entire-listing gate;
  // null/undefined on either flag suppresses (fail-closed).
  const suppressAddress = !isAddressDisplayable(listing);

  const address = suppressAddress
    ? {
        streetNumber: '',
        streetName: 'Address Undisclosed',
        unitNumber: null,
        city: listing.address.city,
        stateOrProvince: listing.address.stateOrProvince,
        postalCode: listing.address.postalCode,
        county: listing.address.county,
        neighborhood: listing.address.cityRegion || undefined,
        // No lat/lng when address is suppressed — prevents map pin leaking location
      }
    : {
        streetNumber: listing.address.streetNumber,
        streetName: listing.address.streetName,
        unitNumber: listing.address.unitNumber,
        city: listing.address.city,
        stateOrProvince: listing.address.stateOrProvince,
        postalCode: listing.address.postalCode,
        county: listing.address.county,
        neighborhood: listing.address.cityRegion || undefined,
        latitude: listing.address.latitude,
        longitude: listing.address.longitude,
      };

  // Use canonical helper — `listing.standardStatus` may arrive as the RESO
  // no-space canonical ('ComingSoon') or as the legacy display form
  // ('Coming Soon'); the helper accepts both. The old comparison here was
  // `=== 'Coming Soon'` and silently never fired because DB values are
  // always canonical (no space) — suppressing the REBNY §16(C) badge on
  // every Coming Soon listing.
  const isComingSoon = isComingSoonStatus(listing.standardStatus);
  // Photo-first serialization (order = resolved index, isPrimary = hero flag).
  const resolvedMedia = toDtoMedia(resolveListingMedia(listing.media));
  const resolvedPhotoCount = resolvedMedia.filter(m => m.mediaType === 'Photo').length;

  // Generate address-based slug — respects InternetAddressDisplayYN gate
  const slug = generateListingSlug({
    address: {
      streetNumber: listing.address.streetNumber,
      streetName: listing.address.streetName,
      unitNumber: listing.address.unitNumber,
      city: listing.address.city,
      stateOrProvince: listing.address.stateOrProvince,
      postalCode: listing.address.postalCode,
    },
    id: listing.listingId,
    mlsId: listing.mlsId,
    internetAddressDisplayYN: listing.internetAddressDisplayYN,
  });

  return {
    id: listing.listingId,
    mlsId: listing.mlsId,
    slug,
    url: buildCanonicalListingPath({ slug, id: listing.listingId }),
    status: listing.standardStatus,
    listingType: listing.listingType,
    address,
    listPrice: listing.listPrice,
    originalListPrice: listing.originalListPrice,
    previousListPrice: listing.previousListPrice,
    closePrice: listing.closePrice,
    propertyType: mapPropertyTypeToDisplay(listing.commonInterest, listing.propertySubType, listing.propertyType),
    propertySubType: listing.propertySubType,
    bedroomsTotal: listing.bedroomsTotal,
    bathroomsFull: listing.bathroomsFull,
    bathroomsHalf: listing.bathroomsHalf,
    livingArea: listing.livingArea,
    lotSizeArea: listing.lotSizeArea,
    yearBuilt: listing.yearBuilt,
    storiesTotal: listing.storiesTotal,
    roomsTotal: listing.roomsTotal,
    // Agent: office/broker name only — agent name stripped for public (REBNY attribution = office)
    listOfficeName: listing.listOfficeName,
    // Media — photo-first ordering via shared resolver. Replaces the prior
    // pass-through `listing.media.map(...)` which trusted whatever order the
    // writer (sync.ts) emitted and could surface a FloorPlan as media[0] for
    // listings that arrived from Trestle with mixed-category ordering.
    // resolveListingMedia also proxies Trestle URLs (replaces local proxyMediaUrl).
    media: resolvedMedia,
    photosCount: resolvedPhotoCount,
    // Host-split video vs 3D, unbranded-preferred (UCBA §5(C)).
    ...tourUrlsForDto([listing.virtualTourURLUnbranded], listing.virtualTourURLBranded),
    // Public remarks only — private remarks are NEVER on IDXListing
    publicRemarks: listing.publicRemarks,
    // Dates
    listingContractDate: listing.listingContractDate,
    modificationTimestamp: listing.modificationTimestamp,
    onMarketDate: listing.onMarketDate,
    closeDate: listing.closeDate,
    // Building & Amenities
    buildingName: listing.buildingName,
    architecturalStyle: listing.architecturalStyle,
    interiorFeatures: listing.interiorFeatures,
    buildingFeatures: listing.buildingFeatures,
    exteriorFeatures: listing.exteriorFeatures,
    appliances: listing.appliances,
    laundryFeatures: listing.laundryFeatures,
    securityFeatures: listing.securityFeatures,
    attendanceType: listing.attendanceType,
    communityFeatures: listing.communityFeatures,
    associationAmenities: listing.associationAmenities,
    parkingFeatures: listing.parkingFeatures,
    poolFeatures: listing.poolFeatures,
    spaFeatures: listing.spaFeatures,
    heating: listing.heating,
    cooling: listing.cooling,
    flooring: listing.flooring,
    petsAllowedDetail: listing.petsAllowed,
    // Financial
    associationFee: listing.associationFee,
    associationFeeFrequency: listing.associationFeeFrequency,
    taxAnnualAmount: listing.taxAnnualAmount,
    taxYear: listing.taxYear,
    // Rental
    leaseAmount: listing.leaseAmount,
    leaseAmountFrequency: listing.leaseAmountFrequency,
    petsAllowed: listing.petsAllowed,
    furnished: listing.furnished,
    availabilityDate: listing.availabilityDate,
    daysOnMarket: listing.daysOnMarket,
    cumulativeDaysOnMarket: listing.cumulativeDaysOnMarket,
    moveInCosts: listing.moveInCosts,
    ongoingFees: listing.ongoingFees,
    tenantPays: listing.tenantPays,
    tenantPaysDescription: listing.tenantPaysDescription,
    additionalFeeYN: listing.additionalFeeYN,
    additionalFee: listing.additionalFee,
    additionalFeeDescription: listing.additionalFeeDescription,
    feeFrequency: listing.feeFrequency,
    // Auction (UCBA Art. I exception path) — null on non-auction listings.
    // The IDXListing canonical type doesn't yet carry the snake_case auction
    // columns; the DB-mapped path (lib/idx/sync.ts) attaches them alongside,
    // and the Trestle direct path resolves them through CustomFields.
    auction: buildAuctionPublic(listing as unknown),
    // Source & compliance
    _source: listing._source,
    _displayCompliance: {
      ...listing._displayCompliance,
      comingSoon: isComingSoon || undefined,
      comingSoonDate: isComingSoon ? listing.activationDate : undefined,
    },
  };
}

/**
 * Option C (PR-FE.2, 2026-05-15) — annotate co-listed siblings.
 *
 * Walks the array once, groups listings by their canonical address slug
 * (= the listing.slug stripped of any Option D `-rlsXXX` listing_id
 * suffix), and for every listing in a group of size > 1 sets:
 *
 *   _coListedCount: <N - 1>     // number of OTHER listings at this address
 *   _coListedBrokerages: [...]  // their listOfficeName values (deduped, NOT including self)
 *
 * Pure function: returns a NEW array, does not mutate inputs.
 *
 * Skips entries whose slug is an MLS-ID fallback (`listing-rlsXXX`) — those
 * are address-suppressed listings and cannot meaningfully share an
 * address with another row. Also skips entries with an empty slug.
 *
 * Designed for per-page annotation in the /api/listings route. Does NOT
 * make any DB query — siblings outside the current page are not counted.
 * That's intentional: the badge surfaces what's visually duplicated on
 * the page the user is currently looking at. Cross-page sibling
 * detection would require a separate query and is out of scope.
 */
/**
 * PR-A (2026-06-05) — a listing is "Mallan-relevant" for the co-listed badge if
 * it is a Mallan exclusive / internal listing. The yellow "Additional listing
 * source" badge must NOT render on ordinary third-party-vs-third-party
 * co-listings (e.g. a Compass listing and a Corcoran listing of the same unit) —
 * labeling a competitor's card with "Additional listing source: {competitor}"
 * misrepresents third-party listings. Signals (DTO-present, no new schema field):
 *   - `id` (= listing_id) prefixed `SL-` / `RL-` — Mallan CRM sale/rental
 *     exclusive (the same `isCrmExclusive` check as db-to-public-dto.ts; note a
 *     third-party `RLS…` id does NOT match `RL-`).
 *   - `_source === 'exclusive'` — Mallan exclusive (mallan-exclusive provenance).
 */
function isMallanRelevantListing(dto: PublicListingDTO | undefined): boolean {
  if (!dto) return false;
  const id = dto.id ?? '';
  return id.startsWith('SL-') || id.startsWith('RL-') || dto._source === 'exclusive';
}

export function annotateCoListedSiblings(listings: PublicListingDTO[]): PublicListingDTO[] {
  // Build the address-slug → indices map in one pass.
  const groups = new Map<string, number[]>();
  for (let i = 0; i < listings.length; i++) {
    const slug = listings[i]?.slug;
    if (!slug || slug.startsWith('listing-')) continue;
    const addressKey = stripListingIdSuffix(slug);
    if (!addressKey) continue;
    const bucket = groups.get(addressKey);
    if (bucket) bucket.push(i);
    else groups.set(addressKey, [i]);
  }

  // Default annotation: 0 / undefined for listings with no siblings.
  // Return a new array; do not mutate the inputs.
  const out = listings.slice();

  for (const indices of groups.values()) {
    if (indices.length <= 1) continue;
    // PR-A: gate the badge to Mallan-relevant groups only. Surface the
    // "Additional listing source" badge only when at least one same-unit row is
    // a Mallan exclusive/internal listing (self OR a sibling). Pure third-party
    // co-listings are left unannotated so the yellow banner does not show on
    // ordinary non-Mallan RLS listings.
    if (!indices.some((i) => isMallanRelevantListing(listings[i]))) continue;
    // For each member, the other members are its siblings. Collect
    // their listOfficeName for the badge text (dedup so a brokerage
    // that co-lists twice isn't double-counted, though that's unlikely).
    for (const idx of indices) {
      const self = listings[idx];
      const siblingOffices = new Set<string>();
      for (const otherIdx of indices) {
        if (otherIdx === idx) continue;
        const other = listings[otherIdx];
        const office = other?.listOfficeName?.trim();
        if (office && office.toLowerCase() !== 'rebny rls') {
          siblingOffices.add(office);
        }
      }
      out[idx] = {
        ...self,
        _coListedCount: indices.length - 1,
        _coListedBrokerages: Array.from(siblingOffices),
      };
    }
  }

  return out;
}
