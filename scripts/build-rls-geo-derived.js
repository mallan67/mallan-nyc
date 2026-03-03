#!/usr/bin/env node
/**
 * build-rls-geo-derived.js — Generate minified GeoJSON + centroids from full GeoJSON
 *
 * Reads:  data/rls/geo/rls-neighborhoods.v1.geojson  (full)
 * Writes:
 *   public/geo/rls-neighborhoods.v1.min.geojson  (minified, coords to 4 decimals)
 *   public/geo/rls-neighborhood-centroids.v1.json (centroid lookup for flyTo/labels)
 *
 * Usage: node scripts/build-rls-geo-derived.js
 *   or:  npm run geo:derive
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INPUT = path.join(ROOT, 'data', 'rls', 'geo', 'rls-neighborhoods.v1.geojson');
const MIN_OUTPUT = path.join(ROOT, 'public', 'geo', 'rls-neighborhoods.v1.min.geojson');
const CENTROID_OUTPUT = path.join(ROOT, 'public', 'geo', 'rls-neighborhood-centroids.v1.json');
const ALIAS_INPUT = path.join(ROOT, 'data', 'rls', 'geo', 'neighborhood-aliases.json');
const ALIAS_OUTPUT = path.join(ROOT, 'public', 'geo', 'neighborhood-aliases.json');

function truncCoord(val, decimals) {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

function truncRing(ring, decimals) {
  return ring.map((c) => [truncCoord(c[0], decimals), truncCoord(c[1], decimals)]);
}

function main() {
  console.log('=== RLS Geo Derived Builder ===\n');

  if (!fs.existsSync(INPUT)) {
    console.error('ERROR: Full GeoJSON not found: ' + INPUT);
    console.error('Run: npm run geo:build first');
    process.exit(1);
  }

  const geojson = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  console.log('Input features: ' + geojson.features.length);

  // ── File C: Minified GeoJSON ──
  const minFeatures = geojson.features.map((f) => {
    const coords = f.geometry.coordinates.map((ring) => truncRing(ring, 4));
    return {
      type: 'Feature',
      properties: {
        name: f.properties.name,
        borough: f.properties.borough,
        slug: f.properties.slug,
      },
      geometry: {
        type: 'Polygon',
        coordinates: coords,
      },
    };
  });

  const minGeoJSON = {
    type: 'FeatureCollection',
    features: minFeatures,
  };

  fs.mkdirSync(path.dirname(MIN_OUTPUT), { recursive: true });
  const minJSON = JSON.stringify(minGeoJSON);
  fs.writeFileSync(MIN_OUTPUT, minJSON);
  const minSizeKB = Math.round(Buffer.byteLength(minJSON) / 1024);
  console.log('Minified GeoJSON: ' + MIN_OUTPUT + ' (' + minSizeKB + ' KB)');

  // ── File D: Centroids ──
  const centroids = {};
  for (const f of geojson.features) {
    const c = f.properties.centroid;
    if (c) {
      centroids[f.properties.name] = {
        lng: c.lng,
        lat: c.lat,
        borough: f.properties.borough,
      };
    }
  }

  fs.writeFileSync(CENTROID_OUTPUT, JSON.stringify(centroids, null, 2) + '\n');
  console.log('Centroids: ' + CENTROID_OUTPUT + ' (' + Object.keys(centroids).length + ' entries)');

  // ── Copy aliases to public/geo/ for browser access ──
  if (fs.existsSync(ALIAS_INPUT)) {
    fs.copyFileSync(ALIAS_INPUT, ALIAS_OUTPUT);
    const aliasData = JSON.parse(fs.readFileSync(ALIAS_INPUT, 'utf8'));
    const count = Object.keys(aliasData.aliases || {}).length;
    console.log('Aliases: ' + ALIAS_OUTPUT + ' (' + count + ' mappings)');
  }

  console.log('\nDone.');
}

main();
