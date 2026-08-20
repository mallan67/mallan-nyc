// Phase 1 cleanup runner — executes phase1-cleanup.sql against Neon via Prisma.
// Handles the VACUUM FULL non-transactional constraint by splitting statements.
//
// Usage:
//   node --env-file=.env.local scripts/phase1-run.js --verify-only   # snapshot only
//   node --env-file=.env.local scripts/phase1-run.js --dry-run        # show plan, no execute
//   node --env-file=.env.local scripts/phase1-run.js --execute        # run the cleanup
//
// The --execute flag is required to make any changes. Without it, this only prints
// the current state of the 3 target tables so you can compare before/after.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const MODE = process.argv.find(a => a.startsWith('--')) || '--verify-only';

async function verify(label) {
  console.log(`\n━━━ ${label} ━━━`);

  const size = await prisma.$queryRawUnsafe(`
    SELECT pg_size_pretty(pg_database_size(current_database())) AS size
  `);
  console.log(`Database size: ${size[0].size}`);

  const nullCount = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::bigint AS c FROM listings WHERE status_changed_at IS NULL
  `);
  console.log(`status_changed_at NULL count: ${Number(nullCount[0].c)} / expected 0 after cleanup`);

  // RETENTION-ELIGIBLE TERMINALS — must mirror the wired cron
  // (app/api/cron/data-retention/route.ts TERMINAL_STATUSES) exactly, and it
  // did not: the cron carries the live Cotality spelling 'Canceled' (single L,
  // HTTP 200 re-probed 2026-08-20, stored verbatim by mapTrestleToPrisma) while
  // this runner kept only the Mallan CRM spelling 'Cancelled' (provider HTTP
  // 400). A verification script that UNDER-COUNTS is worse than no script: it
  // reports the retention backlog CLEAR while provider-cancelled rows sit in
  // it — it hides the very defect class it exists to detect.
  // 'Canceled' ADDED 2026-08-20.
  //
  // Canonical set: lib/compliance/listing-status-vocabulary.ts TERMINAL_STATUSES.
  // This CommonJS runner cannot require() a .ts module (no compile step), so
  // the literal is PINNED to the canonical set — and to its phase1-verify.sql
  // twin — by lib/compliance/__tests__/d9-coming-soon-status-closure.test.ts.
  const retention = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::bigint AS c FROM listings
    WHERE status IN ('Closed','Sold','Leased','Rented','Withdrawn','Expired','Cancelled','Canceled')
      AND status_changed_at IS NOT NULL
      AND status_changed_at < NOW() - INTERVAL '24 hours'
      AND idx_display_yn = true
  `);
  console.log(`Retention-eligible terminals (will be IDX-off'd on next cron): ${Number(retention[0].c)}`);

  const bloat = await prisma.$queryRawUnsafe(`
    SELECT relname AS table, n_live_tup::bigint AS live, n_dead_tup::bigint AS dead,
           COALESCE(ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 1), 0) AS dead_pct
    FROM pg_stat_user_tables
    WHERE relname IN ('listings', 'leads', 'social_proof_cache')
    ORDER BY relname
  `);
  console.table(bloat.map(r => ({
    table: r.table, live: Number(r.live), dead: Number(r.dead), dead_pct: r.dead_pct + '%',
  })));

  const sizes = await prisma.$queryRawUnsafe(`
    SELECT c.relname AS table,
           pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
           pg_size_pretty(COALESCE(pg_total_relation_size(c.reltoastrelid), 0)) AS toast_size
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN ('listings', 'leads', 'social_proof_cache')
    ORDER BY c.relname
  `);
  console.table(sizes);
}

async function execute() {
  console.log('\n━━━ EXECUTING PHASE 1 CLEANUP ━━━\n');

  // Step 1 — Backfill in a transaction
  console.log('Step 1: Backfilling status_changed_at...');
  const result = await prisma.$executeRawUnsafe(`
    UPDATE listings
    SET status_changed_at = COALESCE(modification_timestamp, updated_at, created_at)
    WHERE status_changed_at IS NULL
  `);
  console.log(`  Updated ${result} rows`);

  const verifyNull = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::bigint AS c FROM listings WHERE status_changed_at IS NULL
  `);
  if (Number(verifyNull[0].c) > 0) {
    console.error(`  ❌ BACKFILL INCOMPLETE: ${Number(verifyNull[0].c)} rows still NULL`);
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log('  ✓ All rows have status_changed_at set');

  // Step 2 — VACUUM FULL must run outside a transaction.
  // Prisma's $executeRawUnsafe auto-wraps in a transaction, so use a raw connection via $queryRawUnsafe
  // with the autocommit hint. In practice for Neon, we issue each VACUUM as its own $executeRawUnsafe
  // call — Prisma will auto-commit each statement independently.
  console.log('\nStep 2: VACUUM FULL on bloated tables...');
  console.log('  ⚠ This locks each table with ACCESS EXCLUSIVE for the duration.');
  console.log('  ⚠ Public listings pages + CRM will return errors during listings VACUUM (~30-60s).');

  const targets = ['listings', 'leads', 'social_proof_cache'];
  for (const t of targets) {
    const start = Date.now();
    process.stdout.write(`  VACUUM (FULL, ANALYZE) ${t}... `);
    try {
      await prisma.$executeRawUnsafe(`VACUUM (FULL, ANALYZE) ${t}`);
      console.log(`done (${((Date.now() - start) / 1000).toFixed(1)}s)`);
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
      throw e;
    }
  }

  console.log('\n  Refreshing audit_events stats...');
  await prisma.$executeRawUnsafe(`ANALYZE audit_events`);
  console.log('  ✓ Done');
}

async function main() {
  if (MODE === '--dry-run') {
    console.log('DRY RUN — showing current state, no changes will be made.');
    await verify('CURRENT STATE');
    console.log('\nTo execute: node --env-file=.env.local scripts/phase1-run.js --execute');
  } else if (MODE === '--verify-only') {
    await verify('CURRENT STATE');
  } else if (MODE === '--execute') {
    await verify('BEFORE');
    await execute();
    await verify('AFTER');
    console.log('\n✓ Phase 1 cleanup complete.');
    console.log('  Note: Neon billable storage may take up to 7 days to reflect the reclaim');
    console.log('  due to PITR branch retention on free tier.');
  } else {
    console.error(`Unknown mode: ${MODE}`);
    console.error('Usage: --verify-only | --dry-run | --execute');
    process.exit(1);
  }

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error('ERROR:', e);
  await prisma.$disconnect();
  process.exit(1);
});
