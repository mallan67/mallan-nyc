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

function MediaIcons({ listing }: { listing: Listing }) {
  const imageCount = listing.media.images.length;
  const hasFloorPlan = !!listing.media.floorPlanUrl;
  const hasVideo = !!listing.media.videoUrl;
  const has3D = !!listing.media.virtualTourUrl;

  return (
    <div className="absolute bottom-3 right-3 flex gap-1.5 z-10">
      {imageCount > 0 && (
        <span className="flex items-center gap-1 bg-black/60 backdrop-blur-sm text-white text-[11px] px-2 py-1 rounded-lg">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          {imageCount}
        </span>
      )}
      {hasFloorPlan && (
        <span className="flex items-center bg-black/60 backdrop-blur-sm text-white text-[11px] px-2 py-1 rounded-lg" title="Floor Plan">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" /></svg>
        </span>
      )}
      {hasVideo && (
        <span className="flex items-center bg-black/60 backdrop-blur-sm text-white text-[11px] px-2 py-1 rounded-lg" title="Video Tour">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
        </span>
      )}
      {has3D && (
        <span className="flex items-center bg-black/60 backdrop-blur-sm text-white text-[11px] px-2 py-1 rounded-lg" title="3D Tour">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
        </span>
      )}
    </div>
  );
}

function QuickCalcInsight({ listing }: { listing: Listing }) {
  const isRental = listing.listingType === 'rent';
  const price = listing.price.listPrice;

  if (!isRental) {
    // Mortgage estimate: 20% down, 6.5% rate, 30yr
    const loanAmount = price * 0.8;
    const monthlyRate = 0.065 / 12;
    const payments = 360;
    const monthlyPayment = Math.round(
      (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, payments)) /
      (Math.pow(1 + monthlyRate, payments) - 1)
    );
    const closingCosts = Math.round(price * 0.03);

    return (
      <div className="mt-3 pt-3 border-t border-black/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] text-brand-dark/50">
            <svg className="w-3.5 h-3.5 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span>Est. <strong className="text-brand-dark/70">${monthlyPayment.toLocaleString()}/mo</strong> · Closing ~${(closingCosts / 1000).toFixed(0)}K</span>
          </div>
        </div>
      </div>
    );
  }

  // Rental: equivalent purchase price insight
  const annualRent = price * 12;
  const equivalentBuy = Math.round(annualRent / 0.05);

  return (
    <div className="mt-3 pt-3 border-t border-black/5">
      <div className="flex items-center gap-1.5 text-[11px] text-brand-dark/50">
        <svg className="w-3.5 h-3.5 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>
        <span>Rent vs Buy: own equivalent ~${(equivalentBuy / 1000000).toFixed(1)}M</span>
      </div>
    </div>
  );
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
        {/* Media type icons */}
        <MediaIcons listing={listing} />
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
        {/* Quick calculator insight */}
        <QuickCalcInsight listing={listing} />
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
