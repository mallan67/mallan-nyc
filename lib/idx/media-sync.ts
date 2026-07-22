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
import { CRM_MEDIA_KEY_PREFIX } from "@/lib/media/crm-media";

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
   * PROOF counter — rows SUPPRESSED whose incoming row differed ONLY by a
   * rotated signed URL (material-unchanged AND already delivered).
   */
  suppressedUrlRotationOnly: number;
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
  let suppressedUrlRotationOnly = 0; // suppressed rows whose only diff was a rotated URL (write-reduction proof)
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
      const materialUnchanged = listingMediaRowUnchanged(existing, row, listingId);
      if (materialUnchanged && mediaRowDelivered(existing)) {
        skippedUnchanged++;
        if (mm.media_url_exact) suppressedUrlRotationOnly++; // suppressed a rotated-URL-only diff
        continue; // no material change + already delivered → skip the write
      }
      try {
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
        // A genuine material change vs. a delivery-only URL refresh (material
        // unchanged but not yet mirrored → the fresh URL is genuinely needed).
        if (materialUnchanged) deliveryUrlRefreshed++;
        else updatedChanged++;
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
    suppressedUrlRotationOnly,
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
export function computeListingMediaSummary(
  rows: readonly SummarySourceRow[],
): ListingMediaSummary {
  const photos = rows.filter(
    (r) =>
      String(r.status).toLowerCase() === "active" &&
      String(r.media_type).toLowerCase() === "photo",
  );

  // Hero selection: preferred → order ASC → first-encountered.
  // Stable sort with explicit indexed compare so identical rows preserve
  // input order for the "first-encountered" tiebreak.
  const indexedPhotos = photos.map((row, idx) => ({ row, idx }));
  indexedPhotos.sort((a, b) => {
    if (a.row.preferred_photo_yn !== b.row.preferred_photo_yn) {
      return a.row.preferred_photo_yn ? -1 : 1;
    }
    if (a.row.order !== b.row.order) return a.row.order - b.row.order;
    return a.idx - b.idx;
  });

  const hero = indexedPhotos[0]?.row ?? null;

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
  options?: { counters?: SummaryWriteCounters },
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

  return summary;
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
export const R2_RETRY_EXHAUSTED_THRESHOLD = 8;

/**
 * Build the Phase-3 R2 backlog SELECT `where`. Exported + pure so the RC3
 * retry-exhausted exclusion is unit-testable without a live DB. A row is eligible
 * when it is active, still missing its R2 copy (`r2_key` OR `media_url_cached`
 * null), past the 6h cooldown, not already attempted this invocation, AND not
 * retry-exhausted. `r2_attempts` null (never failed) stays eligible; `>=`
 * threshold is parked. Permanent 404/410 rows are already gone (tombstoned at 3),
 * so any active row at/above the exhaustion threshold is non-permanent by
 * construction — parking it (not deleting it) is the safe stop.
 */
export function buildR2BacklogWhere(
  cooldownThreshold: Date,
  attemptedIds: bigint[],
): Prisma.ListingMediaWhereInput {
  return {
    status: "active",
    media_url_original: { not: null },
    // Unmirrorable rows (media_key IS NULL — schema-legal on legacy/remediation
    // rows) can never be written by the mirror (update-by-media_key), so they
    // would monopolize the fixed bounded window forever (Codex post-merge).
    media_key: { not: null },
    OR: [{ r2_key: null }, { media_url_cached: null }],
    // Exclude rows already attempted this invocation (empty ⇒ no filter).
    ...(attemptedIds.length > 0 ? { id: { notIn: attemptedIds } } : {}),
    AND: [
      // Cross-invocation 6h cooldown.
      {
        OR: [
          { r2_last_attempt_at: null },
          { r2_last_attempt_at: { lt: cooldownThreshold } },
        ],
      },
      // RC3 retry-exhausted exclusion — park non-permanent rows that keep
      // failing so they stop consuming Phase-3 budget. The row stays active
      // (photo still serves via the media_url_original proxy) — NOT deleted.
      {
        OR: [
          { r2_attempts: null },
          { r2_attempts: { lt: R2_RETRY_EXHAUSTED_THRESHOLD } },
        ],
      },
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
  };
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
  // FloorPlan→floorplans/, Video→videos/, VirtualTour→virtualtours/).
  const key =
    row.r2_key && row.r2_key.length > 0
      ? row.r2_key
      : buildMediaR2Key(row.listing_id, row.media_type, row.order);

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
    const newAttempts = (row.r2_attempts ?? 0) + 1;
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
    const data: {
      r2_last_attempt_at: Date;
      r2_attempts?: number;
      status?: string;
    } = {
      r2_last_attempt_at: new Date(),
    };
    if (!isRecoveryAttempt) {
      // Standard path: the consecutive-failure counter advances as before.
      data.r2_attempts = newAttempts;
    }
    // Recovery path: r2_attempts is intentionally ABSENT from the write —
    // it stays exactly at the failure-exhaustion threshold in the DB; the
    // refreshed r2_last_attempt_at alone restarts the long recovery
    // cooldown. attempts=threshold+1 (9) is reserved for #534 policy
    // admission and is NEVER written by any failure path.
    //
    // Tombstone ONLY on permanent 4xx (404 / 410 — E8 live-proven). 5xx,
    // network, R2-side, token, and other 4xx errors are transient or
    // ambiguous — keep retrying after cooldown. For recovery rows the
    // effective count is the STORED value (already >= the tombstone
    // threshold by construction), so a proven-permanent source loss still
    // tombstones without advancing the counter.
    const effectiveAttempts = isRecoveryAttempt ? (row.r2_attempts ?? 0) : newAttempts;
    if (isPermanent4xx && effectiveAttempts >= R2_TOMBSTONE_4XX_THRESHOLD) {
      data.status = "deleted";
    }
    await prisma.listingMedia.update({
      where: { media_key: row.media_key },
      data,
    });
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
  /** R2 mirror successes (uploaded + reused) in Phase 3. */
  r2_mirrored: number;
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

/** One page of an OData Media response. `nextLink` is `@odata.nextLink` or null. */
export interface MediaPage {
  value: unknown[];
  nextLink: string | null;
}

/**
 * RC1 — follow `@odata.nextLink` until the Media response is exhausted, so the
 * caller has the COMPLETE current media set for a listing before it writes or
 * tombstones. Returns `complete: false` (and whatever rows were gathered) when
 * any page fetch fails OR the page count exceeds `maxPages` (runaway guard) —
 * the caller MUST then preserve existing media and NOT tombstone (a missing key
 * on an incomplete response is not proven deleted at source).
 *
 * Pure over an injected `fetchPage` so the pagination loop is unit-testable
 * without the network. Production wraps `defaultFetchMediaPage`.
 */
export async function paginateMedia(
  firstUrl: string,
  fetchPage: (url: string) => Promise<MediaPage>,
  maxPages = 50,
): Promise<{ rows: UpsertListingMediaInput[]; complete: boolean }> {
  const rows: UpsertListingMediaInput[] = [];
  let url: string | null = firstUrl;
  let pages = 0;
  while (url) {
    if (pages >= maxPages) return { rows, complete: false }; // fail closed on runaway
    let page: MediaPage;
    try {
      page = await fetchPage(url);
    } catch {
      return { rows, complete: false }; // a failed page ⇒ incomplete ⇒ no destructive write
    }
    for (const r of page.value) rows.push(r as UpsertListingMediaInput);
    url = page.nextLink;
    pages++;
  }
  return { rows, complete: true };
}

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
  const { rows, complete } = await paginateMedia(firstUrl, defaultFetchMediaPage);
  if (!complete) {
    throw new Error(`Media pagination incomplete for ResourceRecordKey='${resourceRecordKey}'`);
  }
  return rows;
}

const defaultFetchDeps: MediaSyncFetchDeps = {
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
  let listingsProcessed = 0;
  let listingsSkipped = 0;
  let ghostListingsSkipped = 0;
  const ghostListingIds: string[] = [];
  let r2Mirrored = 0;
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
      summary_writes: newSummaryWriteCounters(),
      ...attr, // all zeros on source_error
      rows_failed: 0,
      listings_processed: 0,
      listings_skipped: 0,
      ghost_listings_skipped: 0,
      ghost_listing_ids: [],
      r2_mirrored: 0,
      r2_failed: 0,
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
        await updateListingMediaSummary(listingId, { counters: summaryWrites });
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
  } as const;

  let r2BacklogBatchSelected = 0;
  let r2ParkedRecoverySelected = 0;
  let r2ParkedRecoveryAttempted = 0;
  let r2FailureBudgetExhausted = false;

  // Mirror one already-sized chunk; returns the number of FAILED rows so the
  // main drain can enforce its hard cap. Physical counters (r2Mirrored /
  // r2Skipped / r2Failed) accumulate across BOTH queues.
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
  };
  const mirrorChunk = async (
    chunk: BacklogRowSel[],
    recoveryAttempt = false,
  ): Promise<number> => {
    const results = await Promise.allSettled(
      chunk.map((row) => {
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
    for (const r of results) {
      if (r.status === "fulfilled") {
        const v = r.value;
        if (v.status === "uploaded" || v.status === "reused") r2Mirrored++;
        else if (v.status === "skipped") r2Skipped++;
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
    // Candidate-selection query 1 of <= 2: the bounded MAIN backlog.
    // RC3: the `where` is the pure `buildR2BacklogWhere` (attempted-id
    // exclusion list intentionally empty — there is no re-query to exclude
    // from). Eligibility = active + missing-R2 + past-cooldown + not parked.
    const backlogRows = (await prisma.listingMedia.findMany({
      where: buildR2BacklogWhere(cooldownThreshold, []),
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
      take: backlogBatchLimit,
      select: backlogSelect,
    })) as BacklogRowSel[];
    r2BacklogBatchSelected = backlogRows.length;

    // Candidate-selection query 2 of <= 2 (zero-or-one): parked recovery.
    // Quota 0 disables (no query). Selection is read-only — no counter is
    // ever reset; eligibility is pure code logic (exact-match, long
    // cooldown, oldest-first deterministic).
    let parkedRows: BacklogRowSel[] = [];
    if (parkedRecoveryQuota > 0) {
      parkedRows = (await prisma.listingMedia.findMany({
        where: buildR2ParkedRecoveryWhere(new Date(now() - R2_PARKED_RECOVERY_COOLDOWN_MS)),
        orderBy: [{ r2_last_attempt_at: "asc" }, { id: "asc" }],
        take: parkedRecoveryQuota,
        select: backlogSelect,
      })) as BacklogRowSel[];
    }
    r2ParkedRecoverySelected = parkedRows.length;
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

  // ── PHASE 4: finalize + return ───────────────────────────────────────
  try {
    backlogRemaining = await prisma.listingMedia.count({
      where: {
        status: "active",
        media_url_original: { not: null },
        OR: [{ r2_key: null }, { media_url_cached: null }],
      },
    });
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
    summary_writes: summaryWrites,
    ...attr,
    rows_failed: rowsFailed,
    listings_processed: listingsProcessed,
    listings_skipped: listingsSkipped,
    ghost_listings_skipped: ghostListingsSkipped,
    ghost_listing_ids: ghostListingIds,
    r2_mirrored: r2Mirrored,
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
