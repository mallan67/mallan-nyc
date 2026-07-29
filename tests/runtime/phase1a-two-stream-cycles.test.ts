/// <reference types="jest" />
/**
 * Phase 1A — multi-cycle two-stream keyset drain.
 *
 * The fake Trestle here IMPLEMENTS keyset semantics over a corpus: it parses the
 * cursor out of the filter, applies `ts > cursor or (ts == cursor and key > tie)`,
 * sorts ascending by (clock, ListingKey) and truncates to the page budget. That
 * makes "drains without skipping" a proven property of the real production
 * queries rather than an assertion about a stubbed page.
 */

const mockFindUnique = jest.fn();
const mockUpsert = jest.fn();
const mockFindFirst = jest.fn();
const mockUpdateMany = jest.fn();
const mockProjFindUnique = jest.fn();
const mockProjUpsert = jest.fn();
const mockSyncStateUpsert = jest.fn();
const mockSyncStateFindUnique = jest.fn();
const mockAuditCreate = jest.fn();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    listing: {
      findUnique: (a: unknown) => mockFindUnique(a),
      upsert: (a: unknown) => mockUpsert(a),
      findFirst: (a: unknown) => mockFindFirst(a),
      updateMany: (a: unknown) => mockUpdateMany(a),
    },
    listingSearchProjection: {
      findUnique: (a: unknown) => mockProjFindUnique(a),
      upsert: (a: unknown) => mockProjUpsert(a),
    },
    syncState: {
      upsert: (a: unknown) => mockSyncStateUpsert(a),
      findUnique: (a: unknown) => mockSyncStateFindUnique(a),
    },
    auditEvent: { create: (a: unknown) => mockAuditCreate(a) },
  },
}));

const mockFetchFromTrestle = jest.fn();
jest.mock("@/lib/idx/fetch", () => ({
  __esModule: true,
  fetchFromTrestle: (a: unknown) => mockFetchFromTrestle(a),
  buildIncrementalFilter: () => "legacy",
  buildActiveFilter: () => "active",
  buildAgentHistoricalFilter: () => "agent",
}));

jest.mock("@/lib/idx/auth", () => ({
  __esModule: true,
  getAccessToken: async () => "mock-token",
  hasCredentials: () => true,
}));

import { syncListings, MT_LIMIT, PCT_LIMIT } from "@/lib/idx/sync";
import {
  bootstrapCursorState,
  parsePropertyCursorNotes,
  PROPERTY_CURSOR_BOOTSTRAP_EPOCH,
  type PropertyCursorState,
} from "@/lib/idx/property-cursor";

// ── Corpus ────────────────────────────────────────────────────────────────

interface Row { ListingKey: string; mt: string; pct: string }

function record(r: Row): Record<string, unknown> {
  return {
    ListingKey: r.ListingKey,
    ListingId: "RLS" + r.ListingKey,
    PropertyType: "Residential",
    PropertySubType: "Condominium",
    ListPrice: 750000,
    StandardStatus: "Active",
    StreetNumber: "400",
    StreetName: "East 90th Street",
    City: "New York",
    StateOrProvince: "NY",
    PostalCode: "10128",
    ListAgentMlsId: "AG001",
    ListAgentFullName: "Test Agent",
    ListOfficeName: "Test Office LLC",
    ModificationTimestamp: r.mt,
    PhotosChangeTimestamp: r.pct,
    InternetEntireListingDisplayYN: true,
    InternetAddressDisplayYN: true,
    Media: [],
  };
}

/** Parse `<Field> gt <ts>` and an optional `ListingKey gt '<key>'` tie. */
function parseCursorFromFilter(filter: string, field: string) {
  const gt = new RegExp(`${field} gt ([^\\s)]+)`).exec(filter);
  const tie = /ListingKey gt '([^']*)'/.exec(filter);
  return { ts: gt ? gt[1] : null, key: tie ? tie[1] : null };
}

/** A Trestle stand-in that honours the keyset contract. */
function wireTrestle(corpus: Row[], requestLog: Record<string, unknown>[] = []) {
  mockFetchFromTrestle.mockImplementation(async (opts: Record<string, unknown>) => {
    requestLog.push(opts);
    const orderby = String(opts.orderby ?? "");
    const filter = String(opts.filter ?? "");
    const isMt = orderby.startsWith("ModificationTimestamp");
    const field = isMt ? "ModificationTimestamp" : "PhotosChangeTimestamp";
    const clock = (r: Row) => (isMt ? r.mt : r.pct);
    const { ts, key } = parseCursorFromFilter(filter, field);
    const cutoff = ts ? new Date(ts).getTime() : Number.NEGATIVE_INFINITY;

    const eligible = corpus.filter((r) => {
      const t = new Date(clock(r)).getTime();
      if (t > cutoff) return true;
      if (key !== null && t === cutoff) return r.ListingKey > key;
      return false;
    });
    eligible.sort((a, b) => {
      const d = new Date(clock(a)).getTime() - new Date(clock(b)).getTime();
      return d !== 0 ? d : a.ListingKey < b.ListingKey ? -1 : a.ListingKey > b.ListingKey ? 1 : 0;
    });
    const page = eligible.slice(0, Number(opts.maxTotal ?? 250));
    return { records: page.map(record), totalFetched: page.length };
  });
}

/** Every listing is brand new, so every record inserts and settles. */
function wireDbAllNew() {
  mockFindUnique.mockResolvedValue(null);
  mockUpsert.mockResolvedValue({});
  mockProjFindUnique.mockResolvedValue(null);
  mockProjUpsert.mockResolvedValue({});
  mockFindFirst.mockResolvedValue(null);
  mockUpdateMany.mockResolvedValue({ count: 1 });
  mockSyncStateUpsert.mockResolvedValue({});
  mockSyncStateFindUnique.mockResolvedValue(null);
  mockAuditCreate.mockResolvedValue({});
  // No legacy media work: every record carries Media: [] and the media endpoint
  // returns an authoritative empty collection.
  global.fetch = jest.fn(async () => ({
    ok: true, status: 200, text: async () => JSON.stringify({ "@odata.count": 0, value: [] }),
  })) as unknown as typeof fetch;
}

/** Read the cursor state syncListings persisted this run. */
function persistedCursor(): PropertyCursorState | null {
  const calls = mockSyncStateUpsert.mock.calls;
  if (calls.length === 0) return null;
  const args = calls[calls.length - 1][0] as { update: { notes?: string } };
  return args.update.notes ? parsePropertyCursorNotes(JSON.parse(args.update.notes)) : null;
}

/** Run N cycles, threading persisted cursor state between them. */
async function runCycles(n: number, start?: PropertyCursorState) {
  let cursor = start ?? bootstrapCursorState();
  const processed: string[][] = [];
  for (let i = 0; i < n; i++) {
    mockUpsert.mockClear();
    mockSyncStateUpsert.mockClear();
    await syncListings({ cursorState: cursor, maxRecords: 500 });
    processed.push(
      mockUpsert.mock.calls.map((c) => (c[0] as { where: { listing_id: string } }).where.listing_id),
    );
    cursor = persistedCursor() ?? cursor;
  }
  return { processed, cursor };
}

beforeEach(() => {
  jest.clearAllMocks();
  wireDbAllNew();
});

// ── Request shape ─────────────────────────────────────────────────────────

it("issues exactly two requests with top AND maxTotal both 250", async () => {
  const log: Record<string, unknown>[] = [];
  wireTrestle([{ ListingKey: "K1", mt: "2026-07-01T00:00:00Z", pct: "2026-07-01T00:00:00Z" }], log);

  await syncListings({ cursorState: bootstrapCursorState(), maxRecords: 500 });

  expect(log).toHaveLength(2);
  const mtReq = log.find((r) => String(r.orderby).startsWith("ModificationTimestamp"))!;
  const pctReq = log.find((r) => String(r.orderby).startsWith("PhotosChangeTimestamp"))!;
  expect(mtReq.top).toBe(250);
  expect(mtReq.maxTotal).toBe(250);
  expect(pctReq.top).toBe(250);
  expect(pctReq.maxTotal).toBe(250);
  expect(MT_LIMIT).toBe(250);
  expect(PCT_LIMIT).toBe(250);
});

it("the BOOTSTRAP query contains no empty-key tie clause", async () => {
  const log: Record<string, unknown>[] = [];
  wireTrestle([], log);
  await syncListings({ cursorState: bootstrapCursorState(), maxRecords: 500 });
  for (const r of log) {
    expect(String(r.filter)).not.toContain("ListingKey gt ''");
    expect(String(r.filter)).toContain(PROPERTY_CURSOR_BOOTSTRAP_EPOCH);
  }
});

// ── Drain without skip ────────────────────────────────────────────────────

it("drains a multi-page MT backlog across cycles with no skips and no repeats", async () => {
  // 600 records > 250 page budget -> at least 3 cycles.
  const corpus: Row[] = Array.from({ length: 600 }, (_, i) => ({
    ListingKey: `K${String(i).padStart(4, "0")}`,
    mt: new Date(Date.parse("2026-06-29T00:00:00Z") + i * 60_000).toISOString(),
    pct: "2026-01-01T00:00:00Z", // outside the PCT stream
  }));
  wireTrestle(corpus);

  const { processed } = await runCycles(4);
  const all = processed.flat();
  expect(new Set(all).size).toBe(600);           // every record reached
  expect(all.length).toBe(new Set(all).size);    // none processed twice
});

it("drains >250 records sharing ONE timestamp via the ListingKey tie-breaker", async () => {
  // The production 1,203-collision shape, scaled down but still over one page.
  const ts = "2026-05-15T11:12:44.223Z";
  const corpus: Row[] = Array.from({ length: 300 }, (_, i) => ({
    ListingKey: `C${String(i).padStart(4, "0")}`,
    mt: "2026-07-01T00:00:00Z",
    pct: ts,
  }));
  wireTrestle(corpus);

  const { processed } = await runCycles(3);
  const all = processed.flat();
  expect(new Set(all).size).toBe(300); // a timestamp-only cursor would strand 50+
});

it("reaches a PCT-only listing whose ModificationTimestamp is old", async () => {
  // Exactly the production cohort: MT far in the past, PCT recent. Under the old
  // MT-desc + 500-cap query this record sorted past the cap and was never seen.
  const corpus: Row[] = [
    ...Array.from({ length: 260 }, (_, i) => ({
      ListingKey: `N${String(i).padStart(4, "0")}`,
      mt: new Date(Date.parse("2026-07-01T00:00:00Z") + i * 60_000).toISOString(),
      pct: "2026-01-01T00:00:00Z",
    })),
    { ListingKey: "PCTONLY", mt: "2026-05-15T11:12:44.223Z", pct: "2026-07-25T00:00:00Z" },
  ];
  wireTrestle(corpus);

  const { processed } = await runCycles(3);
  expect(processed.flat()).toContain("RLSPCTONLY");
});

it("processes a listing in BOTH streams exactly once per cycle", async () => {
  wireTrestle([{ ListingKey: "DUP", mt: "2026-07-01T00:00:00Z", pct: "2026-07-01T00:00:00Z" }]);
  const { processed } = await runCycles(1);
  expect(processed[0].filter((id) => id === "RLSDUP")).toHaveLength(1);
});

it("eventually reaches records that ARRIVE while a backlog is draining", async () => {
  const corpus: Row[] = Array.from({ length: 300 }, (_, i) => ({
    ListingKey: `B${String(i).padStart(4, "0")}`,
    mt: new Date(Date.parse("2026-06-29T00:00:00Z") + i * 60_000).toISOString(),
    pct: "2026-01-01T00:00:00Z",
  }));
  wireTrestle(corpus);

  let cursor = bootstrapCursorState();
  mockSyncStateUpsert.mockClear();
  await syncListings({ cursorState: cursor, maxRecords: 500 });
  cursor = persistedCursor()!;

  // A brand-new record lands mid-drain, NEWER than anything so far.
  corpus.push({ ListingKey: "LATE", mt: "2026-07-30T00:00:00Z", pct: "2026-01-01T00:00:00Z" });

  const { processed } = await runCycles(3, cursor);
  expect(processed.flat()).toContain("RLSLATE");
});

// ── Cursor state ──────────────────────────────────────────────────────────

it("an EMPTY stream preserves its cursor exactly", async () => {
  wireTrestle([]);
  const start = bootstrapCursorState();
  mockSyncStateUpsert.mockClear();
  await syncListings({ cursorState: start, maxRecords: 500 });
  const after = persistedCursor();
  expect(after!.mt).toEqual(start.mt);
  expect(after!.pct).toEqual(start.pct);
});

it("cursor state survives a simulated process restart byte-for-byte", async () => {
  wireTrestle([{ ListingKey: "K1", mt: "2026-07-01T00:00:00Z", pct: "2026-07-02T00:00:00Z" }]);
  mockSyncStateUpsert.mockClear();
  await syncListings({ cursorState: bootstrapCursorState(), maxRecords: 500 });

  const args = mockSyncStateUpsert.mock.calls[0][0] as { update: { notes: string } };
  // Restart = the string is all that survives.
  const revived = parsePropertyCursorNotes(JSON.parse(args.update.notes));
  expect(revived!.mt).toEqual({ mode: "keyset", timestamp: "2026-07-01T00:00:00.000Z", listingKey: "K1" });
  expect(revived!.pct).toEqual({ mode: "keyset", timestamp: "2026-07-02T00:00:00.000Z", listingKey: "K1" });
});

it("keeps the BOOTSTRAP basis while a full page is still draining", async () => {
  const corpus: Row[] = Array.from({ length: 400 }, (_, i) => ({
    ListingKey: `F${String(i).padStart(4, "0")}`,
    mt: new Date(Date.parse("2026-06-29T00:00:00Z") + i * 60_000).toISOString(),
    pct: "2026-01-01T00:00:00Z",
  }));
  wireTrestle(corpus);
  mockSyncStateUpsert.mockClear();
  await syncListings({ cursorState: bootstrapCursorState(), maxRecords: 500 });
  // A FULL 250-row page is not evidence of the live edge.
  expect(persistedCursor()!.basis).toBe("mt_pct_keyset_bootstrap_v1");
});

it("promotes to the LIVE basis only once both streams return a SHORT page", async () => {
  wireTrestle([{ ListingKey: "K1", mt: "2026-07-01T00:00:00Z", pct: "2026-07-02T00:00:00Z" }]);
  mockSyncStateUpsert.mockClear();
  await syncListings({ cursorState: bootstrapCursorState(), maxRecords: 500 });
  expect(persistedCursor()!.basis).toBe("mt_pct_keyset_v1");
});

it("preserves manifest_warmed_shards when writing cursor state", async () => {
  wireTrestle([{ ListingKey: "K1", mt: "2026-07-01T00:00:00Z", pct: "2026-07-02T00:00:00Z" }]);
  mockSyncStateFindUnique.mockResolvedValue({
    notes: JSON.stringify({ manifest_warmed_shards: ["4", "7"] }),
  });
  mockSyncStateUpsert.mockClear();
  await syncListings({ cursorState: bootstrapCursorState(), maxRecords: 500 });
  const args = mockSyncStateUpsert.mock.calls[0][0] as { update: { notes: string } };
  const notes = JSON.parse(args.update.notes) as Record<string, unknown>;
  expect(notes.property_cursors).toBeDefined();
  expect(notes).toHaveProperty("manifest_warmed_shards");
});

// ── forceFull isolation ───────────────────────────────────────────────────

it("an explicit forceFull does NOT advance or overwrite the cursors", async () => {
  wireTrestle([{ ListingKey: "K1", mt: "2026-07-01T00:00:00Z", pct: "2026-07-02T00:00:00Z" }]);
  const stored = {
    manifest_warmed_shards: ["4"],
    property_cursor_basis: "mt_pct_keyset_v1",
    property_cursors: {
      mt: { timestamp: "2026-07-10T00:00:00.000Z", listingKey: "KEEPMT" },
      pct: { timestamp: "2026-07-11T00:00:00.000Z", listingKey: "KEEPPCT" },
    },
  };
  mockSyncStateFindUnique.mockResolvedValue({ notes: JSON.stringify(stored) });
  mockSyncStateUpsert.mockClear();

  await syncListings({ fullSync: true, maxRecords: 500 });

  const args = mockSyncStateUpsert.mock.calls[0][0] as { update: { notes: string } };
  const after = parsePropertyCursorNotes(JSON.parse(args.update.notes));
  expect(after!.mt).toEqual({ mode: "keyset", timestamp: "2026-07-10T00:00:00.000Z", listingKey: "KEEPMT" });
  expect(after!.pct).toEqual({ mode: "keyset", timestamp: "2026-07-11T00:00:00.000Z", listingKey: "KEEPPCT" });
});

// ── Status is derived LAST ────────────────────────────────────────────────

describe("failures discovered during cursor settlement still reach run_status", () => {
  it("a cross-stream payload conflict is the ONLY failure -> errors 0, status partial", async () => {
    // Same key, materially different price, one per stream.
    mockFetchFromTrestle.mockImplementation(async (opts: Record<string, unknown>) => {
      const isMt = String(opts.orderby).startsWith("ModificationTimestamp");
      const r = record({ ListingKey: "CONFLICT", mt: "2026-07-01T00:00:00Z", pct: "2026-07-01T00:00:00Z" });
      r.ListPrice = isMt ? 750000 : 699000;
      return { records: [r], totalFetched: 1 };
    });

    const res = await syncListings({ cursorState: bootstrapCursorState(), maxRecords: 500 });

    expect(res.errors).toBe(0);
    expect(res.run_status).toBe("partial"); // was "ok" before the ordering fix
    expect(mockUpsert).not.toHaveBeenCalled(); // conflict writes nothing
    expect(res.property_streams?.blocked_reasons.cross_stream_payload_conflict).toBe(1);
  });

  it("a blocked entry on a SHORT page keeps the bootstrap basis", async () => {
    mockFetchFromTrestle.mockImplementation(async (opts: Record<string, unknown>) => {
      const isMt = String(opts.orderby).startsWith("ModificationTimestamp");
      const r = record({ ListingKey: "CONFLICT", mt: "2026-07-01T00:00:00Z", pct: "2026-07-01T00:00:00Z" });
      r.ListPrice = isMt ? 750000 : 699000;
      return { records: [r], totalFetched: 1 };
    });
    mockSyncStateUpsert.mockClear();

    await syncListings({ cursorState: bootstrapCursorState(), maxRecords: 500 });

    // Short pages, but the cursor is parked before an unresolved listing.
    expect(persistedCursor()!.basis).toBe("mt_pct_keyset_bootstrap_v1");
  });
});

// ── Cursor persistence is load-bearing ────────────────────────────────────

describe("failing to persist cursor state is never a successful run", () => {
  it("reports partial and property_cursor_persisted false", async () => {
    wireTrestle([{ ListingKey: "K1", mt: "2026-07-01T00:00:00Z", pct: "2026-07-02T00:00:00Z" }]);
    mockSyncStateUpsert.mockRejectedValue(new Error("connection reset"));

    const res = await syncListings({ cursorState: bootstrapCursorState(), maxRecords: 500 });

    expect(res.run_status).toBe("partial"); // NOT ok — cursors did not advance durably
    expect(res.property_cursor_persisted).toBe(false);
  });

  it("reports property_cursor_persisted true on a clean run", async () => {
    wireTrestle([{ ListingKey: "K1", mt: "2026-07-01T00:00:00Z", pct: "2026-07-02T00:00:00Z" }]);
    const res = await syncListings({ cursorState: bootstrapCursorState(), maxRecords: 500 });
    expect(res.property_cursor_persisted).toBe(true);
    expect(res.run_status).toBe("ok");
  });
});

// ── Independent stream fetch failure ──────────────────────────────────────

describe("one stream failing does not kill the other", () => {
  const corpus: Row[] = [
    { ListingKey: "MTONLY", mt: "2026-07-01T00:00:00Z", pct: "2026-01-01T00:00:00Z" },
    { ListingKey: "PCTONLY", mt: "2026-01-01T00:00:00Z", pct: "2026-07-02T00:00:00Z" },
  ];

  function wireWithFailure(failing: "mt" | "pct" | "both") {
    mockFetchFromTrestle.mockImplementation(async (opts: Record<string, unknown>) => {
      const isMt = String(opts.orderby).startsWith("ModificationTimestamp");
      const stream = isMt ? "mt" : "pct";
      if (failing === "both" || failing === stream) throw new Error(`${stream} upstream 503`);
      const row = corpus.find((r) => (isMt ? r.ListingKey === "MTONLY" : r.ListingKey === "PCTONLY"))!;
      return { records: [record(row)], totalFetched: 1 };
    });
  }

  it("MT fails, PCT still processes and advances", async () => {
    wireWithFailure("mt");
    const start = bootstrapCursorState();
    mockSyncStateUpsert.mockClear();
    const res = await syncListings({ cursorState: start, maxRecords: 500 });

    expect(res.run_status).toBe("partial");
    expect(res.errors).toBe(0);
    expect(res.property_streams?.mt_fetch_failed).toBe(true);
    expect(res.property_streams?.mt_at_live_edge).toBe(false); // never "live" on failure
    const after = persistedCursor()!;
    expect(after.mt).toEqual(start.mt);          // byte-identical pre-run cursor
    expect(after.pct).toEqual({ mode: "keyset", timestamp: "2026-07-02T00:00:00.000Z", listingKey: "PCTONLY" });
  });

  it("PCT fails, MT still processes and advances", async () => {
    wireWithFailure("pct");
    const start = bootstrapCursorState();
    mockSyncStateUpsert.mockClear();
    const res = await syncListings({ cursorState: start, maxRecords: 500 });

    expect(res.run_status).toBe("partial");
    expect(res.property_streams?.pct_fetch_failed).toBe(true);
    const after = persistedCursor()!;
    expect(after.pct).toEqual(start.pct);
    expect(after.mt).toEqual({ mode: "keyset", timestamp: "2026-07-01T00:00:00.000Z", listingKey: "MTONLY" });
  });

  it("BOTH streams failing is a hard error — no Property work happened", async () => {
    wireWithFailure("both");
    const start = bootstrapCursorState();
    mockSyncStateUpsert.mockClear();
    const res = await syncListings({ cursorState: start, maxRecords: 500 });

    expect(res.errors).toBeGreaterThan(0);
    expect(res.run_status).toBe("error");
    const after = persistedCursor();
    if (after) {
      expect(after.mt).toEqual(start.mt);
      expect(after.pct).toEqual(start.pct);
    }
  });
});

// ── Notes preservation fails closed ───────────────────────────────────────

it("forceFull OMITS notes when the prior notes cannot be read, so cursors survive", async () => {
  wireTrestle([{ ListingKey: "K1", mt: "2026-07-01T00:00:00Z", pct: "2026-07-02T00:00:00Z" }]);
  mockSyncStateFindUnique.mockRejectedValue(new Error("read timeout"));
  mockSyncStateUpsert.mockClear();

  const res = await syncListings({ fullSync: true, maxRecords: 500 });

  const args = mockSyncStateUpsert.mock.calls[0][0] as { update: Record<string, unknown> };
  // Writing ANY notes value here could erase cursor state we merely failed to read.
  expect(args.update).not.toHaveProperty("notes");
  expect(res.run_status).toBe("partial");
});

it("forceFull with MALFORMED stored notes also omits notes", async () => {
  wireTrestle([{ ListingKey: "K1", mt: "2026-07-01T00:00:00Z", pct: "2026-07-02T00:00:00Z" }]);
  mockSyncStateFindUnique.mockResolvedValue({ notes: "{not json" });
  mockSyncStateUpsert.mockClear();

  await syncListings({ fullSync: true, maxRecords: 500 });

  const args = mockSyncStateUpsert.mock.calls[0][0] as { update: Record<string, unknown> };
  expect(args.update).not.toHaveProperty("notes");
});

// ── The DURABLE audit must agree with the returned status ─────────────────

function idxSyncAudit(): Record<string, unknown> | undefined {
  const call = mockAuditCreate.mock.calls
    .map((c) => c[0] as { data: { action: string; changes: Record<string, unknown> } })
    .find((c) => c.data.action === "idx_sync");
  return call?.data.changes;
}

describe("cursor-persistence failure is recorded consistently everywhere", () => {
  it("a rejected syncState.upsert leaves the DURABLE audit partial, not ok", async () => {
    wireTrestle([{ ListingKey: "K1", mt: "2026-07-01T00:00:00Z", pct: "2026-07-02T00:00:00Z" }]);
    mockSyncStateUpsert.mockRejectedValue(new Error("connection reset"));

    const res = await syncListings({ cursorState: bootstrapCursorState(), maxRecords: 500 });

    expect(res.run_status).toBe("partial");
    expect(res.property_cursor_persisted).toBe(false);
    const audit = idxSyncAudit();
    expect(audit).toBeDefined();
    // Previously the audit was written BEFORE the final derivation and could
    // record run_status "ok" next to property_cursor_persisted false.
    expect(audit!.run_status).toBe("partial");
    expect(audit!.property_cursor_persisted).toBe(false);
  });
});

// ── Unreadable prior notes in a TWO-STREAM run ────────────────────────────

describe("two-stream runs never claim persistence without a cursor payload", () => {
  it("a throwing notes read omits notes and reports NOT persisted", async () => {
    wireTrestle([{ ListingKey: "K1", mt: "2026-07-01T00:00:00Z", pct: "2026-07-02T00:00:00Z" }]);
    mockSyncStateFindUnique.mockRejectedValue(new Error("read timeout"));
    mockSyncStateUpsert.mockClear();

    const res = await syncListings({ cursorState: bootstrapCursorState(), maxRecords: 500 });

    const args = mockSyncStateUpsert.mock.calls[0][0] as { update: Record<string, unknown> };
    expect(args.update).not.toHaveProperty("notes"); // no cursor payload written
    // The ROW write succeeded — but no cursor state went with it.
    expect(res.property_cursor_persisted).toBe(false);
    expect(res.run_status).toBe("partial");
    expect(idxSyncAudit()!.property_cursor_persisted).toBe(false);
    expect(idxSyncAudit()!.run_status).toBe("partial");
  });

  it("MALFORMED stored notes behave identically", async () => {
    wireTrestle([{ ListingKey: "K1", mt: "2026-07-01T00:00:00Z", pct: "2026-07-02T00:00:00Z" }]);
    mockSyncStateFindUnique.mockResolvedValue({ notes: "{not json" });
    mockSyncStateUpsert.mockClear();

    const res = await syncListings({ cursorState: bootstrapCursorState(), maxRecords: 500 });

    const args = mockSyncStateUpsert.mock.calls[0][0] as { update: Record<string, unknown> };
    expect(args.update).not.toHaveProperty("notes");
    expect(res.property_cursor_persisted).toBe(false);
    expect(res.run_status).toBe("partial");
  });

  it("does not recover by re-reading: a persistently failing notes read stays not-persisted", async () => {
    // syncListings makes several syncState.findUnique calls (the canary reads it
    // too), so "the first call" is not necessarily the cursor read. What matters
    // is that a notes read which ALWAYS fails never yields a persisted cursor.
    wireTrestle([{ ListingKey: "K1", mt: "2026-07-01T00:00:00Z", pct: "2026-07-02T00:00:00Z" }]);
    mockSyncStateFindUnique.mockRejectedValue(new Error("persistent read failure"));
    mockSyncStateUpsert.mockClear();

    const res = await syncListings({ cursorState: bootstrapCursorState(), maxRecords: 500 });

    const args = mockSyncStateUpsert.mock.calls[0][0] as { update: Record<string, unknown> };
    expect(args.update).not.toHaveProperty("notes");
    expect(res.property_cursor_persisted).toBe(false);
    expect(res.run_status).toBe("partial");
  });

  it("a clean two-stream run reports persisted true and ok", async () => {
    wireTrestle([{ ListingKey: "K1", mt: "2026-07-01T00:00:00Z", pct: "2026-07-02T00:00:00Z" }]);
    const res = await syncListings({ cursorState: bootstrapCursorState(), maxRecords: 500 });
    expect(res.property_cursor_persisted).toBe(true);
    expect(res.run_status).toBe("ok");
    expect(idxSyncAudit()!.run_status).toBe("ok");
  });
});
