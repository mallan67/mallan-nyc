'use client';

import Link from 'next/link';
import IDXImage from '@/app/components/IDXImage';
import IDXDisclaimer from '@/app/components/IDXDisclaimer';
import { isDisplayableInIDX } from '@/lib/compliance/idx-display-gate';
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

/*
  FLICKER FIX:
  1. Added explicit aspect ratio container with bg-gray-100 skeleton
  2. Image uses loading state to fade in smoothly (no FOUC)
  3. Fixed text heights with min-h to prevent layout shift
  4. Removed CSS animations that trigger repaint
*/

function ListingCard({ listing }: { listing: Listing }) {
  const isRental = listing.listingType === 'rent';
  const primaryImage = listing.media.images.find(img => img.isPrimary)?.url || listing.media.images[0]?.url || '/images/listing-placeholder.svg';
  const beds = listing.propertyInfo.bedroomsTotal;
  const baths = listing.propertyInfo.bathroomsFull;
  const halfBaths = listing.propertyInfo.bathroomsHalf;
  const sqft = listing.propertyInfo.aboveGradeFinishedArea;

  return (
    <Link href={`/listing/${listing.id}`} className="block">
      {/* IDXImage: native <img> for IDX (exclusives) + R2 (all other) photos */}
      <div className="relative rounded-sm">
        <IDXImage
          src={primaryImage}
          alt={`${listing.propertyInfo.propertyType} in ${listing.address.neighborhoodDisplay}`}
          aspect="card"
        />
        {listing.flags.isExclusive && (
          <span className="absolute top-3 left-3 bg-black text-white text-xs px-3 py-1.5 font-sans rounded shadow-lg z-10">
            Exclusive
          </span>
        )}
        {listing.flags.isNewListing && !listing.flags.isExclusive && (
          <span className="absolute top-3 left-3 bg-black text-white text-xs px-3 py-1.5 font-sans rounded shadow-lg z-10">
            New
          </span>
        )}
      </div>
      {/* Text container with fixed min heights to prevent layout shift */}
      <div className="mt-3">
        <p className="text-xl font-sans font-bold min-h-[1.75rem] text-gray-900">
          {formatPrice(listing.price.listPrice, isRental)}
        </p>
        <p className="text-sm text-gray-700 font-sans font-medium min-h-[1.25rem]">
          {listing.propertyInfo.propertyType}, {listing.address.neighborhoodDisplay}
        </p>
        <p className="text-xs text-gray-600 mt-1 min-h-[1rem]">
          {beds} bed · {baths}{halfBaths > 0 ? `.${halfBaths}` : ''} bath
          {sqft > 0 && ` · ${sqft.toLocaleString()} sqft`}
        </p>
        {!isRental && listing.nycSpecific.maintenanceFee && (
          <p className="text-xs text-gray-500 mt-1 min-h-[1rem]">
            {listing.propertyInfo.propertyType === 'Co-op' ? 'Maint' : 'CC'}: ${listing.nycSpecific.maintenanceFee.toLocaleString()}/mo
          </p>
        )}
        {/* REBNY H1/F6: Listing Courtesy attribution required */}
        {listing.agent?.listOfficeName && (
          <p className="text-[10px] text-gray-400 mt-1.5">
            Listing Courtesy of {listing.agent.listOfficeName}
          </p>
        )}
      </div>
    </Link>
  );
}

export default function FeaturedListings() {
  // Get featured listings, prioritizing exclusives and featured flags
  // REBNY RLS: Enforce all 6 distribution gates before displaying
  const listings = (listingsData.listings as unknown as Listing[])
    .filter((l) => l.status === 'active' && isDisplayableInIDX(l))
    .sort((a, b) => {
      // Featured first
      if (a.flags.isFeatured && !b.flags.isFeatured) return -1;
      if (!a.flags.isFeatured && b.flags.isFeatured) return 1;
      // Then exclusives
      if (a.flags.isExclusive && !b.flags.isExclusive) return -1;
      if (!a.flags.isExclusive && b.flags.isExclusive) return 1;
      // Then by date
      return new Date(b.listing.listingDate).getTime() - new Date(a.listing.listingDate).getTime();
    })
    .slice(0, 6);

  return (
    <section className="py-12 sm:py-16 md:py-20 px-4 bg-white">
      <div className="max-w-7xl mx-auto">
        {/* Section header with bold styling */}
        <div className="text-center mb-8 sm:mb-10">
          <h2 className="text-lg sm:text-xl md:text-2xl font-sans font-bold tracking-tight text-gray-900">
            Featured Listings
          </h2>
          <p className="mt-2 text-sm sm:text-base text-gray-500">
            Handpicked properties across New York City
          </p>
        </div>
        <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
        <div className="mt-10 sm:mt-12 text-center">
          <Link
            href="/buy"
            className="inline-block px-10 py-3.5 bg-gray-900 text-white font-bold rounded-lg hover:bg-gray-800 shadow-md hover:shadow-lg transition-all text-sm sm:text-base tracking-wide"
          >
            View All Listings
          </Link>
        </div>
        {/* REBNY RLS: IDX disclaimer required on any page displaying listing data */}
        <IDXDisclaimer variant="compact" />
      </div>
    </section>
  );
}
