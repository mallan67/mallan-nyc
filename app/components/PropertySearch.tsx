'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import listingsData from '@/data/listings.json';
import type { Listing } from '@/lib/types/listing';

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
  const searchParams = useSearchParams();
  const isRental = type === 'rent';

  // Get all listings of the appropriate type
  const allListings = (listingsData.listings as unknown as Listing[]).filter(
    (l) => (isRental ? l.listingType === 'rent' : l.listingType === 'sale') && l.status === 'active'
  );

  // URL params for initial filters
  const initialNeighborhood = searchParams?.get('neighborhood') || '';
  const initialAmenity = searchParams?.get('amenity') || '';
  const initialBorough = searchParams?.get('borough') || '';

  const [searchQuery, setSearchQuery] = useState('');
  const [priceRange, setPriceRange] = useState<[number, number]>(
    isRental ? [0, 15000] : [0, 5000000]
  );
  const [beds, setBeds] = useState<number | null>(null);
  const [propertyType, setPropertyType] = useState<string>('');
  const [neighborhoodFilter, setNeighborhoodFilter] = useState(initialNeighborhood);
  const [boroughFilter, setBoroughFilter] = useState(initialBorough);
  const [amenityFilter, setAmenityFilter] = useState(initialAmenity);
  const [maintenanceRange, setMaintenanceRange] = useState<[number, number]>([0, 10000]);
  const [petsAllowed, setPetsAllowed] = useState<boolean | null>(null);
  const [sortBy, setSortBy] = useState<'price-asc' | 'price-desc' | 'newest' | 'featured'>('featured');

  // Get unique values for filters
  const boroughs = [...new Set(allListings.map((l) => l.address.borough))].sort();
  const propertyTypes = [...new Set(allListings.map((l) => l.propertyInfo.propertyType))].sort();

  // Reset filters when URL params change
  useEffect(() => {
    setNeighborhoodFilter(searchParams?.get('neighborhood') || '');
    setAmenityFilter(searchParams?.get('amenity') || '');
    setBoroughFilter(searchParams?.get('borough') || '');
  }, [searchParams]);

  // Filter listings
  const filteredListings = allListings.filter((listing) => {
    // Search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const fullAddress = `${listing.address.streetNumber} ${listing.address.streetName} ${listing.address.unit}`.toLowerCase();
      if (
        !fullAddress.includes(query) &&
        !listing.address.neighborhoodDisplay.toLowerCase().includes(query) &&
        !listing.address.zip.includes(query) &&
        !listing.address.borough.toLowerCase().includes(query)
      ) {
        return false;
      }
    }

    // Price range
    if (listing.price.listPrice < priceRange[0] || listing.price.listPrice > priceRange[1]) {
      return false;
    }

    // Beds
    if (beds !== null && listing.propertyInfo.bedroomsTotal < beds) {
      return false;
    }

    // Property type
    if (propertyType && listing.propertyInfo.propertyType !== propertyType) {
      return false;
    }

    // Borough
    if (boroughFilter && listing.address.borough !== boroughFilter) {
      return false;
    }

    // Neighborhood
    if (neighborhoodFilter && listing.address.neighborhood !== neighborhoodFilter) {
      return false;
    }

    // Maintenance fee (for sales only)
    if (!isRental && listing.nycSpecific.maintenanceFee) {
      if (
        listing.nycSpecific.maintenanceFee < maintenanceRange[0] ||
        listing.nycSpecific.maintenanceFee > maintenanceRange[1]
      ) {
        return false;
      }
    }

    // Pets filter
    if (petsAllowed !== null && listing.features.pets.allowed !== petsAllowed) {
      return false;
    }

    // Amenity filters
    if (amenityFilter) {
      const amenityMap: Record<string, (l: Listing) => boolean> = {
        doorman: (l) => l.features.building.doorman,
        'health-club': (l) => l.features.building.gym,
        pets: (l) => l.features.pets.allowed,
        pool: (l) => l.features.building.pool,
        'roof-deck': (l) => l.features.building.roofDeck,
      };
      const checkFn = amenityMap[amenityFilter];
      if (checkFn && !checkFn(listing)) {
        return false;
      }
    }

    return true;
  });

  // Sort listings
  const sortedListings = [...filteredListings].sort((a, b) => {
    switch (sortBy) {
      case 'price-asc':
        return a.price.listPrice - b.price.listPrice;
      case 'price-desc':
        return b.price.listPrice - a.price.listPrice;
      case 'newest':
        return new Date(b.listing.listingDate).getTime() - new Date(a.listing.listingDate).getTime();
      case 'featured':
      default:
        if (a.flags.isFeatured !== b.flags.isFeatured) return b.flags.isFeatured ? 1 : -1;
        if (a.flags.isExclusive !== b.flags.isExclusive) return b.flags.isExclusive ? 1 : -1;
        return new Date(b.listing.listingDate).getTime() - new Date(a.listing.listingDate).getTime();
    }
  });

  const clearFilters = () => {
    setSearchQuery('');
    setPriceRange(isRental ? [0, 15000] : [0, 5000000]);
    setBeds(null);
    setPropertyType('');
    setNeighborhoodFilter('');
    setBoroughFilter('');
    setAmenityFilter('');
    setMaintenanceRange([0, 10000]);
    setPetsAllowed(null);
  };

  const hasActiveFilters =
    searchQuery ||
    beds !== null ||
    propertyType ||
    neighborhoodFilter ||
    boroughFilter ||
    amenityFilter ||
    petsAllowed !== null ||
    (isRental ? priceRange[0] !== 0 || priceRange[1] !== 15000 : priceRange[0] !== 0 || priceRange[1] !== 5000000);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Search Header */}
      <section className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search Input */}
            <div className="flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by address, neighborhood, zip, or borough..."
                className="w-full border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-gold/50"
              />
            </div>

            {/* Filters Row 1 */}
            <div className="flex gap-3 flex-wrap">
              {/* Borough */}
              <select
                value={boroughFilter}
                onChange={(e) => setBoroughFilter(e.target.value)}
                className="border rounded-lg px-4 py-3 bg-white text-sm"
              >
                <option value="">All Boroughs</option>
                {boroughs.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>

              {/* Price */}
              <select
                value={`${priceRange[0]}-${priceRange[1]}`}
                onChange={(e) => {
                  const [min, max] = e.target.value.split('-').map(Number);
                  setPriceRange([min, max]);
                }}
                className="border rounded-lg px-4 py-3 bg-white text-sm"
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
                onChange={(e) => setBeds(e.target.value ? Number(e.target.value) : null)}
                className="border rounded-lg px-4 py-3 bg-white text-sm"
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
                onChange={(e) => setPropertyType(e.target.value)}
                className="border rounded-lg px-4 py-3 bg-white text-sm"
              >
                <option value="">Any Type</option>
                {propertyTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>

              {/* Pets */}
              <select
                value={petsAllowed === null ? '' : petsAllowed ? 'yes' : 'no'}
                onChange={(e) => {
                  if (e.target.value === '') setPetsAllowed(null);
                  else setPetsAllowed(e.target.value === 'yes');
                }}
                className="border rounded-lg px-4 py-3 bg-white text-sm"
              >
                <option value="">Any Pets Policy</option>
                <option value="yes">Pets Allowed</option>
                <option value="no">No Pets</option>
              </select>

              {/* Sort */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="border rounded-lg px-4 py-3 bg-white text-sm"
              >
                <option value="featured">Featured First</option>
                <option value="newest">Newest</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
              </select>
            </div>
          </div>

          {/* Active Filters */}
          {hasActiveFilters && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-500">Active filters:</span>
              {boroughFilter && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-brand-gold/10 text-brand-dark text-sm rounded-full">
                  {boroughFilter}
                  <button onClick={() => setBoroughFilter('')} className="ml-1 hover:text-brand-gold">&times;</button>
                </span>
              )}
              {amenityFilter && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-brand-gold/10 text-brand-dark text-sm rounded-full">
                  {amenityFilter.replace('-', ' ')}
                  <button onClick={() => setAmenityFilter('')} className="ml-1 hover:text-brand-gold">&times;</button>
                </span>
              )}
              {petsAllowed !== null && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-brand-gold/10 text-brand-dark text-sm rounded-full">
                  {petsAllowed ? 'Pets Allowed' : 'No Pets'}
                  <button onClick={() => setPetsAllowed(null)} className="ml-1 hover:text-brand-gold">&times;</button>
                </span>
              )}
              <button
                onClick={clearFilters}
                className="text-sm text-gray-500 hover:text-brand-gold underline"
              >
                Clear all
              </button>
            </div>
          )}

          {/* REBNY Compliance Tooltip */}
          <p className="mt-2 text-xs text-gray-400">
            Searches comply with REBNY RLS data standards for accurate, timely information.
          </p>
        </div>
      </section>

      {/* Results */}
      <section className="py-8">
        <div className="max-w-7xl mx-auto px-4">
          {/* Results Count */}
          <div className="flex items-center justify-between mb-6">
            <p className="text-gray-600">
              {sortedListings.length} {sortedListings.length === 1 ? 'property' : 'properties'} found
            </p>
            <p className="text-sm text-gray-400">
              Data provided by REBNY RLS
            </p>
          </div>

          {/* Listings Grid */}
          {sortedListings.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-lg">
              <p className="text-gray-500 text-lg mb-2">No properties match your criteria</p>
              <p className="text-gray-400 mb-4">Try adjusting your filters</p>
              <button onClick={clearFilters} className="text-brand-gold hover:underline">
                Clear all filters
              </button>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sortedListings.map((listing) => (
                <Link
                  key={listing.id}
                  href={`/listing/${listing.id}`}
                  className="bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-lg transition-shadow group"
                >
                  {/* Image */}
                  <div className="relative aspect-[4/3] bg-gray-100">
                    <Image
                      src={listing.media.images[0]?.url || '/images/listing-placeholder.jpg'}
                      alt={`${listing.address.streetNumber} ${listing.address.streetName}`}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    {listing.flags.isExclusive && (
                      <span className="absolute top-3 left-3 px-3 py-1 bg-brand-gold text-white text-xs uppercase tracking-wide rounded">
                        Exclusive
                      </span>
                    )}
                    {listing.openHouse?.scheduled && (
                      <span className="absolute top-3 right-3 px-3 py-1 bg-white text-brand-dark text-xs rounded shadow">
                        Open House
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    <p className="text-xl font-semibold mb-1">
                      {formatPrice(listing.price.listPrice, isRental)}
                    </p>
                    <p className="text-gray-800">
                      {listing.address.streetNumber} {listing.address.streetName}, {listing.address.unit}
                    </p>
                    <p className="text-gray-500 text-sm">{listing.address.neighborhoodDisplay}, {listing.address.borough}</p>

                    <div className="flex gap-4 text-sm text-gray-600 mt-3 pt-3 border-t">
                      <span>{listing.propertyInfo.bedroomsTotal} bed{listing.propertyInfo.bedroomsTotal !== 1 ? 's' : ''}</span>
                      <span>
                        {listing.propertyInfo.bathroomsFull}
                        {listing.propertyInfo.bathroomsHalf > 0 && `.${listing.propertyInfo.bathroomsHalf}`} bath{listing.propertyInfo.bathroomsFull !== 1 ? 's' : ''}
                      </span>
                      {listing.propertyInfo.aboveGradeFinishedArea > 0 && (
                        <span>{listing.propertyInfo.aboveGradeFinishedArea.toLocaleString()} sqft</span>
                      )}
                      <span className="text-gray-400">{listing.propertyInfo.propertyType}</span>
                    </div>

                    {/* NYC-Specific: Maintenance/CC */}
                    {!isRental && listing.nycSpecific.maintenanceFee && (
                      <p className="text-xs text-gray-400 mt-2">
                        {listing.propertyInfo.propertyType === 'Co-op' ? 'Maint' : 'CC'}: ${listing.nycSpecific.maintenanceFee.toLocaleString()}/mo
                      </p>
                    )}
                  </div>
                </Link>
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
          <Link
            href="/agents"
            className="inline-block px-8 py-3 bg-brand-dark text-white font-medium rounded hover:bg-gray-800 transition-colors"
          >
            Contact an Agent
          </Link>
        </div>
      </section>
    </div>
  );
}
