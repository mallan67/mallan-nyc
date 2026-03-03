#!/usr/bin/env node
/**
 * build-rls-geojson.js — Build GeoJSON from canonical RLS neighborhood list
 *
 * Polygon acquisition priority:
 *   1. patch-polygons.js hand-drawn polygons  (FIRST — highest quality)
 *   2. NTA 2020 mapping via fetch-nta-geojson.js mapping table  (FALLBACK)
 *   3. Missing — logged in coverage report
 *
 * Reads:  data/rls/neighborhoods.v1.json  (canonical list)
 * Writes: data/rls/geo/rls-neighborhoods.v1.geojson  (full GeoJSON FeatureCollection)
 *
 * Also prints a COVERAGE REPORT at the end:
 *   - Patched polygons (from patch-polygons.js)
 *   - Derived polygons (from NTA 2020 mapping)
 *   - Missing polygons (no source)
 *
 * Usage: node scripts/build-rls-geojson.js
 *   or:  npm run geo:build
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CANONICAL = path.join(ROOT, 'data', 'rls', 'neighborhoods.v1.json');
const OUTPUT = path.join(ROOT, 'data', 'rls', 'geo', 'rls-neighborhoods.v1.geojson');
const PATCH_SCRIPT = path.join(ROOT, 'public', 'crm', 'scripts', 'patch-polygons.js');

// ═══════════════════════════════════════════════════════════════
// Source 1: PATCH POLYGONS (highest priority)
// Extracted directly from patch-polygons.js newPolygons + newCenters
// ═══════════════════════════════════════════════════════════════

function loadPatchPolygons() {
  const src = fs.readFileSync(PATCH_SCRIPT, 'utf8');

  // Extract newPolygons object using bracket-depth parsing
  const polygons = {};
  const polyMatch = src.match(/const newPolygons\s*=\s*\{([\s\S]*?)\n\};\s*\n/);
  if (polyMatch) {
    const block = polyMatch[1];
    // Find each entry: 'Name': [ ... ] — use bracket depth to find outer array bounds
    const nameRe = /'([^']+)':\s*\[/g;
    let m;
    while ((m = nameRe.exec(block)) !== null) {
      const name = m[1];
      // Skip comment-only lines that happen to match
      const lineStart = block.lastIndexOf('\n', m.index);
      const linePrefix = block.substring(lineStart, m.index).trim();
      if (linePrefix.startsWith('//')) continue;

      // Find the matching closing bracket using depth counting
      let start = m.index + m[0].length - 1; // position of opening [
      let depth = 1;
      let pos = start + 1;
      while (pos < block.length && depth > 0) {
        if (block[pos] === '[') depth++;
        else if (block[pos] === ']') depth--;
        pos++;
      }
      if (depth !== 0) continue;

      let arrayStr = block.substring(start, pos);
      // Strip JS single-line comments that appear inside coordinate arrays
      arrayStr = arrayStr.replace(/\/\/[^\n]*/g, '');
      // Remove trailing commas before closing brackets (invalid JSON)
      arrayStr = arrayStr.replace(/,\s*\]/g, ']');
      try {
        const coords = JSON.parse(arrayStr);
        // patch-polygons uses [lat, lng] — convert to [lng, lat] for GeoJSON
        const ring = coords.map(c => [c[1], c[0]]);
        // Close ring if needed
        if (ring.length >= 3 &&
            (ring[0][0] !== ring[ring.length - 1][0] ||
             ring[0][1] !== ring[ring.length - 1][1])) {
          ring.push([ring[0][0], ring[0][1]]);
        }
        polygons[name] = ring;
      } catch (_) {
        console.warn('  WARN: Could not parse patch polygon for: ' + name);
      }
    }
  }

  // Extract newCenters object
  const centers = {};
  const centerMatch = src.match(/const newCenters\s*=\s*\{([\s\S]*?)\n\};\s*\n/);
  if (centerMatch) {
    const re = /'([^']+)':\s*\[([\d.-]+),\s*([\d.-]+)\]/g;
    let m;
    while ((m = re.exec(centerMatch[1])) !== null) {
      // newCenters are [lat, lng] — convert to [lng, lat]
      centers[m[1]] = [parseFloat(m[3]), parseFloat(m[2])];
    }
  }

  // Also extract the NoHo standalone polygon
  const nohoMatch = src.match(/const nohoPolygon\s*=\s*\[([\s\S]*?)\];/);
  if (nohoMatch) {
    try {
      const coords = JSON.parse('[' + nohoMatch[1] + ']');
      const ring = coords.map(c => [c[1], c[0]]);
      if (ring.length >= 3 &&
          (ring[0][0] !== ring[ring.length - 1][0] ||
           ring[0][1] !== ring[ring.length - 1][1])) {
        ring.push([ring[0][0], ring[0][1]]);
      }
      polygons['NoHo'] = ring;
    } catch (_) { /* skip */ }
  }

  return { polygons, centers };
}

// ═══════════════════════════════════════════════════════════════
// Source 2: NTA 2020 MAPPING (fallback — from fetch-nta-geojson.js)
// ═══════════════════════════════════════════════════════════════

// Our neighborhood name → NTA 2020 official name
// Extracted from fetch-nta-geojson.js OUR_TO_NTA table
const NTA_MAPPING = {
  // Manhattan
  'Battery Park City': 'Financial District-Battery Park City',
  'Carnegie Hill': 'Upper East Side-Carnegie Hill',
  'Chelsea': 'Chelsea-Hudson Yards',
  'Chinatown': 'Chinatown-Two Bridges',
  'East Harlem': 'East Harlem (North)',
  'East Village': 'East Village',
  'Financial District': 'Financial District-Battery Park City',
  'Flatiron': 'Midtown South-Flatiron-Union Square',
  'Gramercy': 'Gramercy',
  'Greenwich Village': 'Greenwich Village',
  "Hell's Kitchen": "Hell's Kitchen",
  'Hudson Square': 'SoHo-Little Italy-Hudson Square',
  'Hudson Yards': 'Chelsea-Hudson Yards',
  'Inwood': 'Inwood',
  'Kips Bay': 'Murray Hill-Kips Bay',
  'Little Italy': 'SoHo-Little Italy-Hudson Square',
  'Lower East Side': 'Lower East Side',
  'Morningside Heights': 'Morningside Heights',
  'Murray Hill': 'Murray Hill-Kips Bay',
  'Roosevelt Island': 'Upper East Side-Lenox Hill-Roosevelt Island',
  'SoHo': 'SoHo-Little Italy-Hudson Square',
  'Tribeca': 'Tribeca-Civic Center',
  'Two Bridges': 'Chinatown-Two Bridges',
  'Upper East Side': 'Upper East Side-Carnegie Hill',
  'Upper West Side': 'Upper West Side (Central)',
  'Washington Heights': 'Washington Heights (South)',
  'West Village': 'West Village',
  'Yorkville': 'Upper East Side-Yorkville',
  'Harlem': 'Harlem (South)',
  'Midtown East': 'East Midtown-Turtle Bay',
  'Midtown West': 'Midtown-Times Square',
  // Brooklyn
  'Brooklyn Heights': 'Brooklyn Heights',
  'Williamsburg': 'Williamsburg',
  'DUMBO': 'Downtown Brooklyn-DUMBO-Boerum Hill',
  'Park Slope': 'Park Slope',
  'Cobble Hill': 'Carroll Gardens-Cobble Hill-Gowanus-Red Hook',
  'Carroll Gardens': 'Carroll Gardens-Cobble Hill-Gowanus-Red Hook',
  'Fort Greene': 'Fort Greene',
  'Prospect Heights': 'Prospect Heights',
  'Greenpoint': 'Greenpoint',
  'Bed-Stuy': 'Bedford-Stuyvesant (East)',
  // Queens
  'Astoria': 'Astoria (Central)',
  'Long Island City': 'Long Island City-Hunters Point',
  'Jackson Heights': 'Jackson Heights',
  'Flushing': 'Flushing-Willets Point',
  'Forest Hills': 'Forest Hills',
  'Sunnyside': 'Sunnyside',
  'Bayside': 'Bayside',
  // Bronx
  'Riverdale': 'Riverdale-Spuyten Duyvil',
  'City Island': 'Pelham Bay-Country Club-City Island',
  'Mott Haven': 'Mott Haven-Port Morris',
  'Pelham Bay': 'Pelham Bay-Country Club-City Island',
  'Fordham': 'Fordham Heights',
  // Staten Island
  'St. George': 'St. George-New Brighton',
  'Todt Hill': 'Todt Hill-Emerson Hill-Lighthouse Hill-Manor Heights',
  'Great Kills': 'Great Kills-Eltingville',
  'New Brighton': 'St. George-New Brighton',
};

// ═══════════════════════════════════════════════════════════════
// GEOMETRY UTILITIES (from fetch-nta-geojson.js)
// ═══════════════════════════════════════════════════════════════

function computeCentroid(ring) {
  let sumLng = 0, sumLat = 0;
  for (let i = 0; i < ring.length; i++) {
    sumLng += ring[i][0];
    sumLat += ring[i][1];
  }
  return [sumLng / ring.length, sumLat / ring.length];
}

function shoelaceArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(area / 2);
}

function getLargestRing(geometry) {
  if (geometry.type === 'MultiPolygon') {
    let best = null, bestArea = 0;
    for (const poly of geometry.coordinates) {
      const ring = poly[0];
      const area = shoelaceArea(ring);
      if (area > bestArea) { bestArea = area; best = ring; }
    }
    return best;
  }
  if (geometry.type === 'Polygon') {
    return geometry.coordinates[0];
  }
  return null;
}

function simplifyRing(coords, tolerance) {
  if (coords.length <= 3) return coords;
  function perpDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag === 0) return Math.sqrt(Math.pow(p[0] - a[0], 2) + Math.pow(p[1] - a[1], 2));
    const u = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (mag * mag);
    return Math.sqrt(Math.pow(p[0] - (a[0] + u * dx), 2) + Math.pow(p[1] - (a[1] + u * dy), 2));
  }
  function dp(pts, s, e, tol) {
    let mx = 0, mi = 0;
    for (let i = s + 1; i < e; i++) {
      const d = perpDist(pts[i], pts[s], pts[e]);
      if (d > mx) { mx = d; mi = i; }
    }
    if (mx > tol) {
      const l = dp(pts, s, mi, tol);
      const r = dp(pts, mi, e, tol);
      return l.slice(0, -1).concat(r);
    }
    return [pts[s], pts[e]];
  }
  return dp(coords, 0, coords.length - 1, tolerance);
}

// ═══════════════════════════════════════════════════════════════
// NTA ONLINE FETCH (best-effort — offline if unavailable)
// ═══════════════════════════════════════════════════════════════

function fetchJSON(url) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { Accept: 'application/json' }, timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode !== 200) reject(new Error('HTTP ' + res.statusCode));
        else resolve(JSON.parse(data));
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log('=== RLS GeoJSON Builder ===\n');

  // 1. Load canonical list
  if (!fs.existsSync(CANONICAL)) {
    console.error('ERROR: Canonical list not found: ' + CANONICAL);
    console.error('Run: npm run geo:fetch-names (or create data/rls/neighborhoods.v1.json manually)');
    process.exit(1);
  }
  const canonical = JSON.parse(fs.readFileSync(CANONICAL, 'utf8'));
  const names = canonical.neighborhoods;
  console.log('Canonical neighborhoods: ' + names.length);
  console.log('Trestle verified: ' + canonical._meta.trestleVerified);
  console.log('RLS field: ' + (canonical._meta.rlsNeighborField || 'SubdivisionName'));
  console.log('');

  // 2. Load patch polygons (PRIORITY 1)
  console.log('Loading patch-polygons.js (priority source)...');
  const patch = loadPatchPolygons();
  const patchNames = Object.keys(patch.polygons);
  console.log('  Loaded ' + patchNames.length + ' patched polygons, ' + Object.keys(patch.centers).length + ' centers\n');

  // 3. Load NTA data (PRIORITY 2 — fallback)
  let ntaLookup = {};
  try {
    console.log('Fetching NTA 2020 boundaries from NYC Open Data...');
    const ntaUrl = 'https://data.cityofnewyork.us/resource/9nt8-h7nd.geojson?$limit=300&$where=ntatype%20!=%20%279%27';
    const ntaData = await fetchJSON(ntaUrl);
    for (const f of ntaData.features) {
      ntaLookup[f.properties.ntaname] = f.geometry;
    }
    console.log('  Loaded ' + Object.keys(ntaLookup).length + ' NTA features\n');
  } catch (e) {
    console.warn('  WARN: Could not fetch NTA data (' + e.message + ') — using patches only\n');
  }

  // 4. Build GeoJSON features
  const features = [];
  const coverage = { patched: [], derived: [], missing: [] };

  for (const entry of names) {
    const name = entry.name;
    let ring = null;
    let centroid = null;
    let source = null;

    // PRIORITY 1: patch-polygons.js
    if (patch.polygons[name]) {
      ring = patch.polygons[name];
      centroid = patch.centers[name] || computeCentroid(ring);
      source = 'patch_polygons';
      coverage.patched.push(name);
    }

    // PRIORITY 2: NTA mapping
    if (!ring) {
      const ntaName = NTA_MAPPING[name];
      if (ntaName && ntaLookup[ntaName]) {
        const geom = ntaLookup[ntaName];
        ring = getLargestRing(geom);
        if (ring) {
          // Simplify if too detailed
          if (ring.length > 80) {
            ring = simplifyRing(ring, 0.0003);
          }
          // Close ring
          if (ring.length > 0 &&
              (ring[0][0] !== ring[ring.length - 1][0] ||
               ring[0][1] !== ring[ring.length - 1][1])) {
            ring.push([ring[0][0], ring[0][1]]);
          }
          centroid = computeCentroid(ring);
          source = 'nyc_nta_2020';
          coverage.derived.push(name);
        }
      }
    }

    // MISSING
    if (!ring) {
      coverage.missing.push(name);
      console.log('  MISSING: ' + name + ' (no patch, no NTA match)');
      continue;
    }

    features.push({
      type: 'Feature',
      properties: {
        name: name,
        borough: entry.borough,
        slug: entry.slug,
        source: source,
        quality: source === 'patch_polygons' ? 'high' : 'medium',
        centroid: {
          lng: parseFloat(centroid[0].toFixed(6)),
          lat: parseFloat(centroid[1].toFixed(6)),
        },
      },
      geometry: {
        type: 'Polygon',
        coordinates: [ring],
      },
    });
  }

  // 5. Write GeoJSON
  const geojson = {
    type: 'FeatureCollection',
    _meta: {
      version: 1,
      generatedAt: new Date().toISOString(),
      rlsNeighborField: canonical._meta.rlsNeighborField || 'SubdivisionName',
      trestleVerified: canonical._meta.trestleVerified,
      totalFeatures: features.length,
      canonical: names.length,
    },
    features: features,
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(geojson, null, 2) + '\n');

  const sizeKB = Math.round(fs.statSync(OUTPUT).size / 1024);
  console.log('\nWrote: ' + OUTPUT + ' (' + sizeKB + ' KB)');

  // 6. Coverage report
  console.log('\n════════════════════════════════════════');
  console.log('  COVERAGE REPORT');
  console.log('════════════════════════════════════════');
  console.log('  Canonical:  ' + names.length);
  console.log('  With polygon: ' + features.length);
  console.log('');
  console.log('  PATCHED (' + coverage.patched.length + ') — from patch-polygons.js (high quality):');
  if (coverage.patched.length > 0) {
    coverage.patched.forEach((n) => console.log('    + ' + n));
  } else {
    console.log('    (none)');
  }
  console.log('');
  console.log('  DERIVED (' + coverage.derived.length + ') — from NTA 2020 mapping (medium quality):');
  if (coverage.derived.length > 0) {
    coverage.derived.forEach((n) => console.log('    ~ ' + n));
  } else {
    console.log('    (none)');
  }
  console.log('');
  console.log('  MISSING (' + coverage.missing.length + ') — no polygon source:');
  if (coverage.missing.length > 0) {
    coverage.missing.forEach((n) => console.log('    ! ' + n));
  } else {
    console.log('    (none)');
  }
  console.log('════════════════════════════════════════');

  // Write coverage report JSON for CI
  const reportPath = path.join(ROOT, 'data', 'rls', 'geo', 'coverage-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    canonical: names.length,
    withPolygon: features.length,
    patched: coverage.patched,
    derived: coverage.derived,
    missing: coverage.missing,
  }, null, 2) + '\n');
  console.log('\nCoverage report: ' + reportPath);

  if (coverage.missing.length > 0) {
    console.log('\nWARNING: ' + coverage.missing.length + ' canonical neighborhoods have no polygon.');
    console.log('Add them to patch-polygons.js or NTA_MAPPING.');
  }
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
