'use client';

import listingsData from '@/data/listings.json';
import type { Listing } from '@/lib/types/listing';

function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price);
}

export default function RecentTransactions() {
  const closedListings = (listingsData.listings as unknown as Listing[])
    .filter((l) => l.status === 'sold' || l.status === 'rented')
    .slice(0, 7);

  if (closedListings.length === 0) return null;

  return (
    <section className="py-16 sm:py-20 px-4 bg-white">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 sm:mb-10">
          <p className="text-[10px] font-black tracking-[0.3em] uppercase text-[#C4A052] mb-3">
            Recently Closed
          </p>
          <h2 className="font-sans font-black text-3xl sm:text-4xl tracking-tight text-gray-950 leading-none">
            Recent Transactions.
          </h2>
        </div>

        {/* Horizontal scroll strip */}
        <div className="flex gap-4 sm:gap-5 overflow-x-auto pb-4 -mx-4 px-4 snap-x snap-mandatory scrollbar-hide"
             style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {closedListings.map((listing) => {
            const isSold = listing.status === 'sold';
            const src =
              listing.media.images.find((img) => img.isPrimary)?.url ||
              listing.media.images[0]?.url ||
              '';
            const closePrice = listing.price.closePrice || listing.price.listPrice;
            const beds = listing.propertyInfo.bedroomsTotal;
            const baths = listing.propertyInfo.bathroomsFull;

            return (
              <div
                key={listing.id}
                className="liquid-card flex-shrink-0 w-[260px] sm:w-[280px] rounded-2xl overflow-hidden snap-start"
              >
                {/* Photo with badge */}
                <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
                  {src && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={src}
                      alt={`${listing.propertyInfo.propertyType} in ${listing.address.neighborhoodDisplay}`}
                      className="card-img absolute inset-0 w-full h-full object-cover"
                      loading="lazy"
                    />
                  )}
                  <span className={`absolute top-3 left-3 text-white text-[10px] px-2.5 py-1 font-bold tracking-widest uppercase rounded-full ${
                    isSold ? 'bg-emerald-600' : 'bg-blue-600'
                  }`}>
                    {isSold ? 'Sold' : 'Rented'}
                  </span>
                </div>

                {/* Info */}
                <div className="relative bg-gray-950 overflow-hidden">
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.08] via-transparent to-white/[0.03]" />
                  <div className="relative z-10 p-4">
                    <p className="text-white font-black text-lg leading-tight">
                      {formatPrice(closePrice)}
                    </p>
                    <p className="text-white/60 text-sm font-medium mt-1">
                      {listing.propertyInfo.propertyType} &middot; {listing.address.neighborhoodDisplay}
                    </p>
                    <p className="text-white/40 text-xs mt-1">
                      {beds} bed &middot; {baths} bath
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
