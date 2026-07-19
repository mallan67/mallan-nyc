#!/usr/bin/env tsx
// scripts/audit/media-coverage-audit.cli.ts
//
// tsx entry point for the READ-ONLY, BOUNDED media-coverage audit. Run via:
//   npm run media:audit -- --max-listings 500                       # Neon-only
//   npm run media:audit:cotality -- --max-listings 500 --max-requests 300
//   ... --checkpoint .media-audit-checkpoint.json --resume          # resumable
//   ... --json
//
// Flags (every bound is explicit; defaults are conservative):
//   --page-size N        Neon keyset page size            (default 200)
//   --max-listings N     max listings this run            (default 1000)
//   --max-probes N       max Cotality probes              (default 100)
//   --max-requests N     max TOTAL Cotality requests      (default 500)
//   --concurrency N      probe concurrency (bounded)      (default 2)
//   --timeout-ms N       per-request timeout              (default 15000)
//   --retries N          bounded retries per request      (default 1)
//   --time-budget-ms N   overall run budget               (default 600000)
//   --checkpoint FILE    checkpoint path (saved each page)
//   --resume             resume from the checkpoint file (no page repeated)
//   --with-cotality      enable the live read-only Cotality probe
//   --json               machine-readable output
//
// Reaching ANY limit reports INCOMPLETE (exit 2) — never a silent full audit.
// ZERO writes anywhere. Credentials/tokens/headers are NEVER printed.

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import prisma from '@/lib/prisma';
import {
  runAudit, withBoundedRetries, emptyCheckpoint, DEFAULT_BUDGETS,
  type AuditDeps, type AuditListingRow, type AuditBudgets, type AuditCheckpoint,
  type CotalityMediaReader, type CotalityMediaRow, type CotalityCounters,
} from './media-coverage-audit';
import { BUCKET_LABEL, type MediaCoverageBucket } from '@/lib/media/media-coverage-bucket';

function intFlag(args: string[], name: string, fallback: number): number {
  const i = args.indexOf(name);
  const v = i >= 0 ? Number(args[i + 1]) : NaN;
  return Number.isFinite(v) && v > 0 ? v : fallback;
}
function strFlag(args: string[], name: string): string | null {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] ?? null : null;
}

/** The real READ-ONLY Cotality reader: Property → ACTUAL ListingKey → Media by
 *  ResourceRecordKey, per-request timeout, bounded retries, counters via
 *  onRetry. GET-only; the token never leaves this closure and is never logged. */
export function buildCotalityReader(opts: {
  timeoutMs: number;
  maxRetries: number;
  counters: CotalityCounters;
}): CotalityMediaReader {
  const BASE = (process.env.TRESTLE_API_URL || process.env.IDX_ENDPOINT || 'https://api.cotality.com/trestle').replace(/\/$/, '');

  const authedGet = async (url: string): Promise<Response> => {
    const { getAccessToken } = await import('@/lib/idx/auth');
    return withBoundedRetries(async () => {
      const token = await getAccessToken(); // throws on OAuth failure → probe UNKNOWN
      const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(opts.timeoutMs),
      });
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`); // retryable
      return res;
    }, opts.maxRetries, () => { opts.counters.retries += 1; });
  };

  return {
    async resolvePropertyKey(listingId) {
      try {
        const escaped = listingId.replace(/'/g, "''");
        const url = `${BASE}/odata/Property?$filter=ListingId eq '${escaped}'&$select=ListingKey,ListingId&$top=2`;
        const res = await authedGet(url);
        if (res.status !== 200) return { error: `Property HTTP ${res.status}` }; // status only — never bodies/headers
        const data = await res.json();
        const rec = (data.value || [])[0];
        if (!rec || !rec.ListingKey) return { error: 'no Property record / no ListingKey' };
        return { listingKey: String(rec.ListingKey) };
      } catch (e) {
        return { error: e instanceof Error ? e.message : 'property lookup error' };
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
    async fetchMediaPage(url) {
      try {
        const res = await authedGet(url);
        if (res.status !== 200) return { error: `Media HTTP ${res.status}` };
        const data = await res.json();
        const rows: CotalityMediaRow[] = (data.value || []).map((r: Record<string, unknown>) => ({
          mediaKey: (r.MediaKey as string) ?? null,
          mediaCategory: (r.MediaCategory as string) ?? null,
          mediaType: (r.MediaType as string) ?? null,
          order: typeof r.Order === 'number' ? r.Order : Number(r.Order ?? NaN), // provider Order verbatim
          mediaUrl: String(r.MediaURL ?? ''),
          preferredPhotoYn: (r.PreferredPhotoYN as boolean) ?? null,
          mediaStatus: (r.MediaStatus as string) ?? null,
        }));
        return { rows, nextLink: (data['@odata.nextLink'] as string) ?? null };
      } catch (e) {
        return { error: e instanceof Error ? e.message : 'media page error' };
      }
    },
  };
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const withCotality = args.includes('--with-cotality');
  const budgets: AuditBudgets = {
    pageSize: intFlag(args, '--page-size', DEFAULT_BUDGETS.pageSize),
    maxListings: intFlag(args, '--max-listings', DEFAULT_BUDGETS.maxListings),
    maxCotalityProbes: intFlag(args, '--max-probes', DEFAULT_BUDGETS.maxCotalityProbes),
    maxCotalityRequests: intFlag(args, '--max-requests', DEFAULT_BUDGETS.maxCotalityRequests),
    cotalityConcurrency: intFlag(args, '--concurrency', DEFAULT_BUDGETS.cotalityConcurrency),
    maxMediaPagesPerListing: DEFAULT_BUDGETS.maxMediaPagesPerListing,
    runTimeBudgetMs: intFlag(args, '--time-budget-ms', DEFAULT_BUDGETS.runTimeBudgetMs),
  };
  const timeoutMs = intFlag(args, '--timeout-ms', 15_000);
  const maxRetries = intFlag(args, '--retries', 1);
  const checkpointPath = strFlag(args, '--checkpoint');
  const resume = args.includes('--resume');

  let checkpoint: AuditCheckpoint | undefined;
  if (resume && checkpointPath && fs.existsSync(checkpointPath)) {
    checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8')) as AuditCheckpoint;
  } else if (resume) {
    checkpoint = emptyCheckpoint();
  }

  // READ-ONLY Neon reader: keyset pagination, deterministic listing_id asc.
  // The logic layer receives ONLY this fetchPage capability.
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
  if (withCotality) {
    const counters = checkpoint?.counters ?? { requests: 0, successes: 0, failures: 0, retries: 0, skipped: 0 };
    deps.cotality = buildCotalityReader({ timeoutMs, maxRetries, counters });
  }

  try {
    const res = await runAudit(deps);
    if (asJson) {
      console.log(JSON.stringify({ mode: 'READ-ONLY audit — no writes', withCotality, budgets, ...res }, null, 2));
    } else {
      console.log('=== Media coverage buckets (READ-ONLY, BOUNDED) ===');
      for (const k of Object.keys(res.tally) as MediaCoverageBucket[]) {
        console.log(`  ${k.padEnd(11)} ${String(res.tally[k]).padStart(6)}  ${BUCKET_LABEL[k]}`);
      }
      console.log(`\nprocessed: ${res.processed} · cotality requests=${res.counters.requests} ok=${res.counters.successes} unknown=${res.counters.failures} retries=${res.counters.retries} skipped=${res.counters.skipped}`);
    }
    if (!res.complete) {
      console.error(`\nINCOMPLETE — this is NOT a full audit: ${res.incompleteReasons.join('; ')}`);
      process.exitCode = 2;
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Entry guard: execute ONLY when run directly (so tests can import this module
// under real tsx without touching a database or Cotality).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('audit failed (READ-ONLY, no writes):', e?.message || e); process.exitCode = 1; });
}
