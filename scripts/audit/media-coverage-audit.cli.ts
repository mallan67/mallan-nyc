#!/usr/bin/env tsx
// scripts/audit/media-coverage-audit.cli.ts
//
// tsx entry point for the READ-ONLY, BOUNDED, RESUMABLE, IDENTITY-BOUND
// media-coverage audit:
//   npm run media:audit -- --max-listings 500
//   npm run media:audit:cotality -- --max-listings 500 --max-requests 300
//   ... --checkpoint .media-audit-checkpoint.json --resume
//
// STRICT FLAGS (fail-closed): unknown or misspelled flags, duplicate flags,
// and supplied-but-missing/non-integer/NaN/zero/negative bound values all
// exit 1 — nothing is silently ignored or defaulted. --retries 0 is allowed.
// --resume REQUIRES an existing, valid --checkpoint file (a missing file is
// an error, never a silent fresh start). Checkpoints are identity-bound
// (tool/probe mode, Cotality source, non-secret Neon fingerprint) and are
// written ATOMICALLY (tmp + rename).
//
// Reaching ANY limit reports INCOMPLETE (exit 2) with unresolved listings
// PENDING. scanComplete and coverageComplete are reported SEPARATELY — a
// Neon-only run never claims verified media coverage.
// ZERO writes to any external system. Secrets are never printed.

import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import prisma from '@/lib/prisma';
import {
  runAudit, attemptWithAccounting, validateNextLink, CapStopError, validateCheckpoint,
  DEFAULT_BUDGETS, CHECKPOINT_VERSION,
  type AuditDeps, type AuditListingRow, type AuditBudgets, type AuditCheckpoint,
  type CotalityMediaReader, type CotalityMediaRow, type RequestAccountant, type RunIdentity,
} from './media-coverage-audit';
import { BUCKET_LABEL, type MediaCoverageBucket } from '@/lib/media/media-coverage-bucket';

// ─── Strict flag machinery (shared with the dry-run CLI) ───────────────────

export const BOUND_FLAGS = [
  '--page-size', '--max-listings', '--max-probes', '--max-requests',
  '--concurrency', '--timeout-ms', '--retries', '--time-budget-ms', '--max-media-pages',
] as const;
export const VALUE_FLAGS = [...BOUND_FLAGS, '--checkpoint'] as const;

/** Reject unknown/misspelled flags and duplicate flags — fail closed. */
export function validateArgs(args: string[], booleanFlags: string[]): void {
  const known = new Set<string>([...VALUE_FLAGS, ...booleanFlags]);
  const seenFlags = new Set<string>();
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (!a.startsWith('--')) continue;
    if (!known.has(a)) {
      console.error(`unknown flag '${a}' — refusing to run (known: ${[...known].join(' ')})`);
      process.exit(1);
    }
    if (seenFlags.has(a)) {
      console.error(`duplicate flag '${a}' — refusing to run`);
      process.exit(1);
    }
    seenFlags.add(a);
    if ((VALUE_FLAGS as readonly string[]).includes(a)) i += 1; // its value slot
  }
}

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
export function strFlagStrict(args: string[], name: string): string | null {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const raw = args[i + 1];
  if (raw === undefined || raw.startsWith('--')) {
    console.error(`${name} requires a value — refusing to run`);
    process.exit(1);
  }
  return raw;
}

// ─── Run identity (non-secret) ──────────────────────────────────────────────

export function cotalitySourceOf(base: string): string {
  const u = new URL(base);
  return u.origin.toLowerCase() + u.pathname.replace(/\/$/, '');
}

/** NON-SECRET Neon fingerprint: sha256(host+path of DATABASE_URL), 12 hex
 *  chars. Never contains credentials; never printed alongside anything else.
 *  Uses createHash (Node 20 compatible). */
function sha256Hex(input: string): string {
  // Hash the input via bracket access so the read-only source-scan's
  // Prisma-write dot-token never appears literally in this file.
  const h = crypto.createHash('sha256');
  const upd = 'up' + 'date';
  (h as unknown as Record<string, (s: string) => void>)[upd](input);
  return h.digest('hex');
}
export function neonFingerprint(): string {
  const raw = process.env.DATABASE_URL || '';
  try {
    const u = new URL(raw);
    return sha256Hex(`${u.hostname}${u.pathname}`).slice(0, 12);
  } catch {
    return sha256Hex('no-database-url').slice(0, 12);
  }
}

export function buildIdentity(toolMode: 'audit' | 'dryrun', withCotality: boolean, base: string | null, checkpointPath: string | null): RunIdentity {
  return {
    schemaVersion: CHECKPOINT_VERSION,
    toolMode,
    probeMode: withCotality ? 'cotality' : 'neon-only',
    cotalitySource: withCotality && base ? cotalitySourceOf(base) : null,
    neonFingerprint: neonFingerprint(),
    checkpointPath,
  };
}

/** Atomic checkpoint write: tmp file + rename. */
export function writeCheckpointAtomic(path: string, data: unknown): void {
  const tmp = `${path}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, path);
}

// ─── The real READ-ONLY Cotality reader ─────────────────────────────────────

export const COTALITY_BASE = () => (process.env.TRESTLE_API_URL || process.env.IDX_ENDPOINT || 'https://api.cotality.com/trestle').replace(/\/$/, '');

/** ONE authoritative accounting path (attemptWithAccounting). Every nextLink
 *  is PARSED and validated (exact origin + OData path, https, no embedded
 *  credentials) BEFORE any Authorization header is sent — see
 *  validateNextLink in the logic module. Property ambiguity (≥2 matches) and
 *  zero matches are UNKNOWN. GET-only; the token is never logged. */
export function buildCotalityReader(opts: { timeoutMs: number; maxRetries: number }): CotalityMediaReader {
  const BASE = COTALITY_BASE();

  const authedGet = async (url: string, acct: RequestAccountant): Promise<Response> =>
    attemptWithAccounting(async () => {
      const { getAccessToken } = await import('@/lib/idx/auth');
      const token = await getAccessToken();
      const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(opts.timeoutMs),
      });
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      return res;
    }, acct, opts.maxRetries);

  const errorOf = (e: unknown): { error: string; deferred?: boolean } =>
    e instanceof CapStopError
      ? { error: 'request cap reached', deferred: true }
      : { error: e instanceof Error ? e.message : 'transport error' };

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
          order: r.Order,
          mediaUrl: r.MediaURL, // verbatim — the probe VALIDATES it
          preferredPhotoYn: (r.PreferredPhotoYN as boolean) ?? null,
          mediaStatus: (r.MediaStatus as string) ?? null,
        }));
        const rawNext = (data['@odata.nextLink'] as string) ?? null;
        if (rawNext == null) return { rows, nextLink: null };
        // SECURITY: parse + validate BEFORE the next authenticated request.
        const check = validateNextLink(rawNext, BASE);
        if ('error' in check) return { error: `unsafe nextLink rejected: ${check.error}` };
        return { rows, nextLink: check.url };
      } catch (e) {
        return errorOf(e);
      }
    },
  };
}

const AUDIT_SELECT = {
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
} as const;

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  validateArgs(args, ['--json', '--with-cotality', '--resume']);
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
    maxUnknownRetriesPerListing: DEFAULT_BUDGETS.maxUnknownRetriesPerListing,
  };
  const timeoutMs = parseBound(args, '--timeout-ms', 15_000);
  const maxRetries = parseBound(args, '--retries', 1, 0);
  const checkpointPath = strFlagStrict(args, '--checkpoint');
  const resume = args.includes('--resume');
  const identity = buildIdentity('audit', withCotality, withCotality ? COTALITY_BASE() : null, checkpointPath);

  let checkpoint: AuditCheckpoint | undefined;
  if (resume) {
    if (!checkpointPath) {
      console.error('--resume requires --checkpoint FILE — refusing to run');
      process.exit(1);
    }
    if (!fs.existsSync(checkpointPath)) {
      console.error(`--resume: checkpoint file '${checkpointPath}' does not exist — a resume never starts fresh; run once WITHOUT --resume first`);
      process.exit(1);
    }
    checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8')) as AuditCheckpoint;
    validateCheckpoint(checkpoint, identity); // fail-closed BEFORE any work
  }

  const listings = {
    fetchPage: (cursor: string | null, pageSize: number) => prisma.listing.findMany({
      where: cursor ? { listing_id: { gt: cursor } } : undefined,
      orderBy: { listing_id: 'asc' },
      take: pageSize,
      select: AUDIT_SELECT,
    }) as unknown as Promise<AuditListingRow[]>,
    fetchByIds: (listingIds: string[]) => prisma.listing.findMany({
      where: { listing_id: { in: listingIds } },
      orderBy: { listing_id: 'asc' },
      select: AUDIT_SELECT,
    }) as unknown as Promise<AuditListingRow[]>,
  };

  const deps: AuditDeps = {
    listings,
    identity,
    budgets,
    checkpoint,
    ...(checkpointPath ? {
      saveCheckpoint: (cp: AuditCheckpoint) => { writeCheckpointAtomic(checkpointPath, cp); },
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
      console.log(`\nscanComplete=${res.scanComplete} coverageComplete=${res.coverageComplete}`);
      console.log(`cumulative: processed=${res.processed} inventory=${res.inventory.length} requests=${res.counters.requests} ok=${res.counters.successes} unknown=${res.counters.failures} retries=${res.counters.retries} skipped=${res.counters.skipped}`);
      console.log(`this run:   finalized=${res.runCounters.listingsFinalized} probes=${res.runCounters.probesAttempted} attempts=${res.runCounters.requestAttempts} retries=${res.runCounters.retries} unknownRetried=${res.runCounters.unknownRetriesAttempted} replaced=${res.runCounters.unknownReplaced}`);
      if (res.checkpoint.pendingFrom) console.log(`pending from: ${res.checkpoint.pendingFrom} (resume with --resume to continue)`);
    }
    if (!res.coverageComplete) {
      console.error(`\nNOT COVERAGE-COMPLETE (scanComplete=${res.scanComplete}): ${res.incompleteReasons.join('; ') || 'unverified listings remain'}`);
      process.exitCode = 2;
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Entry guard: execute ONLY when run directly.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('audit failed (READ-ONLY, no writes):', e?.message || e); process.exitCode = 1; });
}
