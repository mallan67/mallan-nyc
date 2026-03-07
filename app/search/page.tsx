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

// ── View mode icons ──
const VIEW_ICONS: Record<ViewMode, { d: string; label: string }> = {
  split: { d: 'M9 3v18m12-18H3', label: 'Split' },
  'all-listings': { d: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z', label: 'All Listings' },
  'all-map': { d: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7', label: 'Full Map' },
  grid: { d: 'M4 6h16M4 10h16M4 14h16M4 18h16', label: 'Grid' },
  list: { d: 'M4 6h16M4 12h16M4 18h16', label: 'List' },
};

function SearchClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // ── URL params ──
  const typeParam = searchParams?.get('type') || searchParams?.get('tab') || 'buy';
  const queryParam = searchParams?.get('q') || '';
  const neighborhoodParam = searchParams?.get('neighborhood') || '';
  const zipParam = searchParams?.get('zip') || '';

  // ── State ──
  const [activeTab, setActiveTab] = useState<SearchTab>(resolveTab(typeParam));
  const [searchQuery, setSearchQuery] = useState(queryParam);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [showFilters, setShowFilters] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [scrollTargetId, setScrollTargetId] = useState<string | null>(null);
  const [mobileMapOpen, setMobileMapOpen] = useState(false);

  // ── Dynamic content height for full-viewport modes ──
  const toolbarRef = useRef<HTMLElement>(null);
  const [contentHeight, setContentHeight] = useState('calc(100dvh - 180px)');

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
    minSqft: filters.minSqft,
    maxSqft: filters.maxSqft,
    sort: filters.sort,
    neighborhood: neighborhoodParam || filters.neighborhood,
    limit: 50,
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

  // ── Sort ──
  const sortedListings = useMemo(() => {
    return [...filteredListings].sort((a, b) => {
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
    if (suggestion.type === 'neighborhood') {
      params.set('neighborhood', suggestion.value);
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
    if (filters.openHouse) pills.push({ label: 'Open House', key: 'openHouse' });
    if (filters.amenities?.length) pills.push({ label: `${filters.amenities.length} amenities`, key: 'amenities' });
    return pills;
  }, [filters, neighborhoodParam, zipParam]);

  const filterCount = activeFilterPills.length;

  // ── Measure toolbar bottom for dynamic content height ──
  useEffect(() => {
    const measure = () => {
      if (toolbarRef.current) {
        const rect = toolbarRef.current.getBoundingClientRect();
        const bottom = rect.top + rect.height;
        setContentHeight(`calc(100dvh - ${Math.ceil(bottom)}px)`);
      }
    };
    // Measure after layout settles
    const t1 = setTimeout(measure, 50);
    const t2 = setTimeout(measure, 200);
    window.addEventListener('resize', measure);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', measure);
    };
  }, [activeFilterPills.length, activeTab]);

  // ── Show footer only in grid/list modes ──
  const showFooter = viewMode === 'grid' || viewMode === 'list';
  const isFullViewport = viewMode === 'split' || viewMode === 'all-listings' || viewMode === 'all-map';

  return (
    <div className="min-h-screen bg-[#FEFEFE]">
      {/* ── Search Toolbar (sticky below header) ── */}
      <section ref={toolbarRef} className="sticky top-16 md:top-[72px] bg-white/95 backdrop-blur-xl border-b border-black/5 z-30">
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
            <div className="flex-1 min-w-[140px]">
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
            <div className="hidden sm:flex items-center gap-1">
              <input
                type="text"
                inputMode="numeric"
                value={filters.minPrice ? `$${filters.minPrice.toLocaleString()}` : ''}
                onChange={(e) => {
                  const num = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10);
                  setFilters(prev => ({ ...prev, minPrice: isNaN(num) ? undefined : num }));
                }}
                placeholder="$ Min"
                className="w-20 rounded-lg px-2.5 py-1.5 bg-white/60 ring-1 ring-black/5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                aria-label="Minimum price"
              />
              <span className="text-brand-dark/40 text-xs">&ndash;</span>
              <input
                type="text"
                inputMode="numeric"
                value={filters.maxPrice ? `$${filters.maxPrice.toLocaleString()}` : ''}
                onChange={(e) => {
                  const num = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10);
                  setFilters(prev => ({ ...prev, maxPrice: isNaN(num) ? undefined : num }));
                }}
                placeholder="$ Max"
                className="w-20 rounded-lg px-2.5 py-1.5 bg-white/60 ring-1 ring-black/5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                aria-label="Maximum price"
              />
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

            <div className="hidden lg:flex bg-gray-100/60 rounded-lg p-0.5">
              {(Object.entries(VIEW_ICONS) as [ViewMode, typeof VIEW_ICONS[ViewMode]][]).map(([mode, { d, label }]) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`p-1 rounded transition-colors ${
                    viewMode === mode ? 'bg-white shadow-sm text-brand-dark' : 'text-brand-dark/50 hover:text-brand-dark/80'
                  }`}
                  aria-label={`${label} view`}
                  title={label}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
                  </svg>
                </button>
              ))}
            </div>

            <select
              value={filters.sort || 'newest'}
              onChange={(e) => setFilters(prev => ({ ...prev, sort: e.target.value }))}
              className="hidden sm:block rounded-lg px-2.5 py-1.5 bg-white/60 ring-1 ring-black/5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
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
      </section>

      {/* ── Main Area ── */}
      <div className={isFullViewport ? 'overflow-hidden' : ''} style={isFullViewport ? { height: contentHeight } : undefined}>
        {/* Error */}
        {error && (
          <div className="text-center py-8 mx-4 mt-4 glass-card rounded-3xl">
            <p className="text-red-500 mb-2">{error}</p>
            <button onClick={clearFilters} className="text-brand-dark hover:underline text-sm">Try again</button>
          </div>
        )}

        {/* Loading */}
        {loading && !error && (
          <div className={`${isFullViewport ? 'h-full flex items-center justify-center' : 'py-16'}`}>
            <div className="text-center">
              <div className="w-8 h-8 border-4 border-brand-dark border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-brand-dark/85">Loading properties...</p>
            </div>
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
            {/* Map — left 60% (isolate creates a new stacking context so leaflet z-1000 stays inside) */}
            <div className="hidden lg:block w-[60%] h-full border-r border-black/5 isolate">
              <SearchMap
                listings={sortedListings}
                highlightedId={highlightedId}
                onMarkerClick={handleMarkerClick}
              />
            </div>
            {/* Listings — right 40% */}
            <div ref={listingsRef} className="flex-1 lg:w-[40%] overflow-y-auto">
              <div className="px-3 pt-2 pb-3 flex flex-col gap-3">
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
          <div className="h-full">
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
    <div className="min-h-screen bg-[#FEFEFE] pt-20 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-brand-dark border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-brand-dark/85">Loading properties...</p>
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
    </div>
  );
}
