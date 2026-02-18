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

/* Glossy dark panel style — shared across cards */
const glossPanel = 'relative bg-gray-950 overflow-hidden';
const glossSheen = 'pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.08] via-transparent to-white/[0.03]';

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
      className="group block rounded-2xl overflow-hidden shadow-md hover:shadow-2xl transition-shadow duration-500"
    >
      {/* Photo — clean, bright, no overlay */}
      <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={`${listing.propertyInfo.propertyType} in ${listing.address.neighborhoodDisplay}`}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
            loading="lazy"
          />
        )}
        <div className="absolute top-3 left-3 flex items-center gap-1.5">
          {listing.flags.isExclusive && (
            <span className="bg-[#C4A052] text-white text-[10px] px-2.5 py-1 font-bold tracking-widest uppercase rounded-full">
              Exclusive
            </span>
          )}
          {listing.flags.isNewListing && !listing.flags.isExclusive && (
            <span className="bg-white text-gray-900 text-[10px] px-2.5 py-1 font-bold tracking-widest uppercase rounded-full shadow">
              New
            </span>
          )}
        </div>
        <div className="absolute top-3 right-3">
          <span className="bg-white/90 backdrop-blur-sm text-gray-700 text-[10px] px-2.5 py-1 font-semibold tracking-widest uppercase rounded-full">
            {isRental ? 'Rental' : 'Sale'}
          </span>
        </div>
      </div>

      {/* Info — glossy black panel */}
      <div className={glossPanel}>
        <div className={glossSheen} />
        <div className="relative z-10 p-4">
          <p className="text-white font-black text-xl leading-tight">
            {formatPrice(listing.price.listPrice, isRental)}
          </p>
          <p className="text-white/60 text-sm font-medium mt-1">
            {listing.propertyInfo.propertyType} &middot; {listing.address.neighborhoodDisplay}
          </p>
          <p className="text-white/40 text-xs mt-1">
            {beds} bed &middot; {baths}{halfBaths > 0 ? `.${halfBaths}` : ''} bath
            {sqft > 0 && ` · ${sqft.toLocaleString()} sf`}
          </p>
          {listing.agent?.listOfficeName && (
            <p className="text-white/20 text-[10px] mt-2 tracking-wide">Courtesy of {listing.agent.listOfficeName}</p>
          )}
        </div>
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
    <section className="py-20 sm:py-24 md:py-32 px-4 bg-stone-50">
      <div className="max-w-7xl mx-auto">

        {/* Section header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-10 sm:mb-14">
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

        {/* Hero card */}
        {hero && (
          <Link
            href={`/listing/${hero.id}`}
            className="group block rounded-2xl overflow-hidden shadow-md hover:shadow-2xl transition-shadow duration-500 mb-5 sm:mb-6"
          >
            {/* Wide cinematic photo */}
            <div className="relative aspect-[21/9] overflow-hidden bg-gray-100">
              {(() => {
                const heroSrc =
                  hero.media.images.find(img => img.isPrimary)?.url ||
                  hero.media.images[0]?.url || '';
                return heroSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={heroSrc}
                    alt={`${hero.propertyInfo.propertyType} in ${hero.address.neighborhoodDisplay}`}
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700 ease-out"
                    loading="eager"
                  />
                ) : null;
              })()}
              {hero.flags.isExclusive && (
                <span className="absolute top-4 left-4 bg-[#C4A052] text-white text-[10px] px-3 py-1.5 font-bold tracking-widest uppercase rounded-full">
                  Exclusive
                </span>
              )}
            </div>

            {/* Glossy black info bar */}
            <div className={glossPanel}>
              <div className={glossSheen} />
              <div className="relative z-10 px-6 sm:px-8 py-5 sm:py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-white font-black text-2xl sm:text-3xl leading-tight">
                    {hero.listingType === 'rent'
                      ? `$${hero.price.listPrice.toLocaleString()}/mo`
                      : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(hero.price.listPrice)
                    }
                  </p>
                  <p className="text-white/60 text-sm font-medium mt-1">
                    {hero.propertyInfo.propertyType} &middot; {hero.address.neighborhoodDisplay}
                  </p>
                  <p className="text-white/40 text-xs mt-0.5">
                    {hero.propertyInfo.bedroomsTotal} bed &middot; {hero.propertyInfo.bathroomsFull}
                    {hero.propertyInfo.bathroomsHalf > 0 ? `.${hero.propertyInfo.bathroomsHalf}` : ''} bath
                    {hero.propertyInfo.aboveGradeFinishedArea > 0 && ` · ${hero.propertyInfo.aboveGradeFinishedArea.toLocaleString()} sf`}
                  </p>
                </div>
                <span className="inline-flex items-center gap-2 text-white font-bold text-sm border border-white/20 px-6 py-3 rounded-full group-hover:border-[#C4A052] group-hover:text-[#C4A052] transition-colors whitespace-nowrap self-start sm:self-auto">
                  View Listing →
                </span>
              </div>
              {hero.agent?.listOfficeName && (
                <p className="relative z-10 px-6 sm:px-8 pb-4 text-white/20 text-[10px] tracking-wide -mt-2">Courtesy of {hero.agent.listOfficeName}</p>
              )}
            </div>
          </Link>
        )}

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5 sm:gap-6">
          {rest.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>

        {/* CTA */}
        <div className="mt-14 sm:mt-20 text-center">
          <Link
            href="/buy"
            className="inline-flex items-center gap-3 px-10 py-4 bg-gray-950 text-white font-black rounded-full hover:bg-gray-800 transition-colors text-sm tracking-widest uppercase"
          >
            Browse All Properties →
          </Link>
        </div>

        <IDXDisclaimer variant="compact" className="mt-8" />
      </div>
    </section>
  );
}
