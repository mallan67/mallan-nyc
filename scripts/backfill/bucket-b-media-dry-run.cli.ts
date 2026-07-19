#!/usr/bin/env tsx
// scripts/backfill/bucket-b-media-dry-run.cli.ts
//
// tsx entry point for the READ-ONLY, BOUNDED Bucket-B dry-run planner. Run via:
//   npm run media:backfill:dryrun -- --max-listings 500 --max-requests 300
//   npm run media:backfill:dryrun -- --json
//
// Same explicit bounds as the audit CLI (--page-size, --max-listings,
// --max-probes, --max-requests, --concurrency, --timeout-ms, --retries,
// --time-budget-ms). Reaching ANY limit ⇒ INCOMPLETE (exit 2). NEVER writes —
// no apply flag exists. Credentials/tokens/headers are NEVER printed.

import { pathToFileURL } from 'node:url';
import prisma from '@/lib/prisma';
import {
  runDryRun, ROLLBACK_NOTE,
  type DryRunDeps, type DryRunListingRow, type AllStatusRow,
} from './bucket-b-media-dry-run';
import { DEFAULT_BUDGETS, type AuditBudgets } from '../audit/media-coverage-audit';
import { buildCotalityReader } from '../audit/media-coverage-audit.cli';
import type { ListingMediaTableRow } from '@/lib/media/listing-media-resolver';

function intFlag(args: string[], name: string, fallback: number): number {
  const i = args.indexOf(name);
  const v = i >= 0 ? Number(args[i + 1]) : NaN;
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const budgets: AuditBudgets = {
    pageSize: intFlag(args, '--page-size', DEFAULT_BUDGETS.pageSize),
    maxListings: intFlag(args, '--max-listings', DEFAULT_BUDGETS.maxListings),
    maxCotalityProbes: intFlag(args, '--max-probes', DEFAULT_BUDGETS.maxCotalityProbes),
    maxCotalityRequests: intFlag(args, '--max-requests', DEFAULT_BUDGETS.maxCotalityRequests),
    cotalityConcurrency: intFlag(args, '--concurrency', DEFAULT_BUDGETS.cotalityConcurrency),
    maxMediaPagesPerListing: DEFAULT_BUDGETS.maxMediaPagesPerListing,
    runTimeBudgetMs: intFlag(args, '--time-budget-ms', DEFAULT_BUDGETS.runTimeBudgetMs),
  };
  const counters = { requests: 0, successes: 0, failures: 0, retries: 0, skipped: 0 };

  const deps: DryRunDeps = {
    // READ-ONLY keyset page reader (listing_id asc, deterministic).
    candidates: {
      fetchPage: (cursor, pageSize) => prisma.listing.findMany({
        where: cursor ? { listing_id: { gt: cursor } } : undefined,
        orderBy: { listing_id: 'asc' },
        take: pageSize,
        select: {
          listing_id: true, rls_eligible: true, status: true,
          idx_display_yn: true, internet_entire_listing_display_yn: true,
          owner_opt_out: true, participant_only: true, media: true,
          _count: { select: { listing_media: true } },
          listing_media: {
            orderBy: [{ order: 'asc' }, { id: 'asc' }],
            select: {
              id: true, status: true, media_key: true, media_url_original: true,
              media_url_cached: true, order: true, media_type: true,
              media_category: true, media_classification: true, preferred_photo_yn: true,
            },
          },
        },
      }).then((ls) => ls.map((l) => ({
        ...l,
        listing_media_active: (l.listing_media as unknown as (AllStatusRow & ListingMediaTableRow)[]).filter((r) => r.status === 'active'),
        listing_media_all: (l.listing_media as unknown as AllStatusRow[]).map((r) => ({ ...r, id: String(r.id) })),
      }))) as unknown as Promise<DryRunListingRow[]>,
    },
    cotality: buildCotalityReader({
      timeoutMs: intFlag(args, '--timeout-ms', 15_000),
      maxRetries: intFlag(args, '--retries', 1),
      counters,
    }),
    budgets,
  };

  try {
    const res = await runDryRun(deps);
    if (asJson) {
      console.log(JSON.stringify({ mode: 'DRY-RUN — nothing written', budgets, ...res, rollback: ROLLBACK_NOTE }, null, 2));
    } else {
      console.log('=== Bucket B backfill DRY-RUN (nothing written, BOUNDED) ===');
      console.log(`  processed: ${res.processed} · eligible listings: ${res.eligibleListings}`);
      console.log(`  expected inserts/restores/updates/unchanged: ${res.totals.inserts}/${res.totals.restores}/${res.totals.updates}/${res.totals.unchanged}`);
      console.log(`  cotality requests=${res.counters.requests} ok=${res.counters.successes} unknown=${res.counters.failures} retries=${res.counters.retries} skipped=${res.counters.skipped}`);
      console.log('\n' + ROLLBACK_NOTE);
    }
    if (!res.complete) {
      console.error(`\nINCOMPLETE — this is NOT a full plan: ${res.incompleteReasons.join('; ')}`);
      process.exitCode = 2;
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Entry guard: execute ONLY when run directly (tests import under real tsx
// without touching a database or Cotality).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('dry-run failed (nothing written):', e?.message || e); process.exitCode = 1; });
}
