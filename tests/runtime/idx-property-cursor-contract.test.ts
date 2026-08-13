/// <reference types="jest" />
/**
 * PROPERTY CURSOR CONTRACT — behavioral proof.
 *
 * `sync_state.Property.{last_watermark,last_listing_key}` is ONE position over
 * ONE ordered universe: all Property records by (ModificationTimestamp,
 * ListingKey) ASC. Two ways to corrupt it, both proven closed here:
 *
 *   1. OWNERSHIP — a run that traversed a SUBSET (type: "sale"/"rent") or a
 *      DIFFERENT universe (fullSync, which uses buildActiveFilter) must never
 *      advance the shared position. Advancing from a sale-only run would declare
 *      every RENTAL in that timestamp range processed when none were fetched.
 *
 *   2. COLD TRANSITION — bootstrapping from
 *      MAX(listings.modification_timestamp) with no tie-breaker must REPLAY that
 *      timestamp (`ge`), not skip past it (`gt`). We are only ever guaranteed to
 *      have processed the boundary timestamp PARTIALLY: production carries 797
 *      rows at one ModificationTimestamp while the scheduled run caps at 500.
 *
 * The real buildIncrementalFilter is used deliberately — the filter STRING is
 * the contract under test, so mocking it would prove nothing.
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
const mockListingFindFirstTop = jest.fn();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    listing: {
      findUnique: (args: unknown) => mockFindUnique(args),
      upsert: (args: unknown) => mockUpsert(args),
      findFirst: (args: unknown) => mockListingFindFirstTop(args) ?? mockFindFirst(args),
      updateMany: (args: unknown) => mockUpdateMany(args),
    },
    listingSearchProjection: {
      findUnique: (args: unknown) => mockProjFindUnique(args),
      upsert: (args: unknown) => mockProjUpsert(args),
    },
    syncState: {
      upsert: (args: unknown) => mockSyncStateUpsert(args),
      findUnique: (args: unknown) => mockSyncStateFindUnique(args),
    },
    auditEvent: { create: (args: unknown) => mockAuditCreate(args) },
  },
}));

const mockFetchFromTrestle = jest.fn();
jest.mock("@/lib/idx/fetch", () => {
  const actual = jest.requireActual("@/lib/idx/fetch");
  return {
    __esModule: true,
    ...actual,
    // REAL buildIncrementalFilter / buildActiveFilter / PROPERTY_KEYSET_ORDERBY.
    fetchFromTrestle: (args: unknown) => mockFetchFromTrestle(args),
  };
});

jest.mock("@/lib/idx/auth", () => ({
  __esModule: true,
  getAccessToken: async () => "mock-token",
}));

import { syncListings, getPropertyKeysetCursor } from "@/lib/idx/sync";

const DB_MAX_MT = "2026-08-01T12:00:00.000Z";

/**
 * Trestle Property record that survives the real mapper + distribution gates.
 * Field-for-field the fixture used by phase3-write-suppression-sync.test.ts, so
 * the two suites cannot disagree about what a processable record looks like.
 */
function rawRecord(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ListingId: "RLS100001",
    ListingKey: "KEY1",
    PropertyType: "Residential",
    PropertySubType: "Condominium",
    ListPrice: 750000,
    StandardStatus: "Active",
    StreetNumber: "400",
    StreetName: "East 90th Street",
    UnitNumber: "17C",
    City: "New York",
    StateOrProvince: "NY",
    PostalCode: "10128",
    BedroomsTotal: 2,
    BathroomsFull: 2,
    ListAgentMlsId: "AG001",
    ListAgentFullName: "Test Agent",
    ListOfficeName: "Test Office LLC",
    ModificationTimestamp: DB_MAX_MT,
    PhotosChangeTimestamp: DB_MAX_MT,
    InternetEntireListingDisplayYN: true,
    InternetAddressDisplayYN: true,
    Media: [],
    ...over,
  };
}

function syncStateArgs(): {
  create: Record<string, unknown>;
  update: Record<string, unknown>;
} {
  expect(mockSyncStateUpsert).toHaveBeenCalledTimes(1);
  return mockSyncStateUpsert.mock.calls[0][0] as {
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListingFindFirstTop.mockReturnValue(undefined);
  // No stored row -> every record is a CREATE, so nothing is suppressed and the
  // cursor bookkeeping is exercised on a fully-successful batch.
  mockFindUnique.mockResolvedValue(null);
  mockFindFirst.mockResolvedValue(null);
  mockUpsert.mockResolvedValue({});
  mockUpdateMany.mockResolvedValue({ count: 1 });
  mockProjFindUnique.mockResolvedValue(null);
  mockProjUpsert.mockResolvedValue({});
  mockSyncStateUpsert.mockResolvedValue({});
  mockSyncStateFindUnique.mockResolvedValue(null);
  mockAuditCreate.mockResolvedValue({});
});

// ── 1. CURSOR OWNERSHIP ──────────────────────────────────────────────────────

describe("Property cursor ownership — only the unscoped incremental traversal may advance it", () => {
  const since = new Date(DB_MAX_MT);

  it("an UNSCOPED incremental run DOES advance the cursor (baseline)", async () => {
    mockFetchFromTrestle.mockResolvedValue({
      records: [rawRecord()],
      totalFetched: 1,
    });

    await syncListings({ since, maxRecords: 500 });

    const args = syncStateArgs();
    expect(args.update.last_watermark).toBeInstanceOf(Date);
    expect((args.update.last_watermark as Date).toISOString()).toBe(DB_MAX_MT);
    expect(args.update.last_listing_key).toBe("KEY1");
  });

  it("a SALE-scoped run must NOT advance the cursor", async () => {
    // A sale-only traversal never fetches a single rental. Its last contiguous
    // success is a position in the SALE subset; writing it to the shared cursor
    // would silently declare every rental at that timestamp done.
    mockFetchFromTrestle.mockResolvedValue({
      records: [rawRecord()],
      totalFetched: 1,
    });

    await syncListings({ since, type: "sale", maxRecords: 500 });

    const args = syncStateArgs();
    expect(args.update).not.toHaveProperty("last_watermark");
    expect(args.update).not.toHaveProperty("last_listing_key");
    // Run telemetry still records — only the cursor columns are withheld.
    expect(args.update.last_run_at).toBeInstanceOf(Date);
    // On a create-branch race the position must be null, never a subset value.
    expect(args.create.last_watermark).toBeNull();
    expect(args.create.last_listing_key).toBeNull();
  });

  it("a RENT-scoped run must NOT advance the cursor", async () => {
    mockFetchFromTrestle.mockResolvedValue({
      records: [rawRecord({ PropertyType: "ResidentialLease" })],
      totalFetched: 1,
    });

    await syncListings({ since, type: "rent", maxRecords: 500 });

    const args = syncStateArgs();
    expect(args.update).not.toHaveProperty("last_watermark");
    expect(args.update).not.toHaveProperty("last_listing_key");
  });

  it("a FULL sync must NOT advance the incremental cursor", async () => {
    // fullSync uses buildActiveFilter: actives only, no MT bound at all. Its
    // records say nothing about incremental position.
    mockFetchFromTrestle.mockResolvedValue({
      records: [rawRecord()],
      totalFetched: 1,
    });

    await syncListings({ fullSync: true, maxRecords: 500 });

    const args = syncStateArgs();
    expect(args.update).not.toHaveProperty("last_watermark");
    expect(args.update).not.toHaveProperty("last_listing_key");
  });

  it("a capped forceFull-style run (fullSync + small cap) still must NOT advance it", async () => {
    mockFetchFromTrestle.mockResolvedValue({
      records: [rawRecord(), rawRecord({ ListingKey: "KEY2", ListingId: "RLS100002" })],
      totalFetched: 2,
    });

    await syncListings({ fullSync: true, maxRecords: 1 });

    const args = syncStateArgs();
    expect(args.update).not.toHaveProperty("last_watermark");
  });
});

// ── 2. ORDERING + FILTER SHAPE ───────────────────────────────────────────────

describe("Property incremental traversal — ASC ordering and filter shape", () => {
  it("an incremental run requests ASCENDING (MT, ListingKey) ordering", async () => {
    mockFetchFromTrestle.mockResolvedValue({ records: [], totalFetched: 0 });

    await syncListings({ since: new Date(DB_MAX_MT), maxRecords: 500 });

    const fetchArgs = mockFetchFromTrestle.mock.calls[0][0] as { orderby?: string };
    expect(fetchArgs.orderby).toBe("ModificationTimestamp asc,ListingKey asc");
  });

  it("a full sync does NOT force the keyset ordering (no resume position to protect)", async () => {
    mockFetchFromTrestle.mockResolvedValue({ records: [], totalFetched: 0 });

    await syncListings({ fullSync: true, maxRecords: 500 });

    const fetchArgs = mockFetchFromTrestle.mock.calls[0][0] as { orderby?: string };
    expect(fetchArgs.orderby).toBeUndefined();
  });

  it("the incremental filter never references PhotosChangeTimestamp", async () => {
    mockFetchFromTrestle.mockResolvedValue({ records: [], totalFetched: 0 });

    await syncListings({ since: new Date(DB_MAX_MT), maxRecords: 500 });

    const fetchArgs = mockFetchFromTrestle.mock.calls[0][0] as { filter: string };
    expect(fetchArgs.filter).not.toContain("PhotosChangeTimestamp");
  });
});

// ── 3. COLD TRANSITION (bootstrap boundary must be replay-safe) ──────────────

describe("cold transition — bootstrapping with no tie-breaker must REPLAY the boundary timestamp", () => {
  it("uses an INCLUSIVE boundary so an unprocessed key AT the DB-max timestamp is still fetched", async () => {
    // The scenario that a strict `gt` loses:
    //   DB MAX(modification_timestamp) = T, because KEY_A at T was processed.
    //   The provider ALSO has KEY_B and KEY_C at exactly T, never processed here.
    //   With `MT gt T` those two are excluded forever — the cursor has moved past
    //   a timestamp it only partially consumed.
    mockFetchFromTrestle.mockResolvedValue({ records: [], totalFetched: 0 });

    await syncListings({ since: new Date(DB_MAX_MT), sinceListingKey: null, maxRecords: 500 });

    const fetchArgs = mockFetchFromTrestle.mock.calls[0][0] as { filter: string };
    expect(fetchArgs.filter).toContain(`ModificationTimestamp ge ${DB_MAX_MT}`);
    expect(fetchArgs.filter).not.toContain(`ModificationTimestamp gt ${DB_MAX_MT}`);
  });

  it("PROCESSES the sibling keys at the boundary timestamp that were missing locally", async () => {
    // KEY_A already stored; KEY_B and KEY_C are new arrivals at the SAME instant.
    const provider = [
      rawRecord({ ListingKey: "KEY_A", ListingId: "RLS100001" }),
      rawRecord({ ListingKey: "KEY_B", ListingId: "RLS100002" }),
      rawRecord({ ListingKey: "KEY_C", ListingId: "RLS100003" }),
    ];
    mockFetchFromTrestle.mockResolvedValue({ records: provider, totalFetched: 3 });
    // Only KEY_A/RLS100001 exists locally; the other two are unknown -> created.
    mockFindUnique.mockImplementation(async (args: { where: { listing_id: string } }) =>
      args.where.listing_id === "RLS100001" ? null : null,
    );

    const result = await syncListings({
      since: new Date(DB_MAX_MT),
      sinceListingKey: null,
      maxRecords: 500,
    });

    expect(result.errors).toBe(0);
    // All three reached the write decision — none was excluded by the boundary.
    const written = mockUpsert.mock.calls.map(
      (c) => (c[0] as { where: { listing_id: string } }).where.listing_id,
    );
    expect(written).toEqual(
      expect.arrayContaining(["RLS100001", "RLS100002", "RLS100003"]),
    );

    // And the cursor now carries a REAL tie-breaker, so the next run resumes
    // strictly after KEY_C instead of replaying the timestamp again.
    const args = syncStateArgs();
    expect((args.update.last_watermark as Date).toISOString()).toBe(DB_MAX_MT);
    expect(args.update.last_listing_key).toBe("KEY_C");
  });

  it("once a tie-breaker exists the boundary becomes STRICT (no perpetual replay)", async () => {
    mockFetchFromTrestle.mockResolvedValue({ records: [], totalFetched: 0 });

    await syncListings({
      since: new Date(DB_MAX_MT),
      sinceListingKey: "KEY_C",
      maxRecords: 500,
    });

    const fetchArgs = mockFetchFromTrestle.mock.calls[0][0] as { filter: string };
    expect(fetchArgs.filter).toBe(
      `(ModificationTimestamp gt ${DB_MAX_MT} or (ModificationTimestamp eq ${DB_MAX_MT} and ListingKey gt 'KEY_C'))`,
    );
    expect(fetchArgs.filter).not.toContain("ge");
  });
});

// ── 4. CURSOR READER — never trusts the poisoned wall-clock watermark ────────

describe("getPropertyKeysetCursor — bootstrap safety", () => {
  it("trusts the stored position ONLY when a tie-breaker proves the new writer wrote it", async () => {
    mockSyncStateFindUnique.mockResolvedValue({
      last_watermark: new Date("2026-08-13T09:20:39.721Z"),
      last_listing_key: "1179924995",
    });

    const cursor = await getPropertyKeysetCursor();

    expect(cursor.since?.toISOString()).toBe("2026-08-13T09:20:39.721Z");
    expect(cursor.listingKey).toBe("1179924995");
  });

  it("IGNORES a legacy wall-clock watermark that has no tie-breaker", async () => {
    // This is the poisoned production shape: last_watermark === last_run_at,
    // ~4 minutes AHEAD of the newest real provider timestamp. Resuming from it
    // would skip every record in that gap. Only the DB-derived bootstrap is
    // acceptable, so the reader must fall through to getLastSyncTimestamp.
    mockSyncStateFindUnique.mockResolvedValue({
      last_watermark: new Date("2026-08-13T09:20:39.721Z"),
      last_listing_key: null,
    });
    mockListingFindFirstTop.mockReturnValue(
      Promise.resolve({ modification_timestamp: new Date(DB_MAX_MT) }),
    );

    const cursor = await getPropertyKeysetCursor();

    expect(cursor.listingKey).toBeNull();
    expect(cursor.since?.toISOString()).toBe(DB_MAX_MT);
    expect(cursor.since?.toISOString()).not.toBe("2026-08-13T09:20:39.721Z");
  });

  it("returns a null position on a cold DB (no rows, no state)", async () => {
    mockSyncStateFindUnique.mockResolvedValue(null);
    mockListingFindFirstTop.mockReturnValue(Promise.resolve(null));

    const cursor = await getPropertyKeysetCursor();

    expect(cursor.since).toBeNull();
    expect(cursor.listingKey).toBeNull();
  });
});

// ── 5. THE POSITION IS NEVER REWRITTEN, ONLY WITHHELD ────────────────────────

describe("failure handling must BLOCK the cursor, never rewrite its position", () => {
  it("keeps the real (MT, ListingKey) when the failure SHARES the last success's timestamp", async () => {
    // The case the removed scalar clamp corrupted. A and B share one
    // ModificationTimestamp — the clustered input the tie-breaker exists for.
    // A succeeds, B fails. The correct position is (T, KEY_A): a real row.
    //
    // The old clamp computed (earliest failure - 1ms) and nulled the key, so it
    // replaced (T, KEY_A) with (T-1ms, null). Nulling the key drops the
    // tie-breaker, so the next run falls back to the bootstrap path and re-reads
    // the entire cluster — losing exactly the progress the tie-breaker exists to
    // preserve, on exactly the input it exists to handle.
    const T = "2026-08-01T12:00:00.000Z";
    const A = rawRecord({ ListingKey: "KEY_A", ListingId: "RLS100001", ModificationTimestamp: T });
    const B = rawRecord({ ListingKey: "KEY_B", ListingId: "RLS100002", ModificationTimestamp: T });
    mockFetchFromTrestle.mockResolvedValue({ records: [A, B], totalFetched: 2 });
    mockFindUnique.mockImplementation(async (args: { where: { listing_id: string } }) => {
      if (args.where.listing_id === "RLS100002") throw new Error("connection reset");
      return null;
    });

    const result = await syncListings({ since: new Date(DB_MAX_MT), maxRecords: 500 });
    expect(result.errors).toBe(1);

    const args = syncStateArgs();
    expect((args.update.last_watermark as Date).toISOString()).toBe(T);
    // The REAL key of the last contiguous success — not null, not B's.
    expect(args.update.last_listing_key).toBe("KEY_A");
    expect(args.update.last_listing_key).not.toBeNull();
    expect(args.update.last_listing_key).not.toBe("KEY_B");
  });

  it("withholds the position entirely when a failed record cannot be placed in the order", async () => {
    // Unparseable ModificationTimestamp on a FAILED record: we cannot say where
    // it sits, so no position may be claimed past it. Fail closed by BLOCKING.
    const good = rawRecord({ ListingKey: "KEY_A", ListingId: "RLS100001" });
    const bad = rawRecord({
      ListingKey: "KEY_B",
      ListingId: "RLS100002",
      ModificationTimestamp: "not-a-timestamp",
    });
    mockFetchFromTrestle.mockResolvedValue({ records: [good, bad], totalFetched: 2 });
    mockFindUnique.mockImplementation(async (args: { where: { listing_id: string } }) => {
      if (args.where.listing_id === "RLS100002") throw new Error("boom");
      return null;
    });

    await syncListings({ since: new Date(DB_MAX_MT), maxRecords: 500 });

    const args = syncStateArgs();
    expect(args.update).not.toHaveProperty("last_watermark");
    expect(args.update).not.toHaveProperty("last_listing_key");
  });
});

// ── 6. SKIPS MUST NOT LIVELOCK THE CURSOR ────────────────────────────────────

describe("deliberately-skipped records must still advance the cursor", () => {
  it("a page where EVERY record is skipped as new+terminal still writes a position", async () => {
    // The livelock. A skip is a terminal decision, not a failure — if it records
    // no position, an all-skip page leaves cursorRows empty, no position is
    // written, last_run_status is still "ok", and the identical page is
    // re-fetched forever under deterministic ASC ordering. Property ingest stops
    // dead while every health signal stays green.
    const closed = [
      rawRecord({ ListingKey: "KEY_X", ListingId: "RLS900001", StandardStatus: "Closed" }),
      rawRecord({ ListingKey: "KEY_Y", ListingId: "RLS900002", StandardStatus: "Closed" }),
    ];
    mockFetchFromTrestle.mockResolvedValue({ records: closed, totalFetched: 2 });
    mockFindUnique.mockResolvedValue(null); // never-tracked => new + terminal => skipped

    const result = await syncListings({ since: new Date(DB_MAX_MT), maxRecords: 500 });

    expect(result.errors).toBe(0);
    // Nothing was written to `listings` — the skip still holds.
    expect(mockUpsert).not.toHaveBeenCalled();
    // But the cursor MOVED past them, so the next run sees the next page.
    const args = syncStateArgs();
    expect(args.update.last_watermark).toBeInstanceOf(Date);
    expect(args.update.last_listing_key).toBe("KEY_Y");
  });

  it("a page whose TRAILING records are all skipped still advances to the last one", async () => {
    // The milder form: without this, the cursor advances only to the last
    // non-skipped row, so a page of 500 with one processable record at the head
    // moves the cursor by exactly one record per cycle.
    mockFetchFromTrestle.mockResolvedValue({
      records: [
        rawRecord({ ListingKey: "KEY_A", ListingId: "RLS900010" }),
        rawRecord({ ListingKey: "KEY_B", ListingId: "RLS900011", StandardStatus: "Closed" }),
        rawRecord({ ListingKey: "KEY_C", ListingId: "RLS900012", StandardStatus: "Closed" }),
      ],
      totalFetched: 3,
    });
    mockFindUnique.mockResolvedValue(null);

    await syncListings({ since: new Date(DB_MAX_MT), maxRecords: 500 });

    expect(syncStateArgs().update.last_listing_key).toBe("KEY_C");
  });
});

// ── 7. THE TIE-BREAKER FIELD MUST ACTUALLY BE FETCHED ────────────────────────

describe("ListingKey is requested from the provider", () => {
  it("IDX_PLUS_SELECT_FIELDS includes ListingKey", () => {
    // Without it `raw.ListingKey` is undefined on every record, every row is
    // unpositionable, keysetFrozen latches on, and the cursor can never advance.
    // SourceSystemKey is NOT a substitute: RESO_TO_RLS_RENAMES maps it to
    // ListingKey defensively, but this feed sends ListingKey directly and leaves
    // SourceSystemKey null (verified live 2026-08-13).
    const { IDX_PLUS_SELECT_FIELDS } = require("@/lib/idx/trestle-mapper");
    expect(IDX_PLUS_SELECT_FIELDS).toContain("ListingKey");
  });

  it("a record carrying ListingKey yields a positionable cursor row", async () => {
    mockFetchFromTrestle.mockResolvedValue({
      records: [rawRecord({ ListingKey: "KEY_REAL" })],
      totalFetched: 1,
    });
    await syncListings({ since: new Date(DB_MAX_MT), maxRecords: 500 });
    expect(syncStateArgs().update.last_listing_key).toBe("KEY_REAL");
  });

  it("a record with NO ListingKey freezes the cursor rather than inventing one", async () => {
    const noKey = rawRecord();
    delete (noKey as Record<string, unknown>).ListingKey;
    mockFetchFromTrestle.mockResolvedValue({ records: [noKey], totalFetched: 1 });

    await syncListings({ since: new Date(DB_MAX_MT), maxRecords: 500 });

    const args = syncStateArgs();
    expect(args.update).not.toHaveProperty("last_watermark");
    expect(args.update).not.toHaveProperty("last_listing_key");
    // The create branch must honour the SAME freeze, not bypass it.
    expect(args.create.last_watermark).toBeNull();
    expect(args.create.last_listing_key).toBeNull();
  });
});
