/// <reference types="jest" />
/**
 * Phase 1A — union/dedupe/conflict resolution across the MT and PCT streams.
 *
 * The two streams are SEPARATE requests, so a listing can change between them
 * and arrive twice with different payloads. Last-map-insertion-wins would
 * silently pick one at random, so disagreement is treated as a conflict:
 * nothing is written and both stream cursors are blocked at that listing.
 *
 * Separately, because Cotality's missing/empty-key filtering could not be
 * verified (`ListingKey eq ''` returns the full population), any row with a
 * missing/empty key or a malformed stream timestamp FREEZES its whole stream at
 * the pre-run cursor rather than advancing an earlier prefix past it.
 */

import { mergePropertyStreams } from "@/lib/idx/property-stream-merge";

const MT = "ModificationTimestamp";
const PCT = "PhotosChangeTimestamp";

function rec(key: string, mt: string, pct: string, over: Record<string, unknown> = {}) {
  return {
    ListingKey: key,
    ListingId: "RLS" + key,
    [MT]: mt,
    [PCT]: pct,
    StandardStatus: "Active",
    ListPrice: 750000,
    PublicRemarks: "A nice apartment.",
    ...over,
  };
}

const merge = (mtRows: Record<string, unknown>[], pctRows: Record<string, unknown>[]) =>
  mergePropertyStreams({ mt: mtRows, pct: pctRows });

describe("union and dedupe", () => {
  it("processes a listing returned by BOTH streams exactly once", () => {
    const r = rec("K1", "2026-07-01T00:00:00Z", "2026-07-01T00:00:00Z");
    const m = merge([r], [{ ...r }]);
    expect(m.entries.filter((e) => e.kind === "processable")).toHaveLength(1);
    const e = m.entries[0];
    if (e.kind !== "processable") throw new Error("x");
    expect(e.listingKey).toBe("K1");
    expect(e.streams.sort()).toEqual(["mt", "pct"]);
    expect(m.overlapCount).toBe(1);
  });

  it("keeps stream-only listings distinct and records membership per stream", () => {
    const a = rec("K1", "2026-07-01T00:00:00Z", "2026-05-01T00:00:00Z");
    const b = rec("K2", "2026-05-01T00:00:00Z", "2026-07-02T00:00:00Z");
    const m = merge([a], [b]);
    expect(m.entries).toHaveLength(2);
    expect(m.overlapCount).toBe(0);
    expect(m.order.mt.map((o) => o.listingKey)).toEqual(["K1"]);
    expect(m.order.pct.map((o) => o.listingKey)).toEqual(["K2"]);
  });

  it("preserves each stream's returned keyset order for cursor advancement", () => {
    const m = merge(
      [rec("A", "2026-07-01T00:00:00Z", "2026-01-01T00:00:00Z"),
       rec("B", "2026-07-02T00:00:00Z", "2026-01-01T00:00:00Z")],
      [rec("B", "2026-07-02T00:00:00Z", "2026-01-01T00:00:00Z"),
       rec("C", "2026-01-01T00:00:00Z", "2026-07-03T00:00:00Z")],
    );
    expect(m.order.mt.map((o) => o.listingKey)).toEqual(["A", "B"]);
    expect(m.order.pct.map((o) => o.listingKey)).toEqual(["B", "C"]);
  });
});

describe("duplicate equivalence", () => {
  it("treats CLOCK-ONLY differences as equivalent and processes once", () => {
    const base = rec("K1", "2026-07-01T00:00:00Z", "2026-07-01T00:00:00Z");
    const newer = rec("K1", "2026-07-05T00:00:00Z", "2026-07-06T00:00:00Z"); // clocks only
    const m = merge([base], [newer]);
    const e = m.entries[0];
    expect(e.kind).toBe("processable");
    if (e.kind !== "processable") throw new Error("x");
    // Deterministic choice: the representation with the latest valid source clock.
    expect(e.record[PCT]).toBe("2026-07-06T00:00:00Z");
  });

  it("selects the SAME representation regardless of stream argument order", () => {
    const older = rec("K1", "2026-07-01T00:00:00Z", "2026-07-01T00:00:00Z");
    const newer = rec("K1", "2026-07-05T00:00:00Z", "2026-07-06T00:00:00Z");
    const a = merge([older], [newer]);
    const b = merge([newer], [older]);
    const pick = (m: ReturnType<typeof merge>) => {
      const e = m.entries[0];
      if (e.kind !== "processable") throw new Error("expected processable");
      return JSON.stringify(e.record);
    };
    expect(pick(a)).toBe(pick(b));
  });

  it("flags a genuine CONTENT disagreement as a conflict and writes nothing", () => {
    const m = merge(
      [rec("K1", "2026-07-01T00:00:00Z", "2026-07-01T00:00:00Z", { ListPrice: 750000 })],
      [rec("K1", "2026-07-01T00:00:00Z", "2026-07-01T00:00:00Z", { ListPrice: 699000 })],
    );
    const e = m.entries[0];
    expect(e.kind).toBe("blocked");
    if (e.kind !== "blocked") throw new Error("x");
    expect(e.reason).toBe("cross_stream_payload_conflict");
    expect(e.streams.sort()).toEqual(["mt", "pct"]);
    expect(m.entries.filter((x) => x.kind === "processable")).toHaveLength(0);
  });

  it("reversing stream order yields the SAME conflict outcome", () => {
    const hi = rec("K1", "2026-07-01T00:00:00Z", "2026-07-01T00:00:00Z", { ListPrice: 750000 });
    const lo = rec("K1", "2026-07-01T00:00:00Z", "2026-07-01T00:00:00Z", { ListPrice: 699000 });
    for (const m of [merge([hi], [lo]), merge([lo], [hi])]) {
      const e = m.entries[0];
      expect(e.kind).toBe("blocked");
      if (e.kind !== "blocked") throw new Error("x");
      expect(e.reason).toBe("cross_stream_payload_conflict");
    }
  });
});

describe("unbounded rows FREEZE their stream", () => {
  it("a missing ListingKey freezes that stream and not the other", () => {
    const bad = rec("", "2026-07-01T00:00:00Z", "2026-07-01T00:00:00Z");
    delete (bad as Record<string, unknown>).ListingKey;
    const m = merge([bad], [rec("K2", "2026-01-01T00:00:00Z", "2026-07-02T00:00:00Z")]);
    expect(m.frozen.mt).toBe("missing_listing_key");
    expect(m.frozen.pct).toBeNull();
  });

  it("an EMPTY ListingKey also freezes the stream", () => {
    const m = merge([rec("", "2026-07-01T00:00:00Z", "2026-07-01T00:00:00Z")], []);
    expect(m.frozen.mt).toBe("missing_listing_key");
  });

  it("a malformed stream timestamp freezes the stream", () => {
    const m = merge([rec("K1", "not-a-date", "2026-07-01T00:00:00Z")], []);
    expect(m.frozen.mt).toBe("malformed_timestamp");
  });

  it("a malformed PCT does not freeze the MT stream (only its own clock matters)", () => {
    const m = merge([rec("K1", "2026-07-01T00:00:00Z", "not-a-date")], []);
    expect(m.frozen.mt).toBeNull();
  });

  it("freezing is reported WITHOUT emitting the raw record", () => {
    const m = merge([rec("", "2026-07-01T00:00:00Z", "2026-07-01T00:00:00Z")], []);
    const blocked = m.entries.filter((e) => e.kind === "blocked");
    expect(blocked.length).toBeGreaterThan(0);
    // The bounded reason is all that surfaces — no payload, no PII.
    expect(JSON.stringify(blocked)).not.toContain("PublicRemarks");
    expect(JSON.stringify(blocked)).not.toContain("750000");
  });
});

describe("empty streams", () => {
  it("produce no entries and freeze nothing", () => {
    const m = merge([], []);
    expect(m.entries).toEqual([]);
    expect(m.frozen.mt).toBeNull();
    expect(m.frozen.pct).toBeNull();
    expect(m.overlapCount).toBe(0);
  });
});
