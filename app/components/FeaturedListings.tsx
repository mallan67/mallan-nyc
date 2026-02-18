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
      className="liquid-card group block rounded-2xl overflow-hidden"
    >
      <div className="relative aspect-[3/4] sm:aspect-[4/5] overflow-hidden bg-gray-100">
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={`${listing.propertyInfo.propertyType} in ${listing.address.neighborhoodDisplay}`}
            className="card-img absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        )}

        {/* Top badges */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10">
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
        <div className="absolute top-3 right-3 z-10">
          <span className="bg-white/90 backdrop-blur-sm text-gray-700 text-[10px] px-2.5 py-1 font-semibold tracking-widest uppercase rounded-full">
            {isRental ? 'Rental' : 'Sale'}
          </span>
        </div>

        {/* Soft gradient fade + text */}
        <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/70 via-black/30 to-transparent pt-16 pb-4 px-4">
          <p className="text-white font-black text-lg leading-tight drop-shadow-md">
            {formatPrice(listing.price.listPrice, isRental)}
          </p>
          <p className="text-white/80 text-xs font-medium mt-0.5 drop-shadow-sm">
            {listing.address.neighborhoodDisplay} &middot; {beds}bd {baths}{halfBaths > 0 ? `.${halfBaths}` : ''}ba
            {sqft > 0 && ` · ${sqft.toLocaleString()}sf`}
          </p>
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
    .slice(0, 12);

  const [hero, ...rest] = listings;

  return (
    <section className="py-16 sm:py-20 md:py-24 px-4 bg-stone-50">
      <div className="max-w-7xl mx-auto">

        {/* Section header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-8 sm:mb-10">
          <div>
            <p className="text-[10px] font-black tracking-[0.3em] uppercase text-[#C4A052] mb-2">
              Hand-Selected
            </p>
            <h2 className="font-sans font-black text-3xl sm:text-4xl tracking-tight text-gray-950 leading-none">
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
            className="liquid-card group block rounded-2xl overflow-hidden mb-5 sm:mb-6"
          >
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
                    className="card-img absolute inset-0 w-full h-full object-cover"
                    loading="eager"
                  />
                ) : null;
              })()}
              {hero.flags.isExclusive && (
                <span className="absolute top-4 left-4 z-10 bg-[#C4A052] text-white text-[10px] px-3 py-1.5 font-bold tracking-widest uppercase rounded-full">
                  Exclusive
                </span>
              )}

              {/* Gradient info bar */}
              <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/70 via-black/30 to-transparent pt-20 pb-5 px-5 sm:px-8">
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
                  <div>
                    <p className="text-white font-black text-2xl sm:text-3xl leading-tight drop-shadow-md">
                      {hero.listingType === 'rent'
                        ? `$${hero.price.listPrice.toLocaleString()}/mo`
                        : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(hero.price.listPrice)
                      }
                    </p>
                    <p className="text-white/80 text-sm font-medium mt-0.5 drop-shadow-sm">
                      {hero.address.neighborhoodDisplay} &middot; {hero.propertyInfo.bedroomsTotal}bd {hero.propertyInfo.bathroomsFull}{hero.propertyInfo.bathroomsHalf > 0 ? `.${hero.propertyInfo.bathroomsHalf}` : ''}ba
                      {hero.propertyInfo.aboveGradeFinishedArea > 0 && ` · ${hero.propertyInfo.aboveGradeFinishedArea.toLocaleString()}sf`}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-2 text-white font-bold text-sm border border-white/30 px-5 py-2.5 rounded-full group-hover:border-[#C4A052] group-hover:text-[#C4A052] transition-colors whitespace-nowrap self-start sm:self-auto backdrop-blur-sm bg-white/5">
                    View Listing →
                  </span>
                </div>
              </div>
            </div>
          </Link>
        )}

        {/* Mobile: horizontal scroll | Desktop: grid */}
        <div className="sm:hidden flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 snap-x snap-mandatory" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {rest.map((listing) => (
            <div key={listing.id} className="flex-shrink-0 w-[240px] snap-start">
              <ListingCard listing={listing} />
            </div>
          ))}
          <div className="flex-shrink-0 w-4" aria-hidden />
        </div>
        <div className="hidden sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
          {rest.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>

        {/* CTA */}
        <div className="mt-12 sm:mt-16 text-center">
          <Link href="/buy" className="btn-dark">
            Browse All Properties →
          </Link>
        </div>

        <IDXDisclaimer variant="compact" className="mt-8" />
      </div>
    </section>
  );
}
