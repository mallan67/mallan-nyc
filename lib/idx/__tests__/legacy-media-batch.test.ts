/// <reference types="jest" />
/**
 * Phase 1A — shared legacy batch-media completeness contract.
 *
 * Proves the twelve COMPLETE conditions and that every failure mode returns
 * `incomplete` with NO writable map, so a caller physically cannot consume a
 * partially accumulated page set.
 */

import {
  fetchLegacyMediaBatch,
  type LegacyMediaBatchResult,
  type LegacyMediaRequestedListing,
} from "@/lib/idx/legacy-media-batch";

const BASE = "https://api.cotality.com/trestle";
const classify = (c: string | null | undefined) => (String(c ?? "") === "FloorPlan" ? "FloorPlan" : "Photo");

function row(key: string, mediaKey: string, order: number, extra: Record<string, unknown> = {}) {
  return {
    ResourceRecordKey: key,
    MediaKey: mediaKey,
    MediaURL: `https://api.cotality.com/trestle/Media/${mediaKey}.jpg`,
    MediaCategory: "Photo",
    Order: order,
    PreferredPhotoYN: order === 0,
    MediaStatus: "Active",
    ...extra,
  };
}

/** Build a fetch stub from an ordered list of page responses. */
function pages(defs: Array<
  | { ok: true; value: unknown; count?: unknown; next?: string | null; bodyOverride?: string }
  | { ok: false; status: number }
  | { throws: "AbortError" | "Error" }
>) {
  let i = 0;
  return jest.fn(async () => {
    const d = defs[Math.min(i++, defs.length - 1)];
    if ("throws" in d) {
      const e = new Error("boom");
      e.name = d.throws;
      throw e;
    }
    if (!d.ok) return { ok: false, status: d.status, text: async () => "" } as unknown as Response;
    const body =
      d.bodyOverride ??
      JSON.stringify({
        "@odata.count": d.count,
        value: d.value,
        ...(d.next ? { "@odata.nextLink": d.next } : {}),
      });
    return { ok: true, status: 200, text: async () => body } as unknown as Response;
  }) as unknown as typeof fetch;
}

const REQ = (...specs: LegacyMediaRequestedListing[]) => specs;
const call = (requested: LegacyMediaRequestedListing[], fetchImpl: typeof fetch, over: Record<string, unknown> = {}) =>
  fetchLegacyMediaBatch({
    baseUrl: BASE, token: "t", requested, pageSize: 100,
    fetchImpl, classifyMediaType: classify, ...over,
  });

function expectIncomplete(r: LegacyMediaBatchResult, reason: string) {
  expect(r.outcome).toBe("incomplete");
  if (r.outcome !== "incomplete") throw new Error("unreachable");
  expect(r.reason).toBe(reason);
  // The whole point: no writable rows are reachable on any failure.
  expect((r as unknown as { mediaByListingId?: unknown }).mediaByListingId).toBeUndefined();
}

// ── COMPLETE paths ────────────────────────────────────────────────────────

it("one complete page returns every requested listing", async () => {
  const r = await call(
    REQ({ listingId: "L1", filterKey: "K1" }),
    pages([{ ok: true, count: 2, value: [row("K1", "m1", 0), row("K1", "m2", 1)] }]),
  );
  expect(r.outcome).toBe("complete");
  if (r.outcome !== "complete") throw new Error("x");
  expect(r.mediaByListingId.get("L1")).toHaveLength(2);
  expect(r.mediaByListingId.get("L1")![0].order).toBe(-1); // PreferredPhotoYN → hero
  expect(r.rowsFetched).toBe(2);
});

it("exhausts every nextLink across multiple pages", async () => {
  const r = await call(
    REQ({ listingId: "L1", filterKey: "K1" }),
    pages([
      { ok: true, count: 3, value: [row("K1", "m1", 1)], next: `${BASE}/odata/Media?p=2` },
      { ok: true, count: 3, value: [row("K1", "m2", 2)], next: `${BASE}/odata/Media?p=3` },
      { ok: true, count: 3, value: [row("K1", "m3", 3)] },
    ]),
  );
  expect(r.outcome).toBe("complete");
  if (r.outcome !== "complete") throw new Error("x");
  expect(r.pagesFetched).toBe(3);
  expect(r.mediaByListingId.get("L1")).toHaveLength(3);
});

it("allows a trailing EMPTY page (the $top=1 probe shape: 34 pages / 33 rows)", async () => {
  const r = await call(
    REQ({ listingId: "L1", filterKey: "K1" }),
    pages([
      { ok: true, count: 1, value: [row("K1", "m1", 1)], next: `${BASE}/odata/Media?p=2` },
      { ok: true, count: 1, value: [] },
    ]),
  );
  expect(r.outcome).toBe("complete");
});

it("a requested listing with ZERO returned rows is initialized to [] — the stale-gallery fix", async () => {
  const r = await call(
    REQ({ listingId: "L1", filterKey: "K1" }, { listingId: "L2", filterKey: "K2" }),
    pages([{ ok: true, count: 2, value: [row("K1", "m1", 1), row("K1", "m2", 2)] }]),
  );
  expect(r.outcome).toBe("complete");
  if (r.outcome !== "complete") throw new Error("x");
  expect(r.mediaByListingId.get("L1")).toHaveLength(2);
  expect(r.mediaByListingId.get("L2")).toEqual([]); // reconcilable, not absent
});

it("an authoritatively EMPTY batch yields [] for every requested listing", async () => {
  const r = await call(
    REQ({ listingId: "L1", filterKey: "K1" }, { listingId: "L2", filterKey: "K2" }),
    pages([{ ok: true, count: 0, value: [] }]),
  );
  expect(r.outcome).toBe("complete");
  if (r.outcome !== "complete") throw new Error("x");
  expect(r.mediaByListingId.get("L1")).toEqual([]);
  expect(r.mediaByListingId.get("L2")).toEqual([]);
});

it("resolves the ResourceRecordID fallback without weakening it", async () => {
  const r = await call(
    REQ({ listingId: "L1", filterKey: "KEY1", altKeys: ["RRID1"] }),
    pages([{ ok: true, count: 1, value: [{ ...row("", "m1", 1), ResourceRecordID: "RRID1" }] }]),
  );
  expect(r.outcome).toBe("complete");
  if (r.outcome !== "complete") throw new Error("x");
  expect(r.mediaByListingId.get("L1")).toHaveLength(1);
});

// ── INCOMPLETE paths — none may expose partial rows ───────────────────────

it("HTTP failure on the FIRST page is incomplete", async () => {
  expectIncomplete(await call(REQ({ listingId: "L1", filterKey: "K1" }), pages([{ ok: false, status: 500 }])), "http_error");
});

it("failure on a LATER page discards the valid first page", async () => {
  const r = await call(
    REQ({ listingId: "L1", filterKey: "K1" }),
    pages([
      { ok: true, count: 4, value: [row("K1", "m1", 1)], next: `${BASE}/odata/Media?p=2` },
      { ok: false, status: 503 },
    ]),
  );
  expectIncomplete(r, "http_error");
});

it("truncation cannot be labeled COMPLETE — accumulated rows must equal @odata.count", async () => {
  // No nextLink, but the server said there were 50 rows and we only saw 1.
  const r = await call(
    REQ({ listingId: "L1", filterKey: "K1" }),
    pages([{ ok: true, count: 50, value: [row("K1", "m1", 1)] }]),
  );
  expectIncomplete(r, "count_mismatch");
});

it("a missing @odata.count is incomplete (completeness is never inferred from nextLink absence)", async () => {
  expectIncomplete(
    await call(REQ({ listingId: "L1", filterKey: "K1" }), pages([{ ok: true, count: undefined, value: [row("K1", "m1", 1)] }])),
    "missing_count",
  );
});

it("a later page disagreeing about @odata.count is incomplete", async () => {
  const r = await call(
    REQ({ listingId: "L1", filterKey: "K1" }),
    pages([
      { ok: true, count: 2, value: [row("K1", "m1", 1)], next: `${BASE}/odata/Media?p=2` },
      { ok: true, count: 99, value: [row("K1", "m2", 2)] },
    ]),
  );
  expectIncomplete(r, "count_disagreement");
});

it("a non-array `value` is incomplete", async () => {
  expectIncomplete(
    await call(REQ({ listingId: "L1", filterKey: "K1" }), pages([{ ok: true, count: 1, value: { nope: true } }])),
    "malformed_response",
  );
});

it("an unparseable body is incomplete", async () => {
  expectIncomplete(
    await call(REQ({ listingId: "L1", filterKey: "K1" }), pages([{ ok: true, count: 1, value: [], bodyOverride: "<html>" }])),
    "malformed_response",
  );
});

it("an OFF-ORIGIN nextLink is incomplete", async () => {
  const r = await call(
    REQ({ listingId: "L1", filterKey: "K1" }),
    pages([{ ok: true, count: 2, value: [row("K1", "m1", 1)], next: "https://evil.example.com/odata/Media?p=2" }]),
  );
  expectIncomplete(r, "off_origin_next_link");
});

it("a malformed nextLink is incomplete", async () => {
  const r = await call(
    REQ({ listingId: "L1", filterKey: "K1" }),
    pages([{ ok: true, count: 2, value: [row("K1", "m1", 1)], next: "ht!tp://%%%" }]),
  );
  expectIncomplete(r, "malformed_next_link");
});

it("a pagination CYCLE is incomplete", async () => {
  let n = 0;
  const f = jest.fn(async () => {
    n++;
    return {
      ok: true, status: 200,
      text: async () => JSON.stringify({
        "@odata.count": 9,
        value: [row("K1", `m${n}`, n)],
        "@odata.nextLink": `${BASE}/odata/Media?p=2`, // always the same
      }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  expectIncomplete(await call(REQ({ listingId: "L1", filterKey: "K1" }), f), "pagination_cycle");
});

it("runaway pagination hits the page guard and is incomplete", async () => {
  let n = 0;
  const f = jest.fn(async () => {
    n++;
    return {
      ok: true, status: 200,
      text: async () => JSON.stringify({
        "@odata.count": 100000,
        value: [row("K1", `m${n}`, n)],
        "@odata.nextLink": `${BASE}/odata/Media?p=${n + 1}`, // always NEW → not a cycle
      }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  expectIncomplete(await call(REQ({ listingId: "L1", filterKey: "K1" }), f, { maxPages: 5 }), "pagination_limit");
});

it("a timeout is incomplete", async () => {
  expectIncomplete(await call(REQ({ listingId: "L1", filterKey: "K1" }), pages([{ throws: "AbortError" }])), "timeout");
});

it("a transport error is incomplete", async () => {
  expectIncomplete(await call(REQ({ listingId: "L1", filterKey: "K1" }), pages([{ throws: "Error" }])), "fetch_error");
});

it("a row for a key OUTSIDE the requested batch is incomplete", async () => {
  expectIncomplete(
    await call(REQ({ listingId: "L1", filterKey: "K1" }), pages([{ ok: true, count: 1, value: [row("K_UNKNOWN", "m1", 1)] }])),
    "unmapped_row",
  );
});

it("a row whose RRK and RRID resolve to DIFFERENT listings is incomplete", async () => {
  const r = await call(
    REQ({ listingId: "L1", filterKey: "K1" }, { listingId: "L2", filterKey: "K2" }),
    pages([{ ok: true, count: 1, value: [{ ...row("K1", "m1", 1), ResourceRecordID: "K2" }] }]),
  );
  expectIncomplete(r, "ambiguous_mapping");
});

it("two requested listings sharing an identity is incomplete before any fetch", async () => {
  const f = jest.fn() as unknown as typeof fetch;
  const r = await call(
    REQ({ listingId: "L1", filterKey: "SHARED" }, { listingId: "L2", filterKey: "SHARED" }),
    f,
  );
  expectIncomplete(r, "ambiguous_mapping");
  expect(f).not.toHaveBeenCalled();
});

it("a row with no MediaKey is incomplete", async () => {
  expectIncomplete(
    await call(REQ({ listingId: "L1", filterKey: "K1" }), pages([{ ok: true, count: 1, value: [{ ...row("K1", "", 1), MediaKey: "" }] }])),
    "missing_media_key",
  );
});

it("a repeated MediaKey is incomplete — identities are never silently deduplicated", async () => {
  const r = await call(
    REQ({ listingId: "L1", filterKey: "K1" }),
    pages([
      { ok: true, count: 2, value: [row("K1", "dup", 1)], next: `${BASE}/odata/Media?p=2` },
      { ok: true, count: 2, value: [row("K1", "dup", 2)] },
    ]),
  );
  expectIncomplete(r, "duplicate_media_key");
});

it("rows without a MediaURL still count toward @odata.count but produce no item", async () => {
  const r = await call(
    REQ({ listingId: "L1", filterKey: "K1" }),
    pages([{ ok: true, count: 2, value: [row("K1", "m1", 1), { ...row("K1", "m2", 2), MediaURL: null }] }]),
  );
  expect(r.outcome).toBe("complete");
  if (r.outcome !== "complete") throw new Error("x");
  expect(r.rowsFetched).toBe(2);
  expect(r.mediaByListingId.get("L1")).toHaveLength(1);
});
