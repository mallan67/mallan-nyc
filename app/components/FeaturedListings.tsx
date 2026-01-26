'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
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
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const isRental = listing.listingType === 'rent';
  const primaryImage = listing.media.images.find(img => img.isPrimary)?.url || listing.media.images[0]?.url || '/images/listing-placeholder.jpg';
  const beds = listing.propertyInfo.bedroomsTotal;
  const baths = listing.propertyInfo.bathroomsFull;
  const halfBaths = listing.propertyInfo.bathroomsHalf;
  const sqft = listing.propertyInfo.aboveGradeFinishedArea;

  return (
    <Link href={`/listing/${listing.id}`} className="block">
      {/* Fixed aspect ratio container prevents layout shift */}
      <div className="relative aspect-[4/3] overflow-hidden rounded-sm bg-gray-100">
        {/* Skeleton placeholder shown until image loads */}
        {!imageLoaded && !imageError && (
          <div className="absolute inset-0 bg-gray-100 animate-pulse" />
        )}
        <Image
          src={imageError ? '/images/listing-placeholder.jpg' : primaryImage}
          alt={`${listing.propertyInfo.propertyType} in ${listing.address.neighborhoodDisplay}`}
          fill
          className={`object-cover transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          sizes="(max-width: 475px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 16vw"
          onLoad={() => setImageLoaded(true)}
          onError={() => {
            setImageError(true);
            setImageLoaded(true);
          }}
        />
        {listing.flags.isExclusive && (
          <span className="absolute top-3 left-3 bg-brand-gold text-white text-xs px-3 py-1.5 font-sans rounded shadow-lg z-10">
            Exclusive
          </span>
        )}
        {listing.flags.isNewListing && !listing.flags.isExclusive && (
          <span className="absolute top-3 left-3 bg-brand-dark text-white text-xs px-3 py-1.5 font-sans rounded shadow-lg z-10">
            New
          </span>
        )}
      </div>
      {/* Text container with fixed min heights to prevent layout shift */}
      <div className="mt-3">
        <p className="text-lg font-sans font-medium min-h-[1.75rem]">
          {formatPrice(listing.price.listPrice, isRental)}
        </p>
        <p className="text-sm text-gray-600 font-sans min-h-[1.25rem]">
          {listing.propertyInfo.propertyType}, {listing.address.neighborhoodDisplay}
        </p>
        <p className="text-xs text-gray-500 mt-1 min-h-[1rem]">
          {beds} bed · {baths}{halfBaths > 0 ? `.${halfBaths}` : ''} bath
          {sqft > 0 && ` · ${sqft.toLocaleString()} sqft`}
        </p>
        {!isRental && listing.nycSpecific.maintenanceFee && (
          <p className="text-xs text-gray-400 mt-1 min-h-[1rem]">
            {listing.propertyInfo.propertyType === 'Co-op' ? 'Maint' : 'CC'}: ${listing.nycSpecific.maintenanceFee.toLocaleString()}/mo
          </p>
        )}
      </div>
    </Link>
  );
}

export default function FeaturedListings() {
  // Get featured listings, prioritizing exclusives and featured flags
  const listings = (listingsData.listings as Listing[])
    .filter((l) => l.status === 'active')
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
    <section className="py-8 sm:py-12 md:py-16 px-4 bg-white">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-2xl sm:text-3xl font-sans mb-6 sm:mb-8">Featured Listings</h2>
        <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 sm:gap-6">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
        <div className="mt-8 sm:mt-10 text-center">
          <Link
            href="/buy"
            className="inline-block px-6 sm:px-8 py-2 sm:py-3 bg-black text-white font-bold rounded hover:bg-black/80 transition-colors text-sm sm:text-base"
          >
            View All Listings
          </Link>
        </div>
      </div>
    </section>
  );
}
