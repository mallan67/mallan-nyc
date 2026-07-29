/**
 * Phase 1A — advance a stream cursor through its CONTIGUOUS SETTLED PREFIX.
 *
 * Each stream is an ascending keyset scan, so its cursor may move forward only
 * as far as the last record that fully settled, walking in returned order and
 * stopping at the first that did not. Anything at or beyond the stop point is
 * re-fetched next cycle; ascending order plus a composite cursor means nothing
 * can be skipped.
 *
 * THE CURSOR TIMESTAMP COMES FROM THE STREAM'S OWN ROW.
 * A listing returned by both streams has one database representation but two
 * cursor positions, and they can disagree (MT response says MT=Jul 10, PCT
 * response says MT=Jul 9). This helper therefore reads `member.cursorTimestamp`,
 * captured from that stream's own returned row, and never inspects the merged
 * representation.
 *
 * FREEZE IS INTRINSIC, NOT CALLER-SUPPLIED.
 * If ANY member of the stream is unbounded — no usable ListingKey, or no usable
 * own-stream timestamp — the stream returns to its PRE-RUN cursor even when
 * earlier records settled. An unbounded row has no keyset position, so advancing
 * past the earlier prefix would strand it behind a cursor it can never satisfy.
 * `freezeReason` remains only as bounded telemetry; safety does not depend on the
 * caller passing it correctly.
 */

import type { PropertyKeysetCursor, PropertyStreamField } from "@/lib/idx/property-cursor";

export type RecordSettlement = "settled" | "blocked";

export interface StreamAdvanceMember {
  listingKey: string | null;
  entryIndex: number;
  /** Canonical UTC timestamp from THIS stream's own returned row. */
  cursorTimestamp: string | null;
}

export interface StreamAdvanceInput {
  field: PropertyStreamField;
  /** The cursor this run started from — the floor a frozen stream returns to. */
  preRunCursor: PropertyKeysetCursor;
  order: ReadonlyArray<StreamAdvanceMember>;
  /** Settlement per merged entry index. Absent => treated as blocked. */
  settlementByEntryIndex: ReadonlyMap<number, RecordSettlement>;
  /** Bounded telemetry only. Enforcement is intrinsic. */
  freezeReason?: string | null;
}

export interface StreamAdvanceResult {
  cursor: PropertyKeysetCursor;
  advanced: boolean;
  settledPrefixLength: number;
  haltedBy: "freeze" | "blocked_record" | "end_of_page" | "empty_page";
}

function usableTimestamp(v: unknown): string | null {
  if (typeof v !== "string" || v.trim().length === 0) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) && !Number.isNaN(t) ? new Date(v).toISOString() : null;
}

function usableKey(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function advanceStreamCursor(input: StreamAdvanceInput): StreamAdvanceResult {
  const { field: _field, preRunCursor, order, settlementByEntryIndex, freezeReason } = input;
  void _field; // the stream's clock is already baked into member.cursorTimestamp

  if (order.length === 0) {
    return { cursor: preRunCursor, advanced: false, settledPrefixLength: 0, haltedBy: "empty_page" };
  }

  // INTRINSIC FREEZE — scan the whole page first. An unbounded member anywhere
  // pins the stream, regardless of what the caller passed as freezeReason.
  const hasUnbounded = order.some(
    (m) => !usableKey(m.listingKey) || usableTimestamp(m.cursorTimestamp) === null,
  );
  if (hasUnbounded || (freezeReason !== undefined && freezeReason !== null)) {
    return { cursor: preRunCursor, advanced: false, settledPrefixLength: 0, haltedBy: "freeze" };
  }

  let cursor = preRunCursor;
  let advanced = false;
  let settled = 0;

  for (const member of order) {
    if (settlementByEntryIndex.get(member.entryIndex) !== "settled") {
      return { cursor, advanced, settledPrefixLength: settled, haltedBy: "blocked_record" };
    }
    // Guaranteed non-null by the unbounded pre-scan above.
    const ts = usableTimestamp(member.cursorTimestamp) as string;
    // Composite keyset position of the last settled record. No -1ms fudge: the
    // tie clause is already strictly greater than this exact (ts, key).
    cursor = { mode: "keyset", timestamp: ts, listingKey: member.listingKey as string };
    advanced = true;
    settled++;
  }

  return { cursor, advanced, settledPrefixLength: settled, haltedBy: "end_of_page" };
}
