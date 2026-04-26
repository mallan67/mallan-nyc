// scripts/diag-trestle-media.ts
//
// Diagnose why backfill is getting 400 Bad Request from Trestle.
// Picks one listing with empty media, makes a MINIMAL single-listing
// Media query, and dumps the full response body.
//
// Usage: npx tsx scripts/diag-trestle-media.ts

import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';

// Load .env.local using dotenv's quote-aware parser (mirrors prisma.config.ts).
// Avoids PowerShell quote-preservation issues when env vars were loaded via
// a shell-side loop instead of `node --env-file=`.
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: true });

import { PrismaClient } from '@prisma/client';
import { getAccessToken } from '../lib/idx/auth';

const prisma = new PrismaClient();

async function main() {
  const TRESTLE_API = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';
  console.log('Trestle base:', TRESTLE_API);

  // Get one listing with empty media
  const rows = await prisma.$queryRaw<{ listing_id: string; mls_id: string | null }[]>`
    SELECT listing_id, mls_id FROM "listings"
    WHERE status = 'Active' AND listing_type = 'sale'
    LIMIT 5
  `;
  console.log('\nSample 5 listings from DB:');
  for (const r of rows) console.log(' ', { listing_id: r.listing_id, mls_id: r.mls_id });

  const sample = rows[0];
  if (!sample) { console.log('No listings found'); return; }

  const token = await getAccessToken();
  console.log('\nToken acquired, length:', token.length);

  // Test 1: Single ResourceRecordKey, no $orderby, no $top
  const key = sample.mls_id || sample.listing_id;
  const keyField = sample.mls_id ? 'ResourceRecordKey' : 'ResourceRecordID';
  console.log(`\n─── TEST 1: Minimal — ${keyField} eq '${key}' ───`);
  {
    const url = `${TRESTLE_API}/odata/Media?$filter=${encodeURIComponent(`${keyField} eq '${key}'`)}&$top=5`;
    console.log('URL:', url);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    console.log('Status:', res.status, res.statusText);
    const body = await res.text();
    console.log('Body (first 500 chars):', body.slice(0, 500));
  }

  // Test 2: With $select and $orderby
  console.log(`\n─── TEST 2: With $select and $orderby ───`);
  {
    const params = new URLSearchParams();
    params.set('$filter', `${keyField} eq '${key}'`);
    params.set('$select', 'ResourceRecordKey,ResourceRecordID,MediaURL,MediaCategory,Order,PreferredPhotoYN');
    params.set('$orderby', 'Order asc');
    params.set('$top', '30');
    const url = `${TRESTLE_API}/odata/Media?${params.toString()}`;
    console.log('URL:', url);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    console.log('Status:', res.status, res.statusText);
    const body = await res.text();
    console.log('Body (first 800 chars):', body.slice(0, 800));
  }

  // Test 3: Paren-wrapped (backfill style)
  console.log(`\n─── TEST 3: Paren-wrapped filter (backfill style) ───`);
  {
    const params = new URLSearchParams();
    params.set('$filter', `(${keyField} eq '${key}')`);
    params.set('$select', 'ResourceRecordKey,ResourceRecordID,MediaURL,MediaCategory,Order,PreferredPhotoYN');
    params.set('$orderby', 'Order asc');
    params.set('$top', '30');
    const url = `${TRESTLE_API}/odata/Media?${params.toString()}`;
    console.log('URL:', url);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    console.log('Status:', res.status, res.statusText);
    const body = await res.text();
    console.log('Body (first 800 chars):', body.slice(0, 800));
  }

  // Test 4: Does the Property itself exist on Trestle?
  console.log(`\n─── TEST 4: Does Property exist on Trestle? ───`);
  {
    const propKeyField = sample.mls_id ? 'ListingKey' : 'ListingId';
    const params = new URLSearchParams();
    params.set('$filter', `${propKeyField} eq '${key}'`);
    params.set('$select', 'ListingKey,ListingId,ListPrice,StandardStatus,PhotosCount');
    const url = `${TRESTLE_API}/odata/Property?${params.toString()}`;
    console.log('URL:', url);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    console.log('Status:', res.status, res.statusText);
    const body = await res.text();
    console.log('Body (first 500 chars):', body.slice(0, 500));
  }

  await prisma.$disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error('FATAL:', e); process.exit(1); });
