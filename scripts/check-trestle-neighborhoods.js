/**
 * Query live Trestle data via our API to see what PostalCode values
 * actually exist, and compare against our ZIP library.
 */

async function main() {
  // Fetch listings in sequence to avoid rate limiting
  const allListings = [];
  for (let skip = 0; skip < 300; skip += 50) {
    const url = `https://mallan.nyc/api/listings?limit=50&skip=${skip}&sort=newest&_t=tc${Date.now()}`;
    const res = await fetch(url);
    if (!res.ok) { console.log(`Skip ${skip}: HTTP ${res.status}`); continue; }
    const data = await res.json();
    allListings.push(...(data.listings || []));
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`Fetched ${allListings.length} listings from Trestle\n`);

  // Aggregate by PostalCode
  const zipData = {};
  for (const l of allListings) {
    const zip = l.address?.postalCode || '?';
    const cityRegion = l.address?.neighborhood || '?';
    const county = l.address?.county || '?';
    const lat = l.address?.latitude;
    const lng = l.address?.longitude;

    if (!zipData[zip]) {
      zipData[zip] = { cityRegion, county, count: 0, lats: [], lngs: [], samples: [] };
    }
    zipData[zip].count++;
    if (lat) zipData[zip].lats.push(lat);
    if (lng) zipData[zip].lngs.push(lng);
    if (zipData[zip].samples.length < 2) {
      zipData[zip].samples.push(`${l.address?.streetNumber} ${l.address?.streetName}`);
    }
  }

  // Load our library
  const fs = require('fs');
  const libContent = fs.readFileSync('lib/geo/nyc-zip-neighborhoods.ts', 'utf8');
  const match = libContent.match(/NYC_ZIP_MAP.*?=\s*(\{[\s\S]*?\n\});/);
  const ourLib = match ? JSON.parse(match[1]) : {};

  // Compare
  console.log('ZIP    | Count | Trestle CityRegion | County    | Our Library           | Avg Lat/Lng');
  console.log('-------|-------|--------------------|-----------|-----------------------|-----------');

  const sortedZips = Object.keys(zipData).sort();
  const missingZips = [];

  for (const zip of sortedZips) {
    const t = zipData[zip];
    const ours = ourLib[zip];
    const ourName = ours ? ours.neighborhood : '** MISSING **';

    const avgLat = t.lats.length ? (t.lats.reduce((a,b)=>a+b,0)/t.lats.length).toFixed(4) : '?';
    const avgLng = t.lngs.length ? (t.lngs.reduce((a,b)=>a+b,0)/t.lngs.length).toFixed(4) : '?';

    const flag = ours ? '' : ' <<<';
    console.log(
      `${zip.padEnd(6)} | ${String(t.count).padEnd(5)} | ${t.cityRegion.padEnd(18)} | ${t.county.padEnd(9)} | ${ourName.padEnd(21)} | ${avgLat}, ${avgLng}${flag}`
    );

    if (!ours) {
      missingZips.push({ zip, cityRegion: t.cityRegion, county: t.county, count: t.count, samples: t.samples, avgLat, avgLng });
    }
  }

  if (missingZips.length > 0) {
    console.log(`\n=== ${missingZips.length} ZIPs in Trestle NOT in our library ===`);
    for (const m of missingZips) {
      console.log(`  ${m.zip} (${m.cityRegion}/${m.county}) — ${m.count} listings — ${m.samples.join(', ')} — center: ${m.avgLat},${m.avgLng}`);
    }
  } else {
    console.log('\nAll Trestle ZIPs are covered in our library.');
  }

  console.log(`\nTrestle ZIPs found: ${sortedZips.length}`);
  console.log(`Library ZIPs: ${Object.keys(ourLib).length}`);
}

main().catch(console.error);
