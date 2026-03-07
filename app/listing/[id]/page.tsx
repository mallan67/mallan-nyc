import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import InquiryForm from '@/app/components/InquiryForm';
import PriceWithCalculator from '@/app/components/PriceWithCalculator';
import InvestorCalculator from '@/app/components/InvestorCalculator';
import RentVsBuyCalculator from '@/app/components/RentVsBuyCalculator';
import agentsData from '@/data/agents.json';
import IDXDisclaimer from '@/app/components/IDXDisclaimer';
import ListingMediaGallery from '@/app/components/ListingMediaGallery';
import BackButton from '@/app/components/BackButton';
import ShareButton from '@/app/components/ShareButton';
import DetailFavoriteButton from '@/app/components/DetailFavoriteButton';
import SocialShareBar from '@/app/components/SocialShareBar';
import TransitCommuteTool from '@/app/components/TransitCommuteTool';
import TransitSidebarSummary from '@/app/components/TransitSidebarSummary';
import ListingLocationMap from '@/app/components/ListingLocationMap';
import BuildingUnits from '@/app/components/BuildingUnits';
import SimilarListings from '@/app/components/SimilarListings';
import { fetchSingleListing, fetchListingMedia, fetchListingByAddress } from '@/lib/idx/fetch';
import { checkDistributionGates } from '@/lib/idx/trestle-mapper';
import { mapRESOToInternal, generateAttributionText } from '@/lib/idx/mapping';
import { toPublicDTO, type PublicListingDTO } from '@/lib/idx/public-dto';
import { isMlsIdSlug, extractMlsIdFromSlug, parseAddressSlug, generateListingSlug } from '@/lib/listing-slug';
import { geocodeListings } from '@/lib/geo/geocode';
import { cache } from 'react';

import { getAccessToken } from '@/lib/idx/auth';
import { soda } from '@/lib/soda';

// Dynamic — listings come from IDX, not static JSON
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
  } catch (err) {
    console.warn('[ACRIS fallback] Error:', err);
    return null;
  }
}

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ key?: string }>;
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

  const dto = toPublicDTO(listing);

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
  } catch (mediaErr) {
    console.warn(`[/listing/${debugId}] Media fetch failed:`, mediaErr);
    // Non-fatal — listing displays without photos
  }

  // Geocode if coordinates are missing (Trestle IDX Plus often returns null lat/lng)
  if (!dto.address.latitude || !dto.address.longitude) {
    try {
      await geocodeListings([dto]);
    } catch {
      // Non-fatal — page renders without map/transit sections
    }
  }

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
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/listings/${encodeURIComponent(listingId)}`, {
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
 * Fetch a single listing from IDX (Trestle) with fallback resilience.
 *
 * Resolution order:
 *   1. Direct Trestle fetch (fastest, freshest data)
 *   2. Fallback to /api/listings/:id (has local JSON fallback)
 *
 * COMPLIANCE: Address slugs are NEVER generated for listings where
 * InternetAddressDisplayYN=false. Those use MLS-ID slugs instead,
 * preventing address leakage through URLs.
 */
const fetchListing = cache(async function fetchListing(slug: string, keyOverride?: string): Promise<ListingFetchResult | null> {
  const useIDX = process.env.IDX_ENABLED === 'true';

  // Primary: direct Trestle fetch
  if (useIDX) {
    try {
      const result = await fetchFromTrestleDirect(slug, keyOverride);
      if (result) return result;
    } catch (err) {
      console.error(`[/listing/${slug}] Trestle fetch failed, trying API fallback:`, err);
    }
  }

  // Fallback: our own API endpoint (has local JSON fallback)
  const fallbackId = keyOverride || slug;
  const apiResult = await fetchFromApiEndpoint(fallbackId);
  if (apiResult) return apiResult;

  return null;
});

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id } = await params;
  const { key } = await searchParams;
  const result = await fetchListing(id, key);

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
  const ogImage = listing.media[0]?.url || '/images/og-default.png';
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

/** Convert CamelCase to readable label (e.g., "HealthClub" → "Health Club") */
function formatCamelCase(val: string): string {
  return val.replace(/([a-z])([A-Z])/g, '$1 $2').trim();
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
  const { key } = await searchParams;
  const result = await fetchListing(id, key);

  if (!result) {
    notFound();
  }

  const listing = result.listing;
  const { tax } = result;

  const isRental = listing.listingType === 'rent';
  const isCoop = listing.propertyType === 'Co-op' || listing.propertyType === 'Cooperative';
  const isCondo = listing.propertyType === 'Condo' || listing.propertyType === 'Condop' || listing.propertyType === 'Condominium';
  const borough = countyToBorough(listing.address.county);
  const neighborhood = listing.address.neighborhood || '';
  const displayPropertyType = listing.propertyType === 'Residential' ? (listing.propertySubType || listing.propertyType) : listing.propertyType;

  const fullAddress = listing.address.streetName === 'Address Undisclosed'
    ? 'Address Undisclosed'
    : `${listing.address.streetNumber} ${listing.address.streetName}${listing.address.unitNumber ? `, ${listing.address.unitNumber}` : ''}`;

  // Fetch last closed sale for this specific unit (server-side, cached 1hr)
  // Primary: Trestle closed records. Fallback: ACRIS deed records.
  let lastUnitSale: LastSaleInfo | null = null;
  if (listing.address.streetName !== 'Address Undisclosed') {
    lastUnitSale = await fetchLastUnitSale(
      listing.address.streetNumber,
      listing.address.streetName,
      listing.address.unitNumber,
      listing.address.postalCode,
    );
    // ACRIS fallback when Trestle has no closed data
    if (!lastUnitSale) {
      lastUnitSale = await fetchLastSaleFromACRIS(
        listing.address.county,
        tax.taxBlock,
        tax.taxLot,
      );
    }
  }

  // ── Building amenities ──
  // Primary source: BuildingFeatures (Trestle IDX Plus)
  // Also merge: AssociationAmenities, CommunityFeatures, SecurityFeatures, PoolFeatures, SpaFeatures
  // Map Trestle values → human-readable labels
  const BUILDING_FEATURE_LABELS: Record<string, string> = {
    Concierge: 'Concierge',
    Elevators: 'Elevator',
    HealthClub: 'Gym',
    FitnessCenter: 'Gym',
    YogaStudio: 'Yoga Studio',
    IndoorPool: 'Pool',
    CommonPlayroom: "Children's Room",
    GameRoom: 'Recreation Room',
    ScreeningRoom: 'Screening Room',
    Sauna: 'Sauna',
    SteamRoom: 'Steam Room',
    KitchenFacilities: 'Kitchen Facilities',
    PackageRoom: 'Package Room',
    GreenBuilding: 'Green Building',
    ColdStorage: 'Cold Storage',
  };
  // Values to EXCLUDE from building amenities (user request: no storage, no bike room)
  const BUILDING_EXCLUDE = new Set(['Storage', 'BikeStorage', 'BicycleStorage']);

  const rawBuildingFeatures = listing.buildingFeatures ? parseTrestleList(listing.buildingFeatures) : [];
  const rawAssocAmenities = listing.associationAmenities ? parseTrestleList(listing.associationAmenities) : [];
  const rawCommunity = listing.communityFeatures ? parseTrestleList(listing.communityFeatures) : [];
  const rawPool = listing.poolFeatures ? parseTrestleList(listing.poolFeatures) : [];
  const rawSpa = listing.spaFeatures ? parseTrestleList(listing.spaFeatures) : [];

  const amenitySet = new Set<string>();
  for (const val of rawBuildingFeatures) {
    if (BUILDING_EXCLUDE.has(val)) continue;
    amenitySet.add(BUILDING_FEATURE_LABELS[val] || formatCamelCase(val));
  }
  for (const val of rawAssocAmenities) {
    if (BUILDING_EXCLUDE.has(val)) continue;
    amenitySet.add(BUILDING_FEATURE_LABELS[val] || formatCamelCase(val));
  }
  for (const val of rawCommunity) {
    if (BUILDING_EXCLUDE.has(val)) continue;
    amenitySet.add(BUILDING_FEATURE_LABELS[val] || formatCamelCase(val));
  }
  // Pool & Spa from dedicated fields
  if (rawPool.length > 0) amenitySet.add('Pool');
  if (rawSpa.length > 0) amenitySet.add('Spa');
  // Security → Doorman mapping
  const securityFeatures: string[] = listing.securityFeatures ? parseTrestleList(listing.securityFeatures) : [];
  for (const val of securityFeatures) {
    if (val === 'SecurityGuard') amenitySet.add('Doorman');
    else if (val === 'SecurityGate') amenitySet.add('Security Gate');
    else amenitySet.add(formatCamelCase(val));
  }
  // Laundry in building (not unit-level)
  const rawLaundry = listing.laundryFeatures ? parseTrestleList(listing.laundryFeatures) : [];
  const buildingLaundryValues = new Set(['CommonArea', 'CommonOnFloor', 'LaundryRoom', 'BuildingInside', 'BuildingMultipleLocations']);
  const hasBuildingLaundry = rawLaundry.some(v => buildingLaundryValues.has(v));
  if (hasBuildingLaundry) amenitySet.add('Laundry');

  // Garage — separate from building amenities
  const parkingList = listing.parkingFeatures ? parseTrestleList(listing.parkingFeatures) : [];
  const hasGarage = parkingList.some(v => v === 'Garage');

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
  // Add building-level exterior features to building amenities
  if (listing.exteriorFeatures) {
    for (const raw of splitRaw(listing.exteriorFeatures)) {
      if (raw === 'BuildingRoofDeck') amenitySet.add('Roof Deck');
      else if (raw === 'BuildingGarden') amenitySet.add('Garden');
      else if (raw === 'BuildingCourtyard') amenitySet.add('Courtyard');
    }
  }
  // Rebuild sorted building amenities after exterior additions
  const buildingAmenitiesFinal = [...amenitySet].sort();

  // ── Unit Details (structured rows) ──
  const unitDetails: { label: string; value: string }[] = [];
  if (listing.flooring) unitDetails.push({ label: 'Flooring', value: parseTrestleList(listing.flooring).join(', ') });
  // Only unit-level laundry (In Unit, Washer Hookup) — NOT building-level
  const unitLaundryRaw = rawLaundry.filter(v => !buildingLaundryValues.has(v) && v !== 'None' && v !== 'BuildingNone' && v !== 'BuildingOther' && v !== 'SeeRemarks');
  if (unitLaundryRaw.length > 0) unitDetails.push({ label: 'Laundry', value: unitLaundryRaw.map(v => formatTrestleValue(v)).join(', ') });
  if (listing.heating) unitDetails.push({ label: 'Heating', value: parseTrestleList(listing.heating).join(', ') });
  if (listing.cooling) unitDetails.push({ label: 'Cooling', value: parseTrestleList(listing.cooling).join(', ') });

  // ── Appliances (pills) ──
  const appliancesList: string[] = listing.appliances ? parseTrestleList(listing.appliances) : [];
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
    image: listing.media[0]?.url || undefined,
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(listingSchema) }}
      />
      <Header dark />

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
              Coming Soon
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
              photoUrl={listing.media[0]?.url}
            />
            <a
              href="tel:646-258-4460"
              className="btn-liquid px-5 py-2.5 bg-brand-gold text-white text-sm font-medium rounded-full hover:bg-brand-gold-deep"
            >
              Call
            </a>
            <a
              href="#inquiry"
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
                    {/* Price — the most prominent element */}
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
                    {/* Neighborhood — the selling point in NYC */}
                    {neighborhood && neighborhood !== borough && (
                      <h1 className="font-display font-bold text-xl md:text-2xl text-brand-dark tracking-tight mb-0.5">
                        {neighborhood}
                      </h1>
                    )}
                    <p className="text-brand-dark/90 text-[15px]">{fullAddress}</p>
                    <p className="text-brand-dark/60 text-[13px]">
                      {borough}, NY {listing.address.postalCode}
                    </p>
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
                        photoUrl={listing.media[0]?.url}
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
                      <span className="text-brand-dark/60 text-[13px] ml-1">Beds</span>
                    </div>
                  </div>
                  <div className="w-px h-8 bg-black/10" />
                  <div className="flex items-center gap-2 px-4 py-1">
                    <svg className="w-5 h-5 text-brand-gold-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4-4m0 0l-4 4m4-4v12" /></svg>
                    <div>
                      <span className="text-lg font-display font-bold text-brand-dark">
                        {listing.bathroomsFull}{listing.bathroomsHalf > 0 && `.${listing.bathroomsHalf}`}
                      </span>
                      <span className="text-brand-dark/60 text-[13px] ml-1">Baths</span>
                    </div>
                  </div>
                  {listing.livingArea && (
                    <>
                      <div className="w-px h-8 bg-black/10" />
                      <div className="flex items-center gap-2 px-4 py-1">
                        <svg className="w-5 h-5 text-brand-gold-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                        <div>
                          <span className="text-lg font-display font-bold text-brand-dark">{listing.livingArea.toLocaleString()}</span>
                          <span className="text-brand-dark/60 text-[13px] ml-1">Sq Ft</span>
                        </div>
                      </div>
                    </>
                  )}
                  {listing.livingArea && listing.listPrice > 0 && (
                    <>
                      <div className="w-px h-8 bg-black/10" />
                      <div className="px-4 py-1">
                        <span className="text-lg font-display font-bold text-brand-dark">${Math.round(listing.listPrice / listing.livingArea).toLocaleString()}</span>
                        <span className="text-brand-dark/60 text-[13px] ml-1">/Sq Ft</span>
                      </div>
                    </>
                  )}
                  {listing.roomsTotal && (
                    <>
                      <div className="w-px h-8 bg-black/10" />
                      <div className="px-4 py-1">
                        <span className="text-lg font-display font-bold text-brand-dark">{listing.roomsTotal}</span>
                        <span className="text-brand-dark/60 text-[13px] ml-1">Rooms</span>
                      </div>
                    </>
                  )}
                </div>
              </section>

              {/* ── 2. DESCRIPTION ── */}
              {listing.publicRemarks && (
                <section className="py-6 border-t border-black/[0.06]">
                  <h2 className="font-display font-semibold text-lg mb-4 text-brand-dark">About This Property</h2>
                  <div
                    className="text-brand-dark/85 text-[15px] leading-[1.85] max-w-none text-justify"
                    dangerouslySetInnerHTML={{
                      __html: listing.publicRemarks
                        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                        .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
                        .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
                        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                    }}
                  />
                </section>
              )}

              {/* ── 3. FINANCIALS (Co-op/Condo + Price History + Last Sale) ── */}
              {(!isRental && (isCoop || isCondo || priceHistory.length > 1 || (lastUnitSale && lastUnitSale.closePrice > 0))) && (
                <section className="py-6 border-t border-black/[0.06]">
                  <h2 className="font-display font-semibold text-lg mb-4 text-brand-dark">Financials</h2>
                  <div className="space-y-4">
                    {/* Co-op/Condo Monthly Costs */}
                    {(isCoop || isCondo) && (listing.associationFee || listing.taxAnnualAmount) && (
                      <div className="rounded-2xl bg-[#F8F7F4] p-5">
                        <p className="text-[11px] font-medium text-brand-dark/50 uppercase tracking-wider mb-3">
                          {isCoop ? 'Co-op Monthly Costs' : 'Condo Monthly Costs'}
                        </p>
                        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2">
                          {listing.associationFee && (
                            <div className="flex justify-between py-2 border-b border-black/5">
                              <span className="text-brand-dark/70 text-sm">{isCoop ? 'Maintenance' : 'Common Charges'}</span>
                              <span className="font-display font-semibold text-brand-dark">
                                ${listing.associationFee.toLocaleString()}/mo
                              </span>
                            </div>
                          )}
                          {listing.taxAnnualAmount && (
                            <div className="flex justify-between py-2 border-b border-black/5">
                              <span className="text-brand-dark/70 text-sm">Real Estate Taxes</span>
                              <span className="font-display font-semibold text-brand-dark">
                                ${Math.round(listing.taxAnnualAmount / 12).toLocaleString()}/mo
                                {listing.taxYear && <span className="text-brand-dark/50 text-xs ml-1">({listing.taxYear})</span>}
                              </span>
                            </div>
                          )}
                          {listing.associationFee && listing.taxAnnualAmount && (
                            <div className="flex justify-between py-2 sm:col-span-2 border-t border-brand-gold/20">
                              <span className="text-brand-dark/90 text-sm font-medium">Total Monthly</span>
                              <span className="font-display font-bold text-brand-dark">
                                ${(listing.associationFee + Math.round(listing.taxAnnualAmount / 12)).toLocaleString()}/mo
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Price History */}
                    {priceHistory.length > 1 && (
                      <div className="rounded-2xl bg-[#F8F7F4] p-5">
                        <p className="text-[11px] font-medium text-brand-dark/50 uppercase tracking-wider mb-3">Price History</p>
                        <div className="flex items-end gap-4">
                          {priceHistory.map((entry, i) => {
                            const isCurrent = i === priceHistory.length - 1;
                            const prev = i > 0 ? priceHistory[i - 1].price : null;
                            const change = prev ? ((entry.price - prev) / prev * 100) : null;
                            return (
                              <div key={entry.label} className="flex-1 text-center">
                                <p className={`font-display font-bold text-sm md:text-base ${isCurrent ? 'text-brand-dark' : 'text-brand-dark/50 line-through'}`}>
                                  {formatPrice(entry.price, isRental)}
                                </p>
                                {change !== null && (
                                  <p className={`text-[11px] font-medium mt-0.5 ${change < 0 ? 'text-green-600' : 'text-red-500'}`}>
                                    {change > 0 ? '+' : ''}{change.toFixed(1)}%
                                  </p>
                                )}
                                <p className="text-[11px] text-brand-dark/50 mt-1">{entry.label}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Last Closed Sale */}
                    {lastUnitSale && lastUnitSale.closePrice > 0 && (
                      <div className="rounded-2xl bg-[#F8F7F4] p-5">
                        <p className="text-[11px] font-medium text-brand-dark/50 uppercase tracking-wider mb-3">
                          Last Sale — This {lastUnitSale.source === 'acris' ? 'Property' : 'Unit'}
                        </p>
                        <div className="flex flex-wrap items-baseline gap-3">
                          <span className="text-lg font-display font-bold text-brand-dark">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(lastUnitSale.closePrice)}
                          </span>
                          {lastUnitSale.sqft > 0 && (
                            <span className="text-sm text-brand-dark/60">
                              ${Math.round(lastUnitSale.closePrice / lastUnitSale.sqft).toLocaleString()}/sf
                            </span>
                          )}
                          {lastUnitSale.closeDate && (
                            <span className="text-sm text-brand-dark/50">
                              Closed {new Date(lastUnitSale.closeDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                            </span>
                          )}
                        </div>
                        {listing.listPrice > 0 && lastUnitSale.closePrice > 0 && (
                          <p className={`text-xs mt-2 font-medium ${listing.listPrice > lastUnitSale.closePrice ? 'text-red-500/70' : 'text-green-600/70'}`}>
                            {listing.listPrice > lastUnitSale.closePrice
                              ? `Asking ${Math.round(((listing.listPrice - lastUnitSale.closePrice) / lastUnitSale.closePrice) * 100)}% above last sale`
                              : listing.listPrice < lastUnitSale.closePrice
                              ? `Asking ${Math.round(((lastUnitSale.closePrice - listing.listPrice) / lastUnitSale.closePrice) * 100)}% below last sale`
                              : 'Asking matches last sale price'}
                          </p>
                        )}
                        {lastUnitSale.source === 'acris' && (
                          <p className="text-[10px] text-brand-dark/35 mt-1">Source: NYC ACRIS Public Records</p>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* ── 4. UNIT FEATURES ── */}
              {(unitFeatures.length > 0 || unitDetails.length > 0) && (
                <section className="py-6 border-t border-black/[0.06]">
                  <h2 className="font-display font-semibold text-lg mb-4 text-brand-dark">Unit Features</h2>
                  {unitFeatures.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {unitFeatures.map((f) => (
                        <span key={f} className="px-3 py-1.5 bg-black/[0.04] text-brand-dark/80 rounded-lg text-[13px] font-light">{f}</span>
                      ))}
                    </div>
                  )}
                  {unitDetails.length > 0 && (
                    <div className="grid sm:grid-cols-2 gap-x-8 gap-y-0 mt-4">
                      {unitDetails.map((item) => (
                        <div key={item.label} className="flex justify-between py-2.5 border-b border-black/5">
                          <span className="text-[13px] text-brand-dark/60">{item.label}</span>
                          <span className="text-[13px] font-medium text-brand-dark">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* ── 5. APPLIANCES ── */}
              {appliancesList.length > 0 && (
                <section className="py-6 border-t border-black/[0.06]">
                  <h2 className="font-display font-semibold text-lg mb-4 text-brand-dark">Appliances</h2>
                  <div className="flex flex-wrap gap-2">
                    {appliancesList.map((a) => (
                      <span key={a} className="px-3 py-1.5 bg-black/[0.04] text-brand-dark/80 rounded-lg text-[13px] font-light">{a}</span>
                    ))}
                  </div>
                </section>
              )}

              {/* ── 6. BUILDING AMENITIES ── */}
              {(buildingAmenitiesFinal.length > 0 || hasGarage || petPolicy) && (
                <section className="py-6 border-t border-black/[0.06]">
                  <h2 className="font-display font-semibold text-lg mb-4 text-brand-dark">Building Amenities</h2>
                  {buildingAmenitiesFinal.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {buildingAmenitiesFinal.map((amenity) => (
                        <div key={amenity} className="flex items-center gap-2.5 px-3.5 py-2.5 bg-brand-gold/[0.06] rounded-xl">
                          <svg className="w-4 h-4 text-brand-gold-deep flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          <span className="text-[13px] text-brand-dark/80">{amenity}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(hasGarage || petPolicy) && (
                    <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 border-t border-black/5">
                      {hasGarage && (
                        <span className="inline-flex items-center gap-2 text-[13px] text-brand-dark/80 bg-black/[0.03] px-3 py-1.5 rounded-lg">
                          <svg className="w-4 h-4 text-brand-gold-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7h8m-8 4h8m-4-8v16M3 21h18M3 3h18" /></svg>
                          Garage Access
                        </span>
                      )}
                      {petPolicy && (
                        <span className={`inline-flex items-center gap-2 text-[13px] px-3 py-1.5 rounded-lg ${petsAllowed ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}>
                          {petsAllowed ? (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                          )}
                          Pets: {petPolicy}
                        </span>
                      )}
                    </div>
                  )}
                </section>
              )}

              {/* ── 7. RENTAL DETAILS ── */}
              {isRental && (listing.petsAllowed || listing.furnished || listing.availabilityDate) && (
                <section className="py-6 border-t border-black/[0.06]">
                  <h2 className="font-display font-semibold text-lg mb-4 text-brand-dark">Rental Details</h2>
                  <div className="grid sm:grid-cols-2 gap-x-8 gap-y-0">
                    {listing.availabilityDate && (
                      <div className="flex justify-between py-2.5 border-b border-black/5">
                        <span className="text-[13px] text-brand-dark/60">Available</span>
                        <span className="text-[13px] font-medium text-brand-dark">{new Date(listing.availabilityDate).toLocaleDateString()}</span>
                      </div>
                    )}
                    {listing.petsAllowed && (
                      <div className="flex justify-between py-2.5 border-b border-black/5">
                        <span className="text-[13px] text-brand-dark/60">Pets</span>
                        <span className="text-[13px] font-medium text-brand-dark">{listing.petsAllowed}</span>
                      </div>
                    )}
                    {listing.furnished && (
                      <div className="flex justify-between py-2.5 border-b border-black/5">
                        <span className="text-[13px] text-brand-dark/60">Furnished</span>
                        <span className="text-[13px] font-medium text-brand-dark">{listing.furnished}</span>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* ── 8. BUILDING INFO ── */}
              <section className="py-6 border-t border-black/[0.06]">
                <h2 className="font-display font-semibold text-lg mb-4 text-brand-dark">Building Details</h2>
                <div className="grid sm:grid-cols-2 gap-x-8 gap-y-0">
                  <div className="flex justify-between py-2.5 border-b border-black/5">
                    <span className="text-[13px] text-brand-dark/60">Property Type</span>
                    <span className="text-[13px] font-medium text-brand-dark">{displayPropertyType}</span>
                  </div>
                  {listing.architecturalStyle && (
                    <div className="flex justify-between py-2.5 border-b border-black/5">
                      <span className="text-[13px] text-brand-dark/60">Style</span>
                      <span className="text-[13px] font-medium text-brand-dark">{listing.architecturalStyle}</span>
                    </div>
                  )}
                  {listing.yearBuilt && (
                    <div className="flex justify-between py-2.5 border-b border-black/5">
                      <span className="text-[13px] text-brand-dark/60">Year Built</span>
                      <span className="text-[13px] font-medium text-brand-dark">{listing.yearBuilt}</span>
                    </div>
                  )}
                  {listing.storiesTotal && (
                    <div className="flex justify-between py-2.5 border-b border-black/5">
                      <span className="text-[13px] text-brand-dark/60">Stories</span>
                      <span className="text-[13px] font-medium text-brand-dark">{listing.storiesTotal}</span>
                    </div>
                  )}
                  {listing.buildingName && (
                    <div className="flex justify-between py-2.5 border-b border-black/5">
                      <span className="text-[13px] text-brand-dark/60">Building</span>
                      <span className="text-[13px] font-medium text-brand-dark">{listing.buildingName}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-2.5 border-b border-black/5">
                    <span className="text-[13px] text-brand-dark/60">MLS #</span>
                    <span className="text-[13px] font-medium text-brand-dark font-mono">{listing.mlsId}</span>
                  </div>
                  {listing.onMarketDate && (
                    <div className="flex justify-between py-2.5 border-b border-black/5">
                      <span className="text-[13px] text-brand-dark/60">Listed</span>
                      <span className="text-[13px] font-medium text-brand-dark">{new Date(listing.onMarketDate).toLocaleDateString()}</span>
                    </div>
                  )}
                  {listing.status && (
                    <div className="flex justify-between py-2.5 border-b border-black/5">
                      <span className="text-[13px] text-brand-dark/60">Status</span>
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

              {/* ── 10. MAP ── */}
              {listing.address.latitude && listing.address.longitude && (
                <section className="py-6 border-t border-black/[0.06]">
                  <ListingLocationMap
                    latitude={listing.address.latitude}
                    longitude={listing.address.longitude}
                    address={fullAddress}
                    borough={borough}
                  />
                </section>
              )}

              {/* ── 11. TRANSIT & COMMUTE ── */}
              {listing.address.latitude && listing.address.longitude && (
                <section className="py-6 border-t border-black/[0.06]">
                  <TransitCommuteTool
                    latitude={listing.address.latitude}
                    longitude={listing.address.longitude}
                    borough={borough}
                  />
                </section>
              )}

              {/* ── 12. BUILDING UNITS & HISTORY ── */}
              {listing.address.streetName !== 'Address Undisclosed' && (
                <section className="py-6 border-t border-black/[0.06]">
                  <BuildingUnits
                    streetNumber={listing.address.streetNumber}
                    streetName={listing.address.streetName}
                    postalCode={listing.address.postalCode}
                    currentListingId={listing.id}
                    buildingName={listing.buildingName}
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
                      href="tel:646-258-4460"
                      className="btn-liquid flex items-center justify-center gap-2 w-full px-6 py-3.5 bg-brand-dark text-white rounded-2xl hover:bg-brand-dark/90 font-medium text-sm"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                      (646) 258-4460
                    </a>
                    <a
                      href="#inquiry"
                      className="btn-liquid flex items-center justify-center gap-2 w-full px-6 py-3.5 bg-brand-gold text-white rounded-2xl hover:bg-brand-gold-deep font-medium text-sm"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                      Request a Tour
                    </a>
                  </div>
                </div>

                {/* Inquiry Form */}
                <div id="inquiry">
                  <InquiryForm
                    listingId={listing.id}
                    listingAddress={fullAddress}
                    agentEmail="info@mallan.nyc"
                  />
                </div>

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
          <p className="text-[13px] text-brand-dark/70">
            Listing courtesy of <span className="font-medium text-brand-dark/85">{listing.listAgentFullName || 'Listing Agent'}</span>, {listing.listOfficeName || 'Listing Office'}
          </p>
          <span className="text-brand-dark/30">|</span>
          <p className="text-[13px] text-brand-dark/50">
            Updated {new Date(listing.modificationTimestamp).toLocaleDateString()}
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

      {/* ═══ Mobile Inquiry Form (below footer on mobile, since sidebar is hidden) ═══ */}
      <section id="inquiry" className="lg:hidden px-4 py-8 bg-white border-t border-black/[0.06]">
        <div className="max-w-lg mx-auto">
          <InquiryForm
            listingId={listing.id}
            listingAddress={fullAddress}
            agentEmail="info@mallan.nyc"
          />
        </div>
      </section>

      <SocialShareBar title={`${fullAddress} | ${formatPrice(listing.listPrice, isRental)}`} />
      <Footer />
    </div>
  );
}
