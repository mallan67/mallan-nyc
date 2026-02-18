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
      className="liquid-card group block relative rounded-2xl overflow-hidden aspect-[4/3] bg-gray-950"
    >
      {/* Full-bleed photo */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="card-img absolute inset-0">
          <IDXImage
            src={primaryImage}
            alt={`${listing.propertyInfo.propertyType} in ${listing.address.neighborhoodDisplay}`}
            aspect="card"
          />
        </div>
      </div>

      {/* Hover darkening */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-all duration-500 z-10" style={{ transition: 'background 0.55s cubic-bezier(0.22,1,0.36,1)' }} />

      {/* Top badges */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
        {listing.flags.isExclusive && (
          <span className="bg-[#C4A052] text-white text-[10px] px-2.5 py-1 font-bold tracking-widest uppercase rounded shadow-lg">
            Exclusive
          </span>
        )}
        {listing.flags.isNewListing && !listing.flags.isExclusive && (
          <span className="bg-white text-gray-900 text-[10px] px-2.5 py-1 font-bold tracking-widest uppercase rounded shadow-lg">
            New
          </span>
        )}
      </div>

      {/* Type pill top-right */}
      <div className="absolute top-3 right-3 z-20">
        <span className="bg-black/50 backdrop-blur-sm text-white text-[10px] px-2 py-1 font-semibold tracking-widest uppercase rounded">
          {isRental ? 'Rental' : 'Sale'}
        </span>
      </div>

      {/* Price + info overlay — Serhant/Elliman style gradient overlay at bottom */}
      <div className="absolute bottom-0 left-0 right-0 z-20 px-4 pt-16 pb-4"
           style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)' }}>
        <p className="text-white font-black text-xl sm:text-2xl leading-none mb-1 drop-shadow-lg">
          {formatPrice(listing.price.listPrice, isRental)}
        </p>
        <p className="text-white/80 text-xs font-medium">
          {listing.propertyInfo.propertyType} &middot; {listing.address.neighborhoodDisplay}
        </p>
        <p className="text-white/60 text-xs mt-0.5">
          {beds} bed &middot; {baths}{halfBaths > 0 ? `.${halfBaths}` : ''} bath
          {sqft > 0 && ` · ${sqft.toLocaleString()} sf`}
        </p>
        {listing.agent?.listOfficeName && (
          <p className="text-white/40 text-[9px] mt-2">
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
    <section className="py-24 sm:py-28 md:py-36 px-4 bg-white">
      <div className="max-w-7xl mx-auto">

        {/* Section header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-12 sm:mb-16">
          <div>
            <p className="text-xs font-black tracking-[0.3em] uppercase text-[#C4A052] mb-4">
              Hand-Selected
            </p>
            <h2 className="font-sans font-black text-4xl sm:text-5xl md:text-6xl tracking-tight text-gray-950 leading-none">
              Featured<br />Listings.
            </h2>
          </div>
          <Link
            href="/buy"
            className="group inline-flex items-center gap-2 text-sm font-bold text-gray-900 hover:text-[#C4A052] transition-colors whitespace-nowrap"
          >
            View all listings
            <span className="group-hover:translate-x-1 transition-transform" aria-hidden>→</span>
          </Link>
        </div>

        {/* Editorial hero listing — full width, photo left / overlay info */}
        {hero && (
          <Link
            href={`/listing/${hero.id}`}
            className="liquid-card group block relative rounded-2xl overflow-hidden mb-5 sm:mb-6 bg-gray-950"
          >
            <div className="relative aspect-[16/7] overflow-hidden rounded-2xl">
              <div className="card-img absolute inset-0">
                <IDXImage
                  src={
                    hero.media.images.find(img => img.isPrimary)?.url ||
                    hero.media.images[0]?.url ||
                    '/images/listing-placeholder.svg'
                  }
                  alt={`${hero.propertyInfo.propertyType} in ${hero.address.neighborhoodDisplay}`}
                  aspect="card"
                />
              </div>
              {/* Hover darken */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-all duration-500" />

              {/* Overlay — bottom left */}
              <div className="absolute bottom-0 left-0 right-0 px-8 pt-24 pb-8 sm:px-10 sm:pb-10"
                   style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 60%, transparent 100%)' }}>
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                  <div>
                    {hero.flags.isExclusive && (
                      <span className="inline-block bg-[#C4A052] text-white text-[10px] px-2.5 py-1 font-bold tracking-widest uppercase rounded mb-3 shadow-lg">
                        Exclusive
                      </span>
                    )}
                    <p className="text-white font-black text-3xl sm:text-4xl md:text-5xl leading-none mb-2 drop-shadow-xl">
                      {hero.listingType === 'rent'
                        ? `$${hero.price.listPrice.toLocaleString()}/mo`
                        : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(hero.price.listPrice)
                      }
                    </p>
                    <p className="text-white/80 text-sm font-semibold">
                      {hero.propertyInfo.propertyType} &middot; {hero.address.neighborhoodDisplay}
                    </p>
                    <p className="text-white/60 text-xs mt-1">
                      {hero.propertyInfo.bedroomsTotal} bed &middot; {hero.propertyInfo.bathroomsFull}
                      {hero.propertyInfo.bathroomsHalf > 0 ? `.${hero.propertyInfo.bathroomsHalf}` : ''} bath
                      {hero.propertyInfo.aboveGradeFinishedArea > 0 && ` · ${hero.propertyInfo.aboveGradeFinishedArea.toLocaleString()} sf`}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-2 text-white font-bold text-sm border border-white/40 hover:border-white px-5 py-3 rounded-lg transition-colors whitespace-nowrap backdrop-blur-sm bg-white/10 group-hover:bg-white/20">
                    View Listing →
                  </span>
                </div>
                {hero.agent?.listOfficeName && (
                  <p className="text-white/35 text-[9px] mt-4">
                    Courtesy of {hero.agent.listOfficeName}
                  </p>
                )}
              </div>
            </div>
          </Link>
        )}

        {/* 3-col grid */}
        <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 gap-5 sm:gap-6">
          {rest.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>

        {/* CTA */}
        <div className="mt-16 sm:mt-20 text-center">
          <Link
            href="/buy"
            className="inline-flex items-center gap-3 px-12 py-5 bg-gray-950 text-white font-black rounded-xl hover:bg-gray-800 shadow-xl hover:shadow-2xl transition-all text-sm sm:text-base tracking-widest uppercase"
          >
            Browse All Properties
            <span aria-hidden>→</span>
          </Link>
        </div>

        <IDXDisclaimer variant="compact" className="mt-10" />
      </div>
    </section>
  );
}
