// scripts/backfill/bucket-b-media-dry-run.ts  (LOGIC module — entry: bucket-b-media-dry-run.cli.ts)
//
// DRY-RUN backfill PLANNER for Bucket B ONLY (round 3 per Maya's #540
// reviews). Reference: old PR #525 @ d7303a2f.
//
// ROUND-3 ADDITIONS on top of the round-2 model (per-run budgets, pending
// rows, cumulative deduped plans, one accounting path):
//   • IDENTITY-BOUND resumable checkpoint (RunIdentity — tool/probe mode,
//     Cotality source, Neon fingerprint, schema v3) validated fail-closed.
//   • RETRYABLE UNKNOWN queue: a transient provider error is re-probed on
//     resume (bounded per-listing) and a successful probe ADDS the missing
//     plan — the dry-run never needs a restart to repair itself.
//   • R2-KEY COLLISION + AMBIGUITY DETECTION: duplicate provider Orders
//     (identical buildMediaR2Key outputs), duplicate existing media_key
//     values, duplicate existing normalized URLs, and divergent key-vs-URL
//     matches all produce a STRUCTURED CONFLICT for manual review — never an
//     executable-looking plan and never an arbitrary Map-order choice.
//   • URL identity normalization lowercases scheme+host ONLY — pathname case
//     is PRESERVED (/Photo/A.jpg ≠ /photo/a.jpg).
//   • Provider photos arrive URL-validated (the shared probe rejects
//     malformed/missing MediaURL as listing-level UNKNOWN upstream).
//   • scanComplete vs coverageComplete reported separately.
//
// THIS SCRIPT NEVER WRITES. No apply flag exists. No R2 mutation, no Neon
// write. The injected reader interfaces expose no mutation method.

import { buildMediaR2Key } from '@/lib/media/media-sync-service';
import { isBucketBBackfillEligible, isMallanOwnedCoverage } from '@/lib/media/media-coverage-bucket';
import { isListingDisplayable } from '@/lib/search/listing-access-decision';
import { resolveListingMediaFromRows, getPhotoGallery, type ListingMediaTableRow } from '@/lib/media/listing-media-resolver';
import {
  probeListingMedia, emptyCounters, makeAccountant, identitiesMatch, classifyCotalityMedia,
  DEFAULT_BUDGETS, CHECKPOINT_VERSION, MAX_UNKNOWN_RETRIES,
  type AuditBudgets, type CotalityCounters, type CotalityMediaReader, type RunCounters,
  type RunIdentity, type RetryableUnknownEntry,
} from '../audit/media-coverage-audit';

// ─── Read-only injected shapes ──────────────────────────────────────────────

export interface AllStatusRow {
  id: string;
  status: string;
  media_key: string | null;
  media_url_original: string | null;
  media_url_cached: string | null;
  order: number;
  media_type: string;
  preferred_photo_yn?: boolean | null;
}

export interface DryRunListingRow {
  listing_id: string;
  rls_eligible: boolean | null;
  status: unknown;
  idx_display_yn: unknown;
  internet_entire_listing_display_yn: unknown;
  owner_opt_out: unknown;
  participant_only: unknown;
  media: unknown;
  _count: { listing_media: number };
  listing_media_active: ListingMediaTableRow[];
  listing_media_all: AllStatusRow[];
}

export interface DryRunPageReader {
  fetchPage(cursor: string | null, pageSize: number): Promise<DryRunListingRow[]>;
  fetchByIds(listingIds: string[]): Promise<DryRunListingRow[]>;
}

export interface CotalityPhoto { order: number; sourceUrl: string; mediaKey: string | null; preferredPhotoYn?: boolean | null; }

// ─── Planning ───────────────────────────────────────────────────────────────

export type PlannedAction = 'insert' | 'restore' | 'update' | 'unchanged';

export interface PlannedItem {
  order: number;
  sourceUrl: string;
  mediaKey: string | null;
  preferredPhotoYn: boolean;
  action: PlannedAction;
  matchedRowId: string | null;
  matchedByMediaKey: boolean;
  changedFields: string[];
  r2Key: string;
}

export interface ListingPlan {
  listingId: string;
  bucket: 'B_NEW' | 'B_INACTIVE';
  /** Non-null ⇒ this listing REQUIRES MANUAL REVIEW: no executable-looking
   *  plan is emitted (items empty, expected counts zero). */
  conflict: string[] | null;
  expectedInserts: number;
  expectedRestores: number;
  expectedUpdates: number;
  unchangedMatches: number;
  items: PlannedItem[];
}

/** Normalize a media source URL for provider-identity matching: scheme+host
 *  lowercased (hosts are case-insensitive), PATHNAME CASE PRESERVED (paths
 *  may be case-sensitive), query/fragment dropped (the approved provider
 *  identity policy). */
export function normalizeSourceUrl(url: string | null | undefined): string {
  const raw = String(url ?? '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    return u.origin.toLowerCase() + u.pathname; // pathname case preserved
  } catch {
    const noQuery = raw.split(/[?#]/)[0];
    return noQuery.replace(/^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/]+)/, (m) => m.toLowerCase());
  }
}

export function diffAuthorizedFields(row: AllStatusRow, p: CotalityPhoto): string[] {
  const changed: string[] = [];
  if (p.mediaKey && !row.media_key) changed.push('media_key');
  else if (p.mediaKey && row.media_key && p.mediaKey !== row.media_key) changed.push('media_key');
  if (row.order !== p.order) changed.push('order');
  if (normalizeSourceUrl(row.media_url_original) !== normalizeSourceUrl(p.sourceUrl)) changed.push('media_url_original');
  if (!row.media_type || String(row.media_type).trim() === '' || classifyCotalityMedia(row.media_type, null) !== 'Photo') changed.push('media_type');
  if (p.preferredPhotoYn != null && Boolean(row.preferred_photo_yn) !== Boolean(p.preferredPhotoYn)) changed.push('preferred_photo_yn');
  return changed;
}

/**
 * PURE: plan one Bucket-B listing, FAIL-CLOSED on ambiguity:
 *   • duplicate existing media_key values ⇒ CONFLICT;
 *   • multiple existing rows sharing a normalized provider URL ⇒ CONFLICT;
 *   • a provider item whose media_key match and URL match are DIFFERENT
 *     rows ⇒ CONFLICT;
 *   • two distinct planned photos generating the SAME R2 key (identical
 *     provider Order — buildMediaR2Key is listingId+type+order) ⇒ CONFLICT.
 * A conflicted listing emits NO executable-looking plan.
 */
export function planListing(row: DryRunListingRow, cotalityPhotos: CotalityPhoto[]): ListingPlan {
  const bucket: 'B_NEW' | 'B_INACTIVE' = (row._count?.listing_media ?? 0) === 0 ? 'B_NEW' : 'B_INACTIVE';
  const conflicts: string[] = [];
  const conflicted = (reasons: string[]): ListingPlan => ({
    listingId: row.listing_id, bucket, conflict: reasons,
    expectedInserts: 0, expectedRestores: 0, expectedUpdates: 0, unchangedMatches: 0, items: [],
  });

  // Existing-row indexes — duplicates are AMBIGUOUS, never silently resolved.
  const byKey = new Map<string, AllStatusRow>();
  const byUrl = new Map<string, AllStatusRow>();
  for (const r of row.listing_media_all || []) {
    if (r.media_key) {
      if (byKey.has(r.media_key)) conflicts.push(`duplicate existing media_key '${r.media_key}' (rows ${byKey.get(r.media_key)!.id} and ${r.id})`);
      else byKey.set(r.media_key, r);
    }
    const nu = normalizeSourceUrl(r.media_url_original || r.media_url_cached);
    if (nu) {
      if (byUrl.has(nu)) conflicts.push(`multiple existing rows share normalized URL '${nu}' (rows ${byUrl.get(nu)!.id} and ${r.id})`);
      else byUrl.set(nu, r);
    }
  }
  if (conflicts.length > 0) return conflicted(conflicts);

  const seenUrls = new Set<string>();
  const seenKeys = new Set<string>();
  const claimedRowIds = new Set<string>();
  const r2Keys = new Map<string, number>(); // r2Key -> provider order first seen
  const items: PlannedItem[] = [];
  for (const p of cotalityPhotos) {
    const nu = normalizeSourceUrl(p.sourceUrl);
    if ((nu && seenUrls.has(nu)) || (p.mediaKey && seenKeys.has(p.mediaKey))) continue;
    if (nu) seenUrls.add(nu);
    if (p.mediaKey) seenKeys.add(p.mediaKey);

    const keyMatch = p.mediaKey ? byKey.get(p.mediaKey) : undefined;
    const urlMatch = nu ? byUrl.get(nu) : undefined;
    if (keyMatch && urlMatch && keyMatch.id !== urlMatch.id) {
      conflicts.push(`provider item (order ${p.order}) matches DIFFERENT rows by media_key (${keyMatch.id}) and URL (${urlMatch.id})`);
      continue;
    }
    const matched = keyMatch || urlMatch || null;
    if (matched && claimedRowIds.has(matched.id)) continue;
    if (matched) claimedRowIds.add(matched.id);

    const r2Key = buildMediaR2Key(row.listing_id, 'Photo', p.order);
    if (r2Keys.has(r2Key)) {
      conflicts.push(`R2 KEY COLLISION: two distinct provider photos generate '${r2Key}' (orders ${r2Keys.get(r2Key)} and ${p.order})`);
      continue;
    }
    r2Keys.set(r2Key, p.order);

    let action: PlannedAction;
    let changedFields: string[] = [];
    if (!matched) {
      action = 'insert';
    } else if (matched.status === 'active') {
      changedFields = diffAuthorizedFields(matched, p);
      action = changedFields.length > 0 ? 'update' : 'unchanged';
    } else {
      action = 'restore';
      changedFields = diffAuthorizedFields(matched, p);
    }

    items.push({
      order: p.order,
      sourceUrl: p.sourceUrl,
      mediaKey: p.mediaKey ?? null,
      preferredPhotoYn: Boolean(p.preferredPhotoYn),
      action,
      matchedRowId: matched?.id ?? null,
      matchedByMediaKey: Boolean(keyMatch),
      changedFields,
      r2Key,
    });
  }
  if (conflicts.length > 0) return conflicted(conflicts);

  // PHOTO-FIRST / HERO-FIRST: preferred photo leads, then ascending provider
  // Order. (All items are already photos — non-photos never enter the plan.)
  items.sort((a, b) => {
    if (a.preferredPhotoYn !== b.preferredPhotoYn) return a.preferredPhotoYn ? -1 : 1;
    return a.order - b.order;
  });

  return {
    listingId: row.listing_id,
    bucket,
    conflict: null,
    expectedInserts: items.filter((i) => i.action === 'insert').length,
    expectedRestores: items.filter((i) => i.action === 'restore').length,
    expectedUpdates: items.filter((i) => i.action === 'update').length,
    unchangedMatches: items.filter((i) => i.action === 'unchanged').length,
    items,
  };
}

// ─── Identity-bound resumable checkpoint ────────────────────────────────────

export interface DryRunCheckpoint {
  version: number;
  mode: 'dryrun';
  identity: RunIdentity;
  cursor: string | null;
  processed: number;
  plans: ListingPlan[];
  counters: CotalityCounters;
  retryableUnknown: RetryableUnknownEntry[];
  /** Listings that EXHAUSTED the retry policy — cumulative, unique. Blocks
   *  coverageComplete AND planComplete while non-empty. */
  permanentUnknown: RetryableUnknownEntry[];
  pendingFrom: string | null;
}

export function emptyDryRunCheckpoint(identity: RunIdentity): DryRunCheckpoint {
  return { version: CHECKPOINT_VERSION, mode: 'dryrun', identity, cursor: null, processed: 0, plans: [], counters: emptyCounters(), retryableUnknown: [], permanentUnknown: [], pendingFrom: null };
}

export function validateDryRunCheckpoint(cp: DryRunCheckpoint, expectedIdentity: RunIdentity): void {
  if (!cp || cp.version !== CHECKPOINT_VERSION) throw new Error(`checkpoint version mismatch (want ${CHECKPOINT_VERSION})`);
  if (cp.mode !== 'dryrun') throw new Error(`checkpoint mode '${cp.mode}' is not 'dryrun'`);
  if (!cp.identity) throw new Error('checkpoint has no run identity');
  const problems = identitiesMatch(cp.identity, expectedIdentity);
  if (problems.length > 0) throw new Error(`checkpoint identity mismatch — refusing to resume: ${problems.join('; ')}`);
  const ids = new Set(cp.plans.map((p) => p.listingId));
  if (ids.size !== cp.plans.length) throw new Error('checkpoint plans contain duplicate listing ids');
  if (cp.plans.length > cp.processed) throw new Error(`checkpoint does not reconcile: plans=${cp.plans.length} > processed=${cp.processed}`);
  const qids = new Set<string>();
  for (const e of cp.retryableUnknown) {
    if (qids.has(e.listingId)) throw new Error(`retryableUnknown has duplicate id ${e.listingId}`);
    qids.add(e.listingId);
    if (!Number.isInteger(e.attempts) || e.attempts < 1 || e.attempts > MAX_UNKNOWN_RETRIES) throw new Error(`retryableUnknown ${e.listingId} has invalid attempts ${e.attempts}`);
    if (ids.has(e.listingId)) throw new Error(`listing ${e.listingId} is BOTH planned and retryable-unknown — inconsistent`);
  }
  const pset = new Set<string>();
  for (const e of cp.permanentUnknown || []) {
    if (pset.has(e.listingId)) throw new Error(`permanentUnknown duplicate id ${e.listingId}`);
    pset.add(e.listingId);
    if (!Number.isInteger(e.attempts) || e.attempts < 1 || e.attempts > MAX_UNKNOWN_RETRIES) throw new Error(`permanentUnknown ${e.listingId} has invalid attempts ${e.attempts}`);
    if (qids.has(e.listingId)) throw new Error(`listing ${e.listingId} is BOTH retryable and permanent unknown`);
    if (ids.has(e.listingId)) throw new Error(`listing ${e.listingId} is BOTH planned and permanent-unknown — inconsistent`);
  }
}

// ─── The bounded, resumable, self-repairing dry-run ────────────────────────

export interface DryRunDeps {
  candidates: DryRunPageReader;
  cotality: CotalityMediaReader;
  identity: RunIdentity;
  budgets?: Partial<AuditBudgets>;
  checkpoint?: DryRunCheckpoint;
  saveCheckpoint?: (cp: DryRunCheckpoint) => void | Promise<void>;
  now?: () => number;
}

export interface DryRunResult {
  scanComplete: boolean;
  coverageComplete: boolean;
  /** planComplete = scanComplete AND coverageComplete AND no retryable
   *  unknowns AND zero conflict listings. A conflict makes this false and the
   *  CLI exit nonzero — 'manual review required' NEVER looks like success. */
  planComplete: boolean;
  incompleteReasons: string[];
  /** Non-blocking notices (e.g. source-missing) — never make a run incomplete. */
  warnings: string[];
  plans: ListingPlan[];
  conflictListings: number;
  permanentUnknownCount: number;
  totals: { inserts: number; restores: number; updates: number; unchanged: number };
  counters: CotalityCounters;
  runCounters: RunCounters;
  processed: number;
  eligibleListings: number;
  checkpoint: DryRunCheckpoint;
}

function rowSignals(row: DryRunListingRow) {
  const displayable = isListingDisplayable({
    idx_display_yn: row.idx_display_yn, internet_entire_listing_display_yn: row.internet_entire_listing_display_yn,
    status: row.status, owner_opt_out: row.owner_opt_out, participant_only: row.participant_only,
  });
  const activeUsablePhotoCount = resolveListingMediaFromRows(row.listing_media_active || []).filter((m) => m.class === 'photo').length;
  const legacyUsablePhotoCount = getPhotoGallery(Array.isArray(row.media) ? row.media : []).filter((m) => m.class === 'photo').length;
  const needsProbe = displayable && activeUsablePhotoCount === 0 && legacyUsablePhotoCount === 0
    && !isMallanOwnedCoverage({ listingId: row.listing_id, rlsEligible: row.rls_eligible });
  return { displayable, activeUsablePhotoCount, legacyUsablePhotoCount, needsProbe };
}

export async function runDryRun(deps: DryRunDeps): Promise<DryRunResult> {
  const budgets: AuditBudgets = { ...DEFAULT_BUDGETS, ...(deps.budgets || {}) };
  const now = deps.now ?? (() => Date.now());
  const startedAt = now();
  const cp: DryRunCheckpoint = deps.checkpoint
    ? JSON.parse(JSON.stringify(deps.checkpoint)) as DryRunCheckpoint
    : emptyDryRunCheckpoint(deps.identity);
  if (deps.checkpoint) validateDryRunCheckpoint(cp, deps.identity);
  const planned = new Set(cp.plans.map((p) => p.listingId));
  const reasons = new Set<string>();
  const warnings = new Set<string>(); // non-blocking (source-missing)
  const upsertPermanent = (e: RetryableUnknownEntry) => {
    const i = cp.permanentUnknown.findIndex((x) => x.listingId === e.listingId);
    if (i >= 0) cp.permanentUnknown[i] = e; else cp.permanentUnknown.push(e);
  };
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

  const probeAndMaybePlan = async (row: DryRunListingRow, signals: ReturnType<typeof rowSignals>): Promise<'planned' | 'not-eligible' | 'unknown' | 'deferred'> => {
    const probe = await probeListingMedia(deps.cotality, row.listing_id, budgets, acct);
    if (probe.status === 'unknown' && probe.deferred) return 'deferred';
    if (probe.status === 'unknown') { cp.counters.failures += 1; return 'unknown'; }
    cp.counters.successes += 1;
    const eligible = isBucketBBackfillEligible({
      listingId: row.listing_id, rlsEligible: row.rls_eligible, displayable: signals.displayable,
      activeUsablePhotoCount: signals.activeUsablePhotoCount, allStatusRowCount: row._count?.listing_media ?? 0,
      legacyUsablePhotoCount: signals.legacyUsablePhotoCount, cotality: probe,
    });
    if (eligible && !planned.has(row.listing_id)) {
      cp.plans.push(planListing(row, (probe.photos || []).map((p) => ({ order: p.order, sourceUrl: p.sourceUrl, mediaKey: p.mediaKey, preferredPhotoYn: p.preferredPhotoYn }))));
      planned.add(row.listing_id);
      return 'planned';
    }
    return 'not-eligible';
  };

  // ── Phase 0: retryable-unknown queue (RESUME REPAIR) ─────────────────────
  // Each queued listing is RE-EVALUATED against current Neon state first:
  // rowSignals recomputed, and if it no longer needs a probe (gained media,
  // went hidden, became Mallan-owned) it is DEQUEUED with ZERO Cotality
  // calls; a listing gone from Neon is DEQUEUED (source-missing, reported).
  const dropResolved = (id: string) => { const pi = cp.permanentUnknown.findIndex((x) => x.listingId === id); if (pi >= 0) cp.permanentUnknown.splice(pi, 1); };
  if (cp.retryableUnknown.length > 0) {
    const queue = [...cp.retryableUnknown];
    const stillQueued: RetryableUnknownEntry[] = [];
    let qi = 0;
    let budgetStopped = false;
    for (; qi < queue.length; qi += 1) {
      const entry = queue[qi];
      if (run.listingsFinalized >= budgets.maxListings) { reasons.add('max-listings reached (per-run, retry phase)'); budgetStopped = true; break; }
      if (overTime()) { reasons.add('run time budget exceeded (retry phase)'); budgetStopped = true; break; }
      const rows = await deps.candidates.fetchByIds([entry.listingId]); // chunked single-id read
      const row = rows[0];
      run.listingsFinalized += 1; // every EXAMINED retry consumes the budget
      if (!row) {
        run.sourceMissing += 1;
        warnings.add(`listing ${entry.listingId} removed from Neon since last run — dropped from retry queue (source-missing)`);
        continue;
      }
      const signals = rowSignals(row);
      if (!signals.needsProbe) { dropResolved(entry.listingId); continue; } // ZERO Cotality
      if (run.probesAttempted >= budgets.maxCotalityProbes) { stillQueued.push(entry); run.listingsFinalized -= 1; continue; }
      run.probesAttempted += 1;
      run.unknownRetriesAttempted += 1;
      const outcome = await probeAndMaybePlan(row, signals);
      if (outcome === 'deferred') { stillQueued.push(entry); run.listingsFinalized -= 1; continue; }
      if (outcome === 'unknown') {
        const attempts = entry.attempts + 1;
        if (attempts < budgets.maxUnknownRetriesPerListing) stillQueued.push({ listingId: entry.listingId, attempts, lastReason: 'probe unknown' });
        else upsertPermanent({ listingId: entry.listingId, attempts, lastReason: 'probe unknown' });
        continue;
      }
      if (outcome === 'planned') run.unknownReplaced += 1;
      dropResolved(entry.listingId);
    }
    if (budgetStopped) for (; qi < queue.length; qi += 1) stillQueued.push(queue[qi]);
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
    const page = await deps.candidates.fetchPage(cp.cursor, take);
    if (page.length === 0) break;

    for (const row of page) {
      if (overTime()) { reasons.add('run time budget exceeded'); cp.pendingFrom = row.listing_id; stopped = true; break; }
      const signals = rowSignals(row);
      if (!signals.needsProbe) {
        cp.processed += 1; run.listingsFinalized += 1; cp.cursor = row.listing_id;
        continue;
      }
      if (run.probesAttempted >= budgets.maxCotalityProbes) {
        reasons.add('cotality probe budget exhausted (per-run) — remaining listings pending');
        cp.pendingFrom = row.listing_id; stopped = true; break;
      }
      run.probesAttempted += 1;
      const outcome = await probeAndMaybePlan(row, signals);
      if (outcome === 'deferred') {
        reasons.add('cotality request budget exhausted (per-run) — remaining listings pending');
        cp.pendingFrom = row.listing_id; stopped = true; break;
      }
      if (outcome === 'unknown') {
        cp.retryableUnknown.push({ listingId: row.listing_id, attempts: 1, lastReason: 'probe unknown' });
      }
      cp.processed += 1; run.listingsFinalized += 1; cp.cursor = row.listing_id;
    }

    syncAcct();
    if (deps.saveCheckpoint) await deps.saveCheckpoint(cp);
    if (stopped) break;
  }

  run.elapsedMs = now() - startedAt;
  const scanComplete = ![...reasons].some((r) => r.includes('pending') || r.includes('max-listings') || r.includes('time budget'));
  if (cp.retryableUnknown.length > 0) reasons.add(`${cp.retryableUnknown.length} listing(s) queued as retryable UNKNOWN (resume to re-probe)`);
  if (cp.permanentUnknown.length > 0) reasons.add(`${cp.permanentUnknown.length} listing(s) PERMANENT UNKNOWN (retry policy exhausted)`);
  const conflictListings = cp.plans.filter((p) => p.conflict && p.conflict.length > 0).length;
  if (conflictListings > 0) reasons.add(`${conflictListings} listing(s) in CONFLICT — manual review required, no executable plan emitted`);
  const coverageComplete = scanComplete && cp.retryableUnknown.length === 0 && cp.permanentUnknown.length === 0;
  const planComplete = coverageComplete && conflictListings === 0;
  if (deps.saveCheckpoint) await deps.saveCheckpoint(cp);

  const clean = cp.plans.filter((p) => !p.conflict);
  const totals = {
    inserts: clean.reduce((s, p) => s + p.expectedInserts, 0),
    restores: clean.reduce((s, p) => s + p.expectedRestores, 0),
    updates: clean.reduce((s, p) => s + p.expectedUpdates, 0),
    unchanged: clean.reduce((s, p) => s + p.unchangedMatches, 0),
  };
  return {
    scanComplete,
    coverageComplete,
    planComplete,
    incompleteReasons: [...reasons],
    warnings: [...warnings],
    plans: cp.plans,
    conflictListings,
    permanentUnknownCount: cp.permanentUnknown.length,
    totals,
    counters: cp.counters,
    runCounters: run,
    processed: cp.processed,
    eligibleListings: clean.length,
    checkpoint: cp,
  };
}

export const ROLLBACK_NOTE =
  'ROLLBACK (for a FUTURE, separately-reviewed write PR — nothing is written here):\n' +
  '  • INSERTS are reversible from EXISTING fields: the plan records each new row\'s\n' +
  '    media_key, so rollback = UPDATE listing_media SET status=\'deleted\' WHERE\n' +
  '    media_key IN (<planned keys>), plus deletion of the mirrored R2 objects by the\n' +
  '    exact planned R2 key. No listings row is mutated.\n' +
  '  • RESTORES/UPDATES are reversible from the recorded PRIOR row state per matchedRowId.\n' +
  '  • CONFLICT listings ship NO executable plan — manual review only.\n' +
  '  • There is NO backfill_batch_id column today. Batch-level rollback (one id for the\n' +
  '    whole run) would require an explicitly reviewed batch-tracking mechanism — a\n' +
  '    schema change that is OUT OF SCOPE for this read-only packet. The plan above\n' +
  '    provides per-row reversibility WITHOUT any schema change.';
