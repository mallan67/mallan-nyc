'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'mallan_saved_searches';

export interface SavedSearchEntry {
  id: string;
  name: string;
  type: 'buy' | 'rent';
  filters: {
    minPrice?: number;
    maxPrice?: number;
    beds?: number;
    baths?: number;
    propertyType?: string;
    status?: string;
    neighborhood?: string;
    borough?: string;
    minSqft?: number;
    maxSqft?: number;
  };
  savedAt: string;
}

function load(): SavedSearchEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(searches: SavedSearchEntry[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(searches));
  } catch { /* storage full */ }
}

export function useSavedSearches() {
  const [searches, setSearches] = useState<SavedSearchEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setSearches(load());
    setLoaded(true);
  }, []);

  const saveSearch = useCallback((entry: Omit<SavedSearchEntry, 'id' | 'savedAt'>) => {
    setSearches(prev => {
      const next = [
        {
          ...entry,
          id: `ss-${Date.now()}`,
          savedAt: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 20); // max 20 saved searches
      save(next);
      return next;
    });
  }, []);

  const deleteSearch = useCallback((id: string) => {
    setSearches(prev => {
      const next = prev.filter(s => s.id !== id);
      save(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setSearches([]);
    save([]);
  }, []);

  return { searches, saveSearch, deleteSearch, clearAll, loaded };
}
