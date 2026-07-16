// scripts/backfill/bucket-b-media-dry-run.ts  (LOGIC module — entry: bucket-b-media-dry-run.cli.ts)
//
// DRY-RUN backfill PLANNER for Bucket B ONLY. Run via tsx: npm run media:backfill:dryrun
//
// Bucket B = displayable, THIRD-PARTY (never Mallan-owned), DB-empty of usable
// photos, whose media Cotality CONFIRMED (> 0). Split:
//   • B_NEW      — no relational rows ever → planned INSERTS
//   • B_INACTIVE — inactive/deleted/replaced rows exist → match by media_key AND
//                  normalized source URL, then plan RESTORES/UPDATES (never dup inserts)
//
// THIS SCRIPT NEVER WRITES. No --apply. No R2 mutation, no Neon write, no setting/
// cron/campaign change. It plans exact inserts/restores/updates/unchanged per listing,
// with EXACT R2 keys from the repo's `buildMediaR2Key`, and an HONEST rollback note.

import { buildMediaR2Key } from '@/lib/media/media-sync-service';
import { isBucketBBackfillEligible, type CotalityProbe } from '@/lib/media/media-coverage-bucket';
import { isListingDisplayable } from '@/lib/search/listing-access-decision';
import { resolveListingMediaFromRows, getPhotoGallery, type ListingMediaTableRow } from '@/lib/media/listing-media-resolver';

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

/** One Cotality source photo (read-only probe result item). */
export interface CotalityPhoto { order: number; sourceUrl: string; mediaKey?: string | null; }

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
  listing_media_active: ListingMediaTableRow[]; // WHERE status='active' (for usable-photo count)
  listing_media_all: AllStatusRow[];            // ALL statuses (for restore/insert matching)
}

export type PlannedAction = 'insert' | 'restore' | 'update' | 'unchanged';

export interface PlannedItem {
  order: number;
  sourceUrl: string;
  action: PlannedAction;
  matchedRowId: string | null;    // the existing all-status row this matches, if any
  matchedByMediaKey: boolean;
  r2Key: string;                  // EXACT key from buildMediaR2Key
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

/** Normalize a media source URL for matching: drop query string, lowercase. */
export function normalizeSourceUrl(url: string | null | undefined): string {
  const raw = String(url ?? '').trim();
  if (!raw) return '';
  try { const u = new URL(raw); return (u.origin + u.pathname).toLowerCase(); }
  catch { return raw.split('?')[0].toLowerCase(); }
}

/** PURE: plan one Bucket-B listing. Matches each Cotality photo against existing
 *  all-status rows by media_key first, then normalized source URL. */
export function planListing(row: DryRunListingRow, cotalityPhotos: CotalityPhoto[]): ListingPlan {
  const bucket: 'B_NEW' | 'B_INACTIVE' = (row._count?.listing_media ?? 0) === 0 ? 'B_NEW' : 'B_INACTIVE';

  const byKey = new Map<string, AllStatusRow>();
  const byUrl = new Map<string, AllStatusRow>();
  for (const r of row.listing_media_all || []) {
    if (r.media_key) byKey.set(r.media_key, r);
    const nu = normalizeSourceUrl(r.media_url_original || r.media_url_cached);
    if (nu) byUrl.set(nu, r);
  }

  const seen = new Set<string>();
  const items: PlannedItem[] = [];
  for (const p of cotalityPhotos) {
    const nu = normalizeSourceUrl(p.sourceUrl);
    if (nu && seen.has(nu)) continue; // per-listing source-URL dedupe → never duplicate media
    if (nu) seen.add(nu);

    const keyMatch = p.mediaKey ? byKey.get(p.mediaKey) : undefined;
    const urlMatch = keyMatch || (nu ? byUrl.get(nu) : undefined);
    const matched = keyMatch || urlMatch || null;

    let action: PlannedAction;
    if (!matched) action = 'insert';
    else if (matched.status === 'active') action = 'unchanged'; // already active (non-photo/edge)
    else action = 'restore';                                    // inactive/deleted/replaced → restore

    items.push({
      order: p.order,
      sourceUrl: p.sourceUrl,
      action,
      matchedRowId: matched?.id ?? null,
      matchedByMediaKey: Boolean(keyMatch),
      r2Key: buildMediaR2Key(row.listing_id, 'Photo', p.order), // EXACT repo helper, .jpg + photos/ folder
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

export interface DryRunDeps {
  fetchCandidates: () => Promise<DryRunListingRow[]>;
  probeCotality: (listingId: string) => Promise<CotalityProbe & { photos?: CotalityPhoto[] }>;
}

export interface DryRunResult {
  plans: ListingPlan[];
  totals: { inserts: number; restores: number; updates: number; unchanged: number };
  cotalityFailures: number;
  eligibleListings: number;
}

export async function runDryRun(deps: DryRunDeps): Promise<DryRunResult> {
  const rows = await deps.fetchCandidates();
  const plans: ListingPlan[] = [];
  let cotalityFailures = 0;

  for (const row of rows) {
    const displayable = isListingDisplayable({
      idx_display_yn: row.idx_display_yn, internet_entire_listing_display_yn: row.internet_entire_listing_display_yn,
      status: row.status, owner_opt_out: row.owner_opt_out, participant_only: row.participant_only,
    });
    const activeUsablePhotoCount = resolveListingMediaFromRows(row.listing_media_active || []).filter((m) => m.class === 'photo').length;
    const legacyUsablePhotoCount = getPhotoGallery(Array.isArray(row.media) ? row.media : []).filter((m) => m.class === 'photo').length;
    if (!displayable || activeUsablePhotoCount > 0 || legacyUsablePhotoCount > 0) continue; // cheap pre-filter

    const probe = await deps.probeCotality(row.listing_id);
    if (probe.status === 'unknown') { cotalityFailures += 1; continue; } // UNKNOWN → never planned

    // GUARD — the shared classifier. Excludes Mallan-owned/hidden/served/no-Cotality.
    const eligible = isBucketBBackfillEligible({
      listingId: row.listing_id, rlsEligible: row.rls_eligible, displayable,
      activeUsablePhotoCount, allStatusRowCount: row._count?.listing_media ?? 0,
      legacyUsablePhotoCount, cotality: probe,
    });
    if (!eligible) continue;

    plans.push(planListing(row, probe.photos || []));
  }

  const totals = {
    inserts: plans.reduce((s, p) => s + p.expectedInserts, 0),
    restores: plans.reduce((s, p) => s + p.expectedRestores, 0),
    updates: plans.reduce((s, p) => s + p.expectedUpdates, 0),
    unchanged: plans.reduce((s, p) => s + p.unchangedMatches, 0),
  };
  return { plans, totals, cotalityFailures, eligibleListings: plans.length };
}

export const ROLLBACK_NOTE =
  'ROLLBACK (for a FUTURE, separately-reviewed write PR — nothing is written here):\n' +
  '  • INSERTS are reversible from EXISTING fields: the plan records each new row\'s\n' +
  '    media_key, so rollback = UPDATE listing_media SET status=\'deleted\' WHERE\n' +
  '    media_key IN (<planned keys>), plus deletion of the mirrored R2 objects by the\n' +
  '    exact planned R2 key. No listings row is mutated.\n' +
  '  • RESTORES are reversible from the recorded PRIOR status per matchedRowId.\n' +
  '  • There is NO backfill_batch_id column today. Batch-level rollback (one id for the\n' +
  '    whole run) would require an explicitly reviewed batch-tracking mechanism — a\n' +
  '    schema change that is OUT OF SCOPE for this read-only packet. The plan above\n' +
  '    provides per-row reversibility WITHOUT any schema change.';
