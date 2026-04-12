'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { toDisplayListing, type DisplayListing } from '@/lib/idx/display-adapter';

export interface UseListingsParams {
  type?: 'sale' | 'rent' | 'buy';
  minPrice?: number;
  maxPrice?: number;
  beds?: number | null;
  maxBeds?: number | null;
  minBaths?: number | null;
  maxBaths?: number | null;
  propertyType?: string;
  status?: string;
  statuses?: string[];
  borough?: string;
  neighborhood?: string;
  minSqft?: number;
  maxSqft?: number;
  sort?: string;
  skip?: number;
  pets?: boolean;
  limit?: number;
  // New filter params
  commercial?: boolean;
  propertySubTypes?: string[];
  ownershipTypes?: string[];
  yearBuilt?: string;
  furnished?: boolean;
  amenities?: string[];
  openHouse?: boolean;
  openHouseDate?: string;
  zipCodes?: string;
  address?: string;
  keywords?: string[];
  /** Pre-fetched listings from server (ISR) — skips initial client fetch */
  initialListings?: DisplayListing[];
  initialTotal?: number;
  initialHasMore?: boolean;
}

interface UseListingsResult {
  listings: DisplayListing[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  source: string;
  total: number;
  hasMore: boolean;
  loadMore: () => void;
  refetch: () => void;
}

const DEBOUNCE_MS = 300;
const CACHE_PREFIX = 'mallan_search_';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedResult {
  listings: DisplayListing[];
  total: number;
  hasMore: boolean;
  source: string;
  ts: number;
}

function getCachedSearch(key: string): CachedResult | null {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const cached: CachedResult = JSON.parse(raw);
    if (Date.now() - cached.ts > CACHE_TTL_MS) {
      sessionStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

function setCachedSearch(key: string, data: CachedResult): void {
  try {
    sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data));
  } catch {
    // Storage full — silently ignore
  }
}

function buildQueryString(params: UseListingsParams): string {
  const qs = new URLSearchParams();

  if (params.type) qs.set('type', params.type === 'buy' ? 'sale' : params.type);
  if (params.minPrice && params.minPrice > 0) qs.set('minPrice', String(params.minPrice));
  if (params.maxPrice && params.maxPrice < 99999999) qs.set('maxPrice', String(params.maxPrice));
  if (params.beds != null && params.beds >= 0) qs.set('beds', String(params.beds));
  if (params.maxBeds != null && params.maxBeds >= 0) qs.set('maxBeds', String(params.maxBeds));
  if (params.minBaths != null && params.minBaths > 0) qs.set('minBaths', String(params.minBaths));
  if (params.maxBaths != null && params.maxBaths > 0) qs.set('maxBaths', String(params.maxBaths));
  if (params.propertyType) qs.set('propertyType', params.propertyType);
  if (params.status) qs.set('status', params.status);
  if (params.borough) qs.set('borough', params.borough);
  if (params.neighborhood) qs.set('neighborhood', params.neighborhood);
  if (params.minSqft && params.minSqft > 0) qs.set('minSqft', String(params.minSqft));
  if (params.maxSqft && params.maxSqft > 0) qs.set('maxSqft', String(params.maxSqft));
  if (params.sort) qs.set('sort', params.sort);
  if (params.skip && params.skip > 0) qs.set('skip', String(params.skip));
  if (params.pets) qs.set('pets', 'true');
  // New filter params
  if (params.commercial) qs.set('commercial', 'true');
  if (params.propertySubTypes?.length) qs.set('propertySubTypes', params.propertySubTypes.join(','));
  if (params.ownershipTypes?.length) qs.set('ownershipTypes', params.ownershipTypes.join(','));
  if (params.statuses?.length) qs.set('statuses', params.statuses.join(','));
  if (params.yearBuilt && params.yearBuilt !== 'any') qs.set('yearBuilt', params.yearBuilt);
  if (params.furnished) qs.set('furnished', 'true');
  if (params.amenities?.length) qs.set('amenities', params.amenities.join(','));
  if (params.openHouse) qs.set('openHouse', 'true');
  if (params.openHouseDate) qs.set('openHouseDate', params.openHouseDate);
  if (params.zipCodes) qs.set('zipCodes', params.zipCodes);
  if (params.address) qs.set('address', params.address);
  if (params.keywords?.length) qs.set('keywords', params.keywords.join(','));

  qs.set('limit', String(params.limit || 50));

  return qs.toString();
}

/** Check if any user-applied filter is active (not just defaults) */
function hasActiveFilters(params: UseListingsParams): boolean {
  return !!(
    params.minPrice ||
    (params.maxPrice && params.maxPrice < 99999999) ||
    (params.beds != null && params.beds >= 0) ||
    (params.maxBeds != null && params.maxBeds >= 0) ||
    (params.minBaths != null && params.minBaths > 0) ||
    (params.maxBaths != null && params.maxBaths > 0) ||
    params.propertyType ||
    params.status ||
    params.statuses?.length ||
    params.borough ||
    params.neighborhood ||
    params.minSqft ||
    params.maxSqft ||
    params.pets ||
    params.commercial ||
    params.propertySubTypes?.length ||
    params.ownershipTypes?.length ||
    (params.yearBuilt && params.yearBuilt !== 'any') ||
    params.furnished ||
    params.amenities?.length ||
    params.openHouse ||
    params.openHouseDate ||
    params.zipCodes ||
    params.address ||
    params.keywords?.length ||
    (params.sort && params.sort !== 'newest')
  );
}

export function useListings(params: UseListingsParams): UseListingsResult {
  const hasInitial = !!(params.initialListings && params.initialListings.length > 0);
  const [listings, setListings] = useState<DisplayListing[]>(params.initialListings || []);
  const [loading, setLoading] = useState(!hasInitial);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState(hasInitial ? 'idx+exclusive' : '');
  const [total, setTotal] = useState(params.initialTotal || 0);
  const [hasMore, setHasMore] = useState(params.initialHasMore || false);
  const abortRef = useRef<AbortController | null>(null);
  const appendAbortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchIdRef = useRef(0);
  const skipRef = useRef(params.skip || 0);
  // Track whether we've ever done a client-side fetch (skip first if we have initial data)
  const hasClientFetched = useRef(false);

  const fetchListings = useCallback(async (queryString: string, id: number, append = false) => {
    // Use separate abort controllers for initial vs append fetches
    // so a filter change doesn't silently kill a loadMore in-flight
    if (append) {
      appendAbortRef.current?.abort();
      const controller = new AbortController();
      appendAbortRef.current = controller;

      setLoadingMore(true);
      setError(null);

      try {
        const res = await fetch(`/api/listings?${queryString}`, {
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(res.status === 429 ? 'Too many requests. Please wait.' : `Failed to load listings (${res.status})`);
        }

        const data = await res.json();

        if (!data.success) {
          throw new Error(data.error || 'Failed to load listings');
        }

        const mapped = (data.listings || []).map(toDisplayListing);
        setListings((prev) => [...prev, ...mapped]);
        setTotal(data.total || mapped.length);
        setHasMore(data.hasMore || false);
        setSource(data._compliance?.source || 'unknown');
        hasClientFetched.current = true;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // On append failure, don't clear listings — just show error
        setError(err instanceof Error ? err.message : 'Failed to load more listings');
      } finally {
        setLoadingMore(false);
      }
      return;
    }

    // Non-append: cancel any in-flight request (including loadMore)
    abortRef.current?.abort();
    appendAbortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setLoadingMore(false);
    setError(null);

    try {
      const res = await fetch(`/api/listings?${queryString}`, {
        signal: controller.signal,
      });

      // Stale response — a newer fetch was triggered
      if (id !== fetchIdRef.current) return;

      if (!res.ok) {
        throw new Error(res.status === 429 ? 'Too many requests. Please wait.' : `Failed to load listings (${res.status})`);
      }

      const data = await res.json();

      if (id !== fetchIdRef.current) return;

      if (!data.success) {
        throw new Error(data.error || 'Failed to load listings');
      }

      const mapped = (data.listings || []).map(toDisplayListing);
      setListings(mapped);
      setTotal(data.total || mapped.length);
      setHasMore(data.hasMore || false);
      setSource(data._compliance?.source || 'unknown');
      hasClientFetched.current = true;

      // Cache for instant back-navigation
      setCachedSearch(queryString, {
        listings: mapped,
        total: data.total || mapped.length,
        hasMore: data.hasMore || false,
        source: data._compliance?.source || 'unknown',
        ts: Date.now(),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (id !== fetchIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load listings');
      setListings([]);
    } finally {
      if (id === fetchIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // Debounced fetch when params change (not skip for pagination)
  useEffect(() => {
    // Skip the initial fetch if we have server-provided data and no filters are active
    if (hasInitial && !hasClientFetched.current && !hasActiveFilters(params)) {
      hasClientFetched.current = false; // will fetch on next filter change
      return;
    }

    skipRef.current = 0; // Reset pagination on filter change
    const qs = buildQueryString({ ...params, skip: 0 });
    const id = ++fetchIdRef.current;

    if (timerRef.current) clearTimeout(timerRef.current);

    // On initial load, try sessionStorage cache for instant paint
    if (!hasClientFetched.current) {
      const cached = getCachedSearch(qs);
      if (cached) {
        setListings(cached.listings);
        setTotal(cached.total);
        setHasMore(cached.hasMore);
        setSource(cached.source);
        setLoading(false);
        hasClientFetched.current = true;
        return;
      }
      fetchListings(qs, id);
      return;
    }

    timerRef.current = setTimeout(() => {
      fetchListings(qs, id);
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    params.type,
    params.minPrice,
    params.maxPrice,
    params.beds,
    params.maxBeds,
    params.minBaths,
    params.maxBaths,
    params.propertyType,
    params.status,
    params.borough,
    params.neighborhood,
    params.minSqft,
    params.maxSqft,
    params.sort,
    params.pets,
    params.limit,
    params.commercial,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    params.propertySubTypes?.join(','),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    params.ownershipTypes?.join(','),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    params.statuses?.join(','),
    params.yearBuilt,
    params.furnished,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    params.amenities?.join(','),
    params.openHouse,
    params.openHouseDate,
    params.zipCodes,
    params.address,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    params.keywords?.join(','),
    fetchListings,
    hasInitial,
  ]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    const nextSkip = skipRef.current + (params.limit || 50);
    skipRef.current = nextSkip;
    const qs = buildQueryString({ ...params, skip: nextSkip });
    const id = ++fetchIdRef.current;
    fetchListings(qs, id, true);
  }, [params, loading, loadingMore, hasMore, fetchListings]);

  const refetch = useCallback(() => {
    skipRef.current = 0;
    const qs = buildQueryString({ ...params, skip: 0 });
    const id = ++fetchIdRef.current;
    fetchListings(qs, id);
  }, [params, fetchListings]);

  return { listings, loading, loadingMore, error, source, total, hasMore, loadMore, refetch };
}
