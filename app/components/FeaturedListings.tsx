'use client';

import Image from 'next/image';
import Link from 'next/link';

type Listing = {
  id: string;
  image: string;
  price: number;
  priceLabel?: string; // e.g., "/month" for rentals
  type: string;
  location: string;
  beds?: number;
  baths?: number;
  sqft?: number;
  isExclusive?: boolean;
};

// Stub data - prioritizes exclusives first
const STUB_LISTINGS: Listing[] = [
  {
    id: '1',
    image: '/images/listing-1.jpg',
    price: 3295000,
    type: 'Condo',
    location: 'Manhattan',
    beds: 2,
    baths: 2,
    sqft: 1450,
    isExclusive: true,
  },
  {
    id: '2',
    image: '/images/listing-2.jpg',
    price: 7500000,
    type: 'Condo',
    location: 'Manhattan',
    beds: 4,
    baths: 4,
    sqft: 3200,
    isExclusive: true,
  },
  {
    id: '3',
    image: '/images/listing-3.jpg',
    price: 4698000,
    type: 'Townhouse',
    location: 'Brooklyn',
    beds: 5,
    baths: 3,
    sqft: 4500,
    isExclusive: true,
  },
  {
    id: '4',
    image: '/images/listing-4.jpg',
    price: 10500,
    priceLabel: '/month',
    type: 'Apartment',
    location: 'Manhattan',
    beds: 3,
    baths: 2,
    sqft: 2100,
    isExclusive: false,
  },
  {
    id: '5',
    image: '/images/listing-5.jpg',
    price: 4200000,
    type: 'Co-op',
    location: 'Canal Street',
    beds: 3,
    baths: 2,
    sqft: 2400,
    isExclusive: false,
  },
  {
    id: '6',
    image: '/images/listing-6.jpg',
    price: 2800000,
    type: 'Condo',
    location: 'Manhattan',
    beds: 2,
    baths: 2,
    sqft: 1650,
    isExclusive: false,
  },
];

function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price);
}

function ListingCard({ listing }: { listing: Listing }) {
  return (
    <Link href={`/listing/${listing.id}`} className="group block">
      <div className="relative aspect-[4/3] overflow-hidden rounded-sm bg-gray-200">
        <Image
          src={listing.image}
          alt={`${listing.type} in ${listing.location}`}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 16vw"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        {listing.isExclusive && (
          <span className="absolute top-3 left-3 bg-black/40 backdrop-blur-md text-white text-xs px-3 py-1.5 font-serif border border-black/20 rounded shadow-lg">
            Exclusive
          </span>
        )}
      </div>
      <div className="mt-3">
        <p className="text-lg font-serif font-medium">
          {formatPrice(listing.price)}
          {listing.priceLabel && <span className="text-sm font-normal">{listing.priceLabel}</span>}
        </p>
        <p className="text-sm text-gray-600 font-serif">
          {listing.type}, {listing.location}
        </p>
        {(listing.beds || listing.baths || listing.sqft) && (
          <p className="text-xs text-gray-500 mt-1">
            {listing.beds && `${listing.beds} bed`}
            {listing.baths && ` · ${listing.baths} bath`}
            {listing.sqft && ` · ${listing.sqft.toLocaleString()} sqft`}
          </p>
        )}
      </div>
    </Link>
  );
}

export default function FeaturedListings() {
  // Sort: exclusives first, then RLS
  const sortedListings = [...STUB_LISTINGS].sort((a, b) => {
    if (a.isExclusive && !b.isExclusive) return -1;
    if (!a.isExclusive && b.isExclusive) return 1;
    return 0;
  });

  return (
    <section className="py-8 sm:py-12 md:py-16 px-4 bg-white">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-2xl sm:text-3xl font-serif mb-6 sm:mb-8">Featured Listings</h2>
        <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 sm:gap-6">
          {sortedListings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
        <div className="mt-8 sm:mt-10 text-center">
          <Link
            href="/search"
            className="inline-block px-6 sm:px-8 py-2 sm:py-3 border border-brand-dark text-brand-dark font-serif hover:bg-brand-dark hover:text-white transition-colors text-sm sm:text-base"
          >
            View All Listings
          </Link>
        </div>
      </div>
    </section>
  );
}
