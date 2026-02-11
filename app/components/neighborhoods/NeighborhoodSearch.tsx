'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import type { Neighborhood, BoroughSlug } from '@/lib/types/neighborhood';
import SubwayBadge from './SubwayBadge';

interface NeighborhoodSearchProps {
  neighborhoods: Neighborhood[];
  boroughSlug: BoroughSlug;
}

export default function NeighborhoodSearch({
  neighborhoods,
  boroughSlug,
}: NeighborhoodSearchProps) {
  const [query, setQuery] = useState('');

  const sorted = useMemo(
    () => [...neighborhoods].sort((a, b) => a.name.localeCompare(b.name)),
    [neighborhoods]
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return sorted;
    const q = query.toLowerCase().trim();
    return sorted.filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        n.tagline.toLowerCase().includes(q) ||
        n.zipCodes.some((z) => z.includes(q))
    );
  }, [sorted, query]);

  // Quick-jump letters from sorted neighborhoods
  const letters = useMemo(() => {
    const set = new Set(sorted.map((n) => n.name[0].toUpperCase()));
    return Array.from(set).sort();
  }, [sorted]);

  return (
    <section aria-label="Neighborhoods" className="py-10 sm:py-14">
      <div className="max-w-7xl mx-auto px-4">
        {/* Search + Quick Links */}
        <div className="mb-8">
          <div className="relative max-w-md">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search neighborhoods or zip codes..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              aria-label="Search neighborhoods"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label="Clear search"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Quick-jump letters */}
          {!query && (
            <nav aria-label="Jump to letter" className="mt-4 flex flex-wrap gap-1.5">
              {letters.map((letter) => (
                <a
                  key={letter}
                  href={`#neighborhood-${letter}`}
                  className="inline-flex items-center justify-center w-8 h-8 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-900 hover:text-white transition-colors"
                >
                  {letter}
                </a>
              ))}
            </nav>
          )}
        </div>

        {/* Results count when filtering */}
        {query && (
          <p className="text-sm text-gray-500 mb-4">
            {filtered.length} neighborhood{filtered.length !== 1 ? 's' : ''} found
          </p>
        )}

        {/* Grid with letter anchors */}
        {filtered.length === 0 ? (
          <p className="text-gray-500 text-center py-12">
            No neighborhoods match &ldquo;{query}&rdquo;. Try a different search.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((n, i) => {
              const currentLetter = n.name[0].toUpperCase();
              const prevLetter = i > 0 ? filtered[i - 1].name[0].toUpperCase() : null;
              const isNewLetter = currentLetter !== prevLetter;

              return (
                <div key={n.slug} className="contents">
                  {isNewLetter && !query && (
                    <div
                      id={`neighborhood-${currentLetter}`}
                      className="col-span-full scroll-mt-24"
                    >
                      <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-1 mb-2">
                        {currentLetter}
                      </h3>
                    </div>
                  )}
                  <Link
                    href={`/${boroughSlug}/${n.slug}`}
                    className="group block relative overflow-hidden rounded-lg aspect-[3/2]"
                  >
                    <div
                      className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
                      style={{ backgroundImage: `url(${n.heroImage})` }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                    <div className="absolute bottom-0 left-0 right-0 p-5">
                      <h3 className="text-xl font-semibold text-white">{n.name}</h3>
                      <p className="text-sm text-white/80 mt-0.5">{n.tagline}</p>

                      <div className="flex items-center justify-between mt-3">
                        <div className="flex gap-1">
                          {n.transit.slice(0, 5).map((line) => (
                            <SubwayBadge key={line} line={line} />
                          ))}
                        </div>
                        <span className="text-sm text-white/90 font-medium">
                          From $
                          {n.marketStats.medianSalePrice >= 1_000_000
                            ? `${(n.marketStats.medianSalePrice / 1_000_000).toFixed(1)}M`
                            : `${Math.round(n.marketStats.medianSalePrice / 1_000)}K`}
                        </span>
                      </div>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
