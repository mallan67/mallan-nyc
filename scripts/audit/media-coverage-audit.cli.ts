#!/usr/bin/env tsx
// scripts/audit/media-coverage-audit.cli.ts
//
// tsx entry point for the READ-ONLY, BOUNDED, RESUMABLE media-coverage audit:
//   npm run media:audit -- --max-listings 500
//   npm run media:audit:cotality -- --max-listings 500 --max-requests 300
//   ... --checkpoint .media-audit-checkpoint.json --resume
//   ... --json
//
// Flags (per-run bounds; a SUPPLIED value that is missing, non-integer, NaN,
// zero or negative FAILS CLOSED with exit 1 — no silent default substitution;
// --retries 0 is explicitly allowed):
//   --page-size N · --max-listings N · --max-probes N · --max-requests N
//   --concurrency N · --timeout-ms N · --retries N(≥0) · --time-budget-ms N
//   --max-media-pages N · --checkpoint FILE · --resume · --with-cotality · --json
//
// Reaching ANY limit reports INCOMPLETE (exit 2) with unresolved listings
// PENDING (the cursor never advances past them; --resume continues them).
// ZERO writes anywhere. Credentials/tokens/headers are NEVER printed.

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import prisma from '@/lib/prisma';
import {
  runAudit, attemptWithAccounting, CapStopError, emptyCheckpoint, validateCheckpoint, DEFAULT_BUDGETS,
  type AuditDeps, type AuditListingRow, type AuditBudgets, type AuditCheckpoint,
  type CotalityMediaReader, type CotalityMediaRow, type RequestAccountant,
} from './media-coverage-audit';
import { BUCKET_LABEL, type MediaCoverageBucket } from '@/lib/media/media-coverage-bucket';

/** FAIL-CLOSED bound parsing: absent flag → documented default; a SUPPLIED
 *  flag must carry a valid integer ≥ min or the process exits 1. */
export function parseBound(args: string[], name: string, fallback: number, min = 1): number {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const raw = args[i + 1];
  if (raw === undefined || raw.startsWith('--')) {
    console.error(`${name} requires a value — refusing to run with an implicit default`);
    process.exit(1);
  }
  const v = Number(raw);
  if (!Number.isFinite(v) || !Number.isInteger(v) || v < min) {
    console.error(`${name} value '${raw}' is invalid (integer ≥ ${min} required) — refusing to run`);
    process.exit(1);
  }
  return v;
}
function strFlag(args: string[], name: string): string | null {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] ?? null : null;
}

/** The real READ-ONLY Cotality reader. ONE authoritative accounting path:
 *  every HTTP attempt — including every retry — goes through the
 *  RequestAccountant via attemptWithAccounting; a cap stop returns
 *  { deferred: true } so the listing stays PENDING. Property ambiguity
 *  (≥2 matches) and zero matches are UNKNOWN; nextLink must stay on the
 *  allowed Cotality base. GET-only; the token is never logged. */
export function buildCotalityReader(opts: { timeoutMs: number; maxRetries: number }): CotalityMediaReader {
  const BASE = (process.env.TRESTLE_API_URL || process.env.IDX_ENDPOINT || 'https://api.cotality.com/trestle').replace(/\/$/, '');

  const authedGet = async (url: string, acct: RequestAccountant): Promise<Response> =>
    attemptWithAccounting(async () => {
      const { getAccessToken } = await import('@/lib/idx/auth');
      const token = await getAccessToken(); // throws on OAuth failure → UNKNOWN
      const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(opts.timeoutMs),
      });
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`); // retryable
      return res;
    }, acct, opts.maxRetries);

  const errorOf = (e: unknown): { error: string; deferred?: boolean } =>
    e instanceof CapStopError
      ? { error: 'request cap reached', deferred: true }
      : { error: e instanceof Error ? e.message : 'transport error' }; // message only — never bodies/headers

  return {
    async resolvePropertyKey(listingId, acct) {
      try {
        const escaped = listingId.replace(/'/g, "''");
        const url = `${BASE}/odata/Property?$filter=ListingId eq '${escaped}'&$select=ListingKey,ListingId&$top=2`;
        const res = await authedGet(url, acct);
        if (res.status !== 200) return { error: `Property HTTP ${res.status}` };
        const data = await res.json();
        const recs = data.value || [];
        if (recs.length === 0) return { error: 'no Property match for ListingId' };
        if (recs.length > 1) return { error: 'AMBIGUOUS: multiple Property matches for ListingId' };
        const key = recs[0].ListingKey;
        if (!key || String(key).trim() === '') return { error: 'Property match has no ListingKey' };
        return { listingKey: String(key) };
      } catch (e) {
        return errorOf(e);
      }
    },
    buildFirstMediaUrl(listingKey) {
      const escaped = listingKey.replace(/'/g, "''");
      const params = new URLSearchParams();
      params.set('$filter', `ResourceRecordKey eq '${escaped}'`);
      params.set('$select', 'MediaKey,MediaCategory,MediaType,Order,MediaURL,PreferredPhotoYN,MediaStatus');
      params.set('$orderby', 'Order asc');
      params.set('$top', '100');
      return `${BASE}/odata/Media?${params.toString()}`;
    },
    async fetchMediaPage(url, acct) {
      try {
        const res = await authedGet(url, acct);
        if (res.status !== 200) return { error: `Media HTTP ${res.status}` };
        const data = await res.json();
        const rows: CotalityMediaRow[] = (data.value || []).map((r: Record<string, unknown>) => ({
          mediaKey: (r.MediaKey as string) ?? null,
          mediaCategory: (r.MediaCategory as string) ?? null,
          mediaType: (r.MediaType as string) ?? null,
          order: r.Order, // provider Order verbatim — the probe VALIDATES it
          mediaUrl: String(r.MediaURL ?? ''),
          preferredPhotoYn: (r.PreferredPhotoYN as boolean) ?? null,
          mediaStatus: (r.MediaStatus as string) ?? null,
        }));
        const nextLink = (data['@odata.nextLink'] as string) ?? null;
        if (nextLink && !nextLink.startsWith(BASE)) {
          return { error: 'nextLink is outside the allowed Cotality base — refusing to follow' };
        }
        return { rows, nextLink };
      } catch (e) {
        return errorOf(e);
      }
    },
  };
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const withCotality = args.includes('--with-cotality');
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

  let checkpoint: AuditCheckpoint | undefined;
  if (resume) {
    if (checkpointPath && fs.existsSync(checkpointPath)) {
      checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8')) as AuditCheckpoint;
      validateCheckpoint(checkpoint, 'audit'); // fail-closed BEFORE any work
    } else {
      checkpoint = emptyCheckpoint();
    }
  }

  // READ-ONLY Neon reader: keyset pagination, deterministic listing_id asc.
  const listings = {
    fetchPage: (cursor: string | null, pageSize: number) => prisma.listing.findMany({
      where: cursor ? { listing_id: { gt: cursor } } : undefined,
      orderBy: { listing_id: 'asc' },
      take: pageSize,
      select: {
        listing_id: true, rls_eligible: true, status: true,
        idx_display_yn: true, internet_entire_listing_display_yn: true,
        owner_opt_out: true, participant_only: true, media: true,
        _count: { select: { listing_media: true } },
        listing_media: {
          where: { status: 'active' },
          orderBy: [{ order: 'asc' }, { id: 'asc' }],
          select: {
            media_url_original: true, media_url_cached: true, media_type: true,
            media_category: true, media_classification: true, order: true,
            preferred_photo_yn: true, status: true,
          },
        },
      },
    }) as unknown as Promise<AuditListingRow[]>,
  };

  const deps: AuditDeps = {
    listings,
    budgets,
    checkpoint,
    ...(checkpointPath ? {
      saveCheckpoint: (cp: AuditCheckpoint) => { fs.writeFileSync(checkpointPath, JSON.stringify(cp, null, 2)); },
    } : {}),
  };
  if (withCotality) deps.cotality = buildCotalityReader({ timeoutMs, maxRetries });

  try {
    const res = await runAudit(deps);
    if (asJson) {
      console.log(JSON.stringify({ mode: 'READ-ONLY audit — no writes', withCotality, budgets, ...res }, null, 2));
    } else {
      console.log('=== Media coverage buckets (READ-ONLY, BOUNDED, RESUMABLE) ===');
      for (const k of Object.keys(res.tally) as MediaCoverageBucket[]) {
        console.log(`  ${k.padEnd(11)} ${String(res.tally[k]).padStart(6)}  ${BUCKET_LABEL[k]}`);
      }
      console.log(`\ncumulative: processed=${res.processed} inventory=${res.inventory.length} requests=${res.counters.requests} ok=${res.counters.successes} unknown=${res.counters.failures} retries=${res.counters.retries} skipped=${res.counters.skipped}`);
      console.log(`this run:   finalized=${res.runCounters.listingsFinalized} probes=${res.runCounters.probesAttempted} attempts=${res.runCounters.requestAttempts} retries=${res.runCounters.retries} elapsedMs=${res.runCounters.elapsedMs}`);
      if (res.checkpoint.pendingFrom) console.log(`pending from: ${res.checkpoint.pendingFrom} (resume with --resume to continue)`);
    }
    if (!res.complete) {
      console.error(`\nINCOMPLETE — this is NOT a full audit: ${res.incompleteReasons.join('; ')}`);
      process.exitCode = 2;
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Entry guard: execute ONLY when run directly (tests import under real tsx
// without touching a database or Cotality).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('audit failed (READ-ONLY, no writes):', e?.message || e); process.exitCode = 1; });
}
