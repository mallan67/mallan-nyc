'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import IDXImage from '@/app/components/IDXImage';
import listingsData from '@/data/listings.json';
import type { Listing } from '@/lib/types/listing';
import { isDisplayableInIDX, canDisplayAddress, getComingSoonDate, formatComingSoonBadge } from '@/lib/compliance/idx-display-gate';
import { IDXSearchDisclaimer } from '@/app/components/IDXDisclaimer';
import { useGsapReveal } from '@/lib/hooks/useGsapReveal';

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
  const gridRef = useGsapReveal<HTMLDivElement>({ children: true, y: 50, scale: 0.97 });

  // Get all listings of the appropriate type
  // REBNY RLS: Enforce all 6 distribution gates via centralized utility
  const allListings = (listingsData.listings as unknown as Listing[]).filter(
    (l) => isDisplayableInIDX(l) && (isRental ? l.listingType === 'rent' : l.listingType === 'sale')
  );

  // URL params for initial filters
  const initialNeighborhood = searchParams?.get('neighborhood') || '';
  const initialAmenity = searchParams?.get('amenity') || '';
  const initialBorough = searchParams?.get('borough') || '';

  const [searchQuery, setSearchQuery] = useState('');
  const [priceRange, setPriceRange] = useState<[number, number]>(
    isRental ? [0, 99999] : [0, 99999999]
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
    setPriceRange(isRental ? [0, 99999] : [0, 99999999]);
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
    (isRental ? priceRange[0] !== 0 || priceRange[1] !== 99999 : priceRange[0] !== 0 || priceRange[1] !== 99999999);

  return (
    <div className="min-h-screen bg-[#FEFEFE] pt-20">
      {/* Search Header */}
      <section className="bg-white/80 backdrop-blur-xl border-b border-black/5 sticky top-20 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4">
          {/* Back to Home Link */}
          <div className="mb-4">
            <Link href="/" className="inline-flex items-center gap-2 text-sm text-brand-dark/60 hover:text-brand-dark transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Home
            </Link>
          </div>
          <div className="flex flex-col lg:flex-row gap-4" role="search" aria-label="Property search filters">
            {/* Search Input */}
            <div className="flex-1">
              <label htmlFor="ps-search-query" className="sr-only">Search properties</label>
              <input
                id="ps-search-query"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by address, neighborhood, zip, or borough..."
                className="w-full rounded-2xl px-4 py-3 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                aria-label="Search by address, neighborhood, zip, or borough"
              />
            </div>

            {/* Filters Row 1 */}
            <div className="flex gap-3 flex-wrap">
              {/* Borough */}
              <label htmlFor="ps-borough-filter" className="sr-only">Borough</label>
              <select
                id="ps-borough-filter"
                value={boroughFilter}
                onChange={(e) => setBoroughFilter(e.target.value)}
                className="rounded-2xl px-4 py-3 bg-white/60 ring-1 ring-black/5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                aria-label="Borough"
              >
                <option value="">All Boroughs</option>
                {boroughs.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>

              {/* Price */}
              <label htmlFor="ps-price-filter" className="sr-only">Price range</label>
              <select
                id="ps-price-filter"
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
              <label htmlFor="ps-beds-filter" className="sr-only">Number of bedrooms</label>
              <select
                id="ps-beds-filter"
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
              <label htmlFor="ps-type-filter" className="sr-only">Property type</label>
              <select
                id="ps-type-filter"
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

              {/* Pets */}
              <label htmlFor="ps-pets-filter" className="sr-only">Pets policy</label>
              <select
                id="ps-pets-filter"
                value={petsAllowed === null ? '' : petsAllowed ? 'yes' : 'no'}
                onChange={(e) => {
                  if (e.target.value === '') setPetsAllowed(null);
                  else setPetsAllowed(e.target.value === 'yes');
                }}
                className="rounded-2xl px-4 py-3 bg-white/60 ring-1 ring-black/5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                aria-label="Pets policy"
              >
                <option value="">Any Pets Policy</option>
                <option value="yes">Pets Allowed</option>
                <option value="no">No Pets</option>
              </select>

              {/* Sort */}
              <label htmlFor="ps-sort-filter" className="sr-only">Sort order</label>
              <select
                id="ps-sort-filter"
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
                className="text-sm text-brand-dark/50 hover:text-brand-gold underline"
              >
                Clear all
              </button>
            </div>
          )}

          {/* REBNY Compliance Tooltip */}
          <p className="mt-2 text-xs text-brand-dark/40">
            Searches comply with REBNY RLS data standards for accurate, timely information.
          </p>
        </div>
      </section>

      {/* Results + Sidebar */}
      <section className="py-8">
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
              <button onClick={clearFilters} className="text-brand-gold hover:underline">
                Clear all filters
              </button>
            </div>
          ) : (
            <div ref={gridRef} className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sortedListings.map((listing) => (
                <Link
                  key={listing.id}
                  href={`/listing/${listing.id}`}
                  className="glass-card rounded-3xl overflow-hidden hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(0,0,0,0.06)] transition-all duration-300 group"
                >
                  {/* IDXImage: native <img> for IDX (exclusives) + R2 (all other) photos */}
                  <div className="relative overflow-hidden">
                    <IDXImage
                      src={listing.media.images[0]?.url || '/images/listing-placeholder.svg'}
                      alt={`${listing.address.streetNumber} ${listing.address.streetName}`}
                      aspect="card"
                      className="group-hover:scale-105 transition-transform duration-700"
                    />
                    {listing.flags.isExclusive && (
                      <span className="absolute top-3 left-3 px-3 py-1 bg-brand-gold text-white text-xs uppercase tracking-wide rounded-xl">
                        Exclusive
                      </span>
                    )}
                    {getComingSoonDate(listing) && (
                      <span className="absolute top-3 left-3 px-3 py-1 bg-amber-500 text-white text-xs rounded-xl">
                        {formatComingSoonBadge(getComingSoonDate(listing)!)}
                      </span>
                    )}
                    {listing.openHouse?.scheduled && !getComingSoonDate(listing) && (
                      <span className="absolute top-3 right-3 px-3 py-1 bg-white text-brand-dark text-xs rounded-xl shadow">
                        Open House
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-5">
                    <p className="text-xl font-display font-semibold mb-1">
                      {formatPrice(listing.price.listPrice, isRental)}
                    </p>
                    <p className="text-brand-dark/80">
                      {canDisplayAddress(listing) ? (
                        <>
                          {listing.address.streetNumber} {listing.address.streetName}, {listing.address.unit}
                        </>
                      ) : (
                        <span className="italic text-brand-dark/50">Address Undisclosed</span>
                      )}
                    </p>
                    <p className="text-brand-dark/50 text-sm">{listing.address.neighborhoodDisplay}, {listing.address.borough}</p>

                    <div className="flex gap-4 text-sm text-brand-dark/60 mt-3 pt-3 border-t border-black/5">
                      <span>{listing.propertyInfo.bedroomsTotal} bed{listing.propertyInfo.bedroomsTotal !== 1 ? 's' : ''}</span>
                      <span>
                        {listing.propertyInfo.bathroomsFull}
                        {listing.propertyInfo.bathroomsHalf > 0 && `.${listing.propertyInfo.bathroomsHalf}`} bath{listing.propertyInfo.bathroomsFull !== 1 ? 's' : ''}
                      </span>
                      {listing.propertyInfo.aboveGradeFinishedArea > 0 && (
                        <span>{listing.propertyInfo.aboveGradeFinishedArea.toLocaleString()} sqft</span>
                      )}
                      <span className="text-brand-dark/40">{listing.propertyInfo.propertyType}</span>
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
      <section className="py-16 bg-stone-50/50 border-t border-black/5">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-xl font-display font-semibold mb-4">
            Don&apos;t See What You&apos;re Looking For?
          </h2>
          <p className="text-brand-dark/60 mb-8">
            Our agents have access to exclusive listings and can help you find the perfect property.
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
