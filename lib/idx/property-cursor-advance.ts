/**
 * Phase 1A — advance a stream cursor through its CONTIGUOUS SETTLED PREFIX.
 *
 * Each stream is an ascending keyset scan, so its cursor may move forward only
 * as far as the last record that fully settled, walking in returned order and
 * stopping at the first record that did not. Anything at or beyond the stop
 * point is re-fetched next cycle; because the scan is ascending and the cursor
 * is composite, nothing can be skipped.
 *
 * TWO DISTINCT HALT SEMANTICS
 * ---------------------------
 *  - FREEZE (missing/empty ListingKey, malformed stream clock): the stream stays
 *    at its PRE-RUN cursor, even if earlier records in the page settled. The
 *    unbounded row cannot be expressed as a keyset position, so advancing past
 *    the earlier prefix would strand it behind a cursor it can never satisfy.
 *  - STOP (ordinary processing failure with valid cursor fields): the contiguous
 *    settled prefix still advances, and the run resumes at the failed record.
 */

import type { PropertyKeysetCursor, PropertyStreamField } from "@/lib/idx/property-cursor";

export type RecordSettlement = "settled" | "blocked";

export interface StreamAdvanceInput {
  field: PropertyStreamField;
  /** The cursor this run started from — the floor a frozen stream returns to. */
  preRunCursor: PropertyKeysetCursor;
  /** Stream membership in returned keyset order. */
  order: ReadonlyArray<{ listingKey: string | null; entryIndex: number }>;
  /** Settlement per merged entry index. Absent => treated as blocked. */
  settlementByEntryIndex: ReadonlyMap<number, RecordSettlement>;
  /** The representation actually processed, by ListingKey. */
  recordByListingKey: ReadonlyMap<string, Record<string, unknown>>;
  /** Non-null => freeze at preRunCursor regardless of any settled prefix. */
  freezeReason: string | null;
}

export interface StreamAdvanceResult {
  cursor: PropertyKeysetCursor;
  advanced: boolean;
  /** How many records of the page were settled and passed. */
  settledPrefixLength: number;
  /** Why the walk stopped, for telemetry. */
  haltedBy: "freeze" | "blocked_record" | "end_of_page" | "empty_page";
}

function validTimestamp(v: unknown): string | null {
  if (typeof v !== "string" || v.length === 0) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) && !Number.isNaN(t) ? v : null;
}

export function advanceStreamCursor(input: StreamAdvanceInput): StreamAdvanceResult {
  const { field, preRunCursor, order, settlementByEntryIndex, recordByListingKey, freezeReason } = input;

  if (freezeReason !== null) {
    return { cursor: preRunCursor, advanced: false, settledPrefixLength: 0, haltedBy: "freeze" };
  }
  if (order.length === 0) {
    // An empty page preserves the existing cursor exactly.
    return { cursor: preRunCursor, advanced: false, settledPrefixLength: 0, haltedBy: "empty_page" };
  }

  let cursor = preRunCursor;
  let advanced = false;
  let settled = 0;

  for (const member of order) {
    if (member.listingKey === null) {
      return { cursor, advanced, settledPrefixLength: settled, haltedBy: "blocked_record" };
    }
    if (settlementByEntryIndex.get(member.entryIndex) !== "settled") {
      return { cursor, advanced, settledPrefixLength: settled, haltedBy: "blocked_record" };
    }
    const record = recordByListingKey.get(member.listingKey);
    const ts = record ? validTimestamp(record[field]) : null;
    if (ts === null) {
      // Cannot express this position as a keyset value — stop before it.
      return { cursor, advanced, settledPrefixLength: settled, haltedBy: "blocked_record" };
    }
    // Composite keyset position of the last settled record. No -1ms fudge is
    // needed: the tie clause is strictly greater than this exact (ts, key).
    cursor = { mode: "keyset", timestamp: ts, listingKey: member.listingKey };
    advanced = true;
    settled++;
  }

  return { cursor, advanced, settledPrefixLength: settled, haltedBy: "end_of_page" };
}
