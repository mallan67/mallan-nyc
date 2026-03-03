#!/usr/bin/env node
/**
 * validate-rls-geo.js — 12-check CI-gateable validator for RLS neighborhood geo data
 *
 * STRICTNESS:
 *   - When trestleVerified = true  → failures are ERRORS (exit 1)
 *   - When trestleVerified = false → failures are WARNINGS (exit 0)
 *   This allows draft data to be committed without blocking CI.
 *
 * Checks:
 *   1.  Canonical file exists and parses
 *   2.  GeoJSON file exists and parses
 *   3.  Canonical ↔ GeoJSON name match (every canonical name has a Feature)
 *   4.  No duplicate names in canonical list
 *   5.  No duplicate names in GeoJSON
 *   6.  All polygons have valid closed rings (first == last coord)
 *   7.  All coordinates within NYC bounding box
 *   8.  All features have centroids
 *   9.  Minified GeoJSON exists and feature count matches
 *  10.  Centroids file exists and count matches
 *  11.  GeoJSON file size under 5MB
 *  12.  Minified file size under 500KB
 *
 * Usage: node scripts/validate-rls-geo.js
 *   or:  npm run geo:validate
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CANONICAL_PATH = path.join(ROOT, 'data', 'rls', 'neighborhoods.v1.json');
const GEOJSON_PATH = path.join(ROOT, 'data', 'rls', 'geo', 'rls-neighborhoods.v1.geojson');
const MIN_PATH = path.join(ROOT, 'public', 'geo', 'rls-neighborhoods.v1.min.geojson');
const CENTROID_PATH = path.join(ROOT, 'public', 'geo', 'rls-neighborhood-centroids.v1.json');
const ALIAS_PATH = path.join(ROOT, 'data', 'rls', 'geo', 'neighborhood-aliases.json');

// NYC bounding box (generous — covers all 5 boroughs + margins)
const NYC_BBOX = {
  minLng: -74.30,
  maxLng: -73.65,
  minLat: 40.47,
  maxLat: 40.95,
};

let passes = 0;
let fails = 0;
let warns = 0;
let strict = false; // determined by trestleVerified

function pass(msg) {
  passes++;
  console.log('[PASS]  ' + msg);
}

function fail(msg) {
  if (strict) {
    fails++;
    console.log('[FAIL]  ' + msg);
  } else {
    warns++;
    console.log('[WARN]  ' + msg + '  (non-strict: trestleVerified=false)');
  }
}

function info(msg) {
  console.log('[INFO]  ' + msg);
}

function main() {
  console.log('=== RLS Geo Validator (12 checks) ===\n');

  // ── Check 1: Canonical file ──
  let canonical = null;
  try {
    canonical = JSON.parse(fs.readFileSync(CANONICAL_PATH, 'utf8'));
    if (!canonical.neighborhoods || !Array.isArray(canonical.neighborhoods)) {
      throw new Error('Missing neighborhoods array');
    }
    pass('1. Canonical file exists and parses (' + canonical.neighborhoods.length + ' entries)');
  } catch (e) {
    fail('1. Canonical file: ' + e.message);
    console.log('\nFATAL: Cannot continue without canonical file.');
    process.exit(1);
  }

  // Determine strictness
  strict = canonical._meta && canonical._meta.trestleVerified === true;
  info('   Strictness: ' + (strict ? 'STRICT (trestleVerified=true)' : 'WARN-ONLY (trestleVerified=false)'));
  info('   RLS field: ' + (canonical._meta.rlsNeighborField || 'SubdivisionName'));
  console.log('');

  // ── Check 2: GeoJSON file ──
  let geojson = null;
  try {
    geojson = JSON.parse(fs.readFileSync(GEOJSON_PATH, 'utf8'));
    if (!geojson.features || !Array.isArray(geojson.features)) {
      throw new Error('Missing features array');
    }
    pass('2. GeoJSON file exists and parses (' + geojson.features.length + ' features)');
  } catch (e) {
    fail('2. GeoJSON file: ' + e.message);
    console.log('\nFATAL: Cannot continue without GeoJSON file.');
    process.exit(strict ? 1 : 0);
  }

  // ── Check 3: Canonical ↔ GeoJSON name match (with alias resolution) ──
  const canonicalNames = new Set(canonical.neighborhoods.map((n) => n.name));
  const geoNames = new Set(geojson.features.map((f) => f.properties.name));

  // Load alias file — aliases resolve variants to polygon names
  let aliasMap = {};
  try {
    const aliasData = JSON.parse(fs.readFileSync(ALIAS_PATH, 'utf8'));
    aliasMap = aliasData.aliases || {};
    info('   Alias file loaded (' + Object.keys(aliasMap).length + ' aliases)');
  } catch (_) {
    info('   No alias file found — checking direct matches only');
  }

  // A canonical name is "covered" if it has a polygon OR an alias to a polygon
  const missingInGeo = [...canonicalNames].filter((n) => {
    if (geoNames.has(n)) return false; // direct polygon
    if (aliasMap[n] && geoNames.has(aliasMap[n])) return false; // alias to polygon
    return true;
  });
  const extraInGeo = [...geoNames].filter((n) => !canonicalNames.has(n));

  if (missingInGeo.length === 0 && extraInGeo.length === 0) {
    pass('3. All ' + canonicalNames.size + ' canonical names covered (' + geoNames.size + ' polygons + ' + Object.keys(aliasMap).length + ' aliases)');
  } else {
    const parts = [];
    if (missingInGeo.length > 0) parts.push(missingInGeo.length + ' missing: ' + missingInGeo.join(', '));
    if (extraInGeo.length > 0) parts.push(extraInGeo.length + ' extra: ' + extraInGeo.join(', '));
    fail('3. Canonical ↔ GeoJSON mismatch: ' + parts.join('; '));
  }

  // ── Check 4: No duplicate canonical names ──
  const canonDups = findDuplicates(canonical.neighborhoods.map((n) => n.name));
  if (canonDups.length === 0) {
    pass('4. No duplicate names in canonical list');
  } else {
    fail('4. Duplicate canonical names: ' + canonDups.join(', '));
  }

  // ── Check 5: No duplicate GeoJSON names ──
  const geoDups = findDuplicates(geojson.features.map((f) => f.properties.name));
  if (geoDups.length === 0) {
    pass('5. No duplicate names in GeoJSON');
  } else {
    fail('5. Duplicate GeoJSON names: ' + geoDups.join(', '));
  }

  // ── Check 6: Valid closed rings ──
  let openRings = 0;
  let invalidRings = 0;
  for (const f of geojson.features) {
    const coords = f.geometry.coordinates;
    if (!coords || !coords[0] || coords[0].length < 4) {
      invalidRings++;
      continue;
    }
    const ring = coords[0];
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      openRings++;
    }
  }
  if (openRings === 0 && invalidRings === 0) {
    pass('6. All polygons have valid closed rings');
  } else {
    const parts = [];
    if (openRings > 0) parts.push(openRings + ' open rings');
    if (invalidRings > 0) parts.push(invalidRings + ' invalid rings');
    fail('6. Ring issues: ' + parts.join(', '));
  }

  // ── Check 7: NYC bounding box ──
  let outOfBounds = 0;
  const oobNames = [];
  for (const f of geojson.features) {
    const ring = f.geometry.coordinates[0];
    for (const c of ring) {
      if (c[0] < NYC_BBOX.minLng || c[0] > NYC_BBOX.maxLng ||
          c[1] < NYC_BBOX.minLat || c[1] > NYC_BBOX.maxLat) {
        outOfBounds++;
        if (!oobNames.includes(f.properties.name)) oobNames.push(f.properties.name);
        break;
      }
    }
  }
  if (outOfBounds === 0) {
    pass('7. All coordinates within NYC bounding box');
  } else {
    fail('7. ' + outOfBounds + ' features outside NYC bbox: ' + oobNames.join(', '));
  }

  // ── Check 8: Centroids present ──
  let missingCentroids = 0;
  for (const f of geojson.features) {
    if (!f.properties.centroid || !f.properties.centroid.lng || !f.properties.centroid.lat) {
      missingCentroids++;
    }
  }
  if (missingCentroids === 0) {
    pass('8. All features have centroids');
  } else {
    fail('8. ' + missingCentroids + ' features missing centroids');
  }

  // ── Check 9: Minified GeoJSON consistency ──
  try {
    const min = JSON.parse(fs.readFileSync(MIN_PATH, 'utf8'));
    if (min.features.length === geojson.features.length) {
      pass('9. Minified GeoJSON exists, feature count matches (' + min.features.length + ')');
    } else {
      fail('9. Minified feature count mismatch: ' + min.features.length + ' vs ' + geojson.features.length);
    }
  } catch (e) {
    fail('9. Minified GeoJSON: ' + e.message);
  }

  // ── Check 10: Centroids file consistency ──
  try {
    const centroids = JSON.parse(fs.readFileSync(CENTROID_PATH, 'utf8'));
    const centroidCount = Object.keys(centroids).length;
    if (centroidCount === geojson.features.length) {
      pass('10. Centroids file exists, count matches (' + centroidCount + ')');
    } else {
      fail('10. Centroids count mismatch: ' + centroidCount + ' vs ' + geojson.features.length);
    }
  } catch (e) {
    fail('10. Centroids file: ' + e.message);
  }

  // ── Check 11: GeoJSON size limit (5MB) ──
  try {
    const stat = fs.statSync(GEOJSON_PATH);
    const sizeMB = (stat.size / (1024 * 1024)).toFixed(2);
    if (stat.size < 5 * 1024 * 1024) {
      pass('11. GeoJSON size OK (' + sizeMB + ' MB < 5 MB)');
    } else {
      fail('11. GeoJSON too large: ' + sizeMB + ' MB (limit 5 MB)');
    }
  } catch (e) {
    fail('11. GeoJSON size check: ' + e.message);
  }

  // ── Check 12: Minified size limit (500KB) ──
  try {
    const stat = fs.statSync(MIN_PATH);
    const sizeKB = Math.round(stat.size / 1024);
    if (stat.size < 500 * 1024) {
      pass('12. Minified GeoJSON size OK (' + sizeKB + ' KB < 500 KB)');
    } else {
      fail('12. Minified GeoJSON too large: ' + sizeKB + ' KB (limit 500 KB)');
    }
  } catch (e) {
    fail('12. Minified size check: ' + e.message);
  }

  // ── Summary ──
  console.log('\n════════════════════════════════════════');
  console.log('  RESULTS: ' + passes + ' PASS, ' + fails + ' FAIL, ' + warns + ' WARN');
  console.log('  Mode: ' + (strict ? 'STRICT (trestleVerified=true)' : 'WARN-ONLY (trestleVerified=false)'));
  console.log('════════════════════════════════════════');

  if (fails > 0) {
    console.log('\nExit 1 — ' + fails + ' strict failures.');
    process.exit(1);
  }

  if (warns > 0) {
    console.log('\nExit 0 — ' + warns + ' warnings (non-blocking since trestleVerified=false).');
  }

  process.exit(0);
}

function findDuplicates(arr) {
  const seen = {};
  const dups = [];
  for (const item of arr) {
    if (seen[item]) {
      if (!dups.includes(item)) dups.push(item);
    }
    seen[item] = true;
  }
  return dups;
}

main();
