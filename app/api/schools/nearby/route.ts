import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/schools/nearby?lat=40.77&lng=-73.96&radius=1000
 *
 * Fetches nearby NYC public schools from NYC OpenData (DOE School Directory).
 * Dataset: 2017-2018 DOE School Directory (r2nx-nhxe) — stable, comprehensive.
 * Groups results by level: Elementary, Middle, High School.
 *
 * FAIR HOUSING COMPLIANCE: Returns factual data only — school name, grades,
 * address, district, distance. No ratings, rankings, or quality descriptors.
 *
 * Cached for 30 days — school locations change infrequently.
 */

interface School {
  name: string;
  grades: string;
  level: 'Elementary' | 'Middle' | 'High School' | 'K-8' | 'K-12';
  address: string;
  zip: string;
  district: string;
  distance: number; // miles
  lat: number;
  lng: number;
}

interface SchoolGroup {
  level: string;
  schools: School[];
}

// In-memory cache per serverless instance
const cache = new Map<string, { data: SchoolGroup[]; ts: number }>();
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

const NYC_OPENDATA_URL = 'https://data.cityofnewyork.us/resource/r2nx-nhxe.json';

/** Haversine distance in miles */
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Map DOE category to display level */
function mapLevel(category: string): School['level'] | null {
  const cat = category.toLowerCase();
  if (cat === 'elementary' || cat === 'early childhood') return 'Elementary';
  if (cat.includes('middle') || cat.includes('intermediate') || cat.includes('junior')) return 'Middle';
  if (cat === 'high school') return 'High School';
  if (cat === 'k-8') return 'K-8';
  if (cat.includes('k-12') || cat.includes('secondary')) return 'K-12';
  return null;
}

/** Format grade codes like "PK,0K,01,02" → "PK-2" or "09,10,11,12" → "9-12" */
function formatGrades(raw: string): string {
  if (!raw) return '';
  const codes = raw.split(',').map(g => g.trim()).filter(Boolean);
  if (codes.length === 0) return '';

  const labels: string[] = codes.map(c => {
    if (c === 'PK') return 'PK';
    if (c === '0K') return 'K';
    if (c === 'SE') return null as unknown as string; // skip special ed marker
    const n = parseInt(c, 10);
    return isNaN(n) ? c : String(n);
  }).filter(Boolean);

  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  return `${labels[0]}-${labels[labels.length - 1]}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get('lat') || '');
  const lng = parseFloat(searchParams.get('lng') || '');
  const radiusMeters = Math.min(parseInt(searchParams.get('radius') || '1600', 10), 3000);

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 });
  }

  // Cache key: round to 3 decimal places (~111m)
  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)},${radiusMeters}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json({ groups: cached.data }, {
      headers: { 'Cache-Control': 'public, s-maxage=2592000, stale-while-revalidate=604800' },
    });
  }

  try {
    // Socrata's within_circle function for geographic filtering
    const query = new URLSearchParams({
      '$where': `status_descriptions='Open' AND within_circle(location_1, ${lat}, ${lng}, ${radiusMeters})`,
      '$select': 'location_name,grades_final_text,location_category_description,primary_address_line_1,location_1_zip,location_1,administrative_district_name',
      '$limit': '100',
    });

    const response = await fetch(`${NYC_OPENDATA_URL}?${query.toString()}`, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 2592000 }, // 30 days
    });

    if (!response.ok) {
      console.warn(`[Schools] NYC OpenData error: ${response.status}`);
      return NextResponse.json({ groups: [] }, { status: 200 });
    }

    const data = await response.json();

    // Parse and categorize
    const schools: School[] = [];
    for (const row of data) {
      const level = mapLevel(row.location_category_description || '');
      if (!level) continue;

      // Extract coordinates from location_1
      let schoolLat: number | undefined;
      let schoolLng: number | undefined;
      if (row.location_1) {
        if (row.location_1.coordinates) {
          // GeoJSON format: [lng, lat]
          schoolLng = row.location_1.coordinates[0];
          schoolLat = row.location_1.coordinates[1];
        } else if (row.location_1.latitude) {
          schoolLat = parseFloat(row.location_1.latitude);
          schoolLng = parseFloat(row.location_1.longitude);
        }
      }

      const dist = (schoolLat && schoolLng)
        ? haversine(lat, lng, schoolLat, schoolLng)
        : 99;

      schools.push({
        name: row.location_name || '',
        grades: formatGrades(row.grades_final_text || ''),
        level,
        address: row.primary_address_line_1 || '',
        zip: row.location_1_zip || '',
        district: (row.administrative_district_name || '').replace('COMMUNITY SCHOOL DISTRICT ', 'District '),
        distance: Math.round(dist * 100) / 100,
        lat: schoolLat || 0,
        lng: schoolLng || 0,
      });
    }

    // Sort by distance
    schools.sort((a, b) => a.distance - b.distance);

    // Group by level, limit to closest 5 per level
    const levelOrder = ['Elementary', 'K-8', 'Middle', 'High School', 'K-12'];
    const grouped = new Map<string, School[]>();

    for (const school of schools) {
      // Merge K-8 into Elementary for display, K-12 into High School
      let displayLevel = school.level as string;
      if (displayLevel === 'K-8') displayLevel = 'Elementary';
      if (displayLevel === 'K-12') displayLevel = 'High School';

      const arr = grouped.get(displayLevel) || [];
      if (arr.length < 5) {
        arr.push(school);
        grouped.set(displayLevel, arr);
      }
    }

    const groups: SchoolGroup[] = levelOrder
      .map(level => {
        // Map display level
        let displayLevel = level;
        if (displayLevel === 'K-8') displayLevel = 'Elementary';
        if (displayLevel === 'K-12') displayLevel = 'High School';
        return displayLevel;
      })
      .filter((v, i, a) => a.indexOf(v) === i) // dedupe
      .map(level => ({
        level,
        schools: grouped.get(level) || [],
      }))
      .filter(g => g.schools.length > 0);

    // Cache
    cache.set(cacheKey, { data: groups, ts: Date.now() });

    return NextResponse.json({ groups }, {
      headers: { 'Cache-Control': 'public, s-maxage=2592000, stale-while-revalidate=604800' },
    });
  } catch (err) {
    console.error('[Schools] Fetch error:', err);
    return NextResponse.json({ groups: [] }, { status: 200 });
  }
}
