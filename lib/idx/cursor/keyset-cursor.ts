/**
 * PROVIDER KEYSET CURSOR — pure contract, no I/O.
 *
 * WHY THIS EXISTS
 *
 * `fetchFromTrestle` defaults to `$orderby=ModificationTimestamp desc`
 * (lib/idx/fetch.ts:144) and scheduled Property runs cap at 500 records. The
 * durable cursor then advances to the highest MT processed. Those three facts
 * together mean the NEWEST 500 rows are processed and the cursor jumps to the
 * newest MT, so the next run's `MT gt cursor` filter excludes every OLDER
 * eligible row that never got processed. On a backlog larger than the cap the
 * unprocessed tail is not at risk — it is unreachable, on every capped run.
 *
 * The same argument applies to a max-seen cursor under DESC ordering: the
 * safety claim "records above the high-water mark remain visible" only holds
 * for ASCENDING traversal.
 *
 * THE CONTRACT
 *
 *   order ASC by (timestamp, listingKey)
 *   resume with (ts > T) OR (ts = T AND key > K)
 *   advance to the LAST CONTIGUOUS fully processed row — never max-seen,
 *   never provider head, never local clock
 *
 * Two independent source dimensions cannot share one cursor: a single (ts, key)
 * pair cannot represent both `ModificationTimestamp` and
 * `PhotosChangeTimestamp`. They are therefore split across the two owners that
 * already exist:
 *
 *   ModificationTimestamp -> sync_state.Property.{last_watermark,last_listing_key}
 *   PhotosChangeTimestamp -> media_sync_state.Media.{last_photos_change,last_listing_key}
 *
 * CORRECTION (2026-08-13): an earlier draft of this header proposed a
 * `SyncState("PropertyPhotos")` row for the media trigger. That was NOT built
 * and must not be — `media_sync_state` already owns the PCT dimension and is
 * live. Adding a third row would be a second cursor for a dimension that
 * already has one.
 *
 * KNOWN LIMITATION — a keyset cursor is FORWARD-ONLY. A record that enters the
 * feed carrying a timestamp BELOW the current position is unreachable by any
 * cursor value and needs a state-based backlog drain, not a rewind. This is
 * observable today on the media lane, where 97 displayable listings carry a
 * source PhotosChangeTimestamp below the live media cursor
 * (docs/audits/listing-media-reader-ownership-2026-08-13.md §4.1).
 */

export interface CursorPosition {
  /** Provider timestamp of the last fully processed row. */
  timestamp: Date;
  /** Tie-breaker: provider ListingKey at that timestamp. */
  listingKey: string;
}

export interface CursorRow {
  timestamp: Date;
  listingKey: string;
}

/** Ascending, total order over (timestamp, listingKey). */
export function compareCursorRows(a: CursorRow, b: CursorRow): number {
  const t = a.timestamp.getTime() - b.timestamp.getTime();
  return t !== 0 ? t : a.listingKey < b.listingKey ? -1 : a.listingKey > b.listingKey ? 1 : 0;
}

/**
 * The OData `$filter` fragment for a keyset resume on one dimension.
 *
 * SOLE OWNER of this shape. `buildIncrementalFilter` (lib/idx/fetch.ts) calls
 * it rather than re-deriving the predicate, so the filter sent to Cotality and
 * the ordering `advanceCursor` assumes can never drift apart.
 */
export function keysetFilter(field: string, cursor: CursorPosition | null): string | null {
  if (!cursor) return null;
  const ts = cursor.timestamp.toISOString();
  const key = cursor.listingKey.replace(/'/g, "''");
  return `(${field} gt ${ts} or (${field} eq ${ts} and ListingKey gt '${key}'))`;
}

export interface AdvanceResult {
  /** Last CONTIGUOUS fully processed position, or the prior cursor if none. */
  next: CursorPosition | null;
  processed: number;
  /** True when a failure stopped advancement before the end of the batch. */
  haltedOnFailure: boolean;
}

/**
 * Advance across an ASCENDING batch, stopping at the first failure.
 *
 * A failure at row N leaves the cursor at N-1 so the failed row is retried;
 * it is never skipped, and rows after it are never silently consumed. An empty
 * batch returns the prior cursor unchanged — it must not invent a position.
 */
export function advanceCursor(
  rows: readonly CursorRow[],
  prior: CursorPosition | null,
  succeeded: (row: CursorRow, index: number) => boolean,
): AdvanceResult {
  const ordered = rows.slice().sort(compareCursorRows);
  let next = prior;
  let processed = 0;
  for (let i = 0; i < ordered.length; i++) {
    if (!succeeded(ordered[i], i)) {
      return { next, processed, haltedOnFailure: true };
    }
    next = { timestamp: ordered[i].timestamp, listingKey: ordered[i].listingKey };
    processed++;
  }
  return { next, processed, haltedOnFailure: false };
}
