/**
 * Neighborhood → ZIP code resolver for listings API.
 *
 * REBNY/Trestle CityRegion field is unreliable for neighborhood-level filtering.
 * This resolves neighborhood names to ZIP codes using our authoritative mapping,
 * plus the zipCodes arrays in our neighborhood JSON data files.
 */

import { getZipsForArea } from './nyc-zip-neighborhoods';
import manhattanData from '@/data/manhattan-neighborhoods.json';
import brooklynData from '@/data/brooklyn-neighborhoods.json';
import queensData from '@/data/queens-neighborhoods.json';
import bronxData from '@/data/bronx-neighborhoods.json';
import statenIslandData from '@/data/staten-island-neighborhoods.json';

type NeighborhoodEntry = { slug: string; name: string; zipCodes?: string[] };

// Build a lookup map: lowercase name/slug → zip codes (from JSON data files)
const jsonZipMap = new Map<string, string[]>();

for (const dataset of [manhattanData, brooklynData, queensData, bronxData, statenIslandData]) {
  for (const n of (dataset as { neighborhoods: NeighborhoodEntry[] }).neighborhoods) {
    if (n.zipCodes?.length) {
      jsonZipMap.set(n.name.toLowerCase(), n.zipCodes);
      jsonZipMap.set(n.slug.toLowerCase(), n.zipCodes);
    }
  }
}

/**
 * Look up ZIP codes for a neighborhood name or slug.
 * Combines both sources (JSON data files + nyc-zip-neighborhoods.ts).
 * Returns deduplicated array, or empty if not found.
 */
export function lookupNeighborhoodZips(neighborhood: string): string[] {
  const key = neighborhood.toLowerCase().trim();

  // Source 1: JSON data files (curated zipCodes per neighborhood)
  const fromJson = jsonZipMap.get(key) || [];

  // Source 2: nyc-zip-neighborhoods.ts (authoritative ZIP→neighborhood map)
  const fromZipMap = getZipsForArea(neighborhood);

  // Deduplicate
  const combined = [...new Set([...fromJson, ...fromZipMap])];
  return combined;
}
