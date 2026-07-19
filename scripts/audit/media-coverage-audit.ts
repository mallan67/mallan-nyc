// scripts/audit/media-coverage-audit.ts
//
// READ-ONLY media-coverage audit LOGIC (re-derived + hardened 2026-07-19 on
// post-#539 main; reference: old PR #525 @ d7303a2f). Pure, injectable,
// testable — the tsx entry point is media-coverage-audit.cli.ts.
//
// HARDENING vs the 2026-07-16 original (Maya's #525 re-derivation order):
//   • BOUNDED NEON READING — no unbounded findMany. Keyset cursor pagination
//     (listing_id asc, deterministic), explicit page size, explicit maximum
//     listings, overall time budget, resumable checkpoint, and an INCOMPLETE
//     result whenever any limit stops the run (never silently "full audit").
//   • BOUNDED COTALITY READING — configurable max probes, max total requests,
//     bounded concurrency, per-request timeout + bounded retries (in the CLI
//     reader), overall runtime budget, full request/success/failure/retry/skip
//     accounting. OAuth failure, timeout, provider error, pagination failure,
//     skipped probe, budget exhaustion, or an interrupted run stays UNKNOWN —
//     NEVER coerced to a zero count (that would mislabel Bucket B as D).
//   • COTALITY KEYING — the proven production model: resolve the Property
//     record FIRST, take its actual ListingKey, query Media with
//     ResourceRecordKey eq '<ListingKey>', preserve the provider's actual
//     Order value, follow every valid @odata.nextLink, and classify an
//     incomplete traversal as UNKNOWN.
//   • STRICT PHOTO CLASSIFICATION — a Cotality Media row counts as a photo
//     ONLY when its category/type is PRESENT and canonically classifies to
//     Photo. This deliberately DIVERGES from the lenient production ingest
//     default (classifyTrestleMediaCategory(null) → "Photo") because audit
//     counting must be conservative: an absent category is 'unknown', never
//     a photo. Floorplans, videos, virtual tours and unknown records are
//     never counted as photos.
//   • READ-ONLY GUARANTEE — logic modules receive injected READ-ONLY reader
//     interfaces (ListingPageReader / CotalityMediaReader) that expose no
//     create/update/upsert/delete/raw/R2 method at the type level.
//
// ZERO writes. There is no apply flag of any kind.

import { isListingDisplayable } from '@/lib/search/listing-access-decision';
import { isMallanExclusiveListing } from '@/lib/listings/exclusive-agent-assignment';
import { resolveListingMediaFromRows, getPhotoGallery, type ListingMediaTableRow } from '@/lib/media/listing-media-resolver';
import { classifyTrestleMediaCategory } from '@/lib/media/media-sync-service';
import {
  classifyMediaCoverage, emptyTally,
  type BucketTally, type ListingCoverageInput, type CotalityProbe, type MediaCoverageBucket,
} from '@/lib/media/media-coverage-bucket';

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
 *  processed listing_id (exclusive); ordering MUST be listing_id asc. */
export interface ListingPageReader {
  fetchPage(cursor: string | null, pageSize: number): Promise<AuditListingRow[]>;
}

/** One raw Cotality Media row as returned by the OData Media resource. */
export interface CotalityMediaRow {
  mediaKey: string | null;
  mediaCategory: string | null;
  mediaType?: string | null;
  /** The provider's ACTUAL Order value — preserved verbatim (may be 0, >0, or
   *  negative). NEVER manufactured from an array index. */
  order: number;
  mediaUrl: string;
  preferredPhotoYn?: boolean | null;
  mediaStatus?: string | null;
}

/** READ-ONLY Cotality reader (the CLI wires the real authenticated GETs with
 *  per-request timeout + bounded retries; tests inject mocks). No method on
 *  this type can mutate anything anywhere. */
export interface CotalityMediaReader {
  /** Resolve the Property record for an RLS listing id and return its ACTUAL
   *  ListingKey. Errors are returned, never thrown. */
  resolvePropertyKey(listingId: string): Promise<{ listingKey: string } | { error: string }>;
  /** The first Media page URL for a resolved ListingKey — the implementation
   *  MUST filter `ResourceRecordKey eq '<listingKey>'`. */
  buildFirstMediaUrl(listingKey: string): string;
  /** Fetch one Media page (first URL or a returned @odata.nextLink). Errors
   *  are returned, never thrown. */
  fetchMediaPage(url: string): Promise<{ rows: CotalityMediaRow[]; nextLink: string | null } | { error: string }>;
}

// ─── Budgets, counters, checkpoint ──────────────────────────────────────────

export interface AuditBudgets {
  /** Neon keyset page size (rows per fetchPage call). */
  pageSize: number;
  /** Maximum listings processed this run — reaching it ⇒ INCOMPLETE. */
  maxListings: number;
  /** Maximum listings probed against Cotality this run. */
  maxCotalityProbes: number;
  /** Maximum TOTAL Cotality requests (property lookups + media pages). */
  maxCotalityRequests: number;
  /** Bounded probe concurrency (wave size). */
  cotalityConcurrency: number;
  /** Hard cap on media pages traversed per listing (runaway-nextLink guard). */
  maxMediaPagesPerListing: number;
  /** Overall run time budget in ms — exceeding it ⇒ INCOMPLETE. */
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

export interface CotalityCounters {
  requests: number;
  successes: number; // completed probes (confirmed count, pagination complete)
  failures: number;  // probes that ended UNKNOWN from an error/incomplete page walk
  retries: number;   // transport retries (reported by the CLI reader via onRetry)
  skipped: number;   // probes not attempted (budget exhausted / no reader)
}

export function emptyCounters(): CotalityCounters {
  return { requests: 0, successes: 0, failures: 0, retries: 0, skipped: 0 };
}

/** Resumable checkpoint — everything needed to continue WITHOUT repeating
 *  completed pages. Persisted by the CLI between runs (opaque to this module). */
export interface AuditCheckpoint {
  cursor: string | null; // last processed listing_id (exclusive)
  processed: number;
  tally: BucketTally;
  counters: CotalityCounters;
  incompleteReasons: string[];
}

export function emptyCheckpoint(): AuditCheckpoint {
  return { cursor: null, processed: 0, tally: emptyTally(), counters: emptyCounters(), incompleteReasons: [] };
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

// ─── Bounded Cotality probe (Property → ListingKey → Media, nextLink-safe) ──

export interface ProbeResultPhotos extends Array<{ order: number; sourceUrl: string; mediaKey: string | null }> {}

export type ProbeOutcome = (CotalityProbe & { photos?: ProbeResultPhotos });

/**
 * Probe ONE listing's media against live Cotality, fail-closed:
 *   1. Property lookup by ListingId → ACTUAL ListingKey (1 request).
 *   2. Media pages by ResourceRecordKey eq '<ListingKey>' following EVERY
 *      valid @odata.nextLink (1 request per page, capped).
 * ANY error, an exhausted request budget mid-walk, or a page cap hit ⇒
 * { status: 'unknown' } — an incomplete traversal is NEVER a confirmed zero.
 */
export async function probeListingMedia(
  reader: CotalityMediaReader,
  listingId: string,
  budgets: AuditBudgets,
  counters: CotalityCounters,
): Promise<ProbeOutcome> {
  if (counters.requests >= budgets.maxCotalityRequests) {
    counters.skipped += 1;
    return { status: 'unknown', reason: 'cotality request budget exhausted before probe' };
  }
  counters.requests += 1;
  const keyRes = await reader.resolvePropertyKey(listingId);
  if ('error' in keyRes) {
    counters.failures += 1;
    return { status: 'unknown', reason: `property lookup failed: ${keyRes.error}` };
  }

  const photos: ProbeResultPhotos = [];
  let nonPhotoRows = 0;
  let url: string | null = reader.buildFirstMediaUrl(keyRes.listingKey);
  let pages = 0;
  while (url) {
    if (pages >= budgets.maxMediaPagesPerListing) {
      counters.failures += 1;
      return { status: 'unknown', reason: `media pagination exceeded ${budgets.maxMediaPagesPerListing} pages — incomplete, not zero` };
    }
    if (counters.requests >= budgets.maxCotalityRequests) {
      counters.failures += 1;
      return { status: 'unknown', reason: 'cotality request budget exhausted mid-pagination — incomplete, not zero' };
    }
    counters.requests += 1;
    pages += 1;
    const page = await reader.fetchMediaPage(url);
    if ('error' in page) {
      counters.failures += 1;
      return { status: 'unknown', reason: `media page fetch failed: ${page.error}` };
    }
    for (const row of page.rows) {
      if (classifyCotalityRowStrict(row) === 'Photo') {
        // Provider Order preserved VERBATIM — never the array index.
        photos.push({ order: row.order, sourceUrl: row.mediaUrl, mediaKey: row.mediaKey ?? null });
      } else {
        nonPhotoRows += 1;
      }
    }
    url = page.nextLink;
  }
  void nonPhotoRows; // tracked for future reporting; photos are the audit signal
  counters.successes += 1;
  return { status: 'confirmed', photoCount: photos.length, photos };
}

// ─── Inventory construction (canonical gates + production classifier) ──────

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

/** PURE: build the classifier input + inventory record from one DB row + probe.
 *  Uses the CANONICAL display gate and the PRODUCTION media classifier. The
 *  ownership label comes from the SAME classifier module that delegates to the
 *  canonical isMallanExclusiveListing (PR #539 parity). */
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
  const bucket = classifyMediaCoverage(input);
  return {
    listingId: row.listing_id,
    displayable,
    // Ownership label = the REAL canonical helper, called directly (PR #539
    // parity) — never a duplicated or approximated formula. agent_id /
    // owner_client_id do not exist on this row shape and can never matter.
    ownership: isMallanExclusiveListing({ listing_id: row.listing_id, rls_eligible: row.rls_eligible })
      ? 'mallan-owned' : 'third-party',
    activeUsablePhotoCount,
    allStatusRowCount: input.allStatusRowCount,
    legacyUsablePhotoCount,
    cotality,
    bucket,
  };
}

// ─── The bounded, resumable audit ──────────────────────────────────────────

export interface AuditDeps {
  listings: ListingPageReader;
  /** LIVE read-only Cotality reader. Present ⇒ --with-cotality. Absent ⇒ probes
   *  are skipped and DB-empty listings become UNKNOWN (never B/D). */
  cotality?: CotalityMediaReader;
  budgets?: Partial<AuditBudgets>;
  /** Resume from a prior run's checkpoint (completed pages are NOT repeated). */
  checkpoint?: AuditCheckpoint;
  /** Called after every completed page with the up-to-date checkpoint. */
  saveCheckpoint?: (cp: AuditCheckpoint) => void | Promise<void>;
  /** Injectable clock for the time budget (tests). */
  now?: () => number;
}

export interface AuditResult {
  /** true ⇔ the WHOLE candidate set was processed within every budget. */
  complete: boolean;
  /** Why the run stopped early / cannot be treated as a full audit. */
  incompleteReasons: string[];
  processed: number;
  tally: BucketTally;
  inventory: InventoryRow[];
  counters: CotalityCounters;
  checkpoint: AuditCheckpoint;
}

export async function runAudit(deps: AuditDeps): Promise<AuditResult> {
  const budgets: AuditBudgets = { ...DEFAULT_BUDGETS, ...(deps.budgets || {}) };
  const now = deps.now ?? (() => Date.now());
  const startedAt = now();
  const cp: AuditCheckpoint = deps.checkpoint
    ? { ...deps.checkpoint, tally: { ...deps.checkpoint.tally }, counters: { ...deps.checkpoint.counters }, incompleteReasons: [...deps.checkpoint.incompleteReasons] }
    : emptyCheckpoint();
  const inventory: InventoryRow[] = [];
  // Budget-stop reasons from a PRIOR run are not inherited — a resumed run
  // that finishes the remainder is cumulatively complete. Counter-derived
  // reasons (probe failures/skips) are re-derived below from the cumulative
  // counters the checkpoint carries.
  const reasons = new Set<string>();
  let probesAttempted = 0;

  const overTime = () => now() - startedAt > budgets.runTimeBudgetMs;

  pageLoop:
  while (true) {
    if (cp.processed >= budgets.maxListings) { reasons.add('max-listings reached'); break; }
    if (overTime()) { reasons.add('run time budget exceeded'); break; }

    const remaining = budgets.maxListings - cp.processed;
    const take = Math.min(budgets.pageSize, remaining);
    const page = await deps.listings.fetchPage(cp.cursor, take);
    if (page.length === 0) break; // candidate set exhausted → complete

    // Pre-classify with a skipped-probe placeholder; collect DB-empty rows.
    const provisional = page.map((row) => buildInventoryRow(row, { status: 'unknown', reason: 'probe skipped' }));
    const needsProbe: number[] = [];
    for (let i = 0; i < page.length; i += 1) {
      const p = provisional[i];
      if (p.displayable && p.activeUsablePhotoCount === 0 && p.legacyUsablePhotoCount === 0) needsProbe.push(i);
    }

    // Bounded-concurrency probe waves.
    if (deps.cotality) {
      for (let w = 0; w < needsProbe.length; w += budgets.cotalityConcurrency) {
        if (overTime()) { reasons.add('run time budget exceeded'); break; }
        const wave = needsProbe.slice(w, w + budgets.cotalityConcurrency).filter((i) => {
          if (probesAttempted >= budgets.maxCotalityProbes) {
            cp.counters.skipped += 1;
            reasons.add('cotality probe budget exhausted');
            return false;
          }
          probesAttempted += 1;
          return true;
        });
        const outcomes = await Promise.all(
          wave.map((i) => probeListingMedia(deps.cotality as CotalityMediaReader, page[i].listing_id, budgets, cp.counters))
        );
        wave.forEach((i, j) => { provisional[i] = buildInventoryRow(page[i], outcomes[j]); });
      }
    } else {
      cp.counters.skipped += needsProbe.length;
    }

    for (const rec of provisional) {
      inventory.push(rec);
      cp.tally[rec.bucket] += 1;
      cp.processed += 1;
    }
    cp.cursor = page[page.length - 1].listing_id;
    cp.incompleteReasons = [...reasons];
    if (deps.saveCheckpoint) await deps.saveCheckpoint(cp);
    if (reasons.has('run time budget exceeded')) break pageLoop;
  }

  // A run with UNKNOWN probes (failed OR skipped for budget) is not a full audit.
  if (cp.counters.failures > 0) reasons.add(`${cp.counters.failures} cotality probe(s) UNKNOWN (errors/incomplete pagination)`);
  if (deps.cotality && cp.counters.skipped > 0) reasons.add(`${cp.counters.skipped} probe(s) skipped (budget)`);

  cp.incompleteReasons = [...reasons];
  return {
    complete: reasons.size === 0,
    incompleteReasons: [...reasons],
    processed: cp.processed,
    tally: cp.tally,
    inventory,
    counters: cp.counters,
    checkpoint: cp,
  };
}

/** Bounded retry helper for the CLI's transport layer (tested in isolation).
 *  Retries at most `maxRetries` times; every retry is counted. */
export async function withBoundedRetries<T>(
  attempt: () => Promise<T>,
  maxRetries: number,
  onRetry: () => void,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= maxRetries; i += 1) {
    try {
      return await attempt();
    } catch (e) {
      lastErr = e;
      if (i < maxRetries) onRetry();
    }
  }
  throw lastErr;
}
