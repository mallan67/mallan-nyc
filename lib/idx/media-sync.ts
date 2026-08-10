// lib/idx/media-sync.ts
//
// Media sync service — Checkpoint 1 (cursor helpers only).
//
// Master refactor PR 3 (memory/REFACTOR-2026-04-25.md). Per the bite-sized
// commit plan, this file lands incrementally:
//   Checkpoint 1 (this commit) — MediaSyncState cursor read/write helpers.
//   Checkpoint 2 — listing_media upsert path with idempotency.
//   Checkpoint 3 — derived Listing column population (primary_photo_url etc).
//   Checkpoint 4 — R2 upload + reuse behavior.
//   Checkpoint 5 — cron route at app/api/cron/media-sync/route.ts.
//   Checkpoint 6 — retry / partial-failure / concurrency guard.
//
// Why a two-tier cursor:
//   Per Trestle's 2026-04-07 vendor guidance,
//     - Property.PhotosChangeTimestamp is the high-level trigger that fires
//       when ANY of a listing's media has changed.
//     - Media.ModificationTimestamp / MediaModificationTimestamp is the per-row
//       change-detection field within those flagged listings.
//   Tracking both lets us first identify changed listings cheaply, then
//   precisely walk their per-row Media changes without over-fetching.
//
// Why a single resource key "Media":
//   The schema's `MediaSyncState.resource` column is `@unique`. We pin to a
//   single row keyed by `RESOURCE_MEDIA = "Media"` so the entire media-sync
//   state lives in one row across the cron's lifetime. Other resource keys
//   (e.g. "Member" if/when we sync agents) can be added later without
//   touching this row.

import prisma from "@/lib/prisma";
// Canonical media classification — REUSED here so the persisted summary and the
// public reader cannot disagree. Do not reimplement it in this module.
import { classifyMediaItem } from "@/lib/media/listing-media-resolver";
// THE one R2 policy/retry interpreter. The semantic constants are OWNED there so
// this module can consume the interpreter without a circular import — that cycle
// is exactly why the URL-refresh decision below ended up doing its own
// `r2_attempts` arithmetic instead of asking the owner.
import {
  isR2PolicyExcluded,
  R2_RETRY_EXHAUSTED_THRESHOLD,
  R2_POLICY_PARKED_ATTEMPTS,
} from "@/lib/media/r2-policy-state";
// Re-exported for existing importers and their tests: one definition, two import
// paths, no copy.
export { R2_RETRY_EXHAUSTED_THRESHOLD, R2_POLICY_PARKED_ATTEMPTS };
import { publicListingChangeTags } from "@/lib/cache/public-listing-change-tags";
import {
  SEARCH_CACHE_TAG,
  listingCacheTag,
  newRevalidationCounters,
  safeRevalidateTags,
} from "@/lib/cache/public-cache";
import type { Prisma } from "@prisma/client";
import {
  buildMediaR2Key,
  classifyTrestleMediaCategory,
} from "@/lib/media/media-sync-service";
import {
  existsInR2 as defaultExistsInR2,
  getR2PublicUrl as defaultGetR2PublicUrl,
  uploadToR2 as defaultUploadToR2,
} from "@/lib/images/r2";
import { getAccessToken as defaultGetAccessToken } from "./auth";
import { CRM_MEDIA_KEY_PREFIX, isCrmMediaKey } from "@/lib/media/crm-media";
// R2-1 mirror-admission policy — canonical helpers ONLY (no local re-derivation):
//   - Ownership: `isMallanExclusiveListing` (SL-/RL- listing_id prefix OR
//     rls_eligible === false). NEVER agent_id / owner_client_id — per the
//     2026-05-13 C1 mis-classification incident, agent linkage is NOT an
//     ownership signal for policy decisions.
//   - Display eligibility: `isListingDisplayable` (fail-closed REBNY gate
//     cascade over the DB gate columns) + `buildSearchDisplayWhere` (the
//     production search Prisma where-shape for the same gates + active statuses).
import {
  isMallanExclusiveListing,
  MALLAN_EXCLUSIVE_LISTING_ID_PREFIXES,
} from "@/lib/listings/exclusive-agent-assignment";
import {
  buildSearchDisplayWhere,
  isListingDisplayable,
} from "@/lib/search/listing-access-decision";

/** Resource-key constant for the media-sync state row. */
export const RESOURCE_MEDIA = "Media" as const;

/**
 * Two-tier cursor for the incremental media-sync cron.
 *
 * Both timestamps may be null — null means "no prior run" and the caller
 * should treat the cursor as the epoch (i.e. fetch everything Trestle has
 * since the beginning of the feed for the first run, ideally bounded by a
 * sane caller-side window like "last 30 days").
 */
export interface MediaSyncCursor {
  /** Max Property.PhotosChangeTimestamp seen on the most recent run. */
  last_photos_change: Date | null;
  /**
   * Max Media.ModificationTimestamp / MediaModificationTimestamp seen on
   * the most recent run. Used for per-row change detection within the
   * listings flagged by `last_photos_change`.
   */
  last_media_modified: Date | null;
  /**
   * RC1 keyset tie-breaker: the `ListingKey` of the last fully-processed
   * listing AT `last_photos_change`. Enables same-timestamp continuation so a
   * run of more than `listingsPerRun` listings sharing one PhotosChangeTimestamp
   * cannot starve the cursor. null = no tie-breaker yet (first run after the
   * RC1 migration, or a fresh cursor) → callers use the inclusive `ge` form.
   */
  last_listing_key: string | null;
}

/**
 * Default (empty) cursor — both timestamps null.
 *
 * Returned by `getMediaSyncCursor()` when no row exists yet for
 * `RESOURCE_MEDIA`. Returned as a fresh object on every call so callers
 * can mutate the result without aliasing a shared default.
 */
export function emptyMediaSyncCursor(): MediaSyncCursor {
  return { last_photos_change: null, last_media_modified: null, last_listing_key: null };
}

/**
 * Read the current cursor from `media_sync_state` for `resource = "Media"`.
 *
 * Returns the empty cursor if no row exists. Never throws on missing-row;
 * callers that expect a row to exist should check the return shape.
 */
export async function getMediaSyncCursor(): Promise<MediaSyncCursor> {
  const row = await prisma.mediaSyncState.findUnique({
    where: { resource: RESOURCE_MEDIA },
    select: { last_photos_change: true, last_media_modified: true, last_listing_key: true },
  });
  if (!row) return emptyMediaSyncCursor();
  return {
    last_photos_change: row.last_photos_change ?? null,
    last_media_modified: row.last_media_modified ?? null,
    last_listing_key: row.last_listing_key ?? null,
  };
}

/**
 * Per-record candidate the cursor advancement reads from.
 *
 * Each record is one Trestle Property hit produced by the run. The
 * candidate fields may be Date, string, null, or undefined; invalid values
 * are ignored.
 */
export interface MediaSyncBatchRecord {
  PhotosChangeTimestamp?: Date | string | null | undefined;
  ModificationTimestamp?: Date | string | null | undefined;
  MediaModificationTimestamp?: Date | string | null | undefined;
}

/** A keyset watermark: the (PhotosChangeTimestamp, ListingKey) of the last
 * fully-processed listing. Produced by `pickKeysetWatermark`. */
export interface KeysetWatermark {
  last_photos_change: Date;
  last_listing_key: string;
}

/** Inputs for `advanceMediaSyncCursor`. */
export interface AdvanceMediaSyncCursorOptions {
  /**
   * Trestle records seen this run. Empty array is valid (no advancement
   * happens; only `last_run_at` and counters are touched). Still drives
   * `last_media_modified` (max). Drives `last_photos_change` ONLY on the
   * legacy path (when `watermark` is omitted).
   */
  records: MediaSyncBatchRecord[];
  /**
   * RC1 keyset watermark. When provided, it (not `records`) drives
   * `last_photos_change` + `last_listing_key`, advancing forward-only to the
   * last fully-processed listing. `null` ⇒ preserve the prior ts + key
   * unchanged (empty/halted-at-start run — must NOT erase the tie-breaker).
   * Omitted (`undefined`) ⇒ legacy behavior (records-max ts, key preserved).
   */
  watermark?: KeysetWatermark | null;
  /** Run outcome — `"ok"` | `"error"` | other free-form. Defaults to `"ok"`. */
  status?: string | null;
  /** Number of rows the run inspected. */
  rowsChecked?: number;
  /** Number of `listing_media` rows the run wrote (insert + update). */
  rowsUpdated?: number;
  /** Number of records that failed to sync. */
  rowsFailed?: number;
  /** Test seam — defaults to `new Date()`. */
  now?: Date;
  /**
   * Observability-only: when supplied, emit a structured `media_sync_cursor`
   * telemetry line carrying the prior/next cursor THIS call computed and
   * whether a watermark was supplied — captured immediately BEFORE persistence.
   * Purely additive: when omitted (all existing callers/tests), this function's
   * behavior and DB interaction are byte-identical.
   */
  logContext?: MediaSyncLogContext;
}

/**
 * Forward-only composite max of two (ts, key) cursors. Never regresses:
 *   - higher ts wins; on equal ts the lexicographically-greater ListingKey wins.
 *   - a null prior ts yields the candidate; equal ts + null prior key yields the
 *     candidate key.
 * Used so the keyset watermark can only ever move forward.
 */
function compositeForwardMax(
  prior: { ts: Date | null; key: string | null },
  cand: KeysetWatermark,
): { ts: Date; key: string } {
  if (prior.ts === null) return { ts: cand.last_photos_change, key: cand.last_listing_key };
  if (cand.last_photos_change > prior.ts) {
    return { ts: cand.last_photos_change, key: cand.last_listing_key };
  }
  if (cand.last_photos_change < prior.ts) {
    return { ts: prior.ts, key: prior.key ?? cand.last_listing_key };
  }
  // Equal timestamps — advance the ListingKey tie-breaker forward only.
  const key =
    prior.key === null || cand.last_listing_key > prior.key ? cand.last_listing_key : prior.key;
  return { ts: prior.ts, key };
}

// ─── Cursor observability (instrumentation only — no behavior change) ──────
// Emits ONE structured JSON line per Phase-1 cursor-lifecycle event, tagged
// `media_sync_cursor` and correlated by `run_id`, so Vercel runtime logs can be
// filtered/joined per invocation. Payload contains ONLY the non-PII cursor keys
// already used operationally (ListingKey, PhotosChangeTimestamp, counts) — never
// credentials, client data, or media URLs. Best-effort: a telemetry failure can
// never affect the sync (swallowed).
export interface MediaSyncLogContext {
  runId: string;
}

/** Correlation id for one runMediaSync invocation. */
function newRunId(): string {
  try {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return uuid;
  } catch {
    // fall through to the non-crypto fallback
  }
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Safe ISO for a nullable Date (null for null/NaN — never throws). */
function isoOrNull(d: Date | null | undefined): string | null {
  if (!d) return null;
  const t = d.getTime();
  return Number.isNaN(t) ? null : d.toISOString();
}

/** Emit one structured `media_sync_cursor` telemetry line. Never throws. */
function emitCursorTelemetry(
  event: string,
  runId: string,
  fields: Record<string, unknown>,
): void {
  try {
    console.log(
      JSON.stringify({
        tag: "media_sync_cursor",
        event,
        run_id: runId,
        deployment_id: process.env.VERCEL_DEPLOYMENT_ID ?? null,
        commit_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
        ...fields,
      }),
    );
  } catch {
    // observability must never break the run
  }
}

/**
 * Advance the cursor based on the records seen this run.
 *
 * Behavior:
 *   - `last_photos_change` advances to `max(prev, max(record.PhotosChangeTimestamp))`.
 *   - `last_media_modified` advances to
 *      `max(prev, max(record.ModificationTimestamp ∪ record.MediaModificationTimestamp))`.
 *   - Invalid date strings (NaN on parse) are ignored, never poisoning the
 *     watermark.
 *   - The watermark NEVER moves backward — if the batch's max is older than
 *     the previously persisted value, the persisted value is kept.
 *   - On an empty batch: `last_*_change` fields are NOT touched.
 *     `last_run_at`, `last_run_status`, and counters ARE updated so the cron
 *     leaves a heartbeat trail even on no-op runs.
 *
 * Idempotent on identical inputs — running this twice with the same
 * batch produces the same row state. Suitable for single-row upsert.
 */
export async function advanceMediaSyncCursor(
  options: AdvanceMediaSyncCursorOptions,
): Promise<MediaSyncCursor> {
  const now = options.now ?? new Date();
  const status = options.status ?? "ok";
  const rowsChecked = options.rowsChecked ?? 0;
  const rowsUpdated = options.rowsUpdated ?? 0;
  const rowsFailed = options.rowsFailed ?? 0;

  // Compute batch-side max candidates (null when nothing valid).
  let batchPhotosChange: Date | null = null;
  let batchMediaModified: Date | null = null;
  for (const r of options.records) {
    const pct = parseDate(r.PhotosChangeTimestamp);
    if (pct && (batchPhotosChange === null || pct > batchPhotosChange)) {
      batchPhotosChange = pct;
    }
    // Per Trestle: either ModificationTimestamp or MediaModificationTimestamp
    // may carry the per-row change time depending on the feed shape we
    // happen to see. Take the max of whichever is present.
    const mt = parseDate(r.ModificationTimestamp);
    if (mt && (batchMediaModified === null || mt > batchMediaModified)) {
      batchMediaModified = mt;
    }
    const mmt = parseDate(r.MediaModificationTimestamp);
    if (mmt && (batchMediaModified === null || mmt > batchMediaModified)) {
      batchMediaModified = mmt;
    }
  }

  // Read prior state so we never move the watermark backward.
  const prior = await getMediaSyncCursor();
  const nextMediaModified = maxDate(prior.last_media_modified, batchMediaModified);

  // RC1: the keyset watermark (when supplied) drives last_photos_change +
  // last_listing_key, advancing forward-only to the last fully-processed
  // listing. `null` preserves the prior cursor (must not erase the tie-breaker
  // on an empty/halted run). Omitted = legacy records-max ts, key preserved.
  let nextPhotosChange: Date | null;
  let nextListingKey: string | null;
  if ("watermark" in options) {
    if (options.watermark == null) {
      nextPhotosChange = prior.last_photos_change;
      nextListingKey = prior.last_listing_key;
    } else {
      const c = compositeForwardMax(
        { ts: prior.last_photos_change, key: prior.last_listing_key },
        options.watermark,
      );
      nextPhotosChange = c.ts;
      nextListingKey = c.key;
    }
  } else {
    nextPhotosChange = maxDate(prior.last_photos_change, batchPhotosChange);
    nextListingKey = prior.last_listing_key;
  }

  // Observability-only: capture the prior/next cursor + watermark mode BEFORE
  // persistence. Gated on logContext (existing callers omit it ⇒ no-op); reads
  // only locals already computed above — no extra query, no logic change.
  if (options.logContext) {
    emitCursorTelemetry("advance", options.logContext.runId, {
      has_watermark: "watermark" in options && options.watermark != null,
      prior_last_photos_change: isoOrNull(prior.last_photos_change),
      prior_last_listing_key: prior.last_listing_key,
      next_last_photos_change: isoOrNull(nextPhotosChange),
      next_last_listing_key: nextListingKey,
    });
  }

  await prisma.mediaSyncState.upsert({
    where: { resource: RESOURCE_MEDIA },
    create: {
      resource: RESOURCE_MEDIA,
      last_photos_change: nextPhotosChange,
      last_media_modified: nextMediaModified,
      last_listing_key: nextListingKey,
      last_run_at: now,
      last_run_status: status,
      rows_checked: rowsChecked,
      rows_updated: rowsUpdated,
      rows_failed: rowsFailed,
    },
    update: {
      last_photos_change: nextPhotosChange,
      last_media_modified: nextMediaModified,
      last_listing_key: nextListingKey,
      last_run_at: now,
      last_run_status: status,
      rows_checked: rowsChecked,
      rows_updated: rowsUpdated,
      rows_failed: rowsFailed,
    },
  });

  return {
    last_photos_change: nextPhotosChange,
    last_media_modified: nextMediaModified,
    last_listing_key: nextListingKey,
  };
}

/**
 * Pure-function variant of `advanceMediaSyncCursor` — no DB. Returns the
 * watermark a hypothetical run would persist given a prior cursor and the
 * records seen.
 *
 * Used by tests and by the cron route's pre-flight planning step.
 */
export function computeAdvancedCursor(
  prior: MediaSyncCursor,
  records: MediaSyncBatchRecord[],
): MediaSyncCursor {
  let batchPhotosChange: Date | null = null;
  let batchMediaModified: Date | null = null;
  for (const r of records) {
    const pct = parseDate(r.PhotosChangeTimestamp);
    if (pct && (batchPhotosChange === null || pct > batchPhotosChange)) {
      batchPhotosChange = pct;
    }
    const mt = parseDate(r.ModificationTimestamp);
    if (mt && (batchMediaModified === null || mt > batchMediaModified)) {
      batchMediaModified = mt;
    }
    const mmt = parseDate(r.MediaModificationTimestamp);
    if (mmt && (batchMediaModified === null || mmt > batchMediaModified)) {
      batchMediaModified = mmt;
    }
  }
  return {
    last_photos_change: maxDate(prior.last_photos_change, batchPhotosChange),
    last_media_modified: maxDate(prior.last_media_modified, batchMediaModified),
    // Pure legacy variant does not compute the keyset tie-breaker — preserve it.
    last_listing_key: prior.last_listing_key,
  };
}

// ─── RC1 — keyset watermark selection ────────────────────────────────────

/**
 * One listing's Phase-1 outcome, in the order the run walked them (ascending
 * `PhotosChangeTimestamp, ListingKey`). `ok` = Media pagination was COMPLETE
 * and upsert + summary both succeeded.
 */
export interface ProcessedListing {
  listingKey: string;
  photosChangeTs: Date | null;
  ok: boolean;
}

/**
 * Pick the keyset watermark = the (PhotosChangeTimestamp, ListingKey) of the
 * LAST contiguously fully-processed listing. Walks in order and STOPS at the
 * first `ok:false` (incomplete Media / failed upsert/summary) — so the cursor
 * never advances PAST a failed listing, even if later listings succeeded
 * (they'll be re-processed next run; upsert is idempotent). An `ok` listing
 * with a null `photosChangeTs` cannot anchor the cursor but does not halt.
 * Returns null when nothing advanceable was processed (caller preserves prior).
 */
export function pickKeysetWatermark(processed: ProcessedListing[]): KeysetWatermark | null {
  let watermark: KeysetWatermark | null = null;
  for (const p of processed) {
    if (!p.ok) break; // never advance past a failed/incomplete listing
    if (p.photosChangeTs && !Number.isNaN(p.photosChangeTs.getTime()) && p.listingKey) {
      watermark = { last_photos_change: p.photosChangeTs, last_listing_key: p.listingKey };
    }
  }
  return watermark;
}

/** Coerce a Date | string | null | undefined to a valid Date or null. */
function parseDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Max of two nullable Dates — null when both null. Watermarks never go backward. */
function maxDate(a: Date | null, b: Date | null): Date | null {
  if (a === null) return b;
  if (b === null) return a;
  return a > b ? a : b;
}

// ─── Checkpoint 2 — listing_media upsert path ───────────────────────────

/**
 * Trestle Media row shape — accepts the OData JSON output from
 * `GET /odata/Media?$filter=ResourceRecordKey eq '...'`.
 *
 * Field naming matches Trestle's PascalCase. All fields are optional/loose
 * because Trestle's response shapes vary slightly across queries.
 */
export interface UpsertListingMediaInput {
  MediaKey?: string | null;
  ResourceRecordKey?: string | null;
  ResourceRecordID?: string | null;
  MediaURL?: string | null;
  MediaCategory?: string | null;
  MediaClassification?: string | null;
  /**
   * Trestle's row-level lifecycle status. `"Deleted"` rows arrive as
   * tombstone signals — we mark a matching `listing_media` row as
   * `status='deleted'` rather than hard-deleting (audit trail).
   */
  MediaStatus?: string | null;
  /**
   * REBNY/Cotality permission scope on the row. Trestle's IDX Plus license
   * pre-filters non-Public rows at the edge, but we defensively skip any row
   * whose `Permission` is set and not `'Public'` so a future feed-policy
   * change cannot leak restricted media into our cache.
   */
  Permission?: string | null;
  Order?: number | string | null;
  PreferredPhotoYN?: boolean | string | null;
  ModificationTimestamp?: Date | string | null;
  MediaModificationTimestamp?: Date | string | null;
}

export interface UpsertListingMediaOptions {
  /**
   * Snapshot of `Property.PhotosChangeTimestamp` at the time the caller
   * fetched this Media batch. Persisted on each row so we can later
   * correlate per-Media changes back to the Property-level event that
   * caused the cron to re-fetch.
   */
  photosChangeTsSnapshot?: Date | string | null;
  /**
   * When `true`, rows currently `status='active'` for `listingId` whose
   * `media_key` is NOT in the input batch are tombstoned (`status='deleted'`).
   *
   * The caller MUST guarantee `mediaRows` represents the COMPLETE current
   * Trestle media set for this listing. The cron route in Checkpoint 5 will
   * set this `true` after a per-listing Media fetch. Default `false`
   * because partial inputs would silently kill live rows otherwise.
   */
  tombstoneVanished?: boolean;
}

/**
 * Explicit per-listing outcome ledger. It separates the INPUT ledger (how each
 * incoming feed row was classified) from PHYSICAL database writes, so the #530
 * suppression is measurable and reconcilable rather than hidden inside a single
 * aggregate.
 *
 * Input ledger (every incoming `mediaRows` row lands in exactly one bucket) —
 * for a fully-successful listing:
 *   `mediaRows.length` = inserted + updatedChanged + skippedUnchanged
 *                        + skippedInvalid + deleteSignalsReceived
 *
 * Physical DB-row writes:
 *   physical_writes = inserted + updatedChanged + tombstonedExplicit
 *                     + tombstonedVanished
 *
 * The two ledgers are deliberately NOT equal: duplicate explicit-delete inputs
 * collapse onto one media_key write, an unmatched delete signal writes zero
 * rows, and a vanished tombstone has no corresponding input row.
 */
export interface UpsertListingMediaResult {
  /** Rows that did not exist in DB and were inserted as active (input + write). */
  inserted: number;
  /** Existing rows whose source fields genuinely differed and were updated (input + write). */
  updatedChanged: number;
  /**
   * Existing rows BYTE-IDENTICAL to the incoming feed row (same source fields
   * AND already `status='active'`): the `update` is skipped — no write, no
   * `@updatedAt` churn. This is the #530 compute reduction (input, zero write).
   */
  skippedUnchanged: number;
  /** Input rows rejected before any DB work (no MediaKey, non-Public Permission, no MediaURL). */
  skippedInvalid: number;
  /** Incoming rows carrying `MediaStatus='Deleted'` — counted per INPUT row (duplicates included; not yet a write). */
  deleteSignalsReceived: number;
  /** DB rows actually flipped to `deleted` by the explicit-delete `updateMany` (deduped media_keys; unmatched signals flip zero). */
  tombstonedExplicit: number;
  /** DB rows flipped to `deleted` because they vanished from a COMPLETE input set (tombstoneVanished=true); no input row. */
  tombstonedVanished: number;
  /** Total DB rows tombstoned. INVARIANT: tombstoned === tombstonedExplicit + tombstonedVanished. */
  tombstoned: number;

  // ── Phase 3 bounded write counters ──
  /** Existing rows evaluated for suppression (= existingRowsCompared). */
  rowsChecked: number;
  /**
   * TRUE physical listing_media writes this call = inserts + material updates +
   * delivery-URL refreshes + explicit tombstones + vanished tombstones. This is
   * the count the run's `rows_updated` telemetry must reflect.
   */
  physicalWrites: number;
  /** Non-tombstone create/update writes only (inserted + updatedChanged + deliveryUrlRefreshed). */
  nonTombstoneRowsWritten: number;
  /**
   * Material-unchanged rows written SOLELY to refresh a not-yet-mirrored URL
   * (r2_key/media_url_cached empty/null). Preserves delivery correctness.
   */
  deliveryUrlRefreshed: number;
  /**
   * PROOF counters (split 2026-07-25, Codex P2). Rows SUPPRESSED (material-
   * unchanged AND already delivered) that differed on the URL. The material
   * comparator excludes the URL entirely, so the old single
   * `suppressedUrlRotationOnly` conflated two very different cases:
   *   signature rotation — origin+pathname identical, only query/fragment/case
   *   changed (a harmless re-sign).
   */
  /**
   * Suppressed because the row is un-mirrored BUT unreachable by every R2
   * selector (`r2_attempts` above the retry-exhaustion threshold: the #534
   * parked sentinel, or the frozen legacy overflow). Before this guard these
   * were pure no-op URL refreshes, rewritten every cycle forever.
   */
  suppressedMirrorUnreachable: number;
  suppressedUrlSignatureRotation: number;
  /**
   * identity change — origin OR pathname changed (a POTENTIAL asset replacement
   * that Phase 2 may decide should force a physical write). Do NOT read this as
   * benign rotation.
   */
  suppressedUrlIdentityChanged: number;
  /** Per-row create/update failures — counted and isolated (row skipped, batch continues). */
  writeFailures: number;

  // ── #541 comparator-attribution diagnostic (aggregate counts only) ──
  // Decision-preserving: derived alongside the unchanged decision, never
  // controlling it. INVARIANTS (per successful aggregation):
  //   existingRowsCompared === skippedUnchanged + deliveryUrlRefreshed + rowsWithOneMismatch + rowsWithMultipleMismatches
  //   updatedChanged       === rowsWithOneMismatch + rowsWithMultipleMismatches
  //   mismatchMediaUrlExact === mismatchMediaUrlIdentity + mismatchMediaUrlIdentityEquivalent  (observability; NOT in baseMismatchCount)
  //   0 <= each mismatch counter <= existingRowsCompared
  /** Existing rows the guard evaluated (skipped + refreshed + changed) — the attribution universe. */
  existingRowsCompared: number;
  mismatchStatus: number;
  mismatchListingId: number;
  mismatchResourceRecordKey: number;
  mismatchResourceRecordId: number;
  /** Base URL field (#5) differs exactly === mismatchMediaUrlIdentity + mismatchMediaUrlIdentityEquivalent. */
  mismatchMediaUrlExact: number;
  /** Subcategory: normalized origin+pathname differ (a real target difference). */
  mismatchMediaUrlIdentity: number;
  /** Subcategory: exact differs but identity matches (query/fragment/case/whitespace). */
  mismatchMediaUrlIdentityEquivalent: number;
  mismatchMediaType: number;
  mismatchMediaCategory: number;
  mismatchMediaClassification: number;
  mismatchOrder: number;
  mismatchPreferredPhoto: number;
  mismatchMediaModificationTs: number;
  mismatchModificationTs: number;
  /** Changed rows with exactly ONE of the 12 base fields differing. */
  rowsWithOneMismatch: number;
  /** Changed rows with TWO OR MORE of the 12 base fields differing. */
  rowsWithMultipleMismatches: number;
}

/**
 * Internal row-shape we hand to Prisma — every field nullable except the
 * NOT NULL columns the schema enforces.
 */
export interface MappedMediaRow {
  mediaKey: string;
  resourceRecordKey: string | null;
  resourceRecordID: string | null;
  mediaUrlOriginal: string;
  mediaType: ReturnType<typeof classifyTrestleMediaCategory>;
  mediaCategory: string | null;
  mediaClassification: string | null;
  order: number;
  preferredPhotoYN: boolean;
  mediaModificationTs: Date | null;
  modificationTs: Date | null;
  photosChangeTsSnapshot: Date | null;
}

/**
 * The existing-row projection the no-op guard compares against — exactly the
 * source-provenance columns the `update` payload writes (see `upsertListingMedia`)
 * MINUS `photos_change_ts_snapshot`. That snapshot is intentionally EXCLUDED:
 * it is a per-fetch Property-event correlation timestamp that is never read
 * anywhere (write-only provenance — verified 2026-07-20), so including it would
 * bump on every re-fetch and defeat suppression. `r2_key`/`media_url_cached`
 * are also excluded — the upsert never touches them (Checkpoint 4 owns them).
 */
export interface ExistingMediaRowForCompare {
  listing_id: string;
  resource_record_key: string | null;
  resource_record_id: string | null;
  media_url_original: string | null;
  media_type: string;
  media_category: string | null;
  media_classification: string | null;
  order: number;
  preferred_photo_yn: boolean;
  media_modification_ts: Date | null;
  modification_ts: Date | null;
  status: string;
  /** Delivery-artifact: R2 object key. Empty/null ⇒ not yet mirrored. READ-only here. */
  r2_key: string | null;
  /** Delivery-artifact: public R2 URL. Empty/null ⇒ not yet mirrored. READ-only here. */
  media_url_cached: string | null;
  /**
   * Retry/park counter. READ-only here (the R2 mirror path owns its writes).
   * Used ONLY to decide whether an un-mirrored row could still be selected by
   * an R2 selector — see `mediaRowMirrorUnreachable`.
   *
   * OPTIONAL and fail-safe: absent/null ⇒ treated as REACHABLE, so a caller
   * that does not project it keeps the pre-existing refresh behaviour and can
   * never lose a needed URL refresh.
   */
  r2_attempts?: number | null;
  /**
   * EXPLICIT R2 policy exclusion.
   *
   * Required here after the writer cutover: a policy-excluded row can now carry
   * a LOW or NULL `r2_attempts`, so `r2_attempts > 8` alone no longer identifies
   * "no R2 consumer will ever read this locator". Without it the backlog says
   * DO-NOT-MIRROR (it filters on `r2_policy_excluded_at: null`) while this
   * decision says STILL-WAITING-FOR-MIRROR and rewrites the locator forever —
   * permanent Neon churn on exactly the rows policy removed from delivery.
   *
   * OPTIONAL and fail-safe in the same way as `r2_attempts`: absent/null ⇒ NOT
   * excluded. Explicit non-null state is required to suppress.
   */
  r2_policy_excluded_at?: Date | null;
}

/**
 * What a reconciliation cycle must physically do with one existing media row.
 *
 * `reason` is a bounded aggregate label — safe for counters and telemetry. It
 * carries no URL, MediaKey, address or other per-row value.
 */
export type MediaRowPersistenceDecision =
  | { kind: 'suppress'; reason: 'locator-identical' | 'delivered-durable' }
  | {
      kind: 'refresh-locator';
      /**
       * `reason` is the DECISION. `deliveryState` is OBSERVATIONAL ONLY — it
       * never affects the outcome, and exists so a future measurement can see
       * how many refreshes land on rows that already have durable R2 delivery.
       * That is the population a corrected hero/manifest contract could later
       * suppress; it is NOT suppressible today (see below).
       */
      reason: 'pending' | 'exact8-recovery';
      deliveryState: 'r2-delivered' | 'policy-excluded' | 'unreachable-overflow' | 'pending';
    }
  | { kind: 'material-write'; reason: 'material-change' };

/**
 * THE production media-row write decision. ONE owner.
 *
 * Production calls this; regressions call this. Extracted because the test that
 * previously pinned this behaviour recomposed the expression itself, which meant
 * the suite could stay green while production drifted underneath it — the tests
 * would have been asserting their own copy.
 *
 * The material comparator deliberately EXCLUDES the locator, so
 * `materialUnchanged` says nothing about the URL. Both facts are needed here.
 */
export function decideMediaRowPersistence(args: {
  materialUnchanged: boolean;
  existingLocator: string | null;
  incomingLocator: string | null;
  existing: ExistingMediaRowForCompare;
}): MediaRowPersistenceDecision {
  const { materialUnchanged, existingLocator, incomingLocator, existing } = args;

  // Real provider truth always wins. Delivery policy must NEVER freeze a
  // genuine material change out of the database.
  if (!materialUnchanged) return { kind: 'material-write', reason: 'material-change' };

  // The ONLY safe suppression today: no new locator was received, so there is
  // literally nothing to persist.
  if ((existingLocator ?? null) === (incomingLocator ?? null)) {
    return { kind: 'suppress', reason: 'locator-identical' };
  }

  // ── DURABLE PUBLIC DELIVERY SUPPRESSES A CHANGED LOCATOR ────────────────
  //
  // The question is NOT "can an R2 selector consume this locator" — it is
  // "does any PUBLIC consumer still read it". Those are different, and an
  // earlier revision of this function conflated them in BOTH directions.
  //
  // A DELIVERED row (`r2_key` AND `media_url_cached` both present) has a durable
  // public copy, and every consumer now prefers it:
  //   * public gallery — `pickFullSizeUrl(cached, original)` is cached-first;
  //   * building manifest — reads `primary_photo_r2_key` and serves the durable
  //     object, falling back to the source locator only when no key exists;
  //   * CRM `heroUrl` — now the same `pickFullSizeUrl`, so a delivered Cotality
  //     row returns the durable R2 copy instead of the rotating locator.
  // With no reader left, persisting a re-signed locator is a pure no-op write.
  // This is the #530/#541 write-amplification win and it is RESTORED here.
  //
  // R2 PROCESSING STATE IS NOT A PUBLIC-DELIVERY PROOF. `policy-excluded`,
  // legacy exact-9 and the `>9` overflow all mean "no R2 selector will fetch
  // this" — they do NOT mean the public gallery stopped falling back to
  // `media_url_original`. Those rows are UNMIRRORED, so their locator is the
  // only thing serving the photo and MUST stay fresh. Suppressing them would
  // trade Neon writes for stale provider URLs and broken images.
  if (mediaRowDelivered(existing)) {
    return { kind: 'suppress', reason: 'delivered-durable' };
  }

  const deliveryState: 'policy-excluded' | 'unreachable-overflow' | 'pending' =
    isR2PolicyExcluded(existing)
      ? 'policy-excluded'
      : mediaRowMirrorUnreachable(existing)
        ? 'unreachable-overflow'
        : 'pending';

  // Exactly 8 stays recovery-reachable in media-sync. Labelled separately for
  // observability; the outcome is the same refresh either way.
  const reason =
    existing.r2_attempts === R2_RETRY_EXHAUSTED_THRESHOLD ? 'exact8-recovery' : 'pending';
  return { kind: 'refresh-locator', reason, deliveryState };
}

/**
 * TRUE when an un-mirrored row can never be selected by EITHER R2 selector, so
 * refreshing its rotating signed URL has no consumer.
 *
 * Post-#584 the two selectors are, on their attempts predicate:
 *   ordinary backlog  `r2_attempts IS NULL OR r2_attempts < 8`
 *   exact-8 recovery  `r2_attempts = 8`
 *
 * So anything ABOVE 8 is unreachable by both: the #534 policy-parked sentinel
 * (9) and the frozen legacy overflow (>9). Exactly 8 is DELIBERATELY reachable
 * — it is recovery-eligible and must keep its fresh URL.
 *
 * Fail-safe: a NULL counter is treated as reachable (it is — `IS NULL` matches
 * the ordinary selector), so an unknown state never loses its refresh.
 */
export function mediaRowMirrorUnreachable(existing: {
  r2_attempts?: number | null;
}): boolean {
  return (
    typeof existing.r2_attempts === "number" &&
    existing.r2_attempts > R2_RETRY_EXHAUSTED_THRESHOLD
  );
}

/**
 * A row is "delivered" when it has BOTH R2 artifacts as NON-EMPTY strings —
 * mirrors the backlog-eligibility definition (missing r2_key/media_url_cached ⇒
 * still backlog). Only delivered rows may have a URL-only rewrite suppressed; an
 * un-delivered row still needs its fresh signed URL for the R2 backlog fetch.
 * Empty strings are treated as NOT delivered (defensive — a blank key/URL is not
 * a usable delivery artifact even if the column is technically non-null).
 */
export function mediaRowDelivered(existing: {
  r2_key: string | null;
  media_url_cached: string | null;
}): boolean {
  return (
    typeof existing.r2_key === "string" && existing.r2_key.trim() !== "" &&
    typeof existing.media_url_cached === "string" && existing.media_url_cached.trim() !== ""
  );
}

/** Date equality that treats null==null and compares by instant otherwise. */
function sameInstant(a: Date | null | undefined, b: Date | null | undefined): boolean {
  // Total & non-throwing: null and undefined are both "empty" and equal to each
  // other. Production values are always Date|null (Prisma), so this is
  // behavior-preserving for the #530 comparator; it only makes the #541
  // attribution robust to unexpected/absent inputs.
  if (a == null || b == null) return a == null && b == null;
  return a.getTime() === b.getTime();
}

/**
 * #530 no-op guard: is the stored row already byte-identical to the incoming
 * feed row, so the `update` would only bump `@updatedAt`?
 *
 * TRUE only when the row is already `status='active'`, still belongs to the
 * SAME listing, and every source-provenance field matches. A `deleted`/
 * `replaced` row that reappears identically is therefore NOT "unchanged"
 * (status must flip back to active — resurrect-on-reappear is preserved), and
 * any real change (URL, type, category, classification, order, preferred flag,
 * or either source timestamp) forces the write. `photos_change_ts_snapshot` is
 * excluded by design (see `ExistingMediaRowForCompare`).
 */
export function listingMediaRowUnchanged(
  existing: ExistingMediaRowForCompare,
  row: MappedMediaRow,
  listingId: string,
): boolean {
  return (
    existing.status === "active" &&
    existing.listing_id === listingId &&
    existing.resource_record_key === row.resourceRecordKey &&
    existing.resource_record_id === row.resourceRecordID &&
    // media_url_original EXCLUDED (Phase 3): the signed Trestle MediaURL rotates
    // on every request, so it is never identity/material — comparing it caused
    // the 100%-write churn this guard now prevents. Suppression of a
    // material-unchanged row is additionally gated on delivery state at the
    // decision site (mediaRowDelivered) so an un-mirrored row still refreshes.
    existing.media_type === row.mediaType &&
    existing.media_category === row.mediaCategory &&
    existing.media_classification === row.mediaClassification &&
    existing.order === row.order &&
    existing.preferred_photo_yn === row.preferredPhotoYN &&
    sameInstant(existing.media_modification_ts, row.mediaModificationTs) &&
    sameInstant(existing.modification_ts, row.modificationTs)
  );
}

// ─── #541 comparator-attribution diagnostic (observability only) ────────────
//
// A DECISION-PRESERVING attribution of WHICH compared field(s) caused an
// existing row to be classified "changed". It NEVER alters the suppression
// decision (that stays solely `listingMediaRowUnchanged`), never mutates
// stored data, and emits only aggregate integer counters. Diagnostic in place
// because production observed 0/2,012 rows suppressed — this identifies the
// dominant differing field without logging any URL/id/key/value.

/** TOTAL, non-throwing URL identity: origin(lowercased scheme+host) +
 *  pathname; query/fragment dropped. A malformed URL falls back
 *  deterministically to the trimmed raw — it can never throw, abort a
 *  listing, or change a write. Kept local to production runtime (NOT
 *  imported from the backfill script).
 *
 *  USED FOR (correction 7 — doc updated because this is no longer
 *  attribution-only):
 *    1. #541 comparator ATTRIBUTION (observability, never the row decision);
 *    2. summary-write SUPPRESSION in `listingMediaSummaryUnchanged`, but
 *       ONLY when BOTH URLs belong to a KNOWN rotating feed provider
 *       (`isRotatingFeedSummaryUrl`) — stable/non-feed URLs are always
 *       compared byte-exact because their query may be a real version or
 *       resource id. */
function mediaUrlIdentity(url: string | null | undefined): string {
  const raw = (url ?? "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    return u.origin.toLowerCase() + u.pathname;
  } catch {
    return raw; // deterministic fallback — degrade to a raw string compare
  }
}

/** Which of the comparator's 12 base fields differ for one existing row, plus
 *  the URL sub-attribution. `baseMismatchCount` counts ONLY the 12 base fields
 *  (the URL contributes at most 1, via its EXACT compare — the identity/
 *  identity-equivalent flags are subcategories of that one field, never extra
 *  base mismatches). By construction `baseMismatchCount === 0` iff
 *  `listingMediaRowUnchanged` is true, so attribution covers exactly the
 *  production comparator's existing-row universe. */
export interface MediaRowMismatch {
  status: boolean;
  listing_id: boolean;
  resource_record_key: boolean;
  resource_record_id: boolean;
  media_url_exact: boolean; // base field #5
  media_url_identity: boolean; // subcategory: origin+pathname differ
  media_url_identity_equivalent: boolean; // subcategory: exact differs but identity matches
  media_type: boolean;
  media_category: boolean;
  media_classification: boolean;
  order: boolean;
  preferred_photo_yn: boolean;
  media_modification_ts: boolean;
  modification_ts: boolean;
  baseMismatchCount: number;
}

export function classifyMediaRowMismatch(
  existing: ExistingMediaRowForCompare,
  row: MappedMediaRow,
  listingId: string,
): MediaRowMismatch {
  const status = existing.status !== "active";
  const listing_id = existing.listing_id !== listingId;
  const resource_record_key = existing.resource_record_key !== row.resourceRecordKey;
  const resource_record_id = existing.resource_record_id !== row.resourceRecordID;
  const media_url_exact = existing.media_url_original !== row.mediaUrlOriginal;
  const media_type = existing.media_type !== row.mediaType;
  const media_category = existing.media_category !== row.mediaCategory;
  const media_classification = existing.media_classification !== row.mediaClassification;
  const order = existing.order !== row.order;
  const preferred_photo_yn = existing.preferred_photo_yn !== row.preferredPhotoYN;
  const media_modification_ts = !sameInstant(existing.media_modification_ts, row.mediaModificationTs);
  const modification_ts = !sameInstant(existing.modification_ts, row.modificationTs);

  // URL subcategories (attribution only). When the EXACT URL differs, the
  // difference is EITHER an identity difference (origin/pathname) OR an
  // identity-equivalent difference (query/fragment/case/whitespace collapsed
  // by normalization) — mutually exclusive, so exact === identity + equivalent.
  let media_url_identity = false;
  let media_url_identity_equivalent = false;
  if (media_url_exact) {
    const identityDiffers = mediaUrlIdentity(existing.media_url_original) !== mediaUrlIdentity(row.mediaUrlOriginal);
    media_url_identity = identityDiffers;
    media_url_identity_equivalent = !identityDiffers;
  }

  // Phase 3: the URL is EXCLUDED from the material count (it rotates every
  // request). `media_url_exact` remains available as observability only.
  const baseMismatchCount =
    Number(status) + Number(listing_id) + Number(resource_record_key) + Number(resource_record_id) +
    Number(media_type) + Number(media_category) + Number(media_classification) +
    Number(order) + Number(preferred_photo_yn) + Number(media_modification_ts) + Number(modification_ts);

  return {
    status, listing_id, resource_record_key, resource_record_id,
    media_url_exact, media_url_identity, media_url_identity_equivalent,
    media_type, media_category, media_classification, order, preferred_photo_yn,
    media_modification_ts, modification_ts, baseMismatchCount,
  };
}

/**
 * Upsert a complete Trestle Media batch for a single listing.
 *
 * Behavior per row:
 *   - No `MediaKey` ⟹ skipped (we cannot dedupe).
 *   - `MediaStatus === "Deleted"` ⟹ tombstone any matching active row by
 *     `media_key` (mark `status='deleted'`); never insert.
 *   - `Permission` set and not `"Public"` ⟹ skipped (defensive — Trestle's
 *     IDX Plus license pre-filters at the edge but we double-check).
 *   - No `MediaURL` ⟹ skipped (we have nothing to mirror).
 *   - Otherwise: upsert by `media_key`. Inserts seed `created_at`; updates
 *     refresh all source-provenance fields (URL, type, order, preferred,
 *     timestamps). The `r2_key` and `media_url_cached` fields are NEVER
 *     touched here — those land in Checkpoint 4 (R2 upload path).
 *   - #530 no-op guard: if the stored row is ALREADY `status='active'` and
 *     byte-identical to the incoming feed row (`listingMediaRowUnchanged`),
 *     the `update` is skipped entirely (counted as `unchanged`, no write, no
 *     `@updatedAt` bump). Any real change — including a `deleted`/`replaced`
 *     row reappearing (status must flip back to active) — still writes.
 *
 * `tombstoneVanished` (default false): when true, rows currently
 * `status='active'` for `listingId` that aren't in the input batch are
 * also tombstoned. Caller must guarantee the input batch is complete.
 *
 * Idempotent AND write-free on a no-op: running this twice with identical
 * input produces ZERO DB writes on the second run (every matched row is
 * `unchanged`) — not even an `@updatedAt` bump (#530).
 */
export async function upsertListingMedia(
  listingId: string,
  mediaRows: UpsertListingMediaInput[],
  options: UpsertListingMediaOptions = {},
): Promise<UpsertListingMediaResult> {
  const photosChangeTsSnapshot = parseDate(options.photosChangeTsSnapshot ?? null);

  let skippedInvalid = 0;
  let deleteSignalsReceived = 0;
  const explicitDeleteKeys = new Set<string>();
  const mapped: MappedMediaRow[] = [];

  for (const raw of mediaRows) {
    const mediaKey = raw.MediaKey ? String(raw.MediaKey) : null;
    if (!mediaKey) {
      skippedInvalid++;
      continue;
    }

    if (raw.MediaStatus === "Deleted") {
      deleteSignalsReceived++; // per INPUT row (duplicates counted); dedup happens in the Set below
      explicitDeleteKeys.add(mediaKey);
      continue;
    }

    if (raw.Permission != null && String(raw.Permission) !== "Public") {
      skippedInvalid++;
      continue;
    }

    const url = raw.MediaURL ? String(raw.MediaURL) : null;
    if (!url) {
      skippedInvalid++;
      continue;
    }

    mapped.push({
      mediaKey,
      resourceRecordKey: raw.ResourceRecordKey ? String(raw.ResourceRecordKey) : null,
      resourceRecordID: raw.ResourceRecordID ? String(raw.ResourceRecordID) : null,
      mediaUrlOriginal: url,
      mediaType: classifyTrestleMediaCategory(raw.MediaCategory),
      mediaCategory: raw.MediaCategory ? String(raw.MediaCategory) : null,
      mediaClassification: raw.MediaClassification ? String(raw.MediaClassification) : null,
      order: parseOrder(raw.Order),
      preferredPhotoYN: parseBool(raw.PreferredPhotoYN),
      mediaModificationTs: parseDate(raw.MediaModificationTimestamp ?? null),
      modificationTs: parseDate(raw.ModificationTimestamp ?? null),
      photosChangeTsSnapshot,
    });
  }

  let inserted = 0;
  let updatedChanged = 0;
  let skippedUnchanged = 0;
  let deliveryUrlRefreshed = 0; // material-unchanged but written to refresh a not-yet-mirrored URL
  let suppressedMirrorUnreachable = 0; // suppressed: un-mirrored but no R2 selector can reach it (>8)
  // BOUNDED AGGREGATE observability so a future Production measurement can tell
  // the suppression reasons apart. Counts only — no URL, MediaKey, address or
  // any other per-row value, and no new DB writer.
  const persistenceReasons: Record<string, number> = {};
  let suppressedUrlSignatureRotation = 0; // suppressed: URL query/sig rotated (origin+pathname identical)
  let suppressedUrlIdentityChanged = 0; // suppressed: URL origin/pathname changed (potential asset replacement)
  let writeFailures = 0; // per-row create/update failures (isolated; batch continues, listing fails closed)
  // #541 comparator-attribution diagnostic — aggregate counts only, derived
  // ALONGSIDE the decision, never controlling it.
  const attr = {
    existingRowsCompared: 0,
    mismatchStatus: 0,
    mismatchListingId: 0,
    mismatchResourceRecordKey: 0,
    mismatchResourceRecordId: 0,
    mismatchMediaUrlExact: 0,
    mismatchMediaUrlIdentity: 0,
    mismatchMediaUrlIdentityEquivalent: 0,
    mismatchMediaType: 0,
    mismatchMediaCategory: 0,
    mismatchMediaClassification: 0,
    mismatchOrder: 0,
    mismatchPreferredPhoto: 0,
    mismatchMediaModificationTs: 0,
    mismatchModificationTs: 0,
    rowsWithOneMismatch: 0,
    rowsWithMultipleMismatches: 0,
  };

  // Upsert each surviving row. We use findUnique + create/update rather than
  // Prisma's upsert() so we can return precise inserted/updated/unchanged counts
  // AND skip the write entirely when the stored row is already byte-identical
  // (#530 — prevents ~18k/day no-op media rewrites and their `@updatedAt` churn;
  // mirrors the existing r2_key/media_url_cached no-op guard in mirrorMediaToR2).
  // The findUnique now projects the source-provenance columns the update writes
  // so the no-op guard can compare without a second read.
  for (const row of mapped) {
    const existing = await prisma.listingMedia.findUnique({
      where: { media_key: row.mediaKey },
      select: {
        listing_id: true,
        resource_record_key: true,
        resource_record_id: true,
        media_url_original: true,
        media_type: true,
        media_category: true,
        media_classification: true,
        order: true,
        preferred_photo_yn: true,
        media_modification_ts: true,
        modification_ts: true,
        status: true,
        // Phase 3: delivery-artifact columns — READ only, to gate URL-refresh
        // suppression (never written here; the R2 mirror path owns their writes).
        r2_key: true,
        media_url_cached: true,
        // READ-only: lets the URL-refresh exception skip rows no R2 selector
        // can ever reach (see mediaRowMirrorUnreachable).
        r2_attempts: true,
        // READ-only: EXPLICIT policy exclusion. `buildR2BacklogWhere` already
        // filters on `r2_policy_excluded_at: null`, so a non-null value proves
        // no R2 selector can consume a refreshed locator.
        r2_policy_excluded_at: true,
      },
    });
    if (existing) {
      // Attribution FIRST (never throws, never affects the branch below).
      const mm = classifyMediaRowMismatch(existing, row, listingId);
      attr.existingRowsCompared += 1;
      if (mm.status) attr.mismatchStatus += 1;
      if (mm.listing_id) attr.mismatchListingId += 1;
      if (mm.resource_record_key) attr.mismatchResourceRecordKey += 1;
      if (mm.resource_record_id) attr.mismatchResourceRecordId += 1;
      if (mm.media_url_exact) attr.mismatchMediaUrlExact += 1;
      if (mm.media_url_identity) attr.mismatchMediaUrlIdentity += 1;
      if (mm.media_url_identity_equivalent) attr.mismatchMediaUrlIdentityEquivalent += 1;
      if (mm.media_type) attr.mismatchMediaType += 1;
      if (mm.media_category) attr.mismatchMediaCategory += 1;
      if (mm.media_classification) attr.mismatchMediaClassification += 1;
      if (mm.order) attr.mismatchOrder += 1;
      if (mm.preferred_photo_yn) attr.mismatchPreferredPhoto += 1;
      if (mm.media_modification_ts) attr.mismatchMediaModificationTs += 1;
      if (mm.modification_ts) attr.mismatchModificationTs += 1;
      if (mm.baseMismatchCount === 1) attr.rowsWithOneMismatch += 1;
      else if (mm.baseMismatchCount >= 2) attr.rowsWithMultipleMismatches += 1;

      // DECISION (Phase 3). The URL is excluded from `listingMediaRowUnchanged`
      // (it rotates every request). A material-unchanged row is SUPPRESSED only
      // when it is already delivered to R2 — an un-mirrored row still needs its
      // fresh signed URL because the R2 backlog path reuses the stored
      // `media_url_original` to fetch. Deleted/replaced rows are never
      // "unchanged" (status must flip back to active → resurrect preserved).
      // The URL-refresh exception exists so an UN-MIRRORED row keeps a fresh
      // signed `media_url_original` for the R2 backlog fetch. That reasoning
      // only holds while a selector can still pick the row up. A row parked
      // ABOVE the retry-exhaustion threshold (the #534 sentinel at 9, or the
      // frozen legacy overflow above it) is unreachable by BOTH selectors
      // post-#584, so its refresh has no consumer — it was a pure no-op write
      // repeated every cycle, forever. Exactly 8 stays reachable (recovery)
      // and keeps refreshing.
      const materialUnchanged = listingMediaRowUnchanged(existing, row, listingId);
      const mirrorUnreachable = mediaRowMirrorUnreachable(existing);
      // (1) THE MISSING NO-OP GATE. The material comparator deliberately
      // EXCLUDES the URL, so "material unchanged" says nothing about the
      // locator. Nothing above ever compared the locator itself, which meant a
      // BYTE-IDENTICAL `media_url_original` on a pending row still fell through
      // to a physical `update()` every cycle. There is nothing to refresh when
      // no new locator was received — that is a pure no-op write.
      const locatorIdentical =
        (existing.media_url_original ?? null) === (row.mediaUrlOriginal ?? null);
      // (2) EXPLICIT POLICY EXCLUSION. Delegated to the ONE interpreter rather
      // than re-deriving `=== 9` here: it understands the explicit column AND
      // the exact-9 legacy sentinel, and it never treats the >9 overflow as
      // policy. A policy-excluded row is filtered out of the backlog, so a
      // refreshed locator has no consumer — same reasoning as
      // `mirrorUnreachable`, extended to the post-cutover state.
      const policyExcluded = isR2PolicyExcluded(existing);
      const locatorHasNoConsumer =
        mediaRowDelivered(existing) || mirrorUnreachable || policyExcluded;
      const decision = decideMediaRowPersistence({
        materialUnchanged,
        existingLocator: existing.media_url_original ?? null,
        incomingLocator: row.mediaUrlOriginal ?? null,
        existing,
      });
      persistenceReasons[decision.reason] = (persistenceReasons[decision.reason] ?? 0) + 1;
      if (decision.kind === 'refresh-locator') {
        // OBSERVATIONAL: how many refreshes land on rows that already have
        // durable R2 delivery. That is the population a corrected hero/manifest
        // contract could later suppress — recorded, not acted on.
        const k = `refresh_while_${decision.deliveryState}`;
        persistenceReasons[k] = (persistenceReasons[k] ?? 0) + 1;
      }

      if (decision.kind === 'suppress') {
        skippedUnchanged++;
        // Retained counter: the un-mirrored-and-unreachable population is now
        // only suppressed when the locator is IDENTICAL, so this counts that
        // subset rather than the old blanket suppression.
        if (mediaRowMirrorUnreachable(existing) && !mediaRowDelivered(existing)) suppressedMirrorUnreachable++;
        // Split (Codex P2): the URL is excluded from the material decision, so a
        // suppressed row may differ by a harmless signature rotation OR a real
        // origin/pathname change. Attribute each precisely (mutually exclusive:
        // media_url_exact === identity + identity_equivalent).
        if (mm.media_url_identity_equivalent) suppressedUrlSignatureRotation++;
        if (mm.media_url_identity) suppressedUrlIdentityChanged++;
        continue;
      }
      try {
        if (decision.kind === 'refresh-locator') {
          // NARROW BY CONTRACT. A locator refresh is NOT a material refresh:
          // every material/provenance field was already proven unchanged, so
          // rewriting them would manufacture the churn this decision exists to
          // remove. Only the delivery locator is persisted.
          await prisma.listingMedia.update({
            where: { media_key: row.mediaKey },
            data: { media_url_original: row.mediaUrlOriginal },
          });
          deliveryUrlRefreshed++;
          continue;
        }
        await prisma.listingMedia.update({
          where: { media_key: row.mediaKey },
          data: {
            listing_id: listingId,
            resource_record_key: row.resourceRecordKey,
            resource_record_id: row.resourceRecordID,
            media_url_original: row.mediaUrlOriginal,
            media_type: row.mediaType,
            media_category: row.mediaCategory,
            media_classification: row.mediaClassification,
            order: row.order,
            preferred_photo_yn: row.preferredPhotoYN,
            media_modification_ts: row.mediaModificationTs,
            modification_ts: row.modificationTs,
            photos_change_ts_snapshot: row.photosChangeTsSnapshot,
            status: "active",
          },
        });
        // Reaching here means `decision.kind === 'material-write'`; the
        // locator-refresh branch above already `continue`d after its narrow
        // write, so this counter is no longer ambiguous.
        updatedChanged++;
      } catch {
        // Isolate the failure to this row — count it and continue so one bad
        // write cannot drop the rest of the listing's media. No URL/id logged.
        writeFailures++;
        continue;
      }
    } else {
      try {
        await prisma.listingMedia.create({
          data: {
            listing_id: listingId,
            media_key: row.mediaKey,
            resource_record_key: row.resourceRecordKey,
            resource_record_id: row.resourceRecordID,
            media_url_original: row.mediaUrlOriginal,
            media_type: row.mediaType,
            media_category: row.mediaCategory,
            media_classification: row.mediaClassification,
            order: row.order,
            preferred_photo_yn: row.preferredPhotoYN,
            media_modification_ts: row.mediaModificationTs,
            modification_ts: row.modificationTs,
            photos_change_ts_snapshot: row.photosChangeTsSnapshot,
            status: "active",
          },
        });
        inserted++;
      } catch {
        writeFailures++;
        continue;
      }
    }
  }

  let tombstonedExplicit = 0;
  let tombstonedVanished = 0;

  // FAIL-CLOSED (Phase 3): if ANY per-row upsert write failed, this listing's
  // media set did not fully persist. A partial listing must NOT execute any
  // DESTRUCTIVE reconciliation — a write failure could make a still-present row
  // look "vanished". Skip all tombstoning; the run-level caller also halts the
  // cursor on writeFailures>0, so the listing re-processes (idempotently) next
  // run and tombstones only once every write succeeded.
  const tombstoningAllowed = writeFailures === 0;

  if (tombstoningAllowed && explicitDeleteKeys.size > 0) {
    const res = await prisma.listingMedia.updateMany({
      where: {
        listing_id: listingId,
        status: "active",
        media_key: { in: [...explicitDeleteKeys] },
      },
      data: { status: "deleted" },
    });
    tombstonedExplicit = res.count;
  }

  if (tombstoningAllowed && options.tombstoneVanished === true) {
    const seenKeys = new Set<string>([
      ...mapped.map((r) => r.mediaKey),
      ...explicitDeleteKeys,
    ]);
    // Empty-input case: tombstone every active TRESTLE row for the listing.
    // P1C2: BOTH branches exclude the `crm:` namespace — CRM-owned uploads are
    // absent from every Trestle media set BY DESIGN (crm-media.ts:2-7), so
    // "vanished from the complete set" can never mean "deleted at source" for
    // them. Trestle never emits crm:-prefixed MediaKeys, so feed semantics
    // (incl. deleted-at-source removal) are unchanged for feed rows.
    const where =
      seenKeys.size === 0
        ? {
            listing_id: listingId,
            status: "active",
            NOT: { media_key: { startsWith: CRM_MEDIA_KEY_PREFIX } },
          }
        : {
            listing_id: listingId,
            status: "active",
            media_key: { notIn: [...seenKeys] },
            NOT: { media_key: { startsWith: CRM_MEDIA_KEY_PREFIX } },
          };
    const res = await prisma.listingMedia.updateMany({
      where,
      data: { status: "deleted" },
    });
    tombstonedVanished = res.count;
  }

  return {
    inserted,
    updatedChanged,
    skippedUnchanged,
    skippedInvalid,
    deleteSignalsReceived,
    tombstonedExplicit,
    tombstonedVanished,
    tombstoned: tombstonedExplicit + tombstonedVanished,
    // Phase 3 bounded counters.
    rowsChecked: attr.existingRowsCompared, // existing rows evaluated for suppression
    // TRUE physical listing_media writes: inserts + material updates + delivery
    // refreshes + BOTH tombstone kinds (tombstones ARE physical updateMany writes).
    physicalWrites:
      inserted + updatedChanged + deliveryUrlRefreshed + tombstonedExplicit + tombstonedVanished,
    // Non-tombstone create/update writes only (inserts + material + refresh).
    nonTombstoneRowsWritten: inserted + updatedChanged + deliveryUrlRefreshed,
    deliveryUrlRefreshed,
    suppressedMirrorUnreachable,
    suppressedUrlSignatureRotation,
    suppressedUrlIdentityChanged,
    writeFailures,
    ...attr,
  };
}

/** Coerce Trestle's `Order` field (number | string | null) to a finite int, default 0. */
function parseOrder(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

/** Coerce Trestle's boolean-ish flags ('true' string, true, etc.) to a real boolean. */
function parseBool(value: boolean | string | null | undefined): boolean {
  if (value === true) return true;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}

// ─── Checkpoint 3 — derived Listing summary columns ─────────────────────

/**
 * The 4 nullable summary columns on `Listing` that PR 2 added (schema-only,
 * see `prisma/schema.prisma:488-491`) and PR 3 populates. Reader path does
 * NOT consume these yet — that swap lands in PR 4. Writing them in PR 3
 * builds the data warehouse so PR 4's reader swap is a one-line cutover.
 */
export interface ListingMediaSummary {
  /** First active Photo's `media_url_original` (preferred → order ASC). null if none. */
  primary_photo_url: string | null;
  /** First active Photo's `r2_key` if mirrored to R2; else null. */
  primary_photo_r2_key: string | null;
  /** Count of `media_type='Photo'` rows where `status='active'`. Always ≥0. */
  photo_count: number;
  /** Max `media_modification_ts` across all active rows for the listing. null if none. */
  photos_change_timestamp: Date | null;
}

/** Per-row shape `computeListingMediaSummary()` needs. */
export interface SummarySourceRow {
  media_type: string;
  status: string;
  preferred_photo_yn: boolean;
  order: number;
  media_url_original: string | null;
  r2_key: string | null;
  media_modification_ts: Date | null;
  modification_ts: Date | null;
  /**
   * Namespace evidence for HERO AUTHORITY — an explicit `crm:` set-main
   * outranks the feed's PreferredPhotoYN hint. Optional so existing callers
   * that have not widened their select keep byte-identical hero ordering.
   */
  media_key?: string | null;
  /**
   * Classification evidence required for PARITY with the canonical public
   * reader. Added 2026-08-07 (commit 7A).
   *
   * Without these the summary could only test `media_type === 'Photo'`, while
   * the canonical resolver also weighs category, classification and the Trestle
   * DOCUMENT-* URL shape. Because `classifyTrestleMediaCategory` defaults a
   * MISSING MediaCategory to Photo, a row could be STORED as Photo while being
   * CANONICALLY a FloorPlan — so `Listing.photo_count` reported 2 where the
   * public gallery showed 1 (proven: summary-canonical-parity fixtures C/D).
   *
   * OPTIONAL so callers that have not widened their select still compile. When
   * absent, `classifyMediaItem` falls back to `media_type`, i.e. exactly the
   * previous behaviour — a narrower caller is no worse off than before.
   */
  media_category?: string | null;
  media_classification?: string | null;
}

/**
 * Pure-function summary derivation — no DB.
 *
 * Hero-photo selection rules:
 *   1. Only `media_type='Photo'` (case-insensitive) AND `status='active'`
 *      rows are eligible. FloorPlans/Videos/VirtualTours are NEVER hero.
 *   2. Among eligible Photos: `preferred_photo_yn=true` wins, then lowest
 *      `order`, then first-encountered.
 *   3. If a hero exists: `primary_photo_url = media_url_original` and
 *      `primary_photo_r2_key = r2_key` (which may be null until Checkpoint 4
 *      mirrors the photo to R2).
 *   4. If no eligible Photo: `primary_photo_url = null`, `primary_photo_r2_key
 *      = null`, `photo_count = 0`.
 *   5. `photo_count` excludes FloorPlan/Video/VirtualTour and inactive rows
 *      — matches the public-DTO `photosCount` semantics enforced by
 *      `lib/media/listing-card-media.ts:countPhotoMedia()`.
 *   6. `photos_change_timestamp` = max(`media_modification_ts`,
 *      `modification_ts`) across ALL active rows (regardless of media_type).
 *      This mirrors the existing `Property.PhotosChangeTimestamp` semantics
 *      — any media row change should bump the listing-level timestamp.
 *
 * Used directly by `updateListingMediaSummary()` and by tests so we can
 * verify the selection logic without DB round-trips.
 */
/**
 * Minimal row shape hero selection needs — structural subset of
 * `SummarySourceRow` (and of any `listing_media` select that carries these
 * four columns). Generic so callers keep their richer row type.
 */
export interface HeroPhotoCandidate {
  media_type: string;
  status: string;
  preferred_photo_yn: boolean;
  order: number;
  /**
   * OPTIONAL so callers that have not widened their `select` keep their exact
   * pre-existing ordering: with no key present, no row can be identified as a
   * CRM choice and the comparator falls through to the original
   * preferred/order logic. Present, it enables the CRM-choice precedence
   * documented on {@link selectHeroPhoto}.
   */
  media_key?: string | null;
}

/**
 * Active-Photo eligibility filter shared by hero selection and photo_count.
 *
 * DELEGATES to the canonical `classifyMediaItem` (commit 7A). It previously
 * tested only `String(r.media_type).toLowerCase() === 'photo'`, which the
 * canonical public reader does not — the reader also weighs MediaCategory,
 * MediaClassification and the Trestle DOCUMENT-* URL shape.
 *
 * That gap was real, not theoretical: `classifyTrestleMediaCategory` defaults a
 * MISSING MediaCategory to Photo, so a floor plan arriving with no category was
 * STORED as `media_type='Photo'` and counted here, while the public gallery
 * correctly classified it as a FloorPlan from its `DOCUMENT-Pdf` URL. The card
 * then advertised one more photo than the gallery contained.
 *
 * The classifier is REUSED, not reimplemented — a second copy would drift.
 */
function filterActivePhotoRows<T extends HeroPhotoCandidate>(rows: readonly T[]): T[] {
  return rows.filter((r) => {
    if (String(r.status).toLowerCase() !== "active") return false;
    const row = r as unknown as SummarySourceRow;
    return (
      classifyMediaItem({
        // `classifyMediaItem` reads category first and falls back to mediaType,
        // so a row whose caller has not widened its select behaves exactly as
        // it did before this change.
        mediaCategory: row.media_category ?? undefined,
        mediaClassification: row.media_classification ?? undefined,
        mediaType: row.media_type,
        url: row.media_url_original ?? "",
      }) === "photo"
    );
  });
}

/**
 * THE production hero-photo resolver, extracted (R2-1) from
 * `computeListingMediaSummary()` so the R2 mirror-admission policy reuses the
 * EXACT logic that populates `Listing.primary_photo_url` /
 * `primary_photo_r2_key` (the columns the public detail/card surfaces render).
 * No divergent duplicate exists — `computeListingMediaSummary` calls this.
 *
 * Selection rules (unchanged from Checkpoint 3):
 *   1. Only `media_type='Photo'` (case-insensitive) AND `status='active'`
 *      rows are eligible. FloorPlans/Videos/VirtualTours are NEVER hero.
 *   2. Among eligible Photos: `preferred_photo_yn=true` wins, then lowest
 *      `order`, then first-encountered (stable indexed sort).
 * Returns null when no eligible Photo exists.
 */
export function selectHeroPhoto<T extends HeroPhotoCandidate>(
  rows: readonly T[],
): T | null {
  const photos = filterActivePhotoRows(rows);
  // Hero selection: preferred → order ASC → first-encountered.
  // Stable sort with explicit indexed compare so identical rows preserve
  // input order for the "first-encountered" tiebreak.
  const indexedPhotos = photos.map((row, idx) => ({ row, idx }));
  indexedPhotos.sort((a, b) => {
    // HERO AUTHORITY, rank 1: an explicit CRM choice outranks the feed hint.
    //
    // A `crm:` row with preferred_photo_yn=true is the agent's deliberate
    // set-main. Previously it tied with a feed row that also had
    // PreferredPhotoYN=true and then LOST on `order` (feed rows occupy 0..N,
    // CRM uploads are appended after) — so the agent's choice silently
    // reverted. The old set-main "fixed" that by clearing preferred_photo_yn
    // on the feed rows, which mutated source-owned metadata that media-sync
    // rewrites from the feed on every complete set (:1263/:1293) and counts as
    // a MATERIAL change (:975) — a revert plus per-sync write amplification.
    //
    // Ranking here instead makes the choice durable with NO write to any feed
    // row. Rows without a media_key are never CRM-preferred, so a caller that
    // has not widened its select keeps byte-identical ordering.
    const aCrm = a.row.preferred_photo_yn && isCrmMediaKey(a.row.media_key);
    const bCrm = b.row.preferred_photo_yn && isCrmMediaKey(b.row.media_key);
    if (aCrm !== bCrm) return aCrm ? -1 : 1;

    if (a.row.preferred_photo_yn !== b.row.preferred_photo_yn) {
      return a.row.preferred_photo_yn ? -1 : 1;
    }
    if (a.row.order !== b.row.order) return a.row.order - b.row.order;
    return a.idx - b.idx;
  });
  return indexedPhotos[0]?.row ?? null;
}

export function computeListingMediaSummary(
  rows: readonly SummarySourceRow[],
): ListingMediaSummary {
  const photos = filterActivePhotoRows(rows);

  // Hero selection delegates to the shared production resolver (see
  // `selectHeroPhoto` — extracted in R2-1, semantics unchanged).
  const hero = selectHeroPhoto(rows);

  // photos_change_timestamp = max across ALL active rows, photo or otherwise.
  const activeRows = rows.filter((r) => String(r.status).toLowerCase() === "active");
  let pct: Date | null = null;
  for (const row of activeRows) {
    const candidates: (Date | null)[] = [row.media_modification_ts, row.modification_ts];
    for (const c of candidates) {
      if (c instanceof Date && !Number.isNaN(c.getTime())) {
        if (pct === null || c > pct) pct = c;
      }
    }
  }

  return {
    primary_photo_url: hero?.media_url_original ?? null,
    primary_photo_r2_key: hero?.r2_key ?? null,
    photo_count: photos.length,
    photos_change_timestamp: pct,
  };
}

/**
 * Phase 3 (surface C) — physical-write counters for the summary write path.
 * `rows_updated` reflects PHYSICAL Listing writes only (this path only ever
 * updates, so rows_inserted stays 0); rows the pre-read proved identical are
 * counted as rows_suppressed_unchanged. rows_failed is attributed by the
 * caller (runMediaSync stage marker) — this function itself fails loud.
 */
export interface SummaryWriteCounters {
  rows_checked: number;
  rows_materially_changed: number;
  rows_suppressed_unchanged: number;
  rows_inserted: number;
  rows_updated: number;
  rows_failed: number;
}

export function newSummaryWriteCounters(): SummaryWriteCounters {
  return {
    rows_checked: 0,
    rows_materially_changed: 0,
    rows_suppressed_unchanged: 0,
    rows_inserted: 0,
    rows_updated: 0,
    rows_failed: 0,
  };
}

/** The 4 stored Listing summary columns the pre-read compares against. */
export interface StoredListingMediaSummary {
  primary_photo_url: string | null;
  primary_photo_r2_key: string | null;
  photo_count: number | null;
  photos_change_timestamp: Date | null;
  /**
   * Current address — used ONLY to decide which building / manifest shard to
   * expire when the summary materially changes.
   *
   * Deliberately NOT part of `listingMediaSummaryUnchanged`: an address is not
   * summary state, and comparing it would suppress or force summary writes for
   * the wrong reason. Optional so existing callers and fixtures that do not
   * select it still compile and behave exactly as before.
   */
  address?: unknown;
}

/**
 * Provider DOMAINS whose media URLs carry a ROTATING signed query (the
 * Cotality/Trestle feed re-signs MediaURL on every request). ONLY these
 * providers get the query-insensitive identity compare below; every other
 * URL (R2, Mallan, third-party CDNs) is compared byte-exact because its
 * query string may be a real version/resource identifier.
 *
 * HOSTNAME-scoped (Maya re-review 2026-07-21): detection parses the URL and
 * inspects `URL.hostname` ONLY — exact domain or dot-boundary subdomain,
 * NEVER a substring over the full URL. A stable URL whose path contains a
 * provider-looking token (".../trestle-building.jpg") or whose query
 * smuggles a provider host ("?redirect=api.cotality.com"), and look-alike
 * hosts ("notcotality.com"), must all stay STABLE (exact compare).
 *
 * Allowlist grounding:
 *   - `cotality.com` — LIVE-OBSERVED: the 2026-07-21 authenticated Phase-0
 *     probes (docs/superpowers/specs/evidence/
 *     2026-07-21-live-cotality-{contract,pagination}-probe.json, #544
 *     branch) contain exactly one media/API host: `api.cotality.com`.
 *   - `corelogic.com` — DEFENSIVE / NOT observed in those live probes: the
 *     production media proxy (app/api/media/proxy/route.ts) still allowlists
 *     the deprecated `api-trestle.corelogic.com` / `api-prod.corelogic.com`
 *     hosts (Cotality 2026 warranty), so stored legacy URLs may carry it.
 */
const ROTATING_SUMMARY_URL_PROVIDER_DOMAINS = ["cotality.com", "corelogic.com"];

export function isRotatingFeedSummaryUrl(url: string | null | undefined): boolean {
  if (typeof url !== "string" || url === "") return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return ROTATING_SUMMARY_URL_PROVIDER_DOMAINS.some(
      (d) => hostname === d || hostname.endsWith("." + d),
    );
  } catch {
    // Malformed URL -> NOT a provider URL -> exact compare downstream
    // (fail-closed: any difference stays a material change).
    return false;
  }
}

/** Provider-scoped hero-URL equality (correction 7):
 *  both KNOWN rotating feed URLs → origin+pathname identity (signature
 *  ignored); anything else (stable URLs, or mixed feed-vs-stable =
 *  source/delivery switch) → exact compare. null == null only. */
function summaryHeroUrlEqual(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === null && b === null;
  if (isRotatingFeedSummaryUrl(a) && isRotatingFeedSummaryUrl(b)) {
    return mediaUrlIdentity(a) === mediaUrlIdentity(b);
  }
  return a === b;
}

/**
 * True when the stored 4 summary columns already equal the freshly-computed
 * summary — i.e. the `Listing.update()` would be a physical no-op rewrite.
 *
 * Material identity (Phase 3, surface C):
 *   - `photo_count` — exact (a NULL legacy column is never equal, so the
 *     backfill still writes; any real count change writes).
 *   - `primary_photo_r2_key` — exact (delivery-state change always writes).
 *   - `photos_change_timestamp` — instant compare (an actual source photo
 *     revision always writes).
 *   - `primary_photo_url` — provider-scoped (correction 7): ONLY when both
 *     sides are KNOWN rotating Cotality/Trestle feed URLs is the rotating
 *     signed query ignored (origin + pathname identity). Stable/non-feed
 *     URLs compare byte-exact. A true hero replacement changes the media
 *     path (and, when mirrored, `primary_photo_r2_key`) → always material.
 *
 * Fail-closed: a missing stored row returns false (the write proceeds).
 */
export function listingMediaSummaryUnchanged(
  stored: StoredListingMediaSummary | null,
  summary: ListingMediaSummary,
): boolean {
  if (!stored) return false;
  if (stored.photo_count === null || stored.photo_count !== summary.photo_count) return false;
  if ((stored.primary_photo_r2_key ?? null) !== (summary.primary_photo_r2_key ?? null)) return false;
  if (!sameInstant(stored.photos_change_timestamp, summary.photos_change_timestamp)) return false;
  if (!summaryHeroUrlEqual(stored.primary_photo_url, summary.primary_photo_url)) return false;
  return true;
}

/**
 * Re-derive and persist the 4 Listing summary columns from the current
 * `listing_media` rows for `listingId`.
 *
 * Reads all `listing_media` rows for the listing (active + deleted; the
 * filter happens in-JS via `computeListingMediaSummary`), computes the
 * summary, and writes it via a single `Listing.update()` call. Writes only
 * the 4 columns; never touches the legacy `Listing.media` JSON column or
 * any other field.
 *
 * Idempotent: running twice with no underlying media change now performs
 * ZERO physical writes on the second run (Phase 3, surface C): the stored
 * 4 columns are pre-read and the `Listing.update()` is SUPPRESSED when the
 * computed values are identical (rotating signed URLs are never identity —
 * see `listingMediaSummaryUnchanged`). The pre-read is fail-closed: if it
 * errors or finds no row, the write proceeds exactly as before.
 *
 * Returns the summary that was computed (and persisted, unless suppressed).
 */
export async function updateListingMediaSummary(
  listingId: string,
  options?: {
    counters?: SummaryWriteCounters;
    /** One Cycle W1: revalidation accounting sink (bounded aggregates). */
    revalidation?: { pages_revalidated: number; revalidation_failures: number };
  },
): Promise<ListingMediaSummary> {
  const counters = options?.counters;
  const rows = await prisma.listingMedia.findMany({
    where: { listing_id: listingId },
    select: {
      media_type: true,
      status: true,
      preferred_photo_yn: true,
      order: true,
      media_url_original: true,
      r2_key: true,
      media_modification_ts: true,
      modification_ts: true,
      // HERO AUTHORITY (namespace). `selectHeroPhoto` ranks an explicit `crm:`
      // set-main above the feed's PreferredPhotoYN hint. Without media_key the
      // summary's hero could not see that choice, while the Phase-3 mirror hero
      // (which DOES select media_key) would — and the comment there asserts the
      // two populations decide an IDENTICAL hero. Selecting it keeps that true.
      media_key: true,
      // Classification evidence — commit 7A. Without these the summary could
      // only see `media_type`, and a floor plan that arrived with no
      // MediaCategory (stored as Photo by classifyTrestleMediaCategory) was
      // counted as a photo, so Listing.photo_count exceeded the public gallery.
      // Two scalar columns on rows already being read: no extra query, no join.
      media_category: true,
      media_classification: true,
    },
  });

  const summary = computeListingMediaSummary(rows);

  if (counters) counters.rows_checked++;
  // Phase 3 (surface C) pre-read — suppression is an optimization ONLY:
  // any read failure falls through to the write (fail-closed).
  let stored: StoredListingMediaSummary | null = null;
  try {
    stored = await prisma.listing.findUnique({
      where: { listing_id: listingId },
      select: {
        primary_photo_url: true,
        primary_photo_r2_key: true,
        photo_count: true,
        photos_change_timestamp: true,
        // `address` on the EXISTING pre-read (no new query, no N+1): a summary
        // change alters public photo state, which the BUILDING payload and the
        // manifest shard carry (primary_photo_url) — so they must expire too.
        address: true,
      },
    });
  } catch {
    stored = null; // fail-closed -> write proceeds
  }

  if (listingMediaSummaryUnchanged(stored, summary)) {
    if (counters) counters.rows_suppressed_unchanged++;
    return summary;
  }

  await prisma.listing.update({
    where: { listing_id: listingId },
    data: {
      primary_photo_url: summary.primary_photo_url,
      primary_photo_r2_key: summary.primary_photo_r2_key,
      photo_count: summary.photo_count,
      photos_change_timestamp: summary.photos_change_timestamp,
    },
  });
  if (counters) {
    counters.rows_materially_changed++;
    counters.rows_updated++;
  }
  // One Cycle W1: the summary (hero/count/photo-revision) materially changed
  // → refresh this listing's cached public page. Never throws; a suppressed
  // (unchanged) summary above performs NO revalidation.
  // Same canonical tag set the listing/legacy-media writers use, so the three
  // writers cannot hold three opinions about what a public media change
  // expires. A summary change never moves a listing between buildings, so the
  // current address is both sides — no query to invent a transition.
  safeRevalidateTags(
    publicListingChangeTags(listingId, stored?.address, stored?.address).tags,
    options?.revalidation,
  );

  return summary;
}

/** Accounting for {@link propagateMirroredHeroSummaries}. */
export interface MirroredSummaryPropagation {
  listings_refreshed: number;
  listings_skipped_budget: number;
  listings_failed: number;
}

/**
 * Refresh the `Listing` media summary for every listing touched by the Phase-3
 * R2 drain, IN THE SAME INVOCATION.
 *
 * WHY THIS EXISTS. The drain wrote `listing_media.r2_key` and stopped. Nothing
 * updated the Listing summary, so `primary_photo_r2_key` stayed stale until some
 * future Phase-1 pass happened to call `updateListingMediaSummary` for that
 * listing — possibly never, for a listing whose feed rows are not changing. The
 * PUBLIC surfaces read the summary, not the media rows: the building manifest
 * serves its durable hero from `primary_photo_r2_key` and cards/detail read
 * `primary_photo_url`. So a hero could be mirrored to R2 while the site kept
 * serving the rotating Cotality locator.
 *
 * WRITE-SAFE BY CONSTRUCTION. `updateListingMediaSummary` pre-reads and
 * suppresses a no-op write (`listingMediaSummaryUnchanged`), so a listing whose
 * summary did not actually change costs one read and produces no write and no
 * revalidation. Only genuine changes write and expire cache tags.
 *
 * NO SILENT CAP. When the time budget runs out the remainder is REPORTED in
 * `listings_skipped_budget` rather than dropped quietly — a truncated pass must
 * not read as "everything was refreshed". Skipped listings are picked up by the
 * next run.
 */
export async function propagateMirroredHeroSummaries(
  listingIds: readonly string[],
  deps: {
    updateSummary: (listingId: string) => Promise<unknown>;
    remainingMs: () => number;
    reserveMs?: number;
  },
): Promise<MirroredSummaryPropagation> {
  const reserveMs = deps.reserveMs ?? 0;
  // Dedupe: one drain chunk commonly mirrors several rows of the SAME listing,
  // and the summary is per-listing.
  const unique = [...new Set(listingIds.filter(Boolean))];

  let refreshed = 0;
  let failed = 0;
  let index = 0;

  for (; index < unique.length; index++) {
    if (deps.remainingMs() <= reserveMs) break;
    try {
      await deps.updateSummary(unique[index]);
      refreshed++;
    } catch {
      // Never fail the sync run for a summary refresh: the row-level R2 work is
      // already committed, and the next run retries this listing.
      failed++;
    }
  }

  return {
    listings_refreshed: refreshed,
    listings_skipped_budget: unique.length - index,
    listings_failed: failed,
  };
}

// ─── Checkpoint 4 — R2 upload + reuse behavior ──────────────────────────

/**
 * Per-row shape `mirrorMediaToR2()` operates on. This is a strict subset of
 * the `listing_media` schema — only the fields the function reads.
 *
 * The function NEVER writes `media_url_original`. The original Trestle URL
 * is the source of truth for re-fetching and must remain immutable here.
 */
export interface MirrorMediaToR2Row {
  listing_id: string;
  media_key: string;
  media_type: string;
  order: number;
  media_url_original: string | null;
  r2_key: string | null;
  media_url_cached: string | null;
  /**
   * Persistent-failure tracking (added 2026-05-10).
   * - `r2_attempts` is the consecutive-failure counter; null means "no failed
   *   attempts pending" (treated as 0 by code). Reset to 0 on successful
   *   upload/reuse. Incremented on every failure mode.
   * - On the 3rd consecutive **permanent** HTTP 4xx (`fetch_failed` with
   *   `error` matching `HTTP (404|410)`), Cp4 sets `status='deleted'` to
   *   break the retry loop. See `memory/PR3-PRODUCTION-ROLLOUT-2026-05-09.md`
   *   E8 probe — Trestle confirmed stale URLs return HTTP 404 with body
   *   `{"code":"404","message":"ERROR - External media was not downloaded."}`.
   *   Other 4xx (401/403/408/425/429 etc.) are NOT tombstone-eligible —
   *   they're transient, system-wide, or ambiguous and cooldown alone is
   *   the right response.
   */
  r2_attempts?: number | null;
}

/**
 * Number of consecutive permanent HTTP 4xx failures (404 or 410) after
 * which a `listing_media` row is soft-deleted to stop the retry loop.
 * Tied to the cooldown design — see NEON.md §4 and the E8 probe evidence.
 * Only 404 and 410 qualify; transient/ambiguous 4xx (403/408/425/429 etc.)
 * are NOT tombstone-eligible.
 */
const R2_TOMBSTONE_4XX_THRESHOLD = 3;
/**
 * Minimum time (ms) after a failed mirror attempt before Phase 3 will retry
 * the same row. Prevents the persistent-failure population from consuming
 * the entire Phase 3 budget every cron firing.
 */
export const R2_RETRY_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * RC3 — retry-exhausted exclusion threshold. A non-permanent failure
 * (429 / 5xx / 403 / 408 / network / r2_upload_failed / r2_head_failed / token)
 * NEVER tombstones — the row stays `status='active'` and still serves
 * `media_url_original` via the `/api/media/proxy` fallback. But once a row has
 * failed this many times (≈ `N × 6h` cooldowns ≈ 2 days), it is "retry-exhausted"
 * and dropped from the Phase-3 backlog SELECT so it stops wasting mirror budget —
 * WITHOUT being deleted, so its photo never disappears. Set ABOVE
 * `R2_TOMBSTONE_4XX_THRESHOLD` (3) so transient failures get MORE retries than a
 * permanent 404/410 before parking.
 */
// Owned by lib/media/r2-policy-state (see the re-export near the imports).

/**
 * R2-1 Blocker-1 — POLICY-PARKED sentinel value for `r2_attempts`.
 *
 * A Phase-3 candidate that is fetched but DETERMINISTICALLY rejected by the
 * mirror admission policy (a non-hero photo of a displayable third-party
 * listing — including every gallery row of a listing whose hero is already
 * mirrored — or a media row whose `media_type` is outside its scope's
 * approved set) is PARKED: `r2_attempts` is set to this sentinel and
 * `r2_last_attempt_at` to now, in ONE batched `updateMany` per run. The
 * existing backlog predicate (`r2_attempts IS NULL OR <
 * R2_RETRY_EXHAUSTED_THRESHOLD`) then permanently excludes the row from every
 * future backlog SELECT, so rejected rows can never refill the bounded
 * candidate batch and starve valid heroes. The row stays `status='active'`
 * and its photo keeps serving through the `/api/media/proxy` fallback —
 * parking ONLY removes it from the mirror backlog. Un-parking (if the policy
 * ever widens) is explicitly R2-3's job — nothing in R2-1 clears the sentinel.
 *
 * Value semantics — 9, deliberately ABOVE and DISTINCT from
 * `R2_RETRY_EXHAUSTED_THRESHOLD` (8):
 *   - ABOVE (>= 8): the exclusion predicate `r2_attempts < 8` already parks
 *     it with zero schema change.
 *   - DISTINCT (9 ≠ 8): data forensics can partition the parked population:
 *     `r2_attempts = 9` ⇒ policy-parked (this sentinel);
 *     `r2_attempts = 8` ⇒ failure-exhausted (RC3 retry parking).
 *
 * PROOF that no failure path can ever produce 9 (the sentinel is
 * unambiguous): the only failure-path writer is `mirrorMediaToR2`'s
 * `emitFailure`, which writes `(row.r2_attempts ?? 0) + 1`. A row reaches
 * `mirrorMediaToR2` only after being selected by `buildR2BacklogWhere`,
 * whose predicate requires `r2_attempts IS NULL OR < 8` — so the prior
 * value is at most 7 and a failure write is at most 8. Rows at >= 8 are
 * never re-selected, so `r2_attempts` can never increment past 8 through
 * any failure path. 9 can therefore ONLY be produced by the policy-parking
 * `updateMany` in `runMediaSync` Phase 3.
 */
// Owned by lib/media/r2-policy-state (see the re-export near the imports).

// ─── R2-1 — mirror admission policy (approved by Maya, R2-0, 2026-07) ─────
//
// ROOT CAUSE: the pre-R2-1 Phase-3 backlog SELECT mirrored EVERY active
// `listing_media` row missing its R2 copy — the entire IDX feed's galleries,
// floor plans, videos and virtual tours — growing the R2 bucket to 135.8 GiB
// at ~0.63 GB/day with no admission scope. The binding policy (R2-0):
//
//   1. Mallan-owned listings → retain COMPLETE active photos + floor plans
//      (mirror everything active, as today).
//   2. Third-party displayable listings → mirror the CANONICAL HERO PHOTO ONLY.
//   3. Third-party galleries / floor plans / videos / virtual tours → NOT
//      mirrored; they serve through the existing `/api/media/proxy` fallback
//      (`lib/media/listing-media-resolver.ts` proxies `media_url_original`
//      when `media_url_cached` is null — proven by media-sync-rc3.test.ts).
//   4. Non-displayable / terminal third-party media → NOT admitted at all.
//      (Deletion of already-mirrored objects is R2-2 — NOT this change.)
//
// Ownership signal: `isMallanExclusiveListing` ONLY (SL-/RL- prefix OR
// rls_eligible === false). NEVER agent_id / owner_client_id.
// Display signal: `isListingDisplayable` (canonical fail-closed gate cascade).
// Hero signal: `selectHeroPhoto` (THE production hero resolver — the same
// function that derives `Listing.primary_photo_url`).

/**
 * Maximum photos the mirror may retain in R2 for a third-party (feed)
 * displayable listing: the canonical hero ONLY. This is the approved R2-0
 * ceiling — raising it is a policy change requiring Maya's approval.
 */
export const MAX_FEED_MIRROR_PHOTOS_PER_LISTING = 1;

/**
 * R2-1 Blocker-1b — the EXACT media types the mirror may retain for a
 * Mallan-owned listing: photos and floor plans, per the approved retention
 * policy. Videos and virtual tours are NEVER admitted — not silently, not
 * by default. Widening this list is a policy change requiring Maya's
 * approval. Values are the canonical `CanonicalMediaType` strings written
 * by `classifyTrestleMediaCategory` (the only writer of
 * `listing_media.media_type`).
 */
export const MALLAN_MIRROR_MEDIA_TYPES: readonly string[] = ["Photo", "FloorPlan"];

/**
 * R2-1 Blocker-1a — the EXACT media types the mirror may retain for a
 * third-party (feed) displayable listing: photos ONLY (and of those, only
 * the canonical hero — see MAX_FEED_MIRROR_PHOTOS_PER_LISTING). Feed floor
 * plans / videos / virtual tours are NEVER candidates: they are excluded
 * in-query by `buildR2MirrorPolicyMediaWhere` so they cannot occupy the
 * bounded candidate batch, and re-verified fail-closed in code.
 */
export const FEED_MIRROR_MEDIA_TYPES: readonly string[] = ["Photo"];

/**
 * Structural listing shape the mirror-admission policy reads. Matches the
 * Phase-3 backlog SELECT's `listing` sub-select. All fields besides
 * `listing_id` are nullable so partial/legacy fixtures fail CLOSED.
 */
export interface MirrorPolicyListing {
  listing_id: string | null;
  rls_eligible: boolean | null;
  status: string | null;
  idx_display_yn: boolean | null;
  owner_opt_out: boolean | null;
  participant_only: boolean | null;
  internet_entire_listing_display_yn: boolean | null;
}

/**
 * What the R2 mirror may retain for a listing:
 *   - `all_active` — Mallan-owned: every active media row (photos, floor
 *     plans, …) as today.
 *   - `hero_only`  — third-party displayable: ONLY the canonical hero photo
 *     (`selectHeroPhoto` over the listing's rows), max
 *     `MAX_FEED_MIRROR_PHOTOS_PER_LISTING` (=1).
 *   - `none`       — third-party non-displayable or terminal (or unknown
 *     listing): nothing is admitted to the mirror backlog.
 */
export type MirrorAdmissionScope = "all_active" | "hero_only" | "none";

/**
 * Decide the mirror-admission scope for one listing. Pure; fail-closed.
 *
 * Notes:
 *   - Ownership check delegates to the canonical `isMallanExclusiveListing`
 *     (SL-/RL- listing_id prefix OR rls_eligible === false). agent_id /
 *     owner_client_id are deliberately NOT read — agent linkage is not an
 *     ownership signal here.
 *   - Displayability delegates to the canonical `isListingDisplayable` over
 *     the DB gate columns + status. `close_date` is deliberately NOT passed:
 *     the display layer grants terminal listings a 24h post-close grace
 *     window, but mirror ADMISSION treats every terminal status as
 *     non-admissible (R2-0 rule 4 — mirroring bytes for a listing already
 *     off-market is pure waste). Display grace ≠ mirror admission.
 */
export function decideMirrorAdmissionScope(
  listing: MirrorPolicyListing | null | undefined,
): MirrorAdmissionScope {
  if (!listing) return "none"; // fail-closed: unknown listing ⇒ nothing admitted
  if (isMallanExclusiveListing(listing)) return "all_active";
  const displayable = isListingDisplayable({
    idx_display_yn: listing.idx_display_yn,
    owner_opt_out: listing.owner_opt_out,
    participant_only: listing.participant_only,
    internet_entire_listing_display_yn: listing.internet_entire_listing_display_yn,
    status: listing.status,
  });
  return displayable ? "hero_only" : "none";
}

/**
 * DB-side ownership predicate — the Prisma where-shape of
 * `isMallanExclusiveListing`. Branches are DERIVED from the same exported
 * prefix list the canonical helper uses, so the two cannot drift silently.
 */
export function buildMallanOwnedListingWhere(): Prisma.ListingWhereInput {
  return {
    OR: [
      ...MALLAN_EXCLUSIVE_LISTING_ID_PREFIXES.map((p) => ({
        listing_id: { startsWith: p },
      })),
      { rls_eligible: false },
    ],
  };
}

/**
 * R2-1 admission control — the CHEAP (DB-side) part of the mirror policy,
 * applied inside `buildR2BacklogWhere` so disallowed media never even enters
 * the candidate SELECT (Blocker-1a/1b: the type restriction is IN-QUERY, so
 * never-eligible rows cannot occupy the bounded candidate batch):
 *   - Branch 1: `media_type IN ('Photo','FloorPlan')` rows of Mallan-owned
 *     listings (`MALLAN_MIRROR_MEDIA_TYPES` — the exact approved retention
 *     set; Mallan videos / virtual tours are NOT candidates).
 *   - Branch 2: `media_type IN ('Photo')` rows of third-party DISPLAYABLE
 *     listings (`FEED_MIRROR_MEDIA_TYPES`; `buildSearchDisplayWhere()` = the
 *     production search display gate + active statuses). Third-party floor
 *     plans / videos / virtual tours are excluded here outright.
 * Media of non-displayable / terminal third-party listings match NEITHER
 * branch ⇒ never admitted to the backlog (R2-0 rule 4).
 *
 * The EXPENSIVE part — "is this Photo the canonical hero?" — cannot be
 * expressed in a Prisma where-clause (hero identity requires per-listing
 * ordering across ALL of the listing's rows: preferred_photo_yn, then min
 * `order`, then first-encountered). That refinement happens post-fetch in
 * `runMediaSync` Phase 3 via `selectHeroPhoto` + `decideMirrorAdmissionScope`
 * — and rows it rejects are POLICY-PARKED (`R2_POLICY_PARKED_ATTEMPTS`) so
 * they permanently leave the backlog (Blocker-1).
 */
export function buildR2MirrorPolicyMediaWhere(): Prisma.ListingMediaWhereInput {
  return {
    OR: [
      {
        media_type: { in: [...MALLAN_MIRROR_MEDIA_TYPES] },
        listing: buildMallanOwnedListingWhere(),
      },
      {
        media_type: { in: [...FEED_MIRROR_MEDIA_TYPES] },
        listing: buildSearchDisplayWhere(),
      },
    ],
  };
}

/**
 * Build the Phase-3 R2 backlog SELECT `where`. Exported + pure so the RC3
 * retry-exhausted exclusion is unit-testable without a live DB. A row is eligible
 * when it is active, still missing its R2 copy (`r2_key` OR `media_url_cached`
 * null), past the 6h cooldown, not already attempted this invocation, NOT
 * retry-exhausted, AND (R2-1) admissible under the mirror policy's DB-side
 * filter (`buildR2MirrorPolicyMediaWhere`). `r2_attempts` null (never failed)
 * stays eligible; `>=` threshold is parked. Permanent 404/410 rows are already
 * gone (tombstoned at 3), so any active row at/above the exhaustion threshold
 * is non-permanent by construction — parking it (not deleting it) is the safe
 * stop.
 *
 * R2-1: the pre-R2-1 form of this where (bare `OR r2_key IS NULL` with no
 * listing scope) was the unscoped feed-wide mirror that grew the bucket to
 * 135.8 GiB. It is intentionally NOT reachable anymore — every backlog SELECT
 * goes through this function, which always ANDs the policy filter.
 */
/**
 * THE MIRRORABLE BACKLOG UNIVERSE — the single definition of "R2 work that
 * still genuinely exists".
 *
 * Extracted 2026-08-09 after an independent audit found the Phase-4
 * `backlog_remaining` probe had hand-rebuilt this universe and drifted from the
 * real selector, omitting `media_key: { not: null }` and
 * `r2_policy_excluded_at: null`. That omission was masked while a policy
 * exclusion also stamped `r2_attempts = 9`; the writer cutover deliberately
 * stopped writing that sentinel, so parked rows began passing the probe's
 * attempts clause and were counted as backlog forever.
 *
 * The count is a CONTROL-PLANE input, not just telemetry:
 *   backlog_remaining -> deriveOneCycleFollowup -> backlogPending
 *     -> nextBacklogRunAt -> preflight `backlog_due` -> another One Cycle wake
 * and -> measureBacklogInflow -> computeAdaptiveDrainLimit. A phantom backlog
 * therefore wakes Neon forever and inflates every drain batch.
 *
 * Both consumers MUST layer on this base so they cannot diverge again:
 *   * {@link buildR2BacklogWhere}   adds cooldown + per-invocation exclusions
 *   * the Phase-4 probe             uses this base verbatim
 *
 * COOLDOWN IS DELIBERATELY NOT HERE. A cooldown-deferred row is temporally
 * deferred, not excluded — it is still outstanding work, so it MUST count as
 * backlog pending even though this invocation skips it. Putting the cooldown in
 * the shared base would make the control plane report an empty backlog while
 * real work remained.
 */
export function buildR2MirrorableBacklogUniverseWhere(): Prisma.ListingMediaWhereInput {
  return {
    status: "active",
    media_url_original: { not: null },
    // Unmirrorable rows (media_key IS NULL — schema-legal on legacy/remediation
    // rows) can never be written by the mirror (update-by-media_key), so they
    // would monopolize the fixed bounded window forever (Codex post-merge) and
    // would inflate backlog_remaining with work no code can ever perform.
    media_key: { not: null },
    OR: [{ r2_key: null }, { media_url_cached: null }],
    AND: [
      // RC3 retry-exhausted exclusion — park non-permanent rows that keep
      // failing so they stop consuming Phase-3 budget. The row stays active
      // (photo still serves via the media_url_original proxy) — NOT deleted.
      //
      // This clause ALSO still excludes LEGACY rows parked at the old
      // `r2_attempts = 9` sentinel (9 is not < 8), which is what makes the
      // writer cutover safe without a backfill or a sentinel conversion.
      {
        OR: [
          { r2_attempts: null },
          { r2_attempts: { lt: R2_RETRY_EXHAUSTED_THRESHOLD } },
        ],
      },
      // R2 DELIVERY-POLICY exclusion (explicit column).
      //
      // The sentinel used to do double duty: it recorded the policy decision
      // AND removed the row from the SELECT. Now that a policy exclusion writes
      // its own column, THIS is what keeps a parked row out of the backlog —
      // and, equally, out of the backlog COUNT.
      { r2_policy_excluded_at: null },
      // R2-1 admission control (cheap DB-side part — see
      // buildR2MirrorPolicyMediaWhere; hero-only refinement happens in code).
      buildR2MirrorPolicyMediaWhere(),
    ],
  };
}

export function buildR2BacklogWhere(
  cooldownThreshold: Date,
  attemptedIds: bigint[],
): Prisma.ListingMediaWhereInput {
  const universe = buildR2MirrorableBacklogUniverseWhere();
  const universeAnd = (universe.AND as Prisma.ListingMediaWhereInput[]) ?? [];
  return {
    ...universe,
    // Exclude rows already attempted this invocation (empty ⇒ no filter).
    ...(attemptedIds.length > 0 ? { id: { notIn: attemptedIds } } : {}),
    AND: [
      // Cross-invocation 6h cooldown — the ONE predicate that belongs to the
      // candidate selector and NOT to the backlog universe. Kept FIRST so the
      // established positional assertion in media-sync-phase4-backlog.test.ts
      // continues to address the same clause.
      {
        OR: [
          { r2_last_attempt_at: null },
          { r2_last_attempt_at: { lt: cooldownThreshold } },
        ],
      },
      ...universeAnd,
    ],
  };
}

// ─── Phase 4 — bounded backlog + parked-row recovery ─────────────────────

/**
 * Phase 4: hard cap on rows selected by the ONE bounded backlog query per
 * run. Sized for the Phase-3 time budget (~43s at concurrency 5): 60 rows =
 * 12 chunks; the per-chunk time/budget checks stop earlier when needed.
 * Bounded and correct WITHOUT the (unapplied) `listing_media_r2_backlog_idx`
 * partial index — the query merely benefits if that index is ever applied.
 */
export const R2_BACKLOG_BATCH_LIMIT = 60;

// ── One Cycle W3 — adaptive bounded drain ────────────────────────────────
// Hierarchy (verbatim): Cotality API → sole listing and feed-media truth →
// One Cycle → Neon operational copy → projections → Vercel cache. Business
// data never overrides listing facts.

/** W3: catch-up increment — the drain must EXCEED measured inflow so the
 *  existing backlog shrinks every run. */
export const R2_DRAIN_CATCHUP_INCREMENT = 25;

/** W3: hard upper bound on any single run's selection (NEON-001: never
 *  unbounded). 200 rows = 40 chunks at concurrency 5; the per-chunk time
 *  budget still governs actual work. */
export const R2_DRAIN_HARD_CAP = 200;

/** W3: bounded backlog_remaining probe cap — the probe selects at most
 *  cap+1 ids (value cap+1 means ">cap"), replacing the unbounded COUNT. */
export const R2_BACKLOG_PROBE_CAP = 2000;

/** W3: advisory-lock identity for the drain's candidate-selection mutex. */
export const R2_DRAIN_LOCK_CLASS = 20260723;
export const R2_DRAIN_LOCK_KEY = 1;

/**
 * W3 adaptive sizing (pure): batch = clamp(MIN, inflow + CATCHUP, HARD_CAP).
 * - null / non-finite / negative inflow → the Phase-4 MIN floor (fail-closed
 *   fallback: behaves exactly like the fixed pre-W3 drain).
 * - Always >= MIN (a quiet feed still gets catch-up drainage) and <= the
 *   hard cap (bounded above regardless of measured inflow).
 */
export function computeAdaptiveDrainLimit(inflow: number | null): number {
  if (inflow === null || !Number.isFinite(inflow) || inflow < 0) {
    return R2_BACKLOG_BATCH_LIMIT;
  }
  return Math.min(
    R2_DRAIN_HARD_CAP,
    Math.max(R2_BACKLOG_BATCH_LIMIT, Math.floor(inflow) + R2_DRAIN_CATCHUP_INCREMENT),
  );
}

/**
 * W3 durable inflow measurement (pure). Input: the LAST TWO media_sync_cron
 * audit events (newest first) — a durable store this pipeline already
 * writes, so no new writer is introduced. Backlog conservation gives:
 *   inflow ≈ remaining[n-1] − remaining[n-2] + drained[n-1]  (floored at 0)
 * Returns null (→ MIN fallback) when the history is missing or unusable.
 */
export function measureBacklogInflow(
  events: Array<{ changes: unknown }> | null | undefined,
): number | null {
  const num = (e: { changes: unknown } | undefined, k: string): number | null => {
    const v = e && typeof e.changes === "object" && e.changes !== null
      ? (e.changes as Record<string, unknown>)[k]
      : undefined;
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  if (!events || events.length < 2) return null;
  const remainingLatest = num(events[0], "backlog_remaining");
  const remainingPrior = num(events[1], "backlog_remaining");
  const drainedLatest = num(events[0], "r2_mirrored");
  if (remainingLatest === null || remainingPrior === null || drainedLatest === null) return null;
  return Math.max(0, remainingLatest - remainingPrior + drainedLatest);
}

/**
 * Phase 4: per-run mirror FAILURE budget. Once this many mirror attempts
 * have failed in one run, the remaining queue is NOT attempted (rows stay
 * untouched in the backlog and re-surface next run). Prevents a systemic
 * outage (Trestle/R2 down) from burning the whole Phase-3 budget on
 * failures while keeping per-row failures isolated and precisely counted.
 */
export const R2_RUN_FAILURE_BUDGET = 10;

/**
 * Phase 4: parked-row recovery quota — how many RC3 retry-exhausted rows
 * (`r2_attempts >= R2_RETRY_EXHAUSTED_THRESHOLD`) are re-admitted for ONE
 * standard mirror attempt per run. 0 disables recovery entirely.
 */
export const R2_PARKED_RECOVERY_QUOTA = 5;

/**
 * Phase 4: minimum time since a parked row's LAST failed attempt before it
 * becomes recovery-eligible. Much longer than the 6h retry cooldown — a
 * parked row already failed R2_RETRY_EXHAUSTED_THRESHOLD times.
 */
export const R2_PARKED_RECOVERY_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Phase 4 — parked-row recovery `where` (pure, unit-testable).
 *
 * Eligibility is EXACT-MATCH failure exhaustion ONLY:
 * `r2_attempts === R2_RETRY_EXHAUSTED_THRESHOLD` (exactly 8). Anything
 * ABOVE the threshold is excluded FAIL-CLOSED, because the approved #534
 * mirror-admission-policy design (draft PR #534, stacked on #530 — not in
 * this stack) reserves **attempts = 9 as a permanent POLICY-park sentinel**
 * (non-hero third-party gallery media, unsupported media types) that
 * recovery must never re-admit. When #534's sentinel constant lands, its
 * integration must keep every value above the failure-exhaustion threshold
 * excluded here.
 *
 * Recovery-failure semantics (round 3): a TRANSIENT failure on a recovery
 * attempt leaves `r2_attempts` exactly at the threshold (the counter is
 * NOT written — attempts=9 is reserved exclusively for #534 policy
 * admission) and only refreshes `r2_last_attempt_at`, restarting the long
 * recovery cooldown. The row is retryable ONLY while the row remains `status='active'`, still lacks its R2 copy (`r2_key`/`media_url_cached` missing), and has not received a proven-permanent 404/410 tombstone outcome.
 * A PERMANENT 404/410 (E8 live-proven) still tombstones, also without
 * advancing the counter, and thereby EXITS the row from recovery.
 *
 * Selection never writes/resets any counter (pure code-logic eligibility).
 * Success clears state via the normal success path (attempts→0,
 * cooldown→null). Rows stay `status='active'` while parked (RC3
 * guarantee — photo keeps serving via the proxy).
 *
 * `r2_last_attempt_at` is non-null for every genuinely parked row (each of
 * its threshold failures wrote it), so the `lt` predicate cannot orphan
 * real parked rows.
 */
export function buildR2ParkedRecoveryWhere(
  parkedCooldownThreshold: Date,
): Prisma.ListingMediaWhereInput {
  return {
    status: "active",
    media_url_original: { not: null },
    media_key: { not: null }, // unmirrorable rows never re-admitted (Codex post-merge)
    OR: [{ r2_key: null }, { media_url_cached: null }],
    // EXACT match — see doc above (#534 policy sentinel lives at 9+).
    r2_attempts: R2_RETRY_EXHAUSTED_THRESHOLD,
    r2_last_attempt_at: { lt: parkedCooldownThreshold },
    // EXPLICIT POLICY EXCLUSION also applies here (2026-08-09 audit).
    //
    // Recovery runs its chunk through the SAME `mirrorChunk`, which pushes
    // deterministic admission rejections onto `policyParkIds` even when
    // `recoveryAttempt` is true. So an exactly-8 row can acquire
    // `r2_policy_excluded_at` while KEEPING attempts = 8 — the park writer
    // deliberately no longer touches the counter. Without this clause recovery
    // re-selects that row every cooldown cycle to re-fetch, re-reject and
    // re-park it: the exact "resurface forever" loop the explicit column was
    // introduced to end, left open on the recovery path.
    r2_policy_excluded_at: null,
    // R2-1: recovery must never re-admit media the mirror policy would
    // reject — the same listing-scoped admission filter as the main
    // backlog SELECT (defense-in-depth; the in-chunk filter re-verifies).
    AND: [buildR2MirrorPolicyMediaWhere()],
  };
}

// ─── R2 policy exclusion — bounded re-admission ──────────────────────────

/**
 * How long a policy-parked row waits before its exclusion is reconsidered.
 *
 * The column's schema contract already promised this ("the age gives a bounded
 * re-evaluation window without a second column"); nothing consumed it until
 * now, which is the whole defect. 14 days is chosen against the measured
 * Production population: ~24k rows will eventually be parked, so a 14-day
 * sweep costs ~1.7k single-column updates/day spread across media-sync
 * firings — small next to the sync's own upsert volume, and it bounds how long
 * a photo that has become the canonical hero can stay unmirrored.
 */
export const R2_POLICY_REEVAL_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Rows reconsidered per run. Every scanned row is written exactly once, so this
 * is also the hard per-run write bound for the pass.
 */
export const R2_POLICY_REEVAL_BATCH_LIMIT = 60;

/**
 * Backstop on the WITHIN-RUN fairness top-up. Each round excludes every listing
 * that has failed so far and requests only the write capacity still unused, so
 * the scan advances monotonically and `take` can never grow. This cap only
 * stops a table-wide fault from turning one firing into a long scan. Worst case
 * per run is 1 + this many bounded candidate SELECTs.
 *
 * It is NOT the fairness mechanism on its own — within-run state dies with the
 * run, so N+1 persistently failing groups would pin the same windows forever.
 * {@link R2_POLICY_REEVAL_CURSOR_RESOURCE} carries the fairness ACROSS runs.
 */
export const R2_POLICY_REEVAL_MAX_TOPUPS = 3;

/**
 * DURABLE ROTATION CURSOR. `media_sync_state` is the existing authoritative
 * cursor table (keyed by its unique `resource`), so the sweep gets a
 * cross-invocation starting position with NO schema change and no new writer:
 * one bounded upsert per run, and only when the position actually moves.
 *
 * `last_listing_key` holds the highest `listing_id` examined by the previous
 * run. The next run starts strictly after it, so a group of listings whose hero
 * reads keep failing is stepped over on the FOLLOWING firing instead of pinning
 * the window forever — which the within-run top-up alone cannot guarantee.
 * A short window means the end of the space was reached, and the cursor wraps
 * to null so the rotation starts again from the beginning.
 */
export const R2_POLICY_REEVAL_CURSOR_RESOURCE = "r2_policy_reevaluation";

/**
 * THE RE-ADMISSION SELECTOR — a dedicated, bounded owner.
 *
 * It is deliberately NOT an age clause bolted onto
 * {@link buildR2MirrorableBacklogUniverseWhere}. A parked row must stay out of
 * the backlog AND out of `backlog_remaining` until something actually re-admits
 * it; widening the universe by age would re-create the phantom backlog that
 * wakes One Cycle forever — the exact failure the explicit column was
 * introduced to end.
 *
 * MUTABLE vs IMMUTABLE. `buildR2MirrorPolicyMediaWhere()` is ANDed in, so the
 * only rows selectable are ones the mirror policy would still consider at all.
 * A media_type outside the scope's approved set (a third-party FloorPlan or
 * Video) matches neither branch and is therefore never reconsidered — the
 * immutable class cannot churn. What remains is the genuinely mutable case: a
 * third-party Photo parked only because it was not the canonical hero when it
 * was examined, and hero identity moves with `PreferredPhotoYN` / `order` / the
 * current hero leaving.
 *
 * BOTH PARK ENCODINGS. Two writers have parked rows:
 *   * `r2_policy_excluded_at` non-null — the current writer.
 *   * `r2_attempts = R2_POLICY_PARKED_ATTEMPTS` (9) with a NULL column — the
 *     LEGACY writer. Production holds ~20k of these and every currently
 *     stranded hero is one of them, so re-admission that ignored them would fix
 *     almost nothing. The legacy branch ages off `r2_last_attempt_at` (the old
 *     writer stamped it on every park) and requires the new column to be null,
 *     so a migrated row can only ever match one branch.
 *
 * Exactly-8 (real retry exhaustion) and >9 (legacy fail-closed) are NOT policy
 * parks and are never selected here.
 */
export function buildR2PolicyReevaluationWhere(
  reevalThreshold: Date,
): Prisma.ListingMediaWhereInput {
  return {
    status: "active",
    media_url_original: { not: null },
    // Same reason as the backlog universe: the mirror updates by media_key, so
    // a null key can never be written and must never be reconsidered.
    media_key: { not: null },
    OR: [{ r2_key: null }, { media_url_cached: null }],
    AND: [
      {
        OR: [
          // Current writer — the column IS the age clock.
          { r2_policy_excluded_at: { lt: reevalThreshold } },
          // Legacy writer — sentinel + the cooldown stamp it wrote alongside.
          {
            r2_policy_excluded_at: null,
            r2_attempts: R2_POLICY_PARKED_ATTEMPTS,
            OR: [
              { r2_last_attempt_at: null },
              { r2_last_attempt_at: { lt: reevalThreshold } },
            ],
          },
        ],
      },
      buildR2MirrorPolicyMediaWhere(),
    ],
  };
}

export interface R2PolicyReevaluationOptions {
  /** Injectable clock — the caller passes the run's single clock. */
  now?: () => number;
  batchLimit?: number;
  intervalMs?: number;
}

/**
 * `readmitted` and `kept_parked` are PERSISTED state, read back from each
 * `updateMany`'s own `count` — not from the decision loop. A rejected, short or
 * guard-missed write is reported in `write_failed`, never as work that
 * happened. That matters because these counters are the only observable for
 * this pass in Production: a decision-level counter would let the run report
 * rows as re-admitted while the exclusion was still in the table.
 *
 * `scanned` and `deferred` are DECISION counts by definition — `scanned` is what
 * the selector returned, and a deferred row is deliberately not written at all.
 *
 * Invariant: `scanned = readmitted + kept_parked + deferred + write_failed`.
 */
export interface R2PolicyReevaluationResult {
  /** Rows reconsidered this run — the DECISION count. */
  scanned: number;
  /** CONFIRMED written: policy exclusion cleared, row rejoins the backlog. */
  readmitted: number;
  /** CONFIRMED written: still excluded, re-evaluation clock restarted. */
  kept_parked: number;
  /**
   * Undecidable this firing because the per-listing hero read failed.
   *
   * DELIBERATELY NOT WRITTEN. A hero read fails only on a transient DB fault,
   * and that fault says nothing about the row's policy state — re-stamping it
   * would invent a park time the system never decided AND silently cost the row
   * a full re-evaluation interval. The row is left exactly as it is and retried
   * on the next firing; the batch cap bounds the cost of re-selecting it.
   * Reported separately from `kept_parked` so a listing that keeps failing is
   * visible instead of looking like ordinary converged work.
   */
  deferred: number;
  /**
   * Rows the pass DECIDED to write this run (`readmitted + kept_parked +
   * write_failed`). Distinct from `scanned`, which counts rows EXAMINED and can
   * exceed the batch limit when the fairness top-up replaces deferred rows.
   * This is the number the batch limit actually bounds.
   */
  decided: number;
  /** Scanned rows whose write did NOT persist (statement rejected, or state moved). */
  write_failed: number;
  /**
   * The candidate SELECT itself failed. Without this, "the query is broken" and
   * "nothing is due" both returned an identical all-zero result — and converged
   * IS the expected steady state, so a sweep that had stopped running entirely
   * would never be noticed.
   */
  selector_failed: boolean;
}

/**
 * Reconsider a bounded batch of policy-parked rows.
 *
 * This pass performs NO R2 work. It only decides whether an exclusion still
 * holds; re-admitted rows are mirrored later by the ordinary Phase-3 drain
 * under its existing write and failure caps. It therefore cannot spike R2
 * writes, cannot forge an attempt or a cooldown, and cannot reset a real
 * failure count.
 *
 * FORWARD PROGRESS. Every row the pass could DECIDE is written at most once —
 * re-admitted or re-stamped — and a re-stamped row is not due again for a full
 * interval, so the same row cannot churn between firings. Rows it could not
 * decide (hero read failed) are deliberately left untouched and retried next
 * firing rather than given a fabricated park time; the batch cap bounds the
 * cost of re-selecting them, and `deferred` makes a persistently failing
 * listing visible. A write is not guaranteed to land: each statement re-asserts
 * the state it selected on, so a row another invocation changed in between is
 * skipped and counted in `write_failed`.
 *
 * LEGACY SENTINEL. On re-admission `r2_attempts = 9` is cleared to null. That
 * is not erasing failure history: the failure path caps the counter at 8
 * (`CASE WHEN r2_attempts < 8 THEN r2_attempts + 1`), so 9 is unreachable by
 * failure and is purely the legacy policy marker. Leaving it would keep the row
 * out of the backlog through the untouched `r2_attempts < 8` clause and make
 * the re-admission a no-op. A genuine 0-7 count is never touched.
 */
export async function reevaluateR2PolicyExclusions(
  options: R2PolicyReevaluationOptions = {},
): Promise<R2PolicyReevaluationResult> {
  const nowFn = options.now ?? (() => Date.now());
  const batchLimit = options.batchLimit ?? R2_POLICY_REEVAL_BATCH_LIMIT;
  const intervalMs = options.intervalMs ?? R2_POLICY_REEVAL_INTERVAL_MS;
  const result: R2PolicyReevaluationResult = {
    scanned: 0,
    readmitted: 0,
    kept_parked: 0,
    deferred: 0,
    decided: 0,
    write_failed: 0,
    selector_failed: false,
  };

  type ReevalRow = {
    id: bigint;
    listing_id: string;
    media_key: string | null;
    media_type: string;
    r2_attempts: number | null;
    listing: MirrorPolicyListing | null;
  };

  const REEVAL_SELECT = {
    id: true,
    listing_id: true,
    media_key: true,
    media_type: true,
    r2_attempts: true,
    listing: {
      select: {
        listing_id: true,
        rls_eligible: true,
        status: true,
        idx_display_yn: true,
        owner_opt_out: true,
        participant_only: true,
        internet_entire_listing_display_yn: true,
      },
    },
  } as const;

  /**
   * OPTIMISTIC-CONCURRENCY BOUND. `updated_at` is Prisma `@updatedAt`, so ANY
   * write to a row bumps it. Capturing the instant BEFORE selection lets every
   * persistence statement carry one shared `updated_at <= selectionAt`
   * predicate, which excludes a row that a concurrent feed ingest, CRM
   * set-main, mirror or re-admission touched after we read it — without
   * exploding into per-row statements.
   */
  const selectionAt = new Date(nowFn());
  const dueThreshold = new Date(nowFn() - intervalMs);

  /** Durable rotation position read below; declared here for `advanceCursor`. */
  let cursor: string | null = null;

  /**
   * Move the durable rotation forward (or wrap it to null at the end of the
   * space). ONE bounded upsert per run, and only when the position actually
   * changes — this is a cursor, not a new write stream. A failure is swallowed:
   * the next run simply re-reads the old position and repeats a window, which
   * is wasteful but never incorrect.
   */
  const advanceCursor = async (next: string | null): Promise<void> => {
    if (next === cursor) return;
    try {
      await prisma.mediaSyncState.upsert({
        where: { resource: R2_POLICY_REEVAL_CURSOR_RESOURCE },
        create: { resource: R2_POLICY_REEVAL_CURSOR_RESOURCE, last_listing_key: next },
        update: { last_listing_key: next },
      });
    } catch {
      /* non-fatal — rotation retries next firing */
    }
  };

  // DURABLE ROTATION. Read where the previous run stopped. A missing row, a
  // null key or a read failure all mean "start from the beginning" — the sweep
  // must never be blocked by its own bookkeeping.
  try {
    const state = await prisma.mediaSyncState.findUnique({
      where: { resource: R2_POLICY_REEVAL_CURSOR_RESOURCE },
      select: { last_listing_key: true },
    });
    cursor = state?.last_listing_key ?? null;
  } catch {
    cursor = null;
  }
  const afterCursor: Prisma.ListingMediaWhereInput =
    cursor === null ? {} : { listing_id: { gt: cursor } };

  let candidates: ReevalRow[];
  try {
    candidates = (await prisma.listingMedia.findMany({
      where: { ...buildR2PolicyReevaluationWhere(dueThreshold), ...afterCursor },
      select: REEVAL_SELECT,
      // Deterministic and listing-clustered, so ONE hero read serves every
      // parked row of the same listing — and it is the order the durable
      // rotation cursor advances along.
      orderBy: [{ listing_id: "asc" }, { id: "asc" }],
      take: batchLimit,
    })) as unknown as ReevalRow[];
  } catch {
    // Never fails the run — but it must be DISTINGUISHABLE from "nothing due",
    // which is the expected steady state and looks identical otherwise.
    result.selector_failed = true;
    return result;
  }
  if (candidates.length === 0) {
    // End of the rotation (or nothing due at all). Wrap so the next firing
    // starts from the beginning instead of sitting past the last listing.
    if (cursor !== null) await advanceCursor(null);
    return result;
  }

  // INTENT lists. The result counters are filled in later from what the
  // database actually confirms, so a rejected write cannot be reported as done.
  /** Re-admit, preserving real failure history. */
  const readmitPlain: bigint[] = [];
  /** Re-admit AND clear the legacy sentinel (9 is not failure history). */
  const readmitLegacy: bigint[] = [];
  /** Still excluded — clock restarts. */
  const keptParked: bigint[] = [];
  /** Undecidable (hero read failed) — NOT written; retried next firing. */
  const deferred: bigint[] = [];

  /**
   * A FAILED hero lookup is not the same as "this listing has no hero", and
   * caching the failure as `null` conflated them: rows 2..N of the failing
   * listing then took the ordinary not-the-hero path and were re-stamped with a
   * fresh interval on an UNDECIDABLE hero, stranding a sibling that may have
   * just become canonical and undercounting `deferred`. The sentinel keeps the
   * two outcomes distinct for every row of the listing.
   */
  const HERO_LOOKUP_FAILED = Symbol("hero-lookup-failed");
  const heroKeyCache = new Map<string, string | null | typeof HERO_LOOKUP_FAILED>();
  /** Listings whose hero could not be resolved this run. */
  const failedListings = new Set<string>();
  /** Every listing this run looked at — drives the durable rotation cursor. */
  const examinedListingIds = new Set<string>();

  const decide = async (rows: ReevalRow[]): Promise<void> => {
    for (const row of rows) {
      examinedListingIds.add(row.listing_id);
      const scope = decideMirrorAdmissionScope(row.listing);
      const approvedTypes =
        scope === "all_active" ? MALLAN_MIRROR_MEDIA_TYPES : FEED_MIRROR_MEDIA_TYPES;

      // Fail-closed: a listing that is no longer admissible, or a media_type
      // the scope does not approve, stays parked. (The DB-side filter already
      // excludes both; re-checked here so a drifted where can never widen
      // re-admission.)
      if (scope === "none" || !approvedTypes.includes(row.media_type)) {
        keptParked.push(row.id);
        continue;
      }

      if (scope === "all_active") {
        // Mallan-owned: the complete active Photo + FloorPlan set is retained,
        // so hero identity is irrelevant to admission.
        (row.r2_attempts === R2_POLICY_PARKED_ATTEMPTS ? readmitLegacy : readmitPlain).push(row.id);
        continue;
      }

      // hero_only — the mutable case. Resolve the listing's canonical hero with
      // the SAME production resolver the summary and the mirror use, so a
      // re-admitted row is one the mirror will actually accept.
      let heroKey: string | null | typeof HERO_LOOKUP_FAILED;
      if (heroKeyCache.has(row.listing_id)) {
        heroKey = heroKeyCache.get(row.listing_id) as string | null | typeof HERO_LOOKUP_FAILED;
      } else {
        try {
          const listingRows = await prisma.listingMedia.findMany({
            where: { listing_id: row.listing_id },
            // HERO PARITY — identical shape to the Phase-3 admission read and
            // to `computeListingMediaSummary`. Without media_category /
            // media_classification / media_url_original, `classifyMediaItem`
            // cannot see a FloorPlan stored as `media_type='Photo'`, and this
            // pass would re-admit the wrong row.
            select: {
              media_key: true,
              media_type: true,
              media_category: true,
              media_classification: true,
              media_url_original: true,
              status: true,
              preferred_photo_yn: true,
              order: true,
              // LISTING-WIDE STALENESS. The per-row `updated_at <= selectionAt`
              // guard on the write covers the CANDIDATE, but the hero decision
              // is computed from every sibling: if the previous hero is
              // tombstoned or re-ordered concurrently, this candidate can
              // become the hero without its own timestamp moving, and the
              // guard would still match and re-stamp it for another interval.
              // Reading sibling timestamps here lets a listing that moved be
              // treated as undecidable instead.
              updated_at: true,
            },
          });
          const listingMoved = listingRows.some(
            (r) => (r as { updated_at?: Date }).updated_at instanceof Date &&
              ((r as { updated_at: Date }).updated_at.getTime() > selectionAt.getTime()),
          );
          heroKey = listingMoved
            ? HERO_LOOKUP_FAILED
            : (selectHeroPhoto(listingRows)?.media_key ?? null);
        } catch {
          heroKey = HERO_LOOKUP_FAILED;
        }
        heroKeyCache.set(row.listing_id, heroKey);
      }

      if (heroKey === HERO_LOOKUP_FAILED) {
        failedListings.add(row.listing_id);
        deferred.push(row.id);
      } else if (heroKey !== null && row.media_key === heroKey) {
        (row.r2_attempts === R2_POLICY_PARKED_ATTEMPTS ? readmitLegacy : readmitPlain).push(row.id);
      } else {
        // Successful lookup, this row is not the hero (or the listing has no
        // eligible photo at all) — a real decision, so the clock restarts.
        keptParked.push(row.id);
      }
    }
  };

  await decide(candidates);
  result.scanned = candidates.length;

  // FAIRNESS TOP-UP. The window is `orderBy listing_id asc` + `take`, so
  // listings whose hero read keeps failing sit at the head of it on every
  // firing and later listings would never be examined.
  //
  // The top-up must LOOP, not run once: a single replacement window can itself
  // land entirely on a second failing listing, and then the same two windows
  // repeat forever while a healthy listing further down is never reached. Each
  // round excludes every listing that has failed SO FAR (including in previous
  // top-ups) plus everything already scanned, so the exclusion set grows
  // monotonically and the scan advances. Capped at
  // R2_POLICY_REEVAL_MAX_TOPUPS so a table-wide fault cannot turn one firing
  // into an unbounded scan; the cap is a backstop, not the normal path.
  const scannedIds: bigint[] = candidates.map((c) => c.id);
  /** Rows this run intends to WRITE. The batch limit bounds exactly this. */
  const decidedCount = () => readmitPlain.length + readmitLegacy.length + keptParked.length;
  for (let round = 0; round < R2_POLICY_REEVAL_MAX_TOPUPS; round++) {
    // REMAINING WRITE CAPACITY, not the cumulative deferred count. Deriving the
    // shortfall from `result.scanned - scannedIds.length` was wrong: both grow
    // together so the difference was always zero, every round re-requested the
    // whole deferred count, and a successful replacement never reduced it —
    // three rounds could write 3x the documented cap, and with failing rounds
    // the requested window grew 60 -> 120 -> 240. Anchoring on decided intents
    // makes the cap mechanical: `take` can never exceed `batchLimit`, and a
    // successful top-up shrinks the next request.
    const remaining = batchLimit - decidedCount();
    if (failedListings.size === 0 || remaining <= 0) break;
    let topUp: ReevalRow[];
    try {
      topUp = (await prisma.listingMedia.findMany({
        where: {
          ...buildR2PolicyReevaluationWhere(dueThreshold),
          // ONE `listing_id` filter — the rotation bound and the failure
          // exclusion must be merged, not spread over each other.
          listing_id: {
            ...(cursor === null ? {} : { gt: cursor }),
            notIn: [...failedListings],
          },
          id: { notIn: scannedIds },
        },
        select: REEVAL_SELECT,
        orderBy: [{ listing_id: "asc" }, { id: "asc" }],
        take: remaining,
      })) as unknown as ReevalRow[];
    } catch {
      break; // best-effort fairness — the primary window is already processed
    }
    if (topUp.length === 0) break;
    await decide(topUp);
    result.scanned += topUp.length;
    scannedIds.push(...topUp.map((r) => r.id));
  }
  result.decided = decidedCount();

  /**
   * Persist one intent group and report what the DATABASE confirms.
   *
   * STATE-SAFE. Selection and persistence are separate statements and another
   * invocation can mirror, park or re-admit a row in between (the drain's
   * advisory lock covers the drain, not this pass, and the media upsert path
   * writes these rows too). Writing by `id` alone would let this pass clear a
   * sentinel that is no longer there, or re-park a row someone else just
   * re-admitted. Each statement therefore re-asserts the exact state it
   * selected on, and Postgres evaluates that predicate at write time.
   *
   * Each group also gets its own statement and its own guard, so a rejection is
   * attributed to that group instead of silently truncating the rest — and the
   * returned count, not the intent size, is what the caller sees. A short count
   * (row deleted, or state moved so the guard no longer matches) is reported the
   * same honest way. Failure stays non-fatal and idempotent: an unwritten row is
   * simply reconsidered on a later firing.
   */
  const persist = async (
    ids: bigint[],
    guard: Prisma.ListingMediaWhereInput,
    data: Prisma.ListingMediaUpdateManyMutationInput,
  ): Promise<number> => {
    if (ids.length === 0) return 0;
    try {
      const written = await prisma.listingMedia.updateMany({
        where: {
          id: { in: ids },
          // OPTIMISTIC CONCURRENCY. The park-marker guards below prove the row
          // is still parked, but NOT that the hero decision we made from it is
          // still valid: a feed ingest or a CRM set-main can change
          // preferred_photo_yn / order / classification between the hero read
          // and this write, and re-stamping then delays a row that just became
          // canonical by another full interval. `updated_at` is Prisma
          // `@updatedAt`, so ANY concurrent write bumps it — one shared
          // predicate covers every such mutation without needing per-row
          // statements or a lock. A row that moved is skipped and lands in
          // `write_failed`; it is simply reconsidered on a later firing.
          updated_at: { lte: selectionAt },
          ...guard,
        },
        data,
      });
      return written.count;
    } catch {
      return 0;
    }
  };

  /** Still parked under EITHER encoding — the precondition for re-stamping. */
  const stillParked: Prisma.ListingMediaWhereInput = {
    OR: [
      { r2_policy_excluded_at: { not: null } },
      { r2_attempts: R2_POLICY_PARKED_ATTEMPTS },
    ],
  };

  const restampAt = new Date(nowFn());
  // At most three statements per run, regardless of batch size. Deferred rows
  // are deliberately NOT written (see `deferred` on the result type), so they
  // add no statement and no fabricated timestamp.
  result.readmitted =
    // Selected via the explicit column, so only clear it if it is still set.
    (await persist(
      readmitPlain,
      { r2_policy_excluded_at: { not: null } },
      { r2_policy_excluded_at: null },
    )) +
    // Legacy: only clear the sentinel if the row still carries exactly 9.
    (await persist(
      readmitLegacy,
      { r2_attempts: R2_POLICY_PARKED_ATTEMPTS },
      { r2_policy_excluded_at: null, r2_attempts: null },
    ));
  result.kept_parked = await persist(keptParked, stillParked, {
    r2_policy_excluded_at: restampAt,
  });
  result.deferred = deferred.length;

  // ADVANCE THE DURABLE ROTATION. Move to the highest listing_id examined, so
  // the next firing starts strictly AFTER any group whose hero reads failed —
  // this, not the within-run top-up, is what stops N+1 persistently failing
  // groups from pinning the window forever. A primary window that came back
  // short means the end of the space was reached, so the cursor wraps to null
  // and the rotation restarts from the beginning.
  let highestExamined: string | null = null;
  for (const id of examinedListingIds) {
    if (highestExamined === null || id > highestExamined) highestExamined = id;
  }
  await advanceCursor(candidates.length < batchLimit ? null : highestExamined);

  result.write_failed =
    result.scanned - (result.readmitted + result.kept_parked + result.deferred);

  return result;
}

/**
 * DI seam for `mirrorMediaToR2()`. All R2 / fetch / token surfaces are
 * injected so tests can stub them without ever touching the live R2
 * bucket, the live Trestle endpoint, or the live IDX OAuth token cache.
 *
 * The Prisma `listingMedia.update` call is NOT injected — tests use
 * `jest.mock('@/lib/prisma')` (matching Checkpoints 1-3) and the real
 * production code path uses the imported singleton. This keeps the DI
 * surface focused on the network-side dependencies.
 */
export interface MirrorMediaToR2Deps {
  existsInR2: (key: string) => Promise<boolean>;
  uploadToR2: (key: string, buffer: Buffer, contentType: string) => Promise<string>;
  getR2PublicUrl: (key: string) => string;
  getAccessToken: () => Promise<string>;
  fetchFn: typeof fetch;
}

/** Production defaults — wired to `lib/images/r2`, `lib/idx/auth`, and global `fetch`. */
export const defaultMirrorMediaToR2Deps: MirrorMediaToR2Deps = {
  existsInR2: defaultExistsInR2,
  uploadToR2: defaultUploadToR2,
  getR2PublicUrl: defaultGetR2PublicUrl,
  getAccessToken: defaultGetAccessToken,
  fetchFn: fetch,
};

/** Outcome reported back to the caller (the future cron route in Checkpoint 5). */
export interface MirrorMediaToR2Result {
  /**
   * `uploaded`  — fetched from Trestle and written to R2 this run.
   * `reused`    — already in R2; no fetch, no upload.
   * `skipped`   — input row had no `media_url_original` (nothing to mirror).
   * `failed`    — R2 / fetch / upload error; DB row left untouched.
   */
  status: "uploaded" | "reused" | "skipped" | "failed";
  /** R2 key the row was mirrored to (for `uploaded` / `reused`). */
  r2_key?: string;
  /** Public R2 URL written to `listing_media.media_url_cached`. */
  media_url_cached?: string;
  /** Stable machine-readable failure / skip reason code. */
  reason?:
    | "no_media_url_original"
    /**
     * #575 fail-closed: the row has no stable Trestle `MediaKey` and no
     * existing `r2_key`, so no deterministic object key can be derived.
     * Skipped rather than keyed by `Order` (a presentation ordinal), which is
     * what produced duplicate R2 objects on every gallery reorder.
     */
    | "no_media_key"
    | "r2_head_failed"
    | "token_failed"
    | "fetch_failed"
    | "fetch_threw"
    | "non_image_content_type"
    | "upload_failed";
  /** Human-readable error detail (HTTP status, exception message, etc). */
  error?: string;
}

/**
 * Mirror a single Trestle Media row to R2 if it isn't already there.
 *
 * Boundary contract:
 *   - NEVER writes `media_url_original` (it is the immutable source).
 *   - NEVER writes any field on `Listing` (Checkpoint 3 owns that — call
 *     `updateListingMediaSummary()` separately afterward).
 *   - NEVER writes `Listing.media` JSON (PR 4's reader-swap territory).
 *   - Only the two fields `r2_key` and `media_url_cached` may be written
 *     by this function on `listing_media`.
 *
 * Idempotency:
 *   - Two calls in a row for the same row produce: 1 upload + 1 reuse.
 *   - The R2 key is deterministic per `(listing_id, media_type, order)` via
 *     `buildMediaR2Key()`, so retrying a fresh row computes the same key
 *     the cron would have produced earlier.
 *   - DB write is suppressed when the row's `r2_key` and `media_url_cached`
 *     already match the computed values (prevents `updated_at` churn).
 *
 * Failure handling:
 *   - All failure modes return a structured `MirrorMediaToR2Result` rather
 *     than throwing. The caller (Checkpoint 5 cron) can aggregate
 *     per-row outcomes and update `MediaSyncState.rows_failed` without a
 *     single failure poisoning the batch.
 *   - On `failed`: writes `r2_last_attempt_at = NOW()` and increments
 *     `r2_attempts` so Phase 3 can skip the row for the cooldown window.
 *     If the failure is a permanent HTTP 4xx (`reason: 'fetch_failed'`
 *     with `error` matching `HTTP (404|410)`) AND this is the 3rd
 *     consecutive failure, also sets `status='deleted'` to break the
 *     retry loop. Other 4xx (401/403/408/425/429 etc.), 5xx, network,
 *     R2-side, and token failures increment the counter but NEVER
 *     tombstone — they are transient, system-wide, or ambiguous.
 *   - On `uploaded` / `reused` (with DB write): clears `r2_last_attempt_at`
 *     and resets `r2_attempts` to 0 alongside the r2_key/media_url_cached
 *     write.
 *   - On `skipped` (no `media_url_original`): no DB write.
 */
export async function mirrorMediaToR2(
  row: MirrorMediaToR2Row,
  deps: MirrorMediaToR2Deps = defaultMirrorMediaToR2Deps,
  /**
   * Phase 4 (round 3): `recoveryAttempt: true` marks a row selected through
   * the PARKED-RECOVERY path (r2_attempts exactly at the failure-exhaustion
   * threshold). On that path a TRANSIENT failure must NOT advance
   * `r2_attempts` — the value above the threshold (9) is reserved
   * EXCLUSIVELY for #534's deterministic policy-park sentinel and must
   * never be produced by a failure. Only `r2_last_attempt_at` is refreshed
   * (restarting the long recovery cooldown). The row is retryable ONLY while the row remains `status='active'`, still lacks its R2 copy (`r2_key`/`media_url_cached` missing), and has not received a proven-permanent 404/410 tombstone outcome.
   * The E8 live-proven PERMANENT 404/410 tombstone contract still applies
   * (threshold long since satisfied) — also without advancing the counter —
   * and thereby EXITS the row from recovery.
   */
  context: { recoveryAttempt?: boolean } = {},
): Promise<MirrorMediaToR2Result> {
  const url = (row.media_url_original ?? "").trim();
  if (!url) {
    // Skipped — no media to mirror. No DB write (cooldown not relevant).
    return { status: "skipped", reason: "no_media_url_original" };
  }

  // R2 key resolution: prefer existing (stable across retries), else derive.
  // `buildMediaR2Key` namespaces by canonical mediaType (Photo→photos/,
  // FloorPlan→floorplans/, Video→videos/, VirtualTour→virtualtours/) and
  // addresses the object by the STABLE Trestle `MediaKey` (#575), NOT by
  // `Order` — a presentation ordinal the feed reassigns on every gallery
  // reorder, which produced one duplicate object per reorder.
  //
  // PREFERRING THE EXISTING `r2_key` IS WHAT MAKES THIS NON-DISRUPTIVE:
  // already-mirrored rows keep their current key, so legacy objects are
  // neither renamed, copied, nor re-uploaded when the key FORMAT changes.
  // Only rows that have never been mirrored derive a MediaKey-addressed key.
  //
  // It is also what makes signed-URL rotation a no-op: the key is derived from
  // identity, never from `media_url_original`, so a rotated query string
  // cannot produce a new object.
  //
  // FAIL-CLOSED: a row with no `media_key` and no existing `r2_key` is skipped
  // rather than keyed by `Order`. `MirrorMediaToR2Row.media_key` is typed
  // non-nullable and all 320,913 production rows have one (0 NULL, measured
  // read-only 2026-07-28), so this fires only on a regression or a malformed
  // caller.
  const existingKey = row.r2_key && row.r2_key.length > 0 ? row.r2_key : null;
  const stableMediaKey = (row.media_key ?? "").trim();
  if (!existingKey && !stableMediaKey) {
    return { status: "skipped", reason: "no_media_key" };
  }
  const key =
    existingKey ?? buildMediaR2Key(row.listing_id, row.media_type, stableMediaKey);

  // Failure path emits cooldown + attempts increment (and possibly tombstone)
  // before returning the structured result. Centralized so every `failed`
  // exit goes through the same DB-write path.
  const emitFailure = async (
    result: MirrorMediaToR2Result,
  ): Promise<MirrorMediaToR2Result> => {
    if (!row.media_key) {
      // Defensive — without media_key we can't update by unique key.
      // Should never happen since callers select rows where media_key is set.
      return result;
    }
    // Recovery attempts never advance the counter — see the `context` doc.
    const isRecoveryAttempt = context.recoveryAttempt === true;
    // Tombstone-eligible only when the HTTP status proves the binary is
    // permanently unfetchable:
    //   - 404 — E8-confirmed: Trestle CDN body
    //     `{"code":"404","message":"ERROR - External media was not downloaded."}`
    //   - 410 — RFC-correct "intentionally retired" response (defensive
    //     coverage; not yet observed but semantically equivalent to 404)
    // All other 4xx (401/403/408/425/429 in particular) are either
    // system-wide, transient, or ambiguous — cooldown alone is the right
    // response. 429 is the most important to NOT tombstone given Trestle's
    // documented 480/min media URL ceiling.
    const isPermanent4xx =
      result.reason === "fetch_failed" &&
      typeof result.error === "string" &&
      /^HTTP (404|410)$/.test(result.error);
    // ── ONE ATOMIC PARAMETERIZED FAILURE WRITE (PR #584) ──────────────────
    //
    // The cooldown, the counter and the tombstone are ONE logical fact about
    // ONE failed attempt, so ONE statement commits them. They used to be two
    // independent writes, which produced two defects:
    //
    //   1. PARTIAL COMMIT. A crash, dropped connection or killed process
    //      between the writes left the row with a refreshed cooldown (and
    //      possibly `status='deleted'`) but no counter advance — a failure
    //      that silently did not count. An interleaved success could also
    //      leave `r2_attempts = 1` with a null `r2_last_attempt_at`.
    //   2. TOMBSTONE FROM A STALE SNAPSHOT. The status was decided from
    //      `row.r2_attempts` — a value read during batch selection. Two
    //      workers overlapping on a row at 1 both computed 2 and both
    //      declined to tombstone, while their atomic increments serialized
    //      1 -> 2 -> 3. The row survived its third permanent failure, and
    //      enough overlap parked it at 8 without ever tombstoning.
    //
    // The persisted count is now computed BY THE DATABASE from the value
    // stored at the moment the statement runs, never in TypeScript:
    //
    //   NULL -> 1        first failure; no separate IS NULL statement, so a
    //                    concurrent worker cannot lose the second failure to
    //                    a guard that no longer matches
    //   0..7 -> +1       ordinary consecutive-failure advance
    //   8    -> 8        retry-exhausted TERMINAL (RC3)
    //   9    -> 9        policy-parked TERMINAL (#534) — assigned, never
    //                    reached by arithmetic, never decremented toward 8
    //   >9   -> as found legacy overflow (80 frozen production rows, max
    //                    112). Deliberately NOT normalised.
    //
    // The tombstone reads that SAME atomically computed next count, in the
    // same statement, so the write that actually produces the third
    // permanent failure is the one that tombstones — whatever any worker's
    // snapshot claimed. Tombstoning stays restricted to permanent 4xx
    // (404 / 410); 5xx, network, R2-side, token and every other 4xx error is
    // transient or ambiguous and only earns a cooldown. 429 in particular
    // must never tombstone, given Trestle's 480/min media-URL ceiling.
    //
    // The WHERE carries the SAME eligibility the selection used
    // (`buildR2BacklogWhere`): `status = 'active'` AND the unmirrored
    // predicate `(r2_key IS NULL OR media_url_cached IS NULL)`. A stale
    // failure released after the row stopped being eligible matches ZERO
    // rows, whichever way it stopped being eligible:
    //
    //   - a SUCCESSFUL mirror committed: the pointers are populated, so the
    //     unmirrored half rejects it and the mirrored columns, reset counter
    //     and cleared cooldown cannot be clobbered;
    //   - the row was TOMBSTONED: `status='deleted'` with BOTH pointers still
    //     NULL, which is exactly the state a proven-permanent 404 leaves
    //     behind. The unmirrored half still matches such a row, so without
    //     the status condition a stale worker would keep advancing the
    //     counter and refreshing the cooldown on a row that is no longer
    //     eligible to mirror at all.
    //
    // A THIRD condition bounds the write by the same ATTEMPTS eligibility the
    // selection used — ordinary `(r2_attempts IS NULL OR r2_attempts < 8)`,
    // recovery `r2_attempts = 8`. Without it the counter's distinct meanings
    // collapse into one:
    //
    //   NULL / 1..7  an ordinary consecutive-FAILURE COUNT
    //   8            retry-exhausted terminal (RC3) — still a failure count
    //   9            POLICY-PARKED sentinel (#534) — ASSIGNED, never reached
    //                by arithmetic, and NOT a failure count
    //   >9           legacy overflow (80 frozen production rows, max 112)
    //
    // Parked rows deliberately stay ACTIVE and UNMIRRORED — that is why
    // parking is not deletion; the photo still serves through the
    // media_url_original proxy — so they satisfy the status and pointer
    // halves. An ordinary worker selected at `< 8` can race an invocation that
    // parks the row at 9: the counter CASE preserves 9, but the STATUS
    // expression re-evaluates that CASE, reads 9, finds `9 >= 3` true, and
    // tombstones a parked row on that worker's FIRST permanent 404. Nine is
    // not three failures. The same exposure applies to the >9 legacy
    // population, which this path must never tombstone or normalise.
    //
    // Deliberately NOT included: the backlog cooldown window, or any other
    // selection predicate. The guard covers identity, status, mirror pointers
    // and attempts — nothing further.
    //
    // Every condition is load-bearing and none subsumes another. A write must
    // never be bounded more loosely than the selection that produced it.
    //
    // Every `${...}` below is a Prisma bind parameter, NOT SQL text. The
    // media key is always data and can never alter the statement — proven by
    // the SQL-shaped-media_key control in the Layer 2 suite.
    //
    // `RETURNING r2_attempts, status` reports the committed outcome. No
    // TypeScript branch depends on it, which is the point: the database
    // decides both the count and the status.
    const now = new Date();
    if (isRecoveryAttempt) {
      // Recovery rows sit at exactly the exhaustion threshold. `r2_attempts`
      // is deliberately ABSENT from the SET list — it stays exactly 8 — while
      // the refreshed timestamp alone restarts the long recovery cooldown.
      // A proven-permanent source loss still tombstones, without advancing
      // the counter. attempts = threshold + 1 (9) is reserved for #534 policy
      // admission and is NEVER written by any failure path.
      await prisma.$queryRaw`
        UPDATE listing_media
        SET r2_last_attempt_at = ${now},
            status = CASE
              WHEN ${isPermanent4xx}::boolean
               AND r2_attempts >= ${R2_TOMBSTONE_4XX_THRESHOLD}
              THEN 'deleted'
              ELSE status
            END
        WHERE media_key = ${row.media_key}
          AND status = 'active'
          AND (r2_key IS NULL OR media_url_cached IS NULL)
          AND r2_attempts = ${R2_RETRY_EXHAUSTED_THRESHOLD}
        RETURNING r2_attempts, status
      `;
    } else {
      await prisma.$queryRaw`
        UPDATE listing_media
        SET r2_last_attempt_at = ${now},
            r2_attempts = CASE
              WHEN r2_attempts IS NULL THEN 1
              WHEN r2_attempts < ${R2_RETRY_EXHAUSTED_THRESHOLD} THEN r2_attempts + 1
              ELSE r2_attempts
            END,
            status = CASE
              WHEN ${isPermanent4xx}::boolean
               AND (CASE
                      WHEN r2_attempts IS NULL THEN 1
                      WHEN r2_attempts < ${R2_RETRY_EXHAUSTED_THRESHOLD} THEN r2_attempts + 1
                      ELSE r2_attempts
                    END) >= ${R2_TOMBSTONE_4XX_THRESHOLD}
              THEN 'deleted'
              ELSE status
            END
        WHERE media_key = ${row.media_key}
          AND status = 'active'
          AND (r2_key IS NULL OR media_url_cached IS NULL)
          AND (r2_attempts IS NULL OR r2_attempts < ${R2_RETRY_EXHAUSTED_THRESHOLD})
        RETURNING r2_attempts, status
      `;
    }

    return result;
  };

  // Reuse path: object already in R2.
  let exists = false;
  try {
    exists = await deps.existsInR2(key);
  } catch (e) {
    return emitFailure({
      status: "failed",
      reason: "r2_head_failed",
      error: e instanceof Error ? e.message : String(e),
    });
  }

  if (exists) {
    const publicUrl = deps.getR2PublicUrl(key);
    // Suppress no-op writes — only persist when something actually drifted.
    // (The drift case includes "first time we discover the existing R2 object",
    // which is precisely when we want to clear any stale cooldown state.)
    if (row.r2_key !== key || row.media_url_cached !== publicUrl) {
      await prisma.listingMedia.update({
        where: { media_key: row.media_key },
        data: {
          r2_key: key,
          media_url_cached: publicUrl,
          // Success clears cooldown state.
          r2_last_attempt_at: null,
          r2_attempts: 0,
        },
      });
    }
    return { status: "reused", r2_key: key, media_url_cached: publicUrl };
  }

  // Upload path: fetch from Trestle, then upload to R2.
  let token: string;
  try {
    token = await deps.getAccessToken();
  } catch (e) {
    return emitFailure({
      status: "failed",
      reason: "token_failed",
      error: e instanceof Error ? e.message : String(e),
    });
  }

  let buffer: Buffer;
  let contentType: string;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8_000);
    let response: Response;
    try {
      response = await deps.fetchFn(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "image/*" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      return emitFailure({
        status: "failed",
        reason: "fetch_failed",
        error: `HTTP ${response.status}`,
      });
    }

    contentType = response.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return emitFailure({
        status: "failed",
        reason: "non_image_content_type",
        error: contentType,
      });
    }

    buffer = Buffer.from(await response.arrayBuffer());
  } catch (e) {
    return emitFailure({
      status: "failed",
      reason: "fetch_threw",
      error: e instanceof Error ? e.message : String(e),
    });
  }

  let publicUrl: string;
  try {
    publicUrl = await deps.uploadToR2(key, buffer, contentType);
  } catch (e) {
    return emitFailure({
      status: "failed",
      reason: "upload_failed",
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // Persist r2_key + media_url_cached. NEVER touch media_url_original.
  // Success also clears any cooldown state from prior failures.
  await prisma.listingMedia.update({
    where: { media_key: row.media_key },
    data: {
      r2_key: key,
      media_url_cached: publicUrl,
      r2_last_attempt_at: null,
      r2_attempts: 0,
    },
  });

  return { status: "uploaded", r2_key: key, media_url_cached: publicUrl };
}

// ─── Checkpoint 5 — orchestration (cron-callable) ───────────────────────

/**
 * Trestle Property row shape — strict subset of fields `runMediaSync()` reads.
 *
 * Compliance gates use the canonical field names from
 * `lib/idx/trestle-mapper.ts:706-721`:
 *   - `Permission` enum (singular, preferred): values `'OwnerOptOut'` /
 *     `'Owner Opt-Out'` ⟹ owner opt-out gate (REBNY Gate 1); value `'Private'`
 *     ⟹ participant-only gate (REBNY Gate 2).
 *   - `Permissions` (plural) is a legacy variant some Trestle feeds still
 *     return — we accept either.
 *   - `MlsStatus = 'OwnerOptOut'` is an alternate owner-opt-out signal.
 *   - `InternetEntireListingDisplayYN` is the master internet display gate
 *     (REBNY Gate 3); false ⟹ block.
 *
 * The shapes `OwnerOptOut: boolean` and `ParticipantOnly: boolean` do NOT
 * exist on Trestle (were never real Trestle fields — see
 * `lib/idx/trestle-mapper.ts:710-712`). Do not reintroduce them.
 */
export interface TrestleProperty {
  ListingId?: string | null;
  ListingKey?: string | null;
  ListingKeyNumeric?: string | number | null;
  PhotosChangeTimestamp?: string | null;
  ModificationTimestamp?: string | null;
  StandardStatus?: string | null;
  Permission?: string | null;
  Permissions?: string | null;
  MlsStatus?: string | null;
  InternetEntireListingDisplayYN?: boolean | null;
  InternetAddressDisplayYN?: boolean | null;
}

/**
 * Defensive REBNY compliance gate at orchestrator level. Returns `true` when
 * the property must be skipped (no Media fetch, no upsert).
 *
 * Mirrors `checkDistributionGates()` in `lib/idx/trestle-mapper.ts:706-724`
 * for the gates that are cheap to evaluate per-listing without further joins:
 *   - REBNY Gate 1 (Owner Opt-Out): `Permission`/`Permissions` enum
 *     `'OwnerOptOut'` / `'Owner Opt-Out'` OR `MlsStatus === 'OwnerOptOut'`.
 *   - REBNY Gate 2 (Participant Only): `Permission`/`Permissions` enum `'Private'`.
 *   - REBNY Gate 3 (Internet Display): `InternetEntireListingDisplayYN === false`.
 *
 * Per-row Permission filtering on the Media resource and `MediaStatus='Deleted'`
 * tombstoning are handled inside `upsertListingMedia()`.
 *
 * Trestle's IDX Plus license edge pre-filters most blocked rows; this is
 * defense-in-depth so a future feed-policy change cannot leak.
 */
export function isPropertyComplianceBlocked(property: TrestleProperty): boolean {
  const permission =
    (typeof property.Permission === "string" ? property.Permission : "") ||
    (typeof property.Permissions === "string" ? property.Permissions : "");
  const ownerOptOut =
    permission === "OwnerOptOut" ||
    permission === "Owner Opt-Out" ||
    String(property.MlsStatus || "") === "OwnerOptOut";
  const participantOnly = permission === "Private";
  const internetDisplayBlocked = property.InternetEntireListingDisplayYN === false;
  return ownerOptOut || participantOnly || internetDisplayBlocked;
}

/** Test-injectable Trestle fetchers. */
export interface MediaSyncFetchDeps {
  /** Fetch one Property page using the RC1 keyset cursor. */
  fetchProperties: (cursor: PropertyQueryCursor, top: number) => Promise<TrestleProperty[]>;
  /**
   * Fetch the COMPLETE media set for a listing (following `@odata.nextLink`).
   * RESOLVES ⇒ complete set (safe to tombstone vanished rows). THROWS ⇒ the
   * media could not be completely fetched — caller preserves existing media,
   * does not tombstone, and does not advance the cursor past this listing.
   */
  fetchMedia: (resourceRecordKey: string) => Promise<UpsertListingMediaInput[]>;
}

export interface RunMediaSyncOptions {
  /** Hard cap on listings processed per cron firing (default 50). */
  listingsPerRun?: number;
  /** Hard cap on Media rows fetched per listing (default 30). */
  mediaPerListing?: number;
  /** First-run cursor fallback in days (default 30). */
  fallbackWindowDays?: number;
  /** DI seam for Trestle Property + Media fetch. */
  fetchDeps?: MediaSyncFetchDeps;
  /** DI seam for the R2 mirror function (`mirrorMediaToR2()` deps). */
  mirrorDeps?: MirrorMediaToR2Deps;
  /**
   * Total wall-clock time budget for the function (ms). Set BELOW Vercel's
   * `maxDuration=120s` so we always have headroom to checkpoint + audit
   * before the platform kills the process. Default 100_000 (100s).
   */
  budgetMs?: number;
  /**
   * Minimum remaining time when Phase 1 (source ingest) must stop, leaving
   * headroom for Phase 2 (cursor checkpoint), Phase 3 (R2 enrichment), and
   * Phase 4 (finalize + audit). Default 55_000 (55s) → Phase 1 gets ~45s.
   */
  phase1ReserveMs?: number;
  /**
   * Minimum remaining time when Phase 3 (R2 enrichment) must stop, leaving
   * headroom for Phase 4 (finalize + audit write by the route). Default
   * 12_000 (12s).
   */
  phase2ReserveMs?: number;
  /**
   * DI seam for `Date.now()` — lets tests inject a deterministic clock to
   * exercise budget paths without real timers. Defaults to `Date.now`.
   */
  now?: () => number;
  /**
   * Phase 4: override for R2_BACKLOG_BATCH_LIMIT (tests / tuning only —
   * production callers use the default).
   */
  backlogBatchLimit?: number;
  /**
   * Phase 4: override for R2_PARKED_RECOVERY_QUOTA. 0 disables parked-row
   * recovery (no recovery query is issued at all).
   */
  parkedRecoveryQuota?: number;
}

export interface RunMediaSyncResult {
  /**
   * `ok`      — Phase 1 completed within budget without per-listing failures
   *              and Phase 3 had no R2 failures (R2 backlog may still be > 0
   *              if budget exhausted).
   * `partial` — at least one Phase 1 listing failed OR at least one Phase 3
   *              R2 row failed. Cursor advanced for ingested listings only.
   * `error`   — Trestle Property fetch failed. Cursor NOT advanced. No
   *              Phase 3 ran.
   */
  status: "ok" | "partial" | "error";
  /**
   * Why the function exited:
   *   `completed`     — all properties ingested AND R2 backlog drained (or empty)
   *   `budget_phase1` — time budget stopped Phase 1 mid-batch; Phase 2/3 still ran
   *   `budget_phase2` — time budget stopped Phase 3 mid-backlog; Phase 4 still ran
   *   `source_error`  — Property fetch failed; no further phases ran
   */
  exit_reason: "completed" | "budget_phase1" | "budget_phase2" | "source_error";
  rows_checked: number;
  /**
   * PHYSICAL listing_media writes this run — ONE precise meaning (Phase 3):
   *   rows_updated === rows_inserted + rows_updated_changed
   *                    + (delivery-URL refreshes) + tombstoned_explicit + tombstoned_vanished.
   * i.e. every create, update, delivery-refresh, and tombstone updateMany row.
   * (Pre-Phase-3 this excluded delivery refreshes and tombstones.)
   */
  rows_updated: number;
  // ── #530 detailed cumulative outcome ledger (summed across all listings this
  // run). Input/write reconciliation is authoritative ONLY when rows_failed===0
  // (rows_checked increments after a complete Media fetch, so a mid-upsert
  // failure can leave fetched/partial work outside these detailed counters).
  rows_inserted: number;
  rows_updated_changed: number;
  rows_skipped_unchanged: number;
  rows_skipped_invalid: number;
  delete_signals_received: number;
  tombstoned_explicit: number;
  tombstoned_vanished: number;
  /** INVARIANT: rows_tombstoned === tombstoned_explicit + tombstoned_vanished. */
  rows_tombstoned: number;
  // ── Phase-1 write-amplification forensic (2026-07-25): the minimal cause
  //    counters that CANNOT be derived from the fields already emitted.
  //    Additive/observability only — change NO write decision. Redundant aliases
  //    are deliberately NOT stored (audit growth is under investigation):
  //      physical_writes  === rows_updated  (already emitted) — asserted by test
  //      non_tombstone    === rows_inserted + rows_updated_changed + delivery_url_refreshed (derivable)
  //    INVARIANT (rows_failed===0), asserted in media-sync-cron.test:
  //      rows_updated === rows_inserted + rows_updated_changed
  //                       + delivery_url_refreshed + tombstoned_explicit + tombstoned_vanished
  /** Material-unchanged rows written SOLELY to refresh a not-yet-mirrored URL. */
  delivery_url_refreshed: number;
  /** Suppressed: URL query/signature rotated only (origin+pathname identical). */
  suppressed_url_signature_rotation: number;
  /** Suppressed: URL origin/pathname changed (potential asset replacement; Phase-2 decision). */
  suppressed_url_identity_changed: number;
  /** Per-row create/update failures (isolated; listing fails closed). */
  write_failures: number;
  /**
   * Phase 3 (surface C) — Listing media-summary write path accounting.
   * Physical Listing.update calls only; materially-identical summaries are
   * suppressed and counted under rows_suppressed_unchanged.
   */
  summary_writes: SummaryWriteCounters;
  // ── #541 comparator-attribution diagnostic (cumulative; observability only).
  // INVARIANTS on a run where rows_failed===0:
  //   existing_rows_compared === rows_skipped_unchanged + rows_with_one_mismatch + rows_with_multiple_mismatches
  //   rows_updated_changed   === rows_with_one_mismatch + rows_with_multiple_mismatches
  //   mismatch_media_url_exact === mismatch_media_url_identity + mismatch_media_url_identity_equivalent
  existing_rows_compared: number;
  mismatch_status: number;
  mismatch_listing_id: number;
  mismatch_resource_record_key: number;
  mismatch_resource_record_id: number;
  mismatch_media_url_exact: number;
  mismatch_media_url_identity: number;
  mismatch_media_url_identity_equivalent: number;
  mismatch_media_type: number;
  mismatch_media_category: number;
  mismatch_media_classification: number;
  mismatch_order: number;
  mismatch_preferred_photo: number;
  mismatch_media_modification_ts: number;
  mismatch_modification_ts: number;
  rows_with_one_mismatch: number;
  rows_with_multiple_mismatches: number;
  rows_failed: number;
  listings_processed: number;
  listings_skipped: number;
  /**
   * RC5: Trestle Properties whose listing has NO local `listings` row
   * ("ghosts" — never imported, e.g. feed-reconcile orphan-create failing).
   * Counted within `listings_skipped` as resolved skips so the keyset
   * watermark advances past them instead of freezing the cursor.
   */
  ghost_listings_skipped: number;
  /** RC5: ListingIds of the skipped ghosts (capped at GHOST_ID_LOG_CAP). */
  ghost_listing_ids: string[];
  /**
   * R2-1: Phase-3 backlog candidates ADMITTED by the mirror policy this
   * invocation (i.e. handed to `mirrorMediaToR2`). Accounting invariant:
   *   mirror_allowed ≡ r2_uploaded + r2_reused + r2_failed + r2_skipped
   */
  mirror_allowed: number;
  /**
   * R2-1: Phase-3 backlog candidates REJECTED by the mirror admission policy
   * this run (non-hero photo of a displayable third-party listing, a
   * media_type outside the scope's approved set, or — defensively — media of
   * a non-admissible/unknown listing that slipped past the DB-side filter).
   * Never mirrored; no Trestle fetch, no R2 write. Superset of
   * `mirror_rejected_policy_parked`.
   */
  mirror_rejected_policy: number;
  /**
   * R2-1 Blocker-1: the subset of `mirror_rejected_policy` that was
   * POLICY-PARKED this run — DETERMINISTIC rejections (non-hero feed photo,
   * incl. gallery rows of a listing whose hero is already mirrored, and
   * disallowed media types) written with `r2_attempts =
   * R2_POLICY_PARKED_ATTEMPTS` (9) + `r2_last_attempt_at = now()` in ONE
   * batched `updateMany`, permanently excluding them from every future
   * backlog SELECT via the existing `r2_attempts < 8` predicate. TRANSIENT
   * rejections (hero lookup failure; scope-'none' select/re-check race) are
   * NOT parked and re-surface next firing. Parked rows stay `status='active'`
   * and keep serving through the `/api/media/proxy` fallback. This is a
   * convergence write. Per-row it is one write per park; a parked row leaves
   * the candidate set until PHASE 4a (`reevaluateR2PolicyExclusions`) decides
   * the exclusion no longer holds, so the per-run count converges to zero once
   * the historical gallery backlog is parked.
   */
  mirror_rejected_policy_parked: number;
  /**
   * PHASE 4a: policy-parked rows whose exclusion was reconsidered this run —
   * the DECISION count, and the pass's per-run write bound.
   */
  r2_policy_reevaluated: number;
  /** CONFIRMED written: re-admitted to the ordinary backlog. */
  r2_policy_readmitted: number;
  /** CONFIRMED written: still excluded (or undecidable); clock restarted. */
  r2_policy_kept_parked: number;
  /**
   * Reconsidered rows whose write did NOT persist. Read back from each
   * `updateMany`'s own count rather than from the decision loop, so a rejected
   * statement can never be reported as work that happened (Codex P2, #599).
   * Non-zero is not a run failure — those rows are simply reconsidered later —
   * but a sustained non-zero means the sweep is not converging.
   */
  /**
   * PHASE 4a rows the pass DECIDED to write this run. Distinct from
   * `r2_policy_reevaluated`, which counts rows EXAMINED and can exceed the
   * batch limit when the fairness top-up replaces deferred rows. This is the
   * number the batch limit actually bounds.
   */
  r2_policy_decided: number;
  r2_policy_write_failed: number;
  /**
   * PHASE 4a rows that could not be DECIDED this firing because the per-listing
   * hero read failed. Not written and not a failure — retried next firing —
   * but reported separately from `r2_policy_kept_parked` so a listing that
   * keeps failing is visible instead of looking like converged work.
   */
  r2_policy_deferred: number;
  /**
   * PHASE 4a candidate SELECT itself failed this run. "Nothing due" and "the
   * query is broken" are otherwise identical all-zero results, and converged is
   * the expected steady state — so without this a sweep that had stopped
   * running entirely would never be noticed.
   */
  r2_policy_selector_failed: boolean;
  /** LEGACY aggregate: R2 mirror successes (`r2_uploaded + r2_reused`) in Phase 3. */
  r2_mirrored: number;
  /** R2-1 split of `r2_mirrored`: fetched from Trestle and uploaded to R2 this run. */
  r2_uploaded: number;
  /** R2-1 split of `r2_mirrored`: object already existed in R2 — reused, no upload. */
  r2_reused: number;
  /** R2 mirror failures in Phase 3 — row stays in backlog for retry. */
  r2_failed: number;
  /** Phase 4: rows returned by the ONE bounded main-backlog SELECTION query. */
  r2_backlog_batch_selected: number;
  /** Phase 4: rows returned by the zero-or-one parked-recovery SELECTION query. */
  r2_parked_recovery_selected: number;
  /**
   * Phase 4: parked rows ACTUALLY handed to mirrorMediaToR2 this run —
   * incremented at hand-off, never at selection. selected > attempted means
   * the time budget expired before the reserved chunk could run.
   */
  r2_parked_recovery_attempted: number;
  /**
   * Phase 4: true ONLY when the MAIN-drain hard failure cap stopped the
   * drain early AND left >= 1 selected main row unattempted (no mirror
   * call, no DB write — the remainder re-surfaces next run). False when
   * the cap is reached exactly on the final row (nothing left untouched).
   */
  r2_failure_budget_exhausted: boolean;
  /** One Cycle W1 — bounded aggregate cache-revalidation counters. */
  pages_revalidated: number;
  revalidation_failures: number;
  /**
   * Phase-3b: Listing summaries refreshed in the SAME invocation as the R2
   * mirror that changed them. `skipped_budget > 0` means the pass ran out of
   * time with listings still stale — surfaced rather than silently dropped, so
   * a truncated run cannot be mistaken for a complete one.
   */
  summary_propagation_refreshed: number;
  summary_propagation_skipped_budget: number;
  summary_propagation_failed: number;
  // ── One Cycle W3 — durable drain counters ──
  /** Measured backlog inflow since the prior run (null = history unusable → MIN fallback). */
  backlog_inflow_since_last_run: number | null;
  /** Candidate rows selected this run (main + parked). */
  rows_selected: number;
  /** Rows actually handed to the mirror (main attempted + parked attempted). */
  rows_attempted: number;
  /** Successfully mirrored rows (= r2_mirrored; explicit W3 alias). */
  rows_drained: number;
  /** Mirror failures (= r2_failed; explicit W3 alias). */
  failures: number;
  /** 1 when the selection advisory lock was held by another run → drain skipped. */
  overlap_prevented: number;
  /** True when the Phase-3 time budget stopped the drain (exit_reason budget_phase2). */
  time_budget_exhausted: boolean;
  /** Bounded classification of the selection path this run. */
  query_path_classification: "adaptive" | "fallback_min" | "skipped_overlap";
  /** = duration_ms (explicit W3 name). */
  run_duration_ms: number;
  /** R2 mirror skips in Phase 3 (e.g., row had no `media_url_original`). */
  r2_skipped: number;
  /**
   * Count of `listing_media` rows still missing `r2_key` or `media_url_cached`
   * after Phase 3 completes (or budget exits). null if the count query failed.
   */
  backlog_remaining: number | null;
  duration_ms: number;
  /** Set when `status === "error"`. */
  error?: string;
}

export const DEFAULT_LISTINGS_PER_RUN = 50;
/** RC5: cap on ghost ListingIds carried in the run result (log hygiene). */
export const GHOST_ID_LOG_CAP = 20;
export const DEFAULT_MEDIA_PER_LISTING = 30;
/**
 * RC1: per-PAGE Media `$top`. The complete set for a listing is assembled by
 * following `@odata.nextLink` across pages (see `defaultFetchMedia`), so this is
 * a page size, NOT a per-listing cap — no listing's photos are silently truncated.
 */
export const DEFAULT_MEDIA_PAGE_SIZE = 200;
export const DEFAULT_FALLBACK_WINDOW_DAYS = 30;
/**
 * Time-budget defaults (chosen to fit Vercel `maxDuration=120s` with headroom):
 *   - DEFAULT_BUDGET_MS = 100s  (20s headroom before Vercel kill)
 *   - DEFAULT_PHASE1_RESERVE_MS = 55s  → Phase 1 runs at most ~45s
 *   - DEFAULT_PHASE2_RESERVE_MS = 12s  → Phase 3 runs at most ~43s; Phase 4 has 12s
 */
export const DEFAULT_BUDGET_MS = 100_000;
export const DEFAULT_PHASE1_RESERVE_MS = 55_000;
export const DEFAULT_PHASE2_RESERVE_MS = 12_000;
/**
 * R2 mirror concurrency for Phase 3. Matches the production-tested pattern
 * in `lib/idx/sync.ts:694` (`MAX_CONCURRENT = 5` inside `migrateMediaToR2`).
 * Trestle's published Media URL ceiling is 480/min ≈ 8/sec
 * (per `data/RLS-FIELD-REGISTRY.md:307-310`); concurrency-5 with sequential
 * batches sustains ~5/sec — comfortably within Trestle's bandwidth budget
 * and matches the proven-production `migrateMediaToR2` cron that has drained
 * 128K+ photos without incident.
 */
export const R2_MIRROR_CONCURRENCY = 5;

/**
 * Build the OData query params for the Property page fetch. Exported for
 * tests; production callers go through `defaultFetchProperties()`.
 *
 * Boundary safety:
 *   - `$filter` uses `ge` (not `gt`) on `PhotosChangeTimestamp`. Combined
 *     with idempotent upsert keyed on `media_key`, this re-includes the
 *     boundary timestamp on each run so no listings sharing the cursor's
 *     timestamp are permanently skipped between firings (review comment 2).
 *   - `$orderby` adds `ListingKey asc` as a stable tie-breaker so Trestle
 *     paging produces a deterministic order within same-PCT clusters.
 *
 * Compliance fields:
 *   - `$select` includes `Permission` (singular) and `MlsStatus`, the canonical
 *     compliance fields per `lib/idx/trestle-mapper.ts:74` and the IDX Plus CSV.
 *   - `$select` deliberately does NOT include `Permissions` (plural). Although
 *     `isPropertyComplianceBlocked()` defensively reads `property.Permissions`
 *     for legacy-feed safety, the plural form does NOT exist as a Trestle IDX
 *     Plus Property field — including it in `$select` causes Trestle to return
 *     HTTP 400 (verified in production 2026-05-09T07:00:25Z, first PR-3 firing).
 *     `Permission` (singular) is the only Trestle-valid form; the runtime
 *     fallback to `property.Permissions` simply reads `undefined` on this feed,
 *     which is harmless.
 */
export interface PropertyQueryCursor {
  /** Watermark timestamp — `null` ⇒ first run, fall back to `fallbackSince`. */
  lastPhotosChange: Date | null;
  /** Keyset tie-breaker — `null` ⇒ inclusive `ge` transition run. */
  lastListingKey: string | null;
  /** First-run window floor (used only when `lastPhotosChange` is null). */
  fallbackSince: Date;
}

export function buildPropertyQuery(cursor: PropertyQueryCursor, top: number): URLSearchParams {
  const params = new URLSearchParams();
  const statuses =
    "(StandardStatus eq 'Active' or StandardStatus eq 'ActiveUnderContract' or StandardStatus eq 'ComingSoon' or StandardStatus eq 'Pending')";

  // RC1 keyset continuation — fixes same-timestamp starvation:
  //   - null watermark      → first run: PhotosChangeTimestamp ge fallbackSince
  //   - watermark, null key → transition run (no tie-breaker yet): ge ts
  //   - watermark + key      → (pct gt ts) OR (pct eq ts AND ListingKey gt 'key')
  //     so a run of >top listings sharing one PhotosChangeTimestamp resumes
  //     AFTER the last processed ListingKey instead of re-fetching the head.
  let timeClause: string;
  if (cursor.lastPhotosChange === null) {
    timeClause = `PhotosChangeTimestamp ge ${cursor.fallbackSince.toISOString()}`;
  } else if (cursor.lastListingKey === null) {
    timeClause = `PhotosChangeTimestamp ge ${cursor.lastPhotosChange.toISOString()}`;
  } else {
    const ts = cursor.lastPhotosChange.toISOString();
    const key = cursor.lastListingKey.replace(/'/g, "''"); // OData single-quote escape
    timeClause = `(PhotosChangeTimestamp gt ${ts} or (PhotosChangeTimestamp eq ${ts} and ListingKey gt '${key}'))`;
  }
  params.set("$filter", `${timeClause} and ${statuses}`);
  // `Permissions` (plural) is NOT a Trestle IDX Plus Property field — see the
  // doc comment above. Do NOT add it back. `Permission` (singular) is canonical.
  params.set(
    "$select",
    "ListingId,ListingKey,ListingKeyNumeric,PhotosChangeTimestamp,ModificationTimestamp,StandardStatus,Permission,MlsStatus,InternetEntireListingDisplayYN,InternetAddressDisplayYN",
  );
  params.set("$orderby", "PhotosChangeTimestamp asc,ListingKey asc");
  params.set("$top", String(top));
  return params;
}

async function defaultFetchProperties(
  cursor: PropertyQueryCursor,
  top: number,
): Promise<TrestleProperty[]> {
  const token = await defaultGetAccessToken();
  const TRESTLE_API = process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle";

  const url = `${TRESTLE_API}/odata/Property?${buildPropertyQuery(cursor, top).toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Property fetch failed: HTTP ${res.status}`);
  const data = await res.json();
  return (data.value || []) as TrestleProperty[];
}

// ONE DEFINITION OF ODATA MEDIA COMPLETENESS.
//
// `paginateMedia` + `MediaPage` now live in `./fetch` so that ALL THREE callers
// — this module's `defaultFetchMedia`, `sync.ts` batch-media, and
// `fetch.ts`'s `fetchListingMedia` — share the SAME page follower. They are
// re-exported here so every existing importer (and its tests) keeps working
// against a single definition rather than a copy.
//
// Direction matters: the follower moved DOWN into `fetch` (which has no Prisma
// import) rather than `fetch` importing this Prisma-backed module, so the
// pre-Neon skip boundary proven in commit 8 is not weakened.
export { paginateMedia, type MediaPage } from "./media-pagination";
// Also imported for this module's OWN use (`defaultFetchMedia` /
// `defaultFetchMediaPage`): a re-export does not bring names into local scope.
import { paginateMedia, type MediaPage } from "./media-pagination";

async function defaultFetchMediaPage(url: string): Promise<MediaPage> {
  const token = await defaultGetAccessToken();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Media fetch failed: HTTP ${res.status}`);
  const data = await res.json();
  return {
    value: (data.value || []) as unknown[],
    nextLink: (data["@odata.nextLink"] as string | undefined) ?? null,
  };
}

/**
 * Fetch the COMPLETE media set for one listing, following `@odata.nextLink`.
 * THROWS when pagination is incomplete (a page failed / runaway) — runMediaSync
 * treats a throw as a per-listing failure: it preserves existing media, does NOT
 * tombstone, and does not advance the cursor past this listing. A successful
 * return therefore guarantees a complete set, which is what makes
 * `tombstoneVanished: true` safe.
 */
async function defaultFetchMedia(resourceRecordKey: string): Promise<UpsertListingMediaInput[]> {
  const TRESTLE_API = process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle";
  const escaped = resourceRecordKey.replace(/'/g, "''");
  const params = new URLSearchParams();
  params.set("$filter", `ResourceRecordKey eq '${escaped}'`);
  params.set(
    "$select",
    "MediaKey,ResourceRecordKey,ResourceRecordID,MediaURL,MediaCategory,MediaClassification,MediaStatus,Permission,Order,PreferredPhotoYN,ModificationTimestamp,MediaModificationTimestamp",
  );
  params.set("$orderby", "Order asc");
  // Per-page size; the rest of a high-photo listing is followed via @odata.nextLink.
  params.set("$top", String(DEFAULT_MEDIA_PAGE_SIZE));

  const firstUrl = `${TRESTLE_API}/odata/Media?${params.toString()}`;
  // The shared follower is generic; this caller's rows are Media upsert inputs.
  const { rows, complete } = await paginateMedia<UpsertListingMediaInput>(
    firstUrl,
    defaultFetchMediaPage,
  );
  if (!complete) {
    throw new Error(`Media pagination incomplete for ResourceRecordKey='${resourceRecordKey}'`);
  }
  return rows;
}

/**
 * The production fetch dependencies.
 *
 * EXPORTED so a caller overriding ONE dependency can spread these and keep the
 * rest canonical. `runMediaSync` resolves `options.fetchDeps ?? defaultFetchDeps`,
 * so a PARTIAL object silently replaces the WHOLE set: overriding
 * `fetchProperties` alone leaves `fetchMedia` undefined and every listing fails
 * (observed as `failed:1`, `status:partial`, zero rows checked). Spreading this
 * makes "keep production media fetching" explicit and impossible to half-do.
 */
export const defaultFetchDeps: MediaSyncFetchDeps = {
  fetchProperties: defaultFetchProperties,
  fetchMedia: defaultFetchMedia,
};

/**
 * One pass of the media-sync pipeline. Phased architecture for durability
 * under Vercel `maxDuration=120s`:
 *
 *   Phase 1 — Source ingest (per-listing, serial):
 *     fetchProperties → for each listing: fetchMedia → upsertListingMedia
 *     → updateListingMediaSummary → push cursorRecords. R2 mirror is NOT
 *     in this phase. Stops when remaining time < `phase1ReserveMs`.
 *
 *   Phase 2 — Cursor checkpoint:
 *     Always runs after Phase 1 (unless Property fetch failed). Calls
 *     `advanceMediaSyncCursor` with records ingested so far. THIS makes
 *     forward progress durable BEFORE the slow R2 work runs — a Vercel
 *     kill during Phase 3 cannot undo Phase 1 progress.
 *
 *   Phase 3 — R2 enrichment backlog (parallel-5):
 *     Queries `listing_media` rows where `r2_key IS NULL OR
 *     media_url_cached IS NULL` (oldest first). Processes them with
 *     `Promise.allSettled` and concurrency 5 — matching the proven-
 *     production pattern in `lib/idx/sync.ts:694-708` (`migrateMediaToR2`),
 *     and within Trestle's 480/min Media URL ceiling
 *     (per `data/RLS-FIELD-REGISTRY.md:307-310`). Stops when remaining
 *     time < `phase2ReserveMs`. R2 failures count in `r2_failed` (separate
 *     from source `rows_failed`); the row stays in the backlog for retry.
 *
 *   Phase 4 — Finalize + return:
 *     Counts remaining backlog, computes final status, returns the result.
 *     The route at `app/api/cron/media-sync/route.ts` writes the audit
 *     row when this function returns.
 *
 * Watermark safety:
 *   - Property fetch failure ⟹ `status: "error"`, `exit_reason:
 *     "source_error"`. Cursor NOT advanced. Phase 2/3/4 do not run.
 *   - Per-listing failure ⟹ `rows_failed++`; listing NOT pushed to
 *     cursorRecords. Surfaces again next run.
 *   - Summary-update failure (NEW: fail-loud) ⟹ same as per-listing failure.
 *   - Empty Property page ⟹ Phase 2 advances `last_run_at` heartbeat only
 *     (per `advanceMediaSyncCursor`'s empty-batch contract).
 *   - Time budget exit ⟹ Phase 2/3/4 still run with whatever was ingested.
 *
 * Compliance:
 *   - Skips listings via `isPropertyComplianceBlocked()` — REBNY Gates 1/2/3
 *     (Owner Opt-Out, Participant Only, Internet Display).
 *   - Per-row Permission filter and `MediaStatus='Deleted'` tombstoning are
 *     handled inside `upsertListingMedia()`.
 *
 * Tombstoning of vanished rows (RC1):
 *   - `tombstoneVanished: true` — `fetchMedia` now follows `@odata.nextLink` to
 *     exhaustion, so a RESOLVE is the COMPLETE current set and a `media_key`
 *     absent from it is proven deleted at source → tombstoned. An empty COMPLETE
 *     set tombstones every active row for the listing. INCOMPLETE pagination
 *     THROWS (caught below): existing media is preserved, nothing is tombstoned,
 *     and the keyset cursor does NOT advance past the listing. Explicit
 *     `MediaStatus='Deleted'` still tombstones via Cp2's separate path.
 *
 * Boundary timestamp safety (RC1 keyset):
 *   - `buildPropertyQuery()` uses keyset continuation
 *     `(PhotosChangeTimestamp gt ts) OR (PhotosChangeTimestamp eq ts AND
 *     ListingKey gt key)` with `$orderby PhotosChangeTimestamp asc,ListingKey asc`,
 *     so a run of more than `listingsPerRun` listings sharing one
 *     PhotosChangeTimestamp no longer starves the cursor. `last_listing_key`
 *     persists the tie-breaker. (No-skip relies on `PhotosChangeTimestamp`
 *     monotonicity at source — the documented Cotality media-change semantics.)
 *
 * Throughput:
 *   - Phase 3 R2 mirror uses `Promise.allSettled` with `R2_MIRROR_CONCURRENCY=5`,
 *     matching the production `migrateMediaToR2` pattern in `lib/idx/sync.ts:694-708`.
 *
 * Reader/PR-4 boundary:
 *   - Never writes `Listing.media` JSON.
 *   - Never overwrites `media_url_original` on update.
 *   - Never modifies `app/api/media/batch/`, `lib/idx/sync.ts`,
 *     `lib/external-listings/`, schema, migrations, or public reader paths.
 */
/**
 * Phase-1 write-amplification forensic (2026-07-25): run-level totals for the
 * three NON-DERIVABLE physical-write cause counters. Extracted as a PURE,
 * directly-unit-tested accumulator (media-write-cause-accumulator.test.ts) so the
 * "multiple nonzero per-listing results sum correctly" property is proven — not
 * merely asserted on an all-zero mock run. runMediaSync's per-listing loop calls
 * `accumulateMediaWriteCauses` for every settled upsert.
 */
export interface MediaWriteCauseTotals {
  delivery_url_refreshed: number;
  /** No-op URL refreshes prevented on rows no R2 selector can reach (>8). */
  suppressed_mirror_unreachable: number;
  suppressed_url_signature_rotation: number;
  suppressed_url_identity_changed: number;
  write_failures: number;
}

export function newMediaWriteCauseTotals(): MediaWriteCauseTotals {
  return {
    delivery_url_refreshed: 0,
    suppressed_mirror_unreachable: 0,
    suppressed_url_signature_rotation: 0,
    suppressed_url_identity_changed: 0,
    write_failures: 0,
  };
}

/** Add ONE per-listing WriteCounters result into the run totals (pure; mutates acc). */
export function accumulateMediaWriteCauses(
  acc: MediaWriteCauseTotals,
  r: {
    deliveryUrlRefreshed: number;
    /** Optional so pre-existing callers/tests compile unchanged; absent ⇒ 0. */
    suppressedMirrorUnreachable?: number;
    suppressedUrlSignatureRotation: number;
    suppressedUrlIdentityChanged: number;
    writeFailures: number;
  },
): void {
  acc.delivery_url_refreshed += r.deliveryUrlRefreshed;
  acc.suppressed_mirror_unreachable += r.suppressedMirrorUnreachable ?? 0;
  acc.suppressed_url_signature_rotation += r.suppressedUrlSignatureRotation;
  acc.suppressed_url_identity_changed += r.suppressedUrlIdentityChanged;
  acc.write_failures += r.writeFailures;
}

export async function runMediaSync(options: RunMediaSyncOptions = {}): Promise<RunMediaSyncResult> {
  const now = options.now ?? Date.now;
  const startTime = now();
  const listingsPerRun = options.listingsPerRun ?? DEFAULT_LISTINGS_PER_RUN;
  // RC1: `mediaPerListing` (per-listing cap) is retired — media is now fully
  // paginated via @odata.nextLink. The option remains accepted (ignored) for
  // backward-compat with existing callers/tests.
  const fallbackWindowDays = options.fallbackWindowDays ?? DEFAULT_FALLBACK_WINDOW_DAYS;
  const fetchDeps = options.fetchDeps ?? defaultFetchDeps;
  const mirrorDeps = options.mirrorDeps ?? defaultMirrorMediaToR2Deps;
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const phase1ReserveMs = options.phase1ReserveMs ?? DEFAULT_PHASE1_RESERVE_MS;
  const phase2ReserveMs = options.phase2ReserveMs ?? DEFAULT_PHASE2_RESERVE_MS;

  const remainingMs = (): number => budgetMs - (now() - startTime);

  let rowsChecked = 0;
  let rowsUpdated = 0; // legacy aggregate = rowsInserted + rowsUpdatedChanged
  // #530 detailed cumulative ledger (aggregated only after a successful upsert).
  let rowsInserted = 0;
  let rowsUpdatedChanged = 0;
  let rowsSkippedUnchanged = 0;
  let rowsSkippedInvalid = 0;
  let deleteSignalsReceived = 0;
  let tombstonedExplicit = 0;
  let tombstonedVanished = 0;
  let rowsTombstoned = 0;
  // Phase-1 write-amplification forensic (2026-07-25): explicit physical-write
  // cause attribution — additive/observability only, never controls a decision.
  // Phase-1 forensic: run-level physical-write cause totals (non-derivable),
  // accumulated via the pure, unit-tested accumulateMediaWriteCauses helper.
  const causeTotals = newMediaWriteCauseTotals();
  // #541 comparator-attribution diagnostic (cumulative; snake_case = audit keys).
  const attr = {
    existing_rows_compared: 0,
    mismatch_status: 0,
    mismatch_listing_id: 0,
    mismatch_resource_record_key: 0,
    mismatch_resource_record_id: 0,
    mismatch_media_url_exact: 0,
    mismatch_media_url_identity: 0,
    mismatch_media_url_identity_equivalent: 0,
    mismatch_media_type: 0,
    mismatch_media_category: 0,
    mismatch_media_classification: 0,
    mismatch_order: 0,
    mismatch_preferred_photo: 0,
    mismatch_media_modification_ts: 0,
    mismatch_modification_ts: 0,
    rows_with_one_mismatch: 0,
    rows_with_multiple_mismatches: 0,
  };
  let rowsFailed = 0;
  const summaryWrites = newSummaryWriteCounters();
  // One Cycle W1 — revalidation accounting for this run.
  const revalidation = newRevalidationCounters();
  let listingsProcessed = 0;
  let listingsSkipped = 0;
  let ghostListingsSkipped = 0;
  const ghostListingIds: string[] = [];
  let mirrorAllowed = 0;
  let mirrorRejectedPolicy = 0;
  let mirrorRejectedPolicyParked = 0;
  // PHASE 4a — bounded policy re-admission telemetry.
  let r2PolicyReevaluated = 0;
  let r2PolicyReadmitted = 0;
  let r2PolicyKeptParked = 0;
  let r2PolicyDecided = 0;
  let r2PolicyWriteFailed = 0;
  let r2PolicyDeferred = 0;
  let r2PolicySelectorFailed = false;
  let r2Mirrored = 0;
  let r2Uploaded = 0;
  let r2Reused = 0;
  let r2Failed = 0;
  let r2Skipped = 0;
  let backlogRemaining: number | null = null;
  let exitReason: RunMediaSyncResult["exit_reason"] = "completed";
  const cursorRecords: MediaSyncBatchRecord[] = [];

  // ── Observability (instrumentation only): correlate every log line for this
  // invocation via run_id; bound the invocation for overlap/lost-update
  // detection via run_start/run_end timestamps.
  const runId = newRunId();
  emitCursorTelemetry("run_start", runId, {
    started_at: new Date(now()).toISOString(),
    listings_per_run: listingsPerRun,
  });

  // ── PHASE 1: source ingest ───────────────────────────────────────────
  const cursor = await getMediaSyncCursor();
  emitCursorTelemetry("cursor_read", runId, {
    cursor_last_photos_change: isoOrNull(cursor.last_photos_change),
    cursor_last_listing_key: cursor.last_listing_key,
  });
  // RC1 keyset cursor: continue AFTER (last_photos_change, last_listing_key).
  const queryCursor: PropertyQueryCursor = {
    lastPhotosChange: cursor.last_photos_change,
    lastListingKey: cursor.last_listing_key,
    fallbackSince: new Date(now() - fallbackWindowDays * 86_400_000),
  };
  // Ordered Phase-1 outcomes — drives the keyset watermark (advance only to the
  // last contiguously fully-processed listing; never past a failure).
  const processed: ProcessedListing[] = [];

  let properties: TrestleProperty[];
  try {
    properties = await fetchDeps.fetchProperties(queryCursor, listingsPerRun);
  } catch (err) {
    // Source-fetch failure: do NOT advance cursor. No Phase 2/3/4.
    emitCursorTelemetry("run_end", runId, {
      ended_at: new Date(now()).toISOString(),
      duration_ms: now() - startTime,
      exit_reason: "source_error",
      status: "error",
    });
    return {
      status: "error",
      exit_reason: "source_error",
      error: err instanceof Error ? err.message : String(err),
      rows_checked: 0,
      rows_updated: 0,
      rows_inserted: 0,
      rows_updated_changed: 0,
      rows_skipped_unchanged: 0,
      rows_skipped_invalid: 0,
      delete_signals_received: 0,
      tombstoned_explicit: 0,
      tombstoned_vanished: 0,
      rows_tombstoned: 0,
      // Phase-1 forensic cause counters — all zero on a source-fetch error (no writes).
      delivery_url_refreshed: 0,
      suppressed_url_signature_rotation: 0,
      suppressed_url_identity_changed: 0,
      write_failures: 0,
      summary_writes: newSummaryWriteCounters(),
      ...attr, // all zeros on source_error
      rows_failed: 0,
      listings_processed: 0,
      listings_skipped: 0,
      ghost_listings_skipped: 0,
      ghost_listing_ids: [],
      mirror_allowed: 0,
      mirror_rejected_policy: 0,
      mirror_rejected_policy_parked: 0,
      r2_policy_reevaluated: 0,
      r2_policy_readmitted: 0,
      r2_policy_kept_parked: 0,
      r2_policy_decided: 0,
      r2_policy_write_failed: 0,
      r2_policy_deferred: 0,
      r2_policy_selector_failed: false,
      r2_mirrored: 0,
      r2_uploaded: 0,
      r2_reused: 0,
      r2_failed: 0,
      pages_revalidated: 0,
      revalidation_failures: 0,
      // Source fetch failed before Phase 3 ran, so nothing was mirrored and
      // nothing is pending: zero refreshed AND zero skipped is accurate here.
      summary_propagation_refreshed: 0,
      summary_propagation_skipped_budget: 0,
      summary_propagation_failed: 0,
      backlog_inflow_since_last_run: null,
      rows_selected: 0,
      rows_attempted: 0,
      rows_drained: 0,
      failures: 0,
      overlap_prevented: 0,
      time_budget_exhausted: false,
      query_path_classification: "fallback_min" as const,
      run_duration_ms: now() - startTime,
      r2_backlog_batch_selected: 0,
      r2_parked_recovery_selected: 0,
      r2_parked_recovery_attempted: 0,
      r2_failure_budget_exhausted: false,
      r2_skipped: 0,
      backlog_remaining: null,
      duration_ms: now() - startTime,
    };
  }

  const firstProp = properties[0];
  const lastProp = properties[properties.length - 1];
  emitCursorTelemetry("batch", runId, {
    batch_count: properties.length,
    first_photos_change: firstProp?.PhotosChangeTimestamp ?? null,
    first_listing_key: firstProp?.ListingKey ?? null,
    last_photos_change: lastProp?.PhotosChangeTimestamp ?? null,
    last_listing_key: lastProp?.ListingKey ?? null,
  });

  for (const property of properties) {
    if (remainingMs() < phase1ReserveMs) {
      exitReason = "budget_phase1";
      break;
    }

    const listingKey = property.ListingKey ? String(property.ListingKey) : null;
    const propTs = parseDate(property.PhotosChangeTimestamp ?? null);

    if (isPropertyComplianceBlocked(property)) {
      // Intentionally skipped, but resolved — let the cursor advance past it so
      // a blocked listing is not re-fetched every run (it re-surfaces only when
      // its PhotosChangeTimestamp bumps). Needs a key to anchor the watermark.
      listingsSkipped++;
      if (listingKey) processed.push({ listingKey, photosChangeTs: propTs, ok: true });
      continue;
    }

    const listingId = property.ListingId ? String(property.ListingId) : null;
    if (!listingId || !listingKey) {
      // Malformed/incomplete row (e.g. a ListingKey with no ListingId): its media
      // CANNOT be synced. Record it as ok:false so `pickKeysetWatermark` HALTS
      // here and the cursor never advances PAST unprocessed media — even if a
      // later listing in this ordered batch succeeds (Codex #377). A row with no
      // ListingKey at all (Trestle ListingKey is non-nullable, so effectively
      // impossible) still halts via the empty-string key. It re-surfaces next run.
      listingsSkipped++;
      processed.push({ listingKey: listingKey ?? "", photosChangeTs: propTs, ok: false });
      continue;
    }

    try {
      // RC5: a Property whose listing has NO local `listings` row ("ghost" —
      // never imported; e.g. feed-reconcile orphan-create failing) CANNOT have
      // media synced: `listing_media.listing_id` FK and the summary write both
      // target the local row, so before RC5 it threw → ok:false → the keyset
      // watermark froze at this position FOREVER (2026-06-09 production
      // freeze: 3 ghosts at batch head starved the entire catch-up). A ghost
      // is not a transient failure — halting on it is a livelock. Treat it as
      // a RESOLVED skip (ok:true, like the compliance-blocked case above): the
      // cursor advances past it and it re-surfaces only when its
      // PhotosChangeTimestamp bumps. The probe sits INSIDE try so a probe
      // failure (DB hiccup) falls to catch → ok:false → fail-closed halt
      // (never advance past UNKNOWN existence). Ghosts get ZERO writes — the
      // skip happens before fetch/upsert/tombstone/summary.
      const localListing = await prisma.listing.findUnique({
        where: { listing_id: listingId },
        select: { listing_id: true },
      });
      if (!localListing) {
        ghostListingsSkipped++;
        if (ghostListingIds.length < GHOST_ID_LOG_CAP) ghostListingIds.push(listingId);
        listingsSkipped++;
        processed.push({ listingKey, photosChangeTs: propTs, ok: true });
        continue;
      }

      // RC1: fetchMedia follows @odata.nextLink and THROWS on an incomplete
      // response — a resolve guarantees the COMPLETE current media set.
      const mediaRows = await fetchDeps.fetchMedia(listingKey);
      rowsChecked += mediaRows.length;

      const upsertResult = await upsertListingMedia(listingId, mediaRows, {
        photosChangeTsSnapshot: property.PhotosChangeTimestamp ?? null,
        // SAFE NOW (RC1): the set is complete (full pagination), so a media_key
        // absent from the input is proven deleted at source → tombstone it.
        // An empty COMPLETE set tombstones every active row for the listing.
        tombstoneVanished: true,
      });
      // Aggregate the detailed ledger AFTER a successful upsert (a later summary
      // throw still marks the listing failed → detailed reconciliation is only
      // authoritative when rows_failed===0).
      rowsInserted += upsertResult.inserted;
      rowsUpdatedChanged += upsertResult.updatedChanged;
      rowsSkippedUnchanged += upsertResult.skippedUnchanged;
      rowsSkippedInvalid += upsertResult.skippedInvalid;
      deleteSignalsReceived += upsertResult.deleteSignalsReceived;
      tombstonedExplicit += upsertResult.tombstonedExplicit;
      tombstonedVanished += upsertResult.tombstonedVanished;
      rowsTombstoned += upsertResult.tombstoned;
      // media_sync_state.rows_updated = TRUE physical listing_media writes:
      // inserts + material updates + delivery-URL refreshes + BOTH tombstone
      // kinds (tombstones are physical updateMany writes). One precise meaning.
      rowsUpdated += upsertResult.physicalWrites;
      // Phase-1 forensic: physical-write cause attribution (additive only).
      accumulateMediaWriteCauses(causeTotals, upsertResult);
      // #541 attribution (camelCase result → snake_case cumulative)
      attr.existing_rows_compared += upsertResult.existingRowsCompared;
      attr.mismatch_status += upsertResult.mismatchStatus;
      attr.mismatch_listing_id += upsertResult.mismatchListingId;
      attr.mismatch_resource_record_key += upsertResult.mismatchResourceRecordKey;
      attr.mismatch_resource_record_id += upsertResult.mismatchResourceRecordId;
      attr.mismatch_media_url_exact += upsertResult.mismatchMediaUrlExact;
      attr.mismatch_media_url_identity += upsertResult.mismatchMediaUrlIdentity;
      attr.mismatch_media_url_identity_equivalent += upsertResult.mismatchMediaUrlIdentityEquivalent;
      attr.mismatch_media_type += upsertResult.mismatchMediaType;
      attr.mismatch_media_category += upsertResult.mismatchMediaCategory;
      attr.mismatch_media_classification += upsertResult.mismatchMediaClassification;
      attr.mismatch_order += upsertResult.mismatchOrder;
      attr.mismatch_preferred_photo += upsertResult.mismatchPreferredPhoto;
      attr.mismatch_media_modification_ts += upsertResult.mismatchMediaModificationTs;
      attr.mismatch_modification_ts += upsertResult.mismatchModificationTs;
      attr.rows_with_one_mismatch += upsertResult.rowsWithOneMismatch;
      attr.rows_with_multiple_mismatches += upsertResult.rowsWithMultipleMismatches;

      // Phase 3: per-row write failures are isolated + counted INSIDE
      // upsertListingMedia (bounded blast radius), but the listing is NOT fully
      // persisted. Fail closed EXACTLY as a thrown write would have: halt the
      // keyset watermark here (cursor never advances past incomplete media) and
      // skip the summary. The listing re-processes (idempotently) next run.
      if (upsertResult.writeFailures > 0) {
        throw new Error("listing_media_write_incomplete");
      }

      // Fail-loud: a summary failure throws → caught below → ok:false → the
      // keyset watermark will not advance past this listing (retried next run).
      // Phase 3 (surface C): the summary write is suppressed inside when the
      // stored 4 columns are already identical; counters record the outcome,
      // and a failure is attributed to the summary path before re-throwing.
      try {
        await updateListingMediaSummary(listingId, { counters: summaryWrites, revalidation });
      } catch (summaryErr) {
        summaryWrites.rows_failed++;
        throw summaryErr;
      }

      cursorRecords.push({
        PhotosChangeTimestamp: property.PhotosChangeTimestamp ?? null,
        ModificationTimestamp: property.ModificationTimestamp ?? null,
      });
      processed.push({ listingKey, photosChangeTs: propTs, ok: true });
      listingsProcessed++;
    } catch {
      rowsFailed++;
      // Media incomplete / upsert / summary failed → existing media is left
      // intact (no upsert side effects on a fetch throw; tombstone never ran),
      // and ok:false STOPS the keyset watermark here. We continue so healthy
      // later listings still refresh, but the cursor will NOT advance past this
      // one — it re-surfaces (idempotently) next run.
      processed.push({ listingKey, photosChangeTs: propTs, ok: false });
    }
  }

  // ── PHASE 2: cursor checkpoint (durable forward progress) ────────────
  // Runs only when Property fetch succeeded. The keyset watermark advances only
  // to the last contiguously fully-processed listing (never past a failure);
  // a null watermark (nothing advanceable) preserves the prior cursor +
  // tie-breaker. `records` still drives last_media_modified.
  const watermark = pickKeysetWatermark(processed);
  emitCursorTelemetry("checkpoint", runId, {
    batch_count: properties.length,
    processed: listingsProcessed,
    skipped: listingsSkipped,
    failed: rowsFailed,
    ghost: ghostListingsSkipped,
    watermark_photos_change: isoOrNull(watermark?.last_photos_change ?? null),
    watermark_listing_key: watermark?.last_listing_key ?? null,
    cursor_start_photos_change: isoOrNull(cursor.last_photos_change),
    cursor_start_listing_key: cursor.last_listing_key,
  });
  const nextCursor = await advanceMediaSyncCursor({
    records: cursorRecords,
    watermark,
    status: rowsFailed > 0 ? "partial" : "ok",
    rowsChecked,
    rowsUpdated,
    rowsFailed,
    logContext: { runId },
  });
  // Observability-only: read the cursor back from the DB to prove what actually
  // persisted, and to expose a concurrent writer clobbering our write between
  // upsert and read-back (the lost-update signal). Additive read; the cursor
  // state is unchanged by this.
  //
  // WRAPPED so a read-back failure can NEVER fail the run, skip Phase 3, or
  // suppress the normal success/failure audit. The cursor write above has
  // already committed; on read-back failure we only lose this one telemetry
  // datapoint (recorded as readback_ok:false + a SAFE error class — never the
  // message, which could carry connection/query detail).
  let persisted: MediaSyncCursor | null = null;
  let readbackErrorClass: string | null = null;
  try {
    persisted = await getMediaSyncCursor();
  } catch (err) {
    readbackErrorClass = err instanceof Error ? err.name : typeof err;
  }
  if (persisted) {
    emitCursorTelemetry("persisted", runId, {
      readback_ok: true,
      computed_next_photos_change: isoOrNull(nextCursor.last_photos_change),
      computed_next_listing_key: nextCursor.last_listing_key,
      db_readback_photos_change: isoOrNull(persisted.last_photos_change),
      db_readback_listing_key: persisted.last_listing_key,
      // matched = the DB holds exactly what THIS run computed. false ⇒ a
      // concurrent run wrote between our upsert and this read-back. NOTE:
      // matched:true only proves no overwrite occurred BEFORE this immediate
      // read-back — a later stale concurrent run can still overwrite the cursor.
      matched:
        isoOrNull(persisted.last_photos_change) === isoOrNull(nextCursor.last_photos_change) &&
        persisted.last_listing_key === nextCursor.last_listing_key,
      // changed = the persisted cursor differs from the value we read at run start.
      changed:
        isoOrNull(persisted.last_photos_change) !== isoOrNull(cursor.last_photos_change) ||
        persisted.last_listing_key !== cursor.last_listing_key,
    });
  } else {
    // Read-back failed — non-fatal. Record the gap; the run continues to Phase 3.
    emitCursorTelemetry("persisted", runId, {
      readback_ok: false,
      readback_error_class: readbackErrorClass,
      computed_next_photos_change: isoOrNull(nextCursor.last_photos_change),
      computed_next_listing_key: nextCursor.last_listing_key,
      db_readback_photos_change: null,
      db_readback_listing_key: null,
      matched: null,
      changed: null,
    });
  }

  // ── PHASE 3: R2 enrichment backlog (parallel, concurrency = 5) ───────
  // Pattern matches lib/idx/sync.ts:694-708 (migrateMediaToR2). Trestle's
  // 480/min Media URL ceiling allows 8/sec sustained; concurrency-5 peaks
  // ~5/sec → comfortably within bandwidth, regression-safe.
  //
  // Per-invocation attempt tracking (PR #97 Codex review fix):
  //   The backlog query selects rows where `r2_key IS NULL OR
  //   media_url_cached IS NULL`. If a row's mirror fails (e.g., Trestle
  //   404 on media_url_original, R2 head/upload error), its DB state is
  //   unchanged — same row keeps matching the same query. Without
  //   tracking, a persistent bad row at the head of the queue would be
  //   re-selected every iteration of this while-loop and starve newer
  //   backlog rows of any Phase 3 budget.
  //
  //   Fix: track every row id we've attempted in this invocation in a
  //   local Set, and exclude those ids from subsequent backlog queries
  //   via `id: { notIn: [...attempted] }`. Failed rows still stay in the
  //   DB backlog — they're eligible on the NEXT cron firing (the Set is
  //   recreated on each `runMediaSync` call).
  //
  // Cross-invocation cooldown (added 2026-05-10):
  //   The per-invocation Set above stops re-selection within ONE cron
  //   firing, but every subsequent firing's Set is fresh — meaning a row
  //   whose Trestle URL is permanently 404 still gets retried 96×/day.
  //   The cooldown filter (`r2_last_attempt_at IS NULL OR < NOW() - 6h`)
  //   throttles those retries to 4×/day. Cp4 sets `r2_last_attempt_at`
  //   on every failure path; success paths clear it back to NULL.
  //   See `memory/PR3-PRODUCTION-ROLLOUT-2026-05-09.md` E8 probe.
  // Phase 4 — BOUNDED drain. Selection: at most TWO bounded
  // CANDIDATE-SELECTION queries per run (one main backlog selection;
  // zero-or-one parked recovery selection). The pre-existing
  // `backlog_remaining` COUNT query below is separate and unchanged. All
  // processing is in-memory over the selected queues — no per-iteration
  // re-query, no growing `id notIn` list. (The pre-Phase-4 while-loop
  // re-queried the backlog every 5 rows with an ever-growing exclusion
  // list.) Bounded + correct WITHOUT the `listing_media_r2_backlog_idx`
  // partial index, which exists only in #544's prepared (UNAPPLIED)
  // migration — not in this stack; the query merely benefits if it is
  // ever applied.
  //
  // Ordering of work (Maya re-review round 2):
  //   1. RESERVED parked-recovery chunk FIRST — its own bounded allowance
  //      (<= parked quota), so a saturated main backlog can never starve
  //      recovery run after run. Parked failures do NOT consume the main
  //      failure budget: they are naturally bounded by the quota itself
  //      (<= R2_PARKED_RECOVERY_QUOTA attempts/run), so they cannot
  //      monopolize the drain either.
  //   2. MAIN drain with a HARD failure cap: each chunk is sized
  //      min(R2_MIRROR_CONCURRENCY, remaining failure allowance), so main
  //      failures can NEVER exceed R2_RUN_FAILURE_BUDGET.
  const cooldownThreshold = new Date(now() - R2_RETRY_COOLDOWN_MS);
  const backlogBatchLimit = options.backlogBatchLimit ?? R2_BACKLOG_BATCH_LIMIT;
  const parkedRecoveryQuota = options.parkedRecoveryQuota ?? R2_PARKED_RECOVERY_QUOTA;
  // R2-1: per-invocation cache of each hero_only listing's canonical hero
  // media_key (null = no eligible hero / lookup failed => fail-closed: admit
  // nothing for that listing this invocation).
  const heroKeyCache = new Map<string, string | null>();
  // R2-1 Blocker-1: row ids DETERMINISTICALLY rejected by the admission
  // policy this run, POLICY-PARKED (r2_attempts = R2_POLICY_PARKED_ATTEMPTS
  // + r2_last_attempt_at = now) in ONE batched updateMany after the drain.
  // Without this write the rejected rows would re-match the backlog where on
  // every firing and starve valid heroes (no select-then-reject-without-state).
  const policyParkIds: bigint[] = [];
  /**
   * Listings whose media rows actually gained (or reused) an R2 object this run.
   * Their `Listing` summary is refreshed before the run returns — see
   * {@link propagateMirroredHeroSummaries}. Deduped there, not here.
   */
  const mirroredListingIds: string[] = [];
  const backlogSelect = {
    // `id` is required for de-duplication — never passed to mirrorMediaToR2.
    id: true,
    listing_id: true,
    media_key: true,
    media_type: true,
    order: true,
    media_url_original: true,
    r2_key: true,
    media_url_cached: true,
    // Cp4 needs the prior count to decide tombstone-on-3rd-4xx.
    r2_attempts: true,
    // R2-1: the policy fields `decideMirrorAdmissionScope` reads. The
    // DB-side where already excludes non-admissible listings; this select
    // lets the in-code filter re-verify FAIL-CLOSED (a drifted where can
    // never widen the mirror set) and decide all_active vs hero_only.
    listing: {
      select: {
        listing_id: true,
        rls_eligible: true,
        status: true,
        idx_display_yn: true,
        owner_opt_out: true,
        participant_only: true,
        internet_entire_listing_display_yn: true,
      },
    },
  } as const;

  let r2BacklogBatchSelected = 0;
  let r2ParkedRecoverySelected = 0;
  let r2ParkedRecoveryAttempted = 0;
  let r2FailureBudgetExhausted = false;
  // One Cycle W3 state.
  let backlogInflow: number | null = null;
  let overlapPrevented = 0;
  let queryPathClassification: "adaptive" | "fallback_min" | "skipped_overlap" = "fallback_min";
  let rowsAttemptedTotal = 0;

  // Mirror one already-sized chunk; returns the number of FAILED rows so the
  // main drain can enforce its hard cap. Physical counters (r2Mirrored /
  // r2Skipped / r2Failed) accumulate across BOTH queues. The R2-1 admission
  // filter runs INSIDE the chunk so MAIN and RECOVERY rows pass the same
  // policy (a recovered row must still be admissible).
  type BacklogRowSel = {
    id: bigint;
    listing_id: string;
    media_key: string | null;
    media_type: string;
    order: number;
    media_url_original: string | null;
    r2_key: string | null;
    media_url_cached: string | null;
    r2_attempts: number | null;
    listing: {
      listing_id: string;
      rls_eligible: boolean | null;
      status: string;
      idx_display_yn: boolean | null;
      owner_opt_out: boolean | null;
      participant_only: boolean | null;
      internet_entire_listing_display_yn: boolean | null;
    } | null;
  };
  const mirrorChunk = async (
    chunk: BacklogRowSel[],
    recoveryAttempt = false,
  ): Promise<number> => {
    // ── R2-1 post-fetch admission filter ─────────────────────────────────
    // Hero identity CANNOT live in the SQL where: it needs per-listing
    // ordering over ALL of the listing's rows (preferred_photo_yn -> min
    // `order` -> first-encountered), decided here with the production hero
    // resolver (`selectHeroPhoto` — the same function that derives
    // Listing.primary_photo_url).
    //
    // Rejection is NEVER stateless. Two classes:
    //   DETERMINISTIC (not the hero / media_type outside the scope's
    //   approved set) => POLICY-PARK via `policyParkIds` (flushed in ONE
    //   updateMany after the drain; r2_attempts = 9 permanently excludes
    //   the row from the backlog where). Un-parking is R2-3's job.
    //   TRANSIENT (hero lookup failed; scope 'none' on mutable
    //   listing-level state) => NOT parked; re-decided next firing.
    //   Fail-closed for mirroring, fail-open for retry.
    const admittedRows: BacklogRowSel[] = [];
    for (const row of chunk) {
      const scope = decideMirrorAdmissionScope(row.listing);
      if (scope === "none") {
        // Fail-closed: non-displayable / terminal / unknown listing.
        // Transient by construction (listing-level state is mutable) =>
        // rejected but NOT parked.
        mirrorRejectedPolicy++;
        continue;
      }
      // Approved media types per scope. Defense-in-depth: the DB-side where
      // (buildR2MirrorPolicyMediaWhere) already restricts these in-query;
      // re-verified here FAIL-CLOSED. A type mismatch is DETERMINISTIC for
      // the row (media_type is fixed per media_key) => park it.
      const approvedTypes =
        scope === "all_active" ? MALLAN_MIRROR_MEDIA_TYPES : FEED_MIRROR_MEDIA_TYPES;
      if (!approvedTypes.includes(row.media_type)) {
        mirrorRejectedPolicy++;
        policyParkIds.push(row.id);
        continue;
      }
      if (scope === "all_active") {
        // Mallan-owned: complete active Photo + FloorPlan set retained.
        admittedRows.push(row);
        continue;
      }
      // hero_only — third-party displayable listing: admit ONLY the
      // canonical hero photo.
      let heroKey: string | null;
      if (heroKeyCache.has(row.listing_id)) {
        heroKey = heroKeyCache.get(row.listing_id) ?? null;
      } else {
        try {
          // Same read population as updateListingMediaSummary (all rows for
          // the listing; selectHeroPhoto filters active Photos) so the hero
          // decided here is IDENTICAL to the one the summary/reader surfaces.
          const listingRows = await prisma.listingMedia.findMany({
            where: { listing_id: row.listing_id },
            // HERO PARITY (2026-08-10). `selectHeroPhoto` -> `filterActivePhotoRows`
            // -> `classifyMediaItem`, which weighs MediaCategory,
            // MediaClassification and the Trestle DOCUMENT-* URL shape BEFORE
            // falling back to `media_type`. A narrow select made those three
            // fields undefined, so a row STORED as `media_type='Photo'` but
            // canonically a FloorPlan (missing MediaCategory + a DOCUMENT-Pdf
            // URL — the documented real case) counted as a photo here while
            // `computeListingMediaSummary`, which reads the full row, excluded
            // it. The mirror could then mirror a floor plan as the hero and
            // park the genuine hero. Same population AND same shape as the
            // summary read is what makes the two provably agree.
            select: {
              media_key: true,
              media_type: true,
              media_category: true,
              media_classification: true,
              media_url_original: true,
              status: true,
              preferred_photo_yn: true,
              order: true,
            },
          });
          heroKey = selectHeroPhoto(listingRows)?.media_key ?? null;
        } catch {
          // Fail-closed: unknown hero => admit nothing for this listing now.
          heroKey = null;
        }
        heroKeyCache.set(row.listing_id, heroKey);
      }
      if (heroKey === null) {
        // TRANSIENT: hero unknown. NOT parked; re-decided next firing.
        mirrorRejectedPolicy++;
      } else if (row.media_key === heroKey) {
        admittedRows.push(row);
      } else {
        // DETERMINISTIC: not the canonical hero (including every remaining
        // gallery row of a listing whose hero is already mirrored). PARK.
        mirrorRejectedPolicy++;
        policyParkIds.push(row.id);
      }
    }
    mirrorAllowed += admittedRows.length;
    if (admittedRows.length === 0) return 0;

    const results = await Promise.allSettled(
      admittedRows.map((row) => {
        if (!row.media_key) {
          return Promise.resolve({
            status: "skipped" as const,
            reason: "no_media_url_original" as const,
          });
        }
        return mirrorMediaToR2(
          {
            listing_id: row.listing_id,
            media_key: row.media_key,
            media_type: row.media_type,
            order: row.order,
            media_url_original: row.media_url_original,
            r2_key: row.r2_key,
            media_url_cached: row.media_url_cached,
            r2_attempts: row.r2_attempts,
          },
          mirrorDeps,
          // Recovery rows: transient failures must not advance r2_attempts
          // (the #534 policy sentinel lives above the threshold).
          { recoveryAttempt },
        );
      }),
    );
    let failedInChunk = 0;
    // Indexed so each result can be attributed back to its row: `results` is
    // positionally parallel to `admittedRows` (Promise.allSettled preserves
    // input order), which is what lets a mirrored row record its listing for
    // the same-invocation summary refresh below.
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === "fulfilled") {
        const v = r.value;
        if (v.status === "uploaded") {
          r2Uploaded++;
          r2Mirrored++; // legacy aggregate = uploaded + reused
          mirroredListingIds.push(admittedRows[i].listing_id);
        } else if (v.status === "reused") {
          r2Reused++;
          r2Mirrored++;
          // REUSE COUNTS. An existing R2 object being adopted still moves this
          // row's delivery state from "no r2_key" to "has r2_key", so the
          // listing summary can change even though nothing was uploaded.
          mirroredListingIds.push(admittedRows[i].listing_id);
        } else if (v.status === "skipped") r2Skipped++;
        else if (v.status === "failed") {
          r2Failed++;
          failedInChunk++;
        }
      } else {
        // Promise itself rejected (mirrorMediaToR2 contract returns structured
        // results, but defensive — handle thrown anyway).
        r2Failed++;
        failedInChunk++;
      }
    }
    return failedInChunk;
  };

  if (remainingMs() > phase2ReserveMs) {
    // One Cycle W3 — ADAPTIVE sizing: measure inflow durably from the last
    // two media_sync_cron audit events (a store this pipeline already
    // writes; no new writer), then size the batch to EXCEED inflow by the
    // catch-up increment, floored at the Phase-4 MIN and hard-capped
    // (NEON-001). Measurement failure → null → MIN fallback (fail-closed).
    try {
      const history = (await prisma.auditEvent.findMany({
        where: { action: "media_sync_cron" },
        orderBy: { created_at: "desc" },
        take: 2,
        select: { changes: true },
      })) as Array<{ changes: unknown }>;
      backlogInflow = measureBacklogInflow(history);
    } catch {
      backlogInflow = null; // history unavailable → MIN fallback
    }
    const adaptiveLimit = options.backlogBatchLimit ?? computeAdaptiveDrainLimit(backlogInflow);
    queryPathClassification = backlogInflow === null ? "fallback_min" : "adaptive";

    // One Cycle W3 — OVERLAP SAFETY: candidate selection runs inside a
    // short advisory-locked transaction (pg_try_advisory_xact_lock,
    // released at commit). A concurrent run that cannot take the lock
    // SKIPS the drain (overlap_prevented). The route's 10-min audit guard
    // dedupes cron invocations; this drain-level mutex closes the residual
    // manual/racing window. The mirror phase itself is idempotent
    // (existsInR2 reuse path + write-once row updates), so serializing
    // SELECTION makes overlapping runs harmless by construction.
    let backlogRows: BacklogRowSel[] = [];
    let parkedRows: BacklogRowSel[] = [];
    let drainSkippedForOverlap = false;
    const selection = await prisma.$transaction(
      async (tx) => {
        const lockRows = (await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(${R2_DRAIN_LOCK_CLASS}::int4, ${R2_DRAIN_LOCK_KEY}::int4) AS locked`) as Array<{ locked: boolean }>;
        if (!lockRows?.[0]?.locked) {
          return { skipped: true as const, main: [] as BacklogRowSel[], parked: [] as BacklogRowSel[] };
        }
        // Candidate-selection query 1 of <= 2: the bounded MAIN backlog.
        // W3 ordering: [{id asc}] — the PK is a monotone insertion key, so
        // FIFO fairness is preserved WITHOUT a created_at sort node (no
        // supporting index exists for created_at ordering).
        const main = (await tx.listingMedia.findMany({
          where: buildR2BacklogWhere(cooldownThreshold, []),
          orderBy: [{ id: "asc" }],
          take: adaptiveLimit,
          select: backlogSelect,
        })) as BacklogRowSel[];
        // Candidate-selection query 2 of <= 2 (zero-or-one): parked
        // recovery. Quota 0 disables (no query). Selection is read-only —
        // no counter is ever reset.
        let parked: BacklogRowSel[] = [];
        if (parkedRecoveryQuota > 0) {
          parked = (await tx.listingMedia.findMany({
            where: buildR2ParkedRecoveryWhere(new Date(now() - R2_PARKED_RECOVERY_COOLDOWN_MS)),
            orderBy: [{ r2_last_attempt_at: "asc" }, { id: "asc" }],
            take: parkedRecoveryQuota,
            select: backlogSelect,
          })) as BacklogRowSel[];
        }
        return { skipped: false as const, main, parked };
      },
      { timeout: 30_000, maxWait: 5_000 },
    );
    if (selection.skipped) {
      overlapPrevented = 1;
      queryPathClassification = "skipped_overlap";
      drainSkippedForOverlap = true;
    } else {
      backlogRows = selection.main;
      parkedRows = selection.parked;
    }
    r2BacklogBatchSelected = backlogRows.length;
    r2ParkedRecoverySelected = parkedRows.length;
    if (drainSkippedForOverlap) {
      // Nothing selected; fall through with empty queues (no chunks run).
    }
    // Defensive id de-dupe (the two wheres are disjoint on r2_attempts, but
    // a free duplicate guard costs nothing).
    const mainIds = new Set(backlogRows.map((r) => r.id));
    parkedRows = parkedRows.filter((r) => !mainIds.has(r.id));

    // 1. RESERVED parked chunk(s) FIRST — bounded by the quota itself.
    //    `r2ParkedRecoveryAttempted` increments ONLY at actual hand-off to
    //    mirrorMediaToR2 (selected > attempted ⇔ the time budget expired
    //    before the reserved chunk could run).
    for (let j = 0; j < parkedRows.length; j += R2_MIRROR_CONCURRENCY) {
      if (remainingMs() <= phase2ReserveMs) break;
      const chunk = parkedRows.slice(j, j + R2_MIRROR_CONCURRENCY);
      r2ParkedRecoveryAttempted += chunk.length;
      rowsAttemptedTotal += chunk.length;
      // parked failures: counted in r2Failed, NOT in the main cap; the
      // recovery flag keeps transient failures from advancing r2_attempts.
      await mirrorChunk(chunk, true);
    }

    // 2. MAIN drain with the HARD failure cap.
    let mainFailed = 0;
    let mainAttempted = 0;
    let idx = 0;
    while (idx < backlogRows.length) {
      if (remainingMs() <= phase2ReserveMs) break; // time budget — Phase 4 finalize still runs
      const failureAllowance = R2_RUN_FAILURE_BUDGET - mainFailed;
      if (failureAllowance <= 0) break;
      // HARD CAP: never hand more rows to the mirror than the remaining
      // failure allowance — entering a chunk with 9 failures can add at
      // most 1 more. Trade-off (accepted): near the cap the drain slows to
      // small chunks; correctness of the cap beats throughput there.
      const chunk = backlogRows.slice(idx, idx + Math.min(R2_MIRROR_CONCURRENCY, failureAllowance));
      idx += chunk.length;
      mainAttempted += chunk.length;
      rowsAttemptedTotal += chunk.length;
      mainFailed += await mirrorChunk(chunk);
    }
    // Honest flag: the cap stopped the drain early ONLY if selected main
    // rows were left unattempted. Reaching the cap exactly on the final
    // row leaves nothing untouched → false.
    r2FailureBudgetExhausted =
      mainFailed >= R2_RUN_FAILURE_BUDGET && mainAttempted < backlogRows.length;
  }

  if (remainingMs() <= phase2ReserveMs && exitReason === "completed") {
    exitReason = "budget_phase2";
  }

  // ── PHASE 3b: propagate mirrored heroes into the Listing summary ──────
  //
  // SAME INVOCATION, deliberately. The drain above wrote `listing_media.r2_key`;
  // without this step the `Listing` summary keeps pointing at the rotating
  // Cotality locator until some future Phase-1 pass happens to refresh that
  // listing — which may never happen for a listing whose feed rows are stable.
  // The public surfaces read the SUMMARY (the building manifest serves its
  // durable hero from `primary_photo_r2_key`; cards/detail read
  // `primary_photo_url`), so cards, detail and manifest would otherwise
  // disagree with the media rows for an unbounded period.
  //
  // Write-safe: `updateListingMediaSummary` pre-reads and suppresses an
  // unchanged summary, so listings whose hero did not actually move cost a read
  // and produce no write and no revalidation. Budget-aware, and the skipped
  // remainder is reported rather than silently dropped.
  const summaryPropagation = await propagateMirroredHeroSummaries(mirroredListingIds, {
    updateSummary: (listingId) =>
      updateListingMediaSummary(listingId, { counters: summaryWrites, revalidation }),
    remainingMs,
    reserveMs: phase2ReserveMs,
  });

  // ── R2-1 Blocker-1: policy-parking flush (ONE statement per run) ──────
  // Write-churn justification (N-program write-reduction goals): this is a
  // ONE-TIME-PER-ROW convergence write — a parked row is permanently excluded
  // from the backlog SELECT, so it can never be fetched (and thus never be
  // parked) again. Per-run volume is bounded by the candidate fetch size
  // (R2_MIRROR_CONCURRENCY per loop iteration within the Phase-3 budget) and
  // the aggregate converges to zero once the historical gallery backlog is
  // parked. Batched: one updateMany over all ids collected this run.
  if (policyParkIds.length > 0) {
    try {
      // WRITER CUTOVER: a policy exclusion records itself in its OWN column.
      //
      // It no longer assigns `r2_attempts = R2_POLICY_PARKED_ATTEMPTS`, so a
      // deliberate policy decision can never again be read as nine failures,
      // can never look retry-exhausted, and can never inflate a failure count
      // the asset did not earn. Whatever REAL failure history the row already
      // has is left exactly as it stands.
      //
      // It also no longer stamps `r2_last_attempt_at`: no attempt was made, and
      // recording a fake cooldown was the same category error in the adjacent
      // column. Exclusion from the backlog now comes from
      // `buildR2BacklogWhere`'s explicit `r2_policy_excluded_at: null` clause,
      // not from a side effect of the counter.
      //
      // LEGACY rows already parked at 9 are NOT converted and NOT backfilled —
      // they stay excluded by the untouched `r2_attempts < 8` clause, and
      // `lib/media/r2-policy-state.ts` still reads exact-9 as a policy
      // exclusion for compatibility.
      const parked = await prisma.listingMedia.updateMany({
        where: { id: { in: policyParkIds } },
        data: {
          r2_policy_excluded_at: new Date(now()),
        },
      });
      mirrorRejectedPolicyParked = parked.count;
    } catch {
      // Non-fatal: on a failed flush the rows simply re-surface next firing
      // and are re-parked then (the write is idempotent). Never fails the run.
    }
  }

  // ── PHASE 4a: bounded policy re-admission ────────────────────────────
  //
  // Runs AFTER the park flush (so rows parked THIS run carry a fresh clock and
  // cannot be reconsidered immediately) and BEFORE the backlog probe (so a row
  // re-admitted here is counted as the genuine new work it now is).
  //
  // It performs no R2 work and consumes no part of the Phase-3 drain or failure
  // budget; re-admitted rows are mirrored by the ordinary drain on a later
  // firing. Skipped entirely when the run is out of time — the sweep is
  // resumable by construction, so a skipped pass costs only latency.
  //
  // Also skipped when the drain was skipped for OVERLAP: that firing
  // deliberately issues zero candidate-selection queries because another
  // invocation already holds the advisory lock, and this pass reads and writes
  // the same rows. Its writes are idempotent, so an overlap would be wasteful
  // rather than corrupting — but doing extra work at the one moment the
  // scheduler is avoiding it would defeat the posture.
  if (queryPathClassification !== "skipped_overlap" && remainingMs() > phase2ReserveMs) {
    const reeval = await reevaluateR2PolicyExclusions({ now });
    r2PolicyReevaluated = reeval.scanned;
    r2PolicyReadmitted = reeval.readmitted;
    r2PolicyKeptParked = reeval.kept_parked;
    r2PolicyDeferred = reeval.deferred;
    r2PolicyDecided = reeval.decided;
    r2PolicyWriteFailed = reeval.write_failed;
    r2PolicySelectorFailed = reeval.selector_failed;
  }

  // ── PHASE 4: finalize + return ───────────────────────────────────────
  try {
    // One Cycle W3 — BOUNDED probe replaces the unbounded COUNT: select at
    // most PROBE_CAP+1 ids; a result of PROBE_CAP+1 means ">cap". Bounds
    // the worst-case scan when the backlog is huge; the real index-level
    // fix is the proposed (NOT applied) partial index — see the PR's
    // index-proposal section.
    const probe = await prisma.listingMedia.findMany({
      // THE SHARED BACKLOG UNIVERSE — identical base to the Phase-3 candidate
      // selector, by construction (see buildR2MirrorableBacklogUniverseWhere).
      //
      // This query previously rebuilt the universe by hand and drifted: it
      // omitted `media_key: { not: null }` and `r2_policy_excluded_at: null`.
      // Its old comment claimed parked rows were covered "policy-parked = 9,
      // failure-exhausted = 8; both >= R2_RETRY_EXHAUSTED_THRESHOLD" — true
      // only BEFORE the writer cutover stopped stamping the 9 sentinel. After
      // the cutover a parked row keeps NULL/low attempts, so it passed this
      // filter and was counted as backlog forever, waking One Cycle
      // indefinitely via backlogPending. Reusing the base is what makes that
      // class of drift impossible rather than merely fixed once.
      //
      // Cooldown is intentionally absent here: a cooldown-deferred row is still
      // outstanding work and must count as backlog pending.
      where: buildR2MirrorableBacklogUniverseWhere(),
      select: { id: true },
      take: R2_BACKLOG_PROBE_CAP + 1,
    });
    backlogRemaining = probe.length;
  } catch {
    backlogRemaining = null;
  }

  const finalStatus: RunMediaSyncResult["status"] =
    rowsFailed > 0 || r2Failed > 0 ? "partial" : "ok";

  emitCursorTelemetry("run_end", runId, {
    ended_at: new Date(now()).toISOString(),
    duration_ms: now() - startTime,
    exit_reason: exitReason,
    status: finalStatus,
  });

  // One Cycle W1: card imagery/search surfaces reflect summary changes →
  // ONE coarse search bump per run when any summary materially changed.
  if (summaryWrites.rows_updated > 0) {
    safeRevalidateTags([SEARCH_CACHE_TAG], revalidation);
  }

  return {
    status: finalStatus,
    exit_reason: exitReason,
    rows_checked: rowsChecked,
    rows_updated: rowsUpdated,
    rows_inserted: rowsInserted,
    rows_updated_changed: rowsUpdatedChanged,
    rows_skipped_unchanged: rowsSkippedUnchanged,
    rows_skipped_invalid: rowsSkippedInvalid,
    delete_signals_received: deleteSignalsReceived,
    tombstoned_explicit: tombstonedExplicit,
    tombstoned_vanished: tombstonedVanished,
    rows_tombstoned: rowsTombstoned,
    // Phase-1 forensic — minimal non-derivable cause counters (additive only).
    delivery_url_refreshed: causeTotals.delivery_url_refreshed,
    suppressed_url_signature_rotation: causeTotals.suppressed_url_signature_rotation,
    suppressed_url_identity_changed: causeTotals.suppressed_url_identity_changed,
    write_failures: causeTotals.write_failures,
    summary_writes: summaryWrites,
    pages_revalidated: revalidation.pages_revalidated,
    revalidation_failures: revalidation.revalidation_failures,
    // Phase-3b same-invocation summary propagation. `skipped_budget > 0` means
    // the pass ran out of time with listings still stale — reported, never
    // silently dropped, so a truncated run cannot read as a complete one.
    summary_propagation_refreshed: summaryPropagation.listings_refreshed,
    summary_propagation_skipped_budget: summaryPropagation.listings_skipped_budget,
    summary_propagation_failed: summaryPropagation.listings_failed,
    backlog_inflow_since_last_run: backlogInflow,
    rows_selected: r2BacklogBatchSelected + r2ParkedRecoverySelected,
    rows_attempted: rowsAttemptedTotal,
    rows_drained: r2Mirrored,
    failures: r2Failed,
    overlap_prevented: overlapPrevented,
    time_budget_exhausted: exitReason === "budget_phase2",
    query_path_classification: queryPathClassification,
    run_duration_ms: now() - startTime,
    ...attr,
    rows_failed: rowsFailed,
    listings_processed: listingsProcessed,
    listings_skipped: listingsSkipped,
    ghost_listings_skipped: ghostListingsSkipped,
    ghost_listing_ids: ghostListingIds,
    mirror_allowed: mirrorAllowed,
    mirror_rejected_policy: mirrorRejectedPolicy,
    mirror_rejected_policy_parked: mirrorRejectedPolicyParked,
    r2_policy_reevaluated: r2PolicyReevaluated,
    r2_policy_readmitted: r2PolicyReadmitted,
    r2_policy_kept_parked: r2PolicyKeptParked,
    r2_policy_decided: r2PolicyDecided,
    r2_policy_write_failed: r2PolicyWriteFailed,
    r2_policy_deferred: r2PolicyDeferred,
    r2_policy_selector_failed: r2PolicySelectorFailed,
    r2_mirrored: r2Mirrored,
    r2_uploaded: r2Uploaded,
    r2_reused: r2Reused,
    r2_failed: r2Failed,
    r2_backlog_batch_selected: r2BacklogBatchSelected,
    r2_parked_recovery_selected: r2ParkedRecoverySelected,
    r2_parked_recovery_attempted: r2ParkedRecoveryAttempted,
    r2_failure_budget_exhausted: r2FailureBudgetExhausted,
    r2_skipped: r2Skipped,
    backlog_remaining: backlogRemaining,
    duration_ms: now() - startTime,
  };
}
