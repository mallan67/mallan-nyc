/**
 * Sync neighborhood JSON zipCodes from the authoritative ZIP library.
 * Reads lib/geo/nyc-zip-neighborhoods.ts and updates data/*.json files.
 */
const fs = require('fs');

// Parse the ZIP library from the TS file
const tsContent = fs.readFileSync('lib/geo/nyc-zip-neighborhoods.ts', 'utf8');
const match = tsContent.match(/NYC_ZIP_MAP.*?=\s*(\{[\s\S]*?\n\});/);
if (!match) { console.error('Could not parse library'); process.exit(1); }
const zipMap = JSON.parse(match[1]);

// Build neighborhood → zips map per borough
const byBorough = {};
for (const [zip, entry] of Object.entries(zipMap)) {
  const borough = entry.borough.toLowerCase().replace(/\s+/g, '-');
  if (!byBorough[borough]) byBorough[borough] = {};

  // Map the library neighborhood name to our slug
  const name = entry.neighborhood;
  if (!byBorough[borough][name]) byBorough[borough][name] = [];
  byBorough[borough][name].push(zip);
}

// Update each borough JSON
const boroughs = ['manhattan', 'brooklyn', 'queens', 'bronx', 'staten-island'];
for (const b of boroughs) {
  const filePath = `data/${b}-neighborhoods.json`;
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const neighborhoodZips = byBorough[b] || {};

  let updated = 0;
  for (const n of data.neighborhoods) {
    // Match by name
    const zips = neighborhoodZips[n.name];
    if (zips && zips.length > 0) {
      const oldZips = (n.zipCodes || []).sort().join(',');
      n.zipCodes = [...zips].sort();
      const newZips = n.zipCodes.join(',');
      if (oldZips !== newZips) {
        console.log(`${n.name} (${b}): [${oldZips}] → [${newZips}]`);
        updated++;
      }
    }
  }

  if (updated > 0) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
    console.log(`  Updated ${updated} in ${filePath}\n`);
  } else {
    console.log(`  No changes in ${filePath}\n`);
  }
}
