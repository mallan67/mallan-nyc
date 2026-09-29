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
 *     and feed-reconcile — covers every programmatic Cotality
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

/**
 * Retry transient Prisma/Neon errors with exponential backoff. Neon
 * serverless free-tier compute auto-suspends after inactivity; the first
 * query after a quiet period can fail with `Can't reach database server`
 * before the cold-start completes. Without this wrapper the entire
 * backfill aborts on the first such hiccup.
 */
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const transient =
        msg.includes("Can't reach database server") ||
        msg.includes('Connection terminated') ||
        msg.includes('connection closed') ||
        msg.includes('ECONNRESET') ||
        msg.includes('ETIMEDOUT');
      if (!transient || attempt === maxAttempts) throw e;
      const waitMs = attempt * 2000;
      console.warn(
        `  [${label}] attempt ${attempt}/${maxAttempts} failed (${msg.split('\n')[0]}); ` +
          `retrying in ${waitMs}ms`
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw new Error('unreachable');
}

async function main() {
  const mode = EXECUTE ? 'EXECUTE' : 'AUDIT-ONLY';
  console.log(`\n[neon-shed-raw-data] mode=${mode} batch=${BATCH} limit=${LIMIT}\n`);

  if (!EXECUTE) {
    console.log(
      '  (dry-run: no rows will be written. Re-run with --execute to apply.)\n'
    );
  }

  const totalEligible = await withRetry('count', () =>
    prisma.listing.count({ where: { last_synced_from_trestle: { not: null } } })
  );
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
    const rows: RowSlim[] = await withRetry(
      `select batch ${batchNumber}`,
      () => prisma.$queryRaw`
        SELECT id, raw_data
        FROM listings
        WHERE last_synced_from_trestle IS NOT NULL
          AND raw_data IS NOT NULL
          ${cursor !== null ? Prisma.sql`AND id > ${cursor}` : Prisma.empty}
        ORDER BY id ASC
        LIMIT ${remaining}
      `
    );
    if (rows.length === 0) break;

    interface PendingUpdate {
      id: bigint;
      afterJson: string;
    }
    const pendingUpdates: PendingUpdate[] = [];
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
      pendingUpdates.push({ id: row.id, afterJson });
    }

    if (EXECUTE && pendingUpdates.length > 0) {
      // Single bulk UPDATE FROM VALUES — one network round-trip per batch.
      // Sequential per-row updates were ~0.8 rows/sec on Neon free-tier
      // serverless because round-trip latency dominates per-statement cost;
      // bulk SQL collapses 500 round-trips into 1 (~50× speedup observed
      // on the 2026-04-28 production run). Atomic per batch — partial
      // failures roll back the batch only, and the next run resumes from
      // the cursor since slimRawData is idempotent.
      const valueRows = pendingUpdates.map(
        (u) => Prisma.sql`(${u.id}::bigint, ${u.afterJson}::jsonb)`
      );
      await withRetry(
        `update batch ${batchNumber}`,
        () => prisma.$executeRaw`
          UPDATE listings AS l
          SET raw_data = v.new_data
          FROM (VALUES ${Prisma.join(valueRows, ', ')}) AS v(id, new_data)
          WHERE l.id = v.id
        `
      );
    }

    cursor = rows[rows.length - 1]!.id;
    const saved = totalBytesBefore - totalBytesAfter;
    process.stdout.write(
      `  batch ${batchNumber}: processed=${processed} mutated=${mutated} ` +
        `noop=${skippedNoOp} savings=${fmtBytes(saved)}\n`
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
