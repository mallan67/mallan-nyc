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

/**
 * Public listing shape returned by GET /api/listings and GET /api/listings/:id.
 * No private remarks, no agent PII, address suppressed when required.
 */
export interface PublicListingDTO {
  id: string;
  mlsId: string;
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

  return {
    id: listing.listingId,
    mlsId: listing.mlsId,
    status: listing.standardStatus,
    listingType: listing.listingType,
    address,
    listPrice: listing.listPrice,
    originalListPrice: listing.originalListPrice,
    previousListPrice: listing.previousListPrice,
    closePrice: listing.closePrice,
    propertyType: listing.propertyType,
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
    // Media
    media: listing.media,
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
