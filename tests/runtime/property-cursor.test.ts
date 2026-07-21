/**
 * Unified system — Phase 2, Task 7: oldest-first lossless keyset Property cursor.
 *
 * Kills the newest-500-skip. Records are processed oldest-first by
 * (ModificationTimestamp asc, ListingKey asc); the cursor advances ONLY to the
 * last contiguously-processed record, so a partial or failed run re-fetches the
 * unprocessed tail next time instead of skipping it. Pure — no network.
 */
import {
  buildPropertyQuery,
  advancePropertyCursor,
  type ProcessedRecord,
} from "@/lib/sync/property-cursor";

const rec = (ts: string, key: string, ok = true): ProcessedRecord => ({ ts, key, ok });

describe("buildPropertyQuery", () => {
  it("null cursor → oldest-first, no keyset filter (start from the beginning)", () => {
    const p = buildPropertyQuery({ ts: null, key: null }, 500);
    expect(p.get("$orderby")).toBe("ModificationTimestamp asc,ListingKey asc");
    expect(p.get("$top")).toBe("500");
    expect(p.has("$filter")).toBe(false);
  });

  it("with a cursor → keyset filter (gt ts) OR (eq ts AND ListingKey gt key)", () => {
    const p = buildPropertyQuery({ ts: "2026-07-01T00:00:00Z", key: "L100" }, 250);
    expect(p.get("$orderby")).toBe("ModificationTimestamp asc,ListingKey asc");
    expect(p.get("$top")).toBe("250");
    expect(p.get("$filter")).toBe(
      "(ModificationTimestamp gt 2026-07-01T00:00:00Z) or (ModificationTimestamp eq 2026-07-01T00:00:00Z and ListingKey gt 'L100')",
    );
  });

  it("single-quotes in the key are escaped in the filter", () => {
    const p = buildPropertyQuery({ ts: "2026-07-01T00:00:00Z", key: "L'X" }, 10);
    expect(p.get("$filter")).toContain("ListingKey gt 'L''X'");
  });
});

describe("advancePropertyCursor", () => {
  it(">500 backlog oldest-first advances only to the last processed record (tail re-fetched, not skipped)", () => {
    // A run with $top=500 processes records 1..500 (all ok) out of a 900 backlog.
    const processed: ProcessedRecord[] = Array.from({ length: 500 }, (_, i) =>
      rec(`2026-07-01T00:${String(i % 60).padStart(2, "0")}:00Z`, `L${String(i).padStart(4, "0")}`),
    );
    const next = advancePropertyCursor(processed);
    expect(next).toEqual({ ts: processed[499].ts, key: processed[499].key });

    // Next run keys off #500 → fetches 501+ (nothing skipped, nothing duplicated forward).
    const q = buildPropertyQuery({ ts: next!.ts, key: next!.key }, 500);
    expect(q.get("$filter")).toContain(`ListingKey gt '${processed[499].key}'`);
  });

  it("a mid-batch failure freezes the cursor at its predecessor", () => {
    const processed = [rec("t1", "L1"), rec("t2", "L2"), rec("t3", "L3", false), rec("t4", "L4")];
    expect(advancePropertyCursor(processed)).toEqual({ ts: "t2", key: "L2" });
  });

  it("a failure at the very first record → null (do not advance past unprocessed)", () => {
    const processed = [rec("t1", "L1", false), rec("t2", "L2")];
    expect(advancePropertyCursor(processed)).toBeNull();
  });

  it("empty run → null (cursor preserved by caller)", () => {
    expect(advancePropertyCursor([])).toBeNull();
  });

  // Live finding 2026-07-21: within a tied ModificationTimestamp block the server
  // does NOT order by the tiebreak key, so a `key gt` resume would SKIP rows.
  // The cursor must therefore never stop INSIDE a tie block that is not fully
  // processed — it backs off to the last fully-drained timestamp.
  it("does not advance into a partially-processed tied-timestamp block; backs off to the last fully-drained ts", () => {
    const processed = [
      rec("t1", "L1"), rec("t1", "L2"),
      rec("t2", "L3"), rec("t2", "L4"), rec("t2", "L5", false), // t2 group split (L5 not ok)
    ];
    // Naive contiguous-ok would stop at t2/L4 (mid-block). Correct: back off to t1/L2.
    expect(advancePropertyCursor(processed)).toEqual({ ts: "t1", key: "L2" });
  });

  it("advances to the last record when the final timestamp group is fully processed", () => {
    const processed = [rec("t1", "L1"), rec("t2", "L2"), rec("t2", "L3")];
    expect(advancePropertyCursor(processed)).toEqual({ ts: "t2", key: "L3" });
  });

  it("an entire ok-prefix that is one incomplete tie block → null (freeze, cannot safely advance)", () => {
    const processed = [rec("t1", "L1"), rec("t1", "L2"), rec("t1", "L3", false)];
    expect(advancePropertyCursor(processed)).toBeNull();
  });
});
