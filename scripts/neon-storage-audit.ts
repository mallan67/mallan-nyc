#!/usr/bin/env tsx
/**
 * neon-storage-audit — Read-only inspection of where Neon storage is
 * actually going. Sister to scripts/neon-listings-deep.ts and
 * scripts/ops-health.js (which only reports topline numbers).
 *
 * Output:
 *   - Top 10 tables by size
 *   - For listings: average raw_data size + projected savings if every
 *     row were slimmed via slimRawData()
 *   - Histogram of the largest raw_data fields across a sample
 *
 * SAFETY: this script is strictly read-only — no UPDATE/DELETE/INSERT.
 * Run any time without coordination.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx scripts/neon-storage-audit.ts
 *   DATABASE_URL=postgres://... npx tsx scripts/neon-storage-audit.ts --sample=500
 */
import prisma from '@/lib/prisma';
import {
  RAW_DATA_KEEP_FIELDS,
  RAW_DATA_KEEP_SET,
  projectShedSavings,
} from '@/lib/compliance/raw-data-keep-fields';

const args = process.argv.slice(2);
const sampleArg = args.find((a) => a.startsWith('--sample='));
const SAMPLE = sampleArg ? Number(sampleArg.split('=')[1]) : 1000;

interface TableSize {
  table_name: string;
  total_bytes: bigint;
  row_count: bigint;
}

interface ListingRow {
  id: bigint;
  agent_id: bigint | null;
  raw_data: unknown;
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

/**
 * Retry transient Prisma/Neon errors with exponential backoff. Mirrors
 * the helper in scripts/neon-shed-raw-data.ts — Neon free-tier compute
 * auto-suspends, so the first query after a quiet period can fail with
 * `Can't reach database server` before cold-start completes.
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
  console.log('\n═══ Neon Storage Audit ═══════════════════════════════════════\n');

  // ── Top tables by bytes ─────────────────────────────────────────────
  const topTables = await withRetry(
    'top-tables',
    () => prisma.$queryRaw<TableSize[]>`
      SELECT
        relname AS table_name,
        pg_total_relation_size(c.oid) AS total_bytes,
        reltuples::bigint AS row_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
      ORDER BY pg_total_relation_size(c.oid) DESC
      LIMIT 10
    `
  );
  console.log('── Top 10 tables by size ─────────────────────────────────────');
  for (const t of topTables) {
    const bytes = Number(t.total_bytes);
    const rows = Number(t.row_count);
    const avg = rows > 0 ? bytes / rows : 0;
    console.log(
      `  ${t.table_name.padEnd(38)} ${fmtBytes(bytes).padStart(10)}   ` +
        `(${rows.toLocaleString()} rows, ${fmtBytes(avg)}/row)`
    );
  }

  // ── Sample listings.raw_data composition ───────────────────────────
  // The Trestle mapper (lib/idx/trestle-mapper.ts mapTrestleToPrisma) is the
  // ONLY code path that sets last_synced_from_trestle. The CRM POST route
  // never sets it. So this column is the deterministic signal for "this
  // row's raw_data was last written by the Trestle mapper" — covering
  // - lib/idx/sync.ts main loop AND syncAgentHistory (both set it)
  // - app/api/cron/feed-reconcile/route.ts (sets it via mapped.* spread)
  // Filtering on agent_id IS NULL would miss Trestle imports that have an
  // agent linked (per Codex review on PR #75 — the syncAgentHistory
  // paths both produce agent-linked Trestle rows).
  console.log(`\n── Sampling ${SAMPLE} Trestle-imported listings (last_synced_from_trestle IS NOT NULL) ──`);
  const trestleSample = await withRetry(
    'trestle-sample',
    () => prisma.$queryRaw<ListingRow[]>`
      SELECT id, agent_id, raw_data
      FROM listings
      WHERE last_synced_from_trestle IS NOT NULL
        AND raw_data IS NOT NULL
      ORDER BY random()
      LIMIT ${SAMPLE}
    `
  );
  if (trestleSample.length === 0) {
    console.log('  (no Trestle-imported rows with raw_data found)');
  } else {
    let totalKept = 0;
    let totalDropped = 0;
    const droppedFieldFreq = new Map<string, { count: number; bytes: number }>();
    for (const row of trestleSample) {
      const raw = row.raw_data as Record<string, unknown> | null;
      const r = projectShedSavings(raw);
      totalKept += r.keptBytes;
      totalDropped += r.droppedBytes;
      if (raw) {
        for (const f of r.droppedFields) {
          const existing = droppedFieldFreq.get(f) ?? { count: 0, bytes: 0 };
          existing.count += 1;
          existing.bytes += JSON.stringify(raw[f] ?? null).length;
          droppedFieldFreq.set(f, existing);
        }
      }
    }
    const avgKept = totalKept / trestleSample.length;
    const avgDropped = totalDropped / trestleSample.length;
    const avgTotal = avgKept + avgDropped;
    const pctDropped = avgTotal > 0 ? (avgDropped / avgTotal) * 100 : 0;

    console.log(`  Sampled rows:               ${trestleSample.length}`);
    console.log(`  Avg raw_data size:          ${fmtBytes(avgTotal)}`);
    console.log(`  Avg KEEP bytes (post-shed): ${fmtBytes(avgKept)}`);
    console.log(`  Avg DROP bytes (sheddable): ${fmtBytes(avgDropped)}`);
    console.log(`  % sheddable:                ${pctDropped.toFixed(1)}%`);

    // Project total savings across all Trestle-imported listings
    const totalTrestleCount = await withRetry('trestle-count', () =>
      prisma.listing.count({ where: { last_synced_from_trestle: { not: null } } })
    );
    const projectedSavings = avgDropped * totalTrestleCount;
    console.log(`  Trestle-imported total:     ${totalTrestleCount.toLocaleString()} rows`);
    console.log(
      `  Projected total savings:    ${fmtBytes(projectedSavings)}` +
        ` (assuming sample is representative)`
    );

    // ── Top 15 dropped fields by total bytes ─────────────────────────
    console.log('\n── Top 15 sheddable fields (by total bytes in sample) ──');
    const sortedDropped = [...droppedFieldFreq.entries()]
      .sort((a, b) => b[1].bytes - a[1].bytes)
      .slice(0, 15);
    for (const [field, info] of sortedDropped) {
      const avgPerRow = info.bytes / info.count;
      console.log(
        `  ${field.padEnd(40)} ${fmtBytes(info.bytes).padStart(10)} total · ` +
          `${fmtBytes(avgPerRow)}/row · ${info.count}/${trestleSample.length} rows`
      );
    }
  }

  // ── CRM-created listings (full payload, NOT slimmed) ───────────────
  // CRM-only listings = never been Trestle-synced. agent_id alone is
  // ambiguous (syncAgentHistory produces agent-linked provider
  // rows), so we filter on the absence of last_synced_from_trestle.
  const crmCount = await withRetry('crm-count', () =>
    prisma.listing.count({ where: { last_synced_from_trestle: null } })
  );
  console.log(
    `\n── CRM-only listings (never Trestle-synced): ${crmCount.toLocaleString()} rows ` +
      `(raw_data is NOT slimmed for these — preserves full form payload)`
  );

  // ── Keep-set summary ───────────────────────────────────────────────
  console.log(
    `\n── Keep set: ${RAW_DATA_KEEP_FIELDS.length} fields (${RAW_DATA_KEEP_SET.size} unique) ──`
  );
  console.log('  See lib/compliance/raw-data-keep-fields.ts for the full list.\n');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect().finally(() => process.exit(1));
});
