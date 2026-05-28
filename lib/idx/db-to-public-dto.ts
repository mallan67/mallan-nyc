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
import {
  resolveListingMedia,
  resolveListingMediaFromRows,
  type ListingMediaTableRow,
} from '@/lib/media/listing-media-resolver';

import { normalizeStreetCase } from './normalize-street-case';

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
  // Trestle stores Latitude/Longitude on the Property resource. Per the
  // 2026-03-04 CLAUDE.md note REBNY's IDX Plus feed returns these as null
  // for the vast majority of records and our `geocodeListings()` fills the
  // gap. When they ARE populated by Trestle (or by our geocode-cache
  // backfill), propagate them so the map can render without paying for an
  // online geocode round-trip on every request.
  Latitude?: number | string | null;
  Longitude?: number | string | null;
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
  mls_id?: string | null;
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
  // C1 fix (2026-05-13): ownership signals required to classify each row as
  // Mallan-authored (`agent_id` or `owner_client_id` non-null), website-only
  // commercial (`rls_eligible === false`), or third-party IDX/RLS. Without
  // these, every DB row was hard-coded as `_source: 'exclusive'` regardless
  // of provenance — see the per-row classifier below.
  //
  // Prisma exposes both as `bigint | null`; the route's serialize step
  // stringifies for JSON safety and the classifier only checks `!= null`,
  // so accepting either shape keeps callers flexible.
  agent_id?: bigint | string | null;
  owner_client_id?: bigint | string | null;
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
  // PR 4 reader swap — relational media table.
  //
  // When the caller's Prisma query includes `listing_media: { ... }`, this
  // field carries the typed media rows. When it doesn't, the field is
  // undefined and the mapper falls back to the legacy `media` JSON column.
  // Both paths flow through the same classify→sort pipeline so the public
  // DTO shape is identical.
  listing_media?: ListingMediaTableRow[];
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

const DB_TRESTLE_PROXY_HOSTS = new Set(['api.cotality.com', 'api-trestle.corelogic.com', 'api-prod.corelogic.com']);

function proxyDbMediaUrl(rawUrl: string): string {
  if (!rawUrl) return rawUrl;
  try {
    const parsed = new URL(rawUrl);
    if (DB_TRESTLE_PROXY_HOSTS.has(parsed.hostname)) {
      return `/api/media/proxy?url=${encodeURIComponent(rawUrl)}`;
    }
  } catch {
    return rawUrl;
  }
  return rawUrl;
}

/**
 * Provenance of a DB-cached listing row.
 *
 * - `mallan-exclusive`: owned by a Mallan client (`owner_client_id` non-null)
 *   or carried by a Mallan agent (`agent_id` non-null). True Mallan exclusive.
 * - `website-only`: commercial / off-RLS listing (`rls_eligible === false`).
 *   Bypasses REBNY distribution gates; surfaced only on mallan.nyc.
 * - `third-party-idx`: synced from REBNY RLS via Trestle/IDX Plus with no
 *   Mallan attribution. Must carry the full REBNY disclaimer and
 *   `_source: "db+idx"`.
 */
export type DbListingProvenance =
  | 'mallan-exclusive'
  | 'website-only'
  | 'third-party-idx';

/**
 * Classify a DB row by provenance. C1 fix (2026-05-13).
 *
 * Before this helper existed, `dbListingToPublicDTO` hard-coded every row as
 * `_source: 'exclusive'` and `disclaimerRequired: false`, mis-labeling every
 * Trestle-synced third-party row as a Mallan exclusive (10,484 / 10,484 rows
 * affected). The classifier is exported so tests, sitemap, and any downstream
 * consumer can reuse the same predicate.
 */
export function classifyDbListing(listing: Pick<DbListing,
  'agent_id' | 'owner_client_id' | 'rls_eligible'>): DbListingProvenance {
  // Website-only check first: commercial rows opt out of RLS entirely and
  // are tagged exclusive (Mallan-owned) by definition.
  if (listing.rls_eligible === false) return 'website-only';
  if (listing.agent_id != null || listing.owner_client_id != null) {
    return 'mallan-exclusive';
  }
  return 'third-party-idx';
}

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
  const streetDirPrefix = addr.StreetDirPrefix || '';
  const streetNameRaw = [
    addr.StreetName,
    addr.StreetSuffix,
    addr.StreetDirSuffix,
  ].filter(Boolean).join(' ') || '';
  const streetName = normalizeStreetCase(streetNameRaw);
  const unitNumber = addr.UnitNumber || null;
  const city = addr.City || listing.borough || 'New York';
  const postalCode = addr.PostalCode || '';
  const borough = (addr.Borough || listing.borough || '').toLowerCase();
  const county = BOROUGH_TO_COUNTY[borough] || borough || 'New York';
  // Neighborhood: SubdivisionName (Trestle) > Neighborhood (legacy) > DB column
  const neighborhood = addr.SubdivisionName || addr.Neighborhood || listing.neighborhood || undefined;

  // CRM-created exclusives always show address — IDX gate is for RLS-distributed only.
  // Use listing_id prefix (always selected, always present) instead of mls_id
  // which may not be selected by every caller.
  const isCrmExclusive = listing.listing_id.startsWith('SL-') || listing.listing_id.startsWith('RL-');
  const suppressAddress = isCrmExclusive ? false : !isAddressDisplayable(listing);
  const isComingSoon = listing.status === 'ComingSoon';
  const rawData = (listing.raw_data || {}) as Record<string, unknown>;
  const comingSoonDate = isComingSoon
    ? (rawData.ActivationDate as string | undefined) || undefined
    : undefined;

  const slug = generateListingSlug({
    address: {
      streetNumber,
      streetDirPrefix,
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

  // PR 4 reader swap (2026-05-11): prefer the relational `listing_media`
  // table when the caller's Prisma query included it. The 99.67% of listings
  // already mirrored to R2 serve directly from R2 URLs (no Trestle proxy),
  // and ordering / FloorPlan classification stay identical because both
  // paths flow through the same `listing-media-resolver` pipeline.
  //
  // Fallback: when `listing_media` is empty (un-synced listing, mid-sync
  // race, or caller didn't include the relation), read the legacy
  // `Listing.media` JSON column so no listing renders blank.
  const tableRows = Array.isArray(listing.listing_media) ? listing.listing_media : [];
  const resolved = tableRows.length > 0
    ? resolveListingMediaFromRows(tableRows)
    : resolveListingMedia(mediaArr, { mapUrl: proxyDbMediaUrl });
  const media = resolved.map((m) => ({
    url: m.url,
    mediaType: m.mediaType,
    order: m.providerOrder,
  }));
  const photoCount = media.filter((m) => m.mediaType === 'Photo').length;

  return {
    id: listing.listing_id,
    mlsId: listing.listing_id,
    slug,
    status: STATUS_DISPLAY[listing.status] || listing.status,
    listingType: listing.listing_type as 'sale' | 'rent',
    address: suppressAddress
      ? {
          // UCBA Art. III §2(C) — when InternetAddressDisplayYN is not
          // affirmed, the address text AND map pin both must be suppressed.
          // Revealing exact lat/lng on a map would defeat the address
          // suppression by allowing reverse-lookup, so coords are intentionally
          // omitted on this branch.
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
          streetName: [streetDirPrefix, streetName].filter(Boolean).join(' '),
          unitNumber,
          city,
          stateOrProvince: 'NY',
          postalCode,
          county,
          neighborhood,
          // PR (search-fix): propagate Latitude/Longitude from the DB's
          // address JSON so the map can render without depending on
          // geocodeListings() winning a 1.5s timeout race. When Trestle
          // didn't supply coords (the common case on this REBNY feed) the
          // values are null/undefined — geocodeListings will then attempt
          // to fill them. Numeric coercion handles both number and string
          // JSON shapes; `null` and `undefined` cascade to `undefined`.
          latitude:
            addr.Latitude != null && !Number.isNaN(Number(addr.Latitude))
              ? Number(addr.Latitude)
              : undefined,
          longitude:
            addr.Longitude != null && !Number.isNaN(Number(addr.Longitude))
              ? Number(addr.Longitude)
              : undefined,
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
    // UCBA Art. III §2(C) — listing attribution must identify the ACTUAL listing
    // broker, never the displaying broker. Falling back to "Mallan Real Estate
    // Inc." when the source data omits `ListOfficeName` would falsely attribute
    // every IDX listing to us. When the source data is silent, fall back to the
    // neutral "REBNY RLS" string (matches the pattern in `BuildingUnits.tsx`
    // and `SearchMap.tsx`). Mallan attribution is preserved only when the source
    // row's `agent_info.ListOfficeName` actually carries it.
    listOfficeName: agentInfo.ListOfficeName?.trim() || 'REBNY RLS',
    media,
    photosCount: photoCount,
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
    // C1 fix (2026-05-13): _source + _displayCompliance are now derived from
    // provenance instead of hard-coded. Before this fix every DB row was
    // labeled `_source: 'exclusive'` / `disclaimerRequired: false` regardless
    // of whether it was Mallan-authored or a 3rd-party Trestle sync. See
    // `classifyDbListing` above for the predicate.
    ...buildSourceAndCompliance(listing, agentInfo, isComingSoon, comingSoonDate),
  };
}

/**
 * Derive `_source` + `_displayCompliance` from listing provenance.
 *
 * - `third-party-idx` → `_source: 'db+idx'`, full REBNY disclaimer required,
 *   attribution courtesy of the actual listing brokerage (or "REBNY RLS" when
 *   the source row omits ListOfficeName).
 * - `mallan-exclusive` → `_source: 'exclusive'`, no RLS disclaimer (this is
 *   our own listing), attribution = "Exclusive listing by Mallan Real Estate
 *   Inc.".
 * - `website-only` → same as mallan-exclusive but for commercial rows that
 *   bypass RLS entirely; no RLS disclaimer because the data is not RLS-sourced.
 */
function buildSourceAndCompliance(
  listing: DbListing,
  agentInfo: DbAgentInfo,
  isComingSoon: boolean,
  comingSoonDate: string | undefined,
): Pick<PublicListingDTO, '_source' | '_displayCompliance'> {
  const provenance = classifyDbListing(listing);
  const officeName = agentInfo.ListOfficeName?.trim() || 'REBNY RLS';

  if (provenance === 'third-party-idx') {
    return {
      _source: 'db+idx',
      _displayCompliance: {
        requiresAttribution: true,
        // UCBA Art. III §2(C) — listing attribution must identify the ACTUAL
        // listing broker, never the displaying broker.
        attributionText: `Listing courtesy of ${officeName}`,
        disclaimerRequired: true,
        comingSoon: isComingSoon || undefined,
        comingSoonDate,
      },
    };
  }

  // mallan-exclusive or website-only — same attribution shape, no RLS
  // disclaimer required (Mallan-owned data, not third-party IDX content).
  return {
    _source: 'exclusive',
    _displayCompliance: {
      requiresAttribution: true,
      attributionText: 'Exclusive listing by Mallan Real Estate Inc.',
      disclaimerRequired: false,
      comingSoon: isComingSoon || undefined,
      comingSoonDate,
    },
  };
}
