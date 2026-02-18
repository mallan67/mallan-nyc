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
    <section className="py-14 sm:py-16 px-4 bg-white">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 sm:mb-8">
          <p className="text-[10px] font-black tracking-[0.3em] uppercase text-[#C4A052] mb-2">
            Recently Closed
          </p>
          <h2 className="font-sans font-black text-3xl sm:text-4xl tracking-tight text-gray-950 leading-none">
            Recent Transactions.
          </h2>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 snap-x snap-mandatory"
             style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', scrollPaddingInline: '16px' }}>
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
                className="liquid-card flex-shrink-0 w-[220px] sm:w-[240px] rounded-2xl overflow-hidden snap-start"
              >
                <div className="relative aspect-[3/4] overflow-hidden bg-gray-100">
                  {src && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={src}
                      alt={`${listing.propertyInfo.propertyType} in ${listing.address.neighborhoodDisplay}`}
                      className="card-img absolute inset-0 w-full h-full object-cover"
                      loading="lazy"
                    />
                  )}

                  {/* Status badge */}
                  <span className={`absolute top-3 left-3 z-10 text-white text-[10px] px-2.5 py-1 font-bold tracking-widest uppercase rounded-full ${
                    isSold ? 'bg-emerald-600' : 'bg-blue-600'
                  }`}>
                    {isSold ? 'Sold' : 'Rented'}
                  </span>

                  {/* Soft gradient fade */}
                  <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/70 via-black/25 to-transparent pt-14 pb-3 px-3.5">
                    <p className="text-white font-black text-base leading-tight drop-shadow-md">
                      {formatPrice(closePrice)}
                    </p>
                    <p className="text-white/80 text-[11px] font-medium mt-0.5 drop-shadow-sm">
                      {listing.address.neighborhoodDisplay} &middot; {beds}bd {baths}ba
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
          {/* Spacer so last card isn't clipped at right edge */}
          <div className="flex-shrink-0 w-4" aria-hidden />
        </div>
      </div>
    </section>
  );
}
