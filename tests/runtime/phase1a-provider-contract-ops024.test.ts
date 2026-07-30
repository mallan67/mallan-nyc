/// <reference types="jest" />
/**
 * OPS-024 regression — the raw Cotality provider contract for the two keyset streams.
 *
 * PRODUCTION INCIDENT 2026-07-29 (PR #587, SHA 039c173e): the streams shipped
 * using the default `IDX_PLUS_SELECT_FIELDS`, which requests `SourceSystemKey`
 * (renamed to `ListingKey` by `mapTrestleToPrisma` AFTER the fetch) and NOT
 * `ListingKey`. `SourceSystemKey` is null feed-wide, so no RAW row carried a key.
 * The cursor/merge layer reads RAW rows BEFORE that rename, so all 500 rows per
 * cycle were rejected `missing_listing_key`, both streams froze on the bootstrap
 * epoch, and four consecutive production cycles processed zero records.
 *
 * Every Phase 1A fixture fabricated `ListingKey` by hand, so 5,814 passing tests
 * never exercised the production request shape. These tests assert on the ACTUAL
 * GENERATED REQUEST and on rows captured from the live API.
 *
 * THIS SUITE MUST FAIL against 039c173e and pass on the corrected branch.
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

import { syncListings } from "@/lib/idx/sync";
import { bootstrapCursorState } from "@/lib/idx/property-cursor";
import { mergePropertyStreams } from "@/lib/idx/property-stream-merge";
import fixture from "@/lib/idx/__tests__/fixtures/cotality-property-raw-stream-sample.json";

type RawRow = Record<string, unknown>;
const MT_ROWS = (fixture as { mt_stream: { rows: RawRow[] } }).mt_stream.rows;
const PCT_ROWS = (fixture as { pct_stream: { rows: RawRow[] } }).pct_stream.rows;

beforeEach(() => {
  jest.clearAllMocks();
  mockFindUnique.mockResolvedValue(null);
  mockUpsert.mockResolvedValue({});
  mockProjFindUnique.mockResolvedValue(null);
  mockProjUpsert.mockResolvedValue({});
  mockFindFirst.mockResolvedValue(null);
  mockUpdateMany.mockResolvedValue({ count: 1 });
  mockSyncStateUpsert.mockResolvedValue({});
  mockSyncStateFindUnique.mockResolvedValue(null);
  mockAuditCreate.mockResolvedValue({});
  mockFetchFromTrestle.mockResolvedValue({ records: [], totalFetched: 0 });
  global.fetch = jest.fn(async () => ({
    ok: true, status: 200, text: async () => JSON.stringify({ "@odata.count": 0, value: [] }),
  })) as unknown as typeof fetch;
});

// ── The fixture itself is real and raw ────────────────────────────────────

describe("the fixture is a genuine raw provider capture", () => {
  it("preserves the exact raw field names, unnormalized", () => {
    expect(MT_ROWS.length).toBeGreaterThan(0);
    for (const r of [...MT_ROWS, ...PCT_ROWS]) {
      expect(Object.prototype.hasOwnProperty.call(r, "ListingKey")).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(r, "SourceSystemKey")).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(r, "ModificationTimestamp")).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(r, "PhotosChangeTimestamp")).toBe(true);
    }
  });

  it("records the incident condition: SourceSystemKey is null while ListingKey is populated", () => {
    for (const r of [...MT_ROWS, ...PCT_ROWS]) {
      expect(r.SourceSystemKey).toBeNull();
      expect(typeof r.ListingKey).toBe("string");
      expect(String(r.ListingKey).length).toBeGreaterThan(0);
    }
  });

  it("contains no address, remarks, agent/owner PII or credentials", () => {
    const blob = JSON.stringify(fixture);
    for (const forbidden of ["StreetName", "StreetNumber", "PublicRemarks", "ListAgent", "OwnerName", "Bearer", "client_secret", "access_token"]) {
      expect(blob).not.toContain(forbidden);
    }
  });
});

// ── THE FAILING TEST: the production request must select ListingKey ───────

describe("OPS-024 — the generated stream request must select ListingKey", () => {
  it("MT stream request includes ListingKey in its $select", async () => {
    await syncListings({ cursorState: bootstrapCursorState(), maxRecords: 500 });
    const mtReq = mockFetchFromTrestle.mock.calls
      .map((c) => c[0] as { orderby?: string; select?: string[] })
      .find((r) => String(r.orderby ?? "").startsWith("ModificationTimestamp"));
    expect(mtReq).toBeDefined();
    // On 039c173e `select` was omitted entirely, so the default
    // IDX_PLUS_SELECT_FIELDS (SourceSystemKey, no ListingKey) was used.
    expect(mtReq!.select).toBeDefined();
    expect(mtReq!.select).toContain("ListingKey");
  });

  it("PCT stream request includes ListingKey in its $select", async () => {
    await syncListings({ cursorState: bootstrapCursorState(), maxRecords: 500 });
    const pctReq = mockFetchFromTrestle.mock.calls
      .map((c) => c[0] as { orderby?: string; select?: string[] })
      .find((r) => String(r.orderby ?? "").startsWith("PhotosChangeTimestamp"));
    expect(pctReq).toBeDefined();
    expect(pctReq!.select).toBeDefined();
    expect(pctReq!.select).toContain("ListingKey");
  });

  it("both stream requests also select the two cursor clocks", async () => {
    await syncListings({ cursorState: bootstrapCursorState(), maxRecords: 500 });
    for (const req of mockFetchFromTrestle.mock.calls.map((c) => c[0] as { select?: string[] })) {
      expect(req.select).toContain("ModificationTimestamp");
      expect(req.select).toContain("PhotosChangeTimestamp");
    }
  });
});

// ── Real raw rows flow through the merge layer ───────────────────────────

describe("real raw rows are accepted by the cursor/merge layer", () => {
  it("accepts real MT rows and keys them by ListingKey", () => {
    const m = mergePropertyStreams({ mt: MT_ROWS, pct: [] });
    expect(m.frozen.mt).toBeNull();
    expect(m.entries.filter((e) => e.kind === "processable")).toHaveLength(MT_ROWS.length);
  });

  it("accepts real PCT rows", () => {
    const m = mergePropertyStreams({ mt: [], pct: PCT_ROWS });
    expect(m.frozen.pct).toBeNull();
    expect(m.entries.filter((e) => e.kind === "processable")).toHaveLength(PCT_ROWS.length);
  });

  it("null SourceSystemKey does not block a populated ListingKey", () => {
    const m = mergePropertyStreams({ mt: [{ ...MT_ROWS[0], SourceSystemKey: null }], pct: [] });
    expect(m.frozen.mt).toBeNull();
    expect(m.entries[0].kind).toBe("processable");
  });

  it("REPRODUCES the incident: the production select shape rejects every row", () => {
    // Exactly what production sent — ListingKey absent because it was not selected.
    const asProductionSent = MT_ROWS.map((r) => {
      const { ListingKey: _drop, ...rest } = r as Record<string, unknown>;
      void _drop;
      return rest;
    });
    const m = mergePropertyStreams({ mt: asProductionSent, pct: [] });
    expect(m.frozen.mt).toBe("missing_listing_key");
    expect(m.entries.filter((e) => e.kind === "processable")).toHaveLength(0);
  });

  it("does NOT fall back to ListingId when ListingKey is absent", () => {
    const noKey = MT_ROWS.map((r) => {
      const { ListingKey: _d, ...rest } = r as Record<string, unknown>;
      void _d;
      return rest;
    });
    const m = mergePropertyStreams({ mt: noKey, pct: [] });
    // ListingId IS present on these rows; it must not be used as identity.
    expect(noKey[0].ListingId).toBeDefined();
    expect(m.frozen.mt).toBe("missing_listing_key");
  });

  it("a blank ListingKey freezes the stream", () => {
    const m = mergePropertyStreams({ mt: [{ ...MT_ROWS[0], ListingKey: "   " }], pct: [] });
    expect(m.frozen.mt).toBe("missing_listing_key");
  });
});
