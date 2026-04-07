'use client';

import Link from 'next/link';
import { useSavedSearches, type SavedSearchEntry } from '@/lib/hooks/useSavedSearches';

function formatFilters(filters: SavedSearchEntry['filters']): string {
  const parts: string[] = [];
  if (filters.beds) parts.push(`${filters.beds}+ beds`);
  if (filters.baths) parts.push(`${filters.baths}+ baths`);
  if (filters.minPrice || filters.maxPrice) {
    const min = filters.minPrice ? `$${filters.minPrice.toLocaleString()}` : '';
    const max = filters.maxPrice ? `$${filters.maxPrice.toLocaleString()}` : '';
    if (min && max) parts.push(`${min}–${max}`);
    else if (min) parts.push(`${min}+`);
    else if (max) parts.push(`Up to ${max}`);
  }
  if (filters.neighborhood) parts.push(filters.neighborhood);
  if (filters.borough) parts.push(filters.borough);
  if (filters.propertyType) parts.push(filters.propertyType);
  return parts.length > 0 ? parts.join(' · ') : 'All listings';
}

function buildSearchUrl(search: SavedSearchEntry): string {
  const base = search.type === 'rent' ? '/rent' : '/buy';
  const params = new URLSearchParams();
  const f = search.filters;
  if (f.minPrice) params.set('minPrice', String(f.minPrice));
  if (f.maxPrice) params.set('maxPrice', String(f.maxPrice));
  if (f.beds) params.set('beds', String(f.beds));
  if (f.baths) params.set('baths', String(f.baths));
  if (f.propertyType) params.set('propertyType', f.propertyType);
  if (f.neighborhood) params.set('neighborhood', f.neighborhood);
  if (f.borough) params.set('borough', f.borough);
  if (f.minSqft) params.set('minSqft', String(f.minSqft));
  if (f.maxSqft) params.set('maxSqft', String(f.maxSqft));
  if (f.status) params.set('status', f.status);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export default function SavedSearchesPage() {
  const { searches, deleteSearch, clearAll, loaded } = useSavedSearches();

  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <main className="pt-24 pb-20 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-display font-semibold">Saved Searches</h1>
              {loaded ? (
                <p className="text-brand-dark/85 text-sm mt-1">
                  {searches.length} saved search{searches.length !== 1 ? 'es' : ''}
                </p>
              ) : (
                <div className="animate-pulse mt-1.5">
                  <div className="h-3.5 w-32 bg-gray-200/70 rounded" />
                </div>
              )}
            </div>
            {searches.length > 0 && (
              <button
                onClick={() => {
                  if (confirm('Remove all saved searches?')) clearAll();
                }}
                className="text-sm text-red-500 hover:text-red-600 transition-colors"
              >
                Clear All
              </button>
            )}
          </div>

          {!loaded ? (
            <div className="space-y-3 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="rounded-2xl ring-1 ring-black/[0.03] p-4 flex items-center gap-4"
                >
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="h-4 w-40 bg-gray-200/70 rounded" />
                    <div className="h-3 w-64 bg-gray-100 rounded" />
                    <div className="h-2.5 w-24 bg-gray-100/80 rounded" />
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <div className="h-8 w-24 bg-gray-200/50 rounded-xl" />
                    <div className="h-8 w-8 bg-gray-100 rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          ) : searches.length === 0 ? (
            <div className="text-center py-20 max-w-md mx-auto">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gray-50 flex items-center justify-center">
                <svg className="w-10 h-10 text-brand-dark/15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-brand-dark mb-2">No saved searches yet</h2>
              <p className="text-brand-dark/60 text-sm leading-relaxed mb-8">
                Set your ideal criteria and save the search.
                <br />
                Come back anytime to run it with a single tap.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href="/search"
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-brand-dark text-white rounded-2xl text-sm font-medium hover:bg-brand-dark/90 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Start Searching
                </Link>
                <Link href="/buy" className="px-6 py-2.5 ring-1 ring-black/10 text-brand-dark rounded-2xl text-sm font-medium hover:bg-gray-50 transition-colors">
                  Browse Sales
                </Link>
                <Link href="/rent" className="px-6 py-2.5 ring-1 ring-black/10 text-brand-dark rounded-2xl text-sm font-medium hover:bg-gray-50 transition-colors">
                  Browse Rentals
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {searches.map((search) => (
                <div
                  key={search.id}
                  className="bg-white rounded-2xl ring-1 ring-black/5 p-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:shadow-sm transition-shadow"
                >
                  <div className="flex-1 min-w-0">
                    <Link
                      href={buildSearchUrl(search)}
                      className="font-medium text-sm hover:text-brand-gold transition-colors"
                    >
                      {search.name}
                    </Link>
                    <p className="text-brand-dark/90 text-xs mt-1 truncate">
                      {formatFilters(search.filters)}
                    </p>
                    <p className="text-brand-dark/85 text-[10px] mt-1">
                      Saved {new Date(search.savedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Link
                      href={buildSearchUrl(search)}
                      className="px-4 py-2 text-xs font-medium bg-brand-dark text-white rounded-xl hover:bg-brand-dark/90 transition-colors"
                    >
                      Run Search
                    </Link>
                    <button
                      onClick={() => deleteSearch(search.id)}
                      className="px-3 py-2 text-xs text-brand-dark/90 hover:text-red-500 rounded-xl ring-1 ring-black/5 hover:ring-red-200 transition-colors"
                      title="Remove"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
