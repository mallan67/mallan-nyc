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
 *   - DB writes happen ONLY on the success paths (`uploaded` and `reused`
 *     when there's drift). `failed` and `skipped` never touch the DB.
 */
export async function mirrorMediaToR2(
  row: MirrorMediaToR2Row,
  deps: MirrorMediaToR2Deps = defaultMirrorMediaToR2Deps,
): Promise<MirrorMediaToR2Result> {
  const url = (row.media_url_original ?? "").trim();
  if (!url) {
    return { status: "skipped", reason: "no_media_url_original" };
  }

  // R2 key resolution: prefer existing (stable across retries), else derive.
  // `buildMediaR2Key` namespaces by canonical mediaType (Photo→photos/,
  // FloorPlan→floorplans/, Video→videos/, VirtualTour→virtualtours/).
  const key =
    row.r2_key && row.r2_key.length > 0
      ? row.r2_key
      : buildMediaR2Key(row.listing_id, row.media_type, row.order);

  // Reuse path: object already in R2.
  let exists = false;
  try {
    exists = await deps.existsInR2(key);
  } catch (e) {
    return {
      status: "failed",
      reason: "r2_head_failed",
      error: e instanceof Error ? e.message : String(e),
    };
  }

  if (exists) {
    const publicUrl = deps.getR2PublicUrl(key);
    // Suppress no-op writes — only persist when something actually drifted.
    if (row.r2_key !== key || row.media_url_cached !== publicUrl) {
      await prisma.listingMedia.update({
        where: { media_key: row.media_key },
        data: { r2_key: key, media_url_cached: publicUrl },
      });
    }
    return { status: "reused", r2_key: key, media_url_cached: publicUrl };
  }

  // Upload path: fetch from Trestle, then upload to R2.
  let token: string;
  try {
    token = await deps.getAccessToken();
  } catch (e) {
    return {
      status: "failed",
      reason: "token_failed",
      error: e instanceof Error ? e.message : String(e),
    };
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
      return {
        status: "failed",
        reason: "fetch_failed",
        error: `HTTP ${response.status}`,
      };
    }

    contentType = response.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return {
        status: "failed",
        reason: "non_image_content_type",
        error: contentType,
      };
    }

    buffer = Buffer.from(await response.arrayBuffer());
  } catch (e) {
    return {
      status: "failed",
      reason: "fetch_threw",
      error: e instanceof Error ? e.message : String(e),
    };
  }

  let publicUrl: string;
  try {
    publicUrl = await deps.uploadToR2(key, buffer, contentType);
  } catch (e) {
    return {
      status: "failed",
      reason: "upload_failed",
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // Persist r2_key + media_url_cached. NEVER touch media_url_original.
  await prisma.listingMedia.update({
    where: { media_key: row.media_key },
    data: { r2_key: key, media_url_cached: publicUrl },
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
}

export interface RunMediaSyncResult {
  /**
   * `ok`      — full success, all listings processed without per-row failures.
   * `partial` — at least one listing or media row failed; rest succeeded;
   *             cursor advanced for processed listings only.
   * `error`   — Trestle Property fetch failed; cursor NOT advanced.
   */
  status: "ok" | "partial" | "error";
  rows_checked: number;
  rows_updated: number;
  rows_failed: number;
  listings_processed: number;
  listings_skipped: number;
  duration_ms: number;
  /** Set when `status === "error"`. */
  error?: string;
}

export const DEFAULT_LISTINGS_PER_RUN = 50;
export const DEFAULT_MEDIA_PER_LISTING = 30;
export const DEFAULT_FALLBACK_WINDOW_DAYS = 30;

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
 *   - `$select` includes `Permission`, `Permissions`, and `MlsStatus` so the
 *     orchestrator-level `isPropertyComplianceBlocked()` gate has the data
 *     it needs (review comment 3). These are the canonical names from
 *     `lib/idx/trestle-mapper.ts:715-721`.
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
  params.set(
    "$select",
    "ListingId,ListingKey,ListingKeyNumeric,PhotosChangeTimestamp,ModificationTimestamp,StandardStatus,Permission,Permissions,MlsStatus,InternetEntireListingDisplayYN,InternetAddressDisplayYN",
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
 * One pass of the media-sync pipeline. Composes Cp1 (cursor), Cp2 (upsert
 * listing_media), Cp3 (Listing summary), and Cp4 (R2 mirror).
 *
 * Watermark safety:
 *   - Property fetch failure ⟹ return early with `status: "error"`. The
 *     cursor is NOT advanced. Next run retries with the same `since`.
 *   - Per-listing failures (Media fetch / upsert error / R2 / summary) are
 *     caught and counted in `rows_failed`. The cursor advances using only
 *     records we successfully processed. Listings that failed will surface
 *     again on the next run if their `PhotosChangeTimestamp` is still > the
 *     advanced watermark.
 *   - Empty Property page ⟹ `status: "ok"`, `last_run_at` advances, but the
 *     watermarks themselves stay frozen (per `advanceMediaSyncCursor`'s
 *     empty-batch contract).
 *
 * Compliance:
 *   - Skips listings via `isPropertyComplianceBlocked()` — REBNY Gates 1
 *     (Owner Opt-Out via `Permission`/`Permissions`/`MlsStatus`), 2
 *     (Participant Only via `Permission='Private'`), and 3 (master internet
 *     display via `InternetEntireListingDisplayYN === false`). This mirrors
 *     `checkDistributionGates()` in `lib/idx/trestle-mapper.ts`.
 *   - Per-row Permission filter and `MediaStatus='Deleted'` tombstoning are
 *     handled inside `upsertListingMedia()`.
 *
 * Tombstoning of vanished rows:
 *   - `tombstoneVanished` is FORCED FALSE when calling `upsertListingMedia()`.
 *     Because `fetchMedia` is capped at `mediaPerListing` ($top default 30),
 *     "missing" rows in the response are NOT proven vanished — they may
 *     simply be beyond the page. Cp2's explicit `MediaStatus='Deleted'`
 *     tombstoning still runs unconditionally and is the correct mechanism
 *     for genuine deletions (review comment 1).
 *
 * Boundary timestamp safety:
 *   - The cursor uses `ge` (not `gt`) on `PhotosChangeTimestamp` via
 *     `buildPropertyQuery()`. Same-timestamp rows that paginated past the
 *     batch on a prior run will re-surface on subsequent runs (review
 *     comment 2). Idempotent upsert at `media_key` makes the re-processing
 *     safe.
 *
 * Bounds:
 *   - Hard caps `listingsPerRun` (default 50) and `mediaPerListing` (default 30).
 *   - No recursive calls. Single linear loop bounded by the page size.
 *   - No retries on transient failures — those land in Checkpoint 6.
 *
 * Reader/PR-4 boundary:
 *   - Never writes `Listing.media` JSON.
 *   - Never modifies anything in `app/api/media/batch/`, `lib/idx/sync.ts`,
 *     `lib/external-listings/`, schema, or migrations.
 *   - Public site continues to read `Listing.media` JSON until PR 4.
 */
export async function runMediaSync(options: RunMediaSyncOptions = {}): Promise<RunMediaSyncResult> {
  const startTime = Date.now();
  const listingsPerRun = options.listingsPerRun ?? DEFAULT_LISTINGS_PER_RUN;
  const mediaPerListing = options.mediaPerListing ?? DEFAULT_MEDIA_PER_LISTING;
  const fallbackWindowDays = options.fallbackWindowDays ?? DEFAULT_FALLBACK_WINDOW_DAYS;
  const fetchDeps = options.fetchDeps ?? defaultFetchDeps;
  const mirrorDeps = options.mirrorDeps ?? defaultMirrorMediaToR2Deps;

  const cursor = await getMediaSyncCursor();
  const since =
    cursor.last_photos_change ??
    new Date(Date.now() - fallbackWindowDays * 86_400_000);

  // Property fetch — failure is route-level error. Cursor NOT advanced.
  let properties: TrestleProperty[];
  try {
    properties = await fetchDeps.fetchProperties(since, listingsPerRun);
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
      rows_checked: 0,
      rows_updated: 0,
      rows_failed: 0,
      listings_processed: 0,
      listings_skipped: 0,
      duration_ms: Date.now() - startTime,
    };
  }

  let rowsChecked = 0;
  let rowsUpdated = 0;
  let rowsFailed = 0;
  let listingsProcessed = 0;
  let listingsSkipped = 0;
  const cursorRecords: MediaSyncBatchRecord[] = [];

  for (const property of properties) {
    // Defensive compliance gate (REBNY Gates 1 / 2 / 3 — see
    // `isPropertyComplianceBlocked` and `checkDistributionGates`).
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
        // FORCED FALSE: fetchMedia is capped at mediaPerListing ($top, default
        // 30). "Missing" rows in a capped response are NOT proven vanished —
        // they may simply be beyond the page. See review comment 1.
        // Cp2's explicit MediaStatus='Deleted' tombstoning still runs and is
        // the correct mechanism for genuine deletions.
        tombstoneVanished: false,
      });
      rowsUpdated += upsertResult.inserted + upsertResult.updated;

      // Re-read the active listing_media rows so we can mirror to R2 with
      // their actual DB state (including any preserved r2_key / media_url_cached
      // from prior runs).
      const dbRows = await prisma.listingMedia.findMany({
        where: { listing_id: listingId, status: "active" },
        select: {
          listing_id: true,
          media_key: true,
          media_type: true,
          order: true,
          media_url_original: true,
          r2_key: true,
          media_url_cached: true,
        },
      });

      for (const dbRow of dbRows) {
        // Skip rows without media_key — `mirrorMediaToR2` requires it for
        // the upsert WHERE clause. These would be legacy or malformed rows.
        if (!dbRow.media_key) continue;
        try {
          const result = await mirrorMediaToR2(
            {
              listing_id: dbRow.listing_id,
              media_key: dbRow.media_key,
              media_type: dbRow.media_type,
              order: dbRow.order,
              media_url_original: dbRow.media_url_original,
              r2_key: dbRow.r2_key,
              media_url_cached: dbRow.media_url_cached,
            },
            mirrorDeps,
          );
          if (result.status === "failed") rowsFailed++;
        } catch {
          rowsFailed++;
        }
      }

      // Update derived Listing summary columns. Failure is non-fatal —
      // listing_media is the source of truth, summary columns are reads.
      try {
        await updateListingMediaSummary(listingId);
      } catch {
        // intentionally swallowed
      }

      cursorRecords.push({
        PhotosChangeTimestamp: property.PhotosChangeTimestamp ?? null,
        ModificationTimestamp: property.ModificationTimestamp ?? null,
      });
      listingsProcessed++;
    } catch {
      // Per-listing failure (Media fetch threw, upsert threw, etc).
      // Count one failure for the listing; do NOT push to cursorRecords.
      rowsFailed++;
    }
  }

  const status: RunMediaSyncResult["status"] = rowsFailed > 0 ? "partial" : "ok";

  // Advance cursor — only with records we successfully processed.
  // On `error` route-level path we never reach here, so the cursor stays put.
  await advanceMediaSyncCursor({
    records: cursorRecords,
    status,
    rowsChecked,
    rowsUpdated,
    rowsFailed,
  });

  return {
    status,
    rows_checked: rowsChecked,
    rows_updated: rowsUpdated,
    rows_failed: rowsFailed,
    listings_processed: listingsProcessed,
    listings_skipped: listingsSkipped,
    duration_ms: Date.now() - startTime,
  };
}
