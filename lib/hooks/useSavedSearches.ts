'use client';

import { useCallback, useSyncExternalStore } from 'react';

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

// External-store wiring (same pattern as useFavorites). Cached snapshot
// keeps useSyncExternalStore referentially stable.
const SERVER_SNAPSHOT: SavedSearchEntry[] = [];

let cachedRaw: string | null = null;
let cachedSnapshot: SavedSearchEntry[] = [];

function readSnapshot(): SavedSearchEntry[] {
  if (typeof window === 'undefined') return SERVER_SNAPSHOT;
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (raw === cachedRaw) return cachedSnapshot;
  cachedRaw = raw;
  try {
    cachedSnapshot = raw ? (JSON.parse(raw) as SavedSearchEntry[]) : [];
  } catch {
    cachedSnapshot = [];
  }
  return cachedSnapshot;
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
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

function writeSearches(arr: SavedSearchEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    const json = JSON.stringify(arr);
    localStorage.setItem(STORAGE_KEY, json);
    cachedRaw = json;
    cachedSnapshot = arr;
  } catch { /* storage full */ }
  emit();
}

export function useSavedSearches() {
  const searches = useSyncExternalStore(subscribe, readSnapshot, () => SERVER_SNAPSHOT);
  // SSR + first client render: false (matches SSR markup). Post-hydration:
  // true. Same hydration-safe contract consumers gating on `!loaded`
  // already expect. Using `typeof window !== 'undefined'` would diverge
  // SSR from first client render and break the contract.
  const loaded = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const saveSearch = useCallback((entry: Omit<SavedSearchEntry, 'id' | 'savedAt'>) => {
    const next = [
      {
        ...entry,
        id: `ss-${Date.now()}`,
        savedAt: new Date().toISOString(),
      },
      ...readSnapshot(),
    ].slice(0, 20); // max 20 saved searches
    writeSearches(next);
  }, []);

  const deleteSearch = useCallback((id: string) => {
    writeSearches(readSnapshot().filter((s) => s.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    writeSearches([]);
  }, []);

  return {
    searches,
    saveSearch,
    deleteSearch,
    clearAll,
    loaded,
  };
}
