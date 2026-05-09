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
}

/**
 * Default (empty) cursor — both timestamps null.
 *
 * Returned by `getMediaSyncCursor()` when no row exists yet for
 * `RESOURCE_MEDIA`. Returned as a fresh object on every call so callers
 * can mutate the result without aliasing a shared default.
 */
export function emptyMediaSyncCursor(): MediaSyncCursor {
  return { last_photos_change: null, last_media_modified: null };
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
    select: { last_photos_change: true, last_media_modified: true },
  });
  if (!row) return emptyMediaSyncCursor();
  return {
    last_photos_change: row.last_photos_change ?? null,
    last_media_modified: row.last_media_modified ?? null,
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

/** Inputs for `advanceMediaSyncCursor`. */
export interface AdvanceMediaSyncCursorOptions {
  /**
   * Trestle records seen this run. Empty array is valid (no advancement
   * happens; only `last_run_at` and counters are touched).
   */
  records: MediaSyncBatchRecord[];
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
  const nextPhotosChange = maxDate(prior.last_photos_change, batchPhotosChange);
  const nextMediaModified = maxDate(prior.last_media_modified, batchMediaModified);

  await prisma.mediaSyncState.upsert({
    where: { resource: RESOURCE_MEDIA },
    create: {
      resource: RESOURCE_MEDIA,
      last_photos_change: nextPhotosChange,
      last_media_modified: nextMediaModified,
      last_run_at: now,
      last_run_status: status,
      rows_checked: rowsChecked,
      rows_updated: rowsUpdated,
      rows_failed: rowsFailed,
    },
    update: {
      last_photos_change: nextPhotosChange,
      last_media_modified: nextMediaModified,
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
  };
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
