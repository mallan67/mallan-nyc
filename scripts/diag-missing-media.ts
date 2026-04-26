// scripts/diag-missing-media.ts
//
// Targeted check — are the LIVE featured-listing rows in the DB empty,
// or does the DB have photos but the API is stripping/caching them?
//
// Queries the same listing IDs the /api/listings?sort=newest endpoint
// returned at diagnostic time. Fetches the RAW DB `media` column for
// each, plus a few other fields that could affect display gating.

import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: true });

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// The listing IDs from /api/listings?type=sale&boroughs=Manhattan
// &minPrice=500000&minBeds=1&limit=3&sort=newest (pulled 2026-04-24 07:41Z)
const TARGETS = ['RLS20086243', 'RLS20086252', 'RLS20086251'];

async function main() {
  for (const id of TARGETS) {
    const row = await prisma.listing.findFirst({
      where: { listing_id: id },
      select: {
        listing_id: true,
        mls_id: true,
        media: true,
        status: true,
        sync_status: true,
        owner_opt_out: true,
        participant_only: true,
        internet_entire_listing_display_yn: true,
        idx_display_yn: true,
        agent_id: true,
        modification_timestamp: true,
      },
    });
    console.log('━━━', id, '━━━');
    if (!row) { console.log('  NOT FOUND IN DB'); continue; }
    const m = row.media as unknown;
    const mediaInfo = Array.isArray(m)
      ? `ARRAY length=${m.length}` + (m.length ? ` firstUrl=${String((m[0] as { url?: string }).url).slice(0, 80)}` : '')
      : m === null ? 'NULL'
      : typeof m === 'object' ? `OBJECT keys=${Object.keys(m as Record<string, unknown>).join(',')}`
      : `type=${typeof m}`;
    console.log(`  media:                 ${mediaInfo}`);
    console.log(`  mls_id:                ${row.mls_id || 'NULL'}`);
    console.log(`  status:                ${row.status}`);
    console.log(`  sync_status:           ${row.sync_status || 'NULL'}`);
    console.log(`  owner_opt_out:         ${row.owner_opt_out}`);
    console.log(`  participant_only:      ${row.participant_only}`);
    console.log(`  internet_entire_disp:  ${row.internet_entire_listing_display_yn}`);
    console.log(`  idx_display_yn:        ${row.idx_display_yn}`);
    console.log(`  agent_id:              ${row.agent_id || 'NULL'}`);
    console.log(`  mod_timestamp:         ${row.modification_timestamp?.toISOString() || 'NULL'}`);
  }

  // Also: how many listings STILL have empty media right now?
  const counts = await prisma.$queryRaw<{ cnt: bigint; kind: string }[]>`
    SELECT COUNT(*)::bigint AS cnt, 'array_nonempty' AS kind
      FROM listings
      WHERE jsonb_typeof(media) = 'array' AND jsonb_array_length(media) > 0
    UNION ALL
    SELECT COUNT(*)::bigint AS cnt, 'array_empty'
      FROM listings
      WHERE jsonb_typeof(media) = 'array' AND jsonb_array_length(media) = 0
    UNION ALL
    SELECT COUNT(*)::bigint AS cnt, 'object'
      FROM listings
      WHERE jsonb_typeof(media) = 'object'
    UNION ALL
    SELECT COUNT(*)::bigint AS cnt, 'null'
      FROM listings
      WHERE media IS NULL
  `;
  console.log('\n━━━ GLOBAL MEDIA STATE ━━━');
  for (const r of counts) console.log(`  ${r.kind.padEnd(18)} ${r.cnt}`);

  await prisma.$disconnect();
}

main()
  .then(() => process.exit(0))
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
