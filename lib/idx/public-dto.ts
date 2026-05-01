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
import { generateListingSlug } from '@/lib/listing-slug';
import { isComingSoonStatus } from '@/lib/compliance/status';
import { isAddressDisplayable } from '@/lib/compliance/gates';
import { resolveListingMedia } from '@/lib/media/listing-media-resolver';

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
  media: { url: string; mediaType: string; order: number }[];
  photosCount?: number;
  virtualTourURL?: string;
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
    media: resolveListingMedia(listing.media).map(m => ({
      url: m.url,
      mediaType: m.mediaType,
      order: m.providerOrder,
    })),
    photosCount: listing.photosCount,
    virtualTourURL: listing.virtualTourURLUnbranded || listing.virtualTourURLBranded || undefined,
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
