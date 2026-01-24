'use client';

import { useState } from 'react';
import Image from 'next/image';

interface Listing {
  id: string;
  address: string;
  neighborhood: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  type: string;
  image: string;
  isExclusive?: boolean;
}

// Sample listings data - in production, this would come from an API
const SAMPLE_LISTINGS: Listing[] = [
  {
    id: '1',
    address: '400 East 90th Street, Apt 12B',
    neighborhood: 'Upper East Side',
    price: 1250000,
    beds: 2,
    baths: 2,
    sqft: 1100,
    type: 'Condo',
    image: '/images/listing-placeholder.jpg',
    isExclusive: true,
  },
  {
    id: '2',
    address: '225 East 86th Street, Apt 8F',
    neighborhood: 'Upper East Side',
    price: 875000,
    beds: 1,
    baths: 1,
    sqft: 750,
    type: 'Co-op',
    image: '/images/listing-placeholder.jpg',
  },
  {
    id: '3',
    address: '180 Montague Street, Apt 5A',
    neighborhood: 'Brooklyn Heights',
    price: 1450000,
    beds: 3,
    baths: 2,
    sqft: 1400,
    type: 'Condo',
    image: '/images/listing-placeholder.jpg',
    isExclusive: true,
  },
  {
    id: '4',
    address: '350 West 42nd Street, Apt 22C',
    neighborhood: 'Midtown West',
    price: 2100000,
    beds: 2,
    baths: 2.5,
    sqft: 1350,
    type: 'Condo',
    image: '/images/listing-placeholder.jpg',
  },
  {
    id: '5',
    address: '75 Wall Street, Apt 31D',
    neighborhood: 'Financial District',
    price: 995000,
    beds: 1,
    baths: 1,
    sqft: 850,
    type: 'Condo',
    image: '/images/listing-placeholder.jpg',
  },
  {
    id: '6',
    address: '200 East 69th Street, Apt 4B',
    neighborhood: 'Upper East Side',
    price: 1750000,
    beds: 3,
    baths: 2,
    sqft: 1600,
    type: 'Co-op',
    image: '/images/listing-placeholder.jpg',
  },
];

const SAMPLE_RENTALS: Listing[] = [
  {
    id: 'r1',
    address: '123 East 72nd Street, Apt 6A',
    neighborhood: 'Upper East Side',
    price: 4500,
    beds: 1,
    baths: 1,
    sqft: 700,
    type: 'Condo',
    image: '/images/listing-placeholder.jpg',
  },
  {
    id: 'r2',
    address: '456 West 34th Street, Apt 18C',
    neighborhood: 'Hudson Yards',
    price: 6500,
    beds: 2,
    baths: 2,
    sqft: 1100,
    type: 'Condo',
    image: '/images/listing-placeholder.jpg',
    isExclusive: true,
  },
  {
    id: 'r3',
    address: '789 Broadway, Apt 3R',
    neighborhood: 'NoHo',
    price: 5200,
    beds: 1,
    baths: 1,
    sqft: 850,
    type: 'Loft',
    image: '/images/listing-placeholder.jpg',
  },
  {
    id: 'r4',
    address: '321 Park Avenue South, Apt 12F',
    neighborhood: 'Flatiron',
    price: 7500,
    beds: 2,
    baths: 2,
    sqft: 1250,
    type: 'Condo',
    image: '/images/listing-placeholder.jpg',
  },
];

function formatPrice(price: number, isRental: boolean): string {
  if (isRental) {
    return `$${price.toLocaleString()}/mo`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price);
}

interface PropertySearchProps {
  type: 'buy' | 'rent';
}

export default function PropertySearch({ type }: PropertySearchProps) {
  const isRental = type === 'rent';
  const listings = isRental ? SAMPLE_RENTALS : SAMPLE_LISTINGS;

  const [searchQuery, setSearchQuery] = useState('');
  const [priceRange, setPriceRange] = useState<[number, number]>(
    isRental ? [0, 15000] : [0, 5000000]
  );
  const [beds, setBeds] = useState<number | null>(null);
  const [propertyType, setPropertyType] = useState<string>('');

  // Filter listings
  const filteredListings = listings.filter(listing => {
    // Search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (
        !listing.address.toLowerCase().includes(query) &&
        !listing.neighborhood.toLowerCase().includes(query)
      ) {
        return false;
      }
    }
    // Price range
    if (listing.price < priceRange[0] || listing.price > priceRange[1]) {
      return false;
    }
    // Beds
    if (beds !== null && listing.beds < beds) {
      return false;
    }
    // Property type
    if (propertyType && listing.type !== propertyType) {
      return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Search Header */}
      <section className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search Input */}
            <div className="flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by address or neighborhood..."
                className="w-full border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-gold/50"
              />
            </div>

            {/* Filters */}
            <div className="flex gap-3 flex-wrap">
              {/* Price */}
              <select
                value={`${priceRange[0]}-${priceRange[1]}`}
                onChange={e => {
                  const [min, max] = e.target.value.split('-').map(Number);
                  setPriceRange([min, max]);
                }}
                className="border rounded-lg px-4 py-3 bg-white"
              >
                <option value={isRental ? '0-15000' : '0-5000000'}>Any Price</option>
                {isRental ? (
                  <>
                    <option value="0-3000">Under $3,000</option>
                    <option value="3000-5000">$3,000 - $5,000</option>
                    <option value="5000-7500">$5,000 - $7,500</option>
                    <option value="7500-10000">$7,500 - $10,000</option>
                    <option value="10000-15000">$10,000+</option>
                  </>
                ) : (
                  <>
                    <option value="0-750000">Under $750K</option>
                    <option value="750000-1000000">$750K - $1M</option>
                    <option value="1000000-1500000">$1M - $1.5M</option>
                    <option value="1500000-2500000">$1.5M - $2.5M</option>
                    <option value="2500000-5000000">$2.5M+</option>
                  </>
                )}
              </select>

              {/* Beds */}
              <select
                value={beds ?? ''}
                onChange={e => setBeds(e.target.value ? Number(e.target.value) : null)}
                className="border rounded-lg px-4 py-3 bg-white"
              >
                <option value="">Any Beds</option>
                <option value="1">1+ Bed</option>
                <option value="2">2+ Beds</option>
                <option value="3">3+ Beds</option>
                <option value="4">4+ Beds</option>
              </select>

              {/* Type */}
              <select
                value={propertyType}
                onChange={e => setPropertyType(e.target.value)}
                className="border rounded-lg px-4 py-3 bg-white"
              >
                <option value="">Any Type</option>
                <option value="Condo">Condo</option>
                <option value="Co-op">Co-op</option>
                <option value="Townhouse">Townhouse</option>
                <option value="Loft">Loft</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Results */}
      <section className="py-8">
        <div className="max-w-7xl mx-auto px-4">
          {/* Results Count */}
          <div className="flex items-center justify-between mb-6">
            <p className="text-gray-600">
              {filteredListings.length} {filteredListings.length === 1 ? 'property' : 'properties'} found
            </p>
            <p className="text-sm text-gray-400">
              Sample listings for demonstration
            </p>
          </div>

          {/* Listings Grid */}
          {filteredListings.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-lg">
              <p className="text-gray-500 text-lg mb-2">No properties match your criteria</p>
              <p className="text-gray-400">Try adjusting your filters</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredListings.map(listing => (
                <div
                  key={listing.id}
                  className="bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                >
                  {/* Image */}
                  <div className="relative aspect-[4/3] bg-gray-100">
                    <Image
                      src={listing.image}
                      alt={listing.address}
                      fill
                      className="object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                    {listing.isExclusive && (
                      <span className="absolute top-3 left-3 px-3 py-1 bg-brand-gold text-white text-xs uppercase tracking-wide rounded">
                        Exclusive
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    <p className="text-xl font-semibold mb-1">
                      {formatPrice(listing.price, isRental)}
                    </p>
                    <p className="text-gray-800">{listing.address}</p>
                    <p className="text-gray-500 text-sm">{listing.neighborhood}</p>

                    <div className="flex gap-4 text-sm text-gray-600 mt-3 pt-3 border-t">
                      <span>{listing.beds} bed{listing.beds !== 1 ? 's' : ''}</span>
                      <span>{listing.baths} bath{listing.baths !== 1 ? 's' : ''}</span>
                      {listing.sqft > 0 && <span>{listing.sqft.toLocaleString()} sqft</span>}
                      <span className="text-gray-400">{listing.type}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Contact CTA */}
      <section className="py-16 bg-white border-t">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-semibold mb-4">
            Don&apos;t See What You&apos;re Looking For?
          </h2>
          <p className="text-gray-600 mb-8">
            Our agents have access to exclusive listings and can help you find the perfect property.
          </p>
          <a
            href="/agents"
            className="inline-block px-8 py-3 bg-brand-dark text-white font-medium rounded hover:bg-gray-800 transition-colors"
          >
            Contact an Agent
          </a>
        </div>
      </section>
    </div>
  );
}
