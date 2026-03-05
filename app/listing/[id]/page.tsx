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
import SocialShareBar from '@/app/components/SocialShareBar';
import TransitCommuteTool from '@/app/components/TransitCommuteTool';
import TransitSidebarSummary from '@/app/components/TransitSidebarSummary';
import PublicRecordsPanel from '@/app/components/PublicRecordsPanel';
import { fetchSingleListing, fetchListingMedia, fetchListingByAddress } from '@/lib/idx/fetch';
import { checkDistributionGates } from '@/lib/idx/trestle-mapper';
import { mapRESOToInternal, generateAttributionText } from '@/lib/idx/mapping';
import { toPublicDTO, type PublicListingDTO } from '@/lib/idx/public-dto';
import { isMlsIdSlug, extractMlsIdFromSlug, parseAddressSlug, generateListingSlug } from '@/lib/listing-slug';
import { cache } from 'react';

// Dynamic — listings come from IDX, not static JSON
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
 */
async function rawToDTO(raw: Record<string, unknown>, debugId: string): Promise<PublicListingDTO | null> {
  const gateResult = checkDistributionGates(raw);
  if (!gateResult.displayable) return null;

  const listing = mapRESOToInternal(raw);
  if (!listing) return null;

  const dto = toPublicDTO(listing);

  // If no media from $expand=Media, fetch from Trestle Media resource
  if (dto.media.length === 0) {
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
    }
  }

  return dto;
}

/**
 * Fetch a single listing from IDX (Trestle).
 * Supports three resolution strategies:
 *   1. Direct ListingId/key (via ?key= param or MLS-ID slug)
 *   2. Address slug → parsed → Trestle address search
 *   3. Raw [id] segment treated as ListingId
 *
 * COMPLIANCE: Address slugs are NEVER generated for listings where
 * InternetAddressDisplayYN=false. Those use MLS-ID slugs instead,
 * preventing address leakage through URLs.
 */
const fetchListing = cache(async function fetchListing(slug: string, keyOverride?: string): Promise<PublicListingDTO | null> {
  const useIDX = process.env.IDX_ENABLED === 'true';
  if (!useIDX) return null;

  try {
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
        // An address-based URL for a suppressed listing means someone is trying
        // to access it by guessing the address — return null (404).
        if (raw.InternetAddressDisplayYN === false) return null;

        const dto = await rawToDTO(raw, slug);
        if (dto) return dto;
      }
    }

    // Strategy 4: Treat slug as raw ListingId (backwards compatibility)
    const raw = await fetchSingleListing(slug);
    if (raw) return rawToDTO(raw, slug);

    return null;
  } catch (err) {
    console.error(`[/listing/${slug}] IDX fetch error:`, err);
    return null;
  }
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

  // Trestle returns mediaType as "Jpeg", "Png", etc. — accept all image types
  const videoTypes = new Set(['video', 'mpeg', 'mp4', 'avi']);
  const images = listing.media
    .filter((m) => !videoTypes.has((m.mediaType || '').toLowerCase()))
    .sort((a, b) => a.order - b.order)
    .map((m) => ({ url: m.url }));

  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <Header dark />

      {/* Breadcrumb + Back */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-black/5 pt-20">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <nav className="flex items-center gap-2 text-sm text-brand-dark/50">
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
        floorPlanUrl={null}
        videoUrl={null}
        virtualTourUrl={listing.virtualTourURL || null}
        alt={fullAddress}
        badges={
          listing._displayCompliance.comingSoon ? (
            <span className="absolute top-3 left-3 bg-amber-500 text-white text-[11px] font-medium px-3 py-1.5 rounded-full z-10">
              Coming Soon
            </span>
          ) : null
        }
      />

      <main className="py-8 md:py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-3 gap-8 lg:gap-12">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-8">
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
                    <p className="text-xl text-brand-dark/70 mt-2">{fullAddress}</p>
                    <p className="text-brand-dark/50">
                      {neighborhood ? `${neighborhood}, ` : ''}{borough}, NY {listing.address.postalCode}
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
                    <ShareButton title={`${fullAddress} | ${formatPrice(listing.listPrice, isRental)}`} />
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="flex flex-wrap gap-6 py-4 border-y border-black/5">
                  <div>
                    <span className="text-xl font-display font-semibold">{listing.bedroomsTotal}</span>
                    <span className="text-brand-dark/50 ml-1">Beds</span>
                  </div>
                  <div>
                    <span className="text-xl font-display font-semibold">
                      {listing.bathroomsFull}
                      {listing.bathroomsHalf > 0 && `.${listing.bathroomsHalf}`}
                    </span>
                    <span className="text-brand-dark/50 ml-1">Baths</span>
                  </div>
                  {listing.livingArea && (
                    <div>
                      <span className="text-xl font-display font-semibold">{listing.livingArea.toLocaleString()}</span>
                      <span className="text-brand-dark/50 ml-1">Sq Ft</span>
                    </div>
                  )}
                  {listing.livingArea && listing.listPrice > 0 && (
                    <div>
                      <span className="text-xl font-display font-semibold">${Math.round(listing.listPrice / listing.livingArea).toLocaleString()}</span>
                      <span className="text-brand-dark/50 ml-1">/Sq Ft</span>
                    </div>
                  )}
                  {listing.roomsTotal && (
                    <div>
                      <span className="text-xl font-display font-semibold">{listing.roomsTotal}</span>
                      <span className="text-brand-dark/50 ml-1">Rooms</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              {listing.publicRemarks && (
                <section>
                  <h2 className="text-xl font-display font-semibold mb-4">About This Property</h2>
                  <p className="text-brand-dark/70 leading-relaxed whitespace-pre-line">
                    {listing.publicRemarks}
                  </p>
                </section>
              )}

              {/* NYC-Specific Info (Co-op/Condo) */}
              {!isRental && (isCoop || isCondo) && (listing.associationFee || listing.taxAnnualAmount) && (
                <section className="glass-card rounded-3xl p-6">
                  <h2 className="text-xl font-display font-semibold mb-4">
                    {isCoop ? 'Co-op Information' : 'Condo Information'}
                  </h2>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {listing.associationFee && (
                      <div className="flex justify-between py-2 border-b border-black/5">
                        <span className="text-brand-dark/50">{isCoop ? 'Maintenance' : 'Common Charges'}</span>
                        <span className="font-medium">
                          ${listing.associationFee.toLocaleString()}/{listing.associationFeeFrequency === 'Monthly' ? 'mo' : listing.associationFeeFrequency || 'mo'}
                        </span>
                      </div>
                    )}
                    {listing.taxAnnualAmount && (
                      <div className="flex justify-between py-2 border-b border-black/5">
                        <span className="text-brand-dark/50">Real Estate Taxes</span>
                        <span className="font-medium">
                          ${Math.round(listing.taxAnnualAmount / 12).toLocaleString()}/mo
                          {listing.taxYear && <span className="text-brand-dark/40 text-xs ml-1">({listing.taxYear})</span>}
                        </span>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Property Details */}
              <section>
                <h2 className="text-xl font-display font-semibold mb-4">Property Details</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="flex justify-between py-2 border-b border-black/5">
                    <span className="text-brand-dark/50">Property Type</span>
                    <span className="font-medium">{listing.propertySubType || listing.propertyType}</span>
                  </div>
                  {listing.architecturalStyle && (
                    <div className="flex justify-between py-2 border-b border-black/5">
                      <span className="text-brand-dark/50">Style</span>
                      <span className="font-medium">{listing.architecturalStyle}</span>
                    </div>
                  )}
                  {listing.yearBuilt && (
                    <div className="flex justify-between py-2 border-b border-black/5">
                      <span className="text-brand-dark/50">Year Built</span>
                      <span className="font-medium">{listing.yearBuilt}</span>
                    </div>
                  )}
                  {listing.storiesTotal && (
                    <div className="flex justify-between py-2 border-b border-black/5">
                      <span className="text-brand-dark/50">Stories</span>
                      <span className="font-medium">{listing.storiesTotal}</span>
                    </div>
                  )}
                  {listing.buildingName && (
                    <div className="flex justify-between py-2 border-b border-black/5">
                      <span className="text-brand-dark/50">Building</span>
                      <span className="font-medium">{listing.buildingName}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-2 border-b border-black/5">
                    <span className="text-brand-dark/50">MLS #</span>
                    <span className="font-medium">{listing.mlsId}</span>
                  </div>
                  {listing.onMarketDate && (
                    <div className="flex justify-between py-2 border-b border-black/5">
                      <span className="text-brand-dark/50">Listed</span>
                      <span className="font-medium">{new Date(listing.onMarketDate).toLocaleDateString()}</span>
                    </div>
                  )}
                  {listing.status && (
                    <div className="flex justify-between py-2 border-b border-black/5">
                      <span className="text-brand-dark/50">Status</span>
                      <span className="font-medium">{listing.status}</span>
                    </div>
                  )}
                </div>
              </section>

              {/* Rental-Specific Info */}
              {isRental && (listing.petsAllowed || listing.furnished || listing.availabilityDate) && (
                <section>
                  <h2 className="text-xl font-display font-semibold mb-4">Rental Details</h2>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {listing.petsAllowed && (
                      <div className="flex justify-between py-2 border-b border-black/5">
                        <span className="text-brand-dark/50">Pets</span>
                        <span className="font-medium">{listing.petsAllowed}</span>
                      </div>
                    )}
                    {listing.furnished && (
                      <div className="flex justify-between py-2 border-b border-black/5">
                        <span className="text-brand-dark/50">Furnished</span>
                        <span className="font-medium">{listing.furnished}</span>
                      </div>
                    )}
                    {listing.availabilityDate && (
                      <div className="flex justify-between py-2 border-b border-black/5">
                        <span className="text-brand-dark/50">Available</span>
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
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-1">
              <div className="sticky top-24 space-y-6">
                {/* Contact Card */}
                <div className="glass-card rounded-3xl p-6">
                  <h3 className="text-lg font-display font-semibold mb-4">Interested in this property?</h3>

                  <div className="mb-6">
                    <p className="text-sm text-brand-dark/50 mb-1">Listed by</p>
                    <p className="font-display font-semibold text-lg">{listing.listAgentFullName || listing.listOfficeName}</p>
                    <p className="text-brand-dark/60">{listing.listOfficeName}</p>
                    {/* REBNY COMPLIANCE: Agent PII (email, phone) is NOT in PublicListingDTO.
                       Contact goes through Mallan Real Estate inquiry form below. */}
                  </div>

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
                    className="inline-block text-sm text-brand-dark/50 hover:text-brand-gold"
                  >
                    View all {isRental ? 'rentals' : 'sales'}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

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
