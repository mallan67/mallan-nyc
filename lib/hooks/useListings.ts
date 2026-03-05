'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { toDisplayListing, type DisplayListing } from '@/lib/idx/display-adapter';

export interface UseListingsParams {
  type?: 'sale' | 'rent' | 'buy';
  minPrice?: number;
  maxPrice?: number;
  beds?: number | null;
  minBaths?: number | null;
  propertyType?: string;
  status?: string;
  borough?: string;
  neighborhood?: string;
  minSqft?: number;
  maxSqft?: number;
  sort?: string;
  skip?: number;
  pets?: boolean;
  limit?: number;
}

interface UseListingsResult {
  listings: DisplayListing[];
  loading: boolean;
  error: string | null;
  source: string;
  total: number;
  hasMore: boolean;
  loadMore: () => void;
  refetch: () => void;
}

const DEBOUNCE_MS = 300;

function buildQueryString(params: UseListingsParams): string {
  const qs = new URLSearchParams();

  if (params.type) qs.set('type', params.type === 'buy' ? 'sale' : params.type);
  if (params.minPrice && params.minPrice > 0) qs.set('minPrice', String(params.minPrice));
  if (params.maxPrice && params.maxPrice < 99999999) qs.set('maxPrice', String(params.maxPrice));
  if (params.beds != null && params.beds >= 0) qs.set('beds', String(params.beds));
  if (params.minBaths != null && params.minBaths > 0) qs.set('minBaths', String(params.minBaths));
  if (params.propertyType) qs.set('propertyType', params.propertyType);
  if (params.status) qs.set('status', params.status);
  if (params.borough) qs.set('borough', params.borough);
  if (params.neighborhood) qs.set('neighborhood', params.neighborhood);
  if (params.minSqft && params.minSqft > 0) qs.set('minSqft', String(params.minSqft));
  if (params.maxSqft && params.maxSqft > 0) qs.set('maxSqft', String(params.maxSqft));
  if (params.sort) qs.set('sort', params.sort);
  if (params.skip && params.skip > 0) qs.set('skip', String(params.skip));
  if (params.pets) qs.set('pets', 'true');

  qs.set('limit', String(params.limit || 50));

  return qs.toString();
}

export function useListings(params: UseListingsParams): UseListingsResult {
  const [listings, setListings] = useState<DisplayListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState('');
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchIdRef = useRef(0);
  const skipRef = useRef(params.skip || 0);

  const fetchListings = useCallback(async (queryString: string, id: number, append = false) => {
    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!append) setLoading(true);
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

      if (append) {
        setListings((prev) => [...prev, ...mapped]);
      } else {
        setListings(mapped);
      }

      setTotal(data.total || mapped.length);
      setHasMore(data.hasMore || false);
      setSource(data._compliance?.source || 'unknown');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (id !== fetchIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load listings');
      if (!append) setListings([]);
    } finally {
      if (id === fetchIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // Debounced fetch when params change (not skip for pagination)
  useEffect(() => {
    skipRef.current = 0; // Reset pagination on filter change
    const qs = buildQueryString({ ...params, skip: 0 });
    const id = ++fetchIdRef.current;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      fetchListings(qs, id);
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [
    params.type,
    params.minPrice,
    params.maxPrice,
    params.beds,
    params.minBaths,
    params.propertyType,
    params.status,
    params.borough,
    params.neighborhood,
    params.minSqft,
    params.maxSqft,
    params.sort,
    params.pets,
    params.limit,
    fetchListings,
  ]);

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    const nextSkip = skipRef.current + (params.limit || 50);
    skipRef.current = nextSkip;
    const qs = buildQueryString({ ...params, skip: nextSkip });
    const id = ++fetchIdRef.current;
    fetchListings(qs, id, true);
  }, [params, loading, hasMore, fetchListings]);

  const refetch = useCallback(() => {
    skipRef.current = 0;
    const qs = buildQueryString({ ...params, skip: 0 });
    const id = ++fetchIdRef.current;
    fetchListings(qs, id);
  }, [params, fetchListings]);

  return { listings, loading, error, source, total, hasMore, loadMore, refetch };
}
