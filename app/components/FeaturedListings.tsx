'use client';

import Link from 'next/link';
import IDXDisclaimer from '@/app/components/IDXDisclaimer';
import { isDisplayableInIDX } from '@/lib/compliance/idx-display-gate';
import listingsData from '@/data/listings.json';
import type { Listing } from '@/lib/types/listing';

function formatPrice(price: number, isRental: boolean): string {
  if (isRental) return `$${price.toLocaleString()}/mo`;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price);
}

function ListingCard({ listing }: { listing: Listing }) {
  const isRental = listing.listingType === 'rent';
  const src =
    listing.media.images.find(img => img.isPrimary)?.url ||
    listing.media.images[0]?.url ||
    '';
  const beds = listing.propertyInfo.bedroomsTotal;
  const baths = listing.propertyInfo.bathroomsFull;
  const halfBaths = listing.propertyInfo.bathroomsHalf;
  const sqft = listing.propertyInfo.aboveGradeFinishedArea;

  return (
    <Link
      href={`/listing/${listing.id}`}
      className="group block"
    >
      {/* Photo */}
      <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-gray-100 mb-3">
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={`${listing.propertyInfo.propertyType} in ${listing.address.neighborhoodDisplay}`}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            loading="lazy"
          />
        )}
        {listing.flags.isExclusive && (
          <span className="absolute top-3 left-3 z-10 bg-gray-900 text-white text-[10px] px-2.5 py-1 font-semibold tracking-wider uppercase rounded">
            Exclusive
          </span>
        )}
        {listing.flags.isNewListing && !listing.flags.isExclusive && (
          <span className="absolute top-3 left-3 z-10 bg-white text-gray-900 text-[10px] px-2.5 py-1 font-semibold tracking-wider uppercase rounded shadow-sm">
            New
          </span>
        )}
      </div>
      {/* Info */}
      <p className="text-lg font-bold text-gray-900 leading-tight">
        {formatPrice(listing.price.listPrice, isRental)}
      </p>
      <p className="text-sm text-gray-500 mt-0.5">
        {listing.address.neighborhoodDisplay} &middot; {beds}bd {baths}{halfBaths > 0 ? `.${halfBaths}` : ''}ba
        {sqft > 0 && ` · ${sqft.toLocaleString()}sf`}
      </p>
      <p className="text-xs text-gray-400 mt-0.5 uppercase tracking-wide">
        {isRental ? 'Rental' : 'For Sale'}
      </p>
    </Link>
  );
}

export default function FeaturedListings() {
  const listings = (listingsData.listings as unknown as Listing[])
    .filter((l) => l.status === 'active' && isDisplayableInIDX(l))
    .sort((a, b) => {
      if (a.flags.isFeatured && !b.flags.isFeatured) return -1;
      if (!a.flags.isFeatured && b.flags.isFeatured) return 1;
      if (a.flags.isExclusive && !b.flags.isExclusive) return -1;
      if (!a.flags.isExclusive && b.flags.isExclusive) return 1;
      return new Date(b.listing.listingDate).getTime() - new Date(a.listing.listingDate).getTime();
    })
    .slice(0, 12);

  return (
    <section className="py-16 sm:py-20 md:py-24 px-4">
      <div className="max-w-7xl mx-auto">

        {/* Section header */}
        <div className="flex items-end justify-between gap-3 mb-10">
          <h2 className="font-display text-3xl sm:text-4xl tracking-tight text-gray-900 leading-none">
            Featured Listings
          </h2>
          <Link
            href="/buy"
            className="text-sm font-medium text-gray-400 hover:text-gray-900 transition-colors whitespace-nowrap"
          >
            View all →
          </Link>
        </div>

        {/* Mobile: horizontal scroll | Desktop: grid */}
        <div className="sm:hidden -mx-4 overflow-x-auto snap-x snap-mandatory" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <div className="inline-flex gap-5 px-4 pb-4">
            {listings.map((listing) => (
              <div key={listing.id} className="flex-shrink-0 w-[260px] snap-start">
                <ListingCard listing={listing} />
              </div>
            ))}
          </div>
        </div>
        <div className="hidden sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-10">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>

        {/* CTA */}
        <div className="mt-14 text-center">
          <Link href="/buy" className="btn-dark text-sm">
            Browse All Properties →
          </Link>
        </div>

        <IDXDisclaimer variant="compact" className="mt-8" />
      </div>
    </section>
  );
}
