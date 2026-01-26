'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import listingsData from '@/data/listings.json';
import type { Listing } from '@/lib/types/listing';

export const dynamic = 'force-dynamic';

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

function SearchClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Get search params
  const typeParam = searchParams?.get('type') || 'buy';
  const queryParam = searchParams?.get('q') || '';
  const amenitiesParam = searchParams?.get('amenities') || '';
  const neighborhoodParam = searchParams?.get('neighborhood') || '';
  const zipParam = searchParams?.get('zip') || '';

  const [activeTab, setActiveTab] = useState<'buy' | 'rent' | 'sell' | 'commercial'>(
    typeParam as 'buy' | 'rent' | 'sell' | 'commercial'
  );
  const [searchQuery, setSearchQuery] = useState(queryParam);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 5000000]);
  const [beds, setBeds] = useState<number | null>(null);
  const [propertyType, setPropertyType] = useState<string>('');
  const [sortBy, setSortBy] = useState<'price-asc' | 'price-desc' | 'newest' | 'featured'>('featured');

  // Determine if rentals based on tab
  const isRental = activeTab === 'rent';
  const isCommercial = activeTab === 'commercial';

  // Get all active listings
  const allListings = (listingsData.listings as unknown as Listing[]).filter((l) => {
    if (l.status !== 'active') return false;
    if (isRental) return l.listingType === 'rent';
    if (isCommercial) return l.propertyInfo.propertyType === 'Commercial';
    return l.listingType === 'sale';
  });

  // Get unique values for filters
  const propertyTypes = [...new Set(allListings.map((l) => l.propertyInfo.propertyType))].sort();

  // Update price range when tab changes
  useEffect(() => {
    setPriceRange(isRental ? [0, 15000] : [0, 5000000]);
  }, [isRental]);

  // Filter listings
  const filteredListings = allListings.filter((listing) => {
    // Search query (address, neighborhood, zip)
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

    // Neighborhood param from typeahead
    if (neighborhoodParam && !listing.address.neighborhood.toLowerCase().includes(neighborhoodParam.toLowerCase())) {
      return false;
    }

    // Zip param from typeahead
    if (zipParam && listing.address.zip !== zipParam) {
      return false;
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

    // Amenities from URL
    if (amenitiesParam) {
      const amenities = amenitiesParam.split(',');
      const amenityMap: Record<string, (l: Listing) => boolean> = {
        doorman: (l) => l.features.building.doorman,
        'health-club': (l) => l.features.building.gym,
        pets: (l) => l.features.pets.allowed,
        pool: (l) => l.features.building.pool,
        'roof-deck': (l) => l.features.building.roofDeck,
      };
      for (const amenity of amenities) {
        const checkFn = amenityMap[amenity];
        if (checkFn && !checkFn(listing)) {
          return false;
        }
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

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams?.toString() || '');
    params.set('type', tab);
    router.push(`/search?${params.toString()}`);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setPriceRange(isRental ? [0, 15000] : [0, 5000000]);
    setBeds(null);
    setPropertyType('');
    router.push(`/search?type=${activeTab}`);
  };

  const hasActiveFilters =
    searchQuery ||
    beds !== null ||
    propertyType ||
    neighborhoodParam ||
    zipParam ||
    amenitiesParam ||
    (isRental ? priceRange[0] !== 0 || priceRange[1] !== 15000 : priceRange[0] !== 0 || priceRange[1] !== 5000000);

  return (
    <div className="min-h-screen bg-gray-50 pt-20">
      {/* Search Header - Fixed below nav */}
      <section className="bg-white border-b sticky top-20 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4">
          {/* Tabs */}
          <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
            {(['buy', 'rent', 'sell', 'commercial'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={`px-4 py-2 text-sm font-medium rounded-md capitalize transition-colors ${
                  activeTab === tab
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Search & Filters */}
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search Input */}
            <div className="flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by address, neighborhood, zip, or borough..."
                className="w-full border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-gray-900/20"
              />
            </div>

            {/* Filters */}
            <div className="flex gap-3 flex-wrap">
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
              {neighborhoodParam && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full">
                  {neighborhoodParam}
                </span>
              )}
              {zipParam && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full">
                  ZIP: {zipParam}
                </span>
              )}
              {amenitiesParam && amenitiesParam.split(',').map((a) => (
                <span key={a} className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full capitalize">
                  {a.replace('-', ' ')}
                </span>
              ))}
              <button
                onClick={clearFilters}
                className="text-sm text-gray-500 hover:text-gray-900 underline"
              >
                Clear all
              </button>
            </div>
          )}
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
          </div>

          {/* Listings Grid */}
          {sortedListings.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-lg">
              <p className="text-gray-500 text-lg mb-2">No properties match your criteria</p>
              <p className="text-gray-400 mb-4">Try adjusting your filters</p>
              <button onClick={clearFilters} className="text-gray-900 hover:underline">
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
                      <span className="absolute top-3 left-3 px-3 py-1 bg-black text-white text-xs rounded">
                        Exclusive
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    <p className="text-xl font-semibold mb-1">
                      {formatPrice(listing.price.listPrice, isRental)}
                    </p>
                    <p className="text-gray-800">
                      {listing.address.streetNumber} {listing.address.streetName}
                      {listing.address.unit && `, ${listing.address.unit}`}
                    </p>
                    <p className="text-gray-500 text-sm">
                      {listing.address.neighborhoodDisplay}, {listing.address.borough}
                    </p>

                    <div className="flex gap-4 text-sm text-gray-600 mt-3 pt-3 border-t">
                      <span>{listing.propertyInfo.bedroomsTotal} bed{listing.propertyInfo.bedroomsTotal !== 1 ? 's' : ''}</span>
                      <span>
                        {listing.propertyInfo.bathroomsFull}
                        {listing.propertyInfo.bathroomsHalf > 0 && `.${listing.propertyInfo.bathroomsHalf}`} bath
                      </span>
                      {listing.propertyInfo.aboveGradeFinishedArea > 0 && (
                        <span>{listing.propertyInfo.aboveGradeFinishedArea.toLocaleString()} sqft</span>
                      )}
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
          <h2 className="text-2xl sm:text-3xl font-light tracking-tight mb-4">
            Need Help Finding Your Perfect Property?
          </h2>
          <p className="text-gray-500 mb-8">
            Our agents have access to exclusive listings and can help you find exactly what you&apos;re looking for.
          </p>
          <Link
            href="/agents"
            className="inline-block px-8 py-3 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors"
          >
            Contact an Agent
          </Link>
        </div>
      </section>
    </div>
  );
}

function SearchLoading() {
  return (
    <div className="min-h-screen bg-gray-50 pt-20 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-gray-900 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500">Loading properties...</p>
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      <Header dark />
      <main>
        <Suspense fallback={<SearchLoading />}>
          <SearchClient />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
