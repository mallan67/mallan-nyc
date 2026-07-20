// scripts/audit/media-coverage-audit.ts
//
// READ-ONLY media-coverage audit LOGIC (re-derived 2026-07-19; correction
// round 3 per Maya's #540 reviews). Pure, injectable, testable — the tsx
// entry point is media-coverage-audit.cli.ts.
//
// ROUND-3 INTEGRITY/SECURITY MODEL:
//   • SECURE NEXTLINK — validateNextLink() PARSES the link (new URL relative
//     to BASE), requires https, rejects embedded credentials, requires EXACT
//     origin equality with the allowed Cotality origin AND a pathname inside
//     the allowed OData path — BEFORE any Authorization header is sent.
//     String prefixes are never used.
//   • IDENTITY-BOUND CHECKPOINTS — every checkpoint carries a non-secret
//     RunIdentity (tool mode, probe mode neon-only/cotality, normalized
//     Cotality origin+path, non-secret Neon fingerprint, schema version,
//     checkpoint path). Resume FAILS CLOSED on any mismatch: a Neon-only
//     checkpoint can never resume in Cotality mode, and a checkpoint from one
//     database/provider can never resume against another.
//   • VALIDATED PROVIDER URLS — a photo is usable only when classification is
//     Photo AND Order is a finite integer AND MediaURL parses as an absolute
//     http(s) URL. A malformed/missing MediaURL makes the WHOLE listing probe
//     UNKNOWN — it never counts, never plans, never generates an R2 key.
//   • RETRYABLE UNKNOWN — a genuine provider error finalizes as U AND is
//     queued in checkpoint.retryableUnknown. A resumed run re-probes the
//     queue FIRST (bounded by the same per-run budgets) and REPLACES the U
//     record (tally adjusted, no duplicates) on success. The audit never
//     needs a restart to repair a transient failure.
//   • scanComplete vs coverageComplete — a Neon-only run may complete its
//     database scan while media coverage remains UNVERIFIED (U rows); the
//     two claims are reported separately and never conflated.
//
// Round-2 model retained: per-run budgets vs cumulative checkpoint; pending
// rows (cursor never passes an unresolved listing); cumulative deduplicated
// inventory; ONE authoritative request-accounting path (every HTTP attempt
// incl. every retry consumes the per-run cap).
//
// ZERO writes. There is no apply flag of any kind.

import { isListingDisplayable } from '@/lib/search/listing-access-decision';
import { resolveListingMediaFromRows, getPhotoGallery, type ListingMediaTableRow } from '@/lib/media/listing-media-resolver';
import {
  classifyMediaCoverage, emptyTally, isMallanOwnedCoverage,
  type BucketTally, type ListingCoverageInput, type CotalityProbe, type MediaCoverageBucket,
} from '@/lib/media/media-coverage-bucket';

export const CHECKPOINT_VERSION = 4;

// ─── Run identity (non-secret) ──────────────────────────────────────────────

export interface RunIdentity {
  schemaVersion: number;
  /** Non-secret tool/code revision — a semantics change bumps this and
   *  invalidates checkpoints written by an older classifier. */
  toolVersion: string;
  toolMode: 'audit' | 'dryrun';
  probeMode: 'neon-only' | 'cotality';
  /** Normalized allowed Cotality origin+path (null in neon-only mode). */
  cotalitySource: string | null;
  /** One-way fingerprint of the NON-SECRET Cotality client identity
   *  (IDX_CLIENT_ID / IDX_API_KEY) — never the secret/token. Null in
   *  neon-only mode. */
  cotalityClientFingerprint: string | null;
  /** Non-secret Neon fingerprint of the sanitized connection identity
   *  (host+port+db+user+schema) — never the password. */
  neonFingerprint: string;
  /** The checkpoint/output path this identity is bound to (null = in-memory). */
  checkpointPath: string | null;
}

/** The current classifier/semantics revision. BUMP when audit classification
 *  or bucket semantics change so older checkpoints are rejected on resume. */
export const TOOL_VERSION = 'media-coverage-audit@2026-07-20-r4';

export function identitiesMatch(a: RunIdentity, b: RunIdentity): string[] {
  const problems: string[] = [];
  if (a.schemaVersion !== b.schemaVersion) problems.push(`schemaVersion ${a.schemaVersion} != ${b.schemaVersion}`);
  if (a.toolVersion !== b.toolVersion) problems.push(`toolVersion ${a.toolVersion} != ${b.toolVersion}`);
  if (a.toolMode !== b.toolMode) problems.push(`toolMode ${a.toolMode} != ${b.toolMode}`);
  if (a.probeMode !== b.probeMode) problems.push(`probeMode ${a.probeMode} != ${b.probeMode}`);
  if (a.cotalitySource !== b.cotalitySource) problems.push('cotalitySource differs');
  if (a.cotalityClientFingerprint !== b.cotalityClientFingerprint) problems.push('cotalityClientFingerprint differs');
  if (a.neonFingerprint !== b.neonFingerprint) problems.push('neonFingerprint differs');
  if (a.checkpointPath !== b.checkpointPath) problems.push('checkpointPath differs');
  return problems;
}

// ─── Secure nextLink validation ────────────────────────────────────────────

/**
 * Validate a provider-supplied nextLink BEFORE any authenticated request.
 * PARSES the URL (never string prefixes): https only, no embedded
 * credentials, EXACT allowed-origin equality, pathname inside the allowed
 * OData path. Returns the resolved absolute URL or the rejection reason.
 */
export function validateNextLink(nextLink: string, base: string): { url: string } | { error: string } {
  let allowed: URL;
  let candidate: URL;
  try { allowed = new URL(base); } catch { return { error: 'allowed base is not a valid URL' }; }
  try { candidate = new URL(nextLink, base); } catch { return { error: 'nextLink is not a valid URL' }; }
  if (candidate.protocol !== 'https:') return { error: `nextLink protocol '${candidate.protocol}' is not https` };
  if (candidate.username || candidate.password) return { error: 'nextLink embeds credentials — rejected' };
  if (candidate.origin !== allowed.origin) return { error: `nextLink origin '${candidate.origin}' is not the allowed Cotality origin` };
  const allowedPathPrefix = allowed.pathname.replace(/\/$/, '') + '/odata/';
  if (!candidate.pathname.startsWith(allowedPathPrefix)) {
    return { error: `nextLink path '${candidate.pathname}' is outside the allowed OData path` };
  }
  return { url: candidate.toString() };
}

// ─── Read-only injected interfaces ──────────────────────────────────────────

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

/** READ-ONLY Neon page reader — the ONLY database capability the logic can
 *  reach. Also used for targeted re-fetch of retryable-unknown listings. */
export interface ListingPageReader {
  fetchPage(cursor: string | null, pageSize: number): Promise<AuditListingRow[]>;
  /** Fetch EXACTLY these listings (retry queue). Same read-only select. */
  fetchByIds(listingIds: string[]): Promise<AuditListingRow[]>;
}

export interface CotalityMediaRow {
  mediaKey: string | null;
  mediaCategory: string | null;
  mediaType?: string | null;
  order: unknown;   // provider Order verbatim — VALIDATED by the probe
  mediaUrl: unknown; // provider MediaURL verbatim — VALIDATED by the probe
  preferredPhotoYn?: boolean | null;
  mediaStatus?: string | null;
}

export interface RequestAccountant {
  consume(): boolean;
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

export interface CotalityMediaReader {
  resolvePropertyKey(listingId: string, acct: RequestAccountant):
    Promise<{ listingKey: string } | { error: string; deferred?: boolean }>;
  buildFirstMediaUrl(listingKey: string): string;
  fetchMediaPage(url: string, acct: RequestAccountant):
    Promise<{ rows: CotalityMediaRow[]; nextLink: string | null } | { error: string; deferred?: boolean }>;
}

// ─── Budgets (ALL per-run) ──────────────────────────────────────────────────

export interface AuditBudgets {
  pageSize: number;
  maxListings: number;
  maxCotalityProbes: number;
  maxCotalityRequests: number;
  cotalityConcurrency: number;
  maxMediaPagesPerListing: number;
  runTimeBudgetMs: number;
  /** Max times a retryable-unknown listing is re-probed across runs before it
   *  becomes a permanent (non-queued) UNKNOWN. */
  maxUnknownRetriesPerListing: number;
}

export const DEFAULT_BUDGETS: AuditBudgets = {
  pageSize: 200,
  maxListings: 1_000,
  maxCotalityProbes: 100,
  maxCotalityRequests: 500,
  cotalityConcurrency: 2,
  maxMediaPagesPerListing: 10,
  runTimeBudgetMs: 10 * 60 * 1000,
  maxUnknownRetriesPerListing: 3,
};

// ─── Counters + checkpoint ──────────────────────────────────────────────────

export interface CotalityCounters {
  requests: number;
  successes: number;
  failures: number;  // historical error-probe events (replacements do not erase history)
  retries: number;
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

export interface RetryableUnknownEntry { listingId: string; attempts: number; lastReason: string; }

export interface AuditCheckpoint {
  version: number;
  mode: 'audit';
  identity: RunIdentity;
  cursor: string | null;
  processed: number;
  tally: BucketTally;
  counters: CotalityCounters;
  inventory: InventoryRow[];
  /** Genuine-error UNKNOWNs eligible for bounded re-probing on resume. */
  retryableUnknown: RetryableUnknownEntry[];
  pendingFrom: string | null;
}

export function emptyCheckpoint(identity: RunIdentity): AuditCheckpoint {
  return {
    version: CHECKPOINT_VERSION, mode: 'audit', identity, cursor: null, processed: 0,
    tally: emptyTally(), counters: emptyCounters(), inventory: [], retryableUnknown: [], pendingFrom: null,
  };
}

/** Fail-closed checkpoint validation before resume: schema version, mode,
 *  FULL run identity, and count reconciliation. Throws. */
export function validateCheckpoint(cp: AuditCheckpoint, expectedIdentity: RunIdentity): void {
  if (!cp || cp.version !== CHECKPOINT_VERSION) throw new Error(`checkpoint version mismatch (want ${CHECKPOINT_VERSION})`);
  if (cp.mode !== 'audit') throw new Error(`checkpoint mode '${cp.mode}' is not 'audit'`);
  if (!cp.identity) throw new Error('checkpoint has no run identity');
  const problems = identitiesMatch(cp.identity, expectedIdentity);
  if (problems.length > 0) throw new Error(`checkpoint identity mismatch — refusing to resume: ${problems.join('; ')}`);
  const tallySum = Object.values(cp.tally).reduce((s, n) => s + n, 0);
  const ids = new Set(cp.inventory.map((r) => r.listingId));
  if (cp.processed !== cp.inventory.length || cp.processed !== tallySum || ids.size !== cp.inventory.length) {
    throw new Error(`checkpoint does not reconcile: processed=${cp.processed} inventory=${cp.inventory.length} tallySum=${tallySum} uniqueIds=${ids.size}`);
  }
  validateRetryQueue(cp.retryableUnknown, cp.inventory);
}

/** Validate the retryable-unknown queue: unique ids, positive bounded attempt
 *  counts, and each queued id has a corresponding U inventory record. */
export function validateRetryQueue(queue: RetryableUnknownEntry[], inventory: InventoryRow[]): void {
  const qids = new Set<string>();
  const uById = new Map(inventory.map((r) => [r.listingId, r]));
  for (const e of queue) {
    if (qids.has(e.listingId)) throw new Error(`retryableUnknown has duplicate id ${e.listingId}`);
    qids.add(e.listingId);
    if (!Number.isInteger(e.attempts) || e.attempts < 1 || e.attempts > 100) throw new Error(`retryableUnknown ${e.listingId} has invalid attempts ${e.attempts}`);
    const rec = uById.get(e.listingId);
    if (!rec || rec.bucket !== 'U' || rec.cotality.status !== 'unknown') throw new Error(`retryableUnknown ${e.listingId} lacks a matching U inventory record`);
  }
}

// ─── Explicit conservative Cotality media classification ───────────────────
//
// The production classifyTrestleMediaCategory DELIBERATELY maps every
// unrecognized string to "Photo" (ingest leniency). That is unsafe for a
// coverage audit: Cotality's real MediaCategory enum includes Document,
// Disclosure, Map, Survey, Other, AgentPhoto, OfficePhoto, etc., and
// MediaType includes Pdf/Docx/Xlsx/... — none of which are LISTING photos.
// So the audit uses its OWN explicit allowlists (from the live $metadata,
// 2026-07-19) and NEVER defaults to Photo.

export type AuditMediaClass = 'Photo' | 'FloorPlan' | 'Video' | 'VirtualTour' | 'Document' | 'Other' | 'unknown';

/** MediaCategory values that ARE a listing photo (exactly — AgentPhoto,
 *  OfficePhoto, AerialView, OfficeLogo are NOT listing photos). */
const PHOTO_CATEGORIES = new Set(['photo']);
const FLOORPLAN_CATEGORIES = new Set(['floorplan']);
const VIRTUALTOUR_CATEGORIES = new Set(['brandedvirtualtour', 'unbrandedvirtualtour', 'virtualtour']);
const VIDEO_CATEGORIES = new Set(['video', 'aerialview']);
const DOCUMENT_CATEGORIES = new Set(['addendum', 'disclosure', 'document', 'map', 'rentaldocuments', 'restriction', 'survey', 'topography']);
const OTHER_CATEGORIES = new Set(['agentphoto', 'officelogo', 'officephoto', 'other']);
/** Raster IMAGE MediaTypes that establish a photo when NO category is present.
 *  SVG is intentionally excluded (floor plans/maps are commonly SVG). */
const IMAGE_TYPES = new Set(['jpeg', 'jpg', 'png', 'gif', 'bmp', 'tiff', 'tif']);
const VIDEO_TYPES = new Set(['mov', 'mp4', 'mpeg', 'quicktime', 'wmv', 'avi']);
const DOCUMENT_TYPES = new Set(['pdf', 'doc', 'docx', 'rtf', 'txt', 'xls', 'xlsx', 'pptx', 'wps', 'htm', 'html', 'svg']);

/**
 * Explicit conservative classification of one Cotality Media row.
 * MediaCategory has precedence when present; MediaType is consulted ONLY
 * when the category is absent, and only an explicit image type yields Photo.
 * NOTHING falls through to Photo — an unrecognized value is 'unknown'.
 */
export function classifyCotalityMedia(category: string | null | undefined, type: string | null | undefined): AuditMediaClass {
  const cat = category != null && String(category).trim() !== '' ? String(category).toLowerCase().trim() : null;
  if (cat) {
    if (PHOTO_CATEGORIES.has(cat)) return 'Photo';
    if (FLOORPLAN_CATEGORIES.has(cat)) return 'FloorPlan';
    if (VIRTUALTOUR_CATEGORIES.has(cat)) return 'VirtualTour';
    if (VIDEO_CATEGORIES.has(cat)) return 'Video';
    if (DOCUMENT_CATEGORIES.has(cat)) return 'Document';
    if (OTHER_CATEGORIES.has(cat)) return 'Other';
    return 'unknown'; // present but unrecognized — NEVER a photo
  }
  const t = type != null && String(type).trim() !== '' ? String(type).toLowerCase().trim() : null;
  if (!t) return 'unknown';
  if (IMAGE_TYPES.has(t)) return 'Photo';
  if (VIDEO_TYPES.has(t)) return 'Video';
  if (DOCUMENT_TYPES.has(t)) return 'Document';
  return 'unknown';
}

/** Back-compat shim: prior name, now delegating to the explicit classifier. */
export function classifyCotalityRowStrict(row: Pick<CotalityMediaRow, 'mediaCategory' | 'mediaType'>): AuditMediaClass {
  return classifyCotalityMedia(row.mediaCategory, row.mediaType);
}

/** A usable provider photo URL must be a non-empty ABSOLUTE http(s) URL. */
export function isValidProviderMediaUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.trim() === '') return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

// ─── Bounded Cotality probe ────────────────────────────────────────────────

export interface CotalityPhotoItem { order: number; sourceUrl: string; mediaKey: string | null; preferredPhotoYn: boolean | null; }

export type ProbeOutcome =
  | { status: 'confirmed'; photoCount: number; photos: CotalityPhotoItem[] }
  | { status: 'unknown'; reason: string; deferred?: boolean };

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
      if (classifyCotalityMedia(row.mediaCategory, row.mediaType) !== 'Photo') continue;
      if (typeof row.order !== 'number' || !Number.isFinite(row.order) || !Number.isInteger(row.order)) {
        return { status: 'unknown', reason: `malformed provider Order (${String(row.order)}) — cannot trust the media set` };
      }
      if (!isValidProviderMediaUrl(row.mediaUrl)) {
        return { status: 'unknown', reason: 'malformed/missing provider MediaURL on a Photo row — cannot trust the media set' };
      }
      photos.push({ order: row.order, sourceUrl: row.mediaUrl, mediaKey: row.mediaKey ?? null, preferredPhotoYn: row.preferredPhotoYn ?? null });
    }
    url = page.nextLink;
  }
  return { status: 'confirmed', photoCount: photos.length, photos };
}

// ─── Inventory construction ────────────────────────────────────────────────

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

export function needsCotalityProbe(row: AuditListingRow): boolean {
  const provisional = buildInventoryRow(row, { status: 'unknown', reason: 'pre-check' });
  if (!provisional.displayable) return false;
  if (provisional.activeUsablePhotoCount > 0 || provisional.legacyUsablePhotoCount > 0) return false;
  if (isMallanOwnedCoverage({ listingId: row.listing_id, rlsEligible: row.rls_eligible })) return false;
  return true;
}

// ─── The bounded, resumable, self-repairing audit ──────────────────────────

export interface RunCounters {
  listingsFinalized: number;
  probesAttempted: number;
  requestAttempts: number;
  retries: number;
  elapsedMs: number;
  unknownRetriesAttempted: number;
  unknownReplaced: number;
  sourceMissing: number;
}

export interface AuditDeps {
  listings: ListingPageReader;
  cotality?: CotalityMediaReader;
  identity: RunIdentity;
  budgets?: Partial<AuditBudgets>;
  checkpoint?: AuditCheckpoint;
  saveCheckpoint?: (cp: AuditCheckpoint) => void | Promise<void>;
  now?: () => number;
}

export interface AuditResult {
  /** The database scan finished (candidate set exhausted, nothing pending). */
  scanComplete: boolean;
  /** Every provider-required listing is verified: no U rows remain and no
   *  retryable unknowns are queued. A Neon-only run can NEVER claim this
   *  while probe-requiring listings exist. */
  coverageComplete: boolean;
  incompleteReasons: string[];
  processed: number;
  tally: BucketTally;
  inventory: InventoryRow[];
  counters: CotalityCounters;
  runCounters: RunCounters;
  checkpoint: AuditCheckpoint;
}

/** Replace an existing inventory record (tally-adjusted, no duplicates). */
function replaceInventoryRecord(cp: AuditCheckpoint, rec: InventoryRow): void {
  const idx = cp.inventory.findIndex((r) => r.listingId === rec.listingId);
  if (idx < 0) throw new Error(`cannot replace missing inventory record ${rec.listingId}`);
  cp.tally[cp.inventory[idx].bucket] -= 1;
  cp.tally[rec.bucket] += 1;
  cp.inventory[idx] = rec;
}

export async function runAudit(deps: AuditDeps): Promise<AuditResult> {
  const budgets: AuditBudgets = { ...DEFAULT_BUDGETS, ...(deps.budgets || {}) };
  const now = deps.now ?? (() => Date.now());
  const startedAt = now();
  const cp: AuditCheckpoint = deps.checkpoint
    ? JSON.parse(JSON.stringify(deps.checkpoint)) as AuditCheckpoint
    : emptyCheckpoint(deps.identity);
  if (deps.checkpoint) validateCheckpoint(cp, deps.identity);
  const seen = new Set(cp.inventory.map((r) => r.listingId));
  const reasons = new Set<string>();
  const acct = makeAccountant(budgets.maxCotalityRequests);
  const run: RunCounters = { listingsFinalized: 0, probesAttempted: 0, requestAttempts: 0, retries: 0, elapsedMs: 0, unknownRetriesAttempted: 0, unknownReplaced: 0, sourceMissing: 0 };
  cp.pendingFrom = null;

  const overTime = () => now() - startedAt > budgets.runTimeBudgetMs;
  const syncAcct = () => {
    cp.counters.requests += acct.attempts - run.requestAttempts;
    cp.counters.retries += acct.retries - run.retries;
    run.requestAttempts = acct.attempts;
    run.retries = acct.retries;
  };
  const finalize = (row: AuditListingRow, probe: CotalityProbe) => {
    if (seen.has(row.listing_id)) return;
    const rec = buildInventoryRow(row, probe);
    cp.inventory.push(rec);
    seen.add(row.listing_id);
    cp.tally[rec.bucket] += 1;
    cp.processed += 1;
    run.listingsFinalized += 1;
    cp.cursor = cp.cursor && cp.cursor > row.listing_id ? cp.cursor : row.listing_id;
  };

  // ── Phase 0: retryable-unknown queue (RESUME REPAIR) — before any pages ──
  // Each queued listing is RE-EVALUATED against CURRENT Neon state first: if
  // it no longer needs a Cotality probe (gained active/legacy media, went
  // hidden, became Mallan-owned) its inventory is rebuilt from Neon with ZERO
  // provider calls; if it vanished from Neon it becomes a reported
  // SOURCE_MISSING state (removed from inventory + tally, dequeued) — never a
  // forever-queued "not re-fetchable". Only genuinely still-probe-needing
  // listings hit Cotality.
  if (deps.cotality && cp.retryableUnknown.length > 0) {
    const stillQueued: RetryableUnknownEntry[] = [];
    const queue = [...cp.retryableUnknown];
    const rows = await deps.listings.fetchByIds(queue.map((q) => q.listingId));
    const byId = new Map(rows.map((r) => [r.listing_id, r]));
    for (const entry of queue) {
      const row = byId.get(entry.listingId);
      if (!row) {
        // Listing removed from Neon between runs — deterministic policy:
        // drop its stale inventory record + tally slot and dequeue. Counted
        // separately as source-missing.
        const idx = cp.inventory.findIndex((r) => r.listingId === entry.listingId);
        if (idx >= 0) {
          cp.tally[cp.inventory[idx].bucket] -= 1;
          cp.inventory.splice(idx, 1);
          cp.processed -= 1;
          seen.clear();
          for (const r of cp.inventory) seen.add(r.listingId);
        }
        run.sourceMissing += 1;
        reasons.add(`listing ${entry.listingId} removed from Neon since last run — dropped (source-missing)`);
        continue;
      }
      // RE-EVALUATE: does it still need a provider probe at all?
      if (!needsCotalityProbe(row)) {
        replaceInventoryRecord(cp, buildInventoryRow(row, { status: 'unknown', reason: 'no longer needs a Cotality probe (Neon state changed)' }));
        run.unknownReplaced += 1;
        continue; // ZERO Cotality requests
      }
      if (overTime() || run.probesAttempted >= budgets.maxCotalityProbes) { stillQueued.push(entry); continue; }
      run.probesAttempted += 1;
      run.unknownRetriesAttempted += 1;
      const probe = await probeListingMedia(deps.cotality, row.listing_id, budgets, acct);
      if (probe.status === 'unknown' && probe.deferred) { stillQueued.push(entry); continue; } // cap — try next run
      if (probe.status === 'unknown') {
        const attempts = entry.attempts + 1;
        if (attempts < budgets.maxUnknownRetriesPerListing) {
          stillQueued.push({ listingId: entry.listingId, attempts, lastReason: probe.reason });
        } else {
          reasons.add(`listing ${entry.listingId} exhausted unknown-retries (${attempts}) — permanent UNKNOWN`);
        }
        cp.counters.failures += 1;
        replaceInventoryRecord(cp, buildInventoryRow(row, { status: 'unknown', reason: probe.reason }));
        continue;
      }
      cp.counters.successes += 1;
      run.unknownReplaced += 1;
      replaceInventoryRecord(cp, buildInventoryRow(row, { status: 'confirmed', photoCount: probe.photoCount }));
    }
    cp.retryableUnknown = stillQueued;
    syncAcct();
    if (deps.saveCheckpoint) await deps.saveCheckpoint(cp);
  }

  // ── Phase 1: cursor pages ────────────────────────────────────────────────
  let stopped = false;
  while (!stopped) {
    if (run.listingsFinalized >= budgets.maxListings) { reasons.add('max-listings reached (per-run)'); break; }
    if (overTime()) { reasons.add('run time budget exceeded'); break; }
    const take = Math.min(budgets.pageSize, budgets.maxListings - run.listingsFinalized);
    const page = await deps.listings.fetchPage(cp.cursor, take);
    if (page.length === 0) break;

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
      const wave: number[] = [];
      let j = i;
      while (j < page.length && wave.length < budgets.cotalityConcurrency && needsCotalityProbe(page[j])) {
        if (run.probesAttempted + wave.length >= budgets.maxCotalityProbes) break;
        wave.push(j);
        j += 1;
      }
      if (wave.length === 0) {
        reasons.add('cotality probe budget exhausted (per-run) — remaining listings pending');
        cp.pendingFrom = row.listing_id;
        stopped = true;
        break;
      }
      run.probesAttempted += wave.length;
      const outcomes = await Promise.all(
        wave.map((k) => probeListingMedia(deps.cotality as CotalityMediaReader, page[k].listing_id, budgets, acct))
      );
      let deferredAt = -1;
      for (let w = 0; w < wave.length; w += 1) {
        const out = outcomes[w];
        if (out.status === 'unknown' && out.deferred) { deferredAt = w; break; }
        if (out.status === 'unknown') {
          cp.counters.failures += 1;
          cp.retryableUnknown.push({ listingId: page[wave[w]].listing_id, attempts: 1, lastReason: out.reason });
          finalize(page[wave[w]], { status: 'unknown', reason: out.reason });
        } else {
          cp.counters.successes += 1;
          finalize(page[wave[w]], { status: 'confirmed', photoCount: out.photoCount });
        }
      }
      if (deferredAt >= 0) {
        reasons.add('cotality request budget exhausted (per-run) — remaining listings pending');
        cp.pendingFrom = page[wave[deferredAt]].listing_id;
        stopped = true;
        break;
      }
      i = wave[wave.length - 1] + 1;
    }

    syncAcct();
    if (deps.saveCheckpoint) await deps.saveCheckpoint(cp);
    if (stopped) break;
  }

  run.elapsedMs = now() - startedAt;
  const scanComplete = reasons.size === 0 || ![...reasons].some((r) => r.includes('pending') || r.includes('max-listings') || r.includes('time budget'));
  const unresolvedU = cp.inventory.filter((r) => r.cotality.status === 'unknown' && r.bucket === 'U').length;
  const coverageComplete = scanComplete && unresolvedU === 0 && cp.retryableUnknown.length === 0;
  // (source-missing drops are surfaced in incompleteReasons; they reduce the
  //  candidate set rather than leaving coverage unverified.)
  if (cp.retryableUnknown.length > 0) reasons.add(`${cp.retryableUnknown.length} listing(s) queued as retryable UNKNOWN (resume to re-probe)`);
  if (unresolvedU > 0 && !deps.cotality) reasons.add(`${unresolvedU} listing(s) UNVERIFIED (Neon-only run — coverage NOT verified)`);
  else if (unresolvedU > cp.retryableUnknown.length) reasons.add(`${unresolvedU - cp.retryableUnknown.length} listing(s) remain permanent UNKNOWN`);

  if (deps.saveCheckpoint) await deps.saveCheckpoint(cp);
  return {
    scanComplete,
    coverageComplete,
    incompleteReasons: [...reasons],
    processed: cp.processed,
    tally: cp.tally,
    inventory: cp.inventory,
    counters: cp.counters,
    runCounters: run,
    checkpoint: cp,
  };
}

// ─── Transport helper (ONE accounting path) ────────────────────────────────

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
