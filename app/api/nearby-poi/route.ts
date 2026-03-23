import { NextRequest, NextResponse } from 'next/server';

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

// POI cache — in-memory for serverless (per-instance), 7 day TTL
const cache = new Map<string, { data: CategoryCount[]; ts: number }>();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get('lat') || '');
  const lng = parseFloat(searchParams.get('lng') || '');
  const radius = Math.min(parseInt(searchParams.get('radius') || '800', 10), 1500);

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 });
  }

  // Round coords to 3 decimal places for cache key (~111m precision)
  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)},${radius}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json({ categories: cached.data }, {
      headers: { 'Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=86400' },
    });
  }

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
    });

    if (!response.ok) {
      console.warn(`[POI] Overpass error: ${response.status}`);
      return NextResponse.json({ categories: [] }, { status: 200 });
    }

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

    // Cache result
    cache.set(cacheKey, { data: categories, ts: Date.now() });

    return NextResponse.json({ categories }, {
      headers: { 'Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=86400' },
    });
  } catch (err) {
    console.error('[POI] Overpass fetch error:', err);
    return NextResponse.json({ categories: [] }, { status: 200 });
  }
}
