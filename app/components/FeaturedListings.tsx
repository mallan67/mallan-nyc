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
      className="liquid-card group block relative rounded-2xl overflow-hidden bg-gray-900"
      style={{ aspectRatio: '4/3' }}
    >
      {/* Photo — direct img, no wrapper div conflict */}
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={`${listing.propertyInfo.propertyType} in ${listing.address.neighborhoodDisplay}`}
          className="card-img absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
      )}

      {/* Hover darken */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-500 z-10" />

      {/* Badges */}
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
      <div className="absolute top-3 right-3 z-20">
        <span className="bg-black/50 backdrop-blur-sm text-white text-[10px] px-2 py-1 font-semibold tracking-widest uppercase rounded">
          {isRental ? 'Rental' : 'Sale'}
        </span>
      </div>

      {/* Price overlay — compact bottom band, most of photo stays clear */}
      <div
        className="absolute bottom-0 left-0 right-0 z-20 px-4 pt-10 pb-3"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.3) 40%, rgba(0,0,0,0.05) 70%, transparent 100%)' }}
      >
        <p className="text-white font-black text-xl sm:text-2xl leading-none mb-1">
          {formatPrice(listing.price.listPrice, isRental)}
        </p>
        <p className="text-white/75 text-xs font-medium">
          {listing.propertyInfo.propertyType} &middot; {listing.address.neighborhoodDisplay}
        </p>
        <p className="text-white/55 text-xs mt-0.5">
          {beds} bed &middot; {baths}{halfBaths > 0 ? `.${halfBaths}` : ''} bath
          {sqft > 0 && ` · ${sqft.toLocaleString()} sf`}
        </p>
        {listing.agent?.listOfficeName && (
          <p className="text-white/35 text-[9px] mt-1.5">Courtesy of {listing.agent.listOfficeName}</p>
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
    <section className="py-20 sm:py-24 md:py-32 px-4 bg-stone-50 overflow-hidden">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-10 sm:mb-12">
          <div>
            <p className="text-[10px] font-black tracking-[0.3em] uppercase text-[#C4A052] mb-3">
              Hand-Selected
            </p>
            <h2 className="font-sans font-black text-4xl sm:text-5xl tracking-tight text-gray-950 leading-none">
              Featured Listings.
            </h2>
          </div>
          <Link
            href="/buy"
            className="group inline-flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-[#C4A052] transition-colors whitespace-nowrap self-start sm:self-auto"
          >
            View all <span className="group-hover:translate-x-1 transition-transform" aria-hidden>→</span>
          </Link>
        </div>

        {/* Featured editorial card */}
        {hero && (
          <Link
            href={`/listing/${hero.id}`}
            className="liquid-card group block relative rounded-2xl overflow-hidden mb-4 sm:mb-5 bg-gray-900"
            style={{ aspectRatio: '21/9' }}
          >
            {(() => {
              const heroSrc =
                hero.media.images.find(img => img.isPrimary)?.url ||
                hero.media.images[0]?.url || '';
              return heroSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={heroSrc}
                  alt={`${hero.propertyInfo.propertyType} in ${hero.address.neighborhoodDisplay}`}
                  className="card-img absolute inset-0 w-full h-full object-cover"
                  loading="eager"
                />
              ) : null;
            })()}

            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors duration-500" />

            {/* Overlay — compact bottom band, most of photo stays clear */}
            <div
              className="absolute bottom-0 left-0 right-0 px-6 sm:px-8 pt-14 pb-5 sm:pb-6"
              style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.3) 35%, rgba(0,0,0,0.05) 65%, transparent 100%)' }}
            >
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                <div>
                  {hero.flags.isExclusive && (
                    <span className="inline-block bg-[#C4A052] text-white text-[10px] px-2.5 py-1 font-bold tracking-widest uppercase rounded mb-2 shadow-lg">
                      Exclusive
                    </span>
                  )}
                  <p className="text-white font-black text-2xl sm:text-3xl md:text-4xl leading-none mb-1.5">
                    {hero.listingType === 'rent'
                      ? `$${hero.price.listPrice.toLocaleString()}/mo`
                      : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(hero.price.listPrice)
                    }
                  </p>
                  <p className="text-white/75 text-sm">
                    {hero.propertyInfo.propertyType} &middot; {hero.address.neighborhoodDisplay}
                  </p>
                  <p className="text-white/55 text-xs mt-0.5">
                    {hero.propertyInfo.bedroomsTotal} bed &middot; {hero.propertyInfo.bathroomsFull}
                    {hero.propertyInfo.bathroomsHalf > 0 ? `.${hero.propertyInfo.bathroomsHalf}` : ''} bath
                    {hero.propertyInfo.aboveGradeFinishedArea > 0 && ` · ${hero.propertyInfo.aboveGradeFinishedArea.toLocaleString()} sf`}
                  </p>
                </div>
                <span className="inline-flex items-center gap-2 text-white font-bold text-sm border border-white/30 px-5 py-2.5 rounded-lg backdrop-blur-sm bg-white/10 group-hover:bg-white/20 transition-all whitespace-nowrap self-start sm:self-auto">
                  View Listing →
                </span>
              </div>
              {hero.agent?.listOfficeName && (
                <p className="text-white/30 text-[9px] mt-3">Courtesy of {hero.agent.listOfficeName}</p>
              )}
            </div>
          </Link>
        )}

        {/* Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-5">
          {rest.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>

        {/* CTA */}
        <div className="mt-12 sm:mt-16 text-center">
          <Link
            href="/buy"
            className="inline-flex items-center gap-3 px-10 py-4 bg-gray-950 text-white font-black rounded-xl hover:bg-gray-800 transition-colors text-sm tracking-widest uppercase"
          >
            Browse All Properties →
          </Link>
        </div>

        <IDXDisclaimer variant="compact" className="mt-8" />
      </div>
    </section>
  );
}
