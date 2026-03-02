/**
 * check-dupes.js — Check for duplicate polygon/center entries in neighborhood-polygons.js
 * Compares first 3 coordinates of each polygon and all center coordinates to find duplicates.
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'js', 'render', 'neighborhood-polygons.js');
const content = fs.readFileSync(filePath, 'utf8');

// --- Extract NEIGHBORHOOD_POLYGONS (inline object + bracket-assigned extras) ---
const polyMatch = content.match(/var NEIGHBORHOOD_POLYGONS\s*=\s*\{([\s\S]*?)\n\};/);
if (!polyMatch) {
  console.error('ERROR: Could not find NEIGHBORHOOD_POLYGONS object');
  process.exit(1);
}

// --- Extract NEIGHBORHOOD_CENTERS ---
const centerMatch = content.match(/var NEIGHBORHOOD_CENTERS\s*=\s*\{([\s\S]*?)\n\};/);
if (!centerMatch) {
  console.error('ERROR: Could not find NEIGHBORHOOD_CENTERS object');
  process.exit(1);
}

// Parse polygons from the inline object
const polyLines = polyMatch[1].split('\n').filter(l => l.trim().startsWith("'"));
const polygons = {};
for (const line of polyLines) {
  const nameMatch = line.match(/^\s*'([^']+)'/);
  const coordsMatch = line.match(/\[\[.*\]\]/);
  if (nameMatch && coordsMatch) {
    try {
      const coords = JSON.parse(coordsMatch[0]);
      polygons[nameMatch[1]] = coords;
    } catch (e) {
      console.warn(`  Warning: Could not parse coords for "${nameMatch[1]}": ${e.message}`);
    }
  }
}

// Also parse bracket-assigned polygons: NEIGHBORHOOD_POLYGONS['Name'] = [[...]];
const bracketPolyRegex = /NEIGHBORHOOD_POLYGONS\['([^']+)'\]\s*=\s*(\[\[.*?\]\]);/g;
let bm;
while ((bm = bracketPolyRegex.exec(content)) !== null) {
  try {
    const coords = JSON.parse(bm[2]);
    polygons[bm[1]] = coords;
  } catch (e) {
    console.warn(`  Warning: Could not parse bracket-assigned coords for "${bm[1]}": ${e.message}`);
  }
}

// Parse centers: format is 'Name': [lat, lng],
const centerLines = centerMatch[1].split('\n').filter(l => l.trim().startsWith("'"));
const centers = {};
for (const line of centerLines) {
  const nameMatch = line.match(/^\s*'([^']+)'/);
  const coordMatch = line.match(/\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]/);
  if (nameMatch && coordMatch) {
    centers[nameMatch[1]] = { lat: parseFloat(coordMatch[1]), lng: parseFloat(coordMatch[2]) };
  }
}

// Also parse bracket-assigned centers: NEIGHBORHOOD_CENTERS['Name'] = [lat, lng];
const bracketCenterRegex = /NEIGHBORHOOD_CENTERS\['([^']+)'\]\s*=\s*\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\];/g;
let cm;
while ((cm = bracketCenterRegex.exec(content)) !== null) {
  centers[cm[1]] = { lat: parseFloat(cm[2]), lng: parseFloat(cm[3]) };
}

console.log(`\n=== NEIGHBORHOOD POLYGONS: ${Object.keys(polygons).length} entries ===`);
console.log(`=== NEIGHBORHOOD CENTERS: ${Object.keys(centers).length} entries ===\n`);

// --- Check polygon duplicates (compare first 3 coords) ---
console.log('--- Polygon Duplicate Check (first 3 coordinates) ---');
const polyKeys = Object.keys(polygons);
const polyDupeGroups = [];
const polyChecked = new Set();

for (let i = 0; i < polyKeys.length; i++) {
  if (polyChecked.has(polyKeys[i])) continue;
  const a = polygons[polyKeys[i]];
  const aKey = a.slice(0, 3).map(c => `${c[0]},${c[1]}`).join('|');
  const group = [polyKeys[i]];

  for (let j = i + 1; j < polyKeys.length; j++) {
    if (polyChecked.has(polyKeys[j])) continue;
    const b = polygons[polyKeys[j]];
    const bKey = b.slice(0, 3).map(c => `${c[0]},${c[1]}`).join('|');
    if (aKey === bKey) {
      group.push(polyKeys[j]);
      polyChecked.add(polyKeys[j]);
    }
  }

  if (group.length > 1) {
    polyDupeGroups.push(group);
    polyChecked.add(polyKeys[i]);
  }
}

if (polyDupeGroups.length === 0) {
  console.log('  No polygon duplicates found.\n');
} else {
  console.log(`  Found ${polyDupeGroups.length} duplicate group(s):`);
  for (const group of polyDupeGroups) {
    const sample = polygons[group[0]].slice(0, 3);
    console.log(`  - ${group.join(', ')}  (first 3 coords: ${JSON.stringify(sample)})`);
  }
  console.log();
}

// --- Check center duplicates (exact lat/lng match) ---
console.log('--- Center Duplicate Check (exact lat/lng) ---');
const centerKeys = Object.keys(centers);
const centerDupeGroups = [];
const centerChecked = new Set();

for (let i = 0; i < centerKeys.length; i++) {
  if (centerChecked.has(centerKeys[i])) continue;
  const a = centers[centerKeys[i]];
  const group = [centerKeys[i]];

  for (let j = i + 1; j < centerKeys.length; j++) {
    if (centerChecked.has(centerKeys[j])) continue;
    const b = centers[centerKeys[j]];
    if (a.lat === b.lat && a.lng === b.lng) {
      group.push(centerKeys[j]);
      centerChecked.add(centerKeys[j]);
    }
  }

  if (group.length > 1) {
    centerDupeGroups.push(group);
    centerChecked.add(centerKeys[i]);
  }
}

if (centerDupeGroups.length === 0) {
  console.log('  No center duplicates found.\n');
} else {
  console.log(`  Found ${centerDupeGroups.length} duplicate group(s):`);
  for (const group of centerDupeGroups) {
    const c = centers[group[0]];
    console.log(`  - ${group.join(', ')}  (lat: ${c.lat}, lng: ${c.lng})`);
  }
  console.log();
}

// --- Cross-check: names in polygons but not in centers, and vice versa ---
console.log('--- Cross-Check: Polygons vs Centers ---');
const polyOnly = polyKeys.filter(k => !centers[k]);
const centerOnly = centerKeys.filter(k => !polygons[k]);

if (polyOnly.length === 0 && centerOnly.length === 0) {
  console.log('  All names match between polygons and centers.\n');
} else {
  if (polyOnly.length > 0) {
    console.log(`  In POLYGONS but not CENTERS (${polyOnly.length}): ${polyOnly.join(', ')}`);
  }
  if (centerOnly.length > 0) {
    console.log(`  In CENTERS but not POLYGONS (${centerOnly.length}): ${centerOnly.join(', ')}`);
  }
  console.log();
}

// --- Also check for near-duplicates in centers (within 0.001 degrees ~ 111m) ---
console.log('--- Near-Duplicate Centers (within 0.001 degrees / ~111m) ---');
const nearDupeGroups = [];
const nearChecked = new Set();
const THRESHOLD = 0.001;

for (let i = 0; i < centerKeys.length; i++) {
  if (nearChecked.has(centerKeys[i])) continue;
  const a = centers[centerKeys[i]];
  const group = [centerKeys[i]];

  for (let j = i + 1; j < centerKeys.length; j++) {
    if (nearChecked.has(centerKeys[j])) continue;
    const b = centers[centerKeys[j]];
    const dist = Math.sqrt(Math.pow(a.lat - b.lat, 2) + Math.pow(a.lng - b.lng, 2));
    if (dist < THRESHOLD) {
      group.push(centerKeys[j]);
      nearChecked.add(centerKeys[j]);
    }
  }

  if (group.length > 1) {
    nearDupeGroups.push(group);
    nearChecked.add(centerKeys[i]);
  }
}

if (nearDupeGroups.length === 0) {
  console.log('  No near-duplicate centers found.\n');
} else {
  console.log(`  Found ${nearDupeGroups.length} near-duplicate group(s):`);
  for (const group of nearDupeGroups) {
    const coords = group.map(n => `${n} (${centers[n].lat}, ${centers[n].lng})`);
    console.log(`  - ${coords.join(' | ')}`);
  }
  console.log();
}

// Summary
const totalIssues = polyDupeGroups.length + centerDupeGroups.length + polyOnly.length + centerOnly.length + nearDupeGroups.length;
if (totalIssues === 0) {
  console.log('=== RESULT: No duplicates or mismatches found. All clean. ===\n');
} else {
  console.log(`=== RESULT: ${totalIssues} issue(s) found. Review above. ===\n`);
}
