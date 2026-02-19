'use client';

import Link from 'next/link';
import IDXImage from '@/app/components/IDXImage';
import IDXDisclaimer from '@/app/components/IDXDisclaimer';
import { isDisplayableInIDX } from '@/lib/compliance/idx-display-gate';
import { useSidePanel } from '@/lib/contexts/ListingSidePanelContext';
import { useGsapReveal } from '@/lib/hooks/useGsapReveal';
import listingsData from '@/data/listings.json';
import type { Listing } from '@/lib/types/listing';

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

function ListingCard({ listing }: { listing: Listing }) {
  const { openListing } = useSidePanel();
  const isRental = listing.listingType === 'rent';
  const primaryImage = listing.media.images.find(img => img.isPrimary)?.url || listing.media.images[0]?.url || '/images/listing-placeholder.svg';
  const beds = listing.propertyInfo.bedroomsTotal;
  const baths = listing.propertyInfo.bathroomsFull;
  const halfBaths = listing.propertyInfo.bathroomsHalf;
  const sqft = listing.propertyInfo.aboveGradeFinishedArea;

  return (
    <div
      className="prop-card group cursor-pointer rounded-3xl overflow-hidden bg-white"
      onClick={() => openListing(listing)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openListing(listing); } }}
      aria-label={`View details for ${listing.address.neighborhoodDisplay} listing at ${formatPrice(listing.price.listPrice, isRental)}`}
    >
      {/* Image with liquid hover zoom */}
      <div className="relative overflow-hidden aspect-[4/3] bg-gray-50">
        <IDXImage
          src={primaryImage}
          alt={`${listing.propertyInfo.propertyType} in ${listing.address.neighborhoodDisplay}`}
          aspect="card"
        />
        {/* Hover overlay */}
        <div className="card-overlay absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent flex items-end p-5">
          <span className="text-white text-[13px] font-light tracking-wide">View Details &rarr;</span>
        </div>
        {/* Badge */}
        {listing.flags.isExclusive && (
          <span className="absolute top-4 left-4 glass-card text-brand-dark text-[11px] font-medium px-3.5 py-1.5 rounded-full z-10">
            Exclusive
          </span>
        )}
        {listing.flags.isNewListing && !listing.flags.isExclusive && (
          <span className="absolute top-4 left-4 glass-card text-brand-dark text-[11px] font-medium px-3.5 py-1.5 rounded-full z-10">
            New
          </span>
        )}
      </div>

      {/* Card body */}
      <div className="p-5 md:p-6">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <h3 className="font-display font-semibold text-base md:text-[17px] truncate text-brand-dark">
              {listing.address.neighborhoodDisplay}
            </h3>
            <p className="text-brand-dark/60 text-[13px] font-light">
              {listing.propertyInfo.propertyType}
            </p>
          </div>
          <p className="font-display font-bold text-base md:text-lg whitespace-nowrap text-brand-dark">
            {formatPrice(listing.price.listPrice, isRental)}
          </p>
        </div>
        <p className="text-brand-dark/60 text-[13px] font-light">
          {beds} bd &middot; {baths}{halfBaths > 0 ? `.${halfBaths}` : ''} ba
          {sqft > 0 && ` \u00B7 ${sqft.toLocaleString()} sf`}
        </p>
        {!isRental && listing.nycSpecific.maintenanceFee && (
          <p className="text-brand-dark/50 text-[12px] font-light mt-1">
            {listing.propertyInfo.propertyType === 'Co-op' ? 'Maint' : 'CC'}: ${listing.nycSpecific.maintenanceFee.toLocaleString()}/mo
          </p>
        )}
        {/* REBNY H1/F6: Listing Courtesy attribution required */}
        {listing.agent?.listOfficeName && (
          <p className="text-[10px] text-brand-dark/50 mt-1.5 font-light">
            Listing Courtesy of {listing.agent.listOfficeName}
          </p>
        )}
      </div>
    </div>
  );
}

export default function FeaturedListings() {
  const gridRef = useGsapReveal<HTMLDivElement>({ children: true, y: 50, scale: 0.97 });

  // Get featured listings, prioritizing exclusives and featured flags
  // REBNY RLS: Enforce all 6 distribution gates before displaying
  const listings = (listingsData.listings as unknown as Listing[])
    .filter((l) => l.status === 'active' && isDisplayableInIDX(l))
    .sort((a, b) => {
      if (a.flags.isFeatured && !b.flags.isFeatured) return -1;
      if (!a.flags.isFeatured && b.flags.isFeatured) return 1;
      if (a.flags.isExclusive && !b.flags.isExclusive) return -1;
      if (!a.flags.isExclusive && b.flags.isExclusive) return 1;
      return new Date(b.listing.listingDate).getTime() - new Date(a.listing.listingDate).getTime();
    })
    .slice(0, 6);

  return (
    <section className="px-6 md:px-12 lg:px-20 py-20 md:py-32 lg:py-40">
      <div className="max-w-[1440px] mx-auto">
        {/* Section header — left-aligned */}
        <div className="flex items-end justify-between mb-12 md:mb-16">
          <div>
            <p className="text-brand-gold-deep text-[13px] font-medium mb-2 gold-glow-text">Featured</p>
            <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark">Properties</h2>
          </div>
          <Link href="/buy" className="text-[13px] font-light text-brand-dark/50 hover:text-brand-dark transition-all duration-500 hidden sm:block">
            View All &rarr;
          </Link>
        </div>

        {/* Cards grid */}
        <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7 md:gap-8">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>

        <div className="mt-10 sm:mt-12 text-center sm:hidden">
          <Link
            href="/buy"
            className="text-[13px] font-light text-brand-dark/50 hover:text-brand-dark transition-all duration-500"
          >
            View All &rarr;
          </Link>
        </div>

        {/* REBNY RLS: IDX disclaimer required on any page displaying listing data */}
        <IDXDisclaimer variant="compact" lastUpdated={new Date()} />
      </div>
    </section>
  );
}
