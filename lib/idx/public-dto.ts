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

/** Map Trestle CommonInterest to user-friendly property type */
function mapCommonInterestToDisplay(commonInterest?: string, fallback?: string): string {
  switch (commonInterest) {
    case 'Condominium': return 'Condo';
    case 'StockCooperative': return 'Co-op';
    case 'Condop': return 'Condop';
    default: return fallback || 'Residential';
  }
}

/**
 * Trestle MediaURLs are publicly accessible (no Bearer auth needed).
 * Serving them directly avoids the Vercel serverless proxy hop,
 * cutting photo load time by 2-3x.
 *
 * The /api/media/proxy route is kept as a fallback but no longer used
 * for the default IDX path.
 */
function proxyMediaUrl(url: string): string {
  return url || '';
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
  // Agent — office + name only (no email, phone, or MLS IDs)
  listOfficeName: string;
  listAgentFullName: string;
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
  // Building
  buildingName?: string;
  architecturalStyle?: string;
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
  // Compliance metadata
  _source: string;
  _displayCompliance: {
    requiresAttribution: boolean;
    attributionText: string;
    disclaimerRequired: boolean;
    comingSoon?: boolean;
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
    propertyType: mapCommonInterestToDisplay(listing.commonInterest, listing.propertyType),
    propertySubType: listing.propertySubType,
    bedroomsTotal: listing.bedroomsTotal,
    bathroomsFull: listing.bathroomsFull,
    bathroomsHalf: listing.bathroomsHalf,
    livingArea: listing.livingArea,
    lotSizeArea: listing.lotSizeArea,
    yearBuilt: listing.yearBuilt,
    storiesTotal: listing.storiesTotal,
    roomsTotal: listing.roomsTotal,
    // Agent: office name + agent name only — NO email, phone, or MLS IDs
    listOfficeName: listing.listOfficeName,
    listAgentFullName: listing.listAgentFullName,
    // Media — proxy Trestle URLs through our API (they require Bearer auth)
    media: listing.media.map(m => ({ ...m, url: proxyMediaUrl(m.url) })),
    photosCount: listing.photosCount,
    virtualTourURL: listing.virtualTourURLUnbranded || undefined,
    // Public remarks only — private remarks are NEVER on IDXListing
    publicRemarks: listing.publicRemarks,
    // Dates
    listingContractDate: listing.listingContractDate,
    modificationTimestamp: listing.modificationTimestamp,
    onMarketDate: listing.onMarketDate,
    // Building
    buildingName: listing.buildingName,
    architecturalStyle: listing.architecturalStyle,
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
    // Source & compliance
    _source: listing._source,
    _displayCompliance: {
      ...listing._displayCompliance,
      comingSoon: isComingSoon || undefined,
    },
  };
}
