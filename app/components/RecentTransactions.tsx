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
    <section className="py-14 sm:py-16 px-4">
      <div className="max-w-7xl mx-auto">
        <h2 className="font-display text-3xl sm:text-4xl tracking-tight text-gray-900 leading-none mb-8">
          Recent Transactions
        </h2>

        <div className="-mx-4 overflow-x-auto snap-x snap-mandatory"
             style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <div className="inline-flex gap-5 px-4 pb-4">
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
                <div key={listing.id} className="flex-shrink-0 w-[220px] sm:w-[240px] snap-start">
                  <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-gray-100 mb-3">
                    {src && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={src}
                        alt={`${listing.propertyInfo.propertyType} in ${listing.address.neighborhoodDisplay}`}
                        className="absolute inset-0 w-full h-full object-cover"
                        loading="lazy"
                      />
                    )}
                    <span className={`absolute top-3 left-3 z-10 text-white text-[10px] px-2.5 py-1 font-semibold tracking-wider uppercase rounded ${
                      isSold ? 'bg-gray-900' : 'bg-gray-700'
                    }`}>
                      {isSold ? 'Sold' : 'Rented'}
                    </span>
                  </div>
                  <p className="text-base font-bold text-gray-900 leading-tight">
                    {formatPrice(closePrice)}
                  </p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {listing.address.neighborhoodDisplay} &middot; {beds}bd {baths}ba
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
