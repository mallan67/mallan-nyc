/**
 * Phase 4 — bounded R2 backlog + retry isolation + parked-row recovery
 * (failing-first TDD; stacked on #547→#549).
 *
 * Contract proven here:
 *   1. BOUNDED BACKLOG SELECTION — exactly ONE bounded backlog query per
 *      drain cycle (`take: R2_BACKLOG_BATCH_LIMIT`, deterministic
 *      `[{created_at asc}, {id asc}]` ordering, NO per-iteration re-query,
 *      NO growing `id notIn` list). Correct and bounded WITHOUT the
 *      unapplied `listing_media_r2_backlog_idx` partial index — the where
 *      shape simply benefits if that index is ever applied.
 *   2. RETRY/FAILURE ISOLATION with an explicit bounded budget — a failed
 *      row is counted, does not abort its chunk or the batch, and never
 *      advances any work past itself (failed rows keep only their standard
 *      failure bookkeeping and re-surface next run). Once
 *      R2_RUN_FAILURE_BUDGET failures accumulate in one run, the remaining
 *      queue is NOT attempted (rows stay untouched in the backlog) and the
 *      run reports r2_failure_budget_exhausted.
 *   3. PARKED-ROW RECOVERY — rows parked by RC3 retry-exhaustion
 *      (r2_attempts >= R2_RETRY_EXHAUSTED_THRESHOLD) become re-eligible via
 *      CODE LOGIC ONLY: a small per-run quota (R2_PARKED_RECOVERY_QUOTA,
 *      0 disables), oldest r2_last_attempt_at first, only after a long
 *      cooldown (R2_PARKED_RECOVERY_COOLDOWN_MS). NO production counter is
 *      reset by selection — a recovered row that fails again gets the
 *      STANDARD failure bookkeeping (attempts increment, new cooldown), so
 *      it re-parks automatically; success clears state via the standard
 *      success path.
 *
 * No live R2, no live Trestle, no live DB.
 */

import type {
  MediaSyncFetchDeps,
  MirrorMediaToR2Deps,
  RunMediaSyncOptions,
} from "../media-sync";

// ─── Mock Prisma ──────────────────────────────────────────────────────────

const mockMediaSyncFindUnique = jest.fn<Promise<unknown>, [unknown]>();
const mockMediaSyncUpsert = jest.fn<Promise<unknown>, [unknown]>();
const mockListingMediaFindUnique = jest.fn<Promise<unknown>, [unknown]>();
const mockListingMediaCreate = jest.fn<Promise<unknown>, [unknown]>();
const mockListingMediaUpdate = jest.fn<Promise<unknown>, [unknown]>();
const mockListingMediaUpdateMany = jest.fn<Promise<{ count: number }>, [unknown]>();
const mockListingMediaFindMany = jest.fn<Promise<unknown[]>, [unknown]>();
const mockListingMediaCount = jest.fn<Promise<number>, [unknown]>();
const mockListingUpdate = jest.fn<Promise<unknown>, [unknown]>();
const mockListingFindUnique = jest.fn<Promise<unknown>, [unknown]>();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    mediaSyncState: {
      findUnique: (args: unknown) => mockMediaSyncFindUnique(args),
      upsert: (args: unknown) => mockMediaSyncUpsert(args),
    },
    listingMedia: {
      findUnique: (args: unknown) => mockListingMediaFindUnique(args),
      create: (args: unknown) => mockListingMediaCreate(args),
      update: (args: unknown) => mockListingMediaUpdate(args),
      updateMany: (args: unknown) => mockListingMediaUpdateMany(args),
      findMany: (args: unknown) => mockListingMediaFindMany(args),
      count: (args: unknown) => mockListingMediaCount(args),
    },
    listing: {
      update: (args: unknown) => mockListingUpdate(args),
      findUnique: (args: unknown) => mockListingFindUnique(args),
    },
  },
}));

import {
  runMediaSync,
  buildR2BacklogWhere,
  buildR2ParkedRecoveryWhere,
  R2_BACKLOG_BATCH_LIMIT,
  R2_RUN_FAILURE_BUDGET,
  R2_PARKED_RECOVERY_QUOTA,
  R2_PARKED_RECOVERY_COOLDOWN_MS,
  R2_RETRY_EXHAUSTED_THRESHOLD,
} from "../media-sync";

beforeEach(() => {
  jest.clearAllMocks();
  mockListingFindUnique.mockImplementation(async (args: unknown) => ({
    listing_id: (args as { where?: { listing_id?: string } })?.where?.listing_id,
  }));
  mockListingMediaUpdateMany.mockResolvedValue({ count: 0 });
  mockListingMediaFindMany.mockResolvedValue([]);
  mockListingMediaCount.mockResolvedValue(0);
  mockListingUpdate.mockResolvedValue(undefined);
  mockListingMediaUpdate.mockResolvedValue(undefined);
  mockMediaSyncUpsert.mockResolvedValue(undefined);
  mockMediaSyncFindUnique.mockResolvedValue(null);
});

// ─── Helpers ─────────────────────────────────────────────────────────────

function makeFetchDeps(): MediaSyncFetchDeps & { fetchProperties: jest.Mock } {
  const fetchProperties = jest.fn().mockResolvedValue([]); // no Phase 1 work
  return { fetchProperties, fetchMedia: jest.fn().mockResolvedValue([]) };
}

function makeMirrorDeps(): MirrorMediaToR2Deps {
  return {
    existsInR2: jest.fn<Promise<boolean>, [string]>().mockResolvedValue(true),
    uploadToR2: jest
      .fn<Promise<string>, [string, Buffer, string]>()
      .mockImplementation(async (key) => `https://r2.example.com/${key}`),
    getR2PublicUrl: jest
      .fn<string, [string]>()
      .mockImplementation((key) => `https://r2.example.com/${key}`),
    getAccessToken: jest.fn<Promise<string>, []>().mockResolvedValue("test-token"),
    fetchFn: jest.fn(),
  };
}

function makeOptions(overrides: Partial<RunMediaSyncOptions> = {}): RunMediaSyncOptions {
  return {
    listingsPerRun: 10,
    mediaPerListing: 5,
    fallbackWindowDays: 7,
    fetchDeps: makeFetchDeps(),
    mirrorDeps: makeMirrorDeps(),
    ...overrides,
  };
}

let nextId = 1n;
function backlogRow(listingId: string, over: Record<string, unknown> = {}) {
  nextId += 1n;
  return {
    id: nextId,
    listing_id: listingId,
    media_key: `MK-${listingId}-${String(nextId)}`,
    media_type: "Photo",
    order: 1,
    media_url_original: `https://api.cotality.com/trestle/Media/${listingId}.jpg?sig=X`,
    r2_key: null,
    media_url_cached: null,
    r2_attempts: null,
    ...over,
  };
}

/** Main bounded backlog query: active + OR-missing-R2 + NOT parked-scoped. */
function isMainBacklogCall(call: unknown[]): boolean {
  const args = call[0] as { where?: { status?: string; OR?: unknown[]; r2_attempts?: unknown } };
  return (
    args?.where?.status === "active" &&
    Array.isArray(args.where.OR) &&
    !(args.where.r2_attempts && typeof args.where.r2_attempts === "object" && "gte" in (args.where.r2_attempts as object))
  );
}

/** Parked-recovery query: keyed on the top-level r2_attempts gte predicate. */
function isParkedRecoveryCall(call: unknown[]): boolean {
  const args = call[0] as { where?: { r2_attempts?: { gte?: unknown } } };
  return !!args?.where?.r2_attempts && typeof args.where.r2_attempts === "object" && "gte" in args.where.r2_attempts;
}

/**
 * Serve each queue EXACTLY ONCE, [] afterwards. This keeps the PRE-Phase-4
 * unbounded re-query loop terminating during the RED run (a constant mock
 * would make the old `while` loop spin forever — that unboundedness is
 * precisely what Phase 4 removes) while being shape-agnostic for the new
 * single-query implementation.
 */
function wireBacklogMocks(main: unknown[], parked: unknown[] = []) {
  let mainServed = false;
  let parkedServed = false;
  mockListingMediaFindMany.mockImplementation(async (args: unknown) => {
    if (isParkedRecoveryCall([args])) {
      if (parkedServed) return [];
      parkedServed = true;
      return parked;
    }
    if (isMainBacklogCall([args])) {
      if (mainServed) return [];
      mainServed = true;
      return main;
    }
    return [];
  });
}

// ─── 1. Bounded backlog selection ────────────────────────────────────────

describe("Phase 4 — bounded backlog selection (one query per drain cycle)", () => {
  it("issues exactly ONE bounded backlog query with deterministic ordering and NO id notIn filter", async () => {
    wireBacklogMocks([backlogRow("A"), backlogRow("B"), backlogRow("C")]);

    const result = await runMediaSync(makeOptions());

    const mainCalls = mockListingMediaFindMany.mock.calls.filter(isMainBacklogCall);
    expect(mainCalls.length).toBe(1);
    const args = mainCalls[0][0] as {
      where: Record<string, unknown>;
      orderBy: unknown;
      take: number;
    };
    expect(args.take).toBe(R2_BACKLOG_BATCH_LIMIT);
    expect(args.orderBy).toEqual([{ created_at: "asc" }, { id: "asc" }]);
    expect(args.where).not.toHaveProperty("id"); // no growing notIn list
    // The where is the pure builder output — bounded + correct WITHOUT the
    // unapplied listing_media_r2_backlog_idx partial index.
    const cooldownLt = (args.where as { AND: Array<{ OR: Array<{ r2_last_attempt_at?: { lt: Date } }> }> })
      .AND[0].OR[1].r2_last_attempt_at!.lt;
    expect(args.where).toEqual(buildR2BacklogWhere(cooldownLt, []) as unknown as Record<string, unknown>);
    expect(result.r2_backlog_batch_selected).toBe(3);
    expect(result.r2_mirrored).toBe(3);
  });

  it("does NOT re-query even when the batch is full (full batch processed in-memory)", async () => {
    wireBacklogMocks(Array.from({ length: 12 }, (_, i) => backlogRow(`L${i}`)));

    const result = await runMediaSync(makeOptions({ backlogBatchLimit: 12 }));

    const mainCalls = mockListingMediaFindMany.mock.calls.filter(isMainBacklogCall);
    expect(mainCalls.length).toBe(1);
    expect((mainCalls[0][0] as { take: number }).take).toBe(12);
    expect(result.r2_mirrored).toBe(12);
  });
});

// ─── 2. Failure isolation + bounded failure budget ───────────────────────

describe("Phase 4 — failure isolation and bounded failure budget", () => {
  it("A ok, B fails, C ok → B counted failed with standard bookkeeping only; C still processed", async () => {
    const a = backlogRow("A");
    const b = backlogRow("B");
    const c = backlogRow("C");
    wireBacklogMocks([a, b, c]);
    const mirrorDeps = makeMirrorDeps();
    // The R2 key is derived from listing_id (e.g. photos/B/1.jpg) — fail only B.
    (mirrorDeps.existsInR2 as jest.Mock).mockImplementation(async (key: string) => {
      if (key.includes("/B/")) throw new Error("R2 head failed");
      return true;
    });

    const result = await runMediaSync(makeOptions({ mirrorDeps }));

    expect(result.r2_failed).toBe(1);
    expect(result.r2_mirrored).toBe(2);
    expect(result.r2_failure_budget_exhausted).toBe(false);
    // B got ONLY the standard failure bookkeeping (attempts increment +
    // cooldown timestamp) — no r2_key write, no status change.
    const bWrites = mockListingMediaUpdate.mock.calls.filter(
      (call) => (call[0] as { where: { media_key: string } }).where.media_key === b.media_key,
    );
    expect(bWrites.length).toBe(1);
    const bData = (bWrites[0][0] as { data: Record<string, unknown> }).data;
    expect(bData.r2_attempts).toBe(1);
    expect(bData.r2_last_attempt_at).toBeInstanceOf(Date);
    expect(bData).not.toHaveProperty("r2_key");
    expect(bData).not.toHaveProperty("status");
  });

  it("stops attempting the remaining queue once R2_RUN_FAILURE_BUDGET failures accumulate (rows left untouched)", async () => {
    wireBacklogMocks(Array.from({ length: R2_RUN_FAILURE_BUDGET + 5 }, (_, i) => backlogRow(`F${i}`)));
    const mirrorDeps = makeMirrorDeps();
    (mirrorDeps.existsInR2 as jest.Mock).mockRejectedValue(new Error("R2 down"));

    const result = await runMediaSync(
      makeOptions({ mirrorDeps, backlogBatchLimit: R2_RUN_FAILURE_BUDGET + 5 }),
    );

    // Exactly the budget was consumed (chunked by concurrency, so the drain
    // stops at the first chunk boundary at/after the budget) — the remaining
    // rows were NEVER attempted (no mirror call, no DB write).
    expect(result.r2_failed).toBe(R2_RUN_FAILURE_BUDGET);
    expect(result.r2_failure_budget_exhausted).toBe(true);
    expect((mirrorDeps.existsInR2 as jest.Mock).mock.calls.length).toBe(R2_RUN_FAILURE_BUDGET);
    expect(mockListingMediaUpdate.mock.calls.length).toBe(R2_RUN_FAILURE_BUDGET);
  });

  it("failure budget NOT exhausted on a healthy run → flag false", async () => {
    const result = await runMediaSync(makeOptions());
    expect(result.r2_failure_budget_exhausted).toBe(false);
  });
});

// ─── 3. Parked-row recovery ──────────────────────────────────────────────

describe("Phase 4 — parked-row recovery (bounded, oldest-first, code-only)", () => {
  it("buildR2ParkedRecoveryWhere targets ONLY parked rows past the long cooldown (pure)", () => {
    const threshold = new Date("2026-07-14T00:00:00Z");
    const where = buildR2ParkedRecoveryWhere(threshold) as Record<string, unknown>;
    expect(where.status).toBe("active");
    expect(where.media_url_original).toEqual({ not: null });
    expect(where.r2_attempts).toEqual({ gte: R2_RETRY_EXHAUSTED_THRESHOLD });
    expect(where.r2_last_attempt_at).toEqual({ lt: threshold });
    const orFields = (where.OR as Array<Record<string, unknown>>).map((c) => Object.keys(c)[0]).sort();
    expect(orFields).toEqual(["media_url_cached", "r2_key"]);
  });

  it("selects at most the quota of parked rows, oldest r2_last_attempt_at first, and processes them", async () => {
    const parked = [
      backlogRow("P1", { r2_attempts: R2_RETRY_EXHAUSTED_THRESHOLD, r2_last_attempt_at: new Date("2026-07-01T00:00:00Z") }),
      backlogRow("P2", { r2_attempts: R2_RETRY_EXHAUSTED_THRESHOLD + 2, r2_last_attempt_at: new Date("2026-07-02T00:00:00Z") }),
    ];
    wireBacklogMocks([], parked);

    const result = await runMediaSync(makeOptions());

    const parkedCalls = mockListingMediaFindMany.mock.calls.filter(isParkedRecoveryCall);
    expect(parkedCalls.length).toBe(1);
    const args = parkedCalls[0][0] as { orderBy: unknown; take: number; where: Record<string, unknown> };
    expect(args.take).toBe(R2_PARKED_RECOVERY_QUOTA);
    expect(args.orderBy).toEqual([{ r2_last_attempt_at: "asc" }, { id: "asc" }]);
    // Cooldown threshold is the LONG parked cooldown, not the 6h retry cooldown.
    const lt = (args.where.r2_last_attempt_at as { lt: Date }).lt;
    expect(Date.now() - lt.getTime()).toBeGreaterThanOrEqual(R2_PARKED_RECOVERY_COOLDOWN_MS - 60_000);

    expect(result.r2_parked_recovery_attempted).toBe(2);
    expect(result.r2_mirrored).toBe(2); // recovered rows processed via the standard mirror
  });

  it("quota 0 disables parked recovery entirely (no parked query issued)", async () => {
    wireBacklogMocks([]);
    await runMediaSync(makeOptions({ parkedRecoveryQuota: 0 }));
    const parkedCalls = mockListingMediaFindMany.mock.calls.filter(isParkedRecoveryCall);
    expect(parkedCalls.length).toBe(0);
  });

  it("a recovered row that fails again gets the STANDARD failure bookkeeping (attempts increment — never a reset)", async () => {
    const parkedRow = backlogRow("PX", {
      r2_attempts: R2_RETRY_EXHAUSTED_THRESHOLD,
      r2_last_attempt_at: new Date("2026-07-01T00:00:00Z"),
    });
    wireBacklogMocks([], [parkedRow]);
    const mirrorDeps = makeMirrorDeps();
    (mirrorDeps.existsInR2 as jest.Mock).mockRejectedValue(new Error("still down"));

    const result = await runMediaSync(makeOptions({ mirrorDeps }));

    expect(result.r2_failed).toBe(1);
    const writes = mockListingMediaUpdate.mock.calls.filter(
      (call) => (call[0] as { where: { media_key: string } }).where.media_key === parkedRow.media_key,
    );
    expect(writes.length).toBe(1);
    const data = (writes[0][0] as { data: Record<string, unknown> }).data;
    // Increment from the EXISTING production counter — selection never reset it.
    expect(data.r2_attempts).toBe(R2_RETRY_EXHAUSTED_THRESHOLD + 1);
    expect(data.r2_last_attempt_at).toBeInstanceOf(Date);
    // Non-permanent failure → still active (RC3 guarantee: never deleted by parking/recovery).
    expect(data).not.toHaveProperty("status");
  });

  it("main backlog rows take priority; parked rows are appended after them in the same bounded run", async () => {
    const main = [backlogRow("M1"), backlogRow("M2")];
    const parked = [
      backlogRow("P1", { r2_attempts: R2_RETRY_EXHAUSTED_THRESHOLD, r2_last_attempt_at: new Date("2026-07-01T00:00:00Z") }),
    ];
    wireBacklogMocks(main, parked);
    const seen: string[] = [];
    const mirrorDeps = makeMirrorDeps();
    (mirrorDeps.existsInR2 as jest.Mock).mockImplementation(async (key: string) => {
      seen.push(key);
      return true;
    });

    const result = await runMediaSync(makeOptions({ mirrorDeps }));
    expect(result.r2_mirrored).toBe(3);
    expect(result.r2_backlog_batch_selected).toBe(2);
    expect(result.r2_parked_recovery_attempted).toBe(1);
    // Parked keys mirror AFTER the main backlog keys.
    const firstParkedIdx = seen.findIndex((k) => k.includes("P1"));
    const lastMainIdx = Math.max(seen.findIndex((k) => k.includes("M1")), seen.findIndex((k) => k.includes("M2")));
    expect(firstParkedIdx).toBeGreaterThan(lastMainIdx);
  });
});
