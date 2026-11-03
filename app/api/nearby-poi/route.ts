import { NextRequest, NextResponse } from 'next/server';
import { cachedPublicRead } from '@/lib/cache/public-cache';

/**
 * GET /api/nearby-poi?lat=40.77&lng=-73.96&radius=800
 *
 * Fetches nearby points of interest from OpenStreetMap via Overpass API.
 * Uses nwr (node/way/relation) queries with `out center` for complete coverage.
 * Groups results into categories: Shopping, Groceries, Restaurants, Cafes, etc.
 *
 * Cached for 7 days — POI data changes infrequently.
 */

interface POIResult {
  id: number;
  name: string;
  lat: number;
  lng: number;
  category: string;
}

interface CategoryCount {
  category: string;
  group: string;
  icon: string;
  count: number;
  items: POIResult[];
}

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// The 7-day cache is the repo's shared data cache (lib/cache/public-cache.ts), NOT a module-level Map: serverless
// instances do not share memory, so the old per-instance Map sent nearly every listing view back to the public
// Overpass server (production 2026-08-13 → 2026-11-02: 3,847 connect timeouts, plus 30s function timeouts). It has its
// OWN tag, not the listing-sync tag: a POI answer must not be dropped every time a listing changes.
const POI_CACHE_TAG = 'nearby-poi';
const POI_REVALIDATE_SECONDS = 7 * 24 * 60 * 60;

// Overpass gets its own bound, well under the function limit, so a slow or unreachable server costs one request a few
// seconds instead of 10s of connect timeout and then the 30s limit.
const OVERPASS_TIMEOUT_MS = 12_000;

// Mallan lists New York. Anything outside this box is not a listing's location, and asking Overpass about it (and
// making a new cache entry for it) is free load for whoever asks. The box is generous: the five boroughs plus the
// nearby parts of Long Island, Westchester and New Jersey.
const NY_BOUNDS = { minLat: 40.3, maxLat: 41.4, minLng: -74.6, maxLng: -73.3 } as const;

/**
 * The Overpass query + categorisation for one rounded point. It THROWS on any failure (network, timeout, HTTP error):
 * the shared cache never stores a throw, so a failure is never served to the next visitor as "no places nearby".
 */
async function fetchPoiCategories(lat: number, lng: number, radius: number): Promise<CategoryCount[]> {
  try {
    // Use nwr (node/way/relation) to catch POIs mapped as buildings/areas.
    // `out center` gives us a center point for way/relation elements.
    const query = `
[out:json][timeout:25];
(
  nwr["shop"~"supermarket|grocery|convenience|deli|greengrocer|butcher|bakery"](around:${radius},${lat},${lng});
  nwr["shop"~"clothes|department_store|mall|shoes|boutique|jewelry|gift|electronics|furniture|hardware"](around:${radius},${lat},${lng});
  nwr["amenity"="restaurant"](around:${radius},${lat},${lng});
  nwr["amenity"="cafe"](around:${radius},${lat},${lng});
  nwr["amenity"~"childcare|kindergarten"](around:${radius},${lat},${lng});
  nwr["amenity"="school"](around:${radius},${lat},${lng});
  nwr["amenity"~"pharmacy|hospital|clinic|doctors"](around:${radius},${lat},${lng});
  nwr["railway"~"station|subway_entrance"](around:${radius},${lat},${lng});
  nwr["public_transport"="station"](around:${radius},${lat},${lng});
  nwr["amenity"~"bank|atm"](around:${radius},${lat},${lng});
  nwr["leisure"~"park|playground|fitness_centre|sports_centre"](around:${radius},${lat},${lng});
);
out center 500;
`;

    const response = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(OVERPASS_TIMEOUT_MS),
    });

    if (!response.ok) throw new Error(`Overpass HTTP ${response.status}`);

    const data = await response.json();
    const elements = data.elements || [];

    // Categorize each element
    const categorized: Record<string, POIResult[]> = {
      'Restaurants': [],
      'Cafes': [],
      'Groceries': [],
      'Shopping': [],
      'Schools': [],
      'Daycares': [],
      'Health & Medical': [],
      'Transit': [],
      'Banks': [],
      'Parks & Fitness': [],
    };

    // Deduplicate by name+category (same POI can appear as node + way)
    const seen = new Set<string>();

    for (const el of elements) {
      if (!el.tags) continue;

      // Extract coordinates: nodes have lat/lon directly, ways/relations have center
      const elLat = el.lat ?? el.center?.lat;
      const elLon = el.lon ?? el.center?.lon;
      if (!elLat || !elLon) continue;

      const name = el.tags.name || el.tags['name:en'] || '';
      if (!name) continue;

      const amenity = el.tags.amenity || '';
      const shop = el.tags.shop || '';
      const railway = el.tags.railway || '';
      const publicTransport = el.tags.public_transport || '';
      const leisure = el.tags.leisure || '';

      let category = '';
      if (amenity === 'restaurant') {
        category = 'Restaurants';
      } else if (amenity === 'cafe') {
        category = 'Cafes';
      } else if (['supermarket', 'grocery', 'convenience', 'deli', 'greengrocer', 'butcher', 'bakery'].includes(shop)) {
        category = 'Groceries';
      } else if (['clothes', 'department_store', 'mall', 'shoes', 'boutique', 'jewelry', 'gift', 'electronics', 'furniture', 'hardware'].includes(shop)) {
        category = 'Shopping';
      } else if (amenity === 'school') {
        category = 'Schools';
      } else if (['childcare', 'kindergarten'].includes(amenity)) {
        category = 'Daycares';
      } else if (['pharmacy', 'hospital', 'clinic', 'doctors'].includes(amenity)) {
        category = 'Health & Medical';
      } else if (railway || publicTransport) {
        category = 'Transit';
      } else if (['bank', 'atm'].includes(amenity)) {
        category = 'Banks';
      } else if (leisure) {
        category = 'Parks & Fitness';
      }

      if (!category) continue;

      // Deduplicate: same name in same category within ~50m
      const dedupeKey = `${category}:${name.toLowerCase()}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      categorized[category].push({
        id: el.id,
        name,
        lat: elLat,
        lng: elLon,
        category,
      });
    }

    // Build output
    const groupMap: Record<string, { group: string; icon: string }> = {
      'Shopping':        { group: 'Amenities', icon: 'shopping' },
      'Groceries':       { group: 'Amenities', icon: 'groceries' },
      'Restaurants':     { group: 'Amenities', icon: 'restaurants' },
      'Cafes':           { group: 'Amenities', icon: 'cafes' },
      'Daycares':        { group: 'Education', icon: 'daycares' },
      'Schools':         { group: 'Education', icon: 'schools' },
      'Health & Medical': { group: 'Services', icon: 'health' },
      'Banks':           { group: 'Services', icon: 'banks' },
      'Parks & Fitness':  { group: 'Lifestyle', icon: 'parks' },
      'Transit':         { group: 'Transport', icon: 'transit' },
    };

    const categories: CategoryCount[] = Object.entries(categorized)
      .filter(([, items]) => items.length > 0)
      .map(([cat, items]) => ({
        category: cat,
        group: groupMap[cat]?.group || 'Other',
        icon: groupMap[cat]?.icon || 'default',
        count: items.length,
        items: items.slice(0, 25),
      }));

    return categories;
  } catch (err) {
    console.warn('[POI] Overpass lookup failed (not cached):', err instanceof Error ? err.message : err);
    throw err;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get('lat') || '');
  const lng = parseFloat(searchParams.get('lng') || '');
  const radiusParam = parseInt(searchParams.get('radius') || '800', 10);
  const radius = Number.isFinite(radiusParam) && radiusParam > 0 ? Math.min(radiusParam, 1500) : 800;

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 });
  }
  if (lat < NY_BOUNDS.minLat || lat > NY_BOUNDS.maxLat || lng < NY_BOUNDS.minLng || lng > NY_BOUNDS.maxLng) {
    return NextResponse.json({ error: 'lat and lng must be in the New York area' }, { status: 400 });
  }

  // Round to 3 decimal places (~111m): one cache entry is one point, and the question asked of Overpass is about that
  // SAME rounded point, so the shared cache key and the query can never disagree.
  const roundedLat = Number(lat.toFixed(3));
  const roundedLng = Number(lng.toFixed(3));

  try {
    const categories = await cachedPublicRead(
      fetchPoiCategories,
      ['nearby-poi'],
      { tags: [POI_CACHE_TAG], revalidate: POI_REVALIDATE_SECONDS },
    )(roundedLat, roundedLng, radius);

    return NextResponse.json({ categories }, {
      headers: { 'Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=86400' },
    });
  } catch {
    // The page expects 200 with a list; an unavailable Overpass is "no places to show right now", and must not be cached
    // anywhere (it was logged once, in fetchPoiCategories).
    return NextResponse.json({ categories: [] }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }
}
