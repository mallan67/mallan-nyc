/// <reference types="jest" />
/**
 * Phase 1A — `syncAgentHistory` CALLER behaviour.
 *
 * Agent history does NOT own the Property watermark, so it adds no cursor
 * behaviour. Its obligations are: honest run status, a complete legacy-media
 * ledger, durable evidence, and zero partial writes on any failure.
 */

const mockFindUnique = jest.fn();
const mockUpsert = jest.fn();
const mockFindFirst = jest.fn();
const mockUpdateMany = jest.fn();
const mockProjFindUnique = jest.fn();
const mockProjUpsert = jest.fn();
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
    auditEvent: { create: (a: unknown) => mockAuditCreate(a) },
  },
}));

const mockFetchFromTrestle = jest.fn();
jest.mock("@/lib/idx/fetch", () => ({
  __esModule: true,
  fetchFromTrestle: (a: unknown) => mockFetchFromTrestle(a),
  buildIncrementalFilter: () => "f",
  buildActiveFilter: () => "f",
  buildAgentHistoricalFilter: () => "agent-filter",
}));

const mockGetAccessToken = jest.fn();
jest.mock("@/lib/idx/auth", () => ({
  __esModule: true,
  getAccessToken: () => mockGetAccessToken(),
}));

import { syncAgentHistory } from "@/lib/idx/sync";

const BASE = "https://api.cotality.com/trestle";
const OPTS = { agentMlsId: "AG001", agentDbId: BigInt(7) };

function rawRecord(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ListingId: "RLS900001",
    ListingKey: "KEY900001",
    PropertyType: "Residential",
    PropertySubType: "Condominium",
    ListPrice: 500000,
    StandardStatus: "Closed",
    StreetNumber: "400",
    StreetName: "East 90th Street",
    City: "New York",
    StateOrProvince: "NY",
    PostalCode: "10128",
    ListAgentMlsId: "AG001",
    ListAgentFullName: "Test Agent",
    ListOfficeName: "Test Office LLC",
    ModificationTimestamp: "2026-07-01T00:00:00Z",
    InternetEntireListingDisplayYN: true,
    InternetAddressDisplayYN: true,
    Media: [],
    ...over,
  };
}

function mediaRow(key: string, mediaKey: string, order: number) {
  return {
    ResourceRecordKey: key,
    MediaKey: mediaKey,
    MediaURL: `${BASE}/Media/${mediaKey}.jpg`,
    MediaCategory: "Photo",
    Order: order,
    PreferredPhotoYN: false,
    MediaStatus: "Active",
  };
}

function pages(defs: Array<
  | { ok: true; value: unknown[]; count: number; next?: string }
  | { ok: false; status: number }
  | { throws: true }
>) {
  let i = 0;
  global.fetch = jest.fn(async () => {
    const d = defs[Math.min(i++, defs.length - 1)];
    if ("throws" in d) throw new Error("socket hang up");
    if (!d.ok) return { ok: false, status: d.status, text: async () => "" } as unknown as Response;
    const body = JSON.stringify({
      "@odata.count": d.count,
      value: d.value,
      ...(d.next ? { "@odata.nextLink": d.next } : {}),
    });
    return { ok: true, status: 200, text: async () => body } as unknown as Response;
  }) as unknown as typeof fetch;
}

/** Stored legacy media for the archived-safe pre-read. */
function storedMedia(media: unknown | null) {
  mockFindFirst.mockResolvedValue(media === null ? null : { media });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAccessToken.mockResolvedValue("mock-token");
  mockFindUnique.mockResolvedValue(null); // new listing -> insert path
  mockUpsert.mockResolvedValue({});
  mockProjFindUnique.mockResolvedValue(null);
  mockProjUpsert.mockResolvedValue({});
  mockUpdateMany.mockResolvedValue({ count: 1 });
  mockAuditCreate.mockResolvedValue({});
  mockFetchFromTrestle.mockResolvedValue({ records: [rawRecord()], totalFetched: 1 });
  storedMedia([]);
});

// ── Complete outcomes ─────────────────────────────────────────────────────

it("a COMPLETE nonempty response reconciles and the run is ok", async () => {
  pages([{ ok: true, count: 2, value: [mediaRow("KEY900001", "m1", 1), mediaRow("KEY900001", "m2", 2)] }]);

  const r = await syncAgentHistory(OPTS);

  expect(mockUpdateMany).toHaveBeenCalledTimes(1);
  expect((mockUpdateMany.mock.calls[0][0] as { data: { media: unknown[] } }).data.media).toHaveLength(2);
  expect(r.run_status).toBe("ok");
  expect(r.errors).toBe(0);
  expect(r.legacy_media_batches?.batches_complete).toBe(1);
  expect(r.legacy_media_batches?.listings_complete_nonempty).toBe(1);
});

it("a COMPLETE empty response clears stale populated legacy media", async () => {
  storedMedia([{ url: `${BASE}/Media/old.jpg`, mediaType: "Photo", order: 0 }]);
  pages([{ ok: true, count: 0, value: [] }]);

  const r = await syncAgentHistory(OPTS);

  expect(mockUpdateMany).toHaveBeenCalledTimes(1);
  expect((mockUpdateMany.mock.calls[0][0] as { data: { media: unknown[] } }).data.media).toEqual([]);
  expect(r.run_status).toBe("ok");
  expect(r.legacy_media_batches?.listings_complete_empty).toBe(1);
});

it("materially unchanged media suppresses the write", async () => {
  storedMedia([{ url: `${BASE}/Media/m1.jpg`, mediaType: "Photo", order: 1 }]);
  pages([{ ok: true, count: 1, value: [mediaRow("KEY900001", "m1", 1)] }]);

  const r = await syncAgentHistory(OPTS);

  expect(mockUpdateMany).not.toHaveBeenCalled();
  expect(r.write_paths.batch_media.rows_suppressed_unchanged).toBe(1);
  expect(r.run_status).toBe("ok");
});

it("an archived / missing row is never rehydrated", async () => {
  storedMedia(null); // archivedSafeMediaWhere matched nothing
  pages([{ ok: true, count: 1, value: [mediaRow("KEY900001", "m1", 1)] }]);

  const r = await syncAgentHistory(OPTS);

  expect(mockUpdateMany).not.toHaveBeenCalled();
  expect(r.write_paths.batch_media.rows_suppressed_unchanged).toBe(1);
});

// ── Fail-closed outcomes -> partial, never error ──────────────────────────

it("a later-page failure preserves the whole batch and reports partial", async () => {
  storedMedia([{ url: `${BASE}/Media/old.jpg`, mediaType: "Photo", order: 0 }]);
  pages([
    { ok: true, count: 4, value: [mediaRow("KEY900001", "m1", 1)], next: `${BASE}/odata/Media?p=2` },
    { ok: false, status: 503 },
  ]);

  const r = await syncAgentHistory(OPTS);

  expect(mockUpdateMany).not.toHaveBeenCalled();
  expect(r.run_status).toBe("partial");
  expect(r.errors).toBe(0);
  expect(r.write_paths.batch_media.rows_failed).toBe(1);
  expect(r.legacy_media_batches?.batches_incomplete).toBe(1);
  expect(r.legacy_media_batches?.listings_incomplete).toBe(1);
  expect(r.legacy_media_batches?.incomplete_reasons.http_error).toBe(1);
});

it("a THROWN fetch failure preserves the whole batch and reports partial", async () => {
  storedMedia([{ url: `${BASE}/Media/old.jpg`, mediaType: "Photo", order: 0 }]);
  pages([{ throws: true }]);

  const r = await syncAgentHistory(OPTS);

  expect(mockUpdateMany).not.toHaveBeenCalled();
  expect(r.run_status).toBe("partial");
  expect(r.errors).toBe(0);
  expect(r.write_paths.batch_media.rows_failed).toBe(1);
});

it("a per-listing write exception yields partial, not success", async () => {
  storedMedia([{ url: `${BASE}/Media/old.jpg`, mediaType: "Photo", order: 0 }]);
  pages([{ ok: true, count: 1, value: [mediaRow("KEY900001", "m1", 1)] }]);
  mockUpdateMany.mockRejectedValue(new Error("deadlock detected"));

  const r = await syncAgentHistory(OPTS);

  expect(r.run_status).toBe("partial");
  expect(r.errors).toBe(0); // not a hard listing/projection failure
  expect(r.write_paths.batch_media.rows_failed).toBe(1);
  // Transport succeeded — this is a PERSISTENCE failure, kept distinguishable.
  expect(r.legacy_media_batches?.batches_complete).toBe(1);
  expect(r.legacy_media_batches?.batches_incomplete).toBe(0);
  expect(r.legacy_media_batches?.listings_write_failed).toBe(1);
  expect(r.legacy_media_batches?.incomplete_reasons.media_write_error).toBe(1);
});

it("updateMany.count === 0 is not claimed as a success", async () => {
  storedMedia([{ url: `${BASE}/Media/old.jpg`, mediaType: "Photo", order: 0 }]);
  pages([{ ok: true, count: 1, value: [mediaRow("KEY900001", "m1", 1)] }]);
  mockUpdateMany.mockResolvedValue({ count: 0 });

  const r = await syncAgentHistory(OPTS);

  expect(r.write_paths.batch_media.rows_updated).toBe(0);
  expect(r.write_paths.batch_media.rows_failed).toBe(1);
  expect(r.run_status).toBe("partial");
  expect(r.legacy_media_batches?.listings_write_failed).toBe(1);
  expect(r.legacy_media_batches?.incomplete_reasons.media_write_no_match).toBe(1);
});

// ── Durable evidence + hard-error precedence ──────────────────────────────

it("records the partial ledger on the durable idx_sync_agent_history AuditEvent", async () => {
  storedMedia([{ url: `${BASE}/Media/old.jpg`, mediaType: "Photo", order: 0 }]);
  pages([{ ok: false, status: 500 }]);

  await syncAgentHistory(OPTS);

  const audit = mockAuditCreate.mock.calls
    .map((c) => c[0] as { data: { action: string; changes: Record<string, unknown> } })
    .find((c) => c.data.action === "idx_sync_agent_history");
  expect(audit).toBeDefined();
  const changes = audit!.data.changes as Record<string, unknown>;
  expect(changes.run_status).toBe("partial");
  expect(changes.errors).toBe(0);
  const ledger = changes.legacy_media_batches as Record<string, unknown>;
  expect(ledger.batches_incomplete).toBe(1);
  expect(ledger.listings_incomplete).toBe(1);
});

it("a hard listing failure remains error, outranking partial", async () => {
  mockFindUnique.mockRejectedValue(new Error("connection reset"));
  pages([{ ok: false, status: 500 }]); // media also incomplete

  const r = await syncAgentHistory(OPTS);

  expect(r.errors).toBeGreaterThan(0);
  expect(r.run_status).toBe("error");
});

// ── Remaining verified-write + identity cases ─────────────────────────────

it("updateMany.count > 1 is an invariant violation and is durably recorded", async () => {
  storedMedia([{ url: `${BASE}/Media/old.jpg`, mediaType: "Photo", order: 0 }]);
  pages([{ ok: true, count: 1, value: [mediaRow("KEY900001", "m1", 1)] }]);
  mockUpdateMany.mockResolvedValue({ count: 2 }); // listing_id must identify one row

  const r = await syncAgentHistory(OPTS);

  expect(r.run_status).toBe("partial");
  expect(r.errors).toBe(0);
  expect(r.write_paths.batch_media.rows_updated).toBe(0);
  expect(r.write_paths.batch_media.rows_failed).toBe(1);
  expect(r.legacy_media_batches?.listings_write_failed).toBe(1);

  const audit = mockAuditCreate.mock.calls
    .map((c) => c[0] as { data: { action: string; changes: Record<string, unknown> } })
    .find((c) => c.data.action === "idx_sync_agent_history");
  const ledger = (audit!.data.changes as Record<string, unknown>)
    .legacy_media_batches as Record<string, unknown>;
  expect((ledger.incomplete_reasons as Record<string, number>).media_write_multi_match).toBe(1);
  expect(ledger.listings_write_failed).toBe(1);
});

it("a persistence failure reaches the durable agent-history AuditEvent", async () => {
  storedMedia([{ url: `${BASE}/Media/old.jpg`, mediaType: "Photo", order: 0 }]);
  pages([{ ok: true, count: 1, value: [mediaRow("KEY900001", "m1", 1)] }]);
  mockUpdateMany.mockRejectedValue(new Error("deadlock detected"));

  await syncAgentHistory(OPTS);

  const audit = mockAuditCreate.mock.calls
    .map((c) => c[0] as { data: { action: string; changes: Record<string, unknown> } })
    .find((c) => c.data.action === "idx_sync_agent_history");
  const changes = audit!.data.changes as Record<string, unknown>;
  expect(changes.run_status).toBe("partial");
  const ledger = changes.legacy_media_batches as Record<string, unknown>;
  expect(ledger.listings_write_failed).toBe(1);
  expect((ledger.incomplete_reasons as Record<string, number>).media_write_error).toBe(1);
});

it("a token/setup failure marks every requested listing incomplete", async () => {
  storedMedia([{ url: `${BASE}/Media/old.jpg`, mediaType: "Photo", order: 0 }]);
  mockGetAccessToken.mockRejectedValue(new Error("401 unauthorized"));

  const r = await syncAgentHistory(OPTS);

  expect(mockUpdateMany).not.toHaveBeenCalled(); // zero media writes
  expect(r.run_status).toBe("partial");
  expect(r.errors).toBe(0);
  expect(r.write_paths.batch_media.rows_failed).toBe(1);
  expect(r.legacy_media_batches?.listings_incomplete).toBe(1);
  expect(r.legacy_media_batches?.incomplete_reasons.fetch_error).toBe(1);

  const audit = mockAuditCreate.mock.calls
    .map((c) => c[0] as { data: { action: string; changes: Record<string, unknown> } })
    .find((c) => c.data.action === "idx_sync_agent_history");
  const ledger = (audit!.data.changes as Record<string, unknown>)
    .legacy_media_batches as Record<string, unknown>;
  expect((ledger.incomplete_reasons as Record<string, number>).fetch_error).toBe(1);
});

it("a listing seen by BOTH the persistence and the outer transport path is counted once", async () => {
  // The persistence marker receives a listing_id (RLS900001) while the transport
  // marker receives a request key (KEY900001). Without the inverse map these are
  // two identities for one listing and rows_failed would reach 2.
  storedMedia([{ url: `${BASE}/Media/old.jpg`, mediaType: "Photo", order: 0 }]);
  pages([{ ok: true, count: 1, value: [mediaRow("KEY900001", "m1", 1)] }]);
  mockUpdateMany.mockRejectedValue(new Error("deadlock detected")); // inner persistence failure

  // Force the OUTER media catch after the batch loop has already run.
  const realLog = console.log;
  const logSpy = jest.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("Media batch-fetch complete")) {
      throw new Error("forced outer failure");
    }
    realLog(...(args as []));
  });

  try {
    const r = await syncAgentHistory(OPTS);
    expect(r.write_paths.batch_media.rows_failed).toBe(1); // once, not twice
    const reasons = r.legacy_media_batches?.incomplete_reasons ?? {};
    const total = Object.values(reasons).reduce((a, b) => a + b, 0);
    expect(total).toBe(1);
    expect(r.run_status).toBe("partial");
  } finally {
    logSpy.mockRestore();
  }
});
