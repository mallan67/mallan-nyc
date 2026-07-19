// scripts/backfill/bucket-b-media-dry-run.ts  (LOGIC module — entry: bucket-b-media-dry-run.cli.ts)
//
// DRY-RUN backfill PLANNER for Bucket B ONLY (re-derived + hardened 2026-07-19;
// correction round 2 per Maya's #540 review). Reference: old PR #525 @ d7303a2f.
//
// Bucket B = displayable, THIRD-PARTY (Mallan-owned listings are excluded
// BEFORE any Cotality call — canonical isMallanExclusiveListing via the shared
// classifier, PR #539 parity — consuming ZERO provider requests), DB-empty of
// usable photos, whose media Cotality CONFIRMED (> 0). Split:
//   • B_NEW      — no relational rows ever → planned INSERTS
//   • B_INACTIVE — inactive/deleted rows exist → matched by media_key first,
//                  then normalized provider identity → RESTORES/UPDATES
//
// PROOF-INTEGRITY (round 2): per-run budgets vs cumulative checkpoint;
// budget-deferred listings stay PENDING (cursor never advances past them; a
// resumed run probes them first); the checkpoint carries the CUMULATIVE
// deduplicated plans (schema version + mode, validated before resume); one
// authoritative request-accounting path (every HTTP attempt incl. retries
// consumes the per-run cap). UNKNOWN probes are never planned and never zero.
//
// UPDATE DETECTION (complete): provider mediaKey present + existing key
// missing ⇒ media_key update; differing keys after a URL match ⇒ media_key
// update; provider order difference ⇒ order update; normalized source
// difference ⇒ source update; canonical media-type classification difference
// ⇒ media_type update; preferred-photo difference ⇒ preferred_photo update.
// (media_url_cached drift is NOT detected here — no existing helper computes
// the expected cached value read-only, so no such claim is made.)
//
// THIS SCRIPT NEVER WRITES. No apply flag exists. No R2 mutation, no Neon
// write. The injected reader interfaces expose no mutation method.

import { buildMediaR2Key, classifyTrestleMediaCategory } from '@/lib/media/media-sync-service';
import { isBucketBBackfillEligible, isMallanOwnedCoverage } from '@/lib/media/media-coverage-bucket';
import { isListingDisplayable } from '@/lib/search/listing-access-decision';
import { resolveListingMediaFromRows, getPhotoGallery, type ListingMediaTableRow } from '@/lib/media/listing-media-resolver';
import {
  probeListingMedia, emptyCounters, makeAccountant, DEFAULT_BUDGETS, CHECKPOINT_VERSION,
  type AuditBudgets, type CotalityCounters, type CotalityMediaReader, type RunCounters,
} from '../audit/media-coverage-audit';

// ─── Read-only injected shapes ──────────────────────────────────────────────

/** All-status relational row the planner reads for matching (read-only). */
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
  listing_media_active: ListingMediaTableRow[]; // WHERE status='active'
  listing_media_all: AllStatusRow[];            // ALL statuses
}

/** READ-ONLY Neon page reader for dry-run candidates (keyset, listing_id asc). */
export interface DryRunPageReader {
  fetchPage(cursor: string | null, pageSize: number): Promise<DryRunListingRow[]>;
}

/** One Cotality source photo. `order` is the provider's ACTUAL, validated
 *  integer Order (the probe rejects malformed Orders as UNKNOWN upstream). */
export interface CotalityPhoto { order: number; sourceUrl: string; mediaKey: string | null; preferredPhotoYn?: boolean | null; }

// ─── Planning ───────────────────────────────────────────────────────────────

export type PlannedAction = 'insert' | 'restore' | 'update' | 'unchanged';

export interface PlannedItem {
  order: number;             // provider Order, verbatim — NEVER the loop index
  sourceUrl: string;
  mediaKey: string | null;
  action: PlannedAction;
  matchedRowId: string | null;
  matchedByMediaKey: boolean;
  changedFields: string[];
  r2Key: string;             // EXACT key from the canonical buildMediaR2Key
}

export interface ListingPlan {
  listingId: string;
  bucket: 'B_NEW' | 'B_INACTIVE';
  expectedInserts: number;
  expectedRestores: number;
  expectedUpdates: number;
  unchangedMatches: number;
  items: PlannedItem[];
}

/** Normalize a media source URL for provider-identity matching: drop query
 *  string, lowercase origin+path. */
export function normalizeSourceUrl(url: string | null | undefined): string {
  const raw = String(url ?? '').trim();
  if (!raw) return '';
  try { const u = new URL(raw); return (u.origin + u.pathname).toLowerCase(); }
  catch { return raw.split('?')[0].toLowerCase(); }
}

/**
 * COMPLETE authorized-field diff between a matched existing row and the
 * provider item. A row is NEVER 'unchanged' when a required field is missing:
 *   • provider mediaKey present + existing media_key MISSING ⇒ media_key;
 *   • both keys present and different (URL-matched row) ⇒ media_key;
 *   • provider order differs ⇒ order;
 *   • normalized source URL differs ⇒ media_url_original;
 *   • canonical media-type classification differs from Photo ⇒ media_type;
 *   • preferred-photo state differs (when the provider supplies it) ⇒
 *     preferred_photo_yn.
 */
export function diffAuthorizedFields(row: AllStatusRow, p: CotalityPhoto): string[] {
  const changed: string[] = [];
  if (p.mediaKey && !row.media_key) changed.push('media_key');            // missing key IS a change
  else if (p.mediaKey && row.media_key && p.mediaKey !== row.media_key) changed.push('media_key');
  if (row.order !== p.order) changed.push('order');
  if (normalizeSourceUrl(row.media_url_original) !== normalizeSourceUrl(p.sourceUrl)) changed.push('media_url_original');
  // A MISSING media_type is a change too (never "unchanged" on a missing
  // required field); the lenient ingest default must not mask it.
  if (!row.media_type || String(row.media_type).trim() === '' || classifyTrestleMediaCategory(row.media_type) !== 'Photo') changed.push('media_type');
  if (p.preferredPhotoYn != null && Boolean(row.preferred_photo_yn) !== Boolean(p.preferredPhotoYn)) changed.push('preferred_photo_yn');
  return changed;
}

/**
 * PURE: plan one Bucket-B listing. Matching: stable media_key FIRST, then
 * normalized provider URL identity. Duplicate provider items and rows already
 * claimed by a proposal are suppressed — never a duplicate insert.
 */
export function planListing(row: DryRunListingRow, cotalityPhotos: CotalityPhoto[]): ListingPlan {
  const bucket: 'B_NEW' | 'B_INACTIVE' = (row._count?.listing_media ?? 0) === 0 ? 'B_NEW' : 'B_INACTIVE';

  const byKey = new Map<string, AllStatusRow>();
  const byUrl = new Map<string, AllStatusRow>();
  for (const r of row.listing_media_all || []) {
    if (r.media_key) byKey.set(r.media_key, r);
    const nu = normalizeSourceUrl(r.media_url_original || r.media_url_cached);
    if (nu && !byUrl.has(nu)) byUrl.set(nu, r);
  }

  const seenUrls = new Set<string>();
  const seenKeys = new Set<string>();
  const claimedRowIds = new Set<string>();
  const items: PlannedItem[] = [];
  for (const p of cotalityPhotos) {
    const nu = normalizeSourceUrl(p.sourceUrl);
    if ((nu && seenUrls.has(nu)) || (p.mediaKey && seenKeys.has(p.mediaKey))) continue;
    if (nu) seenUrls.add(nu);
    if (p.mediaKey) seenKeys.add(p.mediaKey);

    const keyMatch = p.mediaKey ? byKey.get(p.mediaKey) : undefined;
    const urlMatch = keyMatch || (nu ? byUrl.get(nu) : undefined);
    const matched = keyMatch || urlMatch || null;
    if (matched && claimedRowIds.has(matched.id)) continue;
    if (matched) claimedRowIds.add(matched.id);

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
      action,
      matchedRowId: matched?.id ?? null,
      matchedByMediaKey: Boolean(keyMatch),
      changedFields,
      r2Key: buildMediaR2Key(row.listing_id, 'Photo', p.order),
    });
  }

  return {
    listingId: row.listing_id,
    bucket,
    expectedInserts: items.filter((i) => i.action === 'insert').length,
    expectedRestores: items.filter((i) => i.action === 'restore').length,
    expectedUpdates: items.filter((i) => i.action === 'update').length,
    unchangedMatches: items.filter((i) => i.action === 'unchanged').length,
    items,
  };
}

// ─── Resumable checkpoint ───────────────────────────────────────────────────

export interface DryRunCheckpoint {
  version: number;
  mode: 'dryrun';
  cursor: string | null;      // last FINALIZED listing_id (exclusive)
  processed: number;          // cumulative candidates examined + finalized
  plans: ListingPlan[];       // cumulative, deduped by listingId
  counters: CotalityCounters; // cumulative
  pendingFrom: string | null;
}

export function emptyDryRunCheckpoint(): DryRunCheckpoint {
  return { version: CHECKPOINT_VERSION, mode: 'dryrun', cursor: null, processed: 0, plans: [], counters: emptyCounters(), pendingFrom: null };
}

export function validateDryRunCheckpoint(cp: DryRunCheckpoint): void {
  if (!cp || cp.version !== CHECKPOINT_VERSION) throw new Error(`checkpoint version mismatch (want ${CHECKPOINT_VERSION})`);
  if (cp.mode !== 'dryrun') throw new Error(`checkpoint mode '${cp.mode}' is not 'dryrun'`);
  const ids = new Set(cp.plans.map((p) => p.listingId));
  if (ids.size !== cp.plans.length) throw new Error('checkpoint plans contain duplicate listing ids');
  if (cp.plans.length > cp.processed) throw new Error(`checkpoint does not reconcile: plans=${cp.plans.length} > processed=${cp.processed}`);
}

// ─── The bounded, resumable dry-run ────────────────────────────────────────

export interface DryRunDeps {
  candidates: DryRunPageReader;
  cotality: CotalityMediaReader;
  budgets?: Partial<AuditBudgets>;
  checkpoint?: DryRunCheckpoint;
  saveCheckpoint?: (cp: DryRunCheckpoint) => void | Promise<void>;
  now?: () => number;
}

export interface DryRunResult {
  complete: boolean;
  incompleteReasons: string[];
  /** CUMULATIVE plans/totals (checkpoint-carried, deduped). */
  plans: ListingPlan[];
  totals: { inserts: number; restores: number; updates: number; unchanged: number };
  counters: CotalityCounters;
  runCounters: RunCounters;
  processed: number;
  eligibleListings: number;
  checkpoint: DryRunCheckpoint;
}

export async function runDryRun(deps: DryRunDeps): Promise<DryRunResult> {
  const budgets: AuditBudgets = { ...DEFAULT_BUDGETS, ...(deps.budgets || {}) };
  const now = deps.now ?? (() => Date.now());
  const startedAt = now();
  const cp: DryRunCheckpoint = deps.checkpoint
    ? JSON.parse(JSON.stringify(deps.checkpoint)) as DryRunCheckpoint
    : emptyDryRunCheckpoint();
  if (deps.checkpoint) validateDryRunCheckpoint(cp);
  const planned = new Set(cp.plans.map((p) => p.listingId));
  const reasons = new Set<string>();
  const acct = makeAccountant(budgets.maxCotalityRequests); // PER-RUN cap
  const run: RunCounters = { listingsFinalized: 0, probesAttempted: 0, requestAttempts: 0, retries: 0, elapsedMs: 0 };
  cp.pendingFrom = null;

  const overTime = () => now() - startedAt > budgets.runTimeBudgetMs;
  let stopped = false;

  while (!stopped) {
    if (run.listingsFinalized >= budgets.maxListings) { reasons.add('max-listings reached (per-run)'); break; }
    if (overTime()) { reasons.add('run time budget exceeded'); break; }
    const take = Math.min(budgets.pageSize, budgets.maxListings - run.listingsFinalized);
    const page = await deps.candidates.fetchPage(cp.cursor, take);
    if (page.length === 0) break;

    for (const row of page) {
      if (overTime()) { reasons.add('run time budget exceeded'); cp.pendingFrom = row.listing_id; stopped = true; break; }
      const displayable = isListingDisplayable({
        idx_display_yn: row.idx_display_yn, internet_entire_listing_display_yn: row.internet_entire_listing_display_yn,
        status: row.status, owner_opt_out: row.owner_opt_out, participant_only: row.participant_only,
      });
      const activeUsablePhotoCount = resolveListingMediaFromRows(row.listing_media_active || []).filter((m) => m.class === 'photo').length;
      const legacyUsablePhotoCount = getPhotoGallery(Array.isArray(row.media) ? row.media : []).filter((m) => m.class === 'photo').length;
      // Cheap pre-filters — INCLUDING the canonical Mallan exclusion, so a
      // Mallan-owned listing consumes ZERO Cotality requests.
      const needsProbe = displayable && activeUsablePhotoCount === 0 && legacyUsablePhotoCount === 0
        && !isMallanOwnedCoverage({ listingId: row.listing_id, rlsEligible: row.rls_eligible });
      if (!needsProbe) {
        cp.processed += 1; run.listingsFinalized += 1; cp.cursor = row.listing_id;
        continue;
      }
      if (run.probesAttempted >= budgets.maxCotalityProbes) {
        reasons.add('cotality probe budget exhausted (per-run) — remaining listings pending');
        cp.pendingFrom = row.listing_id; stopped = true; break;
      }
      run.probesAttempted += 1;
      const probe = await probeListingMedia(deps.cotality, row.listing_id, budgets, acct);
      if (probe.status === 'unknown' && probe.deferred) {
        reasons.add('cotality request budget exhausted (per-run) — remaining listings pending');
        cp.pendingFrom = row.listing_id; stopped = true; break;
      }
      if (probe.status === 'unknown') {
        cp.counters.failures += 1;
        cp.processed += 1; run.listingsFinalized += 1; cp.cursor = row.listing_id;
        continue; // genuine error → examined but never planned
      }
      cp.counters.successes += 1;

      const eligible = isBucketBBackfillEligible({
        listingId: row.listing_id, rlsEligible: row.rls_eligible, displayable,
        activeUsablePhotoCount, allStatusRowCount: row._count?.listing_media ?? 0,
        legacyUsablePhotoCount, cotality: probe,
      });
      if (eligible && !planned.has(row.listing_id)) {
        cp.plans.push(planListing(row, (probe.photos || []).map((p) => ({ order: p.order, sourceUrl: p.sourceUrl, mediaKey: p.mediaKey, preferredPhotoYn: p.preferredPhotoYn }))));
        planned.add(row.listing_id);
      }
      cp.processed += 1; run.listingsFinalized += 1; cp.cursor = row.listing_id;
    }

    cp.counters.requests += acct.attempts - run.requestAttempts;
    cp.counters.retries += acct.retries - run.retries;
    run.requestAttempts = acct.attempts;
    run.retries = acct.retries;
    if (deps.saveCheckpoint) await deps.saveCheckpoint(cp);
    if (stopped) break;
  }

  run.elapsedMs = now() - startedAt;
  if (cp.counters.failures > 0) reasons.add(`${cp.counters.failures} cotality probe(s) UNKNOWN (errors) — those listings were never planned`);
  if (deps.saveCheckpoint) await deps.saveCheckpoint(cp);

  const totals = {
    inserts: cp.plans.reduce((s, p) => s + p.expectedInserts, 0),
    restores: cp.plans.reduce((s, p) => s + p.expectedRestores, 0),
    updates: cp.plans.reduce((s, p) => s + p.expectedUpdates, 0),
    unchanged: cp.plans.reduce((s, p) => s + p.unchangedMatches, 0),
  };
  return {
    complete: reasons.size === 0,
    incompleteReasons: [...reasons],
    plans: cp.plans,
    totals,
    counters: cp.counters,
    runCounters: run,
    processed: cp.processed,
    eligibleListings: cp.plans.length,
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
  '  • There is NO backfill_batch_id column today. Batch-level rollback (one id for the\n' +
  '    whole run) would require an explicitly reviewed batch-tracking mechanism — a\n' +
  '    schema change that is OUT OF SCOPE for this read-only packet. The plan above\n' +
  '    provides per-row reversibility WITHOUT any schema change.';
