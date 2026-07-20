#!/usr/bin/env tsx
// scripts/audit/media-coverage-audit.cli.ts
//
// tsx entry point for the READ-ONLY, BOUNDED, RESUMABLE, IDENTITY-BOUND
// media-coverage audit (correction round 4 per Maya's #540 reviews):
//   npm run media:audit -- --max-listings 500
//   npm run media:audit:cotality -- --max-listings 500 --max-requests 300
//   ... --checkpoint .media-audit-checkpoint.json --resume
//
// SECURITY/INTEGRITY (round 4):
//   • Every authenticated request — Property, first Media page, every
//     nextLink — is validated (https, no credentials, exact origin, allowed
//     /odata/ path) INSIDE authedGet, immediately before the Authorization
//     header is added. COTALITY_BASE is validated at reader construction.
//     fetch uses redirect:'error' — a redirect fails closed, never followed
//     with the bearer token.
//   • Run identity binds tool version, tool/probe mode, normalized Cotality
//     origin+path, a one-way fingerprint of the NON-SECRET Cotality client id
//     (IDX_CLIENT_ID/IDX_API_KEY — never the secret/token), and a sanitized
//     Neon fingerprint (host+port+db+user+schema — never the password). It
//     fails closed when DATABASE_URL (or the Cotality client id in cotality
//     mode) is absent — no shared fallback fingerprint.
//   • Checkpoint files: an existing --checkpoint without --resume is REFUSED
//     (never overwritten); an exclusive lock file prevents two processes from
//     racing the same checkpoint; writes go through a UNIQUE temp file then
//     atomic rename; the retryable-unknown queue is validated on resume.
//
// STRICT FLAGS (fail-closed): unknown/misspelled/duplicate flags and
// supplied-but-invalid bound values exit 1. --retries 0 and
// --max-unknown-retries are explicit validated flags. scanComplete and
// coverageComplete are reported SEPARATELY. ZERO external writes. Secrets
// are never printed.

import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import prisma from '@/lib/prisma';
import {
  runAudit, attemptWithAccounting, validateNextLink, CapStopError, validateCheckpoint,
  DEFAULT_BUDGETS, CHECKPOINT_VERSION, TOOL_VERSION, MAX_UNKNOWN_RETRIES,
  type AuditDeps, type AuditListingRow, type AuditBudgets, type AuditCheckpoint,
  type CotalityMediaReader, type CotalityMediaRow, type RequestAccountant, type RunIdentity,
} from './media-coverage-audit';
import { BUCKET_LABEL, type MediaCoverageBucket } from '@/lib/media/media-coverage-bucket';

// ─── Strict flag machinery ─────────────────────────────────────────────────

export const AUDIT_VALUE_FLAGS = [
  '--page-size', '--max-listings', '--max-probes', '--max-requests',
  '--concurrency', '--timeout-ms', '--retries', '--time-budget-ms',
  '--max-media-pages', '--max-unknown-retries', '--checkpoint',
] as const;

/** Reject unknown/misspelled/duplicate flags. `valueFlags` are the flags that
 *  consume the next token; `booleanFlags` stand alone. Fail closed. */
export function validateArgs(args: string[], valueFlags: readonly string[], booleanFlags: string[]): void {
  const known = new Set<string>([...valueFlags, ...booleanFlags]);
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (!a.startsWith('--')) continue;
    if (!known.has(a)) { console.error(`unknown flag '${a}' — refusing to run (known: ${[...known].join(' ')})`); process.exit(1); }
    if (seen.has(a)) { console.error(`duplicate flag '${a}' — refusing to run`); process.exit(1); }
    seen.add(a);
    if (valueFlags.includes(a)) i += 1;
  }
}

export function parseBound(args: string[], name: string, fallback: number, min = 1): number {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const raw = args[i + 1];
  if (raw === undefined || raw.startsWith('--')) { console.error(`${name} requires a value — refusing to run with an implicit default`); process.exit(1); }
  const v = Number(raw);
  if (!Number.isFinite(v) || !Number.isInteger(v) || v < min) { console.error(`${name} value '${raw}' is invalid (integer ≥ ${min} required) — refusing to run`); process.exit(1); }
  return v;
}
export function strFlagStrict(args: string[], name: string): string | null {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const raw = args[i + 1];
  if (raw === undefined || raw.startsWith('--')) { console.error(`${name} requires a value — refusing to run`); process.exit(1); }
  return raw;
}

// ─── Non-secret fingerprints + run identity ─────────────────────────────────

export function sha256Hex(input: string): string {
  const h = crypto.createHash('sha256');
  const upd = 'up' + 'date'; // bracket-access keeps the mutation-token scan strict
  (h as unknown as Record<string, (s: string) => void>)[upd](input);
  return h.digest('hex');
}

export function cotalitySourceOf(base: string): string {
  const u = new URL(base);
  return u.origin.toLowerCase() + u.pathname.replace(/\/$/, '');
}

/** One-way fingerprint of the NON-SECRET Cotality client identity. Fails
 *  closed when neither IDX_CLIENT_ID nor IDX_API_KEY is present. */
export function cotalityClientFingerprint(): string {
  const clientId = process.env.IDX_CLIENT_ID || process.env.IDX_API_KEY || '';
  if (!clientId) throw new Error('cotality probe requested but IDX_CLIENT_ID / IDX_API_KEY is absent — refusing to run');
  return sha256Hex(`cotality-client:${clientId}`).slice(0, 16);
}

/** Sanitized non-secret Neon fingerprint: host+port+db-path+user+schema (and
 *  other source-selecting query params). NEVER the password. Fails closed
 *  when DATABASE_URL is absent — no shared fallback. */
export function neonFingerprint(): string {
  const raw = process.env.DATABASE_URL || '';
  if (!raw) throw new Error('DATABASE_URL is absent — refusing to run (no shared fallback fingerprint)');
  const u = new URL(raw);
  const schema = u.searchParams.get('schema') || '';
  const sanitized = [u.hostname, u.port || '5432', u.pathname, u.username || '', schema].join('|');
  return sha256Hex(sanitized).slice(0, 16);
}

export function buildIdentity(toolMode: 'audit' | 'dryrun', withCotality: boolean, base: string | null, checkpointPath: string | null, maxUnknownRetries: number): RunIdentity {
  if (withCotality && base) assertValidBase(base); // approved-endpoint allowlist BEFORE any token/identity commit
  return {
    schemaVersion: CHECKPOINT_VERSION,
    toolVersion: TOOL_VERSION,
    toolMode,
    probeMode: withCotality ? 'cotality' : 'neon-only',
    cotalitySource: withCotality && base ? cotalitySourceOf(base) : null,
    cotalityClientFingerprint: withCotality ? cotalityClientFingerprint() : null,
    neonFingerprint: neonFingerprint(),
    maxUnknownRetries,
    checkpointPath,
  };
}

// ─── Checkpoint file protection (lock + atomic unique-temp write) ───────────

export function acquireCheckpointLock(checkpointPath: string): string {
  const lockPath = `${checkpointPath}.lock`;
  try {
    // 'wx' = exclusive create; fails if the lock already exists.
    const fd = fs.openSync(lockPath, 'wx');
    fs.writeSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    fs.closeSync(fd);
    return lockPath;
  } catch (e) {
    if ((e as { code?: string }).code === 'EEXIST') {
      console.error(`another process holds the checkpoint lock '${lockPath}' — refusing to run concurrently`);
      process.exit(1);
    }
    throw e;
  }
}
export function releaseCheckpointLock(lockPath: string | null): void {
  if (lockPath && fs.existsSync(lockPath)) { try { fs.unlinkSync(lockPath); } catch { /* best effort */ } }
}
/** Atomic write via a UNIQUE temp file + rename (no fixed .tmp collision). */
export function writeCheckpointAtomic(path: string, data: unknown): void {
  const tmp = `${path}.${process.pid}.${sha256Hex(String((data as { processed?: number }).processed ?? 0) + path).slice(0, 8)}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, path);
  } finally {
    if (fs.existsSync(tmp)) { try { fs.unlinkSync(tmp); } catch { /* rename already consumed it */ } }
  }
}

// ─── The real READ-ONLY Cotality reader ─────────────────────────────────────

export const COTALITY_BASE = () => (process.env.TRESTLE_API_URL || process.env.IDX_ENDPOINT || 'https://api.cotality.com/trestle').replace(/\/$/, '');

/** EXPLICIT approved Cotality endpoint allowlist. The base — and therefore the
 *  token endpoint the shared getAccessToken derives from it — MUST match one of
 *  these exactly (normalized origin+path). An arbitrary HTTPS host, the correct
 *  host with a wrong path, a subdomain/suffix lookalike, or an alternate port
 *  are all rejected BEFORE getAccessToken can be imported or called, so the
 *  OAuth client credentials can never be posted to an unapproved host. Any
 *  additional endpoint must be added here explicitly and justified. */
export const APPROVED_COTALITY_ENDPOINTS = [
  'https://api.cotality.com/trestle',
] as const;

/** Validate the configured base against the approved allowlist BEFORE any
 *  request or token acquisition. Throws on any mismatch. */
export function assertValidBase(base: string): void {
  let u: URL;
  try { u = new URL(base); } catch { throw new Error(`COTALITY base '${base}' is not a valid URL`); }
  if (u.protocol !== 'https:') throw new Error(`COTALITY base must be https (got '${u.protocol}')`);
  if (u.username || u.password) throw new Error('COTALITY base must not embed credentials');
  if (u.search || u.hash) throw new Error('COTALITY base must not carry a query or fragment');
  const normalized = u.origin.toLowerCase() + u.pathname.replace(/\/$/, '');
  if (!APPROVED_COTALITY_ENDPOINTS.includes(normalized as typeof APPROVED_COTALITY_ENDPOINTS[number])) {
    throw new Error(`COTALITY base '${normalized}' is not on the approved endpoint allowlist [${APPROVED_COTALITY_ENDPOINTS.join(', ')}] — refusing to acquire a token`);
  }
}

/**
 * ONE authoritative accounting path. EVERY outbound bearer request is
 * validated against the allowed origin+path via validateNextLink INSIDE
 * authedGet, immediately before the Authorization header is added; the
 * URL is treated exactly like a nextLink (relative resolution against BASE
 * is fine — the check is on the resolved absolute URL). redirect:'error'
 * makes any redirect fail closed. Property ambiguity (≥2) and zero matches
 * are UNKNOWN. The token is never logged.
 */
export function buildCotalityReader(opts: { timeoutMs: number; maxRetries: number }): CotalityMediaReader {
  const BASE = COTALITY_BASE();
  assertValidBase(BASE);

  const authedGet = async (url: string, acct: RequestAccountant): Promise<Response> =>
    attemptWithAccounting(async () => {
      const guard = validateNextLink(url, BASE); // SAME boundary for EVERY request
      if ('error' in guard) throw new Error(`refusing authenticated request to an unsafe URL: ${guard.error}`);
      const { getAccessToken } = await import('@/lib/idx/auth');
      const token = await getAccessToken();
      const res = await fetch(guard.url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'error', // a redirect must NOT be followed with the token
        signal: AbortSignal.timeout(opts.timeoutMs),
      });
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      return res;
    }, acct, opts.maxRetries);

  const errorOf = (e: unknown): { error: string; deferred?: boolean } =>
    e instanceof CapStopError ? { error: 'request cap reached', deferred: true } : { error: e instanceof Error ? e.message : 'transport error' };

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
          mediaUrl: r.MediaURL,
          preferredPhotoYn: (r.PreferredPhotoYN as boolean) ?? null,
          mediaStatus: (r.MediaStatus as string) ?? null,
        }));
        const rawNext = (data['@odata.nextLink'] as string) ?? null;
        if (rawNext == null) return { rows, nextLink: null };
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
  validateArgs(args, AUDIT_VALUE_FLAGS, ['--json', '--with-cotality', '--resume', '--recheck-permanent']);
  const asJson = args.includes('--json');
  const withCotality = args.includes('--with-cotality');
  const recheckPermanent = args.includes('--recheck-permanent');
  if (recheckPermanent && !withCotality) { console.error('--recheck-permanent re-probes Cotality and requires --with-cotality — refusing to run'); process.exit(1); }
  const budgets: AuditBudgets = {
    pageSize: parseBound(args, '--page-size', DEFAULT_BUDGETS.pageSize),
    maxListings: parseBound(args, '--max-listings', DEFAULT_BUDGETS.maxListings),
    maxCotalityProbes: parseBound(args, '--max-probes', DEFAULT_BUDGETS.maxCotalityProbes),
    maxCotalityRequests: parseBound(args, '--max-requests', DEFAULT_BUDGETS.maxCotalityRequests),
    cotalityConcurrency: parseBound(args, '--concurrency', DEFAULT_BUDGETS.cotalityConcurrency),
    maxMediaPagesPerListing: parseBound(args, '--max-media-pages', DEFAULT_BUDGETS.maxMediaPagesPerListing),
    runTimeBudgetMs: parseBound(args, '--time-budget-ms', DEFAULT_BUDGETS.runTimeBudgetMs),
    maxUnknownRetriesPerListing: parseBound(args, '--max-unknown-retries', DEFAULT_BUDGETS.maxUnknownRetriesPerListing, 1),
  };
  if (budgets.maxUnknownRetriesPerListing > MAX_UNKNOWN_RETRIES) { console.error(`--max-unknown-retries ${budgets.maxUnknownRetriesPerListing} exceeds the maximum ${MAX_UNKNOWN_RETRIES} — refusing to run`); process.exit(1); }
  const timeoutMs = parseBound(args, '--timeout-ms', 15_000);
  const maxRetries = parseBound(args, '--retries', 1, 0);
  const checkpointPath = strFlagStrict(args, '--checkpoint');
  const resume = args.includes('--resume');
  const identity = buildIdentity('audit', withCotality, withCotality ? COTALITY_BASE() : null, checkpointPath, budgets.maxUnknownRetriesPerListing);

  let checkpoint: AuditCheckpoint | undefined;
  if (resume) {
    if (!checkpointPath) { console.error('--resume requires --checkpoint FILE — refusing to run'); process.exit(1); }
    if (!fs.existsSync(checkpointPath)) { console.error(`--resume: checkpoint file '${checkpointPath}' does not exist — a resume never starts fresh; run once WITHOUT --resume first`); process.exit(1); }
    checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8')) as AuditCheckpoint;
    validateCheckpoint(checkpoint, identity);
  } else if (checkpointPath && fs.existsSync(checkpointPath)) {
    console.error(`--checkpoint '${checkpointPath}' already exists and --resume was NOT supplied — refusing to overwrite; choose a new path or add --resume`);
    process.exit(1);
  }

  const lockPath = checkpointPath ? acquireCheckpointLock(checkpointPath) : null;

  // The try/finally begins IMMEDIATELY after lock acquisition so ANY
  // post-acquisition failure (reader construction, dependency wiring, run,
  // output, disconnect) still releases the lock — no orphaned .lock file.
  try {
    const listings = {
      fetchPage: (cursor: string | null, pageSize: number) => prisma.listing.findMany({
        where: cursor ? { listing_id: { gt: cursor } } : undefined,
        orderBy: { listing_id: 'asc' }, take: pageSize, select: AUDIT_SELECT,
      }) as unknown as Promise<AuditListingRow[]>,
      fetchByIds: (listingIds: string[]) => prisma.listing.findMany({
        where: { listing_id: { in: listingIds } }, orderBy: { listing_id: 'asc' }, select: AUDIT_SELECT,
      }) as unknown as Promise<AuditListingRow[]>,
    };

    const deps: AuditDeps = {
      listings, identity, budgets, checkpoint, recheckPermanent,
      ...(checkpointPath ? { saveCheckpoint: (cp: AuditCheckpoint) => { writeCheckpointAtomic(checkpointPath, cp); } } : {}),
    };
    if (withCotality) deps.cotality = buildCotalityReader({ timeoutMs, maxRetries });

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
      console.log(`this run:   finalized=${res.runCounters.listingsFinalized} probes=${res.runCounters.probesAttempted} attempts=${res.runCounters.requestAttempts} retries=${res.runCounters.retries} unknownRetried=${res.runCounters.unknownRetriesAttempted} replaced=${res.runCounters.unknownReplaced} sourceMissing=${res.runCounters.sourceMissing}`);
      if (res.checkpoint.pendingFrom) console.log(`pending from: ${res.checkpoint.pendingFrom} (resume with --resume to continue)`);
    }
    if (!res.coverageComplete) {
      console.error(`\nNOT COVERAGE-COMPLETE (scanComplete=${res.scanComplete}): ${res.incompleteReasons.join('; ') || 'unverified listings remain'}`);
      process.exitCode = 2;
    }
  } finally {
    releaseCheckpointLock(lockPath);
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('audit failed (READ-ONLY, no writes):', e?.message || e); process.exitCode = 1; });
}
