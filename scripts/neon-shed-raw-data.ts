#!/usr/bin/env tsx
/**
 * neon-shed-raw-data — One-shot backfill that slims existing raw_data on
 * Trestle-imported listings to the keep set. Idempotent and re-runnable.
 *
 * The Trestle sync writer (lib/idx/trestle-mapper.ts) already slims raw_data
 * for any NEW or UPDATED Trestle row. This script applies the same slim to
 * rows that pre-date the writer change.
 *
 * SAFETY:
 *   - Default mode is --audit-only: prints projected savings, no DB writes.
 *   - --execute is explicit and required to actually mutate.
 *   - Only touches rows where last_synced_from_trestle IS NOT NULL — the
 *     deterministic signal that this row's raw_data was last written by the
 *     Trestle mapper (set by lib/idx/sync.ts main loop, syncAgentHistory,
 *     feed-reconcile, AND reset-sync — covers every programmatic Trestle
 *     write path, including agent-linked imports). Pure CRM-created
 *     listings never have this column populated and are skipped.
 *   - Idempotent — re-running on already-slimmed rows is a no-op (slimRawData
 *     is fixed-point) and writes only if the JSON output differs.
 *   - Batched (default 500/run) so a long execute is interruptible.
 *
 * Usage:
 *   # Dry run — projects savings, no DB writes:
 *   npx tsx scripts/neon-shed-raw-data.ts
 *
 *   # Execute on all Trestle-imported rows:
 *   npx tsx scripts/neon-shed-raw-data.ts --execute
 *
 *   # Execute in batches (interruptible):
 *   npx tsx scripts/neon-shed-raw-data.ts --execute --batch=500 --max-batches=20
 *
 *   # Limit to a sample (for staging / safety):
 *   npx tsx scripts/neon-shed-raw-data.ts --execute --limit=100
 */
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { slimRawData } from '@/lib/compliance/raw-data-keep-fields';

const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const BATCH = Number(args.find((a) => a.startsWith('--batch='))?.split('=')[1] ?? 500);
const MAX_BATCHES = Number(
  args.find((a) => a.startsWith('--max-batches='))?.split('=')[1] ?? Infinity
);
const LIMIT = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? Infinity);

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

interface RowSlim {
  id: bigint;
  raw_data: unknown;
}

async function main() {
  const mode = EXECUTE ? 'EXECUTE' : 'AUDIT-ONLY';
  console.log(`\n[neon-shed-raw-data] mode=${mode} batch=${BATCH} limit=${LIMIT}\n`);

  if (!EXECUTE) {
    console.log(
      '  (dry-run: no rows will be written. Re-run with --execute to apply.)\n'
    );
  }

  const totalEligible = await prisma.listing.count({
    where: { last_synced_from_trestle: { not: null } },
  });
  console.log(
    `Trestle-imported listings (last_synced_from_trestle IS NOT NULL): ` +
      `${totalEligible.toLocaleString()}`
  );

  let processed = 0;
  let mutated = 0;
  let skippedNoOp = 0;
  let totalBytesBefore = 0;
  let totalBytesAfter = 0;
  let batchNumber = 0;
  let cursor: bigint | null = null;

  // Use cursor pagination on PK so we don't re-fetch as rows mutate.
  while (processed < totalEligible && processed < LIMIT && batchNumber < MAX_BATCHES) {
    batchNumber += 1;
    const remaining = Math.min(BATCH, LIMIT - processed);
    const rows: RowSlim[] = await prisma.$queryRaw`
      SELECT id, raw_data
      FROM listings
      WHERE last_synced_from_trestle IS NOT NULL
        AND raw_data IS NOT NULL
        ${cursor !== null ? Prisma.sql`AND id > ${cursor}` : Prisma.empty}
      ORDER BY id ASC
      LIMIT ${remaining}
    `;
    if (rows.length === 0) break;

    for (const row of rows) {
      processed += 1;
      const before = row.raw_data as Record<string, unknown> | null;
      if (!before) continue;
      const after = slimRawData(before);
      const beforeJson = JSON.stringify(before);
      const afterJson = JSON.stringify(after);
      totalBytesBefore += beforeJson.length;
      totalBytesAfter += afterJson.length;

      if (beforeJson === afterJson) {
        skippedNoOp += 1;
        continue;
      }
      mutated += 1;
      if (EXECUTE) {
        await prisma.listing.update({
          where: { id: row.id },
          data: { raw_data: after as Prisma.InputJsonValue },
        });
      }
    }

    cursor = rows[rows.length - 1]!.id;
    const saved = totalBytesBefore - totalBytesAfter;
    console.log(
      `  batch ${batchNumber}: processed=${processed} mutated=${mutated} ` +
        `noop=${skippedNoOp} savings=${fmtBytes(saved)}`
    );
  }

  console.log('\n── Summary ───────────────────────────────────────────────');
  console.log(`  Rows examined:        ${processed.toLocaleString()}`);
  console.log(`  Rows ${EXECUTE ? 'mutated' : 'would mutate'}: ${mutated.toLocaleString()}`);
  console.log(`  Rows already slim:    ${skippedNoOp.toLocaleString()}`);
  console.log(`  Bytes before:         ${fmtBytes(totalBytesBefore)}`);
  console.log(`  Bytes after:          ${fmtBytes(totalBytesAfter)}`);
  const savings = totalBytesBefore - totalBytesAfter;
  console.log(
    `  Bytes ${EXECUTE ? 'saved' : 'WOULD save'}:         ${fmtBytes(savings)}` +
      (totalBytesBefore > 0
        ? ` (${((savings / totalBytesBefore) * 100).toFixed(1)}%)`
        : '')
  );
  if (!EXECUTE) {
    console.log('\n  Re-run with --execute to apply the changes.');
  }
  console.log();

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect().finally(() => process.exit(1));
});
