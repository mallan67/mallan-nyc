/**
 * Display Adapter — maps API response listings to a slim DisplayListing type.
 *
 * The /api/listings endpoint returns two possible shapes:
 * - PublicListingDTO (flat, from Trestle/IDX path)
 * - Listing (deeply nested legacy shape — the static data/listings.json catalogue is gone; no runtime source produces it)
 *
 * This adapter normalizes both into DisplayListing for frontend cards.
 *
 * @module lib/idx/display-adapter
 */

import type { PublicListingDTO } from './public-dto';
import { generateListingSlug } from '@/lib/listing-slug';
import { buildCanonicalListingPath } from '@/lib/listing-canonical-url';
import { resolveListingMedia, toDtoMedia } from '@/lib/media/listing-media-resolver';

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
 * COMPLIANCE: The slug is pre-computed by dbListingToPublicDTO() and respects
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

/**
 * A card has a playable VIDEO when `videoUrl` (host-split out of the Trestle
 * `VirtualTourURL*` fields — YouTube/Vimeo/etc.) is a non-empty string. Distinct
 * from `hasVirtualTour` (3D walk-throughs like Matterport).
 */
export function hasVideo(listing: Pick<DisplayListing, 'videoUrl'>): boolean {
  return typeof listing.videoUrl === 'string' && listing.videoUrl.trim().length > 0;
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
  media: { url: string; mediaType: string; order: number; isPrimary?: boolean }[];
  photosCount?: number;
  virtualTourURL?: string;
  videoUrl?: string;
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
  /** Upcoming public open house (populated server-side by /api/listings) for the card banner. */
  nextOpenHouse?: import('@/lib/open-houses/upcoming-open-houses').NextOpenHouse;
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
    videoUrl: dto.videoUrl,
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
    nextOpenHouse: dto.nextOpenHouse,
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

  // ── LEGACY / DEAD PATH — local fallback: Listing shape (deeply nested) ────
  //
  // REACHABILITY PROVEN 2026-08-07: this branch does not execute in production.
  // The only callers of `toDisplayListing` are lib/hooks/useListings.ts:217 and
  // :263, both mapping `data.listings` from `/api/listings`, which returns
  // PublicListingDTO with a TOP-LEVEL numeric `listPrice` (verified live:
  // 128000000, no nested `price` object). The guard above is therefore always
  // true and control never reaches here.
  //
  // That matters because this block hard-codes `internetAddressDisplayYN: true`
  // below. If it ever BECOMES reachable with RLS-backed or seller-suppressed
  // inventory, that hard-coded `true` is a FAIL-OPEN defect — it would build an
  // address-bearing slug for a listing whose address must be withheld.
  // "Local" is not a synonym for "permission granted."
  //
  // Left unchanged deliberately: altering an unexecuted branch's semantics is
  // risk without benefit. Guarded instead by
  // tests/runtime/display-adapter-fallback-reachability.test.ts, which fails if
  // a new caller appears or the DTO shape contract changes. If you make this
  // reachable, route the decision through
  // `lib/compliance/db-address-decision.ts` FIRST.
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
  // Route the local fallback through the SAME resolver as the DTO paths, so a floor plan in the
  // local `media.images` is classified + demoted (photo-first) instead of being force-tagged 'Photo'.
  const localMedia = toDtoMedia(resolveListingMedia(raw.media?.images ?? []));
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
    media: localMedia,
    photosCount: localMedia.filter((m) => m.mediaType === 'Photo').length,
    virtualTourURL: raw.media?.virtualTourUrl,
    videoUrl: raw.media?.videoUrl,
    publicRemarks: raw.publicRemarks,
    petsAllowed: raw.features?.pets?.allowed ? 'Yes' : undefined,
    _source: raw._source,
    _displayCompliance: {
      comingSoon: raw.status === 'coming-soon' || raw.compliance?.comingSoonDate ? true : undefined,
      comingSoonDate: raw.compliance?.comingSoonDate || raw.activationDate || undefined,
      attributionText: `Listing courtesy of ${raw.agent?.listOfficeName?.trim() || 'REBNY RLS'}`,
      requiresAttribution: true,
    },
    nextOpenHouse: raw.nextOpenHouse,
  };
}
