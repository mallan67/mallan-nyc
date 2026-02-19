'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import listingsData from '@/data/listings.json';
import type { Listing } from '@/lib/types/listing';
import { isDisplayableInIDX, canDisplayAddress, getComingSoonDate, formatComingSoonBadge } from '@/lib/compliance/idx-display-gate';
import { IDXSearchDisclaimer } from '@/app/components/IDXDisclaimer';

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
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 99999999]);
  const [beds, setBeds] = useState<number | null>(null);
  const [propertyType, setPropertyType] = useState<string>('');
  const [sortBy, setSortBy] = useState<'price-asc' | 'price-desc' | 'newest' | 'featured'>('featured');

  // Determine if rentals based on tab
  const isRental = activeTab === 'rent';

  // Get all active listings
  // Note: "commercial" and "sell" tabs show sale listings (commercial property type doesn't exist in data)
  const allListings = (listingsData.listings as unknown as Listing[]).filter((l) => {
    // REBNY RLS: Enforce all 6 distribution gates via centralized utility
    if (!isDisplayableInIDX(l)) return false;
    if (isRental) return l.listingType === 'rent';
    return l.listingType === 'sale';
  });

  // RESO compliance: Property types use display labels that map to RESO 3-field system:
  // "Condo" → PropertyType:Residential + CommonInterest:Condominium
  // "Co-op" → PropertyType:Residential + CommonInterest:StockCooperative
  // "Townhouse" → PropertyType:Residential + PropertySubType:Townhouse
  // Full mapping in lib/compliance/reso-mapper.ts
  const propertyTypes = [...new Set(allListings.map((l) => l.propertyInfo.propertyType))].sort();

  // Update price range when tab changes
  useEffect(() => {
    setPriceRange(isRental ? [0, 99999] : [0, 99999999]);
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
    setPriceRange(isRental ? [0, 99999] : [0, 99999999]);
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
    (isRental ? priceRange[0] !== 0 || priceRange[1] !== 99999 : priceRange[0] !== 0 || priceRange[1] !== 99999999);

  return (
    <div className="min-h-screen bg-[#FEFEFE]">
      {/* Search Header - Fixed below nav header */}
      <section className="fixed top-20 left-0 right-0 bg-white/80 backdrop-blur-xl border-b border-black/5 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          {/* Tabs */}
          <div className="flex gap-1 mb-4 bg-gray-100/60 rounded-2xl p-1 w-fit">
            {(['buy', 'rent', 'sell', 'commercial'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={`px-4 py-2 text-sm font-medium rounded-xl capitalize transition-colors ${
                  activeTab === tab
                    ? 'bg-white text-brand-dark shadow-sm rounded-xl'
                    : 'text-brand-dark/60 hover:text-brand-dark'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Search & Filters */}
          <div className="flex flex-col lg:flex-row gap-4" role="search" aria-label="Property search filters">
            {/* Search Input */}
            <div className="flex-1">
              <label htmlFor="search-query" className="sr-only">Search properties</label>
              <input
                id="search-query"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by address, neighborhood, zip, or borough..."
                className="w-full rounded-2xl px-4 py-3 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                aria-label="Search by address, neighborhood, zip, or borough"
              />
            </div>

            {/* Filters */}
            <div className="flex gap-3 flex-wrap">
              {/* Price */}
              <label htmlFor="price-filter" className="sr-only">Price range</label>
              <select
                id="price-filter"
                value={`${priceRange[0]}-${priceRange[1]}`}
                onChange={(e) => {
                  const [min, max] = e.target.value.split('-').map(Number);
                  setPriceRange([min, max]);
                }}
                className="rounded-2xl px-4 py-3 bg-white/60 ring-1 ring-black/5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                aria-label="Price range"
              >
                <option value={isRental ? '0-99999' : '0-99999999'}>Any Price</option>
                {isRental ? (
                  <>
                    <option value="0-3000">Under $3,000</option>
                    <option value="3000-5000">$3,000 - $5,000</option>
                    <option value="5000-7500">$5,000 - $7,500</option>
                    <option value="7500-10000">$7,500 - $10,000</option>
                    <option value="10000-15000">$10,000 - $15,000</option>
                    <option value="15000-99999">$15,000+</option>
                  </>
                ) : (
                  <>
                    <option value="0-750000">Under $750K</option>
                    <option value="750000-1000000">$750K - $1M</option>
                    <option value="1000000-1500000">$1M - $1.5M</option>
                    <option value="1500000-2500000">$1.5M - $2.5M</option>
                    <option value="2500000-5000000">$2.5M - $5M</option>
                    <option value="5000000-10000000">$5M - $10M</option>
                    <option value="10000000-99999999">$10M+</option>
                  </>
                )}
              </select>

              {/* Beds */}
              <label htmlFor="beds-filter" className="sr-only">Number of bedrooms</label>
              <select
                id="beds-filter"
                value={beds ?? ''}
                onChange={(e) => setBeds(e.target.value ? Number(e.target.value) : null)}
                className="rounded-2xl px-4 py-3 bg-white/60 ring-1 ring-black/5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                aria-label="Number of bedrooms"
              >
                <option value="">Any Beds</option>
                <option value="0">Studio</option>
                <option value="1">1+ Bed</option>
                <option value="2">2+ Beds</option>
                <option value="3">3+ Beds</option>
                <option value="4">4+ Beds</option>
              </select>

              {/* Type */}
              <label htmlFor="type-filter" className="sr-only">Property type</label>
              <select
                id="type-filter"
                value={propertyType}
                onChange={(e) => setPropertyType(e.target.value)}
                className="rounded-2xl px-4 py-3 bg-white/60 ring-1 ring-black/5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                aria-label="Property type"
              >
                <option value="">Any Type</option>
                {propertyTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>

              {/* Sort */}
              <label htmlFor="sort-filter" className="sr-only">Sort order</label>
              <select
                id="sort-filter"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="rounded-2xl px-4 py-3 bg-white/60 ring-1 ring-black/5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                aria-label="Sort order"
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
              <span className="text-sm text-brand-dark/50">Active filters:</span>
              {neighborhoodParam && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-brand-gold/10 text-brand-dark text-sm rounded-full">
                  {neighborhoodParam}
                </span>
              )}
              {zipParam && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-brand-gold/10 text-brand-dark text-sm rounded-full">
                  ZIP: {zipParam}
                </span>
              )}
              {amenitiesParam && amenitiesParam.split(',').map((a) => (
                <span key={a} className="inline-flex items-center gap-1 px-3 py-1 bg-brand-gold/10 text-brand-dark text-sm rounded-full capitalize">
                  {a.replace('-', ' ')}
                </span>
              ))}
              <button
                onClick={clearFilters}
                className="text-sm text-brand-dark/50 hover:text-brand-dark underline"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Results - pt accounts for fixed header (80px) + fixed search bar (~180px) */}
      <section className="pt-[280px] pb-8">
        <div className="max-w-7xl mx-auto px-4">
          {/* Results Count */}
          <div className="flex items-center justify-between mb-6">
            <p className="text-brand-dark/60" aria-live="polite" aria-atomic="true">
              {sortedListings.length} {sortedListings.length === 1 ? 'property' : 'properties'} found
            </p>
            <IDXSearchDisclaimer />
          </div>

          {/* Listings Grid */}
          {sortedListings.length === 0 ? (
            <div className="text-center py-16 glass-card rounded-3xl">
              <p className="text-brand-dark/50 text-lg mb-2">No properties match your criteria</p>
              <p className="text-brand-dark/40 mb-4">Try adjusting your filters</p>
              <button onClick={clearFilters} className="text-brand-dark hover:underline">
                Clear all filters
              </button>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sortedListings.map((listing) => (
                <Link
                  key={listing.id}
                  href={`/listing/${listing.id}`}
                  className="glass-card rounded-3xl overflow-hidden hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(0,0,0,0.06)] transition-all duration-300 group"
                >
                  {/* Image */}
                  <div className="relative aspect-[4/3] bg-gray-100">
                    <Image
                      src={listing.media.images[0]?.url || '/images/listing-placeholder.svg'}
                      alt={`${listing.address.streetNumber} ${listing.address.streetName}`}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                    {listing.flags.isExclusive && (
                      <span className="absolute top-3 left-3 px-3 py-1 bg-black/80 backdrop-blur-sm text-white text-xs rounded-xl">
                        Exclusive
                      </span>
                    )}
                    {getComingSoonDate(listing) && (
                      <span className="absolute top-3 left-3 px-3 py-1 bg-amber-500 text-white text-xs rounded-xl">
                        {formatComingSoonBadge(getComingSoonDate(listing)!)}
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-5">
                    <p className="text-xl font-display font-semibold mb-1">
                      {formatPrice(listing.price.listPrice, isRental)}
                    </p>
                    <p className="text-brand-dark">
                      {canDisplayAddress(listing) ? (
                        <>
                          {listing.address.streetNumber} {listing.address.streetName}
                          {listing.address.unit && `, ${listing.address.unit}`}
                        </>
                      ) : (
                        <span className="italic text-brand-dark/50">Address Undisclosed</span>
                      )}
                    </p>
                    <p className="text-brand-dark/50 text-sm">
                      {listing.address.neighborhoodDisplay}, {listing.address.borough}
                    </p>

                    <div className="flex gap-4 text-sm text-brand-dark/60 mt-3 pt-3 border-t border-black/5">
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
                      <p className="text-xs text-brand-dark/40 mt-2">
                        {listing.propertyInfo.propertyType === 'Co-op' ? 'Maint' : 'CC'}: ${listing.nycSpecific.maintenanceFee.toLocaleString()}/mo
                      </p>
                    )}

                    {/* REBNY RLS Per-Card Attribution */}
                    <p className="text-[10px] text-brand-dark/40 mt-2 pt-2 border-t border-black/5">
                      Courtesy of {listing.agent.listOfficeName}
                      {listing.listing.modificationTimestamp && (
                        <> · Updated {new Date(listing.listing.modificationTimestamp).toLocaleDateString()}</>
                      )}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Contact CTA */}
      <section className="py-16 bg-gray-50/50 border-t border-black/5">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-xl sm:text-2xl font-display font-semibold mb-4">
            Need Help Finding Your Perfect Property?
          </h2>
          <p className="text-brand-dark/50 mb-8">
            Our agents have access to exclusive listings and can help you find exactly what you&apos;re looking for.
          </p>
          <Link
            href="/agents"
            className="inline-block px-8 py-3 bg-brand-dark text-white font-medium rounded-2xl hover:bg-brand-dark/90 transition-colors"
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
    <div className="min-h-screen bg-[#FEFEFE] pt-20 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-brand-dark border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-brand-dark/50">Loading properties...</p>
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
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
