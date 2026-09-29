'use client';

import { Suspense, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useListings } from '@/lib/hooks/useListings';
import { useClientOnly } from '@/lib/hooks/useClientOnly';
import { IDXSearchDisclaimer } from '@/app/components/IDXDisclaimer';
import SearchAutocomplete, { type Suggestion } from '@/app/components/SearchAutocomplete';
import SearchChips, { buildChips, type FilterChip } from '@/app/components/SearchChips';
import SaveSearchButton from '@/app/components/SaveSearchButton';
import { GridCard, ListCard, SplitCard } from '@/app/components/SearchListingCard';
import SearchFilterPanel from '@/app/components/SearchFilterPanel';
import NeighborhoodSelector from '@/app/components/NeighborhoodSelector';
import type { SearchTab, ViewMode, SearchFilters } from '@/lib/search/types';
import { getAllNeighborhoods } from '@/lib/neighborhoods/boroughs';
import { parseNaturalLanguageSearch } from '@/lib/search/natural-language-parser';
import { TAB_CONFIG } from '@/lib/search/types';
import nextDynamic from 'next/dynamic';
import { trackSearch } from '@/lib/posthog';

// Client component — data fetched via useListings hook (no force-dynamic needed)

const SearchMapLazy = nextDynamic(() => import('@/app/components/SearchMap'), { ssr: false });

// Wrap map in error boundary so Leaflet "container already initialized" (Strict Mode)
// doesn't crash the entire search page
import { Component, type ErrorInfo, type ReactNode } from 'react';
class MapErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Error boundary renders fallback UI — no console logging in production
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full bg-gray-50 text-brand-dark/50 text-sm">
          Map temporarily unavailable
        </div>
      );
    }
    return this.props.children;
  }
}

function SearchMap(props: React.ComponentProps<typeof SearchMapLazy>) {
  return (
    <MapErrorBoundary>
      <SearchMapLazy {...props} />
    </MapErrorBoundary>
  );
}
// RecentlyViewed strip removed — shown on listing pages only, not search

// ── Tab backward-compat mapping ──
/**
 * PR-S.2 (2026-05-15) — exported for unit testing.
 *
 * Resolves any URL `?tab=…` or `?type=…` value into a canonical
 * `SearchTab`. Used in BOTH directions of the activeTab sync:
 *   - useState initializer on mount (`resolveTab(typeParam)`)
 *   - useEffect after mount when the URL changes (re-fires this resolver
 *     against the new `typeParam` so the visible tab stays aligned with
 *     `tab=…` / `type=…` after browser back/forward, header navigation,
 *     or programmatic `router.replace` from outside the search page)
 *
 * Pure / referentially transparent — same input → same output, no side
 * effects, safe to call inside render and effects.
 *
 * Maps:
 *   - `'buy'`              → `'buy-residential'`
 *   - `'rent'`             → `'rent-residential'`
 *   - `'commercial'`       → `'buy-commercial'`
 *   - `'sell'`             → `'buy-residential'` (legacy redirect)
 *   - any canonical `SearchTab` value → itself (identity)
 *   - anything else (empty, unknown, malformed) → `'buy-residential'`
 *
 * Next.js App Router ignores non-page exports from page.tsx files at
 * runtime, so exporting this for tests is safe.
 */
export function resolveTab(typeParam: string): SearchTab {
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

/**
 * Resolves URL `?q=…` and `?neighborhood=…` params into the canonical
 * `searchQuery` state value for SearchClient. Used in BOTH directions of
 * the searchQuery sync:
 *   - useState initializer on mount
 *   - useEffect after mount when the URL changes (re-fires this resolver
 *     against the new params so the toolbar input + resolvedSearch memo
 *     stay aligned with `?q=…` / `?neighborhood=…` after browser back/
 *     forward, header navigation, or programmatic `router.replace` from
 *     outside the search page)
 *
 * Precedence: `q` wins over `neighborhood`. The toolbar input is the
 * single bound value, so when both URL params are present the explicit
 * `q` text is what the user typed last; `neighborhood` is the fallback
 * used by header-nav clicks and saved-search links that pre-populate the
 * input with a neighborhood name.
 *
 * Pure / referentially transparent — same input → same output, no side
 * effects, safe to call inside render and effects.
 *
 * Next.js App Router ignores non-page exports from page.tsx files at
 * runtime, so exporting this for tests is safe (same convention as
 * `resolveTab` above, established by PR #131).
 */
export function resolveSearchQuery(queryParam: string, neighborhoodParam: string): string {
  return queryParam || neighborhoodParam;
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
  // `/exclusives` (vercel.json redirect) routes to `/buy?exclusive=mallan`.
  // Only the literal value `mallan` activates the filter; anything else is
  // ignored so a typo can't accidentally surface a different subset.
  const exclusiveParam = searchParams?.get('exclusive') === 'mallan' ? 'mallan' as const : undefined;

  // ── State ──
  const [activeTab, setActiveTab] = useState<SearchTab>(resolveTab(typeParam));
  // PR-S.2 (2026-05-15) — URL → activeTab sync.
  //
  // The useState initializer above fires only on mount. Without this
  // effect, subsequent URL changes (header navigation to `/buy` or
  // `/rent`, browser back/forward between two `?tab=…` URLs, programmatic
  // `router.replace` from outside this component, etc.) updated the URL
  // but left `activeTab` stale — Maya saw "Buy" highlighted while the URL
  // showed `?tab=rent-residential`, and the API request went to whichever
  // tabConfig matched the stale `activeTab`.
  //
  // The reverse direction (`activeTab` → URL) is already wired further
  // down via `router.replace(`/search?tab=${activeTab}`)`. That effect
  // and this one cannot loop because:
  //   1. React `setActiveTab(x)` bails out when x is referentially equal
  //      to current state, AND
  //   2. `resolveTab` is deterministic, AND
  //   3. our state→URL effect uses the same `?tab=${activeTab}` string,
  //      so once the two are in sync the next render reads `typeParam`
  //      identical to `activeTab` and this effect is a no-op.
  useEffect(() => {
    setActiveTab(resolveTab(typeParam));
  }, [typeParam]);
  const [searchQuery, setSearchQuery] = useState(resolveSearchQuery(queryParam, neighborhoodParam));
  // PR-S.2b (2026-05-15) — URL → searchQuery sync. Mirrors the activeTab
  // effect immediately above. Without this, browser back/forward,
  // programmatic navigation, or any header/saved-search link that pushes
  // `?q=…` or `?neighborhood=…` updates the URL but leaves `searchQuery`
  // stale — the toolbar input shows the old value and the `resolvedSearch`
  // memo (line ~346) returns stale API params, so listing results don't
  // match the URL the user just navigated to.
  //
  // The reverse direction (`searchQuery` → URL) is wired further down via
  // a single state→URL effect that writes via `window.history.replaceState`
  // (NOT `router.replace`). Per Next.js App Router behavior,
  // `useSearchParams()` only re-fires on framework-mediated navigation, not
  // on `history.replaceState`, so this effect and that one cannot loop:
  //   1. User typing → setSearchQuery → state→URL effect → history.replaceState
  //      → `useSearchParams()` does NOT re-fire → queryParam stays the same
  //      → this effect is a no-op.
  //   2. Framework navigation (header `<Link>`, browser back/forward) →
  //      `useSearchParams()` re-fires → queryParam changes → this effect
  //      fires → setSearchQuery(newValue) → React bails out if value is
  //      referentially equal; otherwise state→URL effect runs but uses
  //      replaceState so `useSearchParams()` does not re-fire → terminates.
  useEffect(() => {
    setSearchQuery(resolveSearchQuery(queryParam, neighborhoodParam));
  }, [queryParam, neighborhoodParam]);
  const viewParam = searchParams?.get('view') as ViewMode | null;
  // Initial view is SSR-stable: respect a valid URL param, otherwise 'split'.
  // Reading window.innerWidth in the lazy initializer was diverging server
  // render ('split') from first client render on mobile ('all-listings'),
  // causing hydration churn. The mobile default is now applied post-mount
  // via useClientOnly (which uses useReducer to satisfy the React Compiler
  // set-state-in-effect rule), and only when the user has not explicitly
  // chosen a view via URL or the toolbar.
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const allowed: ViewMode[] = ['split', 'all-listings', 'all-map', 'grid', 'list'];
    return viewParam && allowed.includes(viewParam) ? viewParam : 'split';
  });
  const { value: isMobileViewport, hydrated: viewportHydrated } = useClientOnly({
    read: () => window.innerWidth < 1024,
    serverFallback: false,
  });
  useEffect(() => {
    if (!viewportHydrated) return;
    if (viewParam) return;            // user set a view via URL
    if (viewMode !== 'split') return; // user picked a view via toolbar
    if (isMobileViewport) setViewMode('all-listings');
    // We intentionally do not depend on viewMode — the flip happens once
    // when hydration completes and the viewport is mobile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportHydrated, isMobileViewport, viewParam]);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<string[]>(() => {
    const nParam = searchParams?.get('neighborhoods');
    return nParam ? nParam.split(',').map(n => decodeURIComponent(n.trim())).filter(Boolean) : [];
  });
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [scrollTargetId, setScrollTargetId] = useState<string | null>(null);
  const [mobileMapOpen, setMobileMapOpen] = useState(false);

  const toolbarRef = useRef<HTMLDivElement>(null);

  // ── Filters ──
  const [filters, setFilters] = useState<SearchFilters>(() => {
    const sp = searchParams;
    const csv = (key: string) => {
      const v = sp?.get(key);
      return v ? v.split(',') : undefined;
    };
    return {
      minPrice: sp?.get('minPrice') ? Number(sp.get('minPrice')) : undefined,
      maxPrice: sp?.get('maxPrice') ? Number(sp.get('maxPrice')) : undefined,
      beds: sp?.get('beds') ? Number(sp.get('beds')) : null,
      maxBeds: sp?.get('maxBeds') ? Number(sp.get('maxBeds')) : null,
      baths: sp?.get('baths') ? Number(sp.get('baths')) : null,
      maxBaths: sp?.get('maxBaths') ? Number(sp.get('maxBaths')) : null,
      propertySubTypes: csv('subTypes'),
      ownershipTypes: csv('ownership'),
      statuses: csv('statuses'),
      yearBuilt: (sp?.get('yearBuilt') as SearchFilters['yearBuilt']) || undefined,
      furnished: sp?.get('furnished') === 'true' || undefined,
      amenities: csv('amenities') as SearchFilters['amenities'],
      openHouse: sp?.get('openHouse') === 'true' || undefined,
      openHouseDate: sp?.get('openHouseDate') || undefined,
      minSqft: sp?.get('minSqft') ? Number(sp.get('minSqft')) : undefined,
      maxSqft: sp?.get('maxSqft') ? Number(sp.get('maxSqft')) : undefined,
      sort: sp?.get('sort') || 'price-desc',
      neighborhood: sp?.get('filterNeighborhood') || undefined,
    };
  });

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    const params = new URLSearchParams(searchParams?.toString() || '');
    const setOrDel = (key: string, val: string | undefined | null) => {
      if (val) params.set(key, val); else params.delete(key);
    };
    setOrDel('minPrice', filters.minPrice?.toString());
    setOrDel('maxPrice', filters.maxPrice?.toString());
    setOrDel('beds', filters.beds != null ? filters.beds.toString() : undefined);
    setOrDel('maxBeds', filters.maxBeds != null ? filters.maxBeds.toString() : undefined);
    setOrDel('baths', filters.baths != null ? filters.baths.toString() : undefined);
    setOrDel('maxBaths', filters.maxBaths != null ? filters.maxBaths.toString() : undefined);
    setOrDel('subTypes', filters.propertySubTypes?.length ? filters.propertySubTypes.join(',') : undefined);
    setOrDel('ownership', filters.ownershipTypes?.length ? filters.ownershipTypes.join(',') : undefined);
    setOrDel('statuses', filters.statuses?.length ? filters.statuses.join(',') : undefined);
    setOrDel('yearBuilt', filters.yearBuilt && filters.yearBuilt !== 'any' ? filters.yearBuilt : undefined);
    setOrDel('furnished', filters.furnished ? 'true' : undefined);
    setOrDel('amenities', filters.amenities?.length ? filters.amenities.join(',') : undefined);
    setOrDel('openHouse', filters.openHouse ? 'true' : undefined);
    setOrDel('openHouseDate', filters.openHouse ? filters.openHouseDate : undefined);
    setOrDel('minSqft', filters.minSqft?.toString());
    setOrDel('maxSqft', filters.maxSqft?.toString());
    setOrDel('sort', filters.sort && filters.sort !== 'price-desc' ? filters.sort : undefined);
    setOrDel('filterNeighborhood', filters.neighborhood);
    // Persist view mode and search query in URL so back-navigation restores them
    setOrDel('view', viewMode !== 'split' ? viewMode : undefined);
    setOrDel('q', searchQuery || undefined);
    // Neighborhoods multi-select
    setOrDel('neighborhoods', selectedNeighborhoods.length > 0 ? selectedNeighborhoods.join(',') : undefined);
    // Clear neighborhood/borough from URL when search query is cleared (reset scenario)
    if (!searchQuery) {
      params.delete('neighborhood');
      params.delete('borough');
    }
    // Use history.replaceState instead of router.replace to avoid triggering
    // a full Next.js navigation (which re-renders via Suspense → white flash)
    window.history.replaceState(null, '', `/search?${params.toString()}`);
  }, [filters, viewMode, searchQuery, selectedNeighborhoods]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabConfig = TAB_CONFIG[activeTab];
  const isRental = tabConfig.apiType === 'rent';

  // ── Route searchQuery to the right API param ──
  // Handles: exact neighborhoods, boroughs, zips, natural language ("2 bed UES"), addresses
  const resolvedSearch = useMemo(() => {
    const q = (searchQuery || '').trim();
    if (!q) return { neighborhood: undefined, borough: undefined, address: undefined, nlFilters: undefined };

    const qLower = q.toLowerCase();

    // Exact neighborhood match
    const allNeighborhoods = getAllNeighborhoods();
    const matchedNeighborhood = allNeighborhoods.find(n => n.name.toLowerCase() === qLower);
    if (matchedNeighborhood) return { neighborhood: matchedNeighborhood.name, borough: undefined, address: undefined, nlFilters: undefined };

    // Exact borough match
    const boroughs = ['manhattan', 'brooklyn', 'queens', 'bronx', 'staten island'];
    if (boroughs.includes(qLower)) return { neighborhood: undefined, borough: q, address: undefined, nlFilters: undefined };

    // Zip code
    if (/^\d{5}$/.test(q)) return { neighborhood: undefined, borough: undefined, address: undefined, nlFilters: undefined };

    // Natural language detection: contains beds, price, property type, amenity, or neighborhood keywords
    const nlSignals = /(\d\s*(?:bed|br|bath|ba\b)|studio|\$|under|over|below|above|condo|co-?op|townhouse|loft|pre-?war|doorman|elevator|pets?|no\s*fee|gym|pool|furnished)/i;
    const containsNeighborhood = allNeighborhoods.some(n => qLower.includes(n.name.toLowerCase()));
    const containsBorough = boroughs.some(b => qLower.includes(b));

    if (nlSignals.test(q) || containsNeighborhood || containsBorough) {
      const parsed = parseNaturalLanguageSearch(q);
      return {
        neighborhood: parsed.neighborhood || undefined,
        borough: parsed.borough || undefined,
        address: undefined,
        nlFilters: parsed.filters,
      };
    }

    // Plain address/text search
    return { neighborhood: undefined, borough: undefined, address: q, nlFilters: undefined };
  }, [searchQuery]);

  // ── Listings hook ──
  // NL-parsed filters (from "2 bed upper east side" etc.) merge with toolbar filters
  const nl = resolvedSearch.nlFilters;
  const { listings, loading, loadingMore, error, total, hasMore, loadMore } = useListings({
    type: tabConfig.apiType === 'sale' ? 'buy' : 'rent',
    commercial: tabConfig.commercial,
    minPrice: filters.minPrice ?? nl?.minPrice,
    maxPrice: filters.maxPrice ?? nl?.maxPrice,
    beds: filters.beds ?? nl?.beds,
    maxBeds: filters.maxBeds ?? null,
    minBaths: filters.baths ?? nl?.baths,
    maxBaths: filters.maxBaths ?? null,
    propertySubTypes: filters.propertySubTypes?.length ? filters.propertySubTypes : nl?.propertySubTypes,
    ownershipTypes: filters.ownershipTypes,
    statuses: filters.statuses,
    yearBuilt: filters.yearBuilt ?? nl?.yearBuilt,
    furnished: filters.furnished ?? nl?.furnished,
    amenities: filters.amenities?.length ? filters.amenities : nl?.amenities,
    openHouse: filters.openHouse,
    openHouseDate: filters.openHouseDate,
    minSqft: filters.minSqft ?? nl?.minSqft,
    maxSqft: filters.maxSqft ?? nl?.maxSqft,
    sort: filters.sort,
    neighborhood: selectedNeighborhoods.join(',') || resolvedSearch.neighborhood || neighborhoodParam || filters.neighborhood,
    borough: resolvedSearch.borough || boroughParam || undefined,
    zipCodes: zipParam || (/^\d{5}$/.test(searchQuery?.trim() || '') ? searchQuery.trim() : undefined),
    address: resolvedSearch.address || undefined,
    keywords: nl?.keywords,
    exclusive: exclusiveParam,
    limit: 50,
  });

  // ── PostHog: track search when results load ──
  const prevTotal = useRef<number | null>(null);
  useEffect(() => {
    if (!loading && total !== prevTotal.current) {
      prevTotal.current = total;
      const pMin = filters.minPrice;
      const pMax = filters.maxPrice;
      const bucket = pMin || pMax
        ? `${pMin ? formatPriceShort(pMin) : '0'}-${pMax && pMax < 99999999 ? formatPriceShort(pMax) : 'any'}`
        : undefined;
      trackSearch({
        borough: boroughParam || undefined,
        neighborhood: neighborhoodParam || filters.neighborhood,
        property_type: filters.propertySubTypes?.join(',') || undefined,
        bed_min: filters.beds ?? undefined,
        price_bucket: bucket,
        result_count: total,
      });
    }
  }, [loading, total]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Client-side zip post-filter (address search handled server-side via API) ──
  const filteredListings = useMemo(() => {
    if (!zipParam) return listings;
    return listings.filter((listing) => listing.address.postalCode === zipParam);
  }, [listings, zipParam]);

  // ── Sort by selected order (server already sorts, but re-sort client-side
  //    to handle merged exclusive listings and post-filter changes) ──
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

  // ── Scroll position persistence ──
  // Save scroll position to sessionStorage before navigating away;
  // restore it when returning via browser back button.
  const SCROLL_KEY = 'mallan_search_scroll';
  useEffect(() => {
    const container = listingsRef.current;
    // Restore saved scroll position on mount (after listings have loaded)
    if (loading) return;
    const saved = sessionStorage.getItem(SCROLL_KEY);
    if (saved && container) {
      requestAnimationFrame(() => { container.scrollTop = parseInt(saved, 10); });
      sessionStorage.removeItem(SCROLL_KEY);
    }
    // Save scroll position before unload (back/forward navigation)
    const handleBeforeUnload = () => {
      if (container) sessionStorage.setItem(SCROLL_KEY, String(container.scrollTop));
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    // Also save on visibility change (covers SPA navigation via Link)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && container) {
        sessionStorage.setItem(SCROLL_KEY, String(container.scrollTop));
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      // Save on unmount (SPA navigation to listing detail)
      if (container) sessionStorage.setItem(SCROLL_KEY, String(container.scrollTop));
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loading]); // Re-attach after listings finish loading

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
      router.push(`/listing/${suggestion.value}`);
    } else if (suggestion.type === 'address') {
      // Address — set search query and navigate with q param so useListings fetches by address
      setSearchQuery(suggestion.value);
      params.set('q', suggestion.value);
      params.delete('neighborhood');
      params.delete('borough');
      params.delete('zip');
      params.delete('near');
      router.push(`/search?${params.toString()}`);
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
    setFilters({ sort: 'price-desc' });
    setSelectedNeighborhoods([]);
    // Clear all URL params (neighborhood, borough, zip, q, beds, etc.) — fresh search
    router.replace(`/search?tab=${activeTab}`, { scroll: false });
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
    if (selectedNeighborhoods.length > 0) {
      pills.push({
        label: selectedNeighborhoods.length === 1 ? selectedNeighborhoods[0] : `${selectedNeighborhoods.length} neighborhoods`,
        key: 'neighborhoods',
      });
    }
    if (zipParam) pills.push({ label: `ZIP: ${zipParam}`, key: 'zip' });
    if (filters.beds != null || filters.maxBeds != null) {
      const min = filters.beds;
      const max = filters.maxBeds;
      const bedLabel = (v: number) => v === 0 ? 'Studio' : String(v);
      let label: string;
      if (min != null && max != null) {
        label = min === max ? `${bedLabel(min)} bed` : `${bedLabel(min)}–${bedLabel(max)} beds`;
      } else if (min != null) {
        label = `${bedLabel(min)}+ beds`;
      } else {
        label = `≤${bedLabel(max!)} beds`;
      }
      pills.push({ label, key: 'beds' });
    }
    if (filters.baths != null || filters.maxBaths != null) {
      const min = filters.baths;
      const max = filters.maxBaths;
      let label: string;
      if (min != null && max != null) {
        label = min === max ? `${min} bath` : `${min}–${max} baths`;
      } else if (min != null) {
        label = `${min}+ baths`;
      } else {
        label = `≤${max} baths`;
      }
      pills.push({ label, key: 'baths' });
    }
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
  }, [filters, neighborhoodParam, zipParam, selectedNeighborhoods, boroughParam]);

  const filterCount = activeFilterPills.length;

  // ── Search Chips — built from merged toolbar + NL filters ──
  const chips = useMemo(() => {
    // Merge: toolbar filters take priority, NL fills gaps (same pattern as useListings call)
    const merged: SearchFilters = {
      ...filters,
      beds: filters.beds ?? nl?.beds ?? null,
      baths: filters.baths ?? nl?.baths ?? null,
      minPrice: filters.minPrice ?? nl?.minPrice,
      maxPrice: filters.maxPrice ?? nl?.maxPrice,
      propertySubTypes: filters.propertySubTypes?.length ? filters.propertySubTypes : nl?.propertySubTypes,
      yearBuilt: filters.yearBuilt ?? nl?.yearBuilt,
      furnished: filters.furnished ?? nl?.furnished,
      amenities: (filters.amenities?.length ? filters.amenities : nl?.amenities) as SearchFilters['amenities'],
      keywords: nl?.keywords,
      transit: nl?.transit,
    };
    return buildChips(merged, selectedNeighborhoods, resolvedSearch.borough || boroughParam || undefined);
  }, [filters, nl, selectedNeighborhoods, resolvedSearch.borough, boroughParam]);

  const handleChipRemove = useCallback((chip: FilterChip) => {
    switch (chip.type) {
      case 'neighborhood':
        setSelectedNeighborhoods(prev => prev.filter(n => n !== chip.filterValue));
        break;
      case 'borough':
        setSearchQuery('');
        break;
      case 'beds':
        setFilters(prev => ({ ...prev, beds: null, maxBeds: null }));
        break;
      case 'baths':
        setFilters(prev => ({ ...prev, baths: null, maxBaths: null }));
        break;
      case 'price':
        setFilters(prev => ({ ...prev, minPrice: undefined, maxPrice: undefined }));
        break;
      case 'property':
        setFilters(prev => ({
          ...prev,
          propertySubTypes: prev.propertySubTypes?.filter(t => t !== chip.filterValue),
        }));
        break;
      case 'yearBuilt':
        setFilters(prev => ({ ...prev, yearBuilt: undefined }));
        break;
      case 'amenity':
        setFilters(prev => ({
          ...prev,
          amenities: prev.amenities?.filter(a => a !== chip.filterValue) as SearchFilters['amenities'],
        }));
        break;
      case 'other':
        // Furnished or Open House
        if (chip.filterKey === 'furnished') {
          setFilters(prev => ({ ...prev, furnished: undefined }));
        } else if (chip.filterKey === 'openHouse') {
          setFilters(prev => ({ ...prev, openHouse: undefined, openHouseDate: undefined }));
        }
        break;
      case 'keyword':
      case 'transit':
        // These come from NL parse — clearing the search query removes them
        setSearchQuery('');
        break;
    }
  }, []);

  const handleChipClearAll = useCallback(() => {
    clearFilters();
  }, [clearFilters]);

  // toolbarRef kept for potential future use

  // ── Show footer only in grid/list modes ──
  const showFooter = viewMode === 'grid' || viewMode === 'list';
  const isFullViewport = viewMode === 'split' || viewMode === 'all-listings' || viewMode === 'all-map';

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#FEFEFE]">
      <h1 className="sr-only">Search Properties — Mallan Real Estate</h1>
      {/* ── Search Toolbar ── */}
      <div ref={toolbarRef} role="search" aria-label="Property search filters" className="flex-shrink-0 bg-white border-b border-black/8 z-40">
        <div className="max-w-[1920px] mx-auto px-4 md:px-6 py-3">
          {/* Row 1: Tabs + Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4">
            <div className="flex gap-0.5 bg-gray-100 rounded-xl p-1 flex-shrink-0 overflow-x-auto">
              {(Object.entries(TAB_CONFIG) as [SearchTab, typeof TAB_CONFIG[SearchTab]][]).map(([tab, config]) => (
                <button
                  key={tab}
                  onClick={() => handleTabChange(tab)}
                  className={`px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    activeTab === tab
                      ? 'bg-white text-brand-dark shadow-sm'
                      : 'text-brand-dark/60 hover:text-brand-dark'
                  }`}
                >
                  {config.label}
                </button>
              ))}
            </div>
            <div className="w-full sm:w-80 flex-shrink-0">
              <SearchAutocomplete
                value={searchQuery}
                onChange={setSearchQuery}
                onSelect={handleAutocompleteSelect}
                onClear={clearFilters}
                placeholder="Address, neighborhood, zip..."
              />
            </div>
          </div>

          {/* Row 2: Price + Filters + Views + Sort + Count
              F2 (2026-05-15) — at < sm (640px) this row crammed 9 controls
              into a single `flex-wrap` and exploded into 5-7 vertical rows
              (245px tall at 390px). Switched to horizontal-scroll on mobile:
              `flex-nowrap` + `overflow-x-auto` lets the controls stay on
              one line and lets the user swipe to access lower-priority
              ones (Sort, SaveSearch, Count, Reset). At `sm` (640px+) the
              row reverts to the original `flex-wrap` behavior. The
              `[scrollbar-width:none] [&::-webkit-scrollbar]:hidden` rules
              hide the horizontal scrollbar UI on iOS/Android while
              keeping swipe-scroll functional. The negative `-mx-*` plus
              matching `px-*` make the scroll edge bleed to the viewport
              boundary so the last visible control isn't clipped against
              a hard container edge. */}
          <div className="flex flex-nowrap items-center gap-2 sm:gap-3 mt-3 overflow-x-auto sm:flex-wrap sm:overflow-x-visible [&::-webkit-scrollbar]:hidden [scrollbar-width:none] -mx-4 px-4 sm:mx-0 sm:px-0">
            {/* F2 child overrides: shrink-0 keeps each control at its
                intrinsic width inside the horizontal-scroll container so
                nothing gets squished. The `ml-auto` on the count below
                still works — flex-nowrap honors auto margins and pushes
                the count to the far end of the (now wider) row. */}
            <div className="flex items-center gap-1.5 shrink-0">
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
                      className="w-24 sm:w-28 rounded-lg px-2 sm:px-3 py-2 bg-white ring-1 ring-black/10 text-xs sm:text-sm text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-gold/30 cursor-pointer"
                      aria-label="Minimum price"
                    >
                      <option value="">Min Price</option>
                      {presets.slice(1).map(p => (
                        <option key={`min-${p.value}`} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                    <span className="text-brand-dark/40 text-sm">&ndash;</span>
                    <select
                      value={filters.maxPrice?.toString() || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFilters(prev => ({ ...prev, maxPrice: val ? Number(val) : undefined }));
                      }}
                      className="w-24 sm:w-28 rounded-lg px-2 sm:px-3 py-2 bg-white ring-1 ring-black/10 text-xs sm:text-sm text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-gold/30 cursor-pointer"
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

            {/* Beds min/max */}
            <div className="hidden sm:flex items-center gap-1">
              <select
                value={filters.beds != null ? filters.beds.toString() : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setFilters(prev => ({ ...prev, beds: val !== '' ? Number(val) : null }));
                }}
                className="w-[72px] rounded-lg px-2 py-2 bg-white ring-1 ring-black/10 text-xs sm:text-sm text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-gold/30 cursor-pointer"
                aria-label="Min bedrooms"
              >
                <option value="">Beds</option>
                <option value="0">Studio</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
              </select>
              <span className="text-brand-dark/40 text-xs">&ndash;</span>
              <select
                value={filters.maxBeds != null ? filters.maxBeds.toString() : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setFilters(prev => ({ ...prev, maxBeds: val !== '' ? Number(val) : null }));
                }}
                className="w-[72px] rounded-lg px-2 py-2 bg-white ring-1 ring-black/10 text-xs sm:text-sm text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-gold/30 cursor-pointer"
                aria-label="Max bedrooms"
              >
                <option value="">Max</option>
                <option value="0">Studio</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4+</option>
              </select>
            </div>

            {/* Baths min/max */}
            <div className="hidden sm:flex items-center gap-1">
              <select
                value={filters.baths != null ? filters.baths.toString() : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setFilters(prev => ({ ...prev, baths: val !== '' ? Number(val) : null }));
                }}
                className="w-[72px] rounded-lg px-2 py-2 bg-white ring-1 ring-black/10 text-xs sm:text-sm text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-gold/30 cursor-pointer"
                aria-label="Min bathrooms"
              >
                <option value="">Baths</option>
                <option value="1">1</option>
                <option value="1.5">1.5</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
              <span className="text-brand-dark/40 text-xs">&ndash;</span>
              <select
                value={filters.maxBaths != null ? filters.maxBaths.toString() : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setFilters(prev => ({ ...prev, maxBaths: val !== '' ? Number(val) : null }));
                }}
                className="w-[72px] rounded-lg px-2 py-2 bg-white ring-1 ring-black/10 text-xs sm:text-sm text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-gold/30 cursor-pointer"
                aria-label="Max bathrooms"
              >
                <option value="">Max</option>
                <option value="1">1</option>
                <option value="1.5">1.5</option>
                <option value="2">2</option>
                <option value="3">3+</option>
              </select>
            </div>

            {/* Neighborhood selector — wrapped in shrink-0 so it keeps its
                intrinsic width inside the F2 horizontal-scroll toolbar. The
                child component owns its own button width; we just guard
                against flex squish. */}
            <div className="shrink-0">
              <NeighborhoodSelector
                selected={selectedNeighborhoods}
                onChange={setSelectedNeighborhoods}
              />
            </div>

            <button
              onClick={() => setShowFilters(true)}
              className="rounded-lg px-3 sm:px-3.5 py-2 text-xs sm:text-sm font-medium ring-1 ring-black/10 bg-white text-brand-dark hover:bg-gray-50 transition-colors flex items-center gap-1.5 flex-shrink-0"
              aria-label="Open filters"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Filters
              {filterCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-brand-gold text-white text-xs flex items-center justify-center font-semibold">
                  {filterCount}
                </span>
              )}
            </button>

            <select
              value={filters.sort || 'price-desc'}
              onChange={(e) => setFilters(prev => ({ ...prev, sort: e.target.value }))}
              className="rounded-lg px-2 sm:px-3 py-2 bg-white ring-1 ring-black/10 text-xs sm:text-sm text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-gold/30 shrink-0"
              aria-label="Sort order"
            >
              <option value="price-desc">Price: High → Low</option>
              <option value="price-asc">Price: Low → High</option>
              <option value="newest">Newest</option>
              <option value="sqft-desc">Largest</option>
            </select>

            <div className="hidden lg:flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
              {(['split', 'all-listings', 'all-map', 'grid', 'list'] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`p-2 rounded transition-colors ${
                    viewMode === mode ? 'bg-white shadow-sm text-brand-dark' : 'text-brand-dark/40 hover:text-brand-dark/70'
                  }`}
                  aria-label={`${mode} view`}
                  title={mode === 'split' ? 'Split' : mode === 'all-listings' ? 'All Listings' : mode === 'all-map' ? 'Full Map' : mode === 'grid' ? 'Grid' : 'List'}
                >
                  <ViewIcon mode={mode} size={18} />
                </button>
              ))}
            </div>

            {/* Same shrink-0 wrap pattern as NeighborhoodSelector above. */}
            <div className="shrink-0">
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
            </div>

            {/* Count — the API's TOTAL match count, not the loaded-page length
                (sortedListings.length capped the label at the 50-row first page).
                Codex #384: the API total predates post-filters (amenities/keywords/
                open-house...), so once every page is loaded (!hasMore) the loaded
                length IS the exact post-filtered count and wins; while more pages
                remain, the API total is the best available figure (exact
                post-filtered totals = ledger S2, API-side). */}
            <p className="text-xs sm:text-sm text-brand-dark/70 ml-auto whitespace-nowrap font-medium shrink-0" aria-live="polite">
              {loading
                ? 'Searching...'
                : (() => {
                    const count = !hasMore ? sortedListings.length : (total ?? sortedListings.length);
                    return `${count.toLocaleString()} ${count === 1 ? 'property' : 'properties'}`;
                  })()}
            </p>

            {(activeFilterPills.length > 0 || searchQuery) && (
              <button onClick={clearFilters} className="text-xs bg-gray-100 hover:bg-gray-200 text-brand-dark/70 hover:text-brand-dark px-3 py-1.5 rounded-full whitespace-nowrap font-medium transition-colors shrink-0">
                Reset Search
              </button>
            )}
          </div>
        </div>
      </div>

      {/* RecentlyViewed removed — not needed on search page */}

      {/* ── Filter Chips ── */}
      {chips.length > 0 && (
        <div className="flex-shrink-0 bg-white border-b border-black/5 px-4 md:px-6 py-2">
          <div className="max-w-[1920px] mx-auto">
            <SearchChips
              chips={chips}
              onRemove={handleChipRemove}
              onClearAll={handleChipClearAll}
              total={loading ? undefined : total}
            />
          </div>
        </div>
      )}

      {/* FARE Act notice — NYC LL 119/2024 requires broker-fee disclosure wherever
          rental fees are advertised, not only on detail pages. */}
      {isRental && (
        <div className="flex-shrink-0 bg-amber-50/60 border-b border-amber-200/50 px-4 md:px-6 py-1.5">
          <p className="max-w-[1920px] mx-auto text-[11px] text-amber-900/90 leading-tight">
            <strong>FARE Act (NYC LL 119/2024):</strong> Under New York City law, broker fees
            may only be charged to the party who hires the broker. Per-listing fee
            responsibility (tenant pays / no-fee / landlord pays) is displayed on each
            listing card and detail page.
          </p>
        </div>
      )}

      {/* ── Main Area ── */}
      <div className={`flex-1 min-h-0 ${isFullViewport ? 'overflow-hidden isolate' : 'overflow-y-auto'}`}>
        {/* Error */}
        {error && (
          <div className="text-center py-8 mx-4 mt-4 glass-card rounded-3xl">
            <p className="text-red-500 mb-2">{error}</p>
            <button onClick={clearFilters} className="text-brand-dark hover:underline text-sm">Try again</button>
          </div>
        )}

        {/* Loading skeleton — no spinner, shows layout immediately.
            Skeleton aspect ratios MUST match the actual card image aspect ratio
            (split view → SplitCard → IDXImage aspect="wide" → aspect-[3/2];
            grid/list view → GridCard/ListCard → IDXImage aspect="card" → aspect-[4/3]).
            Mismatch causes the grid row to commit a taller height during the
            loading-to-loaded transition, leaving cards that load slightly
            later than their row neighbors with visible whitespace above their
            shorter image (audit 2026-05-01). */}
        {loading && !error && sortedListings.length === 0 && (
          <div className={isFullViewport ? 'flex h-full' : 'py-6'}>
            {viewMode === 'split' && (
              <>
                {/* F1 follow-up (PR-FE.1 Codex review, 2026-05-15) — skeleton
                    grid must use the SAME `grid-cols-1 lg:grid-cols-2`
                    responsive class as the loaded-state grid at line ~1103.
                    Pre-fix this skeleton was `grid grid-cols-2` unconditional,
                    which (a) overflowed the 390px viewport during the loading
                    state and (b) caused a visible 2→1 column CLS jump when
                    the data arrived and the loaded grid (already collapsing
                    to 1 col on mobile) replaced the skeleton. Same responsive
                    shape keeps skeleton and loaded paint widths identical at
                    every breakpoint. */}
                <div className="flex-1 lg:w-[55%] p-2 grid grid-cols-1 lg:grid-cols-2 gap-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="bg-gray-100 rounded-xl animate-pulse" style={{ aspectRatio: '3/2' }} />
                  ))}
                </div>
                <div className="hidden lg:block w-[45%] h-full bg-gray-100 animate-pulse" />
              </>
            )}
            {viewMode !== 'split' && (
              <div className="max-w-6xl mx-auto px-4 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-gray-100 rounded-2xl animate-pulse" style={{ aspectRatio: '4/3' }} />
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
            {/* Listings — left 55%.
                `scrollbar-gutter: stable` reserves the scrollbar's column even
                when content fits without scrolling, so the grid width does NOT
                recalculate when listings finish loading and the scrollbar
                appears. Compounds with the skeleton-aspect fix above to
                eliminate row-height jumps during the loading transition. */}
            <div ref={listingsRef} className="flex-1 lg:w-[55%] overflow-y-auto border-r border-black/5" style={{ scrollbarGutter: 'stable' }}>
              {/* F1 (2026-05-15) — split-view grid must collapse to 1 column
                  below `lg` (1024px). The previous unconditional `grid-cols-2`
                  rendered ~583px-wide cards inside a 390px mobile viewport,
                  clipping them via the parent `overflow-y-auto` and producing
                  the "wrap / overflow" symptom Maya flagged. The map column
                  is already `hidden lg:block` (line ~1094) so on mobile the
                  listings panel owns the full width; a 1-col grid here yields
                  clean full-width cards with no horizontal overflow. The
                  `lg:grid-cols-2` restores the desktop 2-col layout that
                  pairs with the 45% map column. */}
              <div className="p-2 grid grid-cols-1 lg:grid-cols-2 gap-2">
                {sortedListings.map((listing, i) => (
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
                      // First two rows of this 2-col grid are above the
                      // fold — load them eagerly so the visible photos
                      // don't wait on the lazy loader. Everything below
                      // stays lazy.
                      priority={i < 4}
                    />
                  </div>
                ))}
                {hasMore && (
                  <div className="text-center py-4">
                    <button onClick={loadMore} disabled={loadingMore} className="px-6 py-2 bg-brand-dark text-white text-sm font-medium rounded-xl hover:bg-brand-dark/90 transition-colors disabled:opacity-60 disabled:cursor-wait">
                      {loadingMore ? 'Loading...' : 'Load More'}
                    </button>
                  </div>
                )}
                {/* REBNY compliance disclaimer — bottom of listings */}
                <IDXSearchDisclaimer className="text-center py-3" />
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
            {/* 2026-05-17 — `grid-cols-1` (NEW) is load-bearing on mobile.
                Without an explicit mobile column template, CSS Grid defaults
                to a single auto-sized column that grows to max-content. The
                inside-card photo has 1920 px intrinsic width, so the auto
                column expands to ~583 px on a 390 px viewport and pushes
                cards outside the visible viewport (DOM-confirmed via
                Playwright diag 2026-05-17). Adding `grid-cols-1` pins the
                track to `minmax(0, 1fr)` = 358 px at 390 px and the cards
                fit. Mirrors the fix PR #142 applied to the split-view grid
                at line 1113. The `md:grid-cols-2` breakpoint is unchanged —
                tablet+ keeps the 2-col layout. */}
            <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
              {sortedListings.map((listing, i) => (
                <div key={listing.id} ref={(el) => { if (el) cardRefs.current.set(listing.id, el); }}>
                  {/* Above-fold rows load eagerly; the rest stay lazy. */}
                  <GridCard listing={listing} isRental={isRental} isHighlighted={highlightedId === listing.id} onHover={setHighlightedId} priority={i < 4} />
                </div>
              ))}
            </div>
            {hasMore && (
              <div className="text-center py-8">
                <button onClick={loadMore} disabled={loadingMore} className="px-8 py-3 bg-brand-dark text-white font-medium rounded-2xl hover:bg-brand-dark/90 transition-colors disabled:opacity-60 disabled:cursor-wait">
                  {loadingMore ? 'Loading...' : 'Load More Properties'}
                </button>
              </div>
            )}
            <p className="text-[9px] text-brand-dark/30 text-center py-2 leading-relaxed max-w-4xl mx-auto">
              Based on information from the REBNY Listing Service. Information deemed reliable but not guaranteed. Data is for personal, non-commercial use only. Mallan Real Estate Inc. — Licensed Real Estate Broker, New York State · Equal Housing Opportunity · Commission rates are not set by law and are fully negotiable.
            </p>
          </div>
        )}

        {/* ── ALL MAP VIEW ── */}
        {!loading && !error && sortedListings.length > 0 && viewMode === 'all-map' && (
          <div className="h-full isolate relative">
            <SearchMap
              listings={sortedListings}
              highlightedId={highlightedId}
              onMarkerClick={handleMarkerClick}
            />
            <div className="absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur-sm px-4 py-1.5 z-10">
              <p className="text-[9px] text-brand-dark/30 text-center leading-relaxed">
                Based on information from the REBNY Listing Service. Information deemed reliable but not guaranteed. Mallan Real Estate Inc. — Licensed Real Estate Broker · Equal Housing Opportunity · Commission rates are not set by law and are fully negotiable.
              </p>
            </div>
          </div>
        )}

        {/* ── GRID VIEW (traditional scroll) ── */}
        {!loading && !error && sortedListings.length > 0 && viewMode === 'grid' && (
          <section className="py-6">
            <div className="max-w-7xl mx-auto px-4">
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sortedListings.map((listing, i) => (
                  // 3-col at lg — first two rows are above the fold.
                  // `gridTight`: this layout renders ~326-416px at lg+,
                  // materially narrower than the 2-col all-listings grid.
                  <GridCard key={listing.id} listing={listing} isRental={isRental} onHover={setHighlightedId} priority={i < 6} sizeProfile="gridTight" />
                ))}
              </div>
              {hasMore && (
                <div className="text-center mt-8">
                  <button onClick={loadMore} className="px-8 py-3 bg-brand-dark text-white font-medium rounded-2xl hover:bg-brand-dark/90 transition-colors">
                    Load More Properties
                  </button>
                </div>
              )}
              <p className="text-[9px] text-brand-dark/30 text-center py-4 leading-relaxed">
                Based on information from the REBNY Listing Service. Information deemed reliable but not guaranteed. Data is for personal, non-commercial use only. Mallan Real Estate Inc. — Licensed Real Estate Broker, New York State · Equal Housing Opportunity · Commission rates are not set by law and are fully negotiable.
              </p>
            </div>
          </section>
        )}

        {/* ── LIST VIEW (traditional scroll) ── */}
        {!loading && !error && sortedListings.length > 0 && viewMode === 'list' && (
          <section className="py-6">
            <div className="max-w-7xl mx-auto px-4">
              <div className="flex flex-col gap-4">
                {sortedListings.map((listing, i) => (
                  // Single column — only the first few rows are visible.
                  <ListCard key={listing.id} listing={listing} isRental={isRental} onHover={setHighlightedId} priority={i < 3} />
                ))}
              </div>
              <p className="text-[9px] text-brand-dark/30 text-center py-4 leading-relaxed">
                Based on information from the REBNY Listing Service. Information deemed reliable but not guaranteed. Data is for personal, non-commercial use only. Mallan Real Estate Inc. — Licensed Real Estate Broker, New York State · Equal Housing Opportunity · Commission rates are not set by law and are fully negotiable.
              </p>
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
              Our agents can help you find exactly what you&apos;re looking for across all available listings.
            </p>
            <Link href="/agents" className="inline-block px-8 py-3 bg-brand-dark text-white font-medium rounded-2xl hover:bg-brand-dark/90 transition-colors">
              Contact an Agent
            </Link>
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
