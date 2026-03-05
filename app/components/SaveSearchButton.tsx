'use client';

import { useState } from 'react';
import { useSavedSearches, type SavedSearchEntry } from '@/lib/hooks/useSavedSearches';

interface SaveSearchButtonProps {
  type: 'buy' | 'rent';
  filters: SavedSearchEntry['filters'];
}

export default function SaveSearchButton({ type, filters }: SaveSearchButtonProps) {
  const { saveSearch, searches, loaded } = useSavedSearches();
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);

  if (!loaded) return null;

  const hasFilters = Object.values(filters).some(v => v != null && v !== '' && v !== 0);

  const handleSave = () => {
    if (!name.trim()) return;
    saveSearch({ name: name.trim(), type, filters });
    setSaved(true);
    setTimeout(() => {
      setShowModal(false);
      setSaved(false);
      setName('');
    }, 1200);
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        disabled={!hasFilters}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl ring-1 ring-black/5 bg-white/60 text-brand-dark/70 hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        title={hasFilters ? 'Save this search' : 'Set filters first'}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
        Save Search
        {searches.length > 0 && (
          <span className="text-[10px] bg-brand-gold/20 text-brand-gold-deep px-1.5 py-0.5 rounded-full">
            {searches.length}
          </span>
        )}
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            {saved ? (
              <div className="text-center py-4">
                <svg className="w-10 h-10 text-green-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-brand-dark font-medium">Search Saved</p>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-display font-semibold mb-4">Save This Search</h3>
                <div className="space-y-3">
                  <div>
                    <label htmlFor="ss-name" className="block text-xs font-medium text-brand-dark/50 mb-1">
                      Search Name
                    </label>
                    <input
                      id="ss-name"
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="e.g., UES 2BR under $2M"
                      className="w-full rounded-xl px-3 py-2 ring-1 ring-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                      autoFocus
                      onKeyDown={e => e.key === 'Enter' && handleSave()}
                    />
                  </div>
                  <div className="text-xs text-brand-dark/40 space-y-0.5">
                    <p>Type: {type === 'buy' ? 'Sale' : 'Rental'}</p>
                    {filters.beds != null && <p>Beds: {filters.beds}+</p>}
                    {filters.minPrice != null && filters.minPrice > 0 && (
                      <p>Min Price: ${filters.minPrice.toLocaleString()}</p>
                    )}
                    {filters.maxPrice != null && <p>Max Price: ${filters.maxPrice.toLocaleString()}</p>}
                    {filters.propertyType && <p>Type: {filters.propertyType}</p>}
                    {filters.neighborhood && <p>Neighborhood: {filters.neighborhood}</p>}
                    {filters.borough && <p>Borough: {filters.borough}</p>}
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => setShowModal(false)}
                      className="flex-1 px-4 py-2 text-sm font-medium rounded-xl ring-1 ring-black/10 text-brand-dark/60 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={!name.trim()}
                      className="flex-1 px-4 py-2 text-sm font-medium rounded-xl bg-brand-dark text-white hover:bg-brand-dark/90 disabled:opacity-40"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
