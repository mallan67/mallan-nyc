// scripts/fix-malformed-media.js
//
// Fixes production rows where `listings.media` is stored as a summary
// object (e.g. `{"PhotosCount": 36, "VideosCount": 0, ...}`) instead of
// an array of photo objects. See lib/idx/trestle-mapper.ts for the root
// cause (fixed same commit as this script). After the mapper fix, every
// future sync produces the correct array shape — but existing DB rows
// need cleanup.
//
// Strategy: set malformed rows to `[]`. The `/api/cron/media-backfill`
// cron (runs every 15 min) detects empty arrays and refetches photos
// from Trestle via the Media resource, writing the correct array shape.
// So reset is a no-lose operation — we temporarily show "No Photo"
// on affected listings until the next backfill cycle completes, then
// they come back with real photos.
//
// Usage:
//   node --env-file=.env.local scripts/fix-malformed-media.js --verify-only
//   node --env-file=.env.local scripts/fix-malformed-media.js --execute

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const MODE = process.argv.find((a) => a.startsWith('--')) || '--verify-only';

async function inspect(label) {
  console.log(`\n━━━ ${label} ━━━`);
  const row = await prisma.$queryRawUnsafe(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'Active' AND listing_type = 'sale') AS total_sale_active,
      COUNT(*) FILTER (WHERE status = 'Active' AND listing_type = 'sale' AND jsonb_typeof(media) = 'array') AS media_is_array,
      COUNT(*) FILTER (WHERE status = 'Active' AND listing_type = 'sale' AND jsonb_typeof(media) = 'object') AS media_is_object,
      COUNT(*) FILTER (WHERE jsonb_typeof(media) = 'object') AS any_status_media_is_object
    FROM listings
  `);
  for (const [k, v] of Object.entries(row[0])) {
    console.log('  ' + k.padEnd(28) + ' ' + v);
  }
  return row[0];
}

async function main() {
  const before = await inspect('BEFORE');

  if (MODE === '--verify-only') {
    console.log('\n(--verify-only — no changes)');
    console.log('Run with --execute to reset malformed rows.');
    await prisma.$disconnect();
    return;
  }

  if (MODE !== '--execute') {
    console.error(`Unknown mode: ${MODE}. Use --verify-only | --execute`);
    await prisma.$disconnect();
    process.exit(1);
  }

  // Safety cap — refuse to run if > 20,000 rows would be touched.
  const totalMalformed = Number(before.any_status_media_is_object);
  if (totalMalformed > 20000) {
    console.error(`ABORT: ${totalMalformed} rows would be reset — exceeds safety cap.`);
    await prisma.$disconnect();
    process.exit(2);
  }

  console.log(`\n━━━ EXECUTING — resetting ${totalMalformed} rows to media = '[]' ━━━`);
  const result = await prisma.$executeRawUnsafe(`
    UPDATE listings
    SET media = '[]'::jsonb
    WHERE jsonb_typeof(media) = 'object'
  `);
  console.log(`  Updated ${result} rows`);

  await inspect('AFTER');

  console.log('\n✓ Malformed media reset to empty arrays.');
  console.log('  The media-backfill cron (every 15 min) will repopulate them');
  console.log('  with real photo arrays from Trestle over the next few cycles.');
  console.log('  To force immediate repopulation, hit /api/cron/media-backfill.');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('FATAL:', e);
  await prisma.$disconnect();
  process.exit(3);
});
