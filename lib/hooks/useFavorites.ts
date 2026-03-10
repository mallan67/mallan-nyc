'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'mallan_favorites';

export interface FavoriteEntry {
  id: string;
  slug: string;
  address: string;
  price: number;
  listingType: 'sale' | 'rent';
  beds: number;
  baths: number;
  photoUrl?: string;
  savedAt: string;
  note?: string;
}

function loadFavorites(): Map<string, FavoriteEntry> {
  if (typeof window === 'undefined') return new Map();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const arr: FavoriteEntry[] = JSON.parse(raw);
    return new Map(arr.map(f => [f.id, f]));
  } catch {
    return new Map();
  }
}

function saveFavorites(favs: Map<string, FavoriteEntry>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...favs.values()]));
  } catch { /* storage full or blocked */ }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<Map<string, FavoriteEntry>>(new Map());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setFavorites(loadFavorites());
    setLoaded(true);
  }, []);

  const isFavorite = useCallback((id: string) => favorites.has(id), [favorites]);

  const toggleFavorite = useCallback((entry: FavoriteEntry) => {
    setFavorites(prev => {
      const next = new Map(prev);
      if (next.has(entry.id)) {
        next.delete(entry.id);
      } else {
        next.set(entry.id, { ...entry, savedAt: new Date().toISOString() });
      }
      saveFavorites(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setFavorites(new Map());
    saveFavorites(new Map());
  }, []);

  const updateNote = useCallback((id: string, note: string) => {
    setFavorites(prev => {
      const next = new Map(prev);
      const entry = next.get(id);
      if (entry) {
        next.set(id, { ...entry, note: note || undefined });
        saveFavorites(next);
      }
      return next;
    });
  }, []);

  return {
    favorites: [...favorites.values()],
    count: favorites.size,
    isFavorite,
    toggleFavorite,
    updateNote,
    clearAll,
    loaded,
  };
}
