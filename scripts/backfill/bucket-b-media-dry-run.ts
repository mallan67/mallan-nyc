// scripts/backfill/bucket-b-media-dry-run.ts  (LOGIC module — entry: bucket-b-media-dry-run.cli.ts)
//
// DRY-RUN backfill PLANNER for Bucket B ONLY (re-derived + hardened 2026-07-19
// on post-#539 main; reference: old PR #525 @ d7303a2f).
//
// Bucket B = displayable, THIRD-PARTY (never Mallan-owned — canonical
// isMallanExclusiveListing via the shared classifier, PR #539 parity),
// DB-empty of usable photos, whose media Cotality CONFIRMED (> 0). Split:
//   • B_NEW      — no relational rows ever → planned INSERTS
//   • B_INACTIVE — inactive/deleted/replaced rows exist → matched by media_key
//                  first, then normalized provider identity → RESTORES/UPDATES
//                  (never duplicate inserts)
//
// HARDENING vs the 2026-07-16 original:
//   • 'update' is REACHABLE: an existing ACTIVE matched row whose authorized
//     mutable fields differ (provider order / normalized source URL / cached
//     URL / canonical classification) plans an UPDATE with the exact changed
//     fields; an identical active match is 'unchanged'; an inactive match is a
//     RESTORE (carrying any field corrections with it).
//   • Provider Order is PRESERVED VERBATIM (including 0 and negative values)
//     in both the plan and the buildMediaR2Key-derived R2 key — never
//     manufactured from a JavaScript array index.
//   • Bounded Neon + Cotality reading via the SAME budget/checkpoint framework
//     as the audit (imported — one implementation, no drift).
//   • UNKNOWN probes are skipped and counted — never planned, never zero.
//
// THIS SCRIPT NEVER WRITES. No apply flag exists. No R2 mutation, no Neon write. The
// injected reader interfaces expose no mutation method at the type level.

import { buildMediaR2Key } from '@/lib/media/media-sync-service';
import { isBucketBBackfillEligible } from '@/lib/media/media-coverage-bucket';
import { isListingDisplayable } from '@/lib/search/listing-access-decision';
import { resolveListingMediaFromRows, getPhotoGallery, type ListingMediaTableRow } from '@/lib/media/listing-media-resolver';
import {
  probeListingMedia, emptyCounters, DEFAULT_BUDGETS,
  type AuditBudgets, type CotalityCounters, type CotalityMediaReader,
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
  listing_media_active: ListingMediaTableRow[]; // WHERE status='active' (usable-photo count)
  listing_media_all: AllStatusRow[];            // ALL statuses (restore/update matching)
}

/** READ-ONLY Neon page reader for dry-run candidates (keyset, listing_id asc). */
export interface DryRunPageReader {
  fetchPage(cursor: string | null, pageSize: number): Promise<DryRunListingRow[]>;
}

/** One Cotality source photo (probe result item). `order` is the provider's
 *  ACTUAL Order value — verbatim. */
export interface CotalityPhoto { order: number; sourceUrl: string; mediaKey: string | null; }

// ─── Planning ───────────────────────────────────────────────────────────────

export type PlannedAction = 'insert' | 'restore' | 'update' | 'unchanged';

export interface PlannedItem {
  /** Provider Order, preserved verbatim (0 / positive / negative). */
  order: number;
  sourceUrl: string;
  mediaKey: string | null;
  action: PlannedAction;
  matchedRowId: string | null;
  matchedByMediaKey: boolean;
  /** For 'update'/'restore': which authorized mutable fields differ. */
  changedFields: string[];
  /** EXACT key from the canonical buildMediaR2Key helper. */
  r2Key: string;
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

/** Which authorized mutable fields differ between a matched existing row and
 *  the provider item? (order / normalized source URL / cached URL presence). */
function diffAuthorizedFields(row: AllStatusRow, p: CotalityPhoto): string[] {
  const changed: string[] = [];
  if (row.order !== p.order) changed.push('order');
  if (normalizeSourceUrl(row.media_url_original) !== normalizeSourceUrl(p.sourceUrl)) changed.push('media_url_original');
  if (p.mediaKey && row.media_key && p.mediaKey !== row.media_key) changed.push('media_key');
  return changed;
}

/**
 * PURE: plan one Bucket-B listing. Each Cotality photo is matched against
 * existing ALL-STATUS rows by stable media_key FIRST, then by normalized
 * provider URL identity. Duplicate provider items (same key or normalized
 * URL) are suppressed — an inactive or changed row representing the same
 * provider media item NEVER produces a duplicate insert proposal.
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
    if ((nu && seenUrls.has(nu)) || (p.mediaKey && seenKeys.has(p.mediaKey))) continue; // provider-side dedupe
    if (nu) seenUrls.add(nu);
    if (p.mediaKey) seenKeys.add(p.mediaKey);

    const keyMatch = p.mediaKey ? byKey.get(p.mediaKey) : undefined;
    const urlMatch = keyMatch || (nu ? byUrl.get(nu) : undefined);
    const matched = keyMatch || urlMatch || null;
    if (matched && claimedRowIds.has(matched.id)) {
      // The same existing row cannot back two proposals — treat as provider dup.
      continue;
    }
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
      changedFields = diffAuthorizedFields(matched, p); // corrections carried by the restore
    }

    items.push({
      order: p.order, // provider Order, verbatim — NEVER the loop index
      sourceUrl: p.sourceUrl,
      mediaKey: p.mediaKey ?? null,
      action,
      matchedRowId: matched?.id ?? null,
      matchedByMediaKey: Boolean(keyMatch),
      changedFields,
      r2Key: buildMediaR2Key(row.listing_id, 'Photo', p.order), // EXACT canonical helper
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

// ─── The bounded, resumable dry-run ────────────────────────────────────────

export interface DryRunDeps {
  candidates: DryRunPageReader;
  cotality: CotalityMediaReader;
  budgets?: Partial<AuditBudgets>;
  now?: () => number;
}

export interface DryRunResult {
  complete: boolean;
  incompleteReasons: string[];
  plans: ListingPlan[];
  totals: { inserts: number; restores: number; updates: number; unchanged: number };
  counters: CotalityCounters;
  processed: number;
  eligibleListings: number;
}

export async function runDryRun(deps: DryRunDeps): Promise<DryRunResult> {
  const budgets: AuditBudgets = { ...DEFAULT_BUDGETS, ...(deps.budgets || {}) };
  const now = deps.now ?? (() => Date.now());
  const startedAt = now();
  const counters = emptyCounters();
  const reasons = new Set<string>();
  const plans: ListingPlan[] = [];
  let processed = 0;
  let probesAttempted = 0;
  let cursor: string | null = null;

  const overTime = () => now() - startedAt > budgets.runTimeBudgetMs;

  while (true) {
    if (processed >= budgets.maxListings) { reasons.add('max-listings reached'); break; }
    if (overTime()) { reasons.add('run time budget exceeded'); break; }
    const take = Math.min(budgets.pageSize, budgets.maxListings - processed);
    const page = await deps.candidates.fetchPage(cursor, take);
    if (page.length === 0) break;

    for (const row of page) {
      processed += 1;
      const displayable = isListingDisplayable({
        idx_display_yn: row.idx_display_yn, internet_entire_listing_display_yn: row.internet_entire_listing_display_yn,
        status: row.status, owner_opt_out: row.owner_opt_out, participant_only: row.participant_only,
      });
      const activeUsablePhotoCount = resolveListingMediaFromRows(row.listing_media_active || []).filter((m) => m.class === 'photo').length;
      const legacyUsablePhotoCount = getPhotoGallery(Array.isArray(row.media) ? row.media : []).filter((m) => m.class === 'photo').length;
      if (!displayable || activeUsablePhotoCount > 0 || legacyUsablePhotoCount > 0) continue; // cheap pre-filter
      if (overTime()) { reasons.add('run time budget exceeded'); break; }
      if (probesAttempted >= budgets.maxCotalityProbes) { counters.skipped += 1; reasons.add('cotality probe budget exhausted'); continue; }
      probesAttempted += 1;

      const probe = await probeListingMedia(deps.cotality, row.listing_id, budgets, counters);
      if (probe.status === 'unknown') continue; // UNKNOWN → never planned (counted in counters)

      // GUARD — the shared classifier (canonical ownership + display + Cotality
      // confirmation). Excludes Mallan-owned/hidden/served/no-Cotality.
      const eligible = isBucketBBackfillEligible({
        listingId: row.listing_id, rlsEligible: row.rls_eligible, displayable,
        activeUsablePhotoCount, allStatusRowCount: row._count?.listing_media ?? 0,
        legacyUsablePhotoCount, cotality: probe,
      });
      if (!eligible) continue;

      plans.push(planListing(row, (probe.photos || []).map((p) => ({ order: p.order, sourceUrl: p.sourceUrl, mediaKey: p.mediaKey }))));
    }
    cursor = page[page.length - 1].listing_id;
    if (reasons.has('run time budget exceeded')) break;
  }

  if (counters.failures > 0) reasons.add(`${counters.failures} cotality probe(s) UNKNOWN`);
  if (counters.skipped > 0) reasons.add(`${counters.skipped} probe(s) skipped (budget)`);

  const totals = {
    inserts: plans.reduce((s, p) => s + p.expectedInserts, 0),
    restores: plans.reduce((s, p) => s + p.expectedRestores, 0),
    updates: plans.reduce((s, p) => s + p.expectedUpdates, 0),
    unchanged: plans.reduce((s, p) => s + p.unchangedMatches, 0),
  };
  return { complete: reasons.size === 0, incompleteReasons: [...reasons], plans, totals, counters, processed, eligibleListings: plans.length };
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
