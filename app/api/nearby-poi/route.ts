import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/nearby-poi?lat=40.77&lng=-73.96&radius=800
 *
 * Fetches nearby points of interest from OpenStreetMap via Overpass API.
 * Groups results into categories: Shopping, Groceries, Restaurants, Cafes,
 * Daycares, Primary Schools, High Schools, Transit.
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
    // Single Overpass query fetching all POI types within radius
    const query = `
[out:json][timeout:15];
(
  node["shop"~"supermarket|grocery|convenience|deli|greengrocer|butcher|bakery"](around:${radius},${lat},${lng});
  node["shop"~"clothes|department_store|mall|shoes|boutique|jewelry|gift|electronics|furniture|hardware"](around:${radius},${lat},${lng});
  node["amenity"="restaurant"](around:${radius},${lat},${lng});
  node["amenity"="cafe"](around:${radius},${lat},${lng});
  node["amenity"~"childcare|kindergarten"](around:${radius},${lat},${lng});
  node["amenity"="school"](around:${radius},${lat},${lng});
  node["amenity"~"pharmacy|hospital|clinic|doctors"](around:${radius},${lat},${lng});
  node["railway"~"station|subway_entrance"](around:${radius},${lat},${lng});
  node["public_transport"="station"](around:${radius},${lat},${lng});
  node["amenity"~"bank|atm"](around:${radius},${lat},${lng});
  node["leisure"~"park|playground|fitness_centre|sports_centre"](around:${radius},${lat},${lng});
);
out body 500;
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

    for (const el of elements) {
      if (!el.tags || !el.lat || !el.lon) continue;
      const name = el.tags.name || el.tags['name:en'] || '';
      if (!name) continue;

      const poi: POIResult = { id: el.id, name, lat: el.lat, lng: el.lon, category: '' };

      const amenity = el.tags.amenity || '';
      const shop = el.tags.shop || '';
      const railway = el.tags.railway || '';
      const publicTransport = el.tags.public_transport || '';
      const leisure = el.tags.leisure || '';

      if (amenity === 'restaurant') {
        poi.category = 'Restaurants';
        categorized['Restaurants'].push(poi);
      } else if (amenity === 'cafe') {
        poi.category = 'Cafes';
        categorized['Cafes'].push(poi);
      } else if (['supermarket', 'grocery', 'convenience', 'deli', 'greengrocer', 'butcher', 'bakery'].includes(shop)) {
        poi.category = 'Groceries';
        categorized['Groceries'].push(poi);
      } else if (['clothes', 'department_store', 'mall', 'shoes', 'boutique', 'jewelry', 'gift', 'electronics', 'furniture', 'hardware'].includes(shop)) {
        poi.category = 'Shopping';
        categorized['Shopping'].push(poi);
      } else if (amenity === 'school') {
        poi.category = 'Schools';
        categorized['Schools'].push(poi);
      } else if (['childcare', 'kindergarten'].includes(amenity)) {
        poi.category = 'Daycares';
        categorized['Daycares'].push(poi);
      } else if (['pharmacy', 'hospital', 'clinic', 'doctors'].includes(amenity)) {
        poi.category = 'Health & Medical';
        categorized['Health & Medical'].push(poi);
      } else if (railway || publicTransport) {
        poi.category = 'Transit';
        categorized['Transit'].push(poi);
      } else if (['bank', 'atm'].includes(amenity)) {
        poi.category = 'Banks';
        categorized['Banks'].push(poi);
      } else if (leisure) {
        poi.category = 'Parks & Fitness';
        categorized['Parks & Fitness'].push(poi);
      }
    }

    // Build output with counts, sorted by count descending within each group
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
        items: items.slice(0, 20), // Cap at 20 per category
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
