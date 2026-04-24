// scripts/backfill-media-now.ts
//
// One-shot media backfill. Inline implementation (doesn't use
// backfillEmptyMedia from sync.ts) because sync.ts uses BATCH_SIZE=50
// which produces URLs >2,700 chars that Trestle rejects with 400
// Bad Request. This script uses BATCH_SIZE=15 which keeps URLs
// under ~1,000 chars.
//
// Usage: npx tsx scripts/backfill-media-now.ts

import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';

dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: true });

import { PrismaClient, Prisma } from '@prisma/client';
import { getAccessToken } from '../lib/idx/auth';

const prisma = new PrismaClient();

const TRESTLE_API = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';
const PASS_LIMIT = 500;          // listings per DB query
const BATCH_SIZE = 15;           // listings per Trestle Media call (URL budget)
const MAX_PASSES = 50;           // safety brake

type MediaEntry = { url: string; mediaType: string; order: number };

function classify(cat: string): MediaEntry['mediaType'] {
  const c = cat.toLowerCase();
  if (c.includes('floor plan') || c.includes('floorplan')) return 'FloorPlan';
  if (c.includes('video')) return 'Video';
  if (c.includes('virtual tour')) return 'VirtualTour';
  return 'Photo';
}

async function fetchMediaForBatch(
  token: string,
  batch: { listing_id: string; mls_id: string | null }[],
): Promise<{ byListingId: Map<string, MediaEntry[]>; batchError: boolean }> {
  const keyToId = new Map<string, string>();
  const filterParts: string[] = [];
  for (const l of batch) {
    if (l.mls_id) {
      filterParts.push(`ResourceRecordKey eq '${l.mls_id.replace(/'/g, "''")}'`);
      keyToId.set(l.mls_id, l.listing_id);
    } else if (l.listing_id) {
      filterParts.push(`ResourceRecordID eq '${l.listing_id.replace(/'/g, "''")}'`);
      keyToId.set(l.listing_id, l.listing_id);
    }
  }
  if (filterParts.length === 0) return { byListingId: new Map(), batchError: false };

  const params = new URLSearchParams();
  params.set('$filter', `(${filterParts.join(' or ')})`);
  params.set('$select', 'ResourceRecordKey,ResourceRecordID,MediaURL,MediaCategory,Order,PreferredPhotoYN');
  params.set('$orderby', 'Order asc');
  params.set('$top', String(filterParts.length * 30));

  const url = `${TRESTLE_API}/odata/Media?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text();
    console.warn(`  ⚠ Batch failed: ${res.status} ${res.statusText} (URL len=${url.length})`);
    console.warn(`    Body: ${body.slice(0, 200)}`);
    return { byListingId: new Map(), batchError: true };
  }
  const data = (await res.json()) as { value?: Record<string, unknown>[] };

  // Group by whichever key lets us look up a listing_id — Trestle responses
  // include BOTH ResourceRecordKey AND ResourceRecordID for every media row.
  // We populated keyToId with the specific field we filtered by (Key when
  // mls_id present, ID when mls_id NULL), so we must try BOTH on lookup or
  // we'd miss rows whose matching key is the "other" field.
  const byListingId = new Map<string, MediaEntry[]>();
  for (const m of data.value || []) {
    const k = String(m.ResourceRecordKey || '');
    const rrid = String(m.ResourceRecordID || '');
    const listingId = keyToId.get(k) || keyToId.get(rrid);
    if (!listingId || !m.MediaURL) continue;
    const cat = String(m.MediaCategory || '');
    const isPreferred = m.PreferredPhotoYN === true || m.PreferredPhotoYN === 'true';
    if (!byListingId.has(listingId)) byListingId.set(listingId, []);
    byListingId.get(listingId)!.push({
      url: String(m.MediaURL),
      mediaType: classify(cat),
      order: isPreferred ? -1 : Number(m.Order ?? 0),
    });
  }
  return { byListingId, batchError: false };
}

async function writeMedia(listingId: string, media: MediaEntry[]) {
  await prisma.listing.updateMany({
    where: { listing_id: listingId },
    data: { media: media as unknown as Prisma.InputJsonValue },
  });
}

async function onePass(passNum: number): Promise<{ checked: number; updated: number; errors: number }> {
  const listings = await prisma.$queryRaw<{ listing_id: string; mls_id: string | null }[]>`
    SELECT listing_id, mls_id FROM "listings"
    WHERE (
        media IS NULL
        OR jsonb_typeof(media) != 'array'
        OR jsonb_array_length(media) = 0
      )
      AND sync_status IS DISTINCT FROM 'gated:owner_opt_out'
      AND sync_status IS DISTINCT FROM 'gated:participant_only'
    ORDER BY modification_timestamp DESC NULLS LAST
    LIMIT ${PASS_LIMIT}
  `;

  if (listings.length === 0) return { checked: 0, updated: 0, errors: 0 };

  const token = await getAccessToken();
  let updated = 0;
  let errors = 0;
  let batchNum = 0;

  for (let i = 0; i < listings.length; i += BATCH_SIZE) {
    batchNum++;
    const batch = listings.slice(i, i + BATCH_SIZE);
    const { byListingId, batchError } = await fetchMediaForBatch(token, batch);
    if (batchError) {
      errors += batch.length;
      continue;
    }

    for (const l of batch) {
      const media = byListingId.get(l.listing_id) || [];
      try {
        await writeMedia(l.listing_id, media);
        updated++;
      } catch (e) {
        errors++;
        console.warn(`  ⚠ Write failed for ${l.listing_id}:`, e instanceof Error ? e.message : e);
      }
    }
  }

  console.log(`  batches=${batchNum}`);
  return { checked: listings.length, updated, errors };
}

async function main() {
  const START = Date.now();
  let passNum = 0;
  let totalChecked = 0, totalUpdated = 0, totalErrors = 0;

  console.log('━━━ One-shot media backfill (inline, BATCH_SIZE=15) ━━━');
  console.log(`Trestle: ${TRESTLE_API}`);
  console.log(`Starting at ${new Date().toISOString()}`);

  while (passNum < MAX_PASSES) {
    passNum++;
    const pass = await onePass(passNum);
    totalChecked += pass.checked;
    totalUpdated += pass.updated;
    totalErrors += pass.errors;

    const elapsed = ((Date.now() - START) / 1000).toFixed(1);
    console.log(
      `Pass ${passNum}: checked=${pass.checked} updated=${pass.updated} errors=${pass.errors} | cumulative: updated=${totalUpdated} errors=${totalErrors} | ${elapsed}s`
    );

    if (pass.checked === 0) {
      console.log('\n✓ No more listings with empty media — done.');
      break;
    }
  }

  if (passNum >= MAX_PASSES) {
    console.log(`\n⚠ Hit safety cap of ${MAX_PASSES} passes. Re-run to continue.`);
  }

  const totalSec = ((Date.now() - START) / 1000).toFixed(1);
  console.log(`\n━━━ FINAL ━━━`);
  console.log(`  passes:  ${passNum}`);
  console.log(`  checked: ${totalChecked}`);
  console.log(`  updated: ${totalUpdated}`);
  console.log(`  errors:  ${totalErrors}`);
  console.log(`  seconds: ${totalSec}`);

  await prisma.$disconnect();
}

main()
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error('FATAL:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
