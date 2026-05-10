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

export interface UpsertListingMediaResult {
  /** Rows that did not exist in DB and were inserted as active. */
  inserted: number;
  /** Rows that already existed in DB and had their fields refreshed. */
  updated: number;
  /** Input rows that were rejected before any DB write (no MediaKey, non-Public Permission, no MediaURL). */
  skipped: number;
  /** DB rows whose `status` flipped from active to deleted (explicit MediaStatus='Deleted' OR vanished from input when tombstoneVanished=true). */
  tombstoned: number;
}

/**
 * Internal row-shape we hand to Prisma — every field nullable except the
 * NOT NULL columns the schema enforces.
 */
interface MappedMediaRow {
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
 *
 * `tombstoneVanished` (default false): when true, rows currently
 * `status='active'` for `listingId` that aren't in the input batch are
 * also tombstoned. Caller must guarantee the input batch is complete.
 *
 * Idempotent: running this twice with identical input produces no DB
 * churn beyond `updated_at` bumps (which Prisma's `@updatedAt` enforces).
 */
export async function upsertListingMedia(
  listingId: string,
  mediaRows: UpsertListingMediaInput[],
  options: UpsertListingMediaOptions = {},
): Promise<UpsertListingMediaResult> {
  const photosChangeTsSnapshot = parseDate(options.photosChangeTsSnapshot ?? null);

  let skipped = 0;
  const explicitDeleteKeys = new Set<string>();
  const mapped: MappedMediaRow[] = [];

  for (const raw of mediaRows) {
    const mediaKey = raw.MediaKey ? String(raw.MediaKey) : null;
    if (!mediaKey) {
      skipped++;
      continue;
    }

    if (raw.MediaStatus === "Deleted") {
      explicitDeleteKeys.add(mediaKey);
      continue;
    }

    if (raw.Permission != null && String(raw.Permission) !== "Public") {
      skipped++;
      continue;
    }

    const url = raw.MediaURL ? String(raw.MediaURL) : null;
    if (!url) {
      skipped++;
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
  let updated = 0;

  // Upsert each surviving row. We use findUnique + create/update rather than
  // Prisma's upsert() so we can return precise inserted/updated counts.
  for (const row of mapped) {
    const existing = await prisma.listingMedia.findUnique({
      where: { media_key: row.mediaKey },
      select: { id: true, listing_id: true },
    });
    if (existing) {
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
      updated++;
    } else {
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
    }
  }

  let tombstoned = 0;

  if (explicitDeleteKeys.size > 0) {
    const res = await prisma.listingMedia.updateMany({
      where: {
        listing_id: listingId,
        status: "active",
        media_key: { in: [...explicitDeleteKeys] },
      },
      data: { status: "deleted" },
    });
    tombstoned += res.count;
  }

  if (options.tombstoneVanished === true) {
    const seenKeys = new Set<string>([
      ...mapped.map((r) => r.mediaKey),
      ...explicitDeleteKeys,
    ]);
    // Empty-input case: tombstone every active row for the listing.
    const where =
      seenKeys.size === 0
        ? { listing_id: listingId, status: "active" }
        : {
            listing_id: listingId,
            status: "active",
            media_key: { notIn: [...seenKeys] },
          };
    const res = await prisma.listingMedia.updateMany({
      where,
      data: { status: "deleted" },
    });
    tombstoned += res.count;
  }

  return { inserted, updated, skipped, tombstoned };
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
 * Re-derive and persist the 4 Listing summary columns from the current
 * `listing_media` rows for `listingId`.
 *
 * Reads all `listing_media` rows for the listing (active + deleted; the
 * filter happens in-JS via `computeListingMediaSummary`), computes the
 * summary, and writes it via a single `Listing.update()` call. Writes only
 * the 4 columns; never touches the legacy `Listing.media` JSON column or
 * any other field.
 *
 * Idempotent: running twice with no underlying media change writes the
 * same values both times.
 *
 * Returns the summary that was persisted.
 */
export async function updateListingMediaSummary(
  listingId: string,
): Promise<ListingMediaSummary> {
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

  await prisma.listing.update({
    where: { listing_id: listingId },
    data: {
      primary_photo_url: summary.primary_photo_url,
      primary_photo_r2_key: summary.primary_photo_r2_key,
      photo_count: summary.photo_count,
      photos_change_timestamp: summary.photos_change_timestamp,
    },
  });

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
   * - On the 3rd consecutive HTTP 4xx (`fetch_failed` with `error` matching
   *   `HTTP 4\d{2}`), Cp4 sets `status='deleted'` to break the retry loop.
   *   See `memory/PR3-PRODUCTION-ROLLOUT-2026-05-09.md` E8 probe — Trestle
   *   confirmed stale URLs return HTTP 404 with body
   *   `{"code":"404","message":"ERROR - External media was not downloaded."}`.
   */
  r2_attempts?: number | null;
}

/**
 * Number of consecutive HTTP 4xx failures after which a `listing_media` row
 * is soft-deleted to stop the retry loop. Tied to the cooldown design — see
 * NEON.md §4 and the E8 probe evidence.
 */
const R2_TOMBSTONE_4XX_THRESHOLD = 3;
/**
 * Minimum time (ms) after a failed mirror attempt before Phase 3 will retry
 * the same row. Prevents the persistent-failure population from consuming
 * the entire Phase 3 budget every cron firing.
 */
export const R2_RETRY_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

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
 *     If the failure is HTTP 4xx (`reason: 'fetch_failed'` with
 *     `error: 'HTTP 4xx'`) AND this is the 3rd consecutive failure,
 *     also sets `status='deleted'` to break the retry loop. 5xx, network,
 *     R2-side, and token failures increment the counter but NEVER tombstone.
 *   - On `uploaded` / `reused` (with DB write): clears `r2_last_attempt_at`
 *     and resets `r2_attempts` to 0 alongside the r2_key/media_url_cached
 *     write.
 *   - On `skipped` (no `media_url_original`): no DB write.
 */
export async function mirrorMediaToR2(
  row: MirrorMediaToR2Row,
  deps: MirrorMediaToR2Deps = defaultMirrorMediaToR2Deps,
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
    const isHttp4xx =
      result.reason === "fetch_failed" &&
      typeof result.error === "string" &&
      /^HTTP 4\d{2}$/.test(result.error);
    const data: {
      r2_last_attempt_at: Date;
      r2_attempts: number;
      status?: string;
    } = {
      r2_last_attempt_at: new Date(),
      r2_attempts: newAttempts,
    };
    // Tombstone ONLY on 3 consecutive HTTP 4xx. 5xx / network / R2-side
    // / token errors are likely transient — keep retrying after cooldown.
    if (isHttp4xx && newAttempts >= R2_TOMBSTONE_4XX_THRESHOLD) {
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
  fetchProperties: (since: Date, top: number) => Promise<TrestleProperty[]>;
  fetchMedia: (resourceRecordKey: string, top: number) => Promise<UpsertListingMediaInput[]>;
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
  rows_updated: number;
  rows_failed: number;
  listings_processed: number;
  listings_skipped: number;
  /** R2 mirror successes (uploaded + reused) in Phase 3. */
  r2_mirrored: number;
  /** R2 mirror failures in Phase 3 — row stays in backlog for retry. */
  r2_failed: number;
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
export const DEFAULT_MEDIA_PER_LISTING = 30;
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
export function buildPropertyQuery(since: Date, top: number): URLSearchParams {
  const params = new URLSearchParams();
  // Filter by Property.PhotosChangeTimestamp (Trestle vendor-recommended trigger
  // for media-only changes). We additionally constrain to active-displayable
  // statuses so we don't churn on terminal-status rows. `ge` (not `gt`) keeps
  // boundary rows visible — see review comment 2.
  params.set(
    "$filter",
    `PhotosChangeTimestamp ge ${since.toISOString()} and (StandardStatus eq 'Active' or StandardStatus eq 'ActiveUnderContract' or StandardStatus eq 'ComingSoon' or StandardStatus eq 'Pending')`,
  );
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

async function defaultFetchProperties(since: Date, top: number): Promise<TrestleProperty[]> {
  const token = await defaultGetAccessToken();
  const TRESTLE_API = process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle";

  const url = `${TRESTLE_API}/odata/Property?${buildPropertyQuery(since, top).toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Property fetch failed: HTTP ${res.status}`);
  const data = await res.json();
  return (data.value || []) as TrestleProperty[];
}

async function defaultFetchMedia(
  resourceRecordKey: string,
  top: number,
): Promise<UpsertListingMediaInput[]> {
  const token = await defaultGetAccessToken();
  const TRESTLE_API = process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle";

  const escaped = resourceRecordKey.replace(/'/g, "''");
  const params = new URLSearchParams();
  params.set("$filter", `ResourceRecordKey eq '${escaped}'`);
  params.set(
    "$select",
    "MediaKey,ResourceRecordKey,ResourceRecordID,MediaURL,MediaCategory,MediaClassification,MediaStatus,Permission,Order,PreferredPhotoYN,ModificationTimestamp,MediaModificationTimestamp",
  );
  params.set("$orderby", "Order asc");
  params.set("$top", String(top));

  const url = `${TRESTLE_API}/odata/Media?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Media fetch failed: HTTP ${res.status}`);
  const data = await res.json();
  return (data.value || []) as UpsertListingMediaInput[];
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
 * Tombstoning of vanished rows:
 *   - `tombstoneVanished: false` always — fetchMedia is capped, "missing"
 *     rows aren't proven vanished. Explicit `MediaStatus='Deleted'` still
 *     tombstones via Cp2's separate path.
 *
 * Boundary timestamp safety:
 *   - `buildPropertyQuery()` uses `PhotosChangeTimestamp ge` (not `gt`) and
 *     adds `ListingKey asc` to `$orderby` for stable boundary paging.
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
  const mediaPerListing = options.mediaPerListing ?? DEFAULT_MEDIA_PER_LISTING;
  const fallbackWindowDays = options.fallbackWindowDays ?? DEFAULT_FALLBACK_WINDOW_DAYS;
  const fetchDeps = options.fetchDeps ?? defaultFetchDeps;
  const mirrorDeps = options.mirrorDeps ?? defaultMirrorMediaToR2Deps;
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const phase1ReserveMs = options.phase1ReserveMs ?? DEFAULT_PHASE1_RESERVE_MS;
  const phase2ReserveMs = options.phase2ReserveMs ?? DEFAULT_PHASE2_RESERVE_MS;

  const remainingMs = (): number => budgetMs - (now() - startTime);

  let rowsChecked = 0;
  let rowsUpdated = 0;
  let rowsFailed = 0;
  let listingsProcessed = 0;
  let listingsSkipped = 0;
  let r2Mirrored = 0;
  let r2Failed = 0;
  let r2Skipped = 0;
  let backlogRemaining: number | null = null;
  let exitReason: RunMediaSyncResult["exit_reason"] = "completed";
  const cursorRecords: MediaSyncBatchRecord[] = [];

  // ── PHASE 1: source ingest ───────────────────────────────────────────
  const cursor = await getMediaSyncCursor();
  const since =
    cursor.last_photos_change ??
    new Date(now() - fallbackWindowDays * 86_400_000);

  let properties: TrestleProperty[];
  try {
    properties = await fetchDeps.fetchProperties(since, listingsPerRun);
  } catch (err) {
    // Source-fetch failure: do NOT advance cursor. No Phase 2/3/4.
    return {
      status: "error",
      exit_reason: "source_error",
      error: err instanceof Error ? err.message : String(err),
      rows_checked: 0,
      rows_updated: 0,
      rows_failed: 0,
      listings_processed: 0,
      listings_skipped: 0,
      r2_mirrored: 0,
      r2_failed: 0,
      r2_skipped: 0,
      backlog_remaining: null,
      duration_ms: now() - startTime,
    };
  }

  for (const property of properties) {
    if (remainingMs() < phase1ReserveMs) {
      exitReason = "budget_phase1";
      break;
    }

    if (isPropertyComplianceBlocked(property)) {
      listingsSkipped++;
      continue;
    }

    const listingId = property.ListingId ? String(property.ListingId) : null;
    const listingKey = property.ListingKey ? String(property.ListingKey) : null;
    if (!listingId || !listingKey) {
      listingsSkipped++;
      continue;
    }

    try {
      const mediaRows = await fetchDeps.fetchMedia(listingKey, mediaPerListing);
      rowsChecked += mediaRows.length;

      const upsertResult = await upsertListingMedia(listingId, mediaRows, {
        photosChangeTsSnapshot: property.PhotosChangeTimestamp ?? null,
        // FORCED FALSE — see PR #96 review-comment fix.
        tombstoneVanished: false,
      });
      rowsUpdated += upsertResult.inserted + upsertResult.updated;

      // Summary uses media_url_original (R2-independent) per
      // computeListingMediaSummary() at media-sync.ts:614. primary_photo_r2_key
      // may legitimately stay null until Phase 3 catches up. NEW: summary
      // failure is FAIL-LOUD (no longer swallowed) — surfaces in rows_failed
      // and prevents cursor advance for this listing so it re-tries next run.
      await updateListingMediaSummary(listingId);

      cursorRecords.push({
        PhotosChangeTimestamp: property.PhotosChangeTimestamp ?? null,
        ModificationTimestamp: property.ModificationTimestamp ?? null,
      });
      listingsProcessed++;
    } catch {
      rowsFailed++;
      // Do NOT push to cursorRecords — failed listing re-surfaces next run.
    }
  }

  // ── PHASE 2: cursor checkpoint (durable forward progress) ────────────
  // Runs only when Property fetch succeeded. Empty cursorRecords ⟹
  // advanceMediaSyncCursor's empty-batch contract advances last_run_at
  // heartbeat without changing watermarks.
  await advanceMediaSyncCursor({
    records: cursorRecords,
    status: rowsFailed > 0 ? "partial" : "ok",
    rowsChecked,
    rowsUpdated,
    rowsFailed,
  });

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
  const attemptedBacklogIds = new Set<bigint>();
  const cooldownThreshold = new Date(now() - R2_RETRY_COOLDOWN_MS);

  while (remainingMs() > phase2ReserveMs) {
    const backlogRows = await prisma.listingMedia.findMany({
      where: {
        status: "active",
        media_url_original: { not: null },
        OR: [{ r2_key: null }, { media_url_cached: null }],
        // Exclude rows already attempted this invocation. Empty Set is a
        // no-op via `undefined`; Prisma treats undefined as "no filter".
        ...(attemptedBacklogIds.size > 0
          ? { id: { notIn: [...attemptedBacklogIds] } }
          : {}),
        // Cross-invocation cooldown: never-attempted rows OR rows whose
        // last failure is older than the cooldown window are eligible.
        AND: [
          {
            OR: [
              { r2_last_attempt_at: null },
              { r2_last_attempt_at: { lt: cooldownThreshold } },
            ],
          },
        ],
      },
      orderBy: { created_at: "asc" },
      take: R2_MIRROR_CONCURRENCY,
      select: {
        // `id` is required for attempt tracking — never passed to mirrorMediaToR2.
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
      },
    });

    if (backlogRows.length === 0) break;

    // Mark every selected row as attempted BEFORE the mirror runs. Even
    // if Promise.allSettled isolates a per-row throw or the mirror returns
    // `failed`/`skipped`, the row will not be re-selected this invocation.
    for (const row of backlogRows) {
      attemptedBacklogIds.add(row.id);
    }

    const results = await Promise.allSettled(
      backlogRows.map((row) => {
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
        );
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled") {
        const v = r.value;
        if (v.status === "uploaded" || v.status === "reused") r2Mirrored++;
        else if (v.status === "skipped") r2Skipped++;
        else if (v.status === "failed") r2Failed++;
      } else {
        // Promise itself rejected (mirrorMediaToR2 contract returns structured
        // results, but defensive — handle thrown anyway).
        r2Failed++;
      }
    }
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

  return {
    status: finalStatus,
    exit_reason: exitReason,
    rows_checked: rowsChecked,
    rows_updated: rowsUpdated,
    rows_failed: rowsFailed,
    listings_processed: listingsProcessed,
    listings_skipped: listingsSkipped,
    r2_mirrored: r2Mirrored,
    r2_failed: r2Failed,
    r2_skipped: r2Skipped,
    backlog_remaining: backlogRemaining,
    duration_ms: now() - startTime,
  };
}
