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
import { mapPropertyTypeToDisplay, buildAuctionPublic } from './public-dto';
import { generateListingSlug } from '@/lib/listing-slug';
import { affirmPermission, isAddressDisplayable } from '@/lib/compliance/gates';

/** Borough → County mapping (reverse of display-adapter) */
const BOROUGH_TO_COUNTY: Record<string, string> = {
  manhattan: 'New York',
  brooklyn: 'Kings',
  queens: 'Queens',
  bronx: 'Bronx',
  'staten island': 'Richmond',
};

interface DbAddress {
  street?: string;
  StreetNumber?: string;
  StreetDirPrefix?: string;
  StreetName?: string;
  StreetSuffix?: string;
  StreetDirSuffix?: string;
  UnitNumber?: string;
  City?: string;
  StateOrProvince?: string;
  PostalCode?: string;
  Borough?: string;
  Neighborhood?: string;
  SubdivisionName?: string;
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
  MediaCategory?: string;
  mediaType?: string;
  ShortDescription?: string;
  shortDescription?: string;
  Order?: number;
  order?: number;
  PreferredPhotoYN?: boolean | string;
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
  // Auction (UCBA Art. I exception path) — schema added in PR #50.
  // All five are nullable on the model; presence is gated by the validator
  // (AU-001..AU-005) at the write path. Surfaced publicly via auction object.
  auction_yn?: boolean | null;
  auction_type?: string | null;
  auction_start_date?: Date | string | null;
  auction_end_date?: Date | string | null;
  auction_terms_url?: string | null;
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
    // Website-only listings (commercial, rls_eligible=false) bypass RLS gates.
    // `rls_eligible` is a real internal boolean, not a Trestle permission flag,
    // so the literal `=== false` check is intentional here.
    if (l.rls_eligible === false) return true;
    // Gate 2: IDX display must be enabled (fail-closed: null/undefined → deny)
    if (!affirmPermission(l.idx_display_yn)) return false;
    // Gate 3: Internet display must be enabled (fail-closed)
    if (!affirmPermission(l.internet_entire_listing_display_yn)) return false;
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
  // Build full street name: StreetDirPrefix + StreetName + StreetSuffix + StreetDirSuffix
  // e.g. "W" + "END" + "Avenue" + "" = "W END Avenue"
  const streetName = [
    addr.StreetDirPrefix,
    addr.StreetName,
    addr.StreetSuffix,
    addr.StreetDirSuffix,
  ].filter(Boolean).join(' ') || '';
  const unitNumber = addr.UnitNumber || null;
  const city = addr.City || listing.borough || 'New York';
  const postalCode = addr.PostalCode || '';
  const borough = (addr.Borough || listing.borough || '').toLowerCase();
  const county = BOROUGH_TO_COUNTY[borough] || borough || 'New York';
  // Neighborhood: SubdivisionName (Trestle) > Neighborhood (legacy) > DB column
  const neighborhood = addr.SubdivisionName || addr.Neighborhood || listing.neighborhood || undefined;

  // Address display cascades through internet-entire-listing gate;
  // any null/undefined permission = suppress (fail-closed).
  const suppressAddress = !isAddressDisplayable(listing);
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

  // Map media items — proxy Trestle URLs through /api/media/proxy
  // (Trestle WAF blocks direct browser <img> requests)
  // Cotality + legacy CoreLogic hosts (old media URLs work through 2026 warranty)
  const TRESTLE_HOSTS = ['api.cotality.com', 'api-trestle.corelogic.com', 'api-prod.corelogic.com'];
  function proxyUrl(rawUrl: string): string {
    if (!rawUrl) return rawUrl;
    try {
      const parsed = new URL(rawUrl);
      if (TRESTLE_HOSTS.includes(parsed.hostname)) {
        return `/api/media/proxy?url=${encodeURIComponent(rawUrl)}`;
      }
    } catch { /* not a valid URL */ }
    return rawUrl;
  }
  // Classify media type: DB stores raw Trestle format { MediaURL, MediaCategory, Order }
  // MediaCategory = content type (Photo, Floor Plan), MediaType = file format (jpeg) — NOT content type.
  // Must check MediaCategory first, then mediaType (mapped format), then default to Photo.
  function classifyMedia(m: DbMediaItem): string {
    const cat = String(m.MediaCategory || '').toLowerCase();
    const desc = String(m.ShortDescription || m.shortDescription || '').toLowerCase();
    if (cat.includes('floor plan') || cat.includes('floorplan') || desc.includes('floor plan') || desc.includes('floorplan')) return 'FloorPlan';
    if (cat.includes('video')) return 'Video';
    if (cat.includes('virtual tour') || cat.includes('virtualtour') || cat === '3d') return 'VirtualTour';
    if (cat && cat !== 'photo') return cat; // pass through other categories
    // Mapped format (from fetchListingMedia)
    const mapped = String(m.mediaType || '');
    if (mapped === 'FloorPlan' || mapped === 'Video' || mapped === 'VirtualTour') return mapped;
    return 'Photo';
  }

  const media = mediaArr
    .filter((m) => m.MediaURL || m.url)
    .map((m, i) => {
      const mt = classifyMedia(m);
      const isPreferred = (m.PreferredPhotoYN === true || m.PreferredPhotoYN === 'true');
      return {
        url: proxyUrl((m.MediaURL || m.url || '') as string),
        mediaType: mt,
        // PreferredPhotoYN only boosts actual Photos — FloorPlans always sort last
        order: (isPreferred && mt === 'Photo') ? -1 : (m.Order ?? m.order ?? i),
      };
    })
    // Sort: Photos first (rank 0), Videos/Tours (rank 1), FloorPlans last (rank 2)
    .sort((a, b) => {
      const typeRank = (t: string) => t === 'Photo' ? 0 : t === 'FloorPlan' ? 2 : 1;
      const rankDiff = typeRank(a.mediaType) - typeRank(b.mediaType);
      return rankDiff !== 0 ? rankDiff : a.order - b.order;
    });

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
          neighborhood,
        }
      : {
          streetNumber,
          streetName,
          unitNumber,
          city,
          stateOrProvince: 'NY',
          postalCode,
          county,
          neighborhood,
        },
    listPrice,
    originalListPrice: rawData.OriginalListPrice != null ? Number(rawData.OriginalListPrice) : listPrice,
    previousListPrice: rawData.PreviousListPrice != null ? Number(rawData.PreviousListPrice) : undefined,
    closePrice: rawData.ClosePrice != null ? Number(rawData.ClosePrice) : (features.ClosePrice != null ? Number(features.ClosePrice) : null),
    propertyType: mapPropertyTypeToDisplay(
      features.CommonInterest as string | undefined,
      listing.property_sub_type,
      listing.property_type || 'Residential',
    ),
    propertySubType: listing.property_sub_type,
    bedroomsTotal: listing.bedrooms_total || 0,
    bathroomsFull: listing.bathrooms_full || 0,
    bathroomsHalf: listing.bathrooms_half || 0,
    livingArea: listing.living_area ? parseFloat(listing.living_area) : null,
    lotSizeArea: features.LotSizeArea ? Number(features.LotSizeArea) : null,
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
    onMarketDate: rawData.OnMarketDate ? String(rawData.OnMarketDate) : undefined,
    closeDate: rawData.CloseDate ? String(rawData.CloseDate) : undefined,
    buildingName: addr.BuildingName,
    architecturalStyle: features.ArchitecturalStyle ? String(features.ArchitecturalStyle) : undefined,
    // Amenity fields from features JSON (PascalCase keys from Trestle sync)
    buildingFeatures: features.BuildingFeatures ? String(features.BuildingFeatures) : undefined,
    interiorFeatures: features.InteriorFeatures ? String(features.InteriorFeatures) : undefined,
    exteriorFeatures: features.ExteriorFeatures ? String(features.ExteriorFeatures) : undefined,
    appliances: features.Appliances ? String(features.Appliances) : undefined,
    laundryFeatures: features.LaundryFeatures ? String(features.LaundryFeatures) : undefined,
    securityFeatures: features.SecurityFeatures ? String(features.SecurityFeatures) : undefined,
    attendanceType: features.AttendanceType ? String(features.AttendanceType) : undefined,
    communityFeatures: features.CommunityFeatures ? String(features.CommunityFeatures) : undefined,
    associationAmenities: features.AssociationAmenities ? String(features.AssociationAmenities) : undefined,
    parkingFeatures: features.ParkingFeatures ? String(features.ParkingFeatures) : undefined,
    poolFeatures: features.PoolFeatures ? String(features.PoolFeatures) : undefined,
    spaFeatures: features.SpaFeatures ? String(features.SpaFeatures) : undefined,
    heating: features.Heating ? String(features.Heating) : undefined,
    cooling: features.Cooling ? String(features.Cooling) : undefined,
    flooring: features.Flooring ? String(features.Flooring) : undefined,
    petsAllowedDetail: features.PetsAllowed ? String(features.PetsAllowed) : undefined,
    petsAllowed: features.PetsAllowed ? String(features.PetsAllowed) : undefined,
    associationFee: features.AssociationFee != null ? Number(features.AssociationFee) : undefined,
    associationFeeFrequency: features.AssociationFeeFrequency,
    taxAnnualAmount: features.TaxAnnualAmount != null ? Number(features.TaxAnnualAmount) : undefined,
    taxYear: features.TaxYear != null ? Number(features.TaxYear) : undefined,
    // Rental-specific
    leaseAmount: rawData.LeaseAmount != null ? Number(rawData.LeaseAmount) : undefined,
    leaseAmountFrequency: rawData.LeaseAmountFrequency ? String(rawData.LeaseAmountFrequency) : undefined,
    furnished: features.Furnished ? String(features.Furnished) : undefined,
    availabilityDate: rawData.AvailabilityDate ? String(rawData.AvailabilityDate) : undefined,
    // Days on Market
    daysOnMarket: rawData.DaysOnMarket != null ? Number(rawData.DaysOnMarket) : undefined,
    cumulativeDaysOnMarket: rawData.CumulativeDaysOnMarket != null ? Number(rawData.CumulativeDaysOnMarket) : undefined,
    // Virtual tour
    virtualTourURL: rawData.VirtualTourURLUnbranded ? String(rawData.VirtualTourURLUnbranded) : (rawData.VirtualTourURLBranded ? String(rawData.VirtualTourURLBranded) : undefined),
    // FARE Act fee transparency
    moveInCosts: features.MoveInCosts ? String(features.MoveInCosts) : undefined,
    ongoingFees: features.OngoingFees ? String(features.OngoingFees) : undefined,
    tenantPays: features.TenantPays ? String(features.TenantPays) : undefined,
    tenantPaysDescription: features.TenantPaysDescription ? String(features.TenantPaysDescription) : undefined,
    additionalFeeYN: features.AdditionalFeeYN === true || features.AdditionalFeeYN === 'true' ? true : undefined,
    additionalFee: features.AdditionalFee != null ? Number(features.AdditionalFee) : undefined,
    additionalFeeDescription: features.AdditionalFeeDescription ? String(features.AdditionalFeeDescription) : undefined,
    feeFrequency: features.FeeFrequency ? String(features.FeeFrequency) : undefined,
    // Auction (UCBA Art. I exception path) — null on non-auction listings.
    // buildAuctionPublic() reads the snake_case columns from the DB row and
    // returns null unless auction_yn === true AND type/endDate are present.
    auction: buildAuctionPublic(listing),
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
