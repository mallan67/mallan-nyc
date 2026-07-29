/// <reference types="jest" />
/**
 * Phase 1A — contiguous settled-prefix cursor advancement.
 *
 * Two invariants this suite exists to hold:
 *
 *  1. The cursor timestamp comes from the STREAM'S OWN returned row
 *     (`member.cursorTimestamp`), never from the merged database representation.
 *     A listing in both streams has one representation but two cursor positions.
 *
 *  2. FREEZE is INTRINSIC. An unbounded member anywhere in the page pins the
 *     stream at its pre-run cursor even when earlier records settled — this must
 *     not depend on the caller passing `freezeReason`. An earlier revision of
 *     this suite asserted the opposite (advancing the earlier prefix past a
 *     null-key member); those assertions were unsafe and are inverted here.
 */

import { advanceStreamCursor, type RecordSettlement } from "@/lib/idx/property-cursor-advance";
import type { PropertyKeysetCursor } from "@/lib/idx/property-cursor";

const FIELD = "ModificationTimestamp" as const;
const PRE: PropertyKeysetCursor = { mode: "keyset", timestamp: "2026-07-01T00:00:00.000Z", listingKey: "K000" };

function scenario(
  rows: Array<{ key: string | null; ts: string | null; settled: boolean }>,
  freezeReason: string | null = null,
) {
  return advanceStreamCursor({
    field: FIELD,
    preRunCursor: PRE,
    order: rows.map((r, i) => ({ listingKey: r.key, entryIndex: i, cursorTimestamp: r.ts })),
    settlementByEntryIndex: new Map<number, RecordSettlement>(
      rows.map((r, i) => [i, r.settled ? "settled" : "blocked"] as const),
    ),
    freezeReason,
  });
}

it("advances to the LAST record when the whole page settles", () => {
  const r = scenario([
    { key: "A", ts: "2026-07-02T00:00:00.000Z", settled: true },
    { key: "B", ts: "2026-07-03T00:00:00.000Z", settled: true },
    { key: "C", ts: "2026-07-04T00:00:00.000Z", settled: true },
  ]);
  expect(r.cursor).toEqual({ mode: "keyset", timestamp: "2026-07-04T00:00:00.000Z", listingKey: "C" });
  expect(r.settledPrefixLength).toBe(3);
  expect(r.haltedBy).toBe("end_of_page");
});

it("stops BEFORE the first blocked record; a later success never leapfrogs it", () => {
  const r = scenario([
    { key: "A", ts: "2026-07-02T00:00:00.000Z", settled: true },
    { key: "B", ts: "2026-07-03T00:00:00.000Z", settled: false },
    { key: "C", ts: "2026-07-04T00:00:00.000Z", settled: true },
  ]);
  expect(r.cursor).toEqual({ mode: "keyset", timestamp: "2026-07-02T00:00:00.000Z", listingKey: "A" });
  expect(r.settledPrefixLength).toBe(1);
  expect(r.haltedBy).toBe("blocked_record");
});

it("does not advance at all when the FIRST record is blocked", () => {
  const r = scenario([
    { key: "A", ts: "2026-07-02T00:00:00.000Z", settled: false },
    { key: "B", ts: "2026-07-03T00:00:00.000Z", settled: true },
  ]);
  expect(r.cursor).toEqual(PRE);
  expect(r.advanced).toBe(false);
});

it("uses the exact (timestamp, ListingKey) with NO 1ms subtraction", () => {
  const r = scenario([{ key: "A", ts: "2026-07-02T00:00:00.000Z", settled: true }]);
  expect(r.cursor).toEqual({ mode: "keyset", timestamp: "2026-07-02T00:00:00.000Z", listingKey: "A" });
});

it("advances through many records sharing ONE timestamp via the tie key", () => {
  // The 1,203-record collision: land on the last KEY, not past the timestamp.
  const ts = "2026-05-15T11:12:44.223Z";
  const r = scenario([
    { key: "1091329763", ts, settled: true },
    { key: "1091329951", ts, settled: true },
    { key: "1091329980", ts, settled: true },
  ]);
  expect(r.cursor).toEqual({ mode: "keyset", timestamp: ts, listingKey: "1091329980" });
});

it("normalises a non-canonical offset to UTC", () => {
  const r = scenario([{ key: "A", ts: "2026-05-15T11:12:44.223-00:00", settled: true }]);
  expect(r.cursor).toEqual({ mode: "keyset", timestamp: "2026-05-15T11:12:44.223Z", listingKey: "A" });
});

// ── Intrinsic freeze — the caller cannot switch it off ────────────────────

it("a null-key member FREEZES the stream even with freezeReason omitted", () => {
  const r = advanceStreamCursor({
    field: FIELD,
    preRunCursor: PRE,
    order: [
      { listingKey: "A", entryIndex: 0, cursorTimestamp: "2026-07-02T00:00:00.000Z" },
      { listingKey: null, entryIndex: 1, cursorTimestamp: null },
    ],
    settlementByEntryIndex: new Map<number, RecordSettlement>([[0, "settled"], [1, "blocked"]]),
    // freezeReason deliberately NOT passed — safety must not depend on it.
  });
  expect(r.cursor).toEqual(PRE);
  expect(r.advanced).toBe(false);
  expect(r.haltedBy).toBe("freeze");
});

it("an empty/whitespace key FREEZES the stream", () => {
  for (const bad of ["", "   "]) {
    const r = scenario([
      { key: "A", ts: "2026-07-02T00:00:00.000Z", settled: true },
      { key: bad, ts: "2026-07-03T00:00:00.000Z", settled: true },
    ]);
    expect(r.cursor).toEqual(PRE);
    expect(r.haltedBy).toBe("freeze");
  }
});

it("a malformed member timestamp FREEZES the stream even with freezeReason omitted", () => {
  const r = advanceStreamCursor({
    field: FIELD,
    preRunCursor: PRE,
    order: [
      { listingKey: "A", entryIndex: 0, cursorTimestamp: "2026-07-02T00:00:00.000Z" },
      { listingKey: "B", entryIndex: 1, cursorTimestamp: "not-a-date" },
    ],
    settlementByEntryIndex: new Map<number, RecordSettlement>([[0, "settled"], [1, "settled"]]),
  });
  expect(r.cursor).toEqual(PRE);
  expect(r.haltedBy).toBe("freeze");
});

it("an unbounded member LAST in the page still freezes the whole stream", () => {
  const r = scenario([
    { key: "A", ts: "2026-07-02T00:00:00.000Z", settled: true },
    { key: "B", ts: "2026-07-03T00:00:00.000Z", settled: true },
    { key: null, ts: null, settled: true },
  ]);
  expect(r.cursor).toEqual(PRE);
  expect(r.haltedBy).toBe("freeze");
});

it("an explicit freezeReason still freezes (telemetry path preserved)", () => {
  const r = scenario([{ key: "A", ts: "2026-07-02T00:00:00.000Z", settled: true }], "duplicate_listing_key_in_stream");
  expect(r.cursor).toEqual(PRE);
  expect(r.haltedBy).toBe("freeze");
});

// ── Bootstrap + empty page ────────────────────────────────────────────────

it("an EMPTY page preserves the existing cursor exactly", () => {
  const r = scenario([]);
  expect(r.cursor).toEqual(PRE);
  expect(r.advanced).toBe(false);
  expect(r.haltedBy).toBe("empty_page");
});

it("promotes a BOOTSTRAP cursor to keyset once the first record settles", () => {
  const boot: PropertyKeysetCursor = { mode: "bootstrap", timestamp: "2026-06-28T23:59:59.999Z" };
  const r = advanceStreamCursor({
    field: FIELD,
    preRunCursor: boot,
    order: [{ listingKey: "A", entryIndex: 0, cursorTimestamp: "2026-06-29T10:00:00.000Z" }],
    settlementByEntryIndex: new Map<number, RecordSettlement>([[0, "settled"]]),
  });
  expect(r.cursor).toEqual({ mode: "keyset", timestamp: "2026-06-29T10:00:00.000Z", listingKey: "A" });
});

it("a frozen BOOTSTRAP stream stays on the same pinned epoch (restart safety)", () => {
  const boot: PropertyKeysetCursor = { mode: "bootstrap", timestamp: "2026-06-28T23:59:59.999Z" };
  const r = advanceStreamCursor({
    field: FIELD,
    preRunCursor: boot,
    order: [{ listingKey: null, entryIndex: 0, cursorTimestamp: null }],
    settlementByEntryIndex: new Map<number, RecordSettlement>([[0, "blocked"]]),
  });
  expect(r.cursor).toEqual(boot);
});

// ── The cursor never reads the merged representation ──────────────────────

it("advances on the STREAM'S OWN timestamp, not the processed representation's", () => {
  // The merged record for K1 might carry MT=Jul 9 (chosen from the PCT
  // response), but this stream's own row said MT=Jul 10. The cursor must use
  // Jul 10 or the next MT page would re-fetch it forever.
  const r = advanceStreamCursor({
    field: FIELD,
    preRunCursor: PRE,
    order: [{ listingKey: "K1", entryIndex: 0, cursorTimestamp: "2026-07-10T00:00:00.000Z" }],
    settlementByEntryIndex: new Map<number, RecordSettlement>([[0, "settled"]]),
  });
  expect(r.cursor).toEqual({ mode: "keyset", timestamp: "2026-07-10T00:00:00.000Z", listingKey: "K1" });
});
