'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import IDXImage from '@/app/components/IDXImage';
import { useListings } from '@/lib/hooks/useListings';
import type { DisplayListing } from '@/lib/idx/display-adapter';
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

/** Coming Soon badge text per REBNY */
function formatComingSoonBadge(listing: DisplayListing): string | null {
  if (!listing._displayCompliance.comingSoon) return null;
  return 'Coming Soon';
}

interface PropertySearchProps {
  type: 'buy' | 'rent';
}

export default function PropertySearch({ type }: PropertySearchProps) {
  const searchParams = useSearchParams();
  const isRental = type === 'rent';
  const gridRef = useGsapReveal<HTMLDivElement>({ children: true, y: 50, scale: 0.97 });

  // URL params for initial filters
  const initialNeighborhood = searchParams?.get('neighborhood') || '';
  const initialBorough = searchParams?.get('borough') || '';

  const [searchQuery, setSearchQuery] = useState('');
  const [priceRange, setPriceRange] = useState<[number, number]>(
    isRental ? [0, 99999] : [0, 99999999]
  );
  const [beds, setBeds] = useState<number | null>(null);
  const [baths, setBaths] = useState<number | null>(null);
  const [propertyType, setPropertyType] = useState<string>('');
  const [neighborhoodFilter, setNeighborhoodFilter] = useState(initialNeighborhood);
  const [boroughFilter, setBoroughFilter] = useState(initialBorough);
  const [maintenanceRange, setMaintenanceRange] = useState<[number, number]>([0, 10000]);
  const [petsAllowed, setPetsAllowed] = useState<boolean | null>(null);
  const [sortBy, setSortBy] = useState<string>('newest');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Fetch from API — push filters server-side
  const { listings, loading, error, hasMore, loadMore } = useListings({
    type: type === 'buy' ? 'sale' : 'rent',
    minPrice: priceRange[0] > 0 ? priceRange[0] : undefined,
    maxPrice: priceRange[1] < (isRental ? 99999 : 99999999) ? priceRange[1] : undefined,
    beds,
    minBaths: baths,
    propertyType: propertyType || undefined,
    borough: boroughFilter || undefined,
    neighborhood: neighborhoodFilter || undefined,
    pets: petsAllowed === true ? true : undefined,
    sort: sortBy,
    limit: 100,
  });

  // Derive filter options from results
  const boroughs = useMemo(
    () => [...new Set(listings.map((l) => l.address.borough).filter(Boolean))].sort(),
    [listings]
  );
  const propertyTypes = useMemo(
    () => [...new Set(listings.map((l) => l.propertyType).filter(Boolean))].sort(),
    [listings]
  );

  // Reset filters when URL params change
  useEffect(() => {
    setNeighborhoodFilter(searchParams?.get('neighborhood') || '');
    setBoroughFilter(searchParams?.get('borough') || '');
  }, [searchParams]);

  // Client-side post-filters (text search, maintenance range)
  const filteredListings = useMemo(() => {
    return listings.filter((listing) => {
      // Text search
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const fullAddress = `${listing.address.streetNumber} ${listing.address.streetName} ${listing.address.unitNumber || ''}`.toLowerCase();
        if (
          !fullAddress.includes(query) &&
          !listing.address.neighborhood.toLowerCase().includes(query) &&
          !listing.address.postalCode.includes(query) &&
          !listing.address.borough.toLowerCase().includes(query)
        ) {
          return false;
        }
      }

      // Maintenance fee (for sales only)
      if (!isRental && listing.associationFee) {
        if (
          listing.associationFee < maintenanceRange[0] ||
          listing.associationFee > maintenanceRange[1]
        ) {
          return false;
        }
      }

      return true;
    });
  }, [listings, searchQuery, isRental, maintenanceRange]);

  // Sort listings
  const sortedListings = useMemo(() => {
    return [...filteredListings].sort((a, b) => {
      switch (sortBy) {
        case 'price-asc':
          return a.listPrice - b.listPrice;
        case 'price-desc':
          return b.listPrice - a.listPrice;
        case 'sqft-desc':
          return (b.livingArea || 0) - (a.livingArea || 0);
        case 'newest':
        default:
          return new Date(b.modificationTimestamp).getTime() - new Date(a.modificationTimestamp).getTime();
      }
    });
  }, [filteredListings, sortBy]);

  const clearFilters = () => {
    setSearchQuery('');
    setPriceRange(isRental ? [0, 99999] : [0, 99999999]);
    setBeds(null);
    setBaths(null);
    setPropertyType('');
    setNeighborhoodFilter('');
    setBoroughFilter('');
    setMaintenanceRange([0, 10000]);
    setPetsAllowed(null);
  };

  const hasActiveFilters =
    searchQuery ||
    beds !== null ||
    baths !== null ||
    propertyType ||
    neighborhoodFilter ||
    boroughFilter ||
    petsAllowed !== null ||
    (isRental ? priceRange[0] !== 0 || priceRange[1] !== 99999 : priceRange[0] !== 0 || priceRange[1] !== 99999999);

  // NYC property sub-types (static list matching RESO/REBNY)
  const nycPropertySubTypes = ['Condo', 'Co-op', 'Condop', 'Townhouse', 'Multi-Family', 'Single Family'];

  return (
    <div className="min-h-screen bg-[#FEFEFE] pt-20">
      {/* Search Header */}
      <section className="bg-white/80 backdrop-blur-xl border-b border-black/5 sticky top-20 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3">
          {/* Mobile: compact search row + filters toggle */}
          <div className="flex items-center gap-2" role="search" aria-label="Property search filters">
            <div className="flex-1">
              <label htmlFor="ps-search-query" className="sr-only">Search properties</label>
              <input
                id="ps-search-query"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search address, neighborhood..."
                className="w-full rounded-xl px-3 py-2 lg:px-4 lg:py-3 bg-white/60 ring-1 ring-black/5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                aria-label="Search by address, neighborhood, zip, or borough"
              />
            </div>
            {/* Filters toggle — mobile only */}
            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className="lg:hidden flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium ring-1 ring-black/5 bg-white/60 text-brand-dark/70 flex-shrink-0"
              aria-expanded={filtersOpen}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
              Filters
              {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-brand-gold" />}
            </button>
            {/* Desktop: inline filters */}
            <div className="hidden lg:flex gap-3 flex-wrap">
              <select
                value={boroughFilter}
                onChange={(e) => setBoroughFilter(e.target.value)}
                className="rounded-xl px-3 py-2.5 bg-white/60 ring-1 ring-black/5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                aria-label="Borough"
              >
                <option value="">All Boroughs</option>
                {boroughs.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              <select
                value={`${priceRange[0]}-${priceRange[1]}`}
                onChange={(e) => { const [min, max] = e.target.value.split('-').map(Number); setPriceRange([min, max]); }}
                className="rounded-xl px-3 py-2.5 bg-white/60 ring-1 ring-black/5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                aria-label="Price range"
              >
                <option value={isRental ? '0-99999' : '0-99999999'}>Any Price</option>
                {isRental ? (
                  <>
                    <option value="0-3000">Under $3K</option>
                    <option value="3000-5000">$3K-$5K</option>
                    <option value="5000-7500">$5K-$7.5K</option>
                    <option value="7500-10000">$7.5K-$10K</option>
                    <option value="10000-15000">$10K-$15K</option>
                    <option value="15000-99999">$15K+</option>
                  </>
                ) : (
                  <>
                    <option value="0-750000">Under $750K</option>
                    <option value="750000-1000000">$750K-$1M</option>
                    <option value="1000000-1500000">$1M-$1.5M</option>
                    <option value="1500000-2500000">$1.5M-$2.5M</option>
                    <option value="2500000-5000000">$2.5M-$5M</option>
                    <option value="5000000-10000000">$5M-$10M</option>
                    <option value="10000000-99999999">$10M+</option>
                  </>
                )}
              </select>
              <select
                value={beds ?? ''}
                onChange={(e) => setBeds(e.target.value ? Number(e.target.value) : null)}
                className="rounded-xl px-3 py-2.5 bg-white/60 ring-1 ring-black/5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                aria-label="Beds"
              >
                <option value="">Any Beds</option>
                <option value="0">Studio</option>
                <option value="1">1+</option>
                <option value="2">2+</option>
                <option value="3">3+</option>
                <option value="4">4+</option>
              </select>
              <select
                value={baths ?? ''}
                onChange={(e) => setBaths(e.target.value ? Number(e.target.value) : null)}
                className="rounded-xl px-3 py-2.5 bg-white/60 ring-1 ring-black/5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                aria-label="Baths"
              >
                <option value="">Any Baths</option>
                <option value="1">1+</option>
                <option value="2">2+</option>
                <option value="3">3+</option>
              </select>
              <select
                value={propertyType}
                onChange={(e) => setPropertyType(e.target.value)}
                className="rounded-xl px-3 py-2.5 bg-white/60 ring-1 ring-black/5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                aria-label="Type"
              >
                <option value="">Any Type</option>
                {nycPropertySubTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                {propertyTypes
                  .filter((t) => !nycPropertySubTypes.includes(t))
                  .map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="rounded-xl px-3 py-2.5 bg-white/60 ring-1 ring-black/5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                aria-label="Sort"
              >
                <option value="newest">Newest</option>
                <option value="price-asc">Price: Low</option>
                <option value="price-desc">Price: High</option>
                <option value="sqft-desc">Largest</option>
              </select>
            </div>
          </div>

          {/* Mobile expanded filters */}
          {filtersOpen && (
            <div className="lg:hidden mt-3 grid grid-cols-2 gap-2">
              <select
                value={boroughFilter}
                onChange={(e) => setBoroughFilter(e.target.value)}
                className="rounded-xl px-3 py-2 bg-white/60 ring-1 ring-black/5 text-sm"
                aria-label="Borough"
              >
                <option value="">All Boroughs</option>
                {boroughs.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              <select
                value={`${priceRange[0]}-${priceRange[1]}`}
                onChange={(e) => { const [min, max] = e.target.value.split('-').map(Number); setPriceRange([min, max]); }}
                className="rounded-xl px-3 py-2 bg-white/60 ring-1 ring-black/5 text-sm"
                aria-label="Price"
              >
                <option value={isRental ? '0-99999' : '0-99999999'}>Any Price</option>
                {isRental ? (
                  <>
                    <option value="0-3000">Under $3K</option>
                    <option value="3000-5000">$3K-$5K</option>
                    <option value="5000-7500">$5K-$7.5K</option>
                    <option value="7500-10000">$7.5K-$10K</option>
                    <option value="10000-15000">$10K-$15K</option>
                    <option value="15000-99999">$15K+</option>
                  </>
                ) : (
                  <>
                    <option value="0-750000">Under $750K</option>
                    <option value="750000-1000000">$750K-$1M</option>
                    <option value="1000000-1500000">$1M-$1.5M</option>
                    <option value="1500000-2500000">$1.5M-$2.5M</option>
                    <option value="2500000-5000000">$2.5M-$5M</option>
                    <option value="5000000-10000000">$5M-$10M</option>
                    <option value="10000000-99999999">$10M+</option>
                  </>
                )}
              </select>
              <select
                value={beds ?? ''}
                onChange={(e) => setBeds(e.target.value ? Number(e.target.value) : null)}
                className="rounded-xl px-3 py-2 bg-white/60 ring-1 ring-black/5 text-sm"
                aria-label="Beds"
              >
                <option value="">Any Beds</option>
                <option value="0">Studio</option>
                <option value="1">1+</option>
                <option value="2">2+</option>
                <option value="3">3+</option>
                <option value="4">4+</option>
              </select>
              <select
                value={baths ?? ''}
                onChange={(e) => setBaths(e.target.value ? Number(e.target.value) : null)}
                className="rounded-xl px-3 py-2 bg-white/60 ring-1 ring-black/5 text-sm"
                aria-label="Baths"
              >
                <option value="">Any Baths</option>
                <option value="1">1+</option>
                <option value="2">2+</option>
                <option value="3">3+</option>
              </select>
              <select
                value={propertyType}
                onChange={(e) => setPropertyType(e.target.value)}
                className="rounded-xl px-3 py-2 bg-white/60 ring-1 ring-black/5 text-sm"
                aria-label="Type"
              >
                <option value="">Any Type</option>
                {nycPropertySubTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                {propertyTypes
                  .filter((t) => !nycPropertySubTypes.includes(t))
                  .map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select
                value={petsAllowed === null ? '' : petsAllowed ? 'yes' : 'no'}
                onChange={(e) => { if (e.target.value === '') setPetsAllowed(null); else setPetsAllowed(e.target.value === 'yes'); }}
                className="rounded-xl px-3 py-2 bg-white/60 ring-1 ring-black/5 text-sm"
                aria-label="Pets"
              >
                <option value="">Any Pets</option>
                <option value="yes">Pets OK</option>
                <option value="no">No Pets</option>
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="rounded-xl px-3 py-2 bg-white/60 ring-1 ring-black/5 text-sm"
                aria-label="Sort"
              >
                <option value="newest">Newest</option>
                <option value="price-asc">Price: Low</option>
                <option value="price-desc">Price: High</option>
                <option value="sqft-desc">Largest</option>
              </select>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="col-span-2 text-sm text-brand-dark/50 hover:text-brand-gold py-1"
                >
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Results + Sidebar */}
      <section className="py-8">
        <div className="max-w-7xl mx-auto px-4">
          {/* Results Count */}
          <div className="flex items-center justify-between mb-6">
            <p className="text-brand-dark/60" aria-live="polite" aria-atomic="true">
              {loading ? 'Searching...' : `${sortedListings.length} ${sortedListings.length === 1 ? 'property' : 'properties'} found`}
            </p>
            <IDXSearchDisclaimer />
          </div>

          {/* Error State */}
          {error && (
            <div className="text-center py-8 glass-card rounded-3xl mb-6">
              <p className="text-red-500 mb-2">{error}</p>
              <button onClick={clearFilters} className="text-brand-gold hover:underline text-sm">
                Try again
              </button>
            </div>
          )}

          {/* Loading Skeleton */}
          {loading && !error && (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="glass-card rounded-3xl overflow-hidden animate-pulse">
                  <div className="aspect-[4/3] bg-gray-200" />
                  <div className="p-5 space-y-3">
                    <div className="h-6 bg-gray-200 rounded w-1/3" />
                    <div className="h-4 bg-gray-200 rounded w-2/3" />
                    <div className="h-4 bg-gray-200 rounded w-1/2" />
                    <div className="h-px bg-gray-100 mt-3" />
                    <div className="flex gap-4">
                      <div className="h-4 bg-gray-200 rounded w-12" />
                      <div className="h-4 bg-gray-200 rounded w-12" />
                      <div className="h-4 bg-gray-200 rounded w-16" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Listings Grid */}
          {!loading && sortedListings.length === 0 && !error ? (
            <div className="text-center py-16 glass-card rounded-3xl">
              <p className="text-brand-dark/50 text-lg mb-2">No properties match your criteria</p>
              <p className="text-brand-dark/40 mb-4">Try adjusting your filters</p>
              <button onClick={clearFilters} className="text-brand-gold hover:underline">
                Clear all filters
              </button>
            </div>
          ) : !loading && (
            <>
              <div ref={gridRef} className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sortedListings.map((listing) => (
                  <Link
                    key={listing.id}
                    href={`/listing/${listing.slug}?key=${encodeURIComponent(listing.id)}`}
                    className="glass-card rounded-3xl overflow-hidden hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(0,0,0,0.06)] transition-all duration-300 group"
                  >
                    {/* IDXImage: native <img> for IDX photos */}
                    <div className="relative overflow-hidden">
                      <IDXImage
                        src={listing.media[0]?.url || '/images/listing-placeholder.svg'}
                        alt={`${listing.address.streetNumber} ${listing.address.streetName}`}
                        aspect="card"
                        className="group-hover:scale-105 transition-transform duration-700"
                      />
                      {formatComingSoonBadge(listing) && (
                        <span className="absolute top-3 left-3 px-3 py-1 bg-amber-500 text-white text-xs rounded-xl">
                          {formatComingSoonBadge(listing)}
                        </span>
                      )}
                      {/* Photo count + tour badges — top right */}
                      <div className="absolute top-3 right-3 flex gap-1.5 z-10">
                        {listing.media.length > 0 && (
                          <span className="flex items-center gap-1 bg-black/60 backdrop-blur-sm text-white text-[11px] px-2 py-1 rounded-lg">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            {listing.photosCount || listing.media.length}
                          </span>
                        )}
                        {listing.virtualTourURL && (
                          <span className="flex items-center bg-black/60 backdrop-blur-sm text-white text-[11px] px-2 py-1 rounded-lg" title="3D Tour">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-5">
                      <p className="text-xl font-display font-semibold mb-1">
                        {formatPrice(listing.listPrice, isRental)}
                      </p>
                      <p className="text-brand-dark/80">
                        {listing.address.streetName === 'Address Undisclosed' ? (
                          <span className="italic text-brand-dark/50">Address Undisclosed</span>
                        ) : (
                          <>
                            {listing.address.streetNumber} {listing.address.streetName}
                            {listing.address.unitNumber && `, ${listing.address.unitNumber}`}
                          </>
                        )}
                      </p>
                      <p className="text-brand-dark/50 text-sm">
                        {listing.address.neighborhood ? `${listing.address.neighborhood}, ` : ''}{listing.address.borough}
                      </p>

                      <div className="flex gap-4 text-sm text-brand-dark/60 mt-3 pt-3 border-t border-black/5">
                        <span>{listing.bedroomsTotal} bed{listing.bedroomsTotal !== 1 ? 's' : ''}</span>
                        <span>
                          {listing.bathroomsFull}
                          {listing.bathroomsHalf > 0 && `.${listing.bathroomsHalf}`} bath{listing.bathroomsFull !== 1 ? 's' : ''}
                        </span>
                        {listing.livingArea && listing.livingArea > 0 && (
                          <span>{listing.livingArea.toLocaleString()} sqft</span>
                        )}
                        <span className="text-brand-dark/40">{listing.propertyType}</span>
                      </div>

                      {/* NYC-Specific: Maintenance/CC */}
                      {!isRental && listing.associationFee && (
                        <p className="text-xs text-brand-dark/40 mt-2">
                          {listing.propertyType === 'Co-op' ? 'Maint' : 'CC'}: ${listing.associationFee.toLocaleString()}/mo
                        </p>
                      )}

                      {/* Quick calculator insight */}
                      {!isRental ? (() => {
                        const loanAmt = listing.listPrice * 0.8;
                        const mr = 0.065 / 12;
                        const mo = Math.round((loanAmt * mr * Math.pow(1 + mr, 360)) / (Math.pow(1 + mr, 360) - 1));
                        const cc = Math.round(listing.listPrice * 0.03 / 1000);
                        return (
                          <p className="text-[11px] text-brand-dark/50 mt-2 flex items-center gap-1">
                            <svg className="w-3 h-3 text-brand-gold flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            Est. <strong className="text-brand-dark/70">${mo.toLocaleString()}/mo</strong> &middot; Closing ~${cc}K
                          </p>
                        );
                      })() : (() => {
                        const eqBuy = Math.round(listing.listPrice * 12 / 0.05 / 1000000 * 10) / 10;
                        return (
                          <p className="text-[11px] text-brand-dark/50 mt-2 flex items-center gap-1">
                            <svg className="w-3 h-3 text-brand-gold flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>
                            Rent vs Buy: own equivalent ~${eqBuy}M
                          </p>
                        );
                      })()}

                      {/* RLS attribution — bottom of card */}
                      <p className="text-[10px] text-brand-dark/30 mt-2 pt-2 border-t border-black/5">
                        <span className="font-semibold tracking-wide">RLS</span>
                        {' '}&middot;{' '}{listing.listOfficeName}
                        {listing.modificationTimestamp && (
                          <> &middot; {new Date(listing.modificationTimestamp).toLocaleDateString()}</>
                        )}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Load More */}
              {hasMore && (
                <div className="text-center mt-8">
                  <button
                    onClick={loadMore}
                    className="px-8 py-3 bg-brand-dark text-white font-medium rounded-2xl hover:bg-brand-dark/90 transition-colors"
                  >
                    Load More Properties
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Contact CTA */}
      <section className="py-16 bg-gray-50/50 border-t border-black/5">
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
