/**
 * Display Adapter — maps API response listings to a slim DisplayListing type.
 *
 * The /api/listings endpoint returns two possible shapes:
 * - PublicListingDTO (flat, from Trestle/IDX path)
 * - Listing (deeply nested, from local data/listings.json fallback)
 *
 * This adapter normalizes both into DisplayListing for frontend cards.
 *
 * @module lib/idx/display-adapter
 */

import type { PublicListingDTO } from './public-dto';
import { generateListingSlug } from '@/lib/listing-slug';
import { buildCanonicalListingPath } from '@/lib/listing-canonical-url';

/** County → Borough mapping for NYC */
const COUNTY_TO_BOROUGH: Record<string, string> = {
  'new york': 'Manhattan',
  'kings': 'Brooklyn',
  'queens': 'Queens',
  'bronx': 'Bronx',
  'richmond': 'Staten Island',
};

function countyToBorough(county: string): string {
  return COUNTY_TO_BOROUGH[county.toLowerCase()] || county;
}

/**
 * Get the URL slug for a listing.
 * COMPLIANCE: The slug is pre-computed by toPublicDTO() and respects
 * InternetAddressDisplayYN — suppressed addresses get MLS-ID slugs.
 */
export function listingSlug(listing: DisplayListing): string {
  return listing.slug;
}

/**
 * Build the listing detail URL — the ONE canonical public path:
 * `/listing/{address-slug}/{id-lower}` (or `/listing/listing-{id}` when the
 * address is suppressed). No hybrid slug, no `?key=`. Legacy inbound URLs
 * still 308-redirect at the detail route. (2026-05-28)
 */
export function listingHref(listing: DisplayListing): string {
  return buildCanonicalListingPath({ slug: listing.slug, id: listing.id });
}

/**
 * PR-C (2026-06-05) — a card has a 3D/virtual tour when the Property field
 * `virtualTourURL` (mapped from `VirtualTourURLBranded`/`VirtualTourURLUnbranded`)
 * is a non-empty string. Live probe confirmed IDX Plus serves the tour as a URL
 * FIELD, not a Media-resource row, so this keys on `virtualTourURL` — NOT the
 * photo-filtered `media[]`. Never surfaced as "Video": IDX Plus exposes only
 * `VideosCount` (a count) with no playable video URL.
 */
export function hasVirtualTour(listing: Pick<DisplayListing, 'virtualTourURL'>): boolean {
  return typeof listing.virtualTourURL === 'string' && listing.virtualTourURL.trim().length > 0;
}

/** Slim listing type for frontend cards — no 414-line monster */
export interface DisplayListing {
  id: string;
  mlsId: string;
  /** URL slug — address-based when allowed, MLS-ID fallback when address suppressed */
  slug: string;
  status: string;
  listingType: 'sale' | 'rent';
  address: {
    streetNumber: string;
    streetName: string;
    unitNumber: string | null;
    city: string;
    borough: string;
    neighborhood: string;
    postalCode: string;
    latitude?: number;
    longitude?: number;
  };
  listPrice: number;
  originalListPrice: number;
  bedroomsTotal: number;
  bathroomsFull: number;
  bathroomsHalf: number;
  livingArea: number | null;
  propertyType: string;
  propertySubType: string | null;
  associationFee?: number;
  associationFeeFrequency?: string;
  listOfficeName: string;
  modificationTimestamp: string;
  media: { url: string; mediaType: string; order: number }[];
  photosCount?: number;
  virtualTourURL?: string;
  publicRemarks?: string;
  petsAllowed?: string;
  availabilityDate?: string;
  moveInCosts?: string;
  ongoingFees?: string;
  tenantPaysDescription?: string;
  _source?: string;
  _displayCompliance: {
    comingSoon?: boolean;
    comingSoonDate?: string;
    attributionText: string;
    requiresAttribution: boolean;
  };
  /**
   * PR-FE.2 Option C (2026-05-15) — co-listed siblings annotation.
   * Set by the API route's `annotateCoListedSiblings` post-processor on
   * listings that share their canonical address slug with at least one
   * other listing on the same response page. Optional; absent / 0 on
   * single-source listings. See `lib/idx/public-dto.ts` for the field
   * definition and badge-text shape decisions.
   */
  _coListedCount?: number;
  _coListedBrokerages?: string[];
}

/** Convert a PublicListingDTO (from IDX/Trestle path) to DisplayListing */
export function fromPublicDTO(dto: PublicListingDTO): DisplayListing {
  return {
    id: dto.id,
    mlsId: dto.mlsId,
    slug: dto.slug,
    status: dto.status,
    listingType: dto.listingType,
    address: {
      streetNumber: dto.address.streetNumber,
      streetName: dto.address.streetName,
      unitNumber: dto.address.unitNumber,
      city: dto.address.city,
      borough: countyToBorough(dto.address.county),
      neighborhood: dto.address.neighborhood || '',
      postalCode: dto.address.postalCode,
      latitude: dto.address.latitude,
      longitude: dto.address.longitude,
    },
    listPrice: dto.listPrice,
    originalListPrice: dto.originalListPrice,
    bedroomsTotal: dto.bedroomsTotal,
    bathroomsFull: dto.bathroomsFull,
    bathroomsHalf: dto.bathroomsHalf,
    livingArea: dto.livingArea,
    propertyType: dto.propertyType,
    propertySubType: dto.propertySubType,
    associationFee: dto.associationFee,
    associationFeeFrequency: dto.associationFeeFrequency,
    listOfficeName: dto.listOfficeName,
    modificationTimestamp: dto.modificationTimestamp,
    media: dto.media,
    photosCount: dto.photosCount,
    virtualTourURL: dto.virtualTourURL,
    publicRemarks: dto.publicRemarks,
    petsAllowed: dto.petsAllowed,
    availabilityDate: dto.availabilityDate,
    moveInCosts: dto.moveInCosts,
    ongoingFees: dto.ongoingFees,
    tenantPaysDescription: dto.tenantPaysDescription,
    _source: dto._source,
    _displayCompliance: dto._displayCompliance,
    // PR-FE.2 Option C — pass-through the API-layer annotation when present.
    _coListedCount: dto._coListedCount,
    _coListedBrokerages: dto._coListedBrokerages,
  };
}

/**
 * Convert a raw API listing (unknown shape) to DisplayListing.
 *
 * Detects whether the listing is a PublicListingDTO (flat) or
 * a Listing (deeply nested, from local fallback) and maps accordingly.
 */
 
export function toDisplayListing(raw: any): DisplayListing {
  // PublicListingDTO has listPrice at top level; Listing has price.listPrice
  if (typeof raw.listPrice === 'number') {
    return fromPublicDTO(raw as PublicListingDTO);
  }

  // Local fallback: Listing shape (deeply nested)
  const localSlug = generateListingSlug({
    address: {
      streetNumber: raw.address?.streetNumber || '',
      streetName: raw.address?.streetName || '',
      unitNumber: raw.address?.unit || null,
      city: raw.address?.city || '',
      stateOrProvince: 'NY',
      postalCode: raw.address?.zip || '',
    },
    id: raw.id,
    mlsId: raw.mlsId || raw.id,
    // Local listings don't have this flag — default to true (address allowed)
    internetAddressDisplayYN: true,
  });
  return {
    id: raw.id,
    mlsId: raw.mlsId || raw.id,
    slug: localSlug,
    status: raw.status,
    listingType: raw.listingType,
    address: {
      streetNumber: raw.address?.streetNumber || '',
      streetName: raw.address?.streetName || 'Address Undisclosed',
      unitNumber: raw.address?.unit || null,
      city: raw.address?.city || '',
      borough: raw.address?.borough || '',
      neighborhood: raw.address?.neighborhoodDisplay || raw.address?.neighborhood || '',
      postalCode: raw.address?.zip || '',
      latitude: raw.address?.latitude,
      longitude: raw.address?.longitude,
    },
    listPrice: raw.price?.listPrice || 0,
    originalListPrice: raw.price?.originalListPrice || raw.price?.listPrice || 0,
    bedroomsTotal: raw.propertyInfo?.bedroomsTotal || 0,
    bathroomsFull: raw.propertyInfo?.bathroomsFull || 0,
    bathroomsHalf: raw.propertyInfo?.bathroomsHalf || 0,
    livingArea: raw.propertyInfo?.aboveGradeFinishedArea || null,
    propertyType: raw.propertyInfo?.propertyType || '',
    propertySubType: raw.propertyInfo?.propertySubType || null,
    associationFee: raw.nycSpecific?.maintenanceFee,
    associationFeeFrequency: raw.nycSpecific?.maintenanceFee ? 'Monthly' : undefined,
    listOfficeName: raw.agent?.listOfficeName || '',
    modificationTimestamp: raw.listing?.modificationTimestamp || '',
    media: raw.media?.images?.map((img: { url: string }, i: number) => ({
      url: img.url,
      mediaType: 'Photo',
      order: i,
    })) || [],
    photosCount: raw.media?.images?.length,
    virtualTourURL: raw.media?.virtualTourUrl,
    publicRemarks: raw.publicRemarks,
    petsAllowed: raw.features?.pets?.allowed ? 'Yes' : undefined,
    _source: raw._source,
    _displayCompliance: {
      comingSoon: raw.status === 'coming-soon' || raw.compliance?.comingSoonDate ? true : undefined,
      comingSoonDate: raw.compliance?.comingSoonDate || raw.activationDate || undefined,
      attributionText: `Listing courtesy of ${raw.agent?.listOfficeName?.trim() || 'REBNY RLS'}`,
      requiresAttribution: true,
    },
  };
}
