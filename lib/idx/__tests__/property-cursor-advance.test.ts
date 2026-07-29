/// <reference types="jest" />
/**
 * Phase 1A — contiguous settled-prefix cursor advancement.
 *
 * FREEZE vs STOP is the distinction that matters: an unbounded row (no usable
 * ListingKey, or a malformed stream clock) cannot be expressed as a keyset
 * position, so its stream must return to the PRE-RUN cursor even if earlier
 * records settled. An ordinary failure with valid cursor fields only stops the
 * walk, letting the earlier prefix advance.
 */

import { advanceStreamCursor, type RecordSettlement } from "@/lib/idx/property-cursor-advance";
import type { PropertyKeysetCursor } from "@/lib/idx/property-cursor";

const FIELD = "ModificationTimestamp" as const;
const PRE: PropertyKeysetCursor = { mode: "keyset", timestamp: "2026-07-01T00:00:00.000Z", listingKey: "K000" };

function scenario(rows: Array<{ key: string | null; ts?: string; settled: boolean }>, freeze: string | null = null) {
  const order = rows.map((r, i) => ({ listingKey: r.key, entryIndex: i }));
  const settlementByEntryIndex = new Map<number, RecordSettlement>(
    rows.map((r, i) => [i, r.settled ? "settled" : "blocked"] as const),
  );
  const recordByListingKey = new Map<string, Record<string, unknown>>();
  rows.forEach((r) => {
    if (r.key !== null) recordByListingKey.set(r.key, { ListingKey: r.key, [FIELD]: r.ts });
  });
  return advanceStreamCursor({
    field: FIELD, preRunCursor: PRE, order, settlementByEntryIndex, recordByListingKey, freezeReason: freeze,
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

it("stops BEFORE the first blocked record, keeping the earlier prefix", () => {
  const r = scenario([
    { key: "A", ts: "2026-07-02T00:00:00.000Z", settled: true },
    { key: "B", ts: "2026-07-03T00:00:00.000Z", settled: false },
    { key: "C", ts: "2026-07-04T00:00:00.000Z", settled: true }, // later success must NOT leapfrog
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
  // The 1,203-record collision case: the cursor must land on the last KEY, not
  // move past the shared timestamp.
  const ts = "2026-05-15T11:12:44.223Z";
  const r = scenario([
    { key: "1091329763", ts, settled: true },
    { key: "1091329951", ts, settled: true },
    { key: "1091329980", ts, settled: true },
  ]);
  expect(r.cursor).toEqual({ mode: "keyset", timestamp: ts, listingKey: "1091329980" });
});

it("FREEZES at the pre-run cursor even when earlier records settled", () => {
  const r = scenario(
    [
      { key: "A", ts: "2026-07-02T00:00:00.000Z", settled: true },
      { key: null, settled: false },
    ],
    "missing_listing_key",
  );
  expect(r.cursor).toEqual(PRE);          // NOT advanced to A
  expect(r.advanced).toBe(false);
  expect(r.haltedBy).toBe("freeze");
});

it("stops at a null-key member even without an explicit freeze reason", () => {
  const r = scenario([
    { key: "A", ts: "2026-07-02T00:00:00.000Z", settled: true },
    { key: null, settled: true },
  ]);
  expect(r.cursor).toEqual({ mode: "keyset", timestamp: "2026-07-02T00:00:00.000Z", listingKey: "A" });
  expect(r.haltedBy).toBe("blocked_record");
});

it("stops before a settled record whose stream clock is unusable", () => {
  const r = scenario([
    { key: "A", ts: "2026-07-02T00:00:00.000Z", settled: true },
    { key: "B", ts: "not-a-date", settled: true },
  ]);
  expect(r.cursor).toEqual({ mode: "keyset", timestamp: "2026-07-02T00:00:00.000Z", listingKey: "A" });
  expect(r.haltedBy).toBe("blocked_record");
});

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
    order: [{ listingKey: "A", entryIndex: 0 }],
    settlementByEntryIndex: new Map([[0, "settled"]]),
    recordByListingKey: new Map([["A", { [FIELD]: "2026-06-29T10:00:00.000Z" }]]),
    freezeReason: null,
  });
  expect(r.cursor).toEqual({ mode: "keyset", timestamp: "2026-06-29T10:00:00.000Z", listingKey: "A" });
});

it("a frozen BOOTSTRAP stream stays on the same pinned epoch (restart safety)", () => {
  const boot: PropertyKeysetCursor = { mode: "bootstrap", timestamp: "2026-06-28T23:59:59.999Z" };
  const r = advanceStreamCursor({
    field: FIELD,
    preRunCursor: boot,
    order: [{ listingKey: null, entryIndex: 0 }],
    settlementByEntryIndex: new Map([[0, "blocked"]]),
    recordByListingKey: new Map(),
    freezeReason: "missing_listing_key",
  });
  expect(r.cursor).toEqual(boot);
});
