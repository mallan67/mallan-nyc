#!/usr/bin/env tsx
// scripts/backfill/bucket-b-media-dry-run.cli.ts
//
// tsx entry point for the READ-ONLY, BOUNDED, RESUMABLE Bucket-B dry-run
// planner:
//   npm run media:backfill:dryrun -- --max-listings 500 --max-requests 300
//   ... --checkpoint .media-dryrun-checkpoint.json --resume
//   ... --json
//
// Same fail-closed flags as the audit CLI (--page-size, --max-listings,
// --max-probes, --max-requests, --concurrency, --timeout-ms, --retries(≥0),
// --time-budget-ms, --max-media-pages, --checkpoint, --resume). A SUPPLIED
// invalid value exits 1; reaching ANY limit ⇒ INCOMPLETE (exit 2) with the
// unresolved listings PENDING for --resume. The checkpoint carries the
// CUMULATIVE deduplicated plans, so a resumed result represents the WHOLE
// candidate set. NEVER writes — no apply flag exists. Secrets never printed.

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import prisma from '@/lib/prisma';
import {
  runDryRun, ROLLBACK_NOTE, emptyDryRunCheckpoint, validateDryRunCheckpoint,
  type DryRunDeps, type DryRunListingRow, type AllStatusRow, type DryRunCheckpoint,
} from './bucket-b-media-dry-run';
import { DEFAULT_BUDGETS, type AuditBudgets } from '../audit/media-coverage-audit';
import { buildCotalityReader, parseBound } from '../audit/media-coverage-audit.cli';
import type { ListingMediaTableRow } from '@/lib/media/listing-media-resolver';

function strFlag(args: string[], name: string): string | null {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] ?? null : null;
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const budgets: AuditBudgets = {
    pageSize: parseBound(args, '--page-size', DEFAULT_BUDGETS.pageSize),
    maxListings: parseBound(args, '--max-listings', DEFAULT_BUDGETS.maxListings),
    maxCotalityProbes: parseBound(args, '--max-probes', DEFAULT_BUDGETS.maxCotalityProbes),
    maxCotalityRequests: parseBound(args, '--max-requests', DEFAULT_BUDGETS.maxCotalityRequests),
    cotalityConcurrency: parseBound(args, '--concurrency', DEFAULT_BUDGETS.cotalityConcurrency),
    maxMediaPagesPerListing: parseBound(args, '--max-media-pages', DEFAULT_BUDGETS.maxMediaPagesPerListing),
    runTimeBudgetMs: parseBound(args, '--time-budget-ms', DEFAULT_BUDGETS.runTimeBudgetMs),
  };
  const timeoutMs = parseBound(args, '--timeout-ms', 15_000);
  const maxRetries = parseBound(args, '--retries', 1, 0); // --retries 0 allowed
  const checkpointPath = strFlag(args, '--checkpoint');
  const resume = args.includes('--resume');

  let checkpoint: DryRunCheckpoint | undefined;
  if (resume) {
    if (checkpointPath && fs.existsSync(checkpointPath)) {
      checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8')) as DryRunCheckpoint;
      validateDryRunCheckpoint(checkpoint); // fail-closed BEFORE any work
    } else {
      checkpoint = emptyDryRunCheckpoint();
    }
  }

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
    cotality: buildCotalityReader({ timeoutMs, maxRetries }),
    budgets,
    checkpoint,
    ...(checkpointPath ? {
      saveCheckpoint: (cp: DryRunCheckpoint) => { fs.writeFileSync(checkpointPath, JSON.stringify(cp, null, 2)); },
    } : {}),
  };

  try {
    const res = await runDryRun(deps);
    if (asJson) {
      console.log(JSON.stringify({ mode: 'DRY-RUN — nothing written', budgets, ...res, rollback: ROLLBACK_NOTE }, null, 2));
    } else {
      console.log('=== Bucket B backfill DRY-RUN (nothing written, BOUNDED, RESUMABLE) ===');
      console.log(`  cumulative: processed=${res.processed} eligible=${res.eligibleListings}`);
      console.log(`  expected inserts/restores/updates/unchanged: ${res.totals.inserts}/${res.totals.restores}/${res.totals.updates}/${res.totals.unchanged}`);
      console.log(`  cotality: requests=${res.counters.requests} ok=${res.counters.successes} unknown=${res.counters.failures} retries=${res.counters.retries}`);
      console.log(`  this run: finalized=${res.runCounters.listingsFinalized} probes=${res.runCounters.probesAttempted} attempts=${res.runCounters.requestAttempts} retries=${res.runCounters.retries}`);
      if (res.checkpoint.pendingFrom) console.log(`  pending from: ${res.checkpoint.pendingFrom} (resume with --resume to continue)`);
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
