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
import PublicRecordsPanel from '@/app/components/PublicRecordsPanel';
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

    // Step 2: Get deed documents with sale amounts
    const docIds = docRows.map(r => r.document_id);
    const where = `document_id in (${docIds.map(id => `'${id}'`).join(',')}) AND doc_type in ('DEED','DEEDO') AND document_amt>'0'`;
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

  // SEO: The canonical URL (set in generateMetadata) uses the address slug.
  // Google will index the correct URL via <link rel="canonical">.
  // No runtime redirect needed — both MLS ID and address slug URLs serve the listing.

  const isRental = listing.listingType === 'rent';
  const isCoop = listing.propertyType === 'Co-op' || listing.propertyType === 'Cooperative';
  const isCondo = listing.propertyType === 'Condo' || listing.propertyType === 'Condop' || listing.propertyType === 'Condominium';
  const borough = countyToBorough(listing.address.county);
  const neighborhood = listing.address.neighborhood || '';

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
  // Interior features minus building-level items
  const INTERIOR_EXCLUDE = new Set(['Sauna', 'Elevator', 'CommonArea', 'CommonOnFloor', 'Storage']);
  const unitFeatures: string[] = [];
  if (listing.interiorFeatures) {
    for (const v of parseTrestleList(listing.interiorFeatures)) {
      if (!INTERIOR_EXCLUDE.has(v)) unitFeatures.push(v);
    }
  }
  // Unit-level exterior features (Balcony, Private Yard, etc.) — exclude building-level
  const EXTERIOR_BUILDING = new Set(['BuildingBalcony', 'BuildingCourtyard', 'BuildingGarden', 'BuildingRoofDeck', 'BuildingStorage']);
  if (listing.exteriorFeatures) {
    for (const v of parseTrestleList(listing.exteriorFeatures)) {
      if (!EXTERIOR_BUILDING.has(v) && v !== 'Storage') unitFeatures.push(v);
    }
  }
  // Add building-level exterior features to building amenities
  if (listing.exteriorFeatures) {
    for (const v of parseTrestleList(listing.exteriorFeatures)) {
      if (v === 'BuildingRoofDeck') amenitySet.add('Roof Deck');
      else if (v === 'BuildingGarden') amenitySet.add('Garden');
      else if (v === 'BuildingCourtyard') amenitySet.add('Courtyard');
    }
  }
  // Rebuild sorted building amenities after exterior additions
  const buildingAmenitiesFinal = [...amenitySet].sort();

  // ── Unit Details (structured rows) ──
  const unitDetails: { label: string; value: string }[] = [];
  if (listing.flooring) unitDetails.push({ label: 'Flooring', value: parseTrestleList(listing.flooring).join(', ') });
  const unitLaundryValues = rawLaundry.filter(v => !buildingLaundryValues.has(v) && v !== 'None' && v !== 'BuildingNone' && v !== 'BuildingOther' && v !== 'SeeRemarks');
  if (unitLaundryValues.length > 0) unitDetails.push({ label: 'Laundry', value: unitLaundryValues.map(v => formatCamelCase(v)).join(', ') });
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

  // Separate media by type: photos, floorplans, videos, virtual tours
  const nonPhotoTypes = new Set(['video', 'mpeg', 'mp4', 'avi', 'floorplan', 'floor plan', 'virtualtour', 'virtual tour']);
  const videoTypes = new Set(['video', 'mpeg', 'mp4', 'avi']);
  const floorPlanTypes = new Set(['floorplan', 'floor plan']);
  const virtualTourTypes = new Set(['virtualtour', 'virtual tour']);
  const images = listing.media
    .filter((m) => {
      const type = (m.mediaType || '').toLowerCase();
      return !nonPhotoTypes.has(type);
    })
    .sort((a, b) => a.order - b.order)
    .map((m) => ({ url: m.url }));
  const floorPlanMedia = listing.media.find((m) =>
    floorPlanTypes.has((m.mediaType || '').toLowerCase())
  );
  const floorPlanUrl = floorPlanMedia?.url || null;
  const videoMedia = listing.media.find((m) =>
    videoTypes.has((m.mediaType || '').toLowerCase())
  );
  const videoUrl = videoMedia?.url || null;
  // Virtual tour: prefer Property-level VirtualTourURLUnbranded, fall back to Media resource
  const virtualTourMedia = listing.media.find((m) =>
    virtualTourTypes.has((m.mediaType || '').toLowerCase())
  );
  const virtualTourUrl = listing.virtualTourURL || virtualTourMedia?.url || null;

  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <Header dark />

      {/* Breadcrumb + Back */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-black/5 pt-[68px]">
        <div className="max-w-7xl mx-auto px-4 py-2">
          <nav className="flex items-center gap-2 text-sm text-brand-dark/85">
            <BackButton fallbackHref={isRental ? '/rent' : '/buy'} />
            <Link href="/" className="hover:text-brand-gold hidden md:inline">Home</Link>
            <span className="hidden md:inline">/</span>
            <Link href={isRental ? '/rent' : '/buy'} className="hover:text-brand-gold hidden md:inline">
              {isRental ? 'Rentals' : 'Sales'}
            </Link>
            <span className="hidden md:inline">/</span>
            <span className="text-brand-dark hidden md:inline">{borough}</span>
            {neighborhood && (
              <>
                <span className="hidden md:inline">/</span>
                <span className="text-brand-dark hidden md:inline">{neighborhood}</span>
              </>
            )}
            <span className="text-brand-dark md:hidden">{borough}</span>
          </nav>
        </div>
      </div>

      {/* Media Gallery */}
      <ListingMediaGallery
        images={images}
        floorPlanUrl={floorPlanUrl}
        videoUrl={videoUrl}
        virtualTourUrl={virtualTourUrl}
        alt={fullAddress}
        badges={
          listing._displayCompliance.comingSoon ? (
            <span className="absolute top-3 left-3 bg-amber-500 text-white text-[11px] font-medium px-3 py-1.5 rounded-full z-10">
              Coming Soon
            </span>
          ) : null
        }
      />

      <main className="py-5 md:py-8 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-3 gap-6 lg:gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-5 divide-y divide-black/5 [&>*]:pt-5 [&>*:first-child]:pt-0">
              {/* Header */}
              <div>
                <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                  <div>
                    <PriceWithCalculator
                      price={listing.listPrice}
                      originalPrice={listing.originalListPrice}
                      isRental={isRental}
                      maintenanceFee={listing.associationFee || 0}
                      monthlyTaxes={listing.taxAnnualAmount ? Math.round(listing.taxAnnualAmount / 12) : 0}
                      propertyType={listing.propertyType}
                    />
                    <p className="text-lg text-brand-dark/95 mt-1">{fullAddress}</p>
                    <p className="text-brand-dark/85">
                      {neighborhood && neighborhood !== borough ? `${neighborhood}, ` : ''}{borough}, NY {listing.address.postalCode}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-block px-3 py-1 bg-brand-gold/10 text-brand-gold-deep text-sm rounded-full">
                      {listing.propertyType === 'Residential' ? (listing.propertySubType || listing.propertyType) : listing.propertyType}
                    </span>
                    {listing.previousListPrice && listing.listPrice < listing.previousListPrice && (
                      <span className="inline-block px-3 py-1 bg-green-50 text-green-700 text-sm font-medium rounded-full">
                        Price Reduced
                      </span>
                    )}
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

                {/* Quick Stats */}
                <div className="flex flex-wrap gap-5 py-3 border-y border-black/5">
                  <div>
                    <span className="text-lg font-display font-semibold">{listing.bedroomsTotal}</span>
                    <span className="text-brand-dark/85 ml-1">Beds</span>
                  </div>
                  <div>
                    <span className="text-lg font-display font-semibold">
                      {listing.bathroomsFull}
                      {listing.bathroomsHalf > 0 && `.${listing.bathroomsHalf}`}
                    </span>
                    <span className="text-brand-dark/85 ml-1">Baths</span>
                  </div>
                  {listing.livingArea && (
                    <div>
                      <span className="text-lg font-display font-semibold">{listing.livingArea.toLocaleString()}</span>
                      <span className="text-brand-dark/85 ml-1">Sq Ft</span>
                    </div>
                  )}
                  {listing.livingArea && listing.listPrice > 0 && (
                    <div>
                      <span className="text-lg font-display font-semibold">${Math.round(listing.listPrice / listing.livingArea).toLocaleString()}</span>
                      <span className="text-brand-dark/85 ml-1">/Sq Ft</span>
                    </div>
                  )}
                  {listing.roomsTotal && (
                    <div>
                      <span className="text-lg font-display font-semibold">{listing.roomsTotal}</span>
                      <span className="text-brand-dark/85 ml-1">Rooms</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              {listing.publicRemarks && (
                <section>
                  <h2 className="text-base font-display font-semibold mb-3">About This Property</h2>
                  <div
                    className="text-brand-dark/90 text-sm leading-relaxed prose prose-sm max-w-none text-justify [&>p]:mb-3 [&>p:last-child]:mb-0"
                    dangerouslySetInnerHTML={{
                      __html: listing.publicRemarks
                        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                        .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
                        .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
                    }}
                  />
                </section>
              )}

              {/* NYC-Specific Info (Co-op/Condo) */}
              {!isRental && (isCoop || isCondo) && (listing.associationFee || listing.taxAnnualAmount) && (
                <section className="glass-card rounded-2xl p-4">
                  <h2 className="text-sm font-display font-semibold mb-2">
                    {isCoop ? 'Co-op Information' : 'Condo Information'}
                  </h2>
                  <div className="grid sm:grid-cols-2 gap-x-6 gap-y-0">
                    {listing.associationFee && (
                      <div className="flex justify-between py-2 border-b border-black/5">
                        <span className="text-brand-dark/85">{isCoop ? 'Maintenance' : 'Common Charges'}</span>
                        <span className="font-medium">
                          ${listing.associationFee.toLocaleString()}/{listing.associationFeeFrequency === 'Monthly' ? 'mo' : listing.associationFeeFrequency || 'mo'}
                        </span>
                      </div>
                    )}
                    {listing.taxAnnualAmount && (
                      <div className="flex justify-between py-2 border-b border-black/5">
                        <span className="text-brand-dark/85">Real Estate Taxes</span>
                        <span className="font-medium">
                          ${Math.round(listing.taxAnnualAmount / 12).toLocaleString()}/mo
                          {listing.taxYear && <span className="text-brand-dark/75 text-xs ml-1">({listing.taxYear})</span>}
                        </span>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Property Details */}
              <section>
                <h2 className="text-base font-display font-semibold mb-3">Property Details</h2>
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-0">
                  <div className="flex justify-between py-2 border-b border-black/5">
                    <span className="text-brand-dark/85">Property Type</span>
                    <span className="font-medium">{listing.propertyType === 'Residential' ? (listing.propertySubType || listing.propertyType) : listing.propertyType}</span>
                  </div>
                  {listing.architecturalStyle && (
                    <div className="flex justify-between py-2 border-b border-black/5">
                      <span className="text-brand-dark/85">Style</span>
                      <span className="font-medium">{listing.architecturalStyle}</span>
                    </div>
                  )}
                  {listing.yearBuilt && (
                    <div className="flex justify-between py-2 border-b border-black/5">
                      <span className="text-brand-dark/85">Year Built</span>
                      <span className="font-medium">{listing.yearBuilt}</span>
                    </div>
                  )}
                  {listing.storiesTotal && (
                    <div className="flex justify-between py-2 border-b border-black/5">
                      <span className="text-brand-dark/85">Stories</span>
                      <span className="font-medium">{listing.storiesTotal}</span>
                    </div>
                  )}
                  {listing.buildingName && (
                    <div className="flex justify-between py-2 border-b border-black/5">
                      <span className="text-brand-dark/85">Building</span>
                      <span className="font-medium">{listing.buildingName}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-2 border-b border-black/5">
                    <span className="text-brand-dark/85">MLS #</span>
                    <span className="font-medium">{listing.mlsId}</span>
                  </div>
                  {listing.onMarketDate && (
                    <div className="flex justify-between py-2 border-b border-black/5">
                      <span className="text-brand-dark/85">Listed</span>
                      <span className="font-medium">{new Date(listing.onMarketDate).toLocaleDateString()}</span>
                    </div>
                  )}
                  {listing.status && (
                    <div className="flex justify-between py-2 border-b border-black/5">
                      <span className="text-brand-dark/85">Status</span>
                      <span className="font-medium">{listing.status}</span>
                    </div>
                  )}
                </div>
              </section>

              {/* Last Closed Price for This Unit */}
              {lastUnitSale && lastUnitSale.closePrice > 0 && (
                <section className="glass-card rounded-2xl p-4">
                  <h2 className="text-sm font-display font-semibold mb-2">
                    Last Sale — This {lastUnitSale.source === 'acris' ? 'Property' : 'Unit'}
                  </h2>
                  <div className="flex flex-wrap items-baseline gap-3">
                    <span className="text-lg font-display font-bold text-brand-dark">
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(lastUnitSale.closePrice)}
                    </span>
                    {lastUnitSale.sqft > 0 && (
                      <span className="text-sm text-brand-dark/70">
                        ${Math.round(lastUnitSale.closePrice / lastUnitSale.sqft).toLocaleString()}/sf
                      </span>
                    )}
                    {lastUnitSale.closeDate && (
                      <span className="text-sm text-brand-dark/60">
                        Closed {new Date(lastUnitSale.closeDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                  {listing.listPrice > 0 && lastUnitSale.closePrice > 0 && (
                    <p className="text-xs text-brand-dark/50 mt-2">
                      {listing.listPrice > lastUnitSale.closePrice
                        ? `Current asking is ${Math.round(((listing.listPrice - lastUnitSale.closePrice) / lastUnitSale.closePrice) * 100)}% above last sale`
                        : listing.listPrice < lastUnitSale.closePrice
                        ? `Current asking is ${Math.round(((lastUnitSale.closePrice - listing.listPrice) / lastUnitSale.closePrice) * 100)}% below last sale`
                        : 'Current asking matches last sale price'}
                    </p>
                  )}
                  {lastUnitSale.source === 'acris' && (
                    <p className="text-[10px] text-brand-dark/40 mt-1">Source: NYC ACRIS Public Records</p>
                  )}
                </section>
              )}

              {/* ── Unit Features ── */}
              {(unitFeatures.length > 0 || unitDetails.length > 0) && (
                <section>
                  <h2 className="text-base font-display font-semibold mb-3">Unit Features</h2>
                  {unitFeatures.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {unitFeatures.map((f) => (
                        <span key={f} className="px-2.5 py-1 bg-black/[0.04] text-brand-dark/80 rounded-md text-xs">
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                  {unitDetails.length > 0 && (
                    <div className="grid sm:grid-cols-2 gap-x-6 gap-y-0 mt-3">
                      {unitDetails.map((item) => (
                        <div key={item.label} className="flex justify-between py-1.5 border-b border-black/5">
                          <span className="text-sm text-brand-dark/70">{item.label}</span>
                          <span className="text-sm font-medium text-brand-dark">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* ── Appliances ── */}
              {appliancesList.length > 0 && (
                <section>
                  <h2 className="text-base font-display font-semibold mb-3">Appliances</h2>
                  <div className="flex flex-wrap gap-1.5">
                    {appliancesList.map((a) => (
                      <span key={a} className="px-2.5 py-1 bg-black/[0.04] text-brand-dark/80 rounded-md text-xs">
                        {a}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {/* ── Building Amenities ── */}
              {buildingAmenitiesFinal.length > 0 && (
                <section>
                  <h2 className="text-base font-display font-semibold mb-3">Building Amenities</h2>
                  <div className="flex flex-wrap gap-1.5">
                    {buildingAmenitiesFinal.map((amenity) => (
                      <span key={amenity} className="px-2.5 py-1 bg-brand-gold/8 text-brand-dark/80 rounded-md text-xs">
                        {amenity}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {/* ── Parking ── */}
              {hasGarage && (
                <section>
                  <h2 className="text-base font-display font-semibold mb-3">Parking</h2>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="px-2.5 py-1 bg-black/[0.04] text-brand-dark/80 rounded-md text-xs">Garage Access</span>
                    {parkingList.filter(v => v !== 'Garage').map((v) => (
                      <span key={v} className="px-2.5 py-1 bg-black/[0.04] text-brand-dark/80 rounded-md text-xs">
                        {formatCamelCase(v)}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {/* ── Pet Policy ── */}
              {petPolicy && (
                <section>
                  <h2 className="text-base font-display font-semibold mb-3">Pet Policy</h2>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium ${
                    petsAllowed ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                  }`}>
                    {petsAllowed ? (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                    {petPolicy}
                  </span>
                </section>
              )}

              {/* Rental-Specific Info */}
              {isRental && (listing.petsAllowed || listing.furnished || listing.availabilityDate) && (
                <section>
                  <h2 className="text-base font-display font-semibold mb-3">Rental Details</h2>
                  <div className="grid sm:grid-cols-2 gap-x-6 gap-y-0">
                    {listing.petsAllowed && (
                      <div className="flex justify-between py-2 border-b border-black/5">
                        <span className="text-brand-dark/85">Pets</span>
                        <span className="font-medium">{listing.petsAllowed}</span>
                      </div>
                    )}
                    {listing.furnished && (
                      <div className="flex justify-between py-2 border-b border-black/5">
                        <span className="text-brand-dark/85">Furnished</span>
                        <span className="font-medium">{listing.furnished}</span>
                      </div>
                    )}
                    {listing.availabilityDate && (
                      <div className="flex justify-between py-2 border-b border-black/5">
                        <span className="text-brand-dark/85">Available</span>
                        <span className="font-medium">{new Date(listing.availabilityDate).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Transit & Commute — only if we have coordinates */}
              {listing.address.latitude && listing.address.longitude && (
                <TransitCommuteTool
                  latitude={listing.address.latitude}
                  longitude={listing.address.longitude}
                  borough={borough}
                />
              )}

              {/* Location Map & Directions */}
              {listing.address.latitude && listing.address.longitude && (
                <ListingLocationMap
                  latitude={listing.address.latitude}
                  longitude={listing.address.longitude}
                  address={fullAddress}
                  borough={borough}
                />
              )}

              {/* Investment Analysis / Calculators */}
              {!isRental && (
                <section>
                  <InvestorCalculator
                    purchasePrice={listing.listPrice}
                    maintenanceFee={listing.associationFee || 0}
                    monthlyTaxes={listing.taxAnnualAmount ? Math.round(listing.taxAnnualAmount / 12) : 0}
                    bedrooms={listing.bedroomsTotal}
                    neighborhood={neighborhood || borough}
                  />
                </section>
              )}
              {isRental && (
                <section>
                  <RentVsBuyCalculator
                    purchasePrice={listing.listPrice * 250}
                    monthlyRent={listing.listPrice}
                    maintenanceFee={0}
                    realEstateTaxes={0}
                    isRental={true}
                  />
                </section>
              )}

              {/* Building Units & Sale History */}
              {listing.address.streetName !== 'Address Undisclosed' && (
                <BuildingUnits
                  streetNumber={listing.address.streetNumber}
                  streetName={listing.address.streetName}
                  postalCode={listing.address.postalCode}
                  currentListingId={listing.id}
                  buildingName={listing.buildingName}
                />
              )}

              {/* Similar Listings Nearby */}
              <SimilarListings
                listingType={listing.listingType}
                beds={listing.bedroomsTotal}
                listPrice={listing.listPrice}
                postalCode={listing.address.postalCode}
                neighborhood={neighborhood}
                currentListingId={listing.id}
              />
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-1">
              <div className="sticky top-24 space-y-6">
                {/* Contact Card */}
                <div className="glass-card rounded-3xl p-6">
                  <h3 className="text-lg font-display font-semibold mb-4">Interested in this property?</h3>

                  <div className="space-y-3">
                    <a
                      href="tel:646-258-4460"
                      className="block w-full text-center px-6 py-3 bg-brand-dark text-white rounded-2xl hover:bg-brand-dark/90 transition-colors"
                    >
                      Contact Mallan Real Estate
                    </a>
                  </div>
                </div>

                {/* Inquiry Form */}
                <InquiryForm
                  listingId={listing.id}
                  listingAddress={fullAddress}
                  agentEmail="info@mallan.nyc"
                />

                {/* Transit Summary */}
                {listing.address.latitude && listing.address.longitude && (
                  <TransitSidebarSummary
                    latitude={listing.address.latitude}
                    longitude={listing.address.longitude}
                  />
                )}

                {/* View More Listings */}
                <div className="glass-card rounded-3xl p-6">
                  <h3 className="text-lg font-display font-semibold mb-4">Find More Properties</h3>
                  <Link
                    href={isRental ? '/rent' : '/buy'}
                    className="inline-block text-sm text-brand-dark/85 hover:text-brand-gold"
                  >
                    View all {isRental ? 'rentals' : 'sales'}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Listing Courtesy Attribution (REBNY compliance) */}
      <section className="border-t border-black/5 py-6 px-4">
        <div className="max-w-7xl mx-auto">
          <p className="text-sm text-brand-dark/85">
            Courtesy of {listing.listAgentFullName || 'Listing Agent'}, {listing.listOfficeName || 'Listing Office'}
          </p>
        </div>
      </section>

      {/* REBNY RLS Disclaimer */}
      <section className="bg-gray-50/50 border-t border-black/5 py-6 px-4">
        <div className="max-w-7xl mx-auto">
          <IDXDisclaimer
            variant="full"
            lastUpdated={listing.modificationTimestamp}
          />
        </div>
      </section>

      <SocialShareBar title={`${fullAddress} | ${formatPrice(listing.listPrice, isRental)}`} />
      <Footer />
    </div>
  );
}
