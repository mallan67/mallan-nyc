'use client';

'use client';

import Link from 'next/link';
import IDXImage from '@/app/components/IDXImage';
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
  const primaryImage =
    listing.media.images.find(img => img.isPrimary)?.url ||
    listing.media.images[0]?.url ||
    '/images/listing-placeholder.svg';
  const beds = listing.propertyInfo.bedroomsTotal;
  const baths = listing.propertyInfo.bathroomsFull;
  const halfBaths = listing.propertyInfo.bathroomsHalf;
  const sqft = listing.propertyInfo.aboveGradeFinishedArea;

  return (
    <Link
      href={`/listing/${listing.id}`}
      className="group block bg-white rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
    >
      {/* Photo */}
      <div className="relative">
        <IDXImage
          src={primaryImage}
          alt={`${listing.propertyInfo.propertyType} in ${listing.address.neighborhoodDisplay}`}
          aspect="card"
        />
        {/* Badge */}
        {listing.flags.isExclusive && (
          <span className="absolute top-3 left-3 bg-[#C4A052] text-white text-[11px] px-2.5 py-1 font-bold rounded tracking-wider uppercase z-10 shadow-md">
            Exclusive
          </span>
        )}
        {listing.flags.isNewListing && !listing.flags.isExclusive && (
          <span className="absolute top-3 left-3 bg-gray-900 text-white text-[11px] px-2.5 py-1 font-bold rounded tracking-wider uppercase z-10 shadow-md">
            New
          </span>
        )}
        {/* Type pill */}
        <span className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm text-white text-[10px] px-2 py-0.5 font-semibold rounded tracking-widest uppercase z-10">
          {isRental ? 'Rental' : 'Sale'}
        </span>
      </div>

      {/* Info */}
      <div className="p-4">
        {/* Price */}
        <p className="text-xl font-black text-[#C4A052] min-h-[1.75rem] tracking-tight">
          {formatPrice(listing.price.listPrice, isRental)}
        </p>
        {/* Address */}
        <p className="text-sm font-semibold text-gray-900 mt-1 min-h-[1.25rem]">
          {listing.propertyInfo.propertyType} &middot; {listing.address.neighborhoodDisplay}
        </p>
        {/* Details */}
        <p className="text-xs text-gray-500 mt-1 min-h-[1rem]">
          {beds} bed &middot; {baths}{halfBaths > 0 ? `.${halfBaths}` : ''} bath
          {sqft > 0 && ` · ${sqft.toLocaleString()} sf`}
        </p>
        {!isRental && listing.nycSpecific.maintenanceFee && (
          <p className="text-xs text-gray-400 mt-0.5">
            {listing.propertyInfo.propertyType === 'Co-op' ? 'Maint' : 'CC'}: ${listing.nycSpecific.maintenanceFee.toLocaleString()}/mo
          </p>
        )}
        {/* REBNY H1/F6 attribution */}
        {listing.agent?.listOfficeName && (
          <p className="text-[10px] text-gray-400 mt-2 pt-2 border-t border-gray-100">
            Courtesy of {listing.agent.listOfficeName}
          </p>
        )}
      </div>
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
    .slice(0, 6);

  const [hero, ...rest] = listings;

  return (
    <section className="py-16 sm:py-20 md:py-24 px-4 bg-stone-50">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10 sm:mb-12">
          <div>
            <p className="text-xs font-bold tracking-[0.2em] uppercase text-[#C4A052] mb-3">
              Hand-Selected Properties
            </p>
            <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 leading-tight">
              Featured Listings
            </h2>
          </div>
          <Link
            href="/buy"
            className="text-sm font-semibold text-gray-500 hover:text-gray-900 transition-colors underline underline-offset-4 decoration-gray-300 hover:decoration-gray-600 whitespace-nowrap"
          >
            View all listings →
          </Link>
        </div>

        {/* Editorial hero card — first listing spans full width */}
        {hero && (
          <Link
            href={`/listing/${hero.id}`}
            className="group block bg-white rounded-2xl overflow-hidden shadow-md hover:shadow-2xl transition-all duration-500 mb-5 sm:mb-6"
          >
            <div className="flex flex-col md:flex-row">
              {/* Photo — 55% width on desktop */}
              <div className="relative md:w-[55%] aspect-[4/3] md:aspect-auto md:min-h-[360px] overflow-hidden bg-gray-100 flex-shrink-0">
                <IDXImage
                  src={
                    hero.media.images.find(img => img.isPrimary)?.url ||
                    hero.media.images[0]?.url ||
                    '/images/listing-placeholder.svg'
                  }
                  alt={`${hero.propertyInfo.propertyType} in ${hero.address.neighborhoodDisplay}`}
                  aspect="card"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/10 group-hover:to-black/5 transition-all duration-500" />
                {hero.flags.isExclusive && (
                  <span className="absolute top-4 left-4 bg-[#C4A052] text-white text-[11px] px-3 py-1 font-bold rounded tracking-wider uppercase shadow-md z-10">
                    Exclusive
                  </span>
                )}
              </div>
              {/* Details */}
              <div className="flex flex-col justify-center p-8 md:p-10 lg:p-12">
                <p className="text-xs font-bold tracking-[0.2em] uppercase text-[#C4A052] mb-3">
                  {hero.listingType === 'rent' ? 'Rental' : 'For Sale'} · {hero.propertyInfo.propertyType}
                </p>
                <p className="font-display text-3xl sm:text-4xl font-bold text-[#C4A052] leading-none mb-3">
                  {hero.listingType === 'rent'
                    ? `$${hero.price.listPrice.toLocaleString()}/mo`
                    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(hero.price.listPrice)
                  }
                </p>
                <h3 className="font-display text-xl sm:text-2xl font-bold text-gray-900 mb-1">
                  {hero.address.neighborhoodDisplay}
                </h3>
                <p className="text-gray-500 text-sm mb-6">
                  {hero.propertyInfo.bedroomsTotal} bed &middot; {hero.propertyInfo.bathroomsFull}
                  {hero.propertyInfo.bathroomsHalf > 0 ? `.${hero.propertyInfo.bathroomsHalf}` : ''} bath
                  {hero.propertyInfo.aboveGradeFinishedArea > 0 && ` · ${hero.propertyInfo.aboveGradeFinishedArea.toLocaleString()} sf`}
                </p>
                <div className="flex items-center gap-2 text-gray-900 font-semibold text-sm group-hover:gap-3 transition-all">
                  View Listing <span aria-hidden>→</span>
                </div>
                {hero.agent?.listOfficeName && (
                  <p className="text-[10px] text-gray-400 mt-6 pt-4 border-t border-gray-100">
                    Courtesy of {hero.agent.listOfficeName}
                  </p>
                )}
              </div>
            </div>
          </Link>
        )}

        {/* Standard grid for remaining listings */}
        <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 gap-5 sm:gap-6">
          {rest.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>

        {/* CTA */}
        <div className="mt-12 sm:mt-16 text-center">
          <Link
            href="/buy"
            className="inline-block px-10 py-4 bg-gray-900 text-white font-bold rounded-xl hover:bg-gray-800 shadow-lg hover:shadow-xl transition-all text-sm sm:text-base tracking-wide"
          >
            Browse All Properties
          </Link>
        </div>

        {/* REBNY IDX disclaimer */}
        <IDXDisclaimer variant="compact" className="mt-8" />
      </div>
    </section>
  );
}
