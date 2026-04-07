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

/** Map Trestle property fields to user-friendly property type */
function mapPropertyTypeToDisplay(commonInterest?: string, propertySubType?: string | null, fallback?: string): string {
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

/**
 * Trestle MediaURLs are publicly accessible (no Bearer auth needed at the
 * HTTP level), but Trestle's Imperva/Incapsula WAF blocks direct browser
 * requests from cross-origin <img> tags. Server-to-server requests pass fine.
 *
 * Until photos are replicated to R2, the proxy is required.
 */
// Cotality + legacy CoreLogic hosts (old media URLs work through 2026 warranty)
const TRESTLE_HOSTS = ['api.cotality.com', 'api-trestle.corelogic.com', 'api-prod.corelogic.com'];

function proxyMediaUrl(url: string): string {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    if (TRESTLE_HOSTS.includes(parsed.hostname)) {
      return `/api/media/proxy?url=${encodeURIComponent(url)}`;
    }
  } catch { /* not a valid URL — return as-is */ }
  return url;
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
  const suppressAddress = listing.internetAddressDisplayYN === false;

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

  const isComingSoon = listing.standardStatus === 'Coming Soon';

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
    // Media — proxy Trestle URLs through our API (they require Bearer auth)
    media: listing.media.map(m => ({ ...m, url: proxyMediaUrl(m.url) })),
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
    // Source & compliance
    _source: listing._source,
    _displayCompliance: {
      ...listing._displayCompliance,
      comingSoon: isComingSoon || undefined,
      comingSoonDate: isComingSoon ? listing.activationDate : undefined,
    },
  };
}
