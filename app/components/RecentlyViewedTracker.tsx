'use client';

import { useEffect } from 'react';

interface RecentlyViewedItem {
  id: string;
  slug: string;
  address: string;
  price: number;
  photo: string;
  beds: number;
  baths: number;
  type: 'sale' | 'rent';
  viewedAt: number;
}

const STORAGE_KEY = 'mallan_recently_viewed';
const MAX_ITEMS = 12;

/**
 * Records a listing view to localStorage.
 * Drop this into the listing detail page as a client component.
 */
export default function RecentlyViewedTracker({
  id, slug, address, price, photo, beds, baths, type,
}: Omit<RecentlyViewedItem, 'viewedAt'>) {
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const items: RecentlyViewedItem[] = raw ? JSON.parse(raw) : [];
      // Remove duplicate if already viewed
      const filtered = items.filter((item) => item.id !== id);
      // Add to front
      filtered.unshift({ id, slug, address, price, photo, beds, baths, type, viewedAt: Date.now() });
      // Cap at MAX_ITEMS
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered.slice(0, MAX_ITEMS)));
      // Reset dismiss flag so strip reappears with new content
      localStorage.removeItem('mallan_rv_dismissed');
    } catch {
      // localStorage unavailable — no-op
    }
  }, [id, slug, address, price, photo, beds, baths, type]);

  return null;
}

/** Read recently viewed listings from localStorage (client-side only). */
export function getRecentlyViewed(): RecentlyViewedItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
