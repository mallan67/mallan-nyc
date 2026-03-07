'use client';

import { Suspense, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Header from '@/app/components/Header';
import { useListings } from '@/lib/hooks/useListings';
// IDX disclaimer shown inline in toolbar row 2 (single line for space efficiency)
import SearchAutocomplete, { type Suggestion } from '@/app/components/SearchAutocomplete';
import SaveSearchButton from '@/app/components/SaveSearchButton';
import { GridCard, ListCard, SplitCard } from '@/app/components/SearchListingCard';
import SearchFilterPanel from '@/app/components/SearchFilterPanel';
import type { SearchTab, ViewMode, SearchFilters } from '@/lib/search/types';
import { TAB_CONFIG } from '@/lib/search/types';
import nextDynamic from 'next/dynamic';

export const dynamic = 'force-dynamic';

const SearchMap = nextDynamic(() => import('@/app/components/SearchMap'), { ssr: false });

// ── Tab backward-compat mapping ──
function resolveTab(typeParam: string): SearchTab {
  switch (typeParam) {
    case 'buy': return 'buy-residential';
    case 'rent': return 'rent-residential';
    case 'commercial': return 'buy-commercial';
    case 'sell': return 'buy-residential';
    default:
      if (['buy-residential', 'buy-commercial', 'rent-residential', 'rent-commercial'].includes(typeParam)) {
        return typeParam as SearchTab;
      }
      return 'buy-residential';
  }
}

function formatPriceShort(price: number): string {
  if (price >= 1_000_000) return `$${(price / 1_000_000).toFixed(1)}M`;
  if (price >= 1_000) return `$${(price / 1_000).toFixed(0)}K`;
  return `$${price.toLocaleString()}`;
}

// ── Price dropdown presets ──
const PRICE_PRESETS = [
  { label: 'Any', value: '' },
  { label: '$250K', value: '250000' },
  { label: '$500K', value: '500000' },
  { label: '$750K', value: '750000' },
  { label: '$1M', value: '1000000' },
  { label: '$1.5M', value: '1500000' },
  { label: '$2.5M', value: '2500000' },
  { label: '$3.5M', value: '3500000' },
  { label: '$4.5M', value: '4500000' },
  { label: '$5M', value: '5000000' },
  { label: '$7M', value: '7000000' },
  { label: '$9M', value: '9000000' },
  { label: '$12M', value: '12000000' },
  { label: '$20M', value: '20000000' },
  { label: '$50M+', value: '50000000' },
];

const RENT_PRICE_PRESETS = [
  { label: 'Any', value: '' },
  { label: '$1,500', value: '1500' },
  { label: '$2,000', value: '2000' },
  { label: '$2,500', value: '2500' },
  { label: '$3,000', value: '3000' },
  { label: '$3,500', value: '3500' },
  { label: '$4,000', value: '4000' },
  { label: '$5,000', value: '5000' },
  { label: '$6,000', value: '6000' },
  { label: '$7,500', value: '7500' },
  { label: '$10,000', value: '10000' },
  { label: '$15,000', value: '15000' },
  { label: '$20,000', value: '20000' },
  { label: '$30,000', value: '30000' },
  { label: '$50,000+', value: '50000' },
];

// ── View mode icon renderer ──
function ViewIcon({ mode, size = 16 }: { mode: ViewMode; size?: number }) {
  const s = size;
  switch (mode) {
    case 'split':
      // Left panel (larger) + right panel — split view
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="currentColor">
          <rect x="1" y="1" width="8" height="14" rx="1" />
          <rect x="11" y="1" width="4" height="14" rx="1" opacity="0.5" />
        </svg>
      );
    case 'all-listings':
      // 2x2 large cards
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="currentColor">
          <rect x="1" y="1" width="6" height="6" rx="1" />
          <rect x="9" y="1" width="6" height="6" rx="1" />
          <rect x="1" y="9" width="6" height="6" rx="1" />
          <rect x="9" y="9" width="6" height="6" rx="1" />
        </svg>
      );
    case 'all-map':
      // Map pin icon
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M8 1.5a4.5 4.5 0 014.5 4.5c0 3.5-4.5 8.5-4.5 8.5S3.5 9.5 3.5 6A4.5 4.5 0 018 1.5z" />
          <circle cx="8" cy="6" r="1.5" />
        </svg>
      );
    case 'grid':
      // 3x3 small grid (the 3-col card view)
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="currentColor">
          <rect x="1" y="1" width="3.5" height="3.5" rx="0.5" />
          <rect x="6.25" y="1" width="3.5" height="3.5" rx="0.5" />
          <rect x="11.5" y="1" width="3.5" height="3.5" rx="0.5" />
          <rect x="1" y="6.25" width="3.5" height="3.5" rx="0.5" />
          <rect x="6.25" y="6.25" width="3.5" height="3.5" rx="0.5" />
          <rect x="11.5" y="6.25" width="3.5" height="3.5" rx="0.5" />
          <rect x="1" y="11.5" width="3.5" height="3.5" rx="0.5" />
          <rect x="6.25" y="11.5" width="3.5" height="3.5" rx="0.5" />
          <rect x="11.5" y="11.5" width="3.5" height="3.5" rx="0.5" />
        </svg>
      );
    case 'list':
      // Horizontal lines — list view
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <line x1="1" y1="4" x2="15" y2="4" />
          <line x1="1" y1="8" x2="15" y2="8" />
          <line x1="1" y1="12" x2="15" y2="12" />
        </svg>
      );
  }
}

function SearchClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // ── URL params ──
  const typeParam = searchParams?.get('type') || searchParams?.get('tab') || 'buy';
  const queryParam = searchParams?.get('q') || '';
  const neighborhoodParam = searchParams?.get('neighborhood') || '';
  const boroughParam = searchParams?.get('borough') || '';
  const zipParam = searchParams?.get('zip') || '';

  // ── State ──
  const [activeTab, setActiveTab] = useState<SearchTab>(resolveTab(typeParam));
  const [searchQuery, setSearchQuery] = useState(queryParam);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [showFilters, setShowFilters] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [scrollTargetId, setScrollTargetId] = useState<string | null>(null);
  const [mobileMapOpen, setMobileMapOpen] = useState(false);

  const toolbarRef = useRef<HTMLDivElement>(null);

  // ── Filters ──
  const [filters, setFilters] = useState<SearchFilters>({
    minPrice: searchParams?.get('minPrice') ? Number(searchParams.get('minPrice')) : undefined,
    maxPrice: searchParams?.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined,
    beds: searchParams?.get('beds') ? Number(searchParams.get('beds')) : null,
    baths: searchParams?.get('baths') ? Number(searchParams.get('baths')) : null,
    sort: 'newest',
  });

  const tabConfig = TAB_CONFIG[activeTab];
  const isRental = tabConfig.apiType === 'rent';

  // ── Listings hook ──
  const { listings, loading, error, total, hasMore, loadMore } = useListings({
    type: tabConfig.apiType === 'sale' ? 'buy' : 'rent',
    commercial: tabConfig.commercial,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    beds: filters.beds,
    minBaths: filters.baths,
    propertySubTypes: filters.propertySubTypes,
    ownershipTypes: filters.ownershipTypes,
    statuses: filters.statuses,
    yearBuilt: filters.yearBuilt,
    furnished: filters.furnished,
    amenities: filters.amenities,
    openHouse: filters.openHouse,
    openHouseDate: filters.openHouseDate,
    minSqft: filters.minSqft,
    maxSqft: filters.maxSqft,
    sort: filters.sort,
    neighborhood: neighborhoodParam || filters.neighborhood,
    borough: boroughParam || undefined,
    limit: 200,
  });

  // ── Client-side text/zip post-filter ──
  const filteredListings = useMemo(() => {
    return listings.filter((listing) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const addr = `${listing.address.streetNumber} ${listing.address.streetName} ${listing.address.unitNumber || ''}`.toLowerCase();
        if (
          !addr.includes(q) &&
          !listing.address.neighborhood.toLowerCase().includes(q) &&
          !listing.address.postalCode.includes(q) &&
          !listing.address.borough.toLowerCase().includes(q)
        ) return false;
      }
      if (zipParam && listing.address.postalCode !== zipParam) return false;
      return true;
    });
  }, [listings, searchQuery, zipParam]);

  // ── Sort (Manhattan always first, then by selected sort) ──
  const sortedListings = useMemo(() => {
    return [...filteredListings].sort((a, b) => {
      const aMan = a.address.borough === 'Manhattan' ? 0 : 1;
      const bMan = b.address.borough === 'Manhattan' ? 0 : 1;
      if (aMan !== bMan) return aMan - bMan;

      switch (filters.sort) {
        case 'price-asc': return a.listPrice - b.listPrice;
        case 'price-desc': return b.listPrice - a.listPrice;
        case 'sqft-desc': return (b.livingArea || 0) - (a.livingArea || 0);
        case 'newest':
        default:
          return new Date(b.modificationTimestamp).getTime() - new Date(a.modificationTimestamp).getTime();
      }
    });
  }, [filteredListings, filters.sort]);

  // ── Refs for card scroll sync ──
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const listingsRef = useRef<HTMLDivElement>(null);

  // ── Default to all-listings on mobile ──
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setViewMode('all-listings');
    }
  }, []);

  // ── Tab change ──
  const handleTabChange = useCallback((tab: SearchTab) => {
    setActiveTab(tab);
    setFilters(prev => ({ sort: prev.sort })); // Reset filters on tab change
    const params = new URLSearchParams(searchParams?.toString() || '');
    params.set('tab', tab);
    params.delete('type'); // Remove legacy param
    router.push(`/search?${params.toString()}`);
  }, [searchParams, router]);

  // ── Autocomplete select ──
  const handleAutocompleteSelect = useCallback((suggestion: Suggestion) => {
    const params = new URLSearchParams(searchParams?.toString() || '');
    if (suggestion.type === 'location') {
      // Current location — value is "lat,lng"
      if (suggestion.value) {
        params.set('near', suggestion.value);
        router.push(`/search?${params.toString()}`);
      }
    } else if (suggestion.type === 'neighborhood') {
      // Borough vs neighborhood — sublabel='Borough' means it's a borough
      if (suggestion.sublabel === 'Borough') {
        params.delete('neighborhood');
        params.set('borough', suggestion.value);
      } else {
        params.delete('borough');
        params.set('neighborhood', suggestion.value);
      }
      router.push(`/search?${params.toString()}`);
    } else if (suggestion.type === 'zip') {
      params.set('zip', suggestion.value);
      router.push(`/search?${params.toString()}`);
    } else if (suggestion.type === 'agent') {
      router.push(`/agents/${suggestion.value}`);
    } else if (suggestion.type === 'listing') {
      router.push(`/listings/${suggestion.value}`);
    } else {
      setSearchQuery(suggestion.label);
    }
  }, [searchParams, router]);

  // ── Filter apply ──
  const handleApplyFilters = useCallback((newFilters: SearchFilters) => {
    setFilters(newFilters);
  }, []);

  // ── Clear all ──
  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setFilters({ sort: 'newest' });
    router.push(`/search?tab=${activeTab}`);
  }, [router, activeTab]);

  // ── Map marker click → scroll to card with highlight pulse ──
  const handleMarkerClick = useCallback((id: string) => {
    setHighlightedId(id);
    setScrollTargetId(id);
    const cardEl = cardRefs.current.get(id);
    if (cardEl) {
      cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Clear scroll-target animation after it plays
      setTimeout(() => setScrollTargetId(null), 1500);
    }
  }, []);

  // ── Active filter pills ──
  const activeFilterPills = useMemo(() => {
    const pills: { label: string; key: string }[] = [];
    if (boroughParam) pills.push({ label: boroughParam, key: 'borough' });
    if (neighborhoodParam) pills.push({ label: neighborhoodParam, key: 'neighborhood' });
    if (zipParam) pills.push({ label: `ZIP: ${zipParam}`, key: 'zip' });
    if (filters.beds != null) pills.push({ label: filters.beds === 0 ? 'Studio' : `${filters.beds}+ beds`, key: 'beds' });
    if (filters.baths != null) pills.push({ label: `${filters.baths}+ baths`, key: 'baths' });
    if (filters.minPrice) pills.push({ label: `Min ${formatPriceShort(filters.minPrice)}`, key: 'minPrice' });
    if (filters.maxPrice) pills.push({ label: `Max ${formatPriceShort(filters.maxPrice)}`, key: 'maxPrice' });
    if (filters.propertySubTypes?.length) pills.push({ label: filters.propertySubTypes.join(', '), key: 'propertySubTypes' });
    if (filters.ownershipTypes?.length) pills.push({ label: filters.ownershipTypes.join(', '), key: 'ownershipTypes' });
    if (filters.statuses?.length) pills.push({ label: filters.statuses.map(s => s === 'ComingSoon' ? 'Coming Soon' : s === 'ActiveUnderContract' ? 'Under Contract' : s).join(', '), key: 'statuses' });
    if (filters.yearBuilt && filters.yearBuilt !== 'any') pills.push({ label: filters.yearBuilt === 'pre-war' ? 'Pre-War' : 'Post-War', key: 'yearBuilt' });
    if (filters.furnished) pills.push({ label: 'Furnished', key: 'furnished' });
    if (filters.openHouse) {
      const dateLabel = filters.openHouseDate === 'weekend' ? 'This Weekend'
        : filters.openHouseDate ? `OH ${filters.openHouseDate}`
        : 'Any Upcoming';
      pills.push({ label: `Open House: ${dateLabel}`, key: 'openHouse' });
    }
    if (filters.amenities?.length) pills.push({ label: `${filters.amenities.length} amenities`, key: 'amenities' });
    return pills;
  }, [filters, neighborhoodParam, zipParam]);

  const filterCount = activeFilterPills.length;

  // toolbarRef kept for potential future use

  // ── Show footer only in grid/list modes ──
  const showFooter = viewMode === 'grid' || viewMode === 'list';
  const isFullViewport = viewMode === 'split' || viewMode === 'all-listings' || viewMode === 'all-map';

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#FEFEFE]">
      {/* ── Search Toolbar ── */}
      <div ref={toolbarRef} className="flex-shrink-0 bg-white/95 backdrop-blur-xl border-b border-black/5 z-40">
        <div className="max-w-[1920px] mx-auto px-4 py-2">
          {/* Row 1: Tabs + Search */}
          <div className="flex items-center gap-3">
            <div className="flex gap-0.5 bg-gray-100/60 rounded-xl p-0.5 flex-shrink-0">
              {(Object.entries(TAB_CONFIG) as [SearchTab, typeof TAB_CONFIG[SearchTab]][]).map(([tab, config]) => (
                <button
                  key={tab}
                  onClick={() => handleTabChange(tab)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                    activeTab === tab
                      ? 'bg-white text-brand-dark shadow-sm'
                      : 'text-brand-dark/80 hover:text-brand-dark'
                  }`}
                >
                  {config.label}
                </button>
              ))}
            </div>
            <div className="w-64 flex-shrink-0">
              <SearchAutocomplete
                value={searchQuery}
                onChange={setSearchQuery}
                onSelect={handleAutocompleteSelect}
                placeholder="Address, neighborhood, zip..."
              />
            </div>
          </div>

          {/* Row 2: Price + Filters + Views + Sort + Count */}
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex items-center gap-1">
              {(() => {
                const presets = isRental ? RENT_PRICE_PRESETS : PRICE_PRESETS;
                return (
                  <>
                    <select
                      value={filters.minPrice?.toString() || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFilters(prev => ({ ...prev, minPrice: val ? Number(val) : undefined }));
                      }}
                      className="w-24 rounded-lg px-2 py-1.5 bg-white/60 ring-1 ring-black/5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-gold/30 cursor-pointer"
                      aria-label="Minimum price"
                    >
                      <option value="">Min Price</option>
                      {presets.slice(1).map(p => (
                        <option key={`min-${p.value}`} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                    <span className="text-brand-dark/40 text-xs">&ndash;</span>
                    <select
                      value={filters.maxPrice?.toString() || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFilters(prev => ({ ...prev, maxPrice: val ? Number(val) : undefined }));
                      }}
                      className="w-24 rounded-lg px-2 py-1.5 bg-white/60 ring-1 ring-black/5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-gold/30 cursor-pointer"
                      aria-label="Maximum price"
                    >
                      <option value="">No Max</option>
                      {presets.slice(1).map(p => (
                        <option key={`max-${p.value}`} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </>
                );
              })()}
            </div>

            <button
              onClick={() => setShowFilters(true)}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 ring-black/5 bg-white/60 text-brand-dark/95 hover:bg-white transition-colors flex items-center gap-1 flex-shrink-0"
              aria-label="Open filters"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Filters
              {filterCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-brand-gold text-white text-[10px] flex items-center justify-center">
                  {filterCount}
                </span>
              )}
            </button>

            <div className="hidden lg:flex bg-gray-100/60 rounded-lg p-0.5 gap-0.5">
              {(['split', 'all-listings', 'all-map', 'grid', 'list'] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`p-1.5 rounded transition-colors ${
                    viewMode === mode ? 'bg-white shadow-sm text-brand-dark' : 'text-brand-dark/40 hover:text-brand-dark/70'
                  }`}
                  aria-label={`${mode} view`}
                  title={mode === 'split' ? 'Split' : mode === 'all-listings' ? 'All Listings' : mode === 'all-map' ? 'Full Map' : mode === 'grid' ? 'Grid' : 'List'}
                >
                  <ViewIcon mode={mode} />
                </button>
              ))}
            </div>

            <select
              value={filters.sort || 'newest'}
              onChange={(e) => setFilters(prev => ({ ...prev, sort: e.target.value }))}
              className="rounded-lg px-2.5 py-1.5 bg-white/60 ring-1 ring-black/5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
              aria-label="Sort order"
            >
              <option value="newest">Newest</option>
              <option value="price-asc">Price: Low → High</option>
              <option value="price-desc">Price: High → Low</option>
              <option value="sqft-desc">Largest</option>
            </select>

            <SaveSearchButton
              type={isRental ? 'rent' : 'buy'}
              filters={{
                minPrice: filters.minPrice,
                maxPrice: filters.maxPrice,
                beds: filters.beds ?? undefined,
                baths: filters.baths ?? undefined,
                neighborhood: neighborhoodParam || undefined,
              }}
            />

            {/* Count */}
            <p className="text-[11px] text-brand-dark/60 ml-auto whitespace-nowrap" aria-live="polite">
              {loading ? 'Searching...' : `${sortedListings.length} ${sortedListings.length === 1 ? 'property' : 'properties'}`}
            </p>

            {activeFilterPills.length > 0 && (
              <button onClick={clearFilters} className="text-[10px] text-brand-dark/50 hover:text-brand-dark underline whitespace-nowrap">
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Main Area ── */}
      <div className={`flex-1 min-h-0 ${isFullViewport ? 'overflow-hidden isolate' : 'overflow-y-auto'}`}>
        {/* Error */}
        {error && (
          <div className="text-center py-8 mx-4 mt-4 glass-card rounded-3xl">
            <p className="text-red-500 mb-2">{error}</p>
            <button onClick={clearFilters} className="text-brand-dark hover:underline text-sm">Try again</button>
          </div>
        )}

        {/* Loading skeleton — no spinner, shows layout immediately */}
        {loading && !error && sortedListings.length === 0 && (
          <div className={isFullViewport ? 'flex h-full' : 'py-6'}>
            {viewMode === 'split' && (
              <>
                <div className="flex-1 lg:w-[55%] p-2 grid grid-cols-2 gap-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="bg-gray-100 rounded-xl animate-pulse" style={{ aspectRatio: '3/2.5' }} />
                  ))}
                </div>
                <div className="hidden lg:block w-[45%] h-full bg-gray-100 animate-pulse" />
              </>
            )}
            {viewMode !== 'split' && (
              <div className="max-w-6xl mx-auto px-4 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-gray-100 rounded-2xl h-64 animate-pulse" />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Empty */}
        {!loading && !error && sortedListings.length === 0 && (
          <div className="text-center py-16 mx-4 mt-4 glass-card rounded-3xl">
            <p className="text-brand-dark/85 text-lg mb-2">No properties match your criteria</p>
            <p className="text-brand-dark/90 mb-4">Try adjusting your filters</p>
            <button onClick={clearFilters} className="text-brand-dark hover:underline">Clear all filters</button>
          </div>
        )}

        {/* ── SPLIT VIEW (default desktop) ── */}
        {!loading && !error && sortedListings.length > 0 && viewMode === 'split' && (
          <div className="flex h-full">
            {/* Listings — left 55% */}
            <div ref={listingsRef} className="flex-1 lg:w-[55%] overflow-y-auto border-r border-black/5">
              <div className="p-2 grid grid-cols-2 gap-2">
                {sortedListings.map((listing) => (
                  <div
                    key={listing.id}
                    ref={(el) => { if (el) cardRefs.current.set(listing.id, el); }}
                    className={scrollTargetId === listing.id ? 'animate-pulse-highlight rounded-xl' : ''}
                  >
                    <SplitCard
                      listing={listing}
                      isRental={isRental}
                      isHighlighted={highlightedId === listing.id}
                      onHover={setHighlightedId}
                    />
                  </div>
                ))}
                {hasMore && (
                  <div className="text-center py-4">
                    <button onClick={loadMore} className="px-6 py-2 bg-brand-dark text-white text-sm font-medium rounded-xl hover:bg-brand-dark/90 transition-colors">
                      Load More
                    </button>
                  </div>
                )}
                {/* REBNY compliance disclaimer — bottom of listings */}
                <p className="text-[9px] text-brand-dark/30 text-center py-2 leading-relaxed">
                  REBNY RLS · Mallan Real Estate Inc. — Licensed Real Estate Broker, New York State · Equal Housing Opportunity · Commission rates are not set by law and are fully negotiable
                </p>
              </div>
            </div>
            {/* Map — right 45% */}
            <div className="hidden lg:block w-[45%] h-full isolate">
              <SearchMap
                listings={sortedListings}
                highlightedId={highlightedId}
                onMarkerClick={handleMarkerClick}
              />
            </div>
          </div>
        )}

        {/* ── ALL LISTINGS VIEW ── */}
        {!loading && !error && sortedListings.length > 0 && viewMode === 'all-listings' && (
          <div ref={listingsRef} className="h-full overflow-y-auto p-4">
            <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-6">
              {sortedListings.map((listing) => (
                <div key={listing.id} ref={(el) => { if (el) cardRefs.current.set(listing.id, el); }}>
                  <GridCard listing={listing} isRental={isRental} isHighlighted={highlightedId === listing.id} onHover={setHighlightedId} />
                </div>
              ))}
            </div>
            {hasMore && (
              <div className="text-center py-8">
                <button onClick={loadMore} className="px-8 py-3 bg-brand-dark text-white font-medium rounded-2xl hover:bg-brand-dark/90 transition-colors">
                  Load More Properties
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── ALL MAP VIEW ── */}
        {!loading && !error && sortedListings.length > 0 && viewMode === 'all-map' && (
          <div className="h-full isolate">
            <SearchMap
              listings={sortedListings}
              highlightedId={highlightedId}
              onMarkerClick={handleMarkerClick}
            />
          </div>
        )}

        {/* ── GRID VIEW (traditional scroll) ── */}
        {!loading && !error && sortedListings.length > 0 && viewMode === 'grid' && (
          <section className="py-6">
            <div className="max-w-7xl mx-auto px-4">
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sortedListings.map((listing) => (
                  <GridCard key={listing.id} listing={listing} isRental={isRental} onHover={setHighlightedId} />
                ))}
              </div>
              {hasMore && (
                <div className="text-center mt-8">
                  <button onClick={loadMore} className="px-8 py-3 bg-brand-dark text-white font-medium rounded-2xl hover:bg-brand-dark/90 transition-colors">
                    Load More Properties
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── LIST VIEW (traditional scroll) ── */}
        {!loading && !error && sortedListings.length > 0 && viewMode === 'list' && (
          <section className="py-6">
            <div className="max-w-7xl mx-auto px-4">
              <div className="flex flex-col gap-4">
                {sortedListings.map((listing) => (
                  <ListCard key={listing.id} listing={listing} isRental={isRental} onHover={setHighlightedId} />
                ))}
              </div>
              {hasMore && (
                <div className="text-center mt-8">
                  <button onClick={loadMore} className="px-8 py-3 bg-brand-dark text-white font-medium rounded-2xl hover:bg-brand-dark/90 transition-colors">
                    Load More Properties
                  </button>
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {/* ── Mobile Map Toggle (floating button) ── */}
      <div className="lg:hidden fixed bottom-6 right-6 z-40">
        <button
          onClick={() => setMobileMapOpen(!mobileMapOpen)}
          className="flex items-center gap-2 px-4 py-3 bg-brand-dark text-white rounded-full shadow-lg hover:bg-brand-dark/90 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {mobileMapOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            )}
          </svg>
          {mobileMapOpen ? 'List' : 'Map'}
        </button>
      </div>

      {/* ── Mobile Map Overlay ── */}
      {mobileMapOpen && (
        <div className="lg:hidden fixed inset-0 z-30 bg-white" style={{ top: '120px' }}>
          <SearchMap
            listings={sortedListings}
            highlightedId={highlightedId}
            onMarkerClick={(id) => {
              handleMarkerClick(id);
              setMobileMapOpen(false);
            }}
          />
        </div>
      )}

      {/* ── Filter Panel ── */}
      <SearchFilterPanel
        isOpen={showFilters}
        onClose={() => setShowFilters(false)}
        onApply={handleApplyFilters}
        currentFilters={filters}
        activeTab={activeTab}
      />

      {/* ── Footer (grid/list only) ── */}
      {showFooter && (
        <section className="py-16 bg-gray-50/50 border-t border-black/5">
          <div className="max-w-3xl mx-auto px-4 text-center">
            <h2 className="text-xl sm:text-2xl font-display font-semibold mb-4">
              Need Help Finding Your Perfect Property?
            </h2>
            <p className="text-brand-dark/85 mb-8">
              Our agents have access to exclusive listings and can help you find exactly what you&apos;re looking for.
            </p>
            <a href="/agents" className="inline-block px-8 py-3 bg-brand-dark text-white font-medium rounded-2xl hover:bg-brand-dark/90 transition-colors">
              Contact an Agent
            </a>
          </div>
        </section>
      )}
    </div>
  );
}

function SearchLoading() {
  return (
    <div className="min-h-screen bg-[#FEFEFE] pt-20 px-4">
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 lg:grid-cols-3 gap-6 pt-8">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-gray-100 rounded-2xl h-64 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <div className="h-screen flex flex-col bg-[#FEFEFE] font-sans overflow-hidden">
      <Header dark />
      {/* Spacer for fixed header (h-16 mobile, h-[72px] desktop) */}
      <div className="flex-shrink-0 h-16 md:h-[72px]" />
      <main className="flex-1 min-h-0 flex flex-col">
        <Suspense fallback={<SearchLoading />}>
          <SearchClient />
        </Suspense>
      </main>
    </div>
  );
}
