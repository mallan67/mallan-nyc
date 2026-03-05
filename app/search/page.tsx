'use client';

import { Suspense, useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import IDXImage from '@/app/components/IDXImage';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import { useListings } from '@/lib/hooks/useListings';
import type { DisplayListing } from '@/lib/idx/display-adapter';
import { IDXSearchDisclaimer } from '@/app/components/IDXDisclaimer';
import SearchAutocomplete from '@/app/components/SearchAutocomplete';
import nextDynamic from 'next/dynamic';

export const dynamic = 'force-dynamic';

const SearchMap = nextDynamic(() => import('@/app/components/SearchMap'), { ssr: false });

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

/** Coming Soon badge text per REBNY: "Coming Soon. No Showings or Open House until [date]" */
function formatComingSoonBadge(listing: DisplayListing): string | null {
  if (!listing._displayCompliance.comingSoon) return null;
  return 'Coming Soon';
}

type ViewMode = 'grid' | 'list' | 'map';

function SearchClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Get search params
  const typeParam = searchParams?.get('type') || 'buy';
  const queryParam = searchParams?.get('q') || '';
  const neighborhoodParam = searchParams?.get('neighborhood') || '';
  const zipParam = searchParams?.get('zip') || '';

  const [activeTab, setActiveTab] = useState<'buy' | 'rent' | 'commercial'>(
    (typeParam === 'sell' ? 'buy' : typeParam) as 'buy' | 'rent' | 'commercial'
  );
  const [searchQuery, setSearchQuery] = useState(queryParam);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 99999999]);
  const [beds, setBeds] = useState<number | null>(null);
  const [baths, setBaths] = useState<number | null>(null);
  const [propertyType, setPropertyType] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [minSqft, setMinSqft] = useState<number | null>(null);
  const [maxSqft, setMaxSqft] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<string>('newest');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  const isRental = activeTab === 'rent';

  // Fetch from API with server-side filters
  const { listings, loading, error, total, hasMore, loadMore } = useListings({
    type: activeTab === 'commercial' ? 'sale' : activeTab === 'buy' ? 'sale' : 'rent',
    minPrice: priceRange[0] > 0 ? priceRange[0] : undefined,
    maxPrice: priceRange[1] < (isRental ? 99999 : 99999999) ? priceRange[1] : undefined,
    beds,
    minBaths: baths,
    propertyType: propertyType || undefined,
    status: statusFilter || undefined,
    minSqft: minSqft || undefined,
    maxSqft: maxSqft || undefined,
    sort: sortBy,
    neighborhood: neighborhoodParam || undefined,
    limit: 50,
  });

  // Derive property types from current results for the filter dropdown
  const propertyTypes = useMemo(
    () => [...new Set(listings.map((l) => l.propertyType).filter(Boolean))].sort(),
    [listings]
  );

  // NYC property sub-types (static list matching RESO/REBNY)
  const nycPropertySubTypes = ['Condo', 'Co-op', 'Condop', 'Townhouse', 'Multi-Family', 'Single Family'];

  // Update price range when tab changes
  useEffect(() => {
    setPriceRange(isRental ? [0, 99999] : [0, 99999999]);
  }, [isRental]);

  // Client-side post-filters (text search, zip — can't push to API)
  const filteredListings = useMemo(() => {
    return listings.filter((listing) => {
      // Text search (address, neighborhood, zip, borough)
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

      // Zip param from typeahead
      if (zipParam && listing.address.postalCode !== zipParam) {
        return false;
      }

      return true;
    });
  }, [listings, searchQuery, zipParam]);

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

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams?.toString() || '');
    params.set('type', tab);
    router.push(`/search?${params.toString()}`);
  };

  const handleAutocompleteSelect = useCallback((suggestion: { address: string; neighborhood?: string; borough?: string; postalCode?: string }) => {
    if (suggestion.postalCode) {
      const params = new URLSearchParams(searchParams?.toString() || '');
      params.set('zip', suggestion.postalCode);
      router.push(`/search?${params.toString()}`);
    } else {
      setSearchQuery(suggestion.address);
    }
  }, [searchParams, router]);

  const clearFilters = () => {
    setSearchQuery('');
    setPriceRange(isRental ? [0, 99999] : [0, 99999999]);
    setBeds(null);
    setBaths(null);
    setPropertyType('');
    setStatusFilter('');
    setMinSqft(null);
    setMaxSqft(null);
    router.push(`/search?type=${activeTab}`);
  };

  const hasActiveFilters =
    searchQuery ||
    beds !== null ||
    baths !== null ||
    propertyType ||
    statusFilter ||
    minSqft !== null ||
    maxSqft !== null ||
    neighborhoodParam ||
    zipParam ||
    (isRental ? priceRange[0] !== 0 || priceRange[1] !== 99999 : priceRange[0] !== 0 || priceRange[1] !== 99999999);

  return (
    <div className="min-h-screen bg-[#FEFEFE]">
      {/* Search Header */}
      <section className="pt-20 lg:pt-0 lg:fixed lg:top-20 lg:left-0 lg:right-0 bg-white/80 backdrop-blur-xl border-b border-black/5 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 lg:py-4">
          {/* Tabs */}
          <div className="flex gap-1 mb-3 lg:mb-4 bg-gray-100/60 rounded-2xl p-1 w-fit">
            {(['buy', 'rent', 'commercial'] as const).map((tab) => (
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
            {/* Search Input with Autocomplete */}
            <div className="flex-1">
              <SearchAutocomplete
                value={searchQuery}
                onChange={setSearchQuery}
                onSelect={handleAutocompleteSelect}
                placeholder="Search by address, neighborhood, zip, or borough..."
              />
            </div>

            {/* Primary Filters */}
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

              {/* Baths */}
              <label htmlFor="baths-filter" className="sr-only">Number of bathrooms</label>
              <select
                id="baths-filter"
                value={baths ?? ''}
                onChange={(e) => setBaths(e.target.value ? Number(e.target.value) : null)}
                className="rounded-2xl px-4 py-3 bg-white/60 ring-1 ring-black/5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                aria-label="Number of bathrooms"
              >
                <option value="">Any Baths</option>
                <option value="1">1+ Bath</option>
                <option value="2">2+ Baths</option>
                <option value="3">3+ Baths</option>
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
                {nycPropertySubTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
                {/* Also include any types from API results not in the static list */}
                {propertyTypes
                  .filter((t) => !nycPropertySubTypes.includes(t))
                  .map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
              </select>

              {/* More Filters Toggle */}
              <button
                onClick={() => setShowMoreFilters(!showMoreFilters)}
                className={`rounded-2xl px-4 py-3 text-sm font-medium ring-1 ring-black/5 transition-colors ${
                  showMoreFilters ? 'bg-brand-dark text-white' : 'bg-white/60 text-brand-dark/70 hover:bg-white'
                }`}
                aria-expanded={showMoreFilters}
              >
                More Filters
                {(statusFilter || minSqft || maxSqft) && (
                  <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-brand-gold inline-block" />
                )}
              </button>

              {/* Sort */}
              <label htmlFor="sort-filter" className="sr-only">Sort order</label>
              <select
                id="sort-filter"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="rounded-2xl px-4 py-3 bg-white/60 ring-1 ring-black/5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                aria-label="Sort order"
              >
                <option value="newest">Newest</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
                <option value="sqft-desc">Largest</option>
              </select>
            </div>
          </div>

          {/* More Filters Panel */}
          {showMoreFilters && (
            <div className="mt-3 flex gap-4 flex-wrap items-end p-3 bg-gray-50/50 rounded-2xl">
              {/* Status */}
              <div>
                <label className="block text-xs font-medium text-brand-dark/50 mb-1">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-xl px-3 py-2 bg-white ring-1 ring-black/5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                >
                  <option value="">All Active</option>
                  <option value="Active">Active</option>
                  <option value="ComingSoon">Coming Soon</option>
                  <option value="ActiveUnderContract">Under Contract</option>
                </select>
              </div>

              {/* Min Sqft */}
              <div>
                <label className="block text-xs font-medium text-brand-dark/50 mb-1">Min Sqft</label>
                <input
                  type="number"
                  value={minSqft ?? ''}
                  onChange={(e) => setMinSqft(e.target.value ? Number(e.target.value) : null)}
                  placeholder="No min"
                  className="w-28 rounded-xl px-3 py-2 bg-white ring-1 ring-black/5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                />
              </div>

              {/* Max Sqft */}
              <div>
                <label className="block text-xs font-medium text-brand-dark/50 mb-1">Max Sqft</label>
                <input
                  type="number"
                  value={maxSqft ?? ''}
                  onChange={(e) => setMaxSqft(e.target.value ? Number(e.target.value) : null)}
                  placeholder="No max"
                  className="w-28 rounded-xl px-3 py-2 bg-white ring-1 ring-black/5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                />
              </div>
            </div>
          )}

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
              {statusFilter && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-brand-gold/10 text-brand-dark text-sm rounded-full">
                  {statusFilter === 'ComingSoon' ? 'Coming Soon' : statusFilter === 'ActiveUnderContract' ? 'Under Contract' : statusFilter}
                </span>
              )}
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

      {/* Results */}
      <section className="pt-4 lg:pt-[280px] pb-8">
        <div className="max-w-7xl mx-auto px-4">
          {/* Results Count + View Mode Toggle */}
          <div className="flex items-center justify-between mb-6">
            <p className="text-brand-dark/60" aria-live="polite" aria-atomic="true">
              {loading ? 'Searching...' : `${sortedListings.length}${total > sortedListings.length ? ` of ${total}` : ''} ${sortedListings.length === 1 ? 'property' : 'properties'} found`}
            </p>
            <div className="flex items-center gap-2">
              {/* View Mode Toggles */}
              <div className="flex bg-gray-100/60 rounded-xl p-0.5">
                {([
                  { mode: 'grid' as ViewMode, icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z', label: 'Grid' },
                  { mode: 'list' as ViewMode, icon: 'M4 6h16M4 10h16M4 14h16M4 18h16', label: 'List' },
                  { mode: 'map' as ViewMode, icon: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7', label: 'Map' },
                ] as const).map(({ mode, icon, label }) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={`p-2 rounded-lg transition-colors ${
                      viewMode === mode ? 'bg-white shadow-sm text-brand-dark' : 'text-brand-dark/40 hover:text-brand-dark/60'
                    }`}
                    aria-label={`${label} view`}
                    title={label}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                    </svg>
                  </button>
                ))}
              </div>
              <IDXSearchDisclaimer />
            </div>
          </div>

          {/* Error State */}
          {error && (
            <div className="text-center py-8 glass-card rounded-3xl mb-6">
              <p className="text-red-500 mb-2">{error}</p>
              <button onClick={clearFilters} className="text-brand-dark hover:underline text-sm">
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

          {/* Map View */}
          {viewMode === 'map' && !loading && (
            <div className="mb-6">
              <SearchMap listings={sortedListings} />
            </div>
          )}

          {/* Listings Grid/List */}
          {!loading && sortedListings.length === 0 && !error ? (
            <div className="text-center py-16 glass-card rounded-3xl">
              <p className="text-brand-dark/50 text-lg mb-2">No properties match your criteria</p>
              <p className="text-brand-dark/40 mb-4">Try adjusting your filters</p>
              <button onClick={clearFilters} className="text-brand-dark hover:underline">
                Clear all filters
              </button>
            </div>
          ) : !loading && viewMode !== 'map' && (
            <>
              <div className={
                viewMode === 'list'
                  ? 'flex flex-col gap-4'
                  : 'grid md:grid-cols-2 lg:grid-cols-3 gap-6'
              }>
                {sortedListings.map((listing) => (
                  viewMode === 'list' ? (
                    <ListCard key={listing.id} listing={listing} isRental={isRental} />
                  ) : (
                    <GridCard key={listing.id} listing={listing} isRental={isRental} />
                  )
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

/** Grid card (default card view) */
function GridCard({ listing, isRental }: { listing: DisplayListing; isRental: boolean }) {
  return (
    <Link
      href={`/listing/${listing.id}`}
      className="glass-card rounded-3xl overflow-hidden hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(0,0,0,0.06)] transition-all duration-300 group"
    >
      {/* Image */}
      <div className="relative overflow-hidden">
        <IDXImage
          src={listing.media[0]?.url || '/images/listing-placeholder.svg'}
          alt={`${listing.address.streetNumber} ${listing.address.streetName}`}
          aspect="card"
          className="group-hover:scale-105 transition-transform duration-700"
        />
        {formatComingSoonBadge(listing) && (
          <span className="absolute top-3 left-3 px-3 py-1 bg-amber-500 text-white text-xs rounded-xl z-10">
            {formatComingSoonBadge(listing)}
          </span>
        )}
        {/* Photo count badge — top right */}
        {listing.media.length > 0 && (
          <div className="absolute top-3 right-3 flex gap-1.5 z-10">
            <span className="flex items-center gap-1 bg-black/50 backdrop-blur-sm text-white text-[11px] px-2 py-1 rounded-lg">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              {listing.photosCount || listing.media.length}
            </span>
          </div>
        )}
        {/* RLS attribution — bottom of photo with gradient */}
        <div className="absolute bottom-0 left-0 right-0 z-10">
          <div className="bg-gradient-to-t from-black/50 via-black/20 to-transparent pt-6 pb-1.5 px-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-white/80 tracking-wide">RLS</span>
              <span className="text-[10px] text-white/60 truncate ml-2">
                {listing.listOfficeName}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        <p className="text-xl font-display font-semibold mb-1">
          {formatPrice(listing.listPrice, isRental)}
        </p>
        <p className="text-brand-dark">
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
            {listing.bathroomsHalf > 0 && `.${listing.bathroomsHalf}`} bath
          </span>
          {listing.livingArea && listing.livingArea > 0 && (
            <span>{listing.livingArea.toLocaleString()} sqft</span>
          )}
        </div>

        {/* NYC-Specific: Maintenance/CC */}
        {!isRental && listing.associationFee && (
          <p className="text-xs text-brand-dark/40 mt-2">
            {listing.propertyType === 'Co-op' ? 'Maint' : 'CC'}: ${listing.associationFee.toLocaleString()}/mo
          </p>
        )}

        {listing.modificationTimestamp && (
          <p className="text-[10px] text-brand-dark/30 mt-2">
            Updated {new Date(listing.modificationTimestamp).toLocaleDateString()}
          </p>
        )}
      </div>
    </Link>
  );
}

/** List card (horizontal layout) */
function ListCard({ listing, isRental }: { listing: DisplayListing; isRental: boolean }) {
  return (
    <Link
      href={`/listing/${listing.id}`}
      className="glass-card rounded-2xl overflow-hidden hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all duration-300 flex group"
    >
      {/* Image */}
      <div className="relative w-48 sm:w-64 flex-shrink-0">
        <IDXImage
          src={listing.media[0]?.url || '/images/listing-placeholder.svg'}
          alt={`${listing.address.streetNumber} ${listing.address.streetName}`}
          aspect="card"
          className="group-hover:scale-105 transition-transform duration-700"
        />
        {formatComingSoonBadge(listing) && (
          <span className="absolute top-2 left-2 px-2 py-0.5 bg-amber-500 text-white text-xs rounded-lg z-10">
            {formatComingSoonBadge(listing)}
          </span>
        )}
        {/* RLS attribution — bottom of photo */}
        <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/50 to-transparent pt-5 pb-1.5 px-2">
          <span className="text-[9px] font-semibold text-white/80 tracking-wide">RLS</span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 flex-1 min-w-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-lg font-display font-semibold">
              {formatPrice(listing.listPrice, isRental)}
            </p>
            <p className="text-brand-dark truncate">
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
          </div>
          {listing.propertySubType && (
            <span className="text-xs px-2 py-1 bg-gray-100 text-brand-dark/60 rounded-lg flex-shrink-0">
              {listing.propertySubType}
            </span>
          )}
        </div>

        <div className="flex gap-4 text-sm text-brand-dark/60 mt-2">
          <span>{listing.bedroomsTotal} bed{listing.bedroomsTotal !== 1 ? 's' : ''}</span>
          <span>{listing.bathroomsFull}{listing.bathroomsHalf > 0 && `.${listing.bathroomsHalf}`} bath</span>
          {listing.livingArea && listing.livingArea > 0 && <span>{listing.livingArea.toLocaleString()} sqft</span>}
          {!isRental && listing.associationFee && (
            <span className="text-brand-dark/40">{listing.propertyType === 'Co-op' ? 'Maint' : 'CC'}: ${listing.associationFee.toLocaleString()}/mo</span>
          )}
        </div>

        <p className="text-[10px] text-brand-dark/30 mt-2">
          {listing.listOfficeName}
          {listing.modificationTimestamp && <> &middot; {new Date(listing.modificationTimestamp).toLocaleDateString()}</>}
        </p>
      </div>
    </Link>
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
