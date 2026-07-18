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

export interface UpsertListingMediaResult {
  /** Rows that did not exist in DB and were inserted as active. */
  inserted: number;
  /**
   * N1: rows that already existed AND had at least one compared source field
   * differ — rewritten. (Before N1 this counter was `updated` and every
   * existing row landed here unconditionally.)
   */
  updatedChanged: number;
  /**
   * N1: rows that already existed with EVERY compared field identical
   * (see `mediaRowUnchanged`) — no UPDATE is issued at all: no `updated_at`
   * bump, no WAL, no dead tuple. This is the production instrument for the
   * previously-unverified "unchanged fraction" of Cotality media re-deliveries.
   */
  skippedUnchanged: number;
  /** Input rows rejected before any DB write (no MediaKey, non-Public Permission, no MediaURL). */
  skippedInvalid: number;
  /**
   * INPUT rows carrying `MediaStatus === "Deleted"` — counted per input row,
   * INCLUDING duplicates that later collapse into one `media_key` in the
   * delete Set, and including signals for rows that don't exist / are already
   * deleted (which then affect zero DB rows).
   */
  deleteSignalsReceived: number;
  /** DB rows tombstoned by the explicit-delete updateMany (affected-row count). */
  tombstonedExplicit: number;
  /** DB rows tombstoned by the vanished-media updateMany (affected-row count) — these have NO corresponding input row. */
  tombstonedVanished: number;
  /**
   * DB rows whose `status` flipped active→deleted:
   * `tombstoned = tombstonedExplicit + tombstonedVanished`.
   * This is a DATABASE-ROW OUTCOME, NOT an input-row disposition — duplicate
   * delete inputs collapse, unmatched delete signals affect zero rows, and
   * vanished tombstones have no input row. The accounting invariants are:
   *
   *   input rows      ≡ inserted + updatedChanged + skippedUnchanged
   *                     + skippedInvalid + deleteSignalsReceived
   *   physical writes ≡ inserted + updatedChanged
   *                     + tombstonedExplicit + tombstonedVanished
   *
   * The five business counters alone do NOT partition the input.
   */
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
 * N1: the columns the UPDATE branch writes, read back for comparison.
 * Structural subset of the Prisma `listing_media` row.
 */
interface MediaRowCompareSnapshot {
  listing_id: string | null;
  resource_record_key: string | null;
  resource_record_id: string | null;
  media_url_original: string | null;
  media_type: string | null;
  media_category: string | null;
  media_classification: string | null;
  order: number | null;
  preferred_photo_yn: boolean | null;
  media_modification_ts: Date | null;
  modification_ts: Date | null;
  status: string | null;
}

/**
 * N1: epoch-normalized nullable-timestamp equality. NEVER compares Date
 * objects by identity — two distinct Date instances at the same epoch
 * millisecond are equal; null equals only null.
 */
function tsEqual(a: Date | null, b: Date | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.getTime() === b.getTime();
}

/**
 * N1 comparison contract — a row is "unchanged" iff EVERY field the UPDATE
 * branch would write is already equal on the existing row, INCLUDING
 * `status === 'active'` (a tombstoned row re-delivered active must be
 * reactivated, so it always compares as changed) and the row-level
 * provenance timestamps (`media_modification_ts`, `modification_ts`).
 *
 * `photos_change_ts_snapshot` is deliberately NOT compared and NOT written
 * for unchanged rows. Ownership model (reviewed contract, 2026-07-17):
 *   - Cotality re-stamps the Property-level `PhotosChangeTimestamp` without
 *     media-row content changes; comparing or rewriting the snapshot would
 *     force a full-row rewrite of every media row on every re-delivery and
 *     defeat write suppression entirely.
 *   - The LATEST Property-level snapshot is durably retained at the
 *     sync-state level: `media_sync_state.last_photos_change` (the keyset
 *     cursor) advances every run, and per-run first/last PhotosChange values
 *     are logged via cursor telemetry. No provenance is lost.
 *   - The row-level `photos_change_ts_snapshot` field remains meaningful with
 *     narrowed semantics: "the Property-level snapshot at this row's last
 *     CONTENT write" (inserts and changed-row updates still write it).
 *     Retiring the column, if ever desired, is a separate reviewed change.
 *
 * Exported for direct unit tests.
 */
export function mediaRowUnchanged(
  existing: MediaRowCompareSnapshot,
  row: MappedMediaRow,
  listingId: string,
): boolean {
  return (
    existing.status === "active" &&
    existing.listing_id === listingId &&
    existing.resource_record_key === row.resourceRecordKey &&
    existing.resource_record_id === row.resourceRecordID &&
    existing.media_url_original === row.mediaUrlOriginal &&
    existing.media_type === row.mediaType &&
    existing.media_category === row.mediaCategory &&
    existing.media_classification === row.mediaClassification &&
    existing.order === row.order &&
    existing.preferred_photo_yn === row.preferredPhotoYN &&
    tsEqual(existing.media_modification_ts, row.mediaModificationTs) &&
    tsEqual(existing.modification_ts, row.modificationTs)
  );
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
 *   - Otherwise: upsert by `media_key`. Inserts seed `created_at`. Updates
 *     execute ONLY when at least one compared field differs from the existing
 *     row (`mediaRowUnchanged` — N1); an unchanged row produces zero writes
 *     and counts as `skippedUnchanged`. The `r2_key` and `media_url_cached`
 *     fields are NEVER touched here — those land in Checkpoint 4 (R2 upload
 *     path).
 *
 * `tombstoneVanished` (default false): when true, rows currently
 * `status='active'` for `listingId` that aren't in the input batch are
 * also tombstoned. Caller must guarantee the input batch is complete.
 *
 * Idempotent AND write-suppressing (N1): running this twice with identical
 * input produces ZERO row writes on the second pass — no `updated_at` bump,
 * no WAL, no dead tuple. (Pre-N1 this doc claimed idempotency while every
 * pass still rewrote every existing row.)
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
      // Counted per INPUT row (duplicates included) — the Set below dedupes
      // for the write, so deleteSignalsReceived ≥ affected rows by design.
      deleteSignalsReceived++;
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

  // Upsert each surviving row. We use findUnique + create/update rather than
  // Prisma's upsert() so we can (a) return precise per-outcome counts and
  // (b) N1: compare the existing row's written fields and SKIP the UPDATE
  // entirely when nothing changed. The lookup stays the same unique-index
  // point read (`listing_media_media_key_key`) — only the select widens.
  for (const row of mapped) {
    const existing = await prisma.listingMedia.findUnique({
      where: { media_key: row.mediaKey },
      select: {
        id: true,
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
      },
    });
    if (existing) {
      // N1: unchanged content ⇒ zero writes. `photos_change_ts_snapshot` is
      // intentionally outside the comparison AND outside the skip-path write
      // set — see the `mediaRowUnchanged` contract above.
      if (mediaRowUnchanged(existing, row, listingId)) {
        skippedUnchanged++;
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
      updatedChanged++;
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

  let tombstonedExplicit = 0;
  let tombstonedVanished = 0;

  if (explicitDeleteKeys.size > 0) {
    const res = await prisma.listingMedia.updateMany({
      where: {
        listing_id: listingId,
        status: "active",
        media_key: { in: [...explicitDeleteKeys] },
      },
      data: { status: "deleted" },
    });
    tombstonedExplicit += res.count;
  }

  if (options.tombstoneVanished === true) {
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
    tombstonedVanished += res.count;
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
}

/** Active-Photo eligibility filter shared by hero selection and photo_count. */
function filterActivePhotoRows<T extends HeroPhotoCandidate>(rows: readonly T[]): T[] {
  return rows.filter(
    (r) =>
      String(r.status).toLowerCase() === "active" &&
      String(r.media_type).toLowerCase() === "photo",
  );
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
 * the candidate SELECT:
 *   - Branch 1: media of Mallan-owned listings (any media_type — complete
 *     active set retained).
 *   - Branch 2: `media_type='Photo'` rows of third-party DISPLAYABLE
 *     listings (`buildSearchDisplayWhere()` = the production search display
 *     gate + active statuses). Third-party floor plans / videos / virtual
 *     tours are excluded here outright.
 * Media of non-displayable / terminal third-party listings match NEITHER
 * branch ⇒ never admitted to the backlog (R2-0 rule 4).
 *
 * The EXPENSIVE part — "is this Photo the canonical hero?" — cannot be
 * expressed in a Prisma where-clause (hero identity requires per-listing
 * ordering across ALL of the listing's rows: preferred_photo_yn, then min
 * `order`, then first-encountered). That refinement happens post-fetch in
 * `runMediaSync` Phase 3 via `selectHeroPhoto` + `decideMirrorAdmissionScope`.
 */
export function buildR2MirrorPolicyMediaWhere(): Prisma.ListingMediaWhereInput {
  return {
    OR: [
      { listing: buildMallanOwnedListingWhere() },
      { media_type: "Photo", listing: buildSearchDisplayWhere() },
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
export function buildR2BacklogWhere(
  cooldownThreshold: Date,
  attemptedIds: bigint[],
): Prisma.ListingMediaWhereInput {
  return {
    status: "active",
    media_url_original: { not: null },
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
      // R2-1 admission control (cheap DB-side part — see
      // buildR2MirrorPolicyMediaWhere; hero-only refinement happens in code).
      buildR2MirrorPolicyMediaWhere(),
    ],
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
      r2_attempts: number;
      status?: string;
    } = {
      r2_last_attempt_at: new Date(),
      r2_attempts: newAttempts,
    };
    // Tombstone ONLY on 3 consecutive permanent 4xx (404 / 410). 5xx,
    // network, R2-side, token, and other 4xx errors are transient or
    // ambiguous — keep retrying after cooldown.
    if (isPermanent4xx && newAttempts >= R2_TOMBSTONE_4XX_THRESHOLD) {
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
   * LEGACY aggregate kept for dashboard/audit continuity:
   * `rows_inserted + rows_updated_changed`. Pre-N1 this equalled rows_checked
   * on every run because every existing row was rewritten unconditionally.
   */
  rows_updated: number;
  /**
   * N1 counters — per-outcome truth (see UpsertListingMediaResult).
   * Accounting invariants (per fully-processed listing batch):
   *   rows_checked   ≡ rows_inserted + rows_updated_changed
   *                    + rows_skipped_unchanged + rows_skipped_invalid
   *                    + delete_signals_received
   *   physical writes ≡ rows_inserted + rows_updated_changed
   *                    + tombstoned_explicit + tombstoned_vanished
   * `rows_tombstoned` (= explicit + vanished) is a DB-ROW outcome, not an
   * input disposition — the five business counters alone do NOT partition
   * rows_checked. (On budget/failure exits, rows_checked counts every fetched
   * row while the per-outcome counters only cover fully-processed listings.)
   */
  rows_inserted: number;
  rows_updated_changed: number;
  rows_skipped_unchanged: number;
  rows_skipped_invalid: number;
  delete_signals_received: number;
  tombstoned_explicit: number;
  tombstoned_vanished: number;
  rows_tombstoned: number;
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
   * (non-hero photo of a displayable third-party listing, or — defensively —
   * media of a non-admissible/unknown listing that slipped past the DB-side
   * filter). Never mirrored; no Trestle fetch, no R2 write.
   */
  mirror_rejected_policy: number;
  /** LEGACY aggregate: R2 mirror successes (`r2_uploaded + r2_reused`) in Phase 3. */
  r2_mirrored: number;
  /** R2-1 split of `r2_mirrored`: fetched from Trestle and uploaded to R2 this run. */
  r2_uploaded: number;
  /** R2-1 split of `r2_mirrored`: object already existed in R2 — reused, no upload. */
  r2_reused: number;
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
  let rowsUpdated = 0;
  let rowsInserted = 0;
  let rowsUpdatedChanged = 0;
  let rowsSkippedUnchanged = 0;
  let rowsSkippedInvalid = 0;
  let deleteSignalsReceived = 0;
  let tombstonedExplicit = 0;
  let tombstonedVanished = 0;
  let rowsTombstoned = 0;
  let rowsFailed = 0;
  let listingsProcessed = 0;
  let listingsSkipped = 0;
  let ghostListingsSkipped = 0;
  const ghostListingIds: string[] = [];
  let mirrorAllowed = 0;
  let mirrorRejectedPolicy = 0;
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
      rows_failed: 0,
      listings_processed: 0,
      listings_skipped: 0,
      ghost_listings_skipped: 0,
      ghost_listing_ids: [],
      mirror_allowed: 0,
      mirror_rejected_policy: 0,
      r2_mirrored: 0,
      r2_uploaded: 0,
      r2_reused: 0,
      r2_failed: 0,
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
      rowsInserted += upsertResult.inserted;
      rowsUpdatedChanged += upsertResult.updatedChanged;
      rowsSkippedUnchanged += upsertResult.skippedUnchanged;
      rowsSkippedInvalid += upsertResult.skippedInvalid;
      deleteSignalsReceived += upsertResult.deleteSignalsReceived;
      tombstonedExplicit += upsertResult.tombstonedExplicit;
      tombstonedVanished += upsertResult.tombstonedVanished;
      rowsTombstoned += upsertResult.tombstoned;
      // Legacy aggregate (kept for dashboard/audit continuity).
      rowsUpdated += upsertResult.inserted + upsertResult.updatedChanged;

      // Fail-loud: a summary failure throws → caught below → ok:false → the
      // keyset watermark will not advance past this listing (retried next run).
      await updateListingMediaSummary(listingId);

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
  const attemptedBacklogIds = new Set<bigint>();
  const cooldownThreshold = new Date(now() - R2_RETRY_COOLDOWN_MS);
  // R2-1: per-invocation cache of each hero_only listing's canonical hero
  // media_key (null = no eligible hero / lookup failed ⇒ fail-closed: admit
  // nothing for that listing this invocation).
  const heroKeyCache = new Map<string, string | null>();

  while (remainingMs() > phase2ReserveMs) {
    const backlogRows = await prisma.listingMedia.findMany({
      // RC3: backlog `where` is built by the pure `buildR2BacklogWhere` so the
      // retry-exhausted exclusion (park non-permanent rows at >= threshold) is
      // unit-testable. Eligibility = active + missing-R2 + past-cooldown +
      // not-attempted-this-invocation + not-retry-exhausted + (R2-1) policy-
      // admissible at the listing level (buildR2MirrorPolicyMediaWhere).
      where: buildR2BacklogWhere(cooldownThreshold, [...attemptedBacklogIds]),
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
      },
    });

    if (backlogRows.length === 0) break;

    // Mark every selected row as attempted BEFORE the mirror runs. Even
    // if Promise.allSettled isolates a per-row throw or the mirror returns
    // `failed`/`skipped`, the row will not be re-selected this invocation.
    for (const row of backlogRows) {
      attemptedBacklogIds.add(row.id);
    }

    // ── R2-1 post-fetch admission filter ─────────────────────────────────
    // Hero identity CANNOT live in the SQL where: it needs per-listing
    // ordering over ALL of the listing's rows (preferred_photo_yn → min
    // `order` → first-encountered), so it is decided here in code with the
    // production hero resolver (`selectHeroPhoto` — the same function that
    // derives Listing.primary_photo_url). Rejected rows are already in
    // `attemptedBacklogIds`, so they cost nothing further this invocation;
    // their DB state is untouched (no cooldown write — policy rejection is
    // not a failure).
    const admittedRows: typeof backlogRows = [];
    for (const row of backlogRows) {
      const scope = decideMirrorAdmissionScope(row.listing);
      if (scope === "all_active") {
        // Mallan-owned: complete active set retained (as today).
        admittedRows.push(row);
        continue;
      }
      if (scope === "none") {
        // Fail-closed: non-displayable / terminal / unknown listing.
        mirrorRejectedPolicy++;
        continue;
      }
      // hero_only — third-party displayable listing: admit ONLY the canonical
      // hero photo (max MAX_FEED_MIRROR_PHOTOS_PER_LISTING = 1 per listing).
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
            select: {
              media_key: true,
              media_type: true,
              status: true,
              preferred_photo_yn: true,
              order: true,
            },
          });
          heroKey = selectHeroPhoto(listingRows)?.media_key ?? null;
        } catch {
          // Fail-closed: unknown hero ⇒ admit nothing for this listing now.
          // The rows stay in the backlog and are re-evaluated next firing.
          heroKey = null;
        }
        heroKeyCache.set(row.listing_id, heroKey);
      }
      if (heroKey !== null && row.media_key === heroKey) {
        admittedRows.push(row);
      } else {
        mirrorRejectedPolicy++;
      }
    }

    mirrorAllowed += admittedRows.length;
    if (admittedRows.length === 0) continue;

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
        );
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled") {
        const v = r.value;
        if (v.status === "uploaded") {
          r2Uploaded++;
          r2Mirrored++; // legacy aggregate = uploaded + reused
        } else if (v.status === "reused") {
          r2Reused++;
          r2Mirrored++;
        } else if (v.status === "skipped") r2Skipped++;
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
        // R2-1: count only the policy-admissible universe — an unscoped count
        // would report the entire feed's never-to-be-mirrored media as
        // "backlog" forever. NOTE: this is an UPPER BOUND — non-hero photos
        // of displayable third-party listings still match the cheap DB-side
        // filter and are only rejected per-row in Phase 3; they inflate this
        // count until R2-2 parks/cleans them.
        AND: [buildR2MirrorPolicyMediaWhere()],
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
    rows_failed: rowsFailed,
    listings_processed: listingsProcessed,
    listings_skipped: listingsSkipped,
    ghost_listings_skipped: ghostListingsSkipped,
    ghost_listing_ids: ghostListingIds,
    mirror_allowed: mirrorAllowed,
    mirror_rejected_policy: mirrorRejectedPolicy,
    r2_mirrored: r2Mirrored,
    r2_uploaded: r2Uploaded,
    r2_reused: r2Reused,
    r2_failed: r2Failed,
    r2_skipped: r2Skipped,
    backlog_remaining: backlogRemaining,
    duration_ms: now() - startTime,
  };
}
