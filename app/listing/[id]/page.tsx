import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import InquiryForm from '@/app/components/InquiryForm';
import PriceWithCalculator from '@/app/components/PriceWithCalculator';
import InvestorCalculator from '@/app/components/InvestorCalculator';
import RentVsBuyCalculator from '@/app/components/RentVsBuyCalculator';
import IDXDisclaimer from '@/app/components/IDXDisclaimer';
import ListingMediaGallery from '@/app/components/ListingMediaGallery';
import BackButton from '@/app/components/BackButton';
import MarketSnapshot from '@/app/components/MarketSnapshot';
import ShareButton from '@/app/components/ShareButton';
import DetailFavoriteButton from '@/app/components/DetailFavoriteButton';
import SocialShareBar from '@/app/components/SocialShareBar';
import TransitCommuteTool from '@/app/components/TransitCommuteTool';
import TransitSidebarSummary from '@/app/components/TransitSidebarSummary';
import NeighborhoodExplorer from '@/app/components/NeighborhoodExplorer';
import BuildingUnits from '@/app/components/BuildingUnits';
import PriceHistory from '@/app/components/PriceHistory';
import SimilarListings from '@/app/components/SimilarListings';
import SchoolInfo from '@/app/components/SchoolInfo';
import ListingOpenHouseRSVP from '@/app/components/ListingOpenHouseRSVP';
import { findNeighborhood } from '@/lib/neighborhoods/boroughs';
import type { BoroughSlug } from '@/lib/types/neighborhood';
import SubwayBadge from '@/app/components/neighborhoods/SubwayBadge';
import { fetchSingleListing, fetchListingMedia, fetchListingByAddress } from '@/lib/idx/fetch';
import { checkDistributionGates } from '@/lib/idx/trestle-mapper';
import { mapRESOToInternal } from '@/lib/idx/mapping';
import { toPublicDTO, type PublicListingDTO } from '@/lib/idx/public-dto';
import { isMlsIdSlug, extractMlsIdFromSlug, parseAddressSlug, generateListingSlug } from '@/lib/listing-slug';
import { buildingHref } from '@/lib/buildings/slug';
import { geocodeListings } from '@/lib/geo/geocode';
import { cache } from 'react';
import RecentlyViewedTracker from '@/app/components/RecentlyViewedTracker';
import ListingViewTracker from '@/app/components/ListingViewTracker';
import TrackListingView from '@/app/components/TrackListingView';
import TrackListingSend from '@/app/components/TrackListingSend';

import { getAccessToken } from '@/lib/idx/auth';
import { soda } from '@/lib/soda';
import prisma from '@/lib/prisma';

// ISR — revalidate every 5 minutes for fresh Trestle data with edge caching
export const revalidate = 300;
export const maxDuration = 60;

/** Borough name → ACRIS borough code (1=Manhattan, 2=Bronx, 3=Brooklyn, 4=Queens, 5=SI) */
const BOROUGH_TO_CODE: Record<string, string> = {
  manhattan: '1', 'new york': '1',
  bronx: '2',
  brooklyn: '3', kings: '3',
  queens: '4',
  'staten island': '5', richmond: '5',
};

interface LastSaleInfo {
  closePrice: number;
  closeDate: string;
  sqft: number;
  source: 'trestle' | 'acris';
}

/** Fetch last closed sale for a specific unit from Trestle */
async function fetchLastUnitSale(
  streetNumber: string,
  streetName: string,
  unitNumber: string | null,
  postalCode: string,
): Promise<LastSaleInfo | null> {
  if (!streetNumber || !streetName) return null;
  try {
    const token = await getAccessToken();
    const baseUrl = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';
    const escapedStreet = streetName.replace(/'/g, "''");
    let filter = `StreetNumber eq '${streetNumber}' and contains(StreetName,'${escapedStreet}') and PostalCode eq '${postalCode}' and (MlsStatus eq 'Closed' or StandardStatus eq 'Closed')`;
    if (unitNumber) {
      const escapedUnit = unitNumber.replace(/'/g, "''");
      filter += ` and UnitNumber eq '${escapedUnit}'`;
    }
    const params = new URLSearchParams({
      $filter: filter,
      $select: 'ClosePrice,CloseDate,LivingArea,ListPrice',
      $orderby: 'CloseDate desc',
      $top: '1',
    });
    const res = await fetch(`${baseUrl}/odata/Property?${params}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const record = data?.value?.[0];
    if (!record) return null;
    return {
      closePrice: Number(record.ClosePrice || record.ListPrice || 0),
      closeDate: record.CloseDate ? String(record.CloseDate) : '',
      sqft: Number(record.LivingArea || 0),
      source: 'trestle' as const,
    };
  } catch {
    return null;
  }
}

/** Fetch last sale from ACRIS (NYC public records) by borough/block/lot as fallback */
async function fetchLastSaleFromACRIS(
  county: string,
  taxBlock: string | null,
  taxLot: string | null,
): Promise<LastSaleInfo | null> {
  if (!taxBlock || !taxLot) return null;

  const boroCode = BOROUGH_TO_CODE[county.toLowerCase()];
  if (!boroCode) return null;

  // ACRIS uses separate borough, block (5-digit), lot (4-digit) columns
  const block = taxBlock.padStart(5, '0');
  const lot = taxLot.padStart(4, '0');

  try {
    const MASTER = process.env.SODA_DATASET_ACRIS_MASTER;
    const REALPROP = process.env.SODA_DATASET_ACRIS_REALPROPERTY;
    if (!MASTER || !REALPROP) return null;

    // Step 1: Get document IDs for this property (borough + block + lot)
    const docRows = await soda<{ document_id: string }>({
      resource: REALPROP,
      where: `borough='${boroCode}' AND block='${block}' AND lot='${lot}'`,
      select: 'document_id',
      order: 'document_id DESC',
      limit: 50,
    });

    if (docRows.length === 0) return null;

    // Step 2: Get transfer/deed documents with sale amounts
    // NYC condos/co-ops use RPTT&RET (Real Property Transfer Tax), houses use DEED/DEEDO
    const docIds = docRows.map(r => r.document_id);
    const where = `document_id in (${docIds.map(id => `'${id}'`).join(',')}) AND doc_type in ('DEED','DEEDO','RPTT&RET') AND document_amt>'0'`;
    const docs = await soda<{
      document_id: string;
      doc_type: string;
      document_amt?: string;
      recorded_datetime?: string;
      good_through_date?: string;
    }>({
      resource: MASTER,
      where,
      order: 'recorded_datetime DESC',
      limit: 5,
    });

    // Find the most recent deed with a sale amount
    for (const doc of docs) {
      const amount = Number(doc.document_amt || 0);
      if (amount > 0) {
        const date = doc.recorded_datetime || doc.good_through_date || '';
        return {
          closePrice: amount,
          closeDate: date,
          sqft: 0, // ACRIS doesn't have sqft
          source: 'acris' as const,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ key?: string; ref?: string; t?: string }>;
};

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

/** Extra fields from Trestle raw record (not in PublicListingDTO) */
interface TrestleExtraFields {
  taxBlock: string | null;
  taxLot: string | null;
}

/**
 * Resolve a raw Trestle record → PublicListingDTO with media.
 * Also extracts TaxBlock/TaxLot for ACRIS fallback.
 * Always fetches media separately (we no longer use $expand=Media).
 */
async function rawToDTO(raw: Record<string, unknown>, debugId: string): Promise<{ dto: PublicListingDTO; tax: TrestleExtraFields } | null> {
  const gateResult = checkDistributionGates(raw);
  if (!gateResult.displayable) return null;

  const listing = mapRESOToInternal(raw);
  if (!listing) return null;

  let dto: PublicListingDTO;
  try {
    dto = toPublicDTO(listing);
  } catch {
    return null;
  }

  // Always fetch media from Trestle Media resource ($expand=Media removed)
  const listingKey = String(raw.SourceSystemKey || raw.ListingId || debugId);
  try {
    const mediaItems = await fetchListingMedia(listingKey);
    if (mediaItems.length > 0) {
      dto.media = mediaItems.map(m => ({
        ...m,
        url: m.url.includes('cotality.com') || m.url.includes('corelogic.com')
          ? `/api/media/proxy?url=${encodeURIComponent(m.url)}`
          : m.url,
      }));
      dto.photosCount = mediaItems.length;
    }
  } catch {
    // Non-fatal — listing displays without photos
  }

  // Geocode moved to ListingPage — runs in parallel with last-sale lookups
  // instead of blocking DTO creation (was adding 2-4s to every Trestle-path page load).

  // Extract extra fields from raw Trestle record (not part of public DTO)
  const tax: TrestleExtraFields = {
    taxBlock: raw.TaxBlock ? String(raw.TaxBlock) : null,
    taxLot: raw.TaxLot ? String(raw.TaxLot) : null,
  };

  return { dto, tax };
}

/** Combined result from Trestle fetch: DTO + extra fields for ACRIS */
interface ListingFetchResult {
  listing: PublicListingDTO;
  tax: TrestleExtraFields;
}

/**
 * DB-first lookup: check Prisma DB for listing before hitting Trestle.
 * Converts DB record to PublicListingDTO. Returns null if not found.
 */
async function fetchFromDB(slug: string, keyOverride?: string): Promise<ListingFetchResult | null> {
  try {
    let dbListing = null;

    // Strategy 1: Key override or MLS-ID slug
    const lookupId = keyOverride || (isMlsIdSlug(slug) ? extractMlsIdFromSlug(slug) : null);
    if (lookupId) {
      dbListing = await prisma.listing.findUnique({
        where: { listing_id: lookupId },
      });
    }

    // Strategy 2: Address slug → query by address components
    if (!dbListing && !isMlsIdSlug(slug)) {
      const parsed = parseAddressSlug(slug);
      if (parsed && parsed.streetNumber && parsed.postalCode) {
        dbListing = await prisma.listing.findFirst({
          where: {
            postal_code: parsed.postalCode,
            address: {
              path: ['StreetNumber'],
              equals: parsed.streetNumber,
            },
          },
        });
        // Narrow by street name if multiple matches
        if (!dbListing && parsed.streetName) {
          const candidates = await prisma.listing.findMany({
            where: { postal_code: parsed.postalCode },
            take: 50,
          });
          dbListing = candidates.find(c => {
            const addr = c.address as Record<string, string> | null;
            if (!addr) return false;
            const sn = (addr.StreetNumber || '').toLowerCase();
            const st = (addr.StreetName || '').toLowerCase();
            return sn === parsed.streetNumber.toLowerCase() &&
                   st.includes(parsed.streetName.toLowerCase());
          }) || null;
        }
      }
    }

    // Strategy 3: Treat slug as listing_id
    if (!dbListing) {
      dbListing = await prisma.listing.findUnique({
        where: { listing_id: slug },
      }).catch(() => null);
    }

    if (!dbListing) return null;

    // Distribution gate check (use === false, not truthiness — null/undefined means "not set" = allow)
    // Website-only listings (commercial, rls_eligible=false) bypass RLS gates
    if (dbListing.rls_eligible !== false) {
      if (dbListing.idx_display_yn === false || dbListing.owner_opt_out === true ||
          dbListing.internet_entire_listing_display_yn === false || dbListing.participant_only === true) {
        return null;
      }
    }

    // Convert DB record to PublicListingDTO
    const addr = (dbListing.address as Record<string, string>) || {};
    const features = (dbListing.features as Record<string, unknown>) || {};
    // DB media can be in two formats:
    //   Raw Trestle: { MediaURL, MediaCategory, Order }
    //   Mapped:      { url, mediaType, order }
    // Normalize to the mapped format.
    // DB stores raw Trestle format { MediaURL, MediaCategory, Order } — MediaCategory is the
    // content type ("Photo", "Floor Plan"), not MediaType (file format like "jpeg").
    const rawMedia = Array.isArray(dbListing.media) ? (dbListing.media as Record<string, unknown>[]) : [];
    let mediaArr = rawMedia.map((m) => {
      const cat = String(m.MediaCategory || m.mediaType || 'Photo').toLowerCase();
      let mediaType = 'Photo';
      if (cat.includes('floor plan') || cat.includes('floorplan') || cat === 'FloorPlan') mediaType = 'FloorPlan';
      else if (cat.includes('video')) mediaType = 'Video';
      else if (cat.includes('virtual tour') || cat.includes('virtualtour') || cat === '3d') mediaType = 'VirtualTour';
      else if (String(m.mediaType || '') === 'FloorPlan') mediaType = 'FloorPlan';
      return {
        url: String(m.url || m.MediaURL || ''),
        mediaType,
        order: Number(m.order ?? m.Order ?? 0),
      };
    }).filter(m => m.url)
    // Sort: Photos first, then Videos/Tours, FloorPlans last
    .sort((a, b) => {
      const typeRank = (t: string) => t === 'Photo' ? 0 : t === 'FloorPlan' ? 2 : 1;
      const rankDiff = typeRank(a.mediaType) - typeRank(b.mediaType);
      return rankDiff !== 0 ? rankDiff : a.order - b.order;
    });

    // Fetch media from Trestle when DB has NO photos (only FloorPlans/Videos/empty).
    // DB photos are refreshed during IDX sync — no need to re-fetch on every page load.
    const photoCount = mediaArr.filter(m => m.mediaType === 'Photo').length;
    const shouldFetchMedia = photoCount === 0;
    if (shouldFetchMedia && dbListing.listing_id) {
      try {
        const trestleMedia = await fetchListingMedia(dbListing.listing_id);
        const trestlePhotos = trestleMedia.filter(m => m.mediaType === 'Photo');
        if (trestlePhotos.length > 0) {
          // Merge: Trestle photos + existing non-photo media (FloorPlans, Videos)
          const existingNonPhotos = mediaArr.filter(m => m.mediaType !== 'Photo');
          mediaArr = [...trestlePhotos, ...existingNonPhotos];
        }
      } catch {
        // Non-fatal — listing still renders with whatever DB has
      }
    }

    const agentInfo = (dbListing.agent_info as Record<string, string>) || {};
    const compliance = (dbListing.compliance as Record<string, unknown>) || {};
    const suppressAddress = dbListing.internet_address_display_yn === false;

    const dto: PublicListingDTO = {
      id: dbListing.listing_id,
      mlsId: dbListing.mls_id || dbListing.listing_id,
      slug: generateListingSlug({
        address: {
          streetNumber: addr.StreetNumber || '',
          streetName: suppressAddress ? 'Address Undisclosed' : (addr.StreetName || ''),
          unitNumber: addr.UnitNumber || null,
          city: addr.City || '',
          stateOrProvince: addr.StateOrProvince || 'NY',
          postalCode: addr.PostalCode || dbListing.postal_code || '',
        },
        id: dbListing.listing_id,
        mlsId: dbListing.mls_id || undefined,
        internetAddressDisplayYN: dbListing.internet_address_display_yn,
      }),
      status: dbListing.status,
      listingType: dbListing.listing_type as 'sale' | 'rent',
      address: suppressAddress
        ? {
            streetNumber: '',
            streetName: 'Address Undisclosed',
            unitNumber: null,
            city: addr.City || '',
            stateOrProvince: addr.StateOrProvince || 'NY',
            postalCode: addr.PostalCode || '',
            county: addr.CountyOrParish || '',
            neighborhood: dbListing.neighborhood || undefined,
          }
        : {
            streetNumber: addr.StreetNumber || '',
            streetName: addr.StreetName || '',
            unitNumber: addr.UnitNumber || null,
            city: addr.City || '',
            stateOrProvince: addr.StateOrProvince || 'NY',
            postalCode: addr.PostalCode || '',
            county: addr.CountyOrParish || '',
            neighborhood: dbListing.neighborhood || undefined,
            latitude: addr.Latitude ? Number(addr.Latitude) : undefined,
            longitude: addr.Longitude ? Number(addr.Longitude) : undefined,
          },
      listPrice: Number(dbListing.list_price),
      originalListPrice: Number(dbListing.list_price),
      closePrice: null,
      propertyType: dbListing.property_sub_type || dbListing.property_type || 'Residential',
      propertySubType: dbListing.property_sub_type || null,
      bedroomsTotal: dbListing.bedrooms_total || 0,
      bathroomsFull: dbListing.bathrooms_full || 0,
      bathroomsHalf: dbListing.bathrooms_half || 0,
      livingArea: dbListing.living_area ? Number(dbListing.living_area) : null,
      lotSizeArea: features.LotSizeArea ? Number(features.LotSizeArea) : null,
      yearBuilt: features.YearBuilt ? Number(features.YearBuilt) : null,
      listOfficeName: agentInfo.ListOfficeName || agentInfo.company || 'Mallan Real Estate Inc.',
      media: mediaArr.map(m => ({
        ...m,
        url: m.url && (m.url.includes('cotality.com') || m.url.includes('corelogic.com'))
          ? `/api/media/proxy?url=${encodeURIComponent(m.url)}`
          : m.url,
      })),
      photosCount: mediaArr.filter(m => !m.mediaType || m.mediaType === 'Photo').length,
      publicRemarks: String(features.PublicRemarks || compliance.PublicRemarks || ''),
      listingContractDate: String(features.ListingContractDate || ''),
      modificationTimestamp: String(features.ModificationTimestamp || ''),
      associationFee: features.AssociationFee ? Number(features.AssociationFee) : undefined,
      taxAnnualAmount: features.TaxAnnualAmount ? Number(features.TaxAnnualAmount) : undefined,
      buildingName: features.BuildingName ? String(features.BuildingName) : undefined,
      interiorFeatures: features.InteriorFeatures ? String(features.InteriorFeatures) : undefined,
      buildingFeatures: features.BuildingFeatures ? String(features.BuildingFeatures) : undefined,
      associationAmenities: features.AssociationAmenities ? String(features.AssociationAmenities) : undefined,
      parkingFeatures: features.ParkingFeatures ? String(features.ParkingFeatures) : undefined,
      heating: features.Heating ? String(features.Heating) : undefined,
      cooling: features.Cooling ? String(features.Cooling) : undefined,
      laundryFeatures: features.LaundryFeatures ? String(features.LaundryFeatures) : undefined,
      petsAllowedDetail: features.PetsAllowed ? String(features.PetsAllowed) : undefined,
      moveInCosts: features.MoveInCosts ? String(features.MoveInCosts) : undefined,
      ongoingFees: features.OngoingFees ? String(features.OngoingFees) : undefined,
      tenantPaysDescription: features.TenantPaysDescription ? String(features.TenantPaysDescription) : undefined,
      appliances: features.Appliances ? String(features.Appliances) : undefined,
      exteriorFeatures: features.ExteriorFeatures ? String(features.ExteriorFeatures) : undefined,
      communityFeatures: features.CommunityFeatures ? String(features.CommunityFeatures) : undefined,
      securityFeatures: features.SecurityFeatures ? String(features.SecurityFeatures) : undefined,
      poolFeatures: features.PoolFeatures ? String(features.PoolFeatures) : undefined,
      spaFeatures: features.SpaFeatures ? String(features.SpaFeatures) : undefined,
      attendanceType: features.AttendanceType ? String(features.AttendanceType) : undefined,
      _source: 'db',
      _displayCompliance: {
        requiresAttribution: true,
        attributionText: 'Listing data from REBNY RLS',
        disclaimerRequired: true,
      },
    };

    return {
      listing: dto,
      tax: { taxBlock: null, taxLot: null },
    };
  } catch {
    return null;
  }
}

/**
 * Fetch from Trestle directly (server-side). Returns null on any failure.
 */
async function fetchFromTrestleDirect(slug: string, keyOverride?: string): Promise<ListingFetchResult | null> {
  // Strategy 1: Explicit key override (?key= param)
  if (keyOverride) {
    const raw = await fetchSingleListing(keyOverride);
    if (raw) {
      const result = await rawToDTO(raw, keyOverride);
      if (result) return { listing: result.dto, tax: result.tax };
    }
  }

  // Strategy 2: MLS-ID slug (e.g., "listing-RBNY-12345678")
  if (isMlsIdSlug(slug)) {
    const mlsId = extractMlsIdFromSlug(slug);
    if (mlsId) {
      const raw = await fetchSingleListing(mlsId);
      if (raw) {
        const result = await rawToDTO(raw, mlsId);
        if (result) return { listing: result.dto, tax: result.tax };
      }
    }
    return null;
  }

  // Strategy 3: Address slug → parse and search by address components
  const parsed = parseAddressSlug(slug);
  if (parsed && parsed.streetNumber && parsed.postalCode) {
    const raw = await fetchListingByAddress(parsed);
    if (raw) {
      // COMPLIANCE: If the resolved listing has address suppressed, reject.
      if (raw.InternetAddressDisplayYN === false) return null;
      const result = await rawToDTO(raw, slug);
      if (result) return { listing: result.dto, tax: result.tax };
    }
  }

  // Strategy 4: Treat slug as raw ListingId (backwards compatibility)
  const raw = await fetchSingleListing(slug);
  if (raw) {
    const result = await rawToDTO(raw, slug);
    if (result) return { listing: result.dto, tax: result.tax };
  }

  return null;
}

/**
 * Fallback: fetch from our own /api/listings/:id endpoint.
 * This has its own local JSON fallback and won't fail if Trestle is down.
 */
async function fetchFromApiEndpoint(listingId: string): Promise<ListingFetchResult | null> {
  try {
    // Explicit fallback: NEXT_PUBLIC_SITE_URL preferred, else VERCEL_URL with https, else localhost
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    const vercelUrl = process.env.VERCEL_URL;
    const baseUrl = siteUrl || (vercelUrl ? `https://${vercelUrl}` : 'http://localhost:3000');
    const apiUrl = new URL(`/api/listings/${encodeURIComponent(listingId)}`, baseUrl).toString();
    const res = await fetch(apiUrl, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.success || !data.listing) return null;
    // The API endpoint returns either PublicListingDTO or sanitized local listing
    // No tax fields available from API fallback
    return { listing: data.listing as PublicListingDTO, tax: { taxBlock: null, taxLot: null } };
  } catch {
    return null;
  }
}

/**
 * Fetch a single listing with multi-layer resilience.
 *
 * Resolution order (DB-first for speed):
 *   1. Local DB lookup (Prisma — 20-80ms, no external dependency)
 *   2. Direct Trestle fetch (freshest data, but 2-8s and can timeout)
 *   3. Fallback to /api/listings/:id (has local JSON fallback)
 *
 * DB-first ensures fast page loads even when Trestle is slow/down.
 * ISR revalidation (every 5 min) keeps DB data fresh from Trestle.
 *
 * COMPLIANCE: Address slugs are NEVER generated for listings where
 * InternetAddressDisplayYN=false. Those use MLS-ID slugs instead,
 * preventing address leakage through URLs.
 */
const fetchListing = cache(async function fetchListing(slug: string, keyOverride?: string): Promise<ListingFetchResult | null> {
  const useIDX = process.env.IDX_ENABLED === 'true';

  // Primary: local Prisma DB (fast — 20-80ms, no external dependency)
  try {
    const dbResult = await fetchFromDB(slug, keyOverride);
    if (dbResult) return dbResult;
  } catch {
    // DB lookup failed — fall through to Trestle
  }

  // Fallback 1: direct Trestle fetch (slower but freshest data)
  // 15s timeout prevents hanging when Trestle is down (individual fetches have 10s timeouts,
  // but multiple sequential calls can compound)
  if (useIDX) {
    try {
      const trestleResult = await Promise.race([
        fetchFromTrestleDirect(slug, keyOverride),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 15_000)),
      ]);
      if (trestleResult) return trestleResult;
    } catch {
      // Trestle fetch failed — fall through to API fallback
    }
  }

  // Fallback 2: our own API endpoint (has local JSON fallback)
  const fallbackId = keyOverride || slug;
  const apiResult = await fetchFromApiEndpoint(fallbackId);
  if (apiResult) return apiResult;

  return null;
});

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id } = await params;
  const { key } = await searchParams;

  let result: ListingFetchResult | null = null;
  try {
    result = await fetchListing(id, key);
  } catch {
    // Trestle timeout / network error — return safe fallback metadata
  }

  if (!result) {
    return { title: 'Listing Not Found | Mallan Real Estate' };
  }

  const listing = result.listing;
  const isRental = listing.listingType === 'rent';
  const priceDisplay = isRental
    ? `$${listing.listPrice.toLocaleString()}/mo`
    : `$${listing.listPrice.toLocaleString()}`;
  const fullAddress = listing.address.streetName === 'Address Undisclosed'
    ? 'Address Undisclosed'
    : `${listing.address.streetNumber} ${listing.address.streetName}${listing.address.unitNumber ? ` ${listing.address.unitNumber}` : ''}`;
  // Canonical URL uses the address slug (or MLS-ID slug if address suppressed)
  const canonicalUrl = `https://mallan.nyc/listing/${listing.slug}`;
  const ogImage = listing.media.find(m => !m.mediaType || m.mediaType === 'Photo')?.url || listing.media[0]?.url || '/images/og-default.png';
  const borough = countyToBorough(listing.address.county);

  return {
    title: `${fullAddress} | ${priceDisplay} | Mallan Real Estate`,
    description: `${listing.bedroomsTotal} bed, ${listing.bathroomsFull} bath ${listing.propertyType} in ${borough}. ${(listing.publicRemarks || '').substring(0, 150)}...`,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: `${fullAddress} | ${priceDisplay}`,
      description: `${listing.bedroomsTotal} bed, ${listing.bathroomsFull} bath ${listing.propertyType} in ${borough}.`,
      url: canonicalUrl,
      type: 'article',
      images: [{ url: ogImage, width: 1200, height: 630, alt: fullAddress }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${fullAddress} | ${priceDisplay}`,
      description: `${listing.bedroomsTotal} bed, ${listing.bathroomsFull} bath ${listing.propertyType} in ${borough}`,
      images: [ogImage],
    },
  };
}

/** Format raw Trestle values: "CentralAir" → "Central Air", "InUnit" → "In-Unit" */
function formatTrestleValue(val: string): string {
  return val
    .replace(/([a-z])([A-Z])/g, '$1 $2')   // camelCase → separate words
    .replace(/^In\s/, 'In-')                // "In Unit" → "In-Unit"
    .replace(/^Building\s?/, '')             // remove "Building" prefix
    .replace(/\bYN$/i, '')                   // remove YN suffix
    .replace(/\bYes$/i, '')                  // remove trailing "Yes"
    .replace(/\bNo$/i, '')                   // remove trailing "No"
    .trim();
}

/** Split comma-separated Trestle field into RAW trimmed tokens (no formatting) */
function splitRaw(raw: string): string[] {
  return raw.split(',').map(v => v.trim()).filter(v => v.length > 0);
}

/** Split comma-separated Trestle field into cleaned values */
function parseTrestleList(raw: string): string[] {
  return raw.split(',')
    .map(v => formatTrestleValue(v.trim()))
    .filter(v => v.length > 0 && v.toLowerCase() !== 'none' && v.toLowerCase() !== 'other');
}

function formatPrice(price: number, isRental: boolean): string {
  if (isRental) {
    return `$${price.toLocaleString()}/mo`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price);
}

export default async function ListingPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { key, ref: refSource, t: trackToken } = await searchParams;

  let result: ListingFetchResult | null = null;
  try {
    result = await fetchListing(id, key);
  } catch {
    // Fatal fetch error — will show notFound()
  }

  if (!result) {
    notFound();
  }

  const listing = result.listing;
  const { tax } = result;

  const isRental = listing.listingType === 'rent';
  const isCoop = listing.propertyType === 'Co-op' || listing.propertyType === 'Cooperative';
  const borough = countyToBorough(listing.address.county);
  const neighborhood = listing.address.neighborhood || '';
  const displayPropertyType = listing.propertyType === 'Residential' ? (listing.propertySubType || listing.propertyType) : listing.propertyType;

  // Neighborhood data lookup
  const boroughSlug = borough.toLowerCase().replace(/\s+/g, '-') as BoroughSlug;
  const neighborhoodSlug = neighborhood.toLowerCase().replace(/['']/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const neighborhoodData = neighborhoodSlug ? findNeighborhood(boroughSlug, neighborhoodSlug) : undefined;

  const fullAddress = listing.address.streetName === 'Address Undisclosed'
    ? 'Address Undisclosed'
    : `${listing.address.streetNumber} ${listing.address.streetName}${listing.address.unitNumber ? `, ${listing.address.unitNumber}` : ''}`;

  // Run ALL supplementary fetches in parallel (geocoding + last-sale lookups).
  // Previously these ran sequentially after fetchListing, adding 4-8s per page.
  // Each is wrapped in its own catch — none of these should block page render.
  const needsGeocode = !listing.address.latitude || !listing.address.longitude;
  const hasAddress = listing.address.streetName !== 'Address Undisclosed';

  const [geocodeResult, lastSaleResult] = await Promise.all([
    // Geocode — only when address is NOT suppressed (InternetAddressDisplayYN).
    // Suppressed listings must NOT have coordinates re-added via geocoding or ZIP
    // centroid, as that would leak approximate location via map pins/transit/schools.
    needsGeocode && hasAddress
      ? geocodeListings([listing]).catch(() => { /* non-fatal */ })
      : Promise.resolve(),
    // Last closed sale: Trestle + ACRIS in parallel
    hasAddress
      ? Promise.all([
          fetchLastUnitSale(
            listing.address.streetNumber,
            listing.address.streetName,
            listing.address.unitNumber,
            listing.address.postalCode,
          ).catch(() => null),
          fetchLastSaleFromACRIS(
            listing.address.county,
            tax.taxBlock,
            tax.taxLot,
          ).catch(() => null),
        ]).then(([trestleSale, acrisSale]) => trestleSale || acrisSale)
      : Promise.resolve(null),
  ]);

  const lastUnitSale: LastSaleInfo | null = lastSaleResult || null;
  void geocodeResult; // consumed via mutation on listing.address

  // Last-resort: if geocoding failed entirely, use ZIP centroid so neighborhood/schools/transit
  // sections still render. Without this, those 5 sections vanish on geocode failure.
  // COMPLIANCE: Only for listings with a displayable address. Address-suppressed listings
  // (InternetAddressDisplayYN=false) must NOT get coordinates re-added — that would leak
  // approximate location via map pins, transit, and school sections.
  if (hasAddress && (!listing.address.latitude || !listing.address.longitude)) {
    const { ZIP_CENTROIDS } = await import('@/lib/geo/geocode');
    const zip = (listing.address.postalCode || '').split('-')[0].trim();
    const centroid = ZIP_CENTROIDS[zip];
    if (centroid) {
      listing.address.latitude = centroid[0];
      listing.address.longitude = centroid[1];
    }
    // No hardcoded fallback. Trestle does NOT provide lat/lng — geocoding is our
    // responsibility. If both geocode and ZIP centroid fail, lat/lng stay null and
    // map/transit/schools sections gracefully hide for that listing. Showing wrong
    // coordinates (e.g., Midtown for a Queens listing) is worse than showing nothing.
  }

  // ── Building amenities ── STRICT WHITELIST
  // Only approved amenities are displayed. Trestle raw value → display label.
  const APPROVED_AMENITIES: Record<string, string> = {
    // Lobby & Services
    SecurityGuard: 'Doorman',
    Concierge: 'Concierge',
    LiveInSuper: 'Live-in Super',
    VirtualDoorman: 'Virtual Doorman',
    ResidentManager: 'Live-in Super',
    PackageRoom: 'Package Room',
    // Common Areas
    HealthClub: 'Gym/Fitness',
    FitnessCenter: 'Gym/Fitness',
    YogaStudio: 'Yoga Studio',
    Sauna: 'Sauna',
    SteamRoom: 'Steam Room',
    BuildingRoofDeck: 'Roof Deck',
    BuildingGarden: 'Common Garden',
    BuildingCourtyard: 'Courtyard',
    Storage: 'Storage',
    BikeStorage: 'Bike Room',
    BicycleStorage: 'Bike Room',
    // Building Features
    CommonPlayroom: "Children's Playroom",
    Elevators: 'Elevator',
    BusinessCenter: 'Business Center',
    GameRoom: "Residents' Lounge",
    MediaRoom: 'Media Room',
    ScreeningRoom: 'Screening Room',
    GolfSimulation: 'Golf Simulator',
    MaidService: 'Maid Service',
    // Additional common amenities
    Gym: 'Gym/Fitness',
    SwimmingPool: 'Swimming Pool',
    IndoorPool: 'Indoor Pool',
    OutdoorPool: 'Outdoor Pool',
    TennisCourt: 'Tennis Court',
    BasketballCourt: 'Basketball Court',
    Playground: 'Playground',
    CommunityRoom: 'Community Room',
    PartyRoom: 'Party Room',
    RecreationRoom: 'Recreation Room',
    Library: 'Library',
    Theater: 'Theater',
    PetGrooming: 'Pet Grooming',
    PetSpa: 'Pet Spa',
    DogRun: 'Dog Run',
    Terrace: 'Terrace',
    BuildingBalcony: 'Building Terrace',
    WineStorage: 'Wine Storage',
    ColdStorage: 'Cold Storage',
    Valet: 'Valet',
  };

  const amenitySet = new Set<string>();

  // Scan all Trestle feature sources but ONLY add whitelisted values
  // Use splitRaw (not parseTrestleList) so keys match the raw CamelCase whitelist
  const rawBuildingFeatures = listing.buildingFeatures ? splitRaw(listing.buildingFeatures) : [];
  const rawAssocAmenities = listing.associationAmenities ? splitRaw(listing.associationAmenities) : [];
  const rawCommunity = listing.communityFeatures ? splitRaw(listing.communityFeatures) : [];
  const securityFeatures: string[] = listing.securityFeatures ? splitRaw(listing.securityFeatures) : [];
  const allSources = [...rawBuildingFeatures, ...rawAssocAmenities, ...rawCommunity, ...securityFeatures];
  if (listing.exteriorFeatures) allSources.push(...splitRaw(listing.exteriorFeatures));
  for (const val of allSources) {
    if (APPROVED_AMENITIES[val]) amenitySet.add(APPROVED_AMENITIES[val]);
  }

  // Pool — any pool feature → "Pool"
  const rawPool = listing.poolFeatures ? parseTrestleList(listing.poolFeatures) : [];
  if (rawPool.length > 0) amenitySet.add('Pool');

  // Spa — any spa feature → "Spa Room"
  const rawSpa = listing.spaFeatures ? parseTrestleList(listing.spaFeatures) : [];
  if (rawSpa.length > 0) amenitySet.add('Spa Room');

  // Laundry — building-level only → "Laundry Room"
  const rawLaundry = listing.laundryFeatures ? parseTrestleList(listing.laundryFeatures) : [];
  const buildingLaundryValues = new Set(['CommonArea', 'CommonOnFloor', 'LaundryRoom', 'BuildingInside', 'BuildingMultipleLocations']);
  if (rawLaundry.some(v => buildingLaundryValues.has(v))) amenitySet.add('Laundry Room');

  // Parking — garage → "Parking Garage"
  const parkingList = listing.parkingFeatures ? parseTrestleList(listing.parkingFeatures) : [];
  const hasGarage = parkingList.some(v => v === 'Garage');
  if (hasGarage) amenitySet.add('Parking Garage');

  // AttendanceType → Doorman / 24hr Doorman / Attended Lobby
  const attendanceValues = listing.attendanceType ? splitRaw(listing.attendanceType) : [];
  for (const val of attendanceValues) {
    if (val === 'DoormanFullTime') amenitySet.add('24hr Doorman');
    else if (val === 'DoormanPartTime' || val === 'DoormanYes') amenitySet.add('Doorman');
    else if (val === 'LobbyAttendantFullTime' || val === 'LobbyAttendantPartTime' || val === 'LobbyAttendantYes') amenitySet.add('Attended Lobby');
    else if (val === 'VideoDoormanFullTime' || val === 'VideoDoormanPartTime' || val === 'VideoDoormanYes') amenitySet.add('Virtual Doorman');
    else if (val === 'ConciergeFullTime' || val === 'ConciergePartTime' || val === 'ConciergeYes') amenitySet.add('Concierge');
  }

  // Boolean YN flags — most commonly populated even when detail fields are empty
  const yn = listing as unknown as Record<string, unknown>;
  if (yn.doormanYN && !amenitySet.has('24hr Doorman') && !amenitySet.has('Doorman')) amenitySet.add('Doorman');
  if (yn.elevatorYN && !amenitySet.has('Elevator')) amenitySet.add('Elevator');
  if (yn.gymYN && !amenitySet.has('Gym/Fitness')) amenitySet.add('Gym/Fitness');
  if (yn.storageYN && !amenitySet.has('Storage')) amenitySet.add('Storage');

  // Description-based amenity detection — catches amenities mentioned in remarks
  // but not in structured MLS fields (common in NYC listings)
  const desc = (listing.publicRemarks || '').toLowerCase();
  const DESC_AMENITIES: [RegExp, string][] = [
    [/\b(doorman|door\s*-?\s*man|attended\s+lobb)/i, 'Doorman'],
    [/\b(24\s*[-/]?\s*hour\s+doorman|full[\s-]*time\s+doorman)/i, '24hr Doorman'],
    [/\b(virtual\s+doorman|video\s+doorman)/i, 'Virtual Doorman'],
    [/\b(concierge)/i, 'Concierge'],
    [/\b(gym|fitness\s+center|exercise\s+room|work\s*-?\s*out)/i, 'Gym/Fitness'],
    [/\b(roof\s*-?\s*deck|roof\s*-?\s*top\s+terrace|rooftop\s+deck)/i, 'Roof Deck'],
    [/\b(bike\s+room|bicycle\s+storage|bike\s+storage)/i, 'Bike Room'],
    [/\b(children.s\s+playroom|kids\s+room|playroom)/i, "Children's Playroom"],
    [/\b(community\s+room|residents.\s+lounge|common\s+room)/i, "Residents' Lounge"],
    [/\b(swimming\s+pool|indoor\s+pool|outdoor\s+pool)\b/i, 'Swimming Pool'],
    [/\b(package\s+room)/i, 'Package Room'],
    [/\b(live[\s-]*in\s+super)/i, 'Live-in Super'],
    [/\b(courtyard)/i, 'Courtyard'],
    [/\b(parking\s+garage|garage\s+parking)\b/i, 'Parking Garage'],
    [/\b(laundry\s+room|laundry\s+facilit|on[\s-]*site\s+laundry)/i, 'Laundry Room'],
  ];
  for (const [pattern, amenity] of DESC_AMENITIES) {
    if (!amenitySet.has(amenity) && pattern.test(desc)) amenitySet.add(amenity);
  }
  // Don't double-count doorman variants
  if (amenitySet.has('24hr Doorman')) amenitySet.delete('Doorman');

  const buildingAmenitiesFinal = [...amenitySet].sort();

  // ── Unit Features (pills) ──
  // Filter on RAW values (before formatting) to avoid mismatches
  const INTERIOR_EXCLUDE_RAW = new Set(['Sauna', 'Elevator', 'CommonArea', 'CommonOnFloor', 'Storage']);
  const unitFeatures: string[] = [];
  if (listing.interiorFeatures) {
    for (const raw of splitRaw(listing.interiorFeatures)) {
      if (!INTERIOR_EXCLUDE_RAW.has(raw)) unitFeatures.push(formatTrestleValue(raw));
    }
  }
  // Unit-level exterior features — exclude building-level
  const EXTERIOR_BUILDING_RAW = new Set(['BuildingBalcony', 'BuildingCourtyard', 'BuildingGarden', 'BuildingRoofDeck', 'BuildingStorage', 'Storage', 'None']);
  if (listing.exteriorFeatures) {
    for (const raw of splitRaw(listing.exteriorFeatures)) {
      if (!EXTERIOR_BUILDING_RAW.has(raw)) unitFeatures.push(formatTrestleValue(raw));
    }
  }

  // ── Unit Details (structured rows) ──
  const unitDetails: { label: string; value: string }[] = [];
  // Only unit-level laundry (In Unit, Washer Hookup) — NOT building-level
  const unitLaundryRaw = rawLaundry.filter(v => !buildingLaundryValues.has(v) && v !== 'None' && v !== 'BuildingNone' && v !== 'BuildingOther' && v !== 'SeeRemarks');
  if (unitLaundryRaw.length > 0) unitDetails.push({ label: 'Laundry', value: unitLaundryRaw.map(v => formatTrestleValue(v)).join(', ') });
  if (listing.heating) unitDetails.push({ label: 'Heating', value: parseTrestleList(listing.heating).join(', ') });
  if (listing.cooling) unitDetails.push({ label: 'Cooling', value: parseTrestleList(listing.cooling).join(', ') });

  // ── Appliances — key appliances buyers care about ──
  const APPLIANCE_SHOW = new Set([
    'dishwasher', 'washer', 'dryer', 'washer dryer stacked', 'washer dryer combo',
    'refrigerator', 'microwave', 'oven', 'range', 'garbage disposal',
    'wine cooler', 'wine refrigerator', 'ice maker',
  ]);
  const appliancesList: string[] = listing.appliances
    ? parseTrestleList(listing.appliances).filter(a => APPLIANCE_SHOW.has(a.toLowerCase()))
    : [];
  // Pet policy — format raw values like "CatsOK,DogsOK" → "Cats Ok, Dogs Ok"
  const rawPetValues = listing.petsAllowedDetail ? parseTrestleList(listing.petsAllowedDetail) : [];
  const petPolicy = rawPetValues
    .map(v => {
      // Convert "Cats OK" / "Dogs OK" → "Cats Ok" / "Dogs Ok"
      const lower = v.toLowerCase();
      if (lower.includes('cat')) return 'Cats Ok';
      if (lower.includes('dog')) return 'Dogs Ok';
      if (lower === 'allowed' || lower === 'permitted') return 'Pets Allowed';
      if (lower === 'restricted' || lower === 'conditional') return 'Pets Conditional';
      return v;
    })
    .join(', ');
  const petsAllowed = petPolicy && !petPolicy.toLowerCase().includes('no pets') && !petPolicy.toLowerCase().includes('not allowed');

  // ── Separate media by type ──
  const images = listing.media
    .filter((m) => (m.mediaType || '').toLowerCase() === 'photo' || !(m.mediaType))
    .sort((a, b) => a.order - b.order)
    .map((m) => ({ url: m.url }));
  const floorPlanMedia = listing.media.find((m) => (m.mediaType || '').toLowerCase() === 'floorplan');
  const floorPlanUrl = floorPlanMedia?.url || null;
  const videoMedia = listing.media.find((m) => (m.mediaType || '').toLowerCase() === 'video');
  const videoUrl = videoMedia?.url || null;
  const virtualTourMedia = listing.media.find((m) => (m.mediaType || '').toLowerCase() === 'virtualtour');
  const virtualTourUrl = listing.virtualTourURL || virtualTourMedia?.url || null;

  // ── Price history ──
  const priceHistory: { label: string; price: number }[] = [];
  if (listing.originalListPrice && listing.originalListPrice !== listing.listPrice) {
    priceHistory.push({ label: 'Original', price: listing.originalListPrice });
  }
  if (listing.previousListPrice && listing.previousListPrice !== listing.listPrice && listing.previousListPrice !== listing.originalListPrice) {
    priceHistory.push({ label: 'Previous', price: listing.previousListPrice });
  }
  priceHistory.push({ label: 'Current', price: listing.listPrice });

  // ── JSON-LD Structured Data ──
  const listingSchema = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: `${fullAddress} — ${displayPropertyType} ${isRental ? 'for Rent' : 'for Sale'}`,
    url: `https://mallan.nyc/listing/${listing.slug}`,
    description: listing.publicRemarks?.substring(0, 300) || undefined,
    datePosted: listing.onMarketDate || listing.listingContractDate,
    dateModified: listing.modificationTimestamp || undefined,
    image: listing.media.find(m => !m.mediaType || m.mediaType === 'Photo')?.url || listing.media[0]?.url || undefined,
    offers: {
      '@type': 'Offer',
      price: listing.listPrice,
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
    },
    address: listing.address.streetName !== 'Address Undisclosed' ? {
      '@type': 'PostalAddress',
      streetAddress: `${listing.address.streetNumber} ${listing.address.streetName}`,
      addressLocality: borough,
      addressRegion: 'NY',
      postalCode: listing.address.postalCode,
      addressCountry: 'US',
    } : undefined,
    ...(listing.address.latitude && listing.address.longitude ? {
      geo: {
        '@type': 'GeoCoordinates',
        latitude: listing.address.latitude,
        longitude: listing.address.longitude,
      },
    } : {}),
    numberOfRooms: listing.roomsTotal || undefined,
    numberOfBedrooms: listing.bedroomsTotal,
    numberOfBathroomsTotal: listing.bathroomsFull + listing.bathroomsHalf * 0.5,
    floorSize: listing.livingArea ? {
      '@type': 'QuantitativeValue',
      value: listing.livingArea,
      unitCode: 'FTK',
    } : undefined,
  };

  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <RecentlyViewedTracker
        id={listing.id}
        slug={listing.slug}
        address={fullAddress}
        price={listing.listPrice}
        photo={images[0]?.url || ''}
        beds={listing.bedroomsTotal}
        baths={listing.bathroomsFull}
        type={isRental ? 'rent' : 'sale'}
        officeName={listing.listOfficeName}
      />
      <ListingViewTracker />
      <TrackListingView listingId={listing.id} refSource={refSource} />
      <TrackListingSend listingId={listing.id} trackToken={trackToken} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(listingSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://mallan.nyc/' },
            { '@type': 'ListItem', position: 2, name: isRental ? 'Rentals' : 'Sales', item: `https://mallan.nyc/${isRental ? 'rent' : 'buy'}` },
            { '@type': 'ListItem', position: 3, name: borough, item: `https://mallan.nyc/${boroughSlug}` },
            ...(neighborhood ? [{ '@type': 'ListItem', position: 4, name: neighborhood }] : []),
          ],
        }) }}
      />
      {/* ═══ Breadcrumb ═══ */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-black/5 pt-[68px]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5">
          <nav className="flex items-center gap-1.5 text-[13px]" aria-label="Breadcrumb">
            <BackButton fallbackHref={isRental ? '/rent' : '/buy'} />
            <Link href="/" className="text-brand-dark/60 hover:text-brand-gold transition-colors hidden md:inline">Home</Link>
            <span className="text-brand-dark/30 hidden md:inline">/</span>
            <Link href={isRental ? '/search?tab=rent-residential' : '/search?tab=buy-residential'} className="text-brand-dark/60 hover:text-brand-gold transition-colors hidden md:inline">
              {isRental ? 'Rentals' : 'Sales'}
            </Link>
            <span className="text-brand-dark/30 hidden md:inline">/</span>
            <span className="text-brand-dark/80 hidden md:inline">{borough}</span>
            {neighborhood && (
              <>
                <span className="text-brand-dark/30 hidden md:inline">/</span>
                <span className="text-brand-dark font-medium hidden md:inline">{neighborhood}</span>
              </>
            )}
            <span className="text-brand-dark/80 md:hidden">{neighborhood || borough}</span>
          </nav>
        </div>
      </div>

      {/* ═══ Media Gallery ═══ */}
      <ListingMediaGallery
        images={images}
        floorPlanUrl={floorPlanUrl}
        videoUrl={videoUrl}
        virtualTourUrl={virtualTourUrl}
        alt={fullAddress}
        badges={
          listing._displayCompliance.comingSoon ? (
            <span className="absolute top-3 left-3 bg-amber-500 text-white text-[11px] font-medium px-3.5 py-1.5 rounded-full z-10">
              {listing._displayCompliance.comingSoonDate
                ? `Coming Soon. No Showings or Open House until ${new Date(listing._displayCompliance.comingSoonDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
                : 'Coming Soon. No Showings or Open House Permitted'}
            </span>
          ) : null
        }
      />

      {/* ═══ Mobile CTA Bar (sticky, visible on mobile/tablet only) ═══ */}
      <div className="lg:hidden sticky top-[60px] z-30 bg-white/95 backdrop-blur-xl border-b border-black/5 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display font-bold text-lg text-brand-dark truncate">
              {formatPrice(listing.listPrice, isRental)}
            </p>
            <p className="text-[12px] text-brand-dark/70 truncate">{fullAddress}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <DetailFavoriteButton
              id={listing.id}
              slug={listing.slug}
              address={fullAddress}
              price={listing.listPrice}
              listingType={isRental ? 'rent' : 'sale'}
              beds={listing.bedroomsTotal}
              baths={listing.bathroomsFull}
              photoUrl={listing.media.find(m => !m.mediaType || m.mediaType === 'Photo')?.url || listing.media[0]?.url}
            />
            <a
              href="tel:646-258-4460"
              className="btn-liquid px-5 py-2.5 bg-brand-gold text-white text-sm font-medium rounded-full hover:bg-brand-gold-deep"
            >
              Call
            </a>
            <a
              href={`mailto:contact@mallan.nyc?subject=${encodeURIComponent(`Inquiry: ${fullAddress}`)}`}
              className="btn-liquid px-5 py-2.5 bg-brand-dark text-white text-sm font-medium rounded-full hover:bg-brand-dark/90"
            >
              Inquire
            </a>
          </div>
        </div>
      </div>

      <main className="py-8 md:py-10 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-3 gap-8 lg:gap-10">

            {/* ═══════════════════════════════════════
                MAIN CONTENT (2/3)
                ═══════════════════════════════════════ */}
            <div className="lg:col-span-2 space-y-0">

              {/* ── 1. PRICE + ADDRESS HERO ── */}
              <section className="pb-6">
                <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
                  <div>
                    {/* Price — bold and prominent */}
                    <div className="flex items-baseline gap-3 mb-1">
                      <PriceWithCalculator
                        price={listing.listPrice}
                        originalPrice={listing.originalListPrice}
                        isRental={isRental}
                        maintenanceFee={listing.associationFee || 0}
                        monthlyTaxes={listing.taxAnnualAmount ? Math.round(listing.taxAnnualAmount / 12) : 0}
                        propertyType={listing.propertyType}
                      />
                    </div>
                    {/* Address + Neighborhood */}
                    <p className="text-brand-dark text-[15px]">{fullAddress}</p>
                    <p className="text-brand-dark text-[15px]">
                      {borough}, NY {listing.address.postalCode}
                    </p>
                    {neighborhood && neighborhood !== borough ? (
                      <h1 className="text-[13px] font-medium text-brand-dark/60 mt-1">
                        {neighborhood}
                      </h1>
                    ) : (
                      <h1 className="sr-only">{fullAddress}</h1>
                    )}
                    {/* Monthly costs — directly under address for immediate buyer visibility */}
                    {!isRental && (listing.associationFee ? listing.associationFee > 0 : false) && (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[14px] text-brand-dark">
                        <span>
                          <span className="font-semibold">{isCoop ? 'Maint:' : 'CC:'}</span>{' '}
                          ${listing.associationFee!.toLocaleString()}/mo
                        </span>
                        {listing.taxAnnualAmount != null && listing.taxAnnualAmount > 0 && (
                          <span>
                            <span className="font-semibold">Tax:</span>{' '}
                            ${Math.round(listing.taxAnnualAmount / 12).toLocaleString()}/mo
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Action buttons + badges */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-gold/10 text-brand-gold-deep text-[13px] font-medium rounded-full">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2 22V6l10-4 10 4v16l-10-4L2 22z" /></svg>
                      {displayPropertyType}
                    </span>
                    {listing.previousListPrice && listing.listPrice < listing.previousListPrice && (
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 text-[13px] font-medium rounded-full">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                        Price Reduced
                      </span>
                    )}
                    <div className="hidden lg:flex items-center gap-2">
                      <DetailFavoriteButton
                        id={listing.id}
                        slug={listing.slug}
                        address={fullAddress}
                        price={listing.listPrice}
                        listingType={isRental ? 'rent' : 'sale'}
                        beds={listing.bedroomsTotal}
                        baths={listing.bathroomsFull}
                        photoUrl={listing.media.find(m => !m.mediaType || m.mediaType === 'Photo')?.url || listing.media[0]?.url}
                      />
                      <ShareButton title={`${fullAddress} | ${formatPrice(listing.listPrice, isRental)}`} />
                    </div>
                  </div>
                </div>

                {/* Quick Stats — icon-enhanced, clear separators */}
                <div className="flex flex-wrap items-center gap-0 py-4 px-1 rounded-2xl bg-[#F8F7F4]">
                  <div className="flex items-center gap-2 px-4 py-1">
                    <svg className="w-5 h-5 text-brand-gold-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" /></svg>
                    <div>
                      <span className="text-lg font-display font-bold text-brand-dark">{listing.bedroomsTotal}</span>
                      <span className="text-brand-dark/80 text-[13px] ml-1">Beds</span>
                    </div>
                  </div>
                  <div className="w-px h-8 bg-black/10" />
                  <div className="flex items-center gap-2 px-4 py-1">
                    <svg className="w-5 h-5 text-brand-gold-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4-4m0 0l-4 4m4-4v12" /></svg>
                    <div>
                      <span className="text-lg font-display font-bold text-brand-dark">
                        {listing.bathroomsFull}{listing.bathroomsHalf > 0 && `.${listing.bathroomsHalf}`}
                      </span>
                      <span className="text-brand-dark/80 text-[13px] ml-1">Baths</span>
                    </div>
                  </div>
                  {listing.livingArea && (
                    <>
                      <div className="w-px h-8 bg-black/10" />
                      <div className="flex items-center gap-2 px-4 py-1">
                        <svg className="w-5 h-5 text-brand-gold-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                        <div>
                          <span className="text-lg font-display font-bold text-brand-dark">{listing.livingArea.toLocaleString()}</span>
                          <span className="text-brand-dark/80 text-[13px] ml-1">Sq Ft</span>
                        </div>
                      </div>
                    </>
                  )}
                  {listing.livingArea && listing.listPrice > 0 && (
                    <>
                      <div className="w-px h-8 bg-black/10" />
                      <div className="px-4 py-1">
                        <span className="text-lg font-display font-bold text-brand-dark">${Math.round(listing.listPrice / listing.livingArea).toLocaleString()}</span>
                        <span className="text-brand-dark/80 text-[13px] ml-1">/Sq Ft</span>
                      </div>
                    </>
                  )}
                  {listing.roomsTotal && (
                    <>
                      <div className="w-px h-8 bg-black/10" />
                      <div className="px-4 py-1">
                        <span className="text-lg font-display font-bold text-brand-dark">{listing.roomsTotal}</span>
                        <span className="text-brand-dark/80 text-[13px] ml-1">Rooms</span>
                      </div>
                    </>
                  )}
                </div>

              </section>

              {/* ── 2. DESCRIPTION ── */}
              {listing.publicRemarks && (
                <section className="py-6 border-t border-black/[0.06]">
                  <h2 className="font-display font-semibold text-lg mb-4 text-brand-dark">About This Property</h2>
                  <p
                    className="text-brand-dark/85 text-[15px] leading-[1.85] max-w-none text-justify whitespace-pre-wrap"
                  >
                    {listing.publicRemarks
                      .replace(/<[^>]*>/g, '')
                      .replace(/\?\?(?=\s)/g, '•')
                      .replace(/\*\*([^*]+)\*\*/g, '$1')
                    }
                  </p>
                </section>
              )}

              {/* ── 2b. PRICE HISTORY TIMELINE ── */}
              <PriceHistory
                listPrice={listing.listPrice}
                originalListPrice={listing.originalListPrice}
                previousListPrice={listing.previousListPrice}
                closePrice={listing.closePrice}
                status={listing.status}
                onMarketDate={listing.onMarketDate}
                listingContractDate={listing.listingContractDate}
                modificationTimestamp={listing.modificationTimestamp}
                closeDate={listing.closeDate}
                listingType={listing.listingType}
              />

              {/* ── 3. PRICE HISTORY + LAST SALE ── */}
              {(!isRental && (priceHistory.length > 1 || (lastUnitSale && lastUnitSale.closePrice > 0))) && (
                <section className="py-6 border-t border-black/[0.06]">
                  <div className="space-y-5">

                    {/* Price History — compact inline */}
                    {priceHistory.length > 1 && (
                      <div className="rounded-2xl border border-black/[0.06] px-5 py-4">
                        <p className="text-[12px] font-semibold text-brand-dark/70 uppercase tracking-wider mb-3">Price History</p>
                        <div className="flex items-center gap-3 flex-wrap">
                          {priceHistory.map((entry, i) => {
                            const isCurrent = i === priceHistory.length - 1;
                            const prev = i > 0 ? priceHistory[i - 1].price : null;
                            const change = prev ? ((entry.price - prev) / prev * 100) : null;
                            return (
                              <div key={entry.label} className="flex items-center gap-2">
                                {i > 0 && (
                                  <svg className="w-4 h-4 text-brand-dark/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                )}
                                <div>
                                  <p className={`font-display font-bold text-[15px] ${isCurrent ? 'text-brand-dark' : 'text-brand-dark/40 line-through'}`}>
                                    {formatPrice(entry.price, isRental)}
                                  </p>
                                  <p className="text-[11px] text-brand-dark/50 leading-tight">
                                    {entry.label}
                                    {change !== null && (
                                      <span className={`ml-1.5 font-semibold ${change < 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {change > 0 ? '+' : ''}{change.toFixed(1)}%
                                      </span>
                                    )}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Last Closed Sale */}
                    {lastUnitSale && lastUnitSale.closePrice > 0 && (
                      <div className="rounded-2xl border border-black/[0.06] p-5">
                        <p className="text-[12px] font-semibold text-brand-dark/70 uppercase tracking-wider mb-3">
                          Last Sale {'\u2014'} This {lastUnitSale.source === 'acris' ? 'Property' : 'Unit'}
                        </p>
                        <div className="flex flex-wrap items-baseline gap-3">
                          <span className="text-xl font-display font-bold text-brand-dark">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(lastUnitSale.closePrice)}
                          </span>
                          {lastUnitSale.sqft > 0 && (
                            <span className="text-[13px] text-brand-dark/80">
                              ${Math.round(lastUnitSale.closePrice / lastUnitSale.sqft).toLocaleString()}/sf
                            </span>
                          )}
                          {lastUnitSale.closeDate && (
                            <span className="text-[13px] text-brand-dark/80">
                              Closed {new Date(lastUnitSale.closeDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                            </span>
                          )}
                        </div>
                        {listing.listPrice > 0 && lastUnitSale.closePrice > 0 && listing.listPrice !== lastUnitSale.closePrice && (
                          <p className={`text-[13px] mt-3 font-semibold ${listing.listPrice > lastUnitSale.closePrice ? 'text-red-600' : 'text-green-600'}`}>
                            {listing.listPrice > lastUnitSale.closePrice
                              ? `Asking ${Math.round(((listing.listPrice - lastUnitSale.closePrice) / lastUnitSale.closePrice) * 100)}% above last sale`
                              : `Asking ${Math.round(((lastUnitSale.closePrice - listing.listPrice) / lastUnitSale.closePrice) * 100)}% below last sale`}
                          </p>
                        )}
                        {lastUnitSale.source === 'acris' && (
                          <p className="text-[11px] text-brand-dark/40 mt-2">Source: NYC ACRIS Public Records</p>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* ── 4. UNIT FEATURES + APPLIANCES ── */}
              {(unitFeatures.length > 0 || appliancesList.length > 0) && (
                <section className="py-6 border-t border-black/[0.06]">
                  <h2 className="font-display font-semibold text-lg mb-5 text-brand-dark">Unit Features</h2>
                  <div className="flex flex-wrap gap-2">
                    {unitFeatures.map((f) => (
                      <span key={f} className="inline-flex items-center gap-2 px-3.5 py-2 bg-black/[0.04] text-brand-dark text-[13px] rounded-full">
                        <svg className="w-3.5 h-3.5 text-brand-gold-deep flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        {f}
                      </span>
                    ))}
                    {appliancesList.map((a) => (
                      <span key={a} className="inline-flex items-center gap-2 px-3.5 py-2 bg-black/[0.04] text-brand-dark text-[13px] rounded-full">
                        <svg className="w-3.5 h-3.5 text-brand-gold-deep flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        {a}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {/* ── 6. BUILDING AMENITIES ── */}
              {(buildingAmenitiesFinal.length > 0 || hasGarage) && (
                <section className="py-6 border-t border-black/[0.06]">
                  <h2 className="font-display font-semibold text-lg mb-4 text-brand-dark">Building Amenities</h2>
                  {buildingAmenitiesFinal.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {buildingAmenitiesFinal.map((amenity) => (
                        <span key={amenity} className="inline-flex items-center gap-2 px-3.5 py-2 bg-black/[0.04] text-brand-dark text-[13px] rounded-full">
                          <svg className="w-3.5 h-3.5 text-brand-dark/60 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          {amenity}
                        </span>
                      ))}
                    </div>
                  )}
                  {hasGarage && (
                    <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 border-t border-black/5">
                      <span className="inline-flex items-center gap-2 text-[13px] text-brand-dark bg-black/[0.04] px-3.5 py-2 rounded-full">
                        <svg className="w-3.5 h-3.5 text-brand-dark/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        Parking Garage
                      </span>
                    </div>
                  )}
                </section>
              )}

              {/* ── 6b. PET POLICY ── */}
              {petPolicy && (
                <section className="py-6 border-t border-black/[0.06]">
                  <h2 className="font-display font-semibold text-lg mb-4 text-brand-dark">Pet Policy</h2>
                  <div className={`inline-flex items-center gap-2.5 px-4 py-2.5 rounded-full text-[13px] font-medium ${petsAllowed ? 'text-brand-dark bg-black/[0.04]' : 'text-brand-dark bg-black/[0.04]'}`}>
                    {petsAllowed ? (
                      <svg className="w-4 h-4 text-brand-dark/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    ) : (
                      <svg className="w-4 h-4 text-brand-dark/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    )}
                    {petPolicy}
                  </div>
                </section>
              )}

              {/* ── 6c. NEARBY SCHOOLS ── */}
              {listing.address.latitude && listing.address.longitude && (
                <SchoolInfo
                  latitude={listing.address.latitude}
                  longitude={listing.address.longitude}
                />
              )}

              {/* ── 7. RENTAL DETAILS ── */}
              {isRental && (
                <section className="py-6 border-t border-black/[0.06]">
                  <h2 className="font-display font-semibold text-lg mb-4 text-brand-dark">Rental Details</h2>
                  <div className="grid sm:grid-cols-2 gap-x-8 gap-y-0">
                    {listing.availabilityDate && (
                      <div className="flex justify-between py-2.5 border-b border-black/5">
                        <span className="text-[13px] text-brand-dark/80">Available</span>
                        <span className="text-[13px] font-medium text-brand-dark">{new Date(listing.availabilityDate).toLocaleDateString()}</span>
                      </div>
                    )}
                    {listing.petsAllowed && (
                      <div className="flex justify-between py-2.5 border-b border-black/5">
                        <span className="text-[13px] text-brand-dark/80">Pets</span>
                        <span className="text-[13px] font-medium text-brand-dark">{listing.petsAllowed}</span>
                      </div>
                    )}
                    {listing.furnished && (
                      <div className="flex justify-between py-2.5 border-b border-black/5">
                        <span className="text-[13px] text-brand-dark/80">Furnished</span>
                        <span className="text-[13px] font-medium text-brand-dark">{listing.furnished}</span>
                      </div>
                    )}
                    {listing.moveInCosts && (
                      <div className="flex justify-between py-2.5 border-b border-black/5">
                        <span className="text-[13px] text-brand-dark/80">Move-In Costs</span>
                        <span className="text-[13px] font-medium text-brand-dark">{listing.moveInCosts}</span>
                      </div>
                    )}
                    {listing.ongoingFees && (
                      <div className="flex justify-between py-2.5 border-b border-black/5">
                        <span className="text-[13px] text-brand-dark/80">Ongoing Fees</span>
                        <span className="text-[13px] font-medium text-brand-dark">{listing.ongoingFees}</span>
                      </div>
                    )}
                    {listing.tenantPaysDescription && (
                      <div className="flex justify-between py-2.5 border-b border-black/5">
                        <span className="text-[13px] text-brand-dark/80">Tenant Pays</span>
                        <span className="text-[13px] font-medium text-brand-dark">{listing.tenantPaysDescription}</span>
                      </div>
                    )}
                  </div>
                  {/* FARE Act Fee Disclosure (NYC Local Law 119/2024) */}
                  <div className="mt-4 p-3 bg-[#F8F7F4] rounded-lg border border-black/5">
                    <p className="text-[11px] text-brand-dark/60 leading-relaxed">
                      <span className="font-semibold text-brand-dark/70">Fee Disclosure (NYC Local Law 119/2024):</span> Fee
                      and move-in cost information is provided by the listing broker via the REBNY Listing Service.
                      Where fee details are not displayed, the listing broker has not provided this information.
                      Contact the listing office directly for complete fee disclosure. Prospective tenants are not
                      required to pay a broker fee unless they have specifically engaged a broker to act on their behalf.
                    </p>
                  </div>
                </section>
              )}

              {/* ── 8. BUILDING INFO ── */}
              <section className="py-6 border-t border-black/[0.06]">
                <h2 className="font-display font-semibold text-lg mb-4 text-brand-dark">Building Details</h2>
                <div className="grid sm:grid-cols-2 gap-x-8 gap-y-0">
                  <div className="flex justify-between py-2.5 border-b border-black/5">
                    <span className="text-[13px] text-brand-dark/80">Property Type</span>
                    <span className="text-[13px] font-medium text-brand-dark">{displayPropertyType}</span>
                  </div>
                  {listing.architecturalStyle && (
                    <div className="flex justify-between py-2.5 border-b border-black/5">
                      <span className="text-[13px] text-brand-dark/80">Style</span>
                      <span className="text-[13px] font-medium text-brand-dark">{listing.architecturalStyle}</span>
                    </div>
                  )}
                  {listing.yearBuilt && (
                    <div className="flex justify-between py-2.5 border-b border-black/5">
                      <span className="text-[13px] text-brand-dark/80">Year Built</span>
                      <span className="text-[13px] font-medium text-brand-dark">{listing.yearBuilt}</span>
                    </div>
                  )}
                  {listing.storiesTotal && (
                    <div className="flex justify-between py-2.5 border-b border-black/5">
                      <span className="text-[13px] text-brand-dark/80">Stories</span>
                      <span className="text-[13px] font-medium text-brand-dark">{listing.storiesTotal}</span>
                    </div>
                  )}
                  {listing.buildingName && (
                    <div className="flex justify-between py-2.5 border-b border-black/5">
                      <span className="text-[13px] text-brand-dark/80">Building</span>
                      <span className="text-[13px] font-medium text-brand-dark">{listing.buildingName}</span>
                    </div>
                  )}
                  {listing.address.streetName !== 'Address Undisclosed' && (
                    <div className="flex justify-between py-2.5 border-b border-black/5">
                      <span className="text-[13px] text-brand-dark/80">Building Page</span>
                      <Link
                        href={buildingHref({ streetNumber: listing.address.streetNumber, streetName: listing.address.streetName, postalCode: listing.address.postalCode, buildingName: listing.buildingName || undefined })}
                        className="text-[13px] font-medium text-brand-gold-deep hover:text-brand-gold transition-colors flex items-center gap-1"
                      >
                        View Building
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
                      </Link>
                    </div>
                  )}
                  <div className="flex justify-between py-2.5 border-b border-black/5">
                    <span className="text-[13px] text-brand-dark/80">MLS #</span>
                    <span className="text-[13px] font-medium text-brand-dark font-mono">{listing.mlsId}</span>
                  </div>
                  {listing.onMarketDate && (
                    <div className="flex justify-between py-2.5 border-b border-black/5">
                      <span className="text-[13px] text-brand-dark/80">Listed</span>
                      <span className="text-[13px] font-medium text-brand-dark">{new Date(listing.onMarketDate).toLocaleDateString()}</span>
                    </div>
                  )}
                  {listing.status && (
                    <div className="flex justify-between py-2.5 border-b border-black/5">
                      <span className="text-[13px] text-brand-dark/80">Status</span>
                      <span className={`text-[13px] font-medium ${listing.status === 'Active' ? 'text-blue-600' : listing.status === 'Closed' ? 'text-green-600' : 'text-brand-dark'}`}>
                        {listing.status}
                      </span>
                    </div>
                  )}
                </div>
              </section>

              {/* ── 9. CALCULATORS (collapsed by default) ── */}
              <section className="py-6 border-t border-black/[0.06]">
                {!isRental ? (
                  <InvestorCalculator
                    purchasePrice={listing.listPrice}
                    maintenanceFee={listing.associationFee || 0}
                    monthlyTaxes={listing.taxAnnualAmount ? Math.round(listing.taxAnnualAmount / 12) : 0}
                    bedrooms={listing.bedroomsTotal}
                    neighborhood={neighborhood || borough}
                  />
                ) : (
                  <RentVsBuyCalculator
                    purchasePrice={listing.listPrice * 250}
                    monthlyRent={listing.listPrice}
                    maintenanceFee={0}
                    realEstateTaxes={0}
                    isRental={true}
                  />
                )}
              </section>

              {/* ── 10. TRANSIT & COMMUTE ── */}
              {listing.address.latitude && listing.address.longitude && (
                <section className="py-6 border-t border-black/[0.06]">
                  <TransitCommuteTool
                    latitude={listing.address.latitude}
                    longitude={listing.address.longitude}
                    borough={borough}
                  />
                </section>
              )}

              {/* ── 12. NEIGHBORHOOD EXPLORER (POI + Community Portrait) ── */}
              {listing.address.latitude && listing.address.longitude && (
                <section className="py-6 border-t border-black/[0.06]">
                  <NeighborhoodExplorer
                    latitude={listing.address.latitude}
                    longitude={listing.address.longitude}
                    address={fullAddress}
                    borough={borough}
                  />
                </section>
              )}

              {/* ── 12b. NEIGHBORHOOD SUMMARY ── */}
              {neighborhoodData && (
                <section className="py-6 border-t border-black/[0.06]">
                  <p className="text-[11px] font-semibold text-brand-dark/50 uppercase tracking-[0.15em] mb-5">
                    The Neighborhood
                  </p>

                  <div className="flex items-start gap-5">
                    {/* Hero thumbnail */}
                    {neighborhoodData.heroImage && (
                      <div className="hidden sm:block relative w-28 h-28 flex-shrink-0 rounded-2xl overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={neighborhoodData.heroImage}
                          alt={neighborhoodData.name}
                          className="absolute inset-0 w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <h3 className="font-display text-lg font-semibold text-brand-dark leading-snug">
                        {neighborhoodData.name}
                      </h3>
                      <p className="text-[13px] text-brand-gold-deep font-medium mb-2">{neighborhoodData.tagline}</p>
                      <p className="text-[13px] text-brand-dark/70 leading-relaxed line-clamp-3">
                        {neighborhoodData.summary}
                      </p>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
                    <div className="bg-stone-50 rounded-xl px-3 py-2.5 text-center">
                      <p className="text-[20px] font-bold text-brand-dark">{neighborhoodData.walkScore}</p>
                      <p className="text-[10px] text-brand-dark/50 uppercase tracking-wider font-semibold">Walk Score</p>
                    </div>
                    <div className="bg-stone-50 rounded-xl px-3 py-2.5 text-center">
                      <p className="text-[20px] font-bold text-brand-dark">{neighborhoodData.transitScore}</p>
                      <p className="text-[10px] text-brand-dark/50 uppercase tracking-wider font-semibold">Transit Score</p>
                    </div>
                    <div className="bg-stone-50 rounded-xl px-3 py-2.5 text-center">
                      <p className="text-[20px] font-bold text-brand-dark">${neighborhoodData.avgPricePerSqft.toLocaleString()}</p>
                      <p className="text-[10px] text-brand-dark/50 uppercase tracking-wider font-semibold">Avg $/Sq Ft</p>
                    </div>
                    <div className="bg-stone-50 rounded-xl px-3 py-2.5 text-center">
                      <p className="text-[13px] font-bold text-brand-dark mt-0.5">{neighborhoodData.dominantPropertyType}</p>
                      <p className="text-[10px] text-brand-dark/50 uppercase tracking-wider font-semibold mt-0.5">Primary Type</p>
                    </div>
                  </div>

                  {/* Subway lines + link */}
                  <div className="flex items-center justify-between mt-4">
                    {neighborhoodData.nearestSubway.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        {neighborhoodData.nearestSubway.map((line) => (
                          <SubwayBadge key={line} line={line} />
                        ))}
                      </div>
                    )}
                    <Link
                      href={`/${boroughSlug}/${neighborhoodData.slug}`}
                      className="text-[12px] font-semibold text-brand-gold-deep uppercase tracking-wider hover:text-brand-gold transition-colors flex items-center gap-1"
                    >
                      Full Neighborhood Guide
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    </Link>
                  </div>
                </section>
              )}

              {/* ── 13. BUILDING UNITS & HISTORY ── */}
              {listing.address.streetName !== 'Address Undisclosed' && (
                <section className="py-6 border-t border-black/[0.06]">
                  <BuildingUnits
                    streetNumber={listing.address.streetNumber}
                    streetName={listing.address.streetName}
                    postalCode={listing.address.postalCode}
                    currentListingId={listing.id}
                    buildingName={listing.buildingName}
                    currentUnit={listing.address.unitNumber || undefined}
                  />
                </section>
              )}

              {/* ── 13. SIMILAR LISTINGS ── */}
              <section className="py-6 border-t border-black/[0.06]">
                <SimilarListings
                  listingType={listing.listingType}
                  beds={listing.bedroomsTotal}
                  listPrice={listing.listPrice}
                  postalCode={listing.address.postalCode}
                  neighborhood={neighborhood}
                  currentListingId={listing.id}
                />
              </section>
            </div>

            {/* ═══════════════════════════════════════
                SIDEBAR (1/3)
                ═══════════════════════════════════════ */}
            <div className="lg:col-span-1 hidden lg:block">
              <div className="sticky top-24 space-y-5">

                {/* Contact Card */}
                <div className="rounded-3xl p-6 border border-black/[0.06]" style={{ background: 'linear-gradient(180deg, #fff 0%, #F8F7F4 100%)' }}>
                  <h3 className="font-display font-semibold text-[15px] text-brand-dark mb-1">Interested in this property?</h3>
                  <p className="text-brand-dark/50 text-[12px] mb-5">Mallan Real Estate Inc.</p>
                  <div className="space-y-2.5">
                    <a
                      href={`mailto:contact@mallan.nyc?subject=${encodeURIComponent(`Schedule Showing: ${fullAddress}`)}`}
                      className="btn-liquid flex items-center justify-center gap-2 w-full px-6 py-3.5 bg-brand-dark text-white rounded-2xl hover:bg-brand-dark/90 font-medium text-sm"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      Schedule a Showing
                    </a>
                    <a
                      href={`mailto:contact@mallan.nyc?subject=${encodeURIComponent(`Inquiry: ${fullAddress}`)}`}
                      className="btn-liquid flex items-center justify-center gap-2 w-full px-6 py-3.5 bg-brand-gold text-white rounded-2xl hover:bg-brand-gold-deep font-medium text-sm"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                      Request Information
                    </a>
                    <a
                      href="tel:646-258-4460"
                      className="flex items-center justify-center gap-2 w-full px-6 py-3 text-brand-dark rounded-2xl ring-1 ring-black/10 hover:bg-gray-50 font-medium text-sm transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                      (646) 258-4460
                    </a>
                  </div>
                </div>

                {/* Open House RSVP (shows only if upcoming open houses exist for this address) */}
                <ListingOpenHouseRSVP listingId={listing.id} listingAddress={fullAddress} />

                {/* Inquiry Form */}
                <div id="inquiry">
                  <InquiryForm
                    listingId={listing.id}
                    listingAddress={fullAddress}
                    agentEmail="info@mallan.nyc"
                  />
                </div>

                {/* Market Context */}
                <MarketSnapshot
                  neighborhood={neighborhood}
                  borough={borough}
                  listPrice={listing.listPrice}
                  pricePerSqft={listing.livingArea ? listing.listPrice / listing.livingArea : null}
                  listingType={isRental ? 'rent' : 'sale'}
                />

                {/* Transit Summary */}
                {listing.address.latitude && listing.address.longitude && (
                  <TransitSidebarSummary
                    latitude={listing.address.latitude}
                    longitude={listing.address.longitude}
                  />
                )}

                {/* View More */}
                <div className="rounded-3xl p-5 bg-[#F8F7F4]">
                  <p className="font-display font-semibold text-sm mb-3 text-brand-dark">Explore More</p>
                  <div className="space-y-2">
                    <Link
                      href={`/search?tab=${isRental ? 'rent' : 'buy'}-residential`}
                      className="flex items-center justify-between text-[13px] text-brand-dark/70 hover:text-brand-gold transition-colors py-1"
                    >
                      <span>All {isRental ? 'Rentals' : 'Sales'}</span>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    </Link>
                    {neighborhood && (
                      <Link
                        href={`/search?tab=${isRental ? 'rent' : 'buy'}-residential&neighborhood=${encodeURIComponent(neighborhood)}`}
                        className="flex items-center justify-between text-[13px] text-brand-dark/70 hover:text-brand-gold transition-colors py-1"
                      >
                        <span>More in {neighborhood}</span>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ═══ Listing Courtesy Attribution (REBNY compliance) ═══ */}
      <section className="border-t border-black/[0.06] py-5 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-x-4 gap-y-1">
          <p className="text-[13px] text-brand-dark/55">
            RLS · Listing Courtesy of <span className="font-medium text-brand-dark/70">{listing.listOfficeName || 'Mallan Real Estate Inc.'}</span>
          </p>
          <span className="text-brand-dark/20">|</span>
          <p className="text-[13px] text-brand-dark/45">
            {listing.modificationTimestamp
              ? `Updated ${new Date(listing.modificationTimestamp).toLocaleDateString()}`
              : 'Updated continuously'}
          </p>
        </div>
      </section>

      {/* ═══ REBNY RLS Disclaimer ═══ */}
      <section className="bg-[#F8F7F4] border-t border-black/[0.06] py-6 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <IDXDisclaimer
            variant="full"
            lastUpdated={listing.modificationTimestamp}
          />
        </div>
      </section>

      {/* ═══ Mobile Open House RSVP + Inquiry Form ═══ */}
      <section className="lg:hidden px-4 py-8 bg-white border-t border-black/[0.06]">
        <div className="max-w-lg mx-auto space-y-6">
          <ListingOpenHouseRSVP listingId={listing.id} listingAddress={fullAddress} />
          <div id="inquiry">
            <InquiryForm
              listingId={listing.id}
              listingAddress={fullAddress}
              agentEmail="info@mallan.nyc"
            />
          </div>
        </div>
      </section>

      <SocialShareBar title={`${fullAddress} | ${formatPrice(listing.listPrice, isRental)}`} />
    </div>
  );
}
