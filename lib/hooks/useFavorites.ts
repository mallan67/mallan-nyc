'use client';

import { useCallback, useSyncExternalStore } from 'react';

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

// ─────────────────────────────────────────────────────────────────────
// External store wired through useSyncExternalStore so React 18+ +
// React Compiler can subscribe without the "setState-in-effect"
// anti-pattern. The snapshot is cached and only re-issued when the
// underlying localStorage value actually changes (cross-tab `storage`
// event or our own setSnapshot writes).
// ─────────────────────────────────────────────────────────────────────

const SERVER_SNAPSHOT: FavoriteEntry[] = [];

let cachedRaw: string | null = null;
let cachedSnapshot: FavoriteEntry[] = [];

function readSnapshot(): FavoriteEntry[] {
  if (typeof window === 'undefined') return SERVER_SNAPSHOT;
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    raw = null;
  }
  // Reuse the cached array reference when the underlying string has not
  // changed — useSyncExternalStore requires referentially stable snapshots
  // to avoid infinite render loops.
  if (raw === cachedRaw) return cachedSnapshot;
  cachedRaw = raw;
  try {
    cachedSnapshot = raw ? (JSON.parse(raw) as FavoriteEntry[]) : [];
  } catch {
    cachedSnapshot = [];
  }
  return cachedSnapshot;
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // React to other tabs writing to the same key.
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) listener();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage);
    }
  };
}

function emit() {
  for (const l of listeners) l();
}

function writeFavorites(arr: FavoriteEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    const json = JSON.stringify(arr);
    localStorage.setItem(STORAGE_KEY, json);
    cachedRaw = json;
    cachedSnapshot = arr;
  } catch { /* storage full or blocked */ }
  emit();
}

function readFavoritesMap(): Map<string, FavoriteEntry> {
  return new Map(readSnapshot().map((f) => [f.id, f]));
}

// ─────────────────────────────────────────────────────────────────────

export function useFavorites() {
  const arr = useSyncExternalStore(subscribe, readSnapshot, () => SERVER_SNAPSHOT);

  const isFavorite = useCallback((id: string) => arr.some((f) => f.id === id), [arr]);

  const toggleFavorite = useCallback((entry: FavoriteEntry) => {
    const map = readFavoritesMap();
    if (map.has(entry.id)) {
      map.delete(entry.id);
    } else {
      map.set(entry.id, { ...entry, savedAt: new Date().toISOString() });
    }
    writeFavorites([...map.values()]);
  }, []);

  const clearAll = useCallback(() => {
    writeFavorites([]);
  }, []);

  const updateNote = useCallback((id: string, note: string) => {
    const map = readFavoritesMap();
    const entry = map.get(id);
    if (entry) {
      map.set(id, { ...entry, note: note || undefined });
      writeFavorites([...map.values()]);
    }
  }, []);

  return {
    favorites: arr,
    count: arr.length,
    isFavorite,
    toggleFavorite,
    updateNote,
    clearAll,
    // Always "loaded" with useSyncExternalStore — no post-mount hydration
    // race. Kept for backwards-compat with consumers that gate on it.
    loaded: typeof window !== 'undefined',
  };
}
