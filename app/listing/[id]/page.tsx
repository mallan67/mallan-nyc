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

// Dynamic — listings come from IDX, not static JSON
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Fetch last closed sale for a specific unit from Trestle */
async function fetchLastUnitSale(
  streetNumber: string,
  streetName: string,
  unitNumber: string | null,
  postalCode: string,
): Promise<{ closePrice: number; closeDate: string; sqft: number } | null> {
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
    };
  } catch {
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

/**
 * Resolve a raw Trestle record → PublicListingDTO with media.
 * Always fetches media separately (we no longer use $expand=Media).
 */
async function rawToDTO(raw: Record<string, unknown>, debugId: string): Promise<PublicListingDTO | null> {
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

  return dto;
}

/**
 * Fetch from Trestle directly (server-side). Returns null on any failure.
 */
async function fetchFromTrestleDirect(slug: string, keyOverride?: string): Promise<PublicListingDTO | null> {
  // Strategy 1: Explicit key override (?key= param)
  if (keyOverride) {
    const raw = await fetchSingleListing(keyOverride);
    if (raw) return rawToDTO(raw, keyOverride);
  }

  // Strategy 2: MLS-ID slug (e.g., "listing-RBNY-12345678")
  if (isMlsIdSlug(slug)) {
    const mlsId = extractMlsIdFromSlug(slug);
    if (mlsId) {
      const raw = await fetchSingleListing(mlsId);
      if (raw) return rawToDTO(raw, mlsId);
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
      const dto = await rawToDTO(raw, slug);
      if (dto) return dto;
    }
  }

  // Strategy 4: Treat slug as raw ListingId (backwards compatibility)
  const raw = await fetchSingleListing(slug);
  if (raw) return rawToDTO(raw, slug);

  return null;
}

/**
 * Fallback: fetch from our own /api/listings/:id endpoint.
 * This has its own local JSON fallback and won't fail if Trestle is down.
 */
async function fetchFromApiEndpoint(listingId: string): Promise<PublicListingDTO | null> {
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
    return data.listing as PublicListingDTO;
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
const fetchListing = cache(async function fetchListing(slug: string, keyOverride?: string): Promise<PublicListingDTO | null> {
  const useIDX = process.env.IDX_ENABLED === 'true';

  // Primary: direct Trestle fetch
  if (useIDX) {
    try {
      const dto = await fetchFromTrestleDirect(slug, keyOverride);
      if (dto) return dto;
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
  const listing = await fetchListing(id, key);

  if (!listing) {
    return { title: 'Listing Not Found | Mallan Real Estate' };
  }

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
  const listing = await fetchListing(id, key);

  if (!listing) {
    notFound();
  }

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
  const lastUnitSale = listing.address.streetName !== 'Address Undisclosed'
    ? await fetchLastUnitSale(
        listing.address.streetNumber,
        listing.address.streetName,
        listing.address.unitNumber,
        listing.address.postalCode,
      )
    : null;

  // Building amenities as gold pills
  const buildingAmenities: string[] = [
    ...(listing.associationAmenities ? parseTrestleList(listing.associationAmenities) : []),
    ...(listing.communityFeatures ? parseTrestleList(listing.communityFeatures) : []),
  ];
  // Security features as green pills
  const securityFeatures: string[] = listing.securityFeatures ? parseTrestleList(listing.securityFeatures) : [];
  // Interior details as 2-col grid rows
  const interiorDetails: { label: string; value: string }[] = [];
  if (listing.flooring) interiorDetails.push({ label: 'Flooring', value: parseTrestleList(listing.flooring).join(', ') });
  if (listing.laundryFeatures) interiorDetails.push({ label: 'Laundry', value: parseTrestleList(listing.laundryFeatures).join(', ') });
  if (listing.heating) interiorDetails.push({ label: 'Heating', value: parseTrestleList(listing.heating).join(', ') });
  if (listing.cooling) interiorDetails.push({ label: 'Cooling', value: parseTrestleList(listing.cooling).join(', ') });
  if (listing.parkingFeatures) interiorDetails.push({ label: 'Parking', value: parseTrestleList(listing.parkingFeatures).join(', ') });
  // Appliances as gold pills
  const appliancesList: string[] = listing.appliances ? parseTrestleList(listing.appliances) : [];
  // Interior features as gold pills
  const interiorFeaturesList: string[] = listing.interiorFeatures ? parseTrestleList(listing.interiorFeatures) : [];
  // Pet policy
  const petPolicy = listing.petsAllowedDetail ? parseTrestleList(listing.petsAllowedDetail).join(', ') : '';
  const petsAllowed = petPolicy && !petPolicy.toLowerCase().includes('no');

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
            <div className="lg:col-span-2 space-y-5">
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
                      {listing.propertySubType || listing.propertyType}
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
                    className="text-brand-dark/95 leading-relaxed prose prose-sm max-w-none [&>p]:mb-3 [&>p:last-child]:mb-0"
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
                    <span className="font-medium">{listing.propertySubType || listing.propertyType}</span>
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
                  <h2 className="text-sm font-display font-semibold mb-2">Last Sale — This Unit</h2>
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
                </section>
              )}

              {/* Interior Features */}
              {(interiorDetails.length > 0 || appliancesList.length > 0 || interiorFeaturesList.length > 0) && (
                <section>
                  <h2 className="text-base font-display font-semibold mb-3">Interior Features</h2>
                  {interiorDetails.length > 0 && (
                    <div className="grid sm:grid-cols-2 gap-x-6 gap-y-0 mb-3">
                      {interiorDetails.map((item) => (
                        <div key={item.label} className="flex justify-between py-2 border-b border-black/5">
                          <span className="text-brand-dark/60">{item.label}</span>
                          <span className="font-medium">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {interiorFeaturesList.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {interiorFeaturesList.map((f) => (
                        <span key={f} className="px-3 py-1.5 bg-brand-gold/10 text-brand-gold-deep rounded-full text-sm">
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                  {appliancesList.length > 0 && (
                    <div className="mt-3">
                      <p className="text-sm text-brand-dark/50 mb-2">Appliances</p>
                      <div className="flex flex-wrap gap-2">
                        {appliancesList.map((a) => (
                          <span key={a} className="px-3 py-1.5 bg-brand-gold/10 text-brand-gold-deep rounded-full text-sm">
                            {a}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}

              {/* Building Amenities */}
              {(buildingAmenities.length > 0 || securityFeatures.length > 0 || petPolicy) && (
                <section>
                  <h2 className="text-base font-display font-semibold mb-3">Building Amenities</h2>
                  <div className="flex flex-wrap gap-2">
                    {buildingAmenities.map((amenity) => (
                      <span key={amenity} className="px-4 py-2 bg-brand-gold/10 text-brand-gold-deep rounded-full text-sm">
                        {amenity}
                      </span>
                    ))}
                    {securityFeatures.map((item) => (
                      <span key={item} className="px-4 py-2 bg-green-50 text-green-700 rounded-full text-sm">
                        {item}
                      </span>
                    ))}
                    {petPolicy && (
                      <span className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium ${
                        petsAllowed ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                      }`}>
                        {petsAllowed ? (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                        Pets: {petPolicy}
                      </span>
                    )}
                  </div>
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

                {/* Calculators */}
                {!isRental && (
                  <InvestorCalculator
                    purchasePrice={listing.listPrice}
                    maintenanceFee={listing.associationFee || 0}
                    monthlyTaxes={listing.taxAnnualAmount ? Math.round(listing.taxAnnualAmount / 12) : 0}
                    bedrooms={listing.bedroomsTotal}
                    neighborhood={neighborhood || borough}
                  />
                )}

                {isRental && (
                  <RentVsBuyCalculator
                    purchasePrice={listing.listPrice * 250}
                    monthlyRent={listing.listPrice}
                    maintenanceFee={0}
                    realEstateTaxes={0}
                    isRental={true}
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
