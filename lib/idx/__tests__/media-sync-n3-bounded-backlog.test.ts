/// <reference types="jest" />
/**
 * N3 (2026-07-18) — Phase-3 single bounded backlog fetch (Neon closure program).
 *
 * Root cause under test (register R3, T1-measured): the pre-N3 Phase-3
 * while-loop re-ran the backlog eligibility `findMany` — a Parallel Seq Scan
 * over ~300K listing_media rows with NO covering index — before EVERY 5-row
 * mirror wave, with a growing `id: { notIn: [...attempted] }` list. T1
 * measured ~45 scans/run average → ~1,077 seq scans and ~108M tuples read per
 * day on listing_media from this loop plus the once-per-run Phase-4 count.
 *
 * N3 contract proven here:
 *   1. Exactly ONE bounded candidate `findMany` per run (query_count = 1),
 *      proven by mock-counting findMany invocations — never re-queried
 *      mid-run, not even on budget exit or per-row failure.
 *   2. The fetch uses buildR2BacklogWhere with an EMPTY attempted set (no
 *      `id` filter), orderBy created_at asc + id asc tiebreak,
 *      take = MAX_R2_CANDIDATES_PER_RUN.
 *   3. Candidates are processed in concurrency-5 waves until exhausted OR the
 *      Phase-2 time budget hits; a budget exit leaves the remaining
 *      candidates unprocessed with exit_reason='budget_phase2'.
 *   4. Preserved semantics: cross-invocation 6h cooldown + RC3
 *      retry-exhausted parking (same `where`), failure paths still write
 *      cooldown state (r2_last_attempt_at / r2_attempts), tombstone-on-3rd-4xx.
 *   5. Counters reconcile: backlog_processed_count ≤ backlog_candidate_count;
 *      backlog_query_count exact (1 when Phase 3 ran, 0 when budget-skipped
 *      or source_error).
 *
 * NOTE: the Phase-4 `backlog_remaining` COUNT query is separate pre-existing
 * behavior — it still runs once per run and is intentionally NOT part of
 * backlog_query_count (see the run-total assertions below).
 */

import type {
  MediaSyncFetchDeps,
  MirrorMediaToR2Deps,
  RunMediaSyncOptions,
} from "../media-sync";

// ─── Mock Prisma (matches media-sync-orchestration.test.ts pattern) ──────

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
  buildR2BacklogWhere,
  runMediaSync,
  MAX_R2_CANDIDATES_PER_RUN,
  R2_MIRROR_CONCURRENCY,
  R2_RETRY_EXHAUSTED_THRESHOLD,
} from "../media-sync";

beforeEach(() => {
  mockMediaSyncFindUnique.mockReset();
  mockMediaSyncUpsert.mockReset();
  mockListingMediaFindUnique.mockReset();
  mockListingMediaCreate.mockReset();
  mockListingMediaUpdate.mockReset();
  mockListingMediaUpdateMany.mockReset();
  mockListingMediaFindMany.mockReset();
  mockListingMediaCount.mockReset();
  mockListingUpdate.mockReset();
  mockListingFindUnique.mockReset();

  mockMediaSyncFindUnique.mockResolvedValue(null);
  mockListingFindUnique.mockImplementation(async (args: unknown) => ({
    listing_id: (args as { where?: { listing_id?: string } })?.where?.listing_id,
  }));
  mockListingMediaUpdateMany.mockResolvedValue({ count: 0 });
  mockListingMediaFindMany.mockResolvedValue([]);
  mockListingMediaCount.mockResolvedValue(0);
  mockListingMediaUpdate.mockResolvedValue(undefined);
  mockListingUpdate.mockResolvedValue(undefined);
  mockMediaSyncUpsert.mockResolvedValue(undefined);
});

// ─── Helpers ─────────────────────────────────────────────────────────────

function makeCandidate(i: number) {
  return {
    id: BigInt(1000 + i),
    listing_id: `RLS-${i}`,
    media_key: `MK-${i}`,
    media_type: "Photo",
    order: 1,
    media_url_original: `https://api.cotality.com/photo-${i}.jpg`,
    r2_key: null,
    media_url_cached: null,
    r2_attempts: null,
  };
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

function makeFetchDeps(): MediaSyncFetchDeps {
  return {
    fetchProperties: jest.fn().mockResolvedValue([]),
    fetchMedia: jest.fn().mockResolvedValue([]),
  };
}

function makeOptions(overrides: Partial<RunMediaSyncOptions> = {}): RunMediaSyncOptions {
  return {
    listingsPerRun: 10,
    fallbackWindowDays: 7,
    fetchDeps: makeFetchDeps(),
    mirrorDeps: makeMirrorDeps(),
    ...overrides,
  };
}

/** Filter mock findMany calls down to Phase-3 backlog-shaped queries. */
function backlogCalls() {
  return mockListingMediaFindMany.mock.calls.filter((call) => {
    const args = call[0] as { where?: { status?: string; OR?: unknown[] } };
    return args?.where?.status === "active" && Array.isArray(args.where.OR);
  });
}

// ─── 1. Single bounded query per run ─────────────────────────────────────

describe("N3 — exactly one bounded backlog findMany per run", () => {
  it("issues EXACTLY 1 backlog findMany (query_count=1) even across multiple waves", async () => {
    // 7 candidates → 2 waves (5 + 2). Pre-N3 this was ≥3 findMany calls.
    const candidates = Array.from({ length: 7 }, (_, i) => makeCandidate(i));
    mockListingMediaFindMany.mockResolvedValueOnce(candidates).mockResolvedValue([]);

    const result = await runMediaSync(makeOptions());

    expect(result.backlog_query_count).toBe(1);
    expect(backlogCalls()).toHaveLength(1);
    expect(result.backlog_candidate_count).toBe(7);
    expect(result.backlog_processed_count).toBe(7);
    expect(result.r2_mirrored).toBe(7);
    // Run-total DB reads on listing_media: 1 candidate fetch (counted) + the
    // pre-existing Phase-4 backlog_remaining COUNT (separate, NOT counted).
    expect(mockListingMediaFindMany).toHaveBeenCalledTimes(1);
    expect(mockListingMediaCount).toHaveBeenCalledTimes(1);
  });

  it("still exactly 1 query when every candidate FAILS (no notIn re-query for failed rows)", async () => {
    const candidates = Array.from({ length: 6 }, (_, i) => makeCandidate(i));
    mockListingMediaFindMany.mockResolvedValueOnce(candidates).mockResolvedValue([]);

    const mirrorDeps = makeMirrorDeps();
    (mirrorDeps.existsInR2 as jest.Mock).mockRejectedValue(new Error("R2 down"));

    const result = await runMediaSync(makeOptions({ mirrorDeps }));

    expect(result.r2_failed).toBe(6);
    expect(result.backlog_query_count).toBe(1);
    expect(backlogCalls()).toHaveLength(1);
    // Each failed row attempted exactly once (in-memory attempted set).
    expect((mirrorDeps.existsInR2 as jest.Mock).mock.calls.length).toBe(6);
  });

  it("the single query uses the no-notIn where, created_at+id ordering, and the MAX_R2_CANDIDATES_PER_RUN cap", async () => {
    const fixedNow = jest.fn(() => new Date("2026-07-18T12:00:00.000Z").getTime());
    await runMediaSync(makeOptions({ now: fixedNow }));

    const calls = backlogCalls();
    expect(calls).toHaveLength(1);
    const args = calls[0][0] as {
      where: Record<string, unknown>;
      orderBy: unknown;
      take: number;
      select: Record<string, boolean>;
    };
    // Where matches buildR2BacklogWhere(cooldownThreshold, []) exactly —
    // cooldown threshold = now − 6h; NO id/notIn key present.
    expect(args.where).toEqual(
      buildR2BacklogWhere(new Date("2026-07-18T06:00:00.000Z"), []),
    );
    expect(args.where).not.toHaveProperty("id");
    expect(args.orderBy).toEqual([{ created_at: "asc" }, { id: "asc" }]);
    expect(args.take).toBe(MAX_R2_CANDIDATES_PER_RUN);
    // Select still carries id (attempt tracking) + r2_attempts (Cp4 tombstone).
    expect(args.select.id).toBe(true);
    expect(args.select.r2_attempts).toBe(true);
  });

  it("MAX_R2_CANDIDATES_PER_RUN covers the old loop's observed per-run ceiling (~45 waves × 5)", () => {
    expect(MAX_R2_CANDIDATES_PER_RUN).toBe(250);
    expect(MAX_R2_CANDIDATES_PER_RUN).toBeGreaterThanOrEqual(45 * R2_MIRROR_CONCURRENCY);
  });

  it("budget exhausted at Phase-3 entry → ZERO backlog queries (query_count=0)", async () => {
    // Clock starts with only 1ms of budget left — Phase 3 must not query at all.
    const now = jest.fn(() => 0);
    const result = await runMediaSync(
      makeOptions({ now, budgetMs: 1, phase1ReserveMs: 0, phase2ReserveMs: 12_000 }),
    );

    expect(result.backlog_query_count).toBe(0);
    expect(result.backlog_candidate_count).toBe(0);
    expect(result.backlog_processed_count).toBe(0);
    expect(backlogCalls()).toHaveLength(0);
  });

  it("source_error → zero N3 counters and no Phase-3 query", async () => {
    const fetchDeps: MediaSyncFetchDeps = {
      fetchProperties: jest.fn().mockRejectedValue(new Error("Property fetch failed: HTTP 503")),
      fetchMedia: jest.fn(),
    };
    const result = await runMediaSync(makeOptions({ fetchDeps }));

    expect(result.status).toBe("error");
    expect(result.exit_reason).toBe("source_error");
    expect(result.backlog_query_count).toBe(0);
    expect(result.backlog_candidate_count).toBe(0);
    expect(result.backlog_processed_count).toBe(0);
    expect(mockListingMediaFindMany).not.toHaveBeenCalled();
  });
});

// ─── 2. Wave processing + budget exit ────────────────────────────────────

describe("N3 — concurrency-5 waves over the fixed in-memory set", () => {
  it("processes candidates in waves of at most R2_MIRROR_CONCURRENCY", async () => {
    const candidates = Array.from({ length: 12 }, (_, i) => makeCandidate(i));
    mockListingMediaFindMany.mockResolvedValueOnce(candidates).mockResolvedValue([]);

    const mirrorDeps = makeMirrorDeps();
    let inFlight = 0;
    let maxInFlight = 0;
    (mirrorDeps.existsInR2 as jest.Mock).mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 0));
      inFlight--;
      return true;
    });

    const result = await runMediaSync(makeOptions({ mirrorDeps }));

    expect(result.r2_mirrored).toBe(12);
    expect(maxInFlight).toBe(R2_MIRROR_CONCURRENCY);
    expect(result.backlog_query_count).toBe(1);
  });

  it("budget exit mid-set: remaining candidates left unprocessed, exit_reason='budget_phase2', NO re-query", async () => {
    // 8 candidates fetched; the clock jumps past the budget after the first
    // 5-wave completes → wave 2 must not start; 3 candidates stay unprocessed.
    const candidates = Array.from({ length: 8 }, (_, i) => makeCandidate(i));
    mockListingMediaFindMany.mockResolvedValueOnce(candidates).mockResolvedValue([]);

    let clock = 0;
    const now = jest.fn(() => clock);
    const mirrorDeps = makeMirrorDeps();
    let mirrorCalls = 0;
    (mirrorDeps.existsInR2 as jest.Mock).mockImplementation(async () => {
      mirrorCalls++;
      if (mirrorCalls === 5) clock = 999_999_999; // budget blown after wave 1
      return true;
    });

    const result = await runMediaSync(makeOptions({ now, mirrorDeps }));

    expect(result.exit_reason).toBe("budget_phase2");
    expect(result.backlog_candidate_count).toBe(8);
    expect(result.backlog_processed_count).toBe(5); // wave 1 only
    expect(result.r2_mirrored).toBe(5);
    expect(mirrorCalls).toBe(5); // candidates 6–8 never attempted
    // CRITICAL: budget exit did NOT trigger any additional query.
    expect(result.backlog_query_count).toBe(1);
    expect(backlogCalls()).toHaveLength(1);
  });

  it("counters reconcile: processed ≤ candidates; candidates ≤ cap; query_count exact", async () => {
    const candidates = Array.from({ length: 9 }, (_, i) => makeCandidate(i));
    mockListingMediaFindMany.mockResolvedValueOnce(candidates).mockResolvedValue([]);

    const result = await runMediaSync(makeOptions());

    expect(result.backlog_processed_count).toBeLessThanOrEqual(result.backlog_candidate_count);
    expect(result.backlog_candidate_count).toBeLessThanOrEqual(MAX_R2_CANDIDATES_PER_RUN);
    expect(result.backlog_query_count).toBe(1);
    expect(result.backlog_processed_count).toBe(9);
    expect(result.r2_mirrored + result.r2_failed + result.r2_skipped).toBe(
      result.backlog_processed_count,
    );
  });
});

// ─── 3. Preserved eligibility semantics (no-notIn where form) ────────────

describe("N3 — buildR2BacklogWhere no-notIn form preserves cooldown + RC3 parking", () => {
  const cooldown = new Date("2026-07-18T06:00:00.000Z");

  it("empty attempted set ⇒ NO id key at all (not an empty notIn array)", () => {
    const where = buildR2BacklogWhere(cooldown, []) as Record<string, unknown>;
    expect(where).not.toHaveProperty("id");
  });

  it("no-notIn form still excludes cooling-down rows (r2_last_attempt_at ≥ threshold)", () => {
    const where = buildR2BacklogWhere(cooldown, []) as {
      AND: Array<{ OR?: Array<Record<string, unknown>> }>;
    };
    const cooldownClause = where.AND.find(
      (c) => Array.isArray(c.OR) && c.OR.some((o) => "r2_last_attempt_at" in o),
    );
    expect(cooldownClause).toBeDefined();
    expect(cooldownClause!.OR).toEqual([
      { r2_last_attempt_at: null },
      { r2_last_attempt_at: { lt: cooldown } },
    ]);
  });

  it("no-notIn form still parks RC3 retry-exhausted rows (r2_attempts >= threshold excluded)", () => {
    const where = buildR2BacklogWhere(cooldown, []) as {
      AND: Array<{ OR?: Array<Record<string, unknown>> }>;
    };
    const exhaustionClause = where.AND.find(
      (c) => Array.isArray(c.OR) && c.OR.some((o) => "r2_attempts" in o),
    );
    expect(exhaustionClause).toBeDefined();
    expect(exhaustionClause!.OR).toEqual([
      { r2_attempts: null },
      { r2_attempts: { lt: R2_RETRY_EXHAUSTED_THRESHOLD } },
    ]);
  });

  it("no-notIn form is IDENTICAL to the pre-N3 empty-attempted-set where (byte-for-byte eligibility parity)", () => {
    // The pre-N3 loop's FIRST iteration also called buildR2BacklogWhere with
    // an empty attempted list — N3's single fetch reuses exactly that form,
    // so run-entry eligibility is provably unchanged.
    expect(buildR2BacklogWhere(cooldown, [])).toEqual(buildR2BacklogWhere(cooldown, []));
    const withIds = buildR2BacklogWhere(cooldown, [1n]) as Record<string, unknown>;
    const { id: _id, ...withIdsMinusId } = withIds;
    expect(withIdsMinusId).toEqual(buildR2BacklogWhere(cooldown, []));
  });
});

// ─── 4. Preserved failure-path write behavior ────────────────────────────

describe("N3 — failure paths still write cooldown state (Cp4 untouched)", () => {
  it("a transient mirror failure writes r2_last_attempt_at + increments r2_attempts (no tombstone)", async () => {
    const row = makeCandidate(0);
    mockListingMediaFindMany.mockResolvedValueOnce([row]).mockResolvedValue([]);

    const mirrorDeps = makeMirrorDeps();
    (mirrorDeps.existsInR2 as jest.Mock).mockResolvedValue(false);
    // Transient HTTP 500 on the source fetch → cooldown write, NEVER tombstone.
    mirrorDeps.fetchFn = jest.fn(
      async () => new Response(new Uint8Array(0), { status: 500 }),
    ) as typeof fetch;

    const result = await runMediaSync(makeOptions({ mirrorDeps }));

    expect(result.r2_failed).toBe(1);
    const failureWrite = mockListingMediaUpdate.mock.calls.find((call) => {
      const args = call[0] as { data: Record<string, unknown> };
      return "r2_last_attempt_at" in args.data;
    });
    expect(failureWrite).toBeDefined();
    const data = (failureWrite![0] as { data: Record<string, unknown> }).data;
    expect(data.r2_last_attempt_at).toBeInstanceOf(Date);
    expect(data.r2_attempts).toBe(1); // null prior → first failure
    expect(data.status).toBeUndefined(); // transient 5xx never tombstones
  });

  it("tombstone-on-3rd-4xx still fires (r2_attempts=2 prior + HTTP 404 ⇒ status='deleted')", async () => {
    const row = { ...makeCandidate(0), r2_attempts: 2 };
    mockListingMediaFindMany.mockResolvedValueOnce([row]).mockResolvedValue([]);

    const mirrorDeps = makeMirrorDeps();
    (mirrorDeps.existsInR2 as jest.Mock).mockResolvedValue(false);
    mirrorDeps.fetchFn = jest.fn(
      async () => new Response(new Uint8Array(0), { status: 404 }),
    ) as typeof fetch;

    const result = await runMediaSync(makeOptions({ mirrorDeps }));

    expect(result.r2_failed).toBe(1);
    const tombstone = mockListingMediaUpdate.mock.calls.find((call) => {
      const args = call[0] as { data: Record<string, unknown> };
      return args.data.status === "deleted";
    });
    expect(tombstone).toBeDefined();
    const data = (tombstone![0] as { data: Record<string, unknown> }).data;
    expect(data.r2_attempts).toBe(3);
    expect(data.r2_last_attempt_at).toBeInstanceOf(Date);
  });

  it("a media_key-less candidate is counted r2_skipped without any mirror attempt (skip path preserved)", async () => {
    const row = { ...makeCandidate(0), media_key: null };
    mockListingMediaFindMany.mockResolvedValueOnce([row]).mockResolvedValue([]);

    const mirrorDeps = makeMirrorDeps();
    const result = await runMediaSync(makeOptions({ mirrorDeps }));

    expect(result.r2_skipped).toBe(1);
    expect(result.backlog_processed_count).toBe(1);
    expect((mirrorDeps.existsInR2 as jest.Mock).mock.calls.length).toBe(0);
  });
});
