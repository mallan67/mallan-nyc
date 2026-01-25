'use client';

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

function ListingCard({ listing }: { listing: Listing }) {
  const isRental = listing.listingType === 'rent';
  const primaryImage = listing.media.images.find(img => img.isPrimary)?.url || listing.media.images[0]?.url || '/images/listing-placeholder.jpg';
  const beds = listing.propertyInfo.bedroomsTotal;
  const baths = listing.propertyInfo.bathroomsFull;
  const halfBaths = listing.propertyInfo.bathroomsHalf;
  const sqft = listing.propertyInfo.aboveGradeFinishedArea;

  return (
    <Link href={`/listing/${listing.id}`} className="group block">
      <div className="relative aspect-[4/3] overflow-hidden rounded-sm bg-gray-200">
        <Image
          src={primaryImage}
          alt={`${listing.propertyInfo.propertyType} in ${listing.address.neighborhoodDisplay}`}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 16vw"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.src = '/images/listing-placeholder.jpg';
          }}
        />
        {listing.flags.isExclusive && (
          <span className="absolute top-3 left-3 bg-brand-gold text-white text-xs px-3 py-1.5 font-serif rounded shadow-lg">
            Exclusive
          </span>
        )}
        {listing.flags.isNewListing && !listing.flags.isExclusive && (
          <span className="absolute top-3 left-3 bg-brand-dark text-white text-xs px-3 py-1.5 font-serif rounded shadow-lg">
            New
          </span>
        )}
      </div>
      <div className="mt-3">
        <p className="text-lg font-serif font-medium">
          {formatPrice(listing.price.listPrice, isRental)}
        </p>
        <p className="text-sm text-gray-600 font-serif">
          {listing.propertyInfo.propertyType}, {listing.address.neighborhoodDisplay}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          {beds} bed · {baths}{halfBaths > 0 ? `.${halfBaths}` : ''} bath
          {sqft > 0 && ` · ${sqft.toLocaleString()} sqft`}
        </p>
        {!isRental && listing.nycSpecific.maintenanceFee && (
          <p className="text-xs text-gray-400 mt-1">
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
        <h2 className="text-2xl sm:text-3xl font-serif mb-6 sm:mb-8">Featured Listings</h2>
        <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 sm:gap-6">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
        <div className="mt-8 sm:mt-10 text-center">
          <Link
            href="/buy"
            className="inline-block px-6 sm:px-8 py-2 sm:py-3 border border-brand-dark text-brand-dark font-serif hover:bg-brand-dark hover:text-white transition-colors text-sm sm:text-base"
          >
            View All Listings
          </Link>
        </div>
      </div>
    </section>
  );
}
