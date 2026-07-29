/// <reference types="jest" />
/**
 * Phase 1A — `backfillEmptyMedia` CALLER behaviour.
 *
 * These execute the real function, not the helper in isolation, so they prove
 * the wiring: RRK/RRID fallback, complete-response reconciliation, fail-closed
 * preservation on every failure mode, verified `updateMany` results, and that
 * cache revalidation only follows a CONFIRMED physical write.
 */

const mockQueryRaw = jest.fn();
const mockUpdateMany = jest.fn();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    $queryRaw: (...a: unknown[]) => mockQueryRaw(...a),
    listing: { updateMany: (args: unknown) => mockUpdateMany(args) },
  },
}));

const mockGetAccessToken = jest.fn();
jest.mock("@/lib/idx/auth", () => ({
  __esModule: true,
  getAccessToken: () => mockGetAccessToken(),
}));

import { backfillEmptyMedia } from "@/lib/idx/sync";

const BASE = "https://api.cotality.com/trestle";

type Row = { listing_id: string; mls_id: string | null; media: unknown };
const listingRow = (listing_id: string, mls_id: string | null, media: unknown = null): Row =>
  ({ listing_id, mls_id, media });

function mediaRow(key: string, mediaKey: string, order: number, extra: Record<string, unknown> = {}) {
  return {
    ResourceRecordKey: key,
    MediaKey: mediaKey,
    MediaURL: `${BASE}/Media/${mediaKey}.jpg`,
    MediaCategory: "Photo",
    Order: order,
    PreferredPhotoYN: false,
    MediaStatus: "Active",
    ...extra,
  };
}

/** Ordered page responses for the Media endpoint. */
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

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAccessToken.mockResolvedValue("mock-token");
  mockUpdateMany.mockResolvedValue({ count: 1 });
});

// ── Mapping ───────────────────────────────────────────────────────────────

it("maps RRK and RRID-fallback listings in the same completed batch", async () => {
  // L1 has an mls_id -> queried/matched on ResourceRecordKey.
  // L2 has none      -> queried/matched on ResourceRecordID.
  mockQueryRaw.mockResolvedValue([listingRow("L1", "MLS1"), listingRow("L2", null)]);
  pages([{ ok: true, count: 2, value: [
    mediaRow("MLS1", "m1", 1),
    { ...mediaRow("", "m2", 1), ResourceRecordID: "L2" },
  ] }]);

  const r = await backfillEmptyMedia();

  expect(r.updated).toBe(2);
  const written = mockUpdateMany.mock.calls.map(
    (c) => (c[0] as { where: { listing_id: string } }).where.listing_id,
  );
  expect(written.sort()).toEqual(["L1", "L2"]);
  const url = decodeURIComponent(String((global.fetch as jest.Mock).mock.calls[0][0]).replace(/\+/g, " "));
  expect(url).toContain("ResourceRecordKey eq 'MLS1'");
  expect(url).toContain("ResourceRecordID eq 'L2'");
});

it("writes the full gallery from a COMPLETE multipage response", async () => {
  mockQueryRaw.mockResolvedValue([listingRow("L1", "MLS1")]);
  pages([
    { ok: true, count: 3, value: [mediaRow("MLS1", "m1", 1)], next: `${BASE}/odata/Media?p=2` },
    { ok: true, count: 3, value: [mediaRow("MLS1", "m2", 2)], next: `${BASE}/odata/Media?p=3` },
    { ok: true, count: 3, value: [mediaRow("MLS1", "m3", 3)] },
  ]);

  const r = await backfillEmptyMedia();

  expect(r.updated).toBe(1);
  const data = (mockUpdateMany.mock.calls[0][0] as { data: { media: unknown[] } }).data;
  expect(data.media).toHaveLength(3); // all three pages, not just page one
});

// ── Empty reconciliation ──────────────────────────────────────────────────

it("suppresses the write when a COMPLETE empty response matches stored []", async () => {
  mockQueryRaw.mockResolvedValue([listingRow("L1", "MLS1", [])]);
  pages([{ ok: true, count: 0, value: [] }]);

  const r = await backfillEmptyMedia();

  expect(mockUpdateMany).not.toHaveBeenCalled(); // compared BEFORE writing
  expect(r.updated).toBe(0);
  expect(r.write_path.rows_suppressed_unchanged).toBe(1);
  expect(r.pages_revalidated).toBe(0); // no write -> no revalidation
});

it("writes [] when a COMPLETE empty response contradicts stale populated media", async () => {
  mockQueryRaw.mockResolvedValue([
    listingRow("L1", "MLS1", [{ url: `${BASE}/Media/old.jpg`, mediaType: "Photo", order: 0 }]),
  ]);
  pages([{ ok: true, count: 0, value: [] }]);

  const r = await backfillEmptyMedia();

  expect(mockUpdateMany).toHaveBeenCalledTimes(1);
  expect((mockUpdateMany.mock.calls[0][0] as { data: { media: unknown[] } }).data.media).toEqual([]);
  expect(r.updated).toBe(1);
});

// ── Fail-closed paths — every one writes nothing ──────────────────────────

it("a later-page failure writes nothing for the ENTIRE batch", async () => {
  mockQueryRaw.mockResolvedValue([listingRow("L1", "MLS1"), listingRow("L2", "MLS2")]);
  pages([
    { ok: true, count: 4, value: [mediaRow("MLS1", "m1", 1)], next: `${BASE}/odata/Media?p=2` },
    { ok: false, status: 503 },
  ]);

  const r = await backfillEmptyMedia();

  expect(mockUpdateMany).not.toHaveBeenCalled(); // page one is discarded
  expect(r.updated).toBe(0);
  expect(r.errors).toBe(1);
  expect(r.write_path.rows_failed).toBe(2); // both listings, never zero on error
  expect(r.pages_revalidated).toBe(0);
});

it("a THROWN fetch failure writes nothing and is accounted", async () => {
  mockQueryRaw.mockResolvedValue([listingRow("L1", "MLS1"), listingRow("L2", "MLS2")]);
  pages([{ throws: true }]);

  const r = await backfillEmptyMedia();

  expect(mockUpdateMany).not.toHaveBeenCalled();
  expect(r.errors).toBeGreaterThan(0);
  expect(r.write_path.rows_failed).toBe(2);
});

it("a token failure reports EVERY selected listing as failed", async () => {
  mockQueryRaw.mockResolvedValue([listingRow("L1", "MLS1"), listingRow("L2", "MLS2"), listingRow("L3", "MLS3")]);
  mockGetAccessToken.mockRejectedValue(new Error("401"));

  const r = await backfillEmptyMedia();

  expect(r.checked).toBe(3);
  expect(r.updated).toBe(0);
  expect(r.errors).toBe(1);
  expect(r.write_path.rows_failed).toBe(3); // not zero-while-erroring
});

// ── Verified write results ────────────────────────────────────────────────

it("updateMany.count === 0 is NOT reported as updated and triggers no revalidation", async () => {
  mockQueryRaw.mockResolvedValue([listingRow("L1", "MLS1")]);
  pages([{ ok: true, count: 1, value: [mediaRow("MLS1", "m1", 1)] }]);
  mockUpdateMany.mockResolvedValue({ count: 0 }); // archived/vanished between read and write

  const r = await backfillEmptyMedia();

  expect(mockUpdateMany).toHaveBeenCalledTimes(1);
  expect(r.updated).toBe(0);
  expect(r.write_path.rows_updated).toBe(0);
  expect(r.write_path.rows_failed).toBe(1);
  expect(r.errors).toBe(1);
  expect(r.pages_revalidated).toBe(0); // revalidation only after a CONFIRMED write
});

it("updateMany.count > 1 is an invariant violation, not a success", async () => {
  mockQueryRaw.mockResolvedValue([listingRow("L1", "MLS1")]);
  pages([{ ok: true, count: 1, value: [mediaRow("MLS1", "m1", 1)] }]);
  mockUpdateMany.mockResolvedValue({ count: 2 }); // listing_id must identify one row

  const r = await backfillEmptyMedia();

  expect(r.updated).toBe(0);
  expect(r.write_path.rows_failed).toBe(1);
  expect(r.errors).toBe(1);
});

// ── Archived protection ───────────────────────────────────────────────────

it("keeps the archived-safe filter on every write", async () => {
  mockQueryRaw.mockResolvedValue([listingRow("L1", "MLS1")]);
  pages([{ ok: true, count: 1, value: [mediaRow("MLS1", "m1", 1)] }]);

  await backfillEmptyMedia();

  const where = (mockUpdateMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
  expect(where.listing_id).toBe("L1");
  // archivedSafeMediaWhere: NULL-safe exclusion of sync_status='archived'
  expect(JSON.stringify(where)).toContain("sync_status");
  expect(JSON.stringify(where)).toContain("archived");
});
