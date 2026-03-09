'use client';

import { useState } from 'react';
import CompareProperties from '@/app/components/CompareProperties';
import Link from 'next/link';
import { useFavorites, type FavoriteEntry } from '@/lib/hooks/useFavorites';

export default function ComparePage() {
  const { favorites, loaded } = useFavorites();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [comparing, setComparing] = useState(false);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 4) {
        next.add(id);
      }
      return next;
    });
  };

  const selectedEntries = favorites.filter(f => selected.has(f.id));

  const handleRemove = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.delete(id);
      if (next.size < 2) setComparing(false);
      return next;
    });
  };

  if (comparing && selectedEntries.length >= 2) {
    return (
      <div className="min-h-screen bg-[#FEFEFE] font-sans">
        <main className="pt-24 pb-20 px-4">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-2xl font-display font-semibold">Compare Properties</h1>
                <p className="text-brand-dark/85 text-sm mt-1">
                  Side-by-side comparison of {selectedEntries.length} properties
                </p>
              </div>
              <button
                onClick={() => setComparing(false)}
                className="text-sm text-brand-dark/70 hover:text-brand-dark transition-colors flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                Back to selection
              </button>
            </div>

            <div className="glass-card rounded-3xl p-6">
              <CompareProperties entries={selectedEntries} onRemove={handleRemove} />
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <main className="pt-24 pb-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-display font-semibold">Compare Properties</h1>
              <p className="text-brand-dark/85 text-sm mt-1">
                {loaded
                  ? favorites.length > 0
                    ? `Select 2-4 properties to compare (${selected.size} selected)`
                    : 'Save properties first, then compare them side by side'
                  : 'Loading...'}
              </p>
            </div>
            {selected.size >= 2 && (
              <button
                onClick={() => setComparing(true)}
                className="px-6 py-2.5 bg-brand-dark text-white rounded-2xl text-sm font-medium hover:bg-brand-dark/90 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
                Compare {selected.size} Properties
              </button>
            )}
          </div>

          {!loaded ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse bg-gray-100 rounded-2xl h-28" />
              ))}
            </div>
          ) : favorites.length === 0 ? (
            <div className="text-center py-20">
              <svg className="w-16 h-16 text-brand-dark/10 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
              <h2 className="text-lg font-medium text-brand-dark/90 mb-2">No saved properties to compare</h2>
              <p className="text-brand-dark/85 text-sm mb-6">
                Save properties by clicking the heart icon, then come back to compare them.
              </p>
              <div className="flex gap-3 justify-center">
                <Link href="/buy" className="px-5 py-2.5 bg-brand-dark text-white rounded-2xl text-sm font-medium hover:bg-brand-dark/90 transition-colors">
                  Browse Sales
                </Link>
                <Link href="/rent" className="px-5 py-2.5 ring-1 ring-black/10 text-brand-dark rounded-2xl text-sm font-medium hover:bg-gray-50 transition-colors">
                  Browse Rentals
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {favorites.map((fav) => {
                const isSelected = selected.has(fav.id);
                const isDisabled = !isSelected && selected.size >= 4;
                return (
                  <button
                    key={fav.id}
                    onClick={() => !isDisabled && toggleSelect(fav.id)}
                    disabled={isDisabled}
                    className={`text-left bg-white rounded-2xl overflow-hidden transition-all ${
                      isSelected
                        ? 'ring-2 ring-brand-gold shadow-md'
                        : isDisabled
                          ? 'opacity-50 cursor-not-allowed ring-1 ring-black/5'
                          : 'ring-1 ring-black/5 hover:shadow-md cursor-pointer'
                    }`}
                  >
                    {/* Photo */}
                    <div className="relative aspect-[4/3] bg-gray-100">
                      {fav.photoUrl ? (
                        <img
                          src={fav.photoUrl}
                          alt={fav.address}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg className="w-8 h-8 text-brand-dark/10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                      {/* Selection indicator */}
                      <div className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                        isSelected
                          ? 'bg-brand-gold text-white'
                          : 'bg-white/80 text-brand-dark/30 ring-1 ring-black/10'
                      }`}>
                        {isSelected ? (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        ) : (
                          <span className="text-xs font-medium">{selected.size < 4 ? '+' : ''}</span>
                        )}
                      </div>
                      <div className="absolute bottom-2 left-2">
                        <span className={`text-xs font-medium px-2 py-1 rounded-lg ${
                          fav.listingType === 'rent'
                            ? 'bg-purple-600/90 text-white'
                            : 'bg-blue-600/90 text-white'
                        }`}>
                          {fav.listingType === 'rent' ? 'Rental' : 'Sale'}
                        </span>
                      </div>
                    </div>

                    {/* Info */}
                    <div className="p-4">
                      <p className="font-bold text-lg text-brand-dark">
                        {fav.listingType === 'rent'
                          ? `$${fav.price.toLocaleString()}/mo`
                          : `$${fav.price.toLocaleString()}`}
                      </p>
                      <p className="text-brand-dark/90 text-sm mt-1 truncate">{fav.address}</p>
                      <p className="text-brand-dark/85 text-xs mt-1">
                        {fav.beds} Bed{fav.beds !== 1 ? 's' : ''} &middot; {fav.baths} Bath
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {selected.size === 1 && (
            <p className="text-center text-sm text-brand-dark/60 mt-6">
              Select at least one more property to compare.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
