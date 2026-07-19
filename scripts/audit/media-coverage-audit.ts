// scripts/audit/media-coverage-audit.ts
//
// READ-ONLY media-coverage audit LOGIC (re-derived + hardened 2026-07-19 on
// post-#539 main; reference: old PR #525 @ d7303a2f; correction round 2 per
// Maya's #540 review). Pure, injectable, testable — the tsx entry point is
// media-coverage-audit.cli.ts.
//
// PROOF-INTEGRITY MODEL (the round-2 corrections):
//   • PER-RUN budgets vs CUMULATIVE checkpoint totals are SEPARATE. Every
//     invocation gets fresh per-run counters (listings, probes, HTTP request
//     attempts, retries, elapsed time); the checkpoint accumulates totals.
//     Resuming with the SAME --max-listings / --max-requests continues after
//     the prior cursor instead of stopping immediately.
//   • PENDING rows are never finalized by a budget stop. When the probe /
//     request / time budget runs out at row i, rows [0..i-1] finalize, the
//     cursor stops at row i-1, and row i (and everything after) stays
//     PENDING — a resumed run re-fetches it first and can turn it into a
//     confirmed classification. The cursor NEVER advances past an unresolved
//     row. (Genuine provider ERRORS still finalize as U with an incomplete
//     reason — only budget stops defer.)
//   • The checkpoint carries the CUMULATIVE deduplicated inventory (schema
//     version + mode + cursor), validated before resume; processed == tally
//     sum == inventory length always reconcile.
//   • ONE authoritative Cotality accounting path: a RequestAccountant is the
//     only way an HTTP attempt happens — EVERY attempt (including every
//     retry) consumes the per-run request cap and is counted in the returned
//     counters. The transport cannot exceed the cap.
//
// Plus round-1 rules: canonical ownership (isMallanExclusiveListing — and
// Mallan-owned listings are excluded BEFORE any probe, consuming ZERO
// Cotality requests, classifying E, never U/D) · canonical display gate ·
// production media classifier for DB counts · STRICT probe classification
// (absent category/type is never a photo) · Property → ACTUAL ListingKey →
// Media by ResourceRecordKey with full nextLink traversal (ambiguous or
// zero Property matches ⇒ UNKNOWN; malformed provider Order ⇒ UNKNOWN,
// never NaN) · fail-closed everywhere.
//
// ZERO writes. There is no apply flag of any kind.

import { isListingDisplayable } from '@/lib/search/listing-access-decision';
import { resolveListingMediaFromRows, getPhotoGallery, type ListingMediaTableRow } from '@/lib/media/listing-media-resolver';
import { classifyTrestleMediaCategory } from '@/lib/media/media-sync-service';
import {
  classifyMediaCoverage, emptyTally, isMallanOwnedCoverage,
  type BucketTally, type ListingCoverageInput, type CotalityProbe, type MediaCoverageBucket,
} from '@/lib/media/media-coverage-bucket';

export const CHECKPOINT_VERSION = 2;

// ─── Read-only injected interfaces ──────────────────────────────────────────

/** The SELECT the audit issues (read-only). Active rows carry the full resolver
 *  shape so we count photos with the production classifier; `_count` is the
 *  all-status existence signal; `media` is the legacy JSON. */
export interface AuditListingRow {
  listing_id: string;
  rls_eligible: boolean | null;
  status: unknown;
  idx_display_yn: unknown;
  internet_entire_listing_display_yn: unknown;
  owner_opt_out: unknown;
  participant_only: unknown;
  media: unknown;
  _count: { listing_media: number };
  listing_media: ListingMediaTableRow[]; // WHERE status='active'
}

/** READ-ONLY Neon page reader. The ONLY database capability the audit logic
 *  can reach — no mutation method exists on this type. `cursor` is the last
 *  FINALIZED listing_id (exclusive); ordering MUST be listing_id asc. */
export interface ListingPageReader {
  fetchPage(cursor: string | null, pageSize: number): Promise<AuditListingRow[]>;
}

/** One raw Cotality Media row as returned by the OData Media resource. */
export interface CotalityMediaRow {
  mediaKey: string | null;
  mediaCategory: string | null;
  mediaType?: string | null;
  /** The provider's ACTUAL Order value — preserved verbatim. May arrive
   *  malformed; the probe REJECTS non-finite/non-integer values as UNKNOWN. */
  order: unknown;
  mediaUrl: string;
  preferredPhotoYn?: boolean | null;
  mediaStatus?: string | null;
}

/**
 * The ONLY authoritative Cotality request-accounting path. Every actual HTTP
 * attempt — including every retry — MUST go through consume(); when it
 * returns false the cap is reached and NO request may be made.
 */
export interface RequestAccountant {
  /** Try to consume one HTTP attempt from the per-run cap. */
  consume(): boolean;
  /** Record that the attempt just consumed was a RETRY. */
  countRetry(): void;
  readonly attempts: number;
  readonly retries: number;
}

export function makeAccountant(maxAttempts: number): RequestAccountant {
  let attempts = 0;
  let retries = 0;
  return {
    consume() {
      if (attempts >= maxAttempts) return false;
      attempts += 1;
      return true;
    },
    countRetry() { retries += 1; },
    get attempts() { return attempts; },
    get retries() { return retries; },
  };
}

/** READ-ONLY Cotality reader. Implementations receive the accountant and MUST
 *  route every HTTP attempt (incl. retries) through it. Errors are returned,
 *  never thrown. A cap-stop is returned as { deferred: true }. */
export interface CotalityMediaReader {
  resolvePropertyKey(listingId: string, acct: RequestAccountant):
    Promise<{ listingKey: string } | { error: string; deferred?: boolean }>;
  buildFirstMediaUrl(listingKey: string): string;
  fetchMediaPage(url: string, acct: RequestAccountant):
    Promise<{ rows: CotalityMediaRow[]; nextLink: string | null } | { error: string; deferred?: boolean }>;
}

// ─── Budgets (ALL per-run) ──────────────────────────────────────────────────

export interface AuditBudgets {
  /** Neon keyset page size (rows per fetchPage call). */
  pageSize: number;
  /** Maximum listings FINALIZED this run — reaching it defers the rest. */
  maxListings: number;
  /** Maximum probes attempted this run. */
  maxCotalityProbes: number;
  /** Maximum TOTAL Cotality HTTP attempts this run (lookups + pages + RETRIES). */
  maxCotalityRequests: number;
  /** Bounded probe concurrency (wave size). */
  cotalityConcurrency: number;
  /** Hard cap on media pages traversed per listing (runaway-nextLink guard). */
  maxMediaPagesPerListing: number;
  /** Overall run time budget in ms — exceeding it defers the rest. */
  runTimeBudgetMs: number;
}

export const DEFAULT_BUDGETS: AuditBudgets = {
  pageSize: 200,
  maxListings: 1_000,
  maxCotalityProbes: 100,
  maxCotalityRequests: 500,
  cotalityConcurrency: 2,
  maxMediaPagesPerListing: 10,
  runTimeBudgetMs: 10 * 60 * 1000,
};

// ─── Cumulative counters + checkpoint ───────────────────────────────────────

export interface CotalityCounters {
  requests: number;  // cumulative HTTP attempts (incl. retries)
  successes: number; // completed probes
  failures: number;  // probes finalized UNKNOWN from a genuine error
  retries: number;   // cumulative transport retries
  skipped: number;   // probes finalized UNKNOWN because no reader was supplied
}

export function emptyCounters(): CotalityCounters {
  return { requests: 0, successes: 0, failures: 0, retries: 0, skipped: 0 };
}

export interface InventoryRow {
  listingId: string;
  displayable: boolean;
  ownership: 'mallan-owned' | 'third-party';
  activeUsablePhotoCount: number;
  allStatusRowCount: number;
  legacyUsablePhotoCount: number;
  cotality: CotalityProbe;
  bucket: MediaCoverageBucket;
}

/** Resumable checkpoint: cumulative totals + the FULL deduplicated inventory.
 *  Validated (version/mode/reconciliation) before any resume. */
export interface AuditCheckpoint {
  version: number;
  mode: 'audit';
  cursor: string | null;   // last FINALIZED listing_id (exclusive)
  processed: number;       // cumulative finalized listings
  tally: BucketTally;      // cumulative
  counters: CotalityCounters; // cumulative
  inventory: InventoryRow[];  // cumulative, deduped by listingId
  /** First listing left pending by the last run's budget stop (reporting only —
   *  resume re-fetches it via the cursor). */
  pendingFrom: string | null;
}

export function emptyCheckpoint(): AuditCheckpoint {
  return {
    version: CHECKPOINT_VERSION, mode: 'audit', cursor: null, processed: 0,
    tally: emptyTally(), counters: emptyCounters(), inventory: [], pendingFrom: null,
  };
}

/** Fail-closed checkpoint validation before resume: schema version, mode, and
 *  processed == inventory length == tally sum must all reconcile. Throws. */
export function validateCheckpoint(cp: AuditCheckpoint, mode: 'audit'): void {
  if (!cp || cp.version !== CHECKPOINT_VERSION) throw new Error(`checkpoint version mismatch (want ${CHECKPOINT_VERSION})`);
  if (cp.mode !== mode) throw new Error(`checkpoint mode '${cp.mode}' is not '${mode}'`);
  const tallySum = Object.values(cp.tally).reduce((s, n) => s + n, 0);
  const ids = new Set(cp.inventory.map((r) => r.listingId));
  if (cp.processed !== cp.inventory.length || cp.processed !== tallySum || ids.size !== cp.inventory.length) {
    throw new Error(`checkpoint does not reconcile: processed=${cp.processed} inventory=${cp.inventory.length} tallySum=${tallySum} uniqueIds=${ids.size}`);
  }
}

// ─── Strict audit-side photo classification ────────────────────────────────

/**
 * STRICT: a Cotality Media row is a photo ONLY when a category/type value is
 * PRESENT and the canonical classifier maps it to "Photo". An absent value is
 * 'unknown' — deliberately stricter than the production ingest default
 * (classifyTrestleMediaCategory(null) → "Photo"), because a conservative
 * audit must never count an unclassifiable record as a photo.
 */
export function classifyCotalityRowStrict(row: Pick<CotalityMediaRow, 'mediaCategory' | 'mediaType'>): 'Photo' | 'FloorPlan' | 'Video' | 'VirtualTour' | 'unknown' {
  const source = row.mediaCategory ?? row.mediaType ?? null;
  if (source == null || String(source).trim() === '') return 'unknown';
  return classifyTrestleMediaCategory(String(source));
}

// ─── Bounded Cotality probe ────────────────────────────────────────────────

export interface CotalityPhotoItem { order: number; sourceUrl: string; mediaKey: string | null; preferredPhotoYn: boolean | null; }

export type ProbeOutcome =
  | { status: 'confirmed'; photoCount: number; photos: CotalityPhotoItem[] }
  | { status: 'unknown'; reason: string; deferred?: boolean };

/**
 * Probe ONE listing's media against live Cotality, fail-closed:
 *   Property lookup (ambiguous/zero matches ⇒ UNKNOWN) → ACTUAL ListingKey →
 *   Media pages by ResourceRecordKey following EVERY valid nextLink.
 * A cap/budget stop is returned as deferred (the caller keeps the listing
 * PENDING); any genuine error or malformed provider Order ⇒ UNKNOWN — an
 * incomplete traversal is NEVER a confirmed zero and NaN never propagates.
 */
export async function probeListingMedia(
  reader: CotalityMediaReader,
  listingId: string,
  budgets: AuditBudgets,
  acct: RequestAccountant,
): Promise<ProbeOutcome> {
  const keyRes = await reader.resolvePropertyKey(listingId, acct);
  if ('error' in keyRes) {
    return { status: 'unknown', reason: `property lookup: ${keyRes.error}`, deferred: keyRes.deferred };
  }
  if (!keyRes.listingKey || String(keyRes.listingKey).trim() === '') {
    return { status: 'unknown', reason: 'property lookup returned an empty ListingKey' };
  }

  const photos: CotalityPhotoItem[] = [];
  let url: string | null = reader.buildFirstMediaUrl(keyRes.listingKey);
  let pages = 0;
  while (url) {
    if (pages >= budgets.maxMediaPagesPerListing) {
      return { status: 'unknown', reason: `media pagination exceeded ${budgets.maxMediaPagesPerListing} pages — incomplete, not zero` };
    }
    pages += 1;
    const page = await reader.fetchMediaPage(url, acct);
    if ('error' in page) {
      return { status: 'unknown', reason: `media page: ${page.error}`, deferred: page.deferred };
    }
    for (const row of page.rows) {
      if (classifyCotalityRowStrict(row) !== 'Photo') continue;
      // Provider Order must be a finite integer — malformed Order is UNKNOWN
      // and can never reach a plan or an R2 key.
      if (typeof row.order !== 'number' || !Number.isFinite(row.order) || !Number.isInteger(row.order)) {
        return { status: 'unknown', reason: `malformed provider Order (${String(row.order)}) — cannot trust the media set` };
      }
      photos.push({ order: row.order, sourceUrl: row.mediaUrl, mediaKey: row.mediaKey ?? null, preferredPhotoYn: row.preferredPhotoYn ?? null });
    }
    url = page.nextLink;
  }
  return { status: 'confirmed', photoCount: photos.length, photos };
}

// ─── Inventory construction ────────────────────────────────────────────────

/** PURE: build the classifier input + inventory record from one DB row + probe.
 *  Uses the CANONICAL display gate and the PRODUCTION media classifier; the
 *  ownership label is the REAL canonical helper (PR #539 parity). */
export function buildInventoryRow(row: AuditListingRow, cotality: CotalityProbe): InventoryRow {
  const displayable = isListingDisplayable({
    idx_display_yn: row.idx_display_yn,
    internet_entire_listing_display_yn: row.internet_entire_listing_display_yn,
    status: row.status,
    owner_opt_out: row.owner_opt_out,
    participant_only: row.participant_only,
  });
  const activeUsablePhotoCount = resolveListingMediaFromRows(row.listing_media || [])
    .filter((m) => m.class === 'photo').length;
  const legacyUsablePhotoCount = getPhotoGallery(Array.isArray(row.media) ? row.media : [])
    .filter((m) => m.class === 'photo').length;

  const input: ListingCoverageInput = {
    listingId: row.listing_id,
    rlsEligible: row.rls_eligible,
    displayable,
    activeUsablePhotoCount,
    allStatusRowCount: row._count?.listing_media ?? 0,
    legacyUsablePhotoCount,
    cotality,
  };
  return {
    listingId: row.listing_id,
    displayable,
    ownership: isMallanOwnedCoverage(input) ? 'mallan-owned' : 'third-party',
    activeUsablePhotoCount,
    allStatusRowCount: input.allStatusRowCount,
    legacyUsablePhotoCount,
    cotality,
    bucket: classifyMediaCoverage(input),
  };
}

/** Does this row need a live probe? Mallan-owned listings NEVER do — they
 *  classify E without a probe and must consume zero Cotality requests. */
export function needsCotalityProbe(row: AuditListingRow): boolean {
  const provisional = buildInventoryRow(row, { status: 'unknown', reason: 'pre-check' });
  if (!provisional.displayable) return false;
  if (provisional.activeUsablePhotoCount > 0 || provisional.legacyUsablePhotoCount > 0) return false;
  if (isMallanOwnedCoverage({ listingId: row.listing_id, rlsEligible: row.rls_eligible })) return false;
  return true;
}

// ─── The bounded, resumable audit ──────────────────────────────────────────

export interface RunCounters {
  listingsFinalized: number;
  probesAttempted: number;
  requestAttempts: number;
  retries: number;
  elapsedMs: number;
}

export interface AuditDeps {
  listings: ListingPageReader;
  cotality?: CotalityMediaReader;
  budgets?: Partial<AuditBudgets>;
  checkpoint?: AuditCheckpoint;
  saveCheckpoint?: (cp: AuditCheckpoint) => void | Promise<void>;
  now?: () => number;
}

export interface AuditResult {
  /** true ⇔ the whole candidate set is finalized AND no probe ever errored. */
  complete: boolean;
  incompleteReasons: string[];
  /** CUMULATIVE (checkpoint-carried) values — inventory covers EVERY
   *  cumulatively processed listing, deduped, reconciling with processed. */
  processed: number;
  tally: BucketTally;
  inventory: InventoryRow[];
  counters: CotalityCounters;
  runCounters: RunCounters;
  checkpoint: AuditCheckpoint;
}

export async function runAudit(deps: AuditDeps): Promise<AuditResult> {
  const budgets: AuditBudgets = { ...DEFAULT_BUDGETS, ...(deps.budgets || {}) };
  const now = deps.now ?? (() => Date.now());
  const startedAt = now();
  const cp: AuditCheckpoint = deps.checkpoint
    ? JSON.parse(JSON.stringify(deps.checkpoint)) as AuditCheckpoint
    : emptyCheckpoint();
  if (deps.checkpoint) validateCheckpoint(cp, 'audit');
  const seen = new Set(cp.inventory.map((r) => r.listingId));
  const reasons = new Set<string>();
  const acct = makeAccountant(budgets.maxCotalityRequests); // PER-RUN cap
  const run: RunCounters = { listingsFinalized: 0, probesAttempted: 0, requestAttempts: 0, retries: 0, elapsedMs: 0 };
  cp.pendingFrom = null;

  const overTime = () => now() - startedAt > budgets.runTimeBudgetMs;
  const finalize = (row: AuditListingRow, probe: CotalityProbe) => {
    if (seen.has(row.listing_id)) return; // dedupe guard — never double-counted
    const rec = buildInventoryRow(row, probe);
    cp.inventory.push(rec);
    seen.add(row.listing_id);
    cp.tally[rec.bucket] += 1;
    cp.processed += 1;
    run.listingsFinalized += 1;
    cp.cursor = row.listing_id;
  };

  let stopped = false;
  while (!stopped) {
    if (run.listingsFinalized >= budgets.maxListings) { reasons.add('max-listings reached (per-run)'); break; }
    if (overTime()) { reasons.add('run time budget exceeded'); break; }
    const take = Math.min(budgets.pageSize, budgets.maxListings - run.listingsFinalized);
    const page = await deps.listings.fetchPage(cp.cursor, take);
    if (page.length === 0) break; // candidate set exhausted

    // Rows are finalized STRICTLY IN ORDER. A budget stop at row i leaves
    // rows [i..] pending: not tallied, not counted, cursor NOT advanced.
    let i = 0;
    while (i < page.length) {
      if (overTime()) { reasons.add('run time budget exceeded'); cp.pendingFrom = page[i].listing_id; stopped = true; break; }
      const row = page[i];
      if (!deps.cotality || !needsCotalityProbe(row)) {
        if (deps.cotality === undefined && needsCotalityProbe(row)) cp.counters.skipped += 1;
        finalize(row, { status: 'unknown', reason: deps.cotality ? 'probe not needed' : 'probe skipped (no --with-cotality)' });
        i += 1;
        continue;
      }
      // Wave of consecutive probe-needing rows, bounded by concurrency AND the
      // per-run probe budget.
      const wave: number[] = [];
      let j = i;
      while (j < page.length && wave.length < budgets.cotalityConcurrency && needsCotalityProbe(page[j])) {
        if (run.probesAttempted + wave.length >= budgets.maxCotalityProbes) break;
        wave.push(j);
        j += 1;
      }
      if (wave.length === 0) {
        // Probe budget exhausted BEFORE this row → the row stays PENDING.
        reasons.add('cotality probe budget exhausted (per-run) — remaining listings pending');
        cp.pendingFrom = row.listing_id;
        stopped = true;
        break;
      }
      run.probesAttempted += wave.length;
      const outcomes = await Promise.all(
        wave.map((k) => probeListingMedia(deps.cotality as CotalityMediaReader, page[k].listing_id, budgets, acct))
      );
      // Finalize in order until the first DEFERRED outcome (cap/budget stop).
      let deferredAt = -1;
      for (let w = 0; w < wave.length; w += 1) {
        const out = outcomes[w];
        if (out.status === 'unknown' && out.deferred) { deferredAt = w; break; }
        if (out.status === 'unknown') cp.counters.failures += 1;
        else cp.counters.successes += 1;
        finalize(page[wave[w]], out.status === 'confirmed' ? { status: 'confirmed', photoCount: out.photoCount } : { status: 'unknown', reason: out.reason });
      }
      if (deferredAt >= 0) {
        reasons.add('cotality request budget exhausted (per-run) — remaining listings pending');
        cp.pendingFrom = page[wave[deferredAt]].listing_id;
        stopped = true;
        break;
      }
      i = wave[wave.length - 1] + 1;
    }

    cp.counters.requests += acct.attempts - (run.requestAttempts);
    cp.counters.retries += acct.retries - run.retries;
    run.requestAttempts = acct.attempts;
    run.retries = acct.retries;
    if (deps.saveCheckpoint) await deps.saveCheckpoint(cp);
    if (stopped) break;
  }

  run.elapsedMs = now() - startedAt;
  // Cumulative genuine-error UNKNOWNs keep the audit honest-incomplete; budget
  // deferrals are per-run reasons already recorded (pending rows remain).
  if (cp.counters.failures > 0) reasons.add(`${cp.counters.failures} cotality probe(s) UNKNOWN (errors)`);

  if (deps.saveCheckpoint) await deps.saveCheckpoint(cp);
  return {
    complete: reasons.size === 0,
    incompleteReasons: [...reasons],
    processed: cp.processed,
    tally: cp.tally,
    inventory: cp.inventory,
    counters: cp.counters,
    runCounters: run,
    checkpoint: cp,
  };
}

/**
 * Bounded-retry transport helper — the ONLY sanctioned way the CLI reader
 * makes HTTP attempts. EVERY attempt (first + each retry) consumes the
 * accountant; when the cap is hit the error carries `capStop` so the probe
 * returns DEFERRED (pending), never a false UNKNOWN-error.
 */
export class CapStopError extends Error {
  capStop = true;
}
export async function attemptWithAccounting<T>(
  attempt: () => Promise<T>,
  acct: RequestAccountant,
  maxRetries: number,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= maxRetries; i += 1) {
    if (!acct.consume()) throw new CapStopError('cotality request cap reached');
    if (i > 0) acct.countRetry();
    try {
      return await attempt();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}
