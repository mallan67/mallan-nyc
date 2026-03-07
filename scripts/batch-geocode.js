/**
 * Batch geocode all listings and pre-seed the Neon geocode_cache.
 *
 * Usage:
 *   node scripts/batch-geocode.js
 *
 * Requires DATABASE_URL + IDX credentials in .env.local.
 * Fetches active IDX listings from Trestle, geocodes via Census,
 * and upserts results into geocode_cache. No time budget — runs all.
 *
 * Safe to run multiple times — skips already-cached addresses.
 */

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
// Use unpooled (direct) URL — pooled URL has channel_binding=require which Prisma's engine may not support locally
const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL },
  },
});

const CENSUS_CONCURRENCY = 10;
const CENSUS_TIMEOUT_MS = 5000;

function addressKey(streetNumber, streetName, zip) {
  return `${streetNumber.trim()}|${streetName.trim().toUpperCase()}|${zip}`;
}

async function geocodeViaCensus(streetNumber, streetName, city, state, zip) {
  try {
    const street = `${streetNumber} ${streetName}`.trim();
    const address = `${street}, ${city || 'New York'}, ${state || 'NY'} ${zip}`;
    const params = new URLSearchParams({ address, benchmark: 'Public_AR_Current', format: 'json' });
    const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${params.toString()}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(CENSUS_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const match = data?.result?.addressMatches?.[0];
    if (match?.coordinates?.x != null && match?.coordinates?.y != null) {
      const lat = match.coordinates.y;
      const lng = match.coordinates.x;
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
        return [lat, lng];
      }
    }
  } catch {
    // timeout or network error
  }
  return null;
}

async function getToken() {
  const CLIENT_ID = process.env.IDX_CLIENT_ID;
  const CLIENT_SECRET = process.env.IDX_CLIENT_SECRET;
  const API_URL = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';

  const tokenRes = await fetch(`${API_URL}/oidc/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'api',
    }).toString(),
  });
  if (!tokenRes.ok) throw new Error(`Token failed: ${tokenRes.status}`);
  const { access_token } = await tokenRes.json();
  return access_token;
}

async function fetchAllListings() {
  const token = await getToken();
  const base = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';
  const endpoint = `${base}/odata/Property`;

  const select = 'ListingId,StreetNumber,StreetDirPrefix,StreetName,StreetSuffix,StreetDirSuffix,PostalCode,City,StateOrProvince,Latitude,Longitude';
  const filter = "StandardStatus eq 'Active'";

  const all = [];
  let skip = 0;
  const top = 500;

  while (true) {
    const params = new URLSearchParams({
      '$select': select,
      '$filter': filter,
      '$top': String(top),
      '$skip': String(skip),
      '$orderby': 'ModificationTimestamp desc',
    });
    console.log(`Fetching listings skip=${skip}...`);

    const res = await fetch(`${endpoint}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });

    if (!res.ok) {
      console.error(`Trestle API error: ${res.status} ${res.statusText}`);
      break;
    }

    const data = await res.json();
    const records = data?.value || [];
    all.push(...records);

    if (records.length < top || !data['@odata.nextLink']) break;
    skip += top;
  }

  return all;
}

async function main() {
  console.log('=== Batch Geocode Pre-Seed ===\n');

  // Step 1: Fetch all active listings from Trestle
  console.log('Step 1: Fetching active listings from Trestle...');
  const listings = await fetchAllListings();
  console.log(`  Found ${listings.length} active listings\n`);

  // Step 2: Build address entries needing geocoding
  const toGeocode = [];

  for (const l of listings) {
    const num = (l.StreetNumber || '').trim();
    const fullStreet = [l.StreetDirPrefix, l.StreetName, l.StreetSuffix, l.StreetDirSuffix]
      .filter(Boolean)
      .map(s => (s || '').trim())
      .join(' ');
    const zip = (l.PostalCode || '').split('-')[0].trim();
    if (!num || !fullStreet || !zip) continue;

    // Skip if Trestle already has coords
    if (l.Latitude && l.Longitude && l.Latitude !== 0 && l.Longitude !== 0) continue;

    const key = addressKey(num, fullStreet, zip);
    toGeocode.push({ key, num, street: fullStreet, city: l.City || 'New York', state: l.StateOrProvince || 'NY', zip });
  }

  // Deduplicate by address key
  const uniqueMap = new Map(toGeocode.map(e => [e.key, e]));
  const unique = [...uniqueMap.values()];
  console.log(`Step 2: ${unique.length} unique addresses need geocoding (${toGeocode.length} total, ${toGeocode.length - unique.length} dupes)\n`);

  // Step 3: Check which are already in DB cache
  console.log('Step 3: Checking DB cache...');
  const existingKeys = new Set();
  const allKeys = unique.map(e => e.key);

  for (let i = 0; i < allKeys.length; i += 500) {
    const batch = allKeys.slice(i, i + 500);
    const existing = await prisma.geocodeCache.findMany({
      where: { address_key: { in: batch } },
      select: { address_key: true },
    });
    for (const r of existing) existingKeys.add(r.address_key);
  }

  const needsCensus = unique.filter(e => !existingKeys.has(e.key));
  console.log(`  ${existingKeys.size} already cached, ${needsCensus.length} need Census geocoding\n`);

  if (needsCensus.length === 0) {
    console.log('All addresses already cached. Nothing to do.');
    await prisma.$disconnect();
    return;
  }

  // Step 4: Geocode via Census in parallel batches
  console.log(`Step 4: Geocoding ${needsCensus.length} addresses via Census (concurrency=${CENSUS_CONCURRENCY})...\n`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < needsCensus.length; i += CENSUS_CONCURRENCY) {
    const batch = needsCensus.slice(i, i + CENSUS_CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(entry =>
        geocodeViaCensus(entry.num, entry.street, entry.city, entry.state, entry.zip)
          .then(coords => ({ entry, coords }))
      )
    );

    const dbOps = [];

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.coords) {
        const { entry, coords } = result.value;
        success++;
        dbOps.push(
          prisma.geocodeCache.upsert({
            where: { address_key: entry.key },
            create: { address_key: entry.key, latitude: coords[0], longitude: coords[1], source: 'census' },
            update: { latitude: coords[0], longitude: coords[1], source: 'census' },
          }).catch(() => { /* non-fatal */ })
        );
      } else {
        failed++;
      }
    }

    await Promise.allSettled(dbOps);

    const done = Math.min(i + CENSUS_CONCURRENCY, needsCensus.length);
    process.stdout.write(`  ${done}/${needsCensus.length} processed (${success} ok, ${failed} failed)\r`);
  }

  console.log(`\n\nDone! ${success} addresses geocoded, ${failed} failed.`);
  console.log(`Total cached: ${existingKeys.size + success}`);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
