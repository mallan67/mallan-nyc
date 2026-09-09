#!/usr/bin/env node
/**
 * WITHDRAWN PROVENANCE INVENTORY — READ-ONLY. Writes nothing, relabels nothing.
 *
 * Why this exists (owner ruling, Maya 2026-09-09): Mallan's older reconciliation manufactured a `Withdrawn`
 * status when a listing simply disappeared from the licensed feed. The current reconciler no longer does that —
 * departure is a PRESENCE fact (`sync_status = 'off_feed'`, Mallan state "Off Market"), never a status — but it
 * also cannot repair the rows the old behaviour created: `lib/idx/reconcile-decision.ts` returns `departed_noop`
 * for an already-terminal row that is absent from the feed (`terminal '<db>' + absent — already hidden`). So every
 * previously invented Withdrawn stays Withdrawn indefinitely.
 *
 * This inventory classifies each stored Withdrawn row by the EVIDENCE that is actually on it, so the owner can
 * decide what (if anything) to correct. It never infers a new status and never writes.
 *
 *   provider_withdrawn   raw_data.StandardStatus = 'Withdrawn' — the PROVIDER said withdrawn. Correct as stored.
 *   dated_withdrawn      a retained WithdrawnDate — a real withdrawal event is evidenced.
 *   mallan_exclusive     an SL- / RL- listing id: a Mallan-authored exclusive an agent withdrew. Legitimate.
 *   inferred_no_evidence the row carries NO provider Withdrawn status and NO WithdrawnDate, and its last verified
 *                        provider status was an ON-MARKET one (Active / Pending / …). These are the suspect rows:
 *                        the status was manufactured on departure.
 *   no_provider_status   nothing retained to judge by — reported separately, never assumed either way.
 *   indeterminate        anything else — reported separately rather than folded into a bucket.
 *
 * NOTE on `mls_id`: it is NOT a provenance signal. Most provider rows in this database carry `mls_id IS NULL`
 * while having an `RLS…` listing id and full provider `raw_data`. An earlier cut of this inventory classified on
 * `mls_id` and undercounted the suspect population by an order of magnitude. The listing-id prefix plus the
 * retained provider status is the honest discriminator.
 *
 * Usage (read-only; requires DATABASE_URL):
 *   node --env-file-if-exists=.env.local --env-file-if-exists=.env scripts/audit/withdrawn-provenance-inventory.mjs [--json] [--limit N]
 *
 * The equivalent read-only SQL is printed with --sql so it can be run against Neon directly.
 */
import { PrismaClient } from '@prisma/client';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const limitArg = args.find((a) => a.startsWith('--limit='));
const SAMPLE = limitArg ? Number(limitArg.split('=')[1]) : 25;

export const INVENTORY_SQL = `
-- READ-ONLY. Classifies every stored Withdrawn row by the evidence on it.
WITH w AS (
  SELECT
    id, listing_id, mls_id, listing_type, sync_status, terminal_since, status_changed_at,
    raw_data->>'StandardStatus'   AS provider_status,
    raw_data->>'WithdrawnDate'    AS withdrawn_date,
    raw_data->>'OffMarketDate'    AS off_market_date,
    raw_data->>'CloseDate'        AS close_date
  FROM listings
  WHERE status IN ('Withdrawn')
)
SELECT
  CASE
    WHEN provider_status = 'Withdrawn'                              THEN 'provider_withdrawn'
    WHEN withdrawn_date IS NOT NULL                                 THEN 'dated_withdrawn'
    WHEN listing_id LIKE 'SL-%' OR listing_id LIKE 'RL-%'           THEN 'mallan_exclusive'
    WHEN provider_status IN ('Active','ActiveUnderContract','Pending','ComingSoon') THEN 'inferred_no_evidence'
    WHEN provider_status IS NULL                                    THEN 'no_provider_status'
    ELSE 'indeterminate'
  END AS provenance,
  listing_type,
  COUNT(*)                                   AS rows,
  MIN(status_changed_at)                     AS earliest_change,
  MAX(status_changed_at)                     AS latest_change,
  COUNT(*) FILTER (WHERE sync_status = 'off_feed') AS off_feed_rows
FROM w
GROUP BY 1, 2
ORDER BY 1, 2;
`;

if (args.includes('--sql')) {
  console.log(INVENTORY_SQL);
  process.exit(0);
}

const ON_MARKET = new Set(['Active', 'ActiveUnderContract', 'Pending', 'ComingSoon']);

function classify(row) {
  const raw = row.raw_data && typeof row.raw_data === 'object' ? row.raw_data : {};
  const providerStatus = typeof raw.StandardStatus === 'string' ? raw.StandardStatus : null;
  const id = String(row.listing_id ?? '');
  if (providerStatus === 'Withdrawn') return 'provider_withdrawn';
  if (raw.WithdrawnDate) return 'dated_withdrawn';
  if (id.startsWith('SL-') || id.startsWith('RL-')) return 'mallan_exclusive';
  if (providerStatus && ON_MARKET.has(providerStatus)) return 'inferred_no_evidence';
  if (!providerStatus) return 'no_provider_status';
  return 'indeterminate';
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.listing.findMany({
      where: { status: 'Withdrawn' },
      select: {
        id: true, listing_id: true, mls_id: true, listing_type: true, sync_status: true,
        terminal_since: true, status_changed_at: true, raw_data: true,
      },
    });

    const buckets = new Map();
    const samples = new Map();
    for (const row of rows) {
      const provenance = classify(row);
      const key = `${provenance}::${row.listing_type ?? 'unknown'}`;
      const b = buckets.get(key) ?? { provenance, listing_type: row.listing_type ?? 'unknown', rows: 0, off_feed: 0 };
      b.rows++;
      if (row.sync_status === 'off_feed') b.off_feed++;
      buckets.set(key, b);
      const s = samples.get(provenance) ?? [];
      if (s.length < SAMPLE) {
        const raw = row.raw_data && typeof row.raw_data === 'object' ? row.raw_data : {};
        s.push({
          listing_id: row.listing_id,
          mls_id: row.mls_id,
          listing_type: row.listing_type,
          sync_status: row.sync_status,
          provider_status: raw.StandardStatus ?? null,
          WithdrawnDate: raw.WithdrawnDate ?? null,
          OffMarketDate: raw.OffMarketDate ?? null,
          terminal_since: row.terminal_since,
          status_changed_at: row.status_changed_at,
        });
        samples.set(provenance, s);
      }
    }

    const report = {
      generated_at: new Date().toISOString(),
      read_only: true,
      total_withdrawn_rows: rows.length,
      buckets: [...buckets.values()].sort((a, b) => b.rows - a.rows),
      samples: Object.fromEntries(samples),
      note:
        'inferred_no_evidence rows carry NO provider Withdrawn status and NO withdrawal date; their last verified ' +
        'provider status was on-market. They are the candidates for correction. NOTHING is relabelled by this script: ' +
        'the owner decides, and any correction is a separate authorized production write.',
    };

    if (asJson) { console.log(JSON.stringify(report, null, 2)); return; }
    console.log(`\nWITHDRAWN PROVENANCE INVENTORY (read-only) — ${report.total_withdrawn_rows} stored Withdrawn rows\n`);
    console.log('  provenance             type     rows   off_feed');
    for (const b of report.buckets) {
      console.log(`  ${b.provenance.padEnd(22)} ${String(b.listing_type).padEnd(8)} ${String(b.rows).padStart(5)}   ${String(b.off_feed).padStart(6)}`);
    }
    console.log('\n  ' + report.note.replace(/\s+/g, ' ') + '\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
