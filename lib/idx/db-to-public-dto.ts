/**
 * Convert Prisma DB listings (exclusives) → PublicListingDTO.
 *
 * This bridges the CRM listing manager (local DB) to the public frontend.
 * When an agent creates a listing in the CRM forms, it gets saved to Prisma.
 * This module maps that DB record to the same DTO shape that Trestle/IDX
 * listings use, so both can appear in the public search results.
 *
 * COMPLIANCE:
 * - Only Active, IDX-eligible listings are included
 * - Owner opt-out and participant-only listings are excluded
 * - Address suppression respected (InternetAddressDisplayYN)
 * - Agent PII stripped (same as Trestle path)
 *
 * @module lib/idx/db-to-public-dto
 */

import type { PublicListingDTO } from './public-dto';
import { generateListingSlug } from '@/lib/listing-slug';

/** Borough → County mapping (reverse of display-adapter) */
const BOROUGH_TO_COUNTY: Record<string, string> = {
  manhattan: 'New York',
  brooklyn: 'Kings',
  queens: 'Queens',
  bronx: 'Bronx',
  'staten island': 'Richmond',
};

interface DbAddress {
  StreetNumber?: string;
  StreetName?: string;
  StreetSuffix?: string;
  UnitNumber?: string;
  City?: string;
  StateOrProvince?: string;
  PostalCode?: string;
  Borough?: string;
  Neighborhood?: string;
  BuildingName?: string;
  UnparsedAddress?: string;
}

interface DbFeatures {
  YearBuilt?: number | string;
  StoriesTotal?: number | string;
  Rooms?: number | string;
  PublicRemarks?: string;
  AssociationFee?: number | string;
  AssociationFeeFrequency?: string;
  TaxAnnualAmount?: number | string;
  TaxYear?: number | string;
  ArchitecturalStyle?: string;
  // FARE Act fee transparency
  MoveInCosts?: string;
  OngoingFees?: string;
  TenantPays?: string;
  TenantPaysDescription?: string;
  AdditionalFeeYN?: boolean | string;
  AdditionalFee?: number | string;
  AdditionalFeeDescription?: string;
  FeeFrequency?: string;
  [key: string]: unknown;
}

interface DbAgentInfo {
  ListAgentFullName?: string;
  ListOfficeName?: string;
  [key: string]: unknown;
}

interface DbMediaItem {
  MediaURL?: string;
  url?: string;
  MediaType?: string;
  mediaType?: string;
  Order?: number;
  order?: number;
}

// The shape returned by Prisma listing.findMany with our select
export interface DbListing {
  id: string;
  listing_id: string;
  status: string;
  listing_type: string;
  property_type: string | null;
  property_sub_type: string | null;
  list_price: string;
  bedrooms_total: number | null;
  bathrooms_full: number | null;
  bathrooms_half: number | null;
  living_area: string | null;
  borough: string | null;
  neighborhood: string | null;
  address: unknown;
  features: unknown;
  media: unknown;
  agent_info: unknown;
  rls_eligible?: boolean;
  commercial_sub_type?: string | null;
  commercial_ownership?: string | null;
  idx_display_yn: boolean;
  internet_entire_listing_display_yn?: boolean;
  internet_address_display_yn?: boolean;
  owner_opt_out: boolean;
  participant_only: boolean;
  listing_contract_date: string | Date | null;
  modification_timestamp: string | Date;
  created_at: string | Date;
  updated_at: string | Date;
  raw_data?: unknown;
}

/** RESO StandardStatus values that are publicly displayable */
const DISPLAYABLE_STATUSES = ['Active', 'ComingSoon', 'ActiveUnderContract'];

/** Map RESO StandardStatus to user-friendly display */
const STATUS_DISPLAY: Record<string, string> = {
  Active: 'Active',
  ComingSoon: 'Coming Soon',
  ActiveUnderContract: 'Active Under Contract',
  Closed: 'Closed',
  Sold: 'Sold',
  Rented: 'Rented',
};

/**
 * Filter DB listings to only those eligible for public display.
 * Applies the same 6 REBNY distribution gates as the Trestle path.
 */
export function filterDisplayableDbListings(listings: DbListing[]): DbListing[] {
  return listings.filter((l) => {
    // Gate 1: Must be an active/displayable status
    if (!DISPLAYABLE_STATUSES.includes(l.status)) return false;
    // Website-only listings (commercial, rls_eligible=false) bypass RLS gates
    if (l.rls_eligible === false) return true;
    // Gate 2: IDX display must be enabled
    if (l.idx_display_yn === false) return false;
    // Gate 3: Internet display must be enabled
    if (l.internet_entire_listing_display_yn === false) return false;
    // Gate 4: Owner must not have opted out
    if (l.owner_opt_out) return false;
    // Gate 5: Must not be participant-only
    if (l.participant_only) return false;
    return true;
  });
}

/**
 * Convert a single Prisma DB listing to PublicListingDTO.
 */
export function dbListingToPublicDTO(listing: DbListing): PublicListingDTO {
  const addr = (listing.address || {}) as DbAddress;
  const features = (listing.features || {}) as DbFeatures;
  const agentInfo = (listing.agent_info || {}) as DbAgentInfo;
  const mediaArr = (Array.isArray(listing.media) ? listing.media : []) as DbMediaItem[];

  const streetNumber = addr.StreetNumber || '';
  const streetName = addr.StreetName
    ? `${addr.StreetName}${addr.StreetSuffix ? ' ' + addr.StreetSuffix : ''}`
    : '';
  const unitNumber = addr.UnitNumber || null;
  const city = addr.City || listing.borough || 'New York';
  const postalCode = addr.PostalCode || '';
  const borough = (addr.Borough || listing.borough || '').toLowerCase();
  const county = BOROUGH_TO_COUNTY[borough] || borough || 'New York';

  const suppressAddress = listing.internet_address_display_yn === false;
  const isComingSoon = listing.status === 'ComingSoon';
  const rawData = (listing.raw_data || {}) as Record<string, unknown>;
  const comingSoonDate = isComingSoon
    ? (rawData.ActivationDate as string | undefined) || undefined
    : undefined;

  const slug = generateListingSlug({
    address: {
      streetNumber,
      streetName,
      unitNumber,
      city,
      stateOrProvince: 'NY',
      postalCode,
    },
    id: listing.listing_id,
    mlsId: listing.listing_id,
    internetAddressDisplayYN: !suppressAddress,
  });

  const listPrice = parseFloat(listing.list_price) || 0;

  // Map media items
  const media = mediaArr
    .filter((m) => m.MediaURL || m.url)
    .map((m, i) => ({
      url: (m.MediaURL || m.url || '') as string,
      mediaType: (m.MediaType || m.mediaType || 'Photo') as string,
      order: m.Order ?? m.order ?? i,
    }));

  return {
    id: listing.listing_id,
    mlsId: listing.listing_id,
    slug,
    status: STATUS_DISPLAY[listing.status] || listing.status,
    listingType: listing.listing_type as 'sale' | 'rent',
    address: suppressAddress
      ? {
          streetNumber: '',
          streetName: 'Address Undisclosed',
          unitNumber: null,
          city,
          stateOrProvince: 'NY',
          postalCode,
          county,
          neighborhood: addr.Neighborhood || listing.neighborhood || undefined,
        }
      : {
          streetNumber,
          streetName,
          unitNumber,
          city,
          stateOrProvince: 'NY',
          postalCode,
          county,
          neighborhood: addr.Neighborhood || listing.neighborhood || undefined,
        },
    listPrice,
    originalListPrice: listPrice,
    closePrice: features.ClosePrice ? Number(features.ClosePrice) : null,
    propertyType: listing.property_type || 'Residential',
    propertySubType: listing.property_sub_type,
    bedroomsTotal: listing.bedrooms_total || 0,
    bathroomsFull: listing.bathrooms_full || 0,
    bathroomsHalf: listing.bathrooms_half || 0,
    livingArea: listing.living_area ? parseFloat(listing.living_area) : null,
    lotSizeArea: null,
    yearBuilt: features.YearBuilt ? Number(features.YearBuilt) : null,
    storiesTotal: features.StoriesTotal ? Number(features.StoriesTotal) : undefined,
    roomsTotal: features.Rooms ? Number(features.Rooms) : undefined,
    listOfficeName: agentInfo.ListOfficeName || 'Mallan Real Estate Inc.',
    media,
    photosCount: media.length,
    publicRemarks: features.PublicRemarks || undefined,
    listingContractDate: listing.listing_contract_date
      ? new Date(listing.listing_contract_date).toISOString()
      : new Date(listing.created_at).toISOString(),
    modificationTimestamp: new Date(listing.modification_timestamp || listing.updated_at).toISOString(),
    buildingName: addr.BuildingName,
    // Amenity fields from features JSON (PascalCase keys from Trestle sync)
    buildingFeatures: features.BuildingFeatures ? String(features.BuildingFeatures) : undefined,
    interiorFeatures: features.InteriorFeatures ? String(features.InteriorFeatures) : undefined,
    exteriorFeatures: features.ExteriorFeatures ? String(features.ExteriorFeatures) : undefined,
    appliances: features.Appliances ? String(features.Appliances) : undefined,
    laundryFeatures: features.LaundryFeatures ? String(features.LaundryFeatures) : undefined,
    parkingFeatures: features.ParkingFeatures ? String(features.ParkingFeatures) : undefined,
    cooling: features.Cooling ? String(features.Cooling) : undefined,
    petsAllowed: features.PetsAllowed ? String(features.PetsAllowed) : undefined,
    associationFee: features.AssociationFee ? Number(features.AssociationFee) : undefined,
    associationFeeFrequency: features.AssociationFeeFrequency,
    taxAnnualAmount: features.TaxAnnualAmount ? Number(features.TaxAnnualAmount) : undefined,
    taxYear: features.TaxYear ? Number(features.TaxYear) : undefined,
    moveInCosts: features.MoveInCosts ? String(features.MoveInCosts) : undefined,
    ongoingFees: features.OngoingFees ? String(features.OngoingFees) : undefined,
    tenantPaysDescription: features.TenantPaysDescription ? String(features.TenantPaysDescription) : undefined,
    additionalFeeYN: features.AdditionalFeeYN === true || features.AdditionalFeeYN === 'true' ? true : undefined,
    additionalFee: features.AdditionalFee ? Number(features.AdditionalFee) : undefined,
    additionalFeeDescription: features.AdditionalFeeDescription ? String(features.AdditionalFeeDescription) : undefined,
    feeFrequency: features.FeeFrequency ? String(features.FeeFrequency) : undefined,
    _source: 'exclusive',
    _displayCompliance: {
      requiresAttribution: true,
      attributionText: `Exclusive listing by ${agentInfo.ListOfficeName || 'Mallan Real Estate Inc.'}`,
      disclaimerRequired: false,
      comingSoon: isComingSoon || undefined,
      comingSoonDate,
    },
  };
}
