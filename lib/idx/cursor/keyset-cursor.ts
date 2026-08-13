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
 * sync.ts:1879-1893 already documents this failure mode for a wall-clock
 * cursor. The same argument applies to a max-seen cursor under DESC ordering:
 * the doc's safety claim ("records above the high-water mark remain visible")
 * only holds for ASCENDING traversal.
 *
 * THE CONTRACT
 *
 *   order ASC by (timestamp, listingKey)
 *   resume with (ts > T) OR (ts = T AND key > K)
 *   advance to the LAST CONTIGUOUS fully processed row — never max-seen,
 *   never provider head, never local clock
 *
 * Two independent source dimensions cannot share one cursor: Property is
 * eligible on `ModificationTimestamp > W` OR `PhotosChangeTimestamp > W`, and a
 * single (ts, key) pair cannot represent both. Each dimension therefore owns
 * its own SyncState resource row — `Property` for the material clock and
 * `PropertyPhotos` for the media trigger — which keeps ONE cursor authority
 * (SyncState) while modelling the two clocks separately.
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

/** True when `row` sorts strictly after `cursor` — the resume predicate. */
export function isAfterCursor(row: CursorRow, cursor: CursorPosition | null): boolean {
  if (!cursor) return true;
  return compareCursorRows(row, cursor) > 0;
}

/** The OData `$filter` fragment for a keyset resume on one dimension. */
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

/**
 * The CURRENT main behaviour, expressed for comparison: highest timestamp seen
 * anywhere in the batch. Retained only so the tail-loss hazard can be asserted
 * as a regression rather than described in prose.
 */
export function legacyMaxSeenCursor(rows: readonly CursorRow[]): Date | null {
  let max: Date | null = null;
  for (const r of rows) if (!max || r.timestamp > max) max = r.timestamp;
  return max;
}
