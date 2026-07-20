#!/usr/bin/env tsx
// scripts/backfill/bucket-b-media-dry-run.cli.ts
//
// tsx entry point for the READ-ONLY, BOUNDED, RESUMABLE, IDENTITY-BOUND
// Bucket-B dry-run planner (round 4 per Maya's #540 reviews).
//   npm run media:backfill:dryrun -- --max-listings 500 --max-requests 300
//   ... --checkpoint .media-dryrun-checkpoint.json --resume
//
// Dry-run probing is SEQUENTIAL — there is no --concurrency flag here (a
// safety control with no effect would be dishonest). All other strict
// fail-closed flags match the audit CLI (unknown/misspelled/duplicate and
// invalid supplied bounds exit 1; --retries 0 and --max-unknown-retries are
// explicit validated flags; --resume requires an existing valid checkpoint;
// an existing --checkpoint without --resume is refused). Checkpoints are
// identity-bound, lock-protected, and written atomically via a unique temp.
//
// The CLI exits nonzero unless planComplete — a CONFLICT (manual review)
// NEVER exits 0. NEVER writes — no apply flag. Secrets never printed.

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import prisma from '@/lib/prisma';
import {
  runDryRun, ROLLBACK_NOTE, validateDryRunCheckpoint,
  type DryRunDeps, type DryRunListingRow, type AllStatusRow, type DryRunCheckpoint,
} from './bucket-b-media-dry-run';
import { DEFAULT_BUDGETS, MAX_UNKNOWN_RETRIES, type AuditBudgets } from '../audit/media-coverage-audit';
import {
  buildCotalityReader, parseBound, strFlagStrict, validateArgs, buildIdentity,
  writeCheckpointAtomic, acquireCheckpointLock, releaseCheckpointLock, COTALITY_BASE,
} from '../audit/media-coverage-audit.cli';
import type { ListingMediaTableRow } from '@/lib/media/listing-media-resolver';

// Dry-run VALUE flags — NOTE: no --concurrency (probing is sequential).
const DRYRUN_VALUE_FLAGS = [
  '--page-size', '--max-listings', '--max-probes', '--max-requests',
  '--timeout-ms', '--retries', '--time-budget-ms',
  '--max-media-pages', '--max-unknown-retries', '--checkpoint',
] as const;

const DRYRUN_SELECT = {
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
} as const;

function mapRows(ls: Array<Record<string, unknown>>): DryRunListingRow[] {
  return ls.map((l) => ({
    ...l,
    listing_media_active: (l.listing_media as unknown as (AllStatusRow & ListingMediaTableRow)[]).filter((r) => r.status === 'active'),
    listing_media_all: (l.listing_media as unknown as AllStatusRow[]).map((r) => ({ ...r, id: String(r.id) })),
  })) as unknown as DryRunListingRow[];
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  validateArgs(args, DRYRUN_VALUE_FLAGS, ['--json', '--resume']);
  const asJson = args.includes('--json');
  const budgets: AuditBudgets = {
    pageSize: parseBound(args, '--page-size', DEFAULT_BUDGETS.pageSize),
    maxListings: parseBound(args, '--max-listings', DEFAULT_BUDGETS.maxListings),
    maxCotalityProbes: parseBound(args, '--max-probes', DEFAULT_BUDGETS.maxCotalityProbes),
    maxCotalityRequests: parseBound(args, '--max-requests', DEFAULT_BUDGETS.maxCotalityRequests),
    cotalityConcurrency: 1, // dry-run probing is sequential
    maxMediaPagesPerListing: parseBound(args, '--max-media-pages', DEFAULT_BUDGETS.maxMediaPagesPerListing),
    runTimeBudgetMs: parseBound(args, '--time-budget-ms', DEFAULT_BUDGETS.runTimeBudgetMs),
    maxUnknownRetriesPerListing: parseBound(args, '--max-unknown-retries', DEFAULT_BUDGETS.maxUnknownRetriesPerListing, 1),
  };
  if (budgets.maxUnknownRetriesPerListing > MAX_UNKNOWN_RETRIES) { console.error(`--max-unknown-retries ${budgets.maxUnknownRetriesPerListing} exceeds the maximum ${MAX_UNKNOWN_RETRIES} — refusing to run`); process.exit(1); }
  const timeoutMs = parseBound(args, '--timeout-ms', 15_000);
  const maxRetries = parseBound(args, '--retries', 1, 0);
  const checkpointPath = strFlagStrict(args, '--checkpoint');
  const resume = args.includes('--resume');
  const identity = buildIdentity('dryrun', true, COTALITY_BASE(), checkpointPath, budgets.maxUnknownRetriesPerListing);

  let checkpoint: DryRunCheckpoint | undefined;
  if (resume) {
    if (!checkpointPath) { console.error('--resume requires --checkpoint FILE — refusing to run'); process.exit(1); }
    if (!fs.existsSync(checkpointPath)) { console.error(`--resume: checkpoint file '${checkpointPath}' does not exist — a resume never starts fresh; run once WITHOUT --resume first`); process.exit(1); }
    checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8')) as DryRunCheckpoint;
    validateDryRunCheckpoint(checkpoint, identity);
  } else if (checkpointPath && fs.existsSync(checkpointPath)) {
    console.error(`--checkpoint '${checkpointPath}' already exists and --resume was NOT supplied — refusing to overwrite; choose a new path or add --resume`);
    process.exit(1);
  }

  const lockPath = checkpointPath ? acquireCheckpointLock(checkpointPath) : null;

  // try/finally begins IMMEDIATELY after lock acquisition — any setup failure
  // (reader construction, wiring) still releases the lock.
  try {
    const deps: DryRunDeps = {
      candidates: {
        fetchPage: (cursor, pageSize) => prisma.listing.findMany({
          where: cursor ? { listing_id: { gt: cursor } } : undefined,
          orderBy: { listing_id: 'asc' }, take: pageSize, select: DRYRUN_SELECT,
        }).then(mapRows),
        fetchByIds: (listingIds) => prisma.listing.findMany({
          where: { listing_id: { in: listingIds } }, orderBy: { listing_id: 'asc' }, select: DRYRUN_SELECT,
        }).then(mapRows),
      },
      cotality: buildCotalityReader({ timeoutMs, maxRetries }),
      identity, budgets, checkpoint,
      ...(checkpointPath ? { saveCheckpoint: (cp: DryRunCheckpoint) => { writeCheckpointAtomic(checkpointPath, cp); } } : {}),
    };

    const res = await runDryRun(deps);
    if (asJson) {
      console.log(JSON.stringify({ mode: 'DRY-RUN — nothing written', budgets, ...res, rollback: ROLLBACK_NOTE }, null, 2));
    } else {
      console.log('=== Bucket B backfill DRY-RUN (nothing written, BOUNDED, RESUMABLE) ===');
      console.log(`  scanComplete=${res.scanComplete} coverageComplete=${res.coverageComplete} planComplete=${res.planComplete}`);
      console.log(`  cumulative: processed=${res.processed} eligible=${res.eligibleListings} conflicts=${res.conflictListings}`);
      console.log(`  expected inserts/restores/updates/unchanged: ${res.totals.inserts}/${res.totals.restores}/${res.totals.updates}/${res.totals.unchanged}`);
      console.log(`  cotality: requests=${res.counters.requests} ok=${res.counters.successes} unknown=${res.counters.failures} retries=${res.counters.retries}`);
      console.log(`  this run: finalized=${res.runCounters.listingsFinalized} probes=${res.runCounters.probesAttempted} attempts=${res.runCounters.requestAttempts} sourceMissing=${res.runCounters.sourceMissing}`);
      if (res.checkpoint.pendingFrom) console.log(`  pending from: ${res.checkpoint.pendingFrom} (resume with --resume to continue)`);
      console.log('\n' + ROLLBACK_NOTE);
    }
    if (!res.planComplete) {
      console.error(`\nNOT PLAN-COMPLETE (scan=${res.scanComplete} coverage=${res.coverageComplete} conflicts=${res.conflictListings}): ${res.incompleteReasons.join('; ') || 'unresolved listings/conflicts remain'}`);
      process.exitCode = 2;
    }
  } finally {
    releaseCheckpointLock(lockPath);
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('dry-run failed (nothing written):', e?.message || e); process.exitCode = 1; });
}
