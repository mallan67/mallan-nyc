'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getRecentlyViewed } from './RecentlyViewedTracker';

function formatPrice(price: number, type: 'sale' | 'rent'): string {
  if (type === 'rent') return `$${price.toLocaleString()}/mo`;
  if (price >= 1_000_000) return `$${(price / 1_000_000).toFixed(price % 1_000_000 === 0 ? 0 : 1)}M`;
  if (price >= 1_000) return `$${(price / 1_000).toFixed(0)}K`;
  return `$${price.toLocaleString()}`;
}

/**
 * Horizontal scrollable strip of recently viewed listings.
 * Renders from localStorage — no API calls.
 */
export default function RecentlyViewed() {
  const [items, setItems] = useState<ReturnType<typeof getRecentlyViewed>>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if user dismissed during this session
    try {
      if (sessionStorage.getItem('mallan_rv_dismissed') === '1') {
        setDismissed(true);
        return;
      }
    } catch { /* no-op */ }
    setItems(getRecentlyViewed());
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem('mallan_rv_dismissed', '1'); } catch { /* no-op */ }
  };

  const handleClear = () => {
    try { localStorage.removeItem('mallan_recently_viewed'); } catch { /* no-op */ }
    setItems([]);
  };

  if (dismissed || items.length === 0) return null;

  return (
    <div className="bg-white/80 backdrop-blur border-b border-black/5 px-4 py-2">
      <div className="max-w-[1920px] mx-auto">
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="text-xs font-semibold text-brand-dark/70 tracking-wide uppercase">Recently Viewed</h3>
          <div className="flex items-center gap-3">
            <button
              onClick={handleClear}
              className="text-brand-dark/40 hover:text-brand-dark/70 text-[10px] uppercase tracking-wide"
              aria-label="Clear recently viewed"
            >
              Clear
            </button>
            <button
              onClick={handleDismiss}
              className="text-brand-dark/40 hover:text-brand-dark/70 text-xs"
              aria-label="Dismiss recently viewed"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/listing/${item.slug}?key=${encodeURIComponent(item.id)}`}
              className="flex-shrink-0 group flex items-center gap-2 bg-white rounded-lg ring-1 ring-black/5 hover:ring-brand-gold/30 transition-all pr-3"
            >
              {item.photo ? (
                <div className="w-14 h-14 rounded-l-lg overflow-hidden flex-shrink-0">
                  <img
                    src={item.photo}
                    alt={item.address}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    loading="lazy"
                  />
                </div>
              ) : (
                <div className="w-14 h-14 rounded-l-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                  </svg>
                </div>
              )}
              <div className="py-1.5 min-w-0">
                <p className="text-xs font-semibold text-brand-dark truncate max-w-[140px]">
                  {formatPrice(item.price, item.type)}
                </p>
                <p className="text-[10px] text-brand-dark/60 truncate max-w-[140px]">
                  {item.address}
                </p>
                <p className="text-[10px] text-brand-dark/40">
                  {item.beds === 0 ? 'Studio' : `${item.beds} bed`} / {item.baths} bath
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
