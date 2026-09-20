/**
 * Phase 4 — bounded R2 backlog + reserved parked-row recovery + hard failure
 * cap (failing-first TDD; stacked on #547→#549; Maya re-review round 2).
 *
 * Contract proven here:
 *   1. BOUNDED SELECTION — at most TWO bounded CANDIDATE-SELECTION queries
 *      per run (one main backlog selection; zero-or-one parked recovery
 *      selection). The pre-existing `backlog_remaining` COUNT query is
 *      separate and unchanged. No per-iteration re-query, no growing
 *      `id notIn` list. Correct WITHOUT the partial index (which exists
 *      only in #544's prepared, UNAPPLIED migration — not in this stack).
 *   2. PARKED ELIGIBILITY IS EXACT-MATCH FAILURE-EXHAUSTION ONLY —
 *      `r2_attempts` must equal R2_RETRY_EXHAUSTED_THRESHOLD (8) exactly.
 *      Anything ABOVE is excluded fail-closed: the approved #534
 *      mirror-admission-policy design reserves attempts=9 as a permanent
 *      POLICY-park sentinel (non-hero third-party gallery media,
 *      unsupported types) that recovery must never re-admit.
 *   3. RESERVED RECOVERY ALLOWANCE — parked rows are NOT appended behind
 *      the main queue; they get their own explicitly reserved chunk FIRST,
 *      so a saturated main backlog cannot starve recovery run after run.
 *      `r2_parked_recovery_selected` = query result size;
 *      `r2_parked_recovery_attempted` increments ONLY when a row is
 *      actually handed to mirrorMediaToR2. Parked failures do NOT consume
 *      the main failure budget (they are naturally bounded by the quota).
 *   4. HARD FAILURE CAP — main-drain chunk size is
 *      min(R2_MIRROR_CONCURRENCY, remaining failure allowance), so main
 *      failures can NEVER exceed R2_RUN_FAILURE_BUDGET.
 *      `r2_failure_budget_exhausted` is true ONLY when the cap stopped the
 *      drain early leaving ≥1 selected main row unattempted.
 *
 * No live R2, no live Trestle, no live DB.
 */

import type {
  MediaSyncFetchDeps,
  MirrorMediaToR2Deps,
  RunMediaSyncOptions,
} from "../media-sync";
import { createRawUpdateStore, type RawRowState } from "./raw-failure-write-store";

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

/**
 * PR #584. Failure bookkeeping is ONE parameterized `UPDATE ... RETURNING`, so
 * the failure assertions below read the STORED ROW rather than a Prisma
 * payload. Rows materialise at the counter their fixture declares.
 */
const fixtureRows = new Map<string, Partial<RawRowState>>();
const store = createRawUpdateStore((key) => fixtureRows.get(key));
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
    auditEvent: {
      findMany: async () => [],
    },
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) =>
      store.exec(strings, values),
    $transaction: (fn: unknown) =>
      (fn as (tx: unknown) => unknown)({
        $queryRaw: async () => [{ locked: true }],
        listingMedia: { findMany: (a: unknown) => mockListingMediaFindMany(a) },
      }),
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
  store.reset();
  fixtureRows.clear();
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
  const row = {
    id: nextId,
    listing_id: listingId,
    media_key: `MK-${listingId}-${String(nextId)}`,
    media_type: "Photo",
    order: 1,
    media_url_original: `https://api.cotality.com/trestle/Media/${listingId}.jpg?sig=X`,
    r2_key: null,
    media_url_cached: null,
    r2_attempts: null,
    // R2-1 admission relation: Mallan-owned (rls_eligible=false =>
    // all_active scope) so every Photo row is admitted and this suite keeps
    // testing pure Phase-4 drain semantics, not the admission policy
    // (which has its own suite: media-sync-r21-mirror-policy.test.ts).
    listing: {
      listing_id: listingId,
      rls_eligible: false,
      status: "Active",
      idx_display_yn: false,
      owner_opt_out: false,
      participant_only: false,
      internet_entire_listing_display_yn: false,
    },
    ...over,
  };
  // Register the fixture's starting state so the failure statement's
  // database-side arithmetic begins from the counter this row declares.
  // The fixture itself is unchanged.
  fixtureRows.set(row.media_key as string, {
    r2_attempts: (row.r2_attempts as number | null) ?? null,
    status: "active",
    r2_key: (row.r2_key as string | null) ?? null,
    media_url_cached: (row.media_url_cached as string | null) ?? null,
  });
  return row;
}

/**
 * PHASE 4a's bounded policy re-admission SELECT. It also carries
 * `status: 'active'` and a top-level `OR`, so `isMainBacklogCall` must exclude
 * it — otherwise "exactly ONE main-backlog selection" would silently start
 * counting two structurally different queries. Keyed on the one clause only
 * this selector has: an AGE comparison on `r2_policy_excluded_at`.
 */
function isPolicyReevalCall(call: unknown[]): boolean {
  const args = call[0] as { where?: Record<string, unknown> };
  const and = (args?.where?.AND as Array<Record<string, unknown>> | undefined) ?? [];
  return and.some((c) => {
    const or = (c as { OR?: Array<Record<string, unknown>> }).OR;
    return (
      Array.isArray(or) &&
      or.some((o) => (o?.r2_policy_excluded_at as { lt?: unknown } | null)?.lt !== undefined)
    );
  });
}

/** Main bounded backlog query: active + OR-missing-R2 + NOT parked-scoped. */
function isMainBacklogCall(call: unknown[]): boolean {
  const args = call[0] as { where?: { status?: string; OR?: unknown[]; r2_attempts?: unknown }; select?: Record<string, unknown> };
  return (
    args?.where?.status === "active" &&
    Array.isArray(args.where.OR) &&
    args.where.r2_attempts === undefined &&
    !isPolicyReevalCall(call) &&
    // W3: exclude the bounded backlog_remaining PROBE (ids-only select).
    !(args.select && Object.keys(args.select).join(",") === "id")
  );
}

/** Parked-recovery query: keyed on the top-level r2_attempts predicate. */
function isParkedRecoveryCall(call: unknown[]): boolean {
  const args = call[0] as { where?: { r2_attempts?: unknown } };
  return args?.where?.r2_attempts !== undefined;
}

/**
 * Serve each queue EXACTLY ONCE, [] afterwards. This kept the PRE-Phase-4
 * unbounded re-query loop terminating during the original RED run and stays
 * shape-agnostic for the bounded implementation.
 */
function wireBacklogMocks(main: unknown[], parked: unknown[] = []) {
  let mainServed = false;
  let parkedServed = false;
  mockListingMediaFindMany.mockImplementation(async (args: unknown) => {
    // PHASE 4a re-admission sweep: no row in these fixtures is policy-parked,
    // so the honest answer is an empty candidate set. Answered FIRST so it can
    // never be mistaken for the main backlog queue.
    if (isPolicyReevalCall([args])) return [];
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

/** Fail every mirror whose derived R2 key contains `/F` (listing ids F*). */
function failByListingPrefix(mirrorDeps: MirrorMediaToR2Deps, prefix: string) {
  (mirrorDeps.existsInR2 as jest.Mock).mockImplementation(async (key: string) => {
    if (key.includes(`/${prefix}`)) throw new Error("R2 head failed");
    return true;
  });
}

// ─── 1. Bounded candidate selection ──────────────────────────────────────

describe("Phase 4 — bounded candidate selection (at most two selection queries)", () => {
  it("issues exactly ONE bounded main-backlog selection with deterministic ordering and NO id notIn filter", async () => {
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
    // W3: PK ordering (monotone insertion key ≈ created_at FIFO, no sort node).
    expect(args.orderBy).toEqual([{ id: "asc" }]);
    expect(args.where).not.toHaveProperty("id"); // no growing notIn list
    const cooldownLt = (args.where as { AND: Array<{ OR: Array<{ r2_last_attempt_at?: { lt: Date } }> }> })
      .AND[0].OR[1].r2_last_attempt_at!.lt;
    expect(args.where).toEqual(buildR2BacklogWhere(cooldownLt, []) as unknown as Record<string, unknown>);
    expect(result.r2_backlog_batch_selected).toBe(3);
    expect(result.r2_mirrored).toBe(3);
    // At most two candidate-selection queries total (main + parked).
    const parkedCalls = mockListingMediaFindMany.mock.calls.filter(isParkedRecoveryCall);
    expect(parkedCalls.length).toBeLessThanOrEqual(1);
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

// ─── 2. Failure isolation + HARD failure cap ─────────────────────────────

describe("Phase 4 — failure isolation and HARD per-run failure cap", () => {
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
    const bWrites = store.writesFor(b.media_key);
    // ONE write — cooldown, counter and status commit together.
    expect(bWrites.length).toBe(1);
    const bAfter = bWrites[0].after;
    expect(bAfter.r2_last_attempt_at).toBeInstanceOf(Date);
    expect(bAfter.r2_key).toBeNull();
    // Transient failure — MUST NOT tombstone.
    expect(bAfter.status).toBe("active");

    // TERMINAL-STATE BEHAVIOUR: the counter is derived by the database from
    // the value stored at the moment the statement ran, never from a blind
    // JS literal. B started at NULL, so its FIRST failure stores 1.
    expect(bWrites[0].before.r2_attempts).toBeNull();
    expect(bAfter.r2_attempts).toBe(1);
    // The media key is a BOUND PARAMETER, never SQL text.
    expect(bWrites[0].params).toContain(b.media_key);

    // Unaffected rows were still processed — A and C mirrored normally.
    expect(store.writesFor(a.media_key)).toHaveLength(0);
    expect(store.writesFor(c.media_key)).toHaveLength(0);
  });

  it("HARD CAP: entering a chunk with 9 failures cannot overshoot — main failures never exceed the budget", async () => {
    // 12 rows: 5 fail | 4 fail + 1 succeed | 2 fail. The hard cap shrinks the
    // third chunk to min(5, 10-9=1) → exactly ONE more attempt → 10 failures
    // total; the 12th row is never attempted.
    const rows = [
      ...Array.from({ length: 5 }, (_, i) => backlogRow(`F1${i}`)),
      ...Array.from({ length: 4 }, (_, i) => backlogRow(`F2${i}`)),
      backlogRow("S-OK"),
      backlogRow("F30"),
      backlogRow("F31"),
    ];
    wireBacklogMocks(rows);
    const mirrorDeps = makeMirrorDeps();
    failByListingPrefix(mirrorDeps, "F");

    const result = await runMediaSync(makeOptions({ mirrorDeps, backlogBatchLimit: 12 }));

    expect(result.r2_failed).toBe(R2_RUN_FAILURE_BUDGET); // exactly 10 — never 11
    expect(result.r2_mirrored).toBe(1); // the S-OK row
    // 11 attempts total (5 + 5 + 1); the final row was never handed to the mirror.
    expect((mirrorDeps.existsInR2 as jest.Mock).mock.calls.length).toBe(11);
    // Untouched remainder → budget-exhausted flag TRUE.
    expect(result.r2_failure_budget_exhausted).toBe(true);
  });

  it("flag FALSE when the 10th failure lands on the LAST queue row (nothing left untouched)", async () => {
    wireBacklogMocks(Array.from({ length: R2_RUN_FAILURE_BUDGET }, (_, i) => backlogRow(`F${i}`)));
    const mirrorDeps = makeMirrorDeps();
    failByListingPrefix(mirrorDeps, "F");

    const result = await runMediaSync(
      makeOptions({ mirrorDeps, backlogBatchLimit: R2_RUN_FAILURE_BUDGET }),
    );

    expect(result.r2_failed).toBe(R2_RUN_FAILURE_BUDGET);
    // Every selected row WAS attempted → the budget did not stop the drain early.
    expect(result.r2_failure_budget_exhausted).toBe(false);
    expect((mirrorDeps.existsInR2 as jest.Mock).mock.calls.length).toBe(R2_RUN_FAILURE_BUDGET);
  });

  it("budget cutoff leaves the remainder UNTOUCHED (no mirror call, no DB write) and flag TRUE", async () => {
    wireBacklogMocks(Array.from({ length: R2_RUN_FAILURE_BUDGET + 5 }, (_, i) => backlogRow(`F${i}`)));
    const mirrorDeps = makeMirrorDeps();
    (mirrorDeps.existsInR2 as jest.Mock).mockRejectedValue(new Error("R2 down"));

    const result = await runMediaSync(
      makeOptions({ mirrorDeps, backlogBatchLimit: R2_RUN_FAILURE_BUDGET + 5 }),
    );

    expect(result.r2_failed).toBe(R2_RUN_FAILURE_BUDGET);
    expect(result.r2_failure_budget_exhausted).toBe(true);
    expect((mirrorDeps.existsInR2 as jest.Mock).mock.calls.length).toBe(R2_RUN_FAILURE_BUDGET);
    // Exactly one failure write per attempted row, and none for the untouched
    // remainder.
    expect(store.writes.length).toBe(R2_RUN_FAILURE_BUDGET);
  });

  it("failure budget NOT exhausted on a healthy run → flag false", async () => {
    const result = await runMediaSync(makeOptions());
    expect(result.r2_failure_budget_exhausted).toBe(false);
  });
});

// ─── 3. Parked-row recovery ──────────────────────────────────────────────

describe("Phase 4 — parked-row recovery (exact-match sentinel-safe, reserved-first)", () => {
  it("buildR2ParkedRecoveryWhere uses EXACT-match failure exhaustion (attempts === 8), never gte (pure)", () => {
    const threshold = new Date("2026-07-14T00:00:00Z");
    const where = buildR2ParkedRecoveryWhere(threshold) as Record<string, unknown>;
    expect(where.status).toBe("active");
    expect(where.media_url_original).toEqual({ not: null });
    // Blocker 1: attempts ABOVE the threshold are excluded fail-closed — the
    // approved #534 design reserves attempts=9 as a permanent POLICY-park
    // sentinel that recovery must never re-admit.
    expect(where.r2_attempts).toBe(R2_RETRY_EXHAUSTED_THRESHOLD);
    expect(where.r2_last_attempt_at).toEqual({ lt: threshold });
    const orFields = (where.OR as Array<Record<string, unknown>>).map((c) => Object.keys(c)[0]).sort();
    expect(orFields).toEqual(["media_url_cached", "r2_key"]);
  });

  it("eligibility semantics: 7 excluded · 8 past cooldown eligible · 9 excluded (policy sentinel) · 10+ excluded · 8 within cooldown excluded", () => {
    const threshold = new Date("2026-07-14T00:00:00.000Z");
    const where = buildR2ParkedRecoveryWhere(threshold) as {
      r2_attempts: unknown;
      r2_last_attempt_at: { lt: Date };
    };
    // Minimal evaluator over the predicate we ship: exact-number equality
    // for r2_attempts (a {gte} object would make 9/10 pass → RED pre-fix).
    const eligible = (attempts: number, lastAttempt: Date): boolean => {
      const attemptsOk =
        typeof where.r2_attempts === "number"
          ? attempts === where.r2_attempts
          : attempts >= (where.r2_attempts as { gte: number }).gte;
      return attemptsOk && lastAttempt < where.r2_last_attempt_at.lt;
    };
    const past = new Date("2026-07-01T00:00:00Z");
    const recent = new Date("2026-07-20T00:00:00Z");
    expect(eligible(R2_RETRY_EXHAUSTED_THRESHOLD - 1, past)).toBe(false); // 7: not exhausted
    expect(eligible(R2_RETRY_EXHAUSTED_THRESHOLD, past)).toBe(true);      // 8 + cooled: eligible
    expect(eligible(R2_RETRY_EXHAUSTED_THRESHOLD + 1, past)).toBe(false); // 9: #534 policy sentinel
    expect(eligible(R2_RETRY_EXHAUSTED_THRESHOLD + 2, past)).toBe(false); // 10+: fail-closed
    expect(eligible(R2_RETRY_EXHAUSTED_THRESHOLD, recent)).toBe(false);   // 8 within cooldown
  });

  it("selects at most the quota, oldest r2_last_attempt_at first; SELECTED and ATTEMPTED both reported", async () => {
    const parked = [
      backlogRow("P1", { r2_attempts: R2_RETRY_EXHAUSTED_THRESHOLD, r2_last_attempt_at: new Date("2026-07-01T00:00:00Z") }),
      backlogRow("P2", { r2_attempts: R2_RETRY_EXHAUSTED_THRESHOLD, r2_last_attempt_at: new Date("2026-07-02T00:00:00Z") }),
    ];
    wireBacklogMocks([], parked);

    const result = await runMediaSync(makeOptions());

    const parkedCalls = mockListingMediaFindMany.mock.calls.filter(isParkedRecoveryCall);
    expect(parkedCalls.length).toBe(1);
    const args = parkedCalls[0][0] as { orderBy: unknown; take: number; where: Record<string, unknown> };
    expect(args.take).toBe(R2_PARKED_RECOVERY_QUOTA);
    expect(args.orderBy).toEqual([{ r2_last_attempt_at: "asc" }, { id: "asc" }]);
    const lt = (args.where.r2_last_attempt_at as { lt: Date }).lt;
    expect(Date.now() - lt.getTime()).toBeGreaterThanOrEqual(R2_PARKED_RECOVERY_COOLDOWN_MS - 60_000);

    expect(result.r2_parked_recovery_selected).toBe(2);
    expect(result.r2_parked_recovery_attempted).toBe(2); // both actually mirrored this run
    expect(result.r2_mirrored).toBe(2);
  });

  it("quota 0 disables parked recovery entirely (no selection query issued)", async () => {
    wireBacklogMocks([]);
    const result = await runMediaSync(makeOptions({ parkedRecoveryQuota: 0 }));
    const parkedCalls = mockListingMediaFindMany.mock.calls.filter(isParkedRecoveryCall);
    expect(parkedCalls.length).toBe(0);
    expect(result.r2_parked_recovery_selected).toBe(0);
    expect(result.r2_parked_recovery_attempted).toBe(0);
  });

  // ── Blocker 2: reserved allowance — no starvation, honest counters ──

  it("RESERVED-FIRST: parked allowance is attempted BEFORE the main drain (saturated main cannot starve it)", async () => {
    const main = Array.from({ length: 10 }, (_, i) => backlogRow(`M${i}`));
    const parked = [
      backlogRow("P1", { r2_attempts: R2_RETRY_EXHAUSTED_THRESHOLD, r2_last_attempt_at: new Date("2026-07-01T00:00:00Z") }),
    ];
    wireBacklogMocks(main, parked);

    // Tight time budget: the FIRST mirror chunk consumes the clock (t→900,
    // budget 1000, reserve 200). Only whatever runs first gets attempted.
    let t = 0;
    const now = () => t;
    const seen: string[] = [];
    const mirrorDeps = makeMirrorDeps();
    (mirrorDeps.existsInR2 as jest.Mock).mockImplementation(async (key: string) => {
      seen.push(key);
      t = 900;
      return true;
    });

    const result = await runMediaSync(
      makeOptions({ mirrorDeps, budgetMs: 1000, phase1ReserveMs: 700, phase2ReserveMs: 200, now }),
    );

    // The reserved parked chunk ran (first); the main drain then stopped on time.
    expect(seen.some((k) => k.includes("P1"))).toBe(true);
    expect(result.r2_parked_recovery_selected).toBe(1);
    expect(result.r2_parked_recovery_attempted).toBe(1);
    // Main got at most one chunk before the clock expired.
    expect(result.r2_mirrored).toBeLessThanOrEqual(1 + 5);
  });

  it("HONEST COUNTER: time exhausted before any chunk → selected > 0 but attempted = 0 (no mirror calls)", async () => {
    const parked = [
      backlogRow("P1", { r2_attempts: R2_RETRY_EXHAUSTED_THRESHOLD, r2_last_attempt_at: new Date("2026-07-01T00:00:00Z") }),
    ];
    // The selection queries themselves consume the clock past the reserve.
    let t = 0;
    const now = () => t;
    let mainServed = false;
    mockListingMediaFindMany.mockImplementation(async (args: unknown) => {
      t = 900; // budget 1000, reserve 200 → nothing may run after selection
      if (isParkedRecoveryCall([args])) return parked;
      if (isMainBacklogCall([args]) && !mainServed) {
        mainServed = true;
        return [];
      }
      return [];
    });
    const mirrorDeps = makeMirrorDeps();

    const result = await runMediaSync(
      makeOptions({ mirrorDeps, budgetMs: 1000, phase1ReserveMs: 700, phase2ReserveMs: 200, now }),
    );

    expect(result.r2_parked_recovery_selected).toBe(1);
    expect(result.r2_parked_recovery_attempted).toBe(0); // never handed to the mirror
    expect((mirrorDeps.existsInR2 as jest.Mock).mock.calls.length).toBe(0);
  });

  it("main failure-budget exhaustion does NOT affect the reserved parked allowance, and parked failures do NOT consume the main budget", async () => {
    const main = Array.from({ length: R2_RUN_FAILURE_BUDGET + 5 }, (_, i) => backlogRow(`F${i}`));
    const parked = [
      backlogRow("PF1", { r2_attempts: R2_RETRY_EXHAUSTED_THRESHOLD, r2_last_attempt_at: new Date("2026-07-01T00:00:00Z") }),
      backlogRow("PF2", { r2_attempts: R2_RETRY_EXHAUSTED_THRESHOLD, r2_last_attempt_at: new Date("2026-07-02T00:00:00Z") }),
    ];
    wireBacklogMocks(main, parked);
    const mirrorDeps = makeMirrorDeps();
    (mirrorDeps.existsInR2 as jest.Mock).mockRejectedValue(new Error("everything down"));

    const result = await runMediaSync(
      makeOptions({ mirrorDeps, backlogBatchLimit: R2_RUN_FAILURE_BUDGET + 5 }),
    );

    // Reserved parked chunk attempted first (2 attempts, 2 failures) —
    // naturally bounded by the quota, so it cannot monopolize the drain.
    expect(result.r2_parked_recovery_attempted).toBe(2);
    // Main drain then consumed its FULL 10-failure budget (parked failures
    // did not eat into it): total failures = 2 parked + 10 main.
    expect(result.r2_failed).toBe(R2_RUN_FAILURE_BUDGET + 2);
    expect((mirrorDeps.existsInR2 as jest.Mock).mock.calls.length).toBe(R2_RUN_FAILURE_BUDGET + 2);
    // Main remainder untouched → flag TRUE.
    expect(result.r2_failure_budget_exhausted).toBe(true);
  });
});

// ─── 4. Recovery-failure semantics — #534 sentinel is NEVER written ──────
//
// Maya integration blocker (round 3): #534 reserves r2_attempts=9
// EXCLUSIVELY for deterministic POLICY parking. A transient R2/Cotality
// failure on a recovery attempt must therefore leave the counter at
// exactly 8 (failure-exhaustion), refresh only the cooldown clock, and let
// the row retry again after the long cooldown. The row is retryable ONLY
// while it remains status='active', still lacks its R2 copy
// (r2_key/media_url_cached missing), and has not received a
// proven-permanent 404/410 tombstone outcome — that tombstone (E8
// live-proven) terminates the row and EXITS it from recovery, and even
// then the sentinel value is never written.

describe("Phase 4 — recovery-failure semantics (#534 sentinel never written)", () => {
  function parkedFixture() {
    return backlogRow("PX", {
      r2_attempts: R2_RETRY_EXHAUSTED_THRESHOLD,
      r2_last_attempt_at: new Date("2026-07-01T00:00:00Z"),
    });
  }

  function writesFor(mediaKey: string) {
    return mockListingMediaUpdate.mock.calls.filter(
      (call) => (call[0] as { where: { media_key: string } }).where.media_key === mediaKey,
    );
  }

  /**
   * Failure-path writes. These no longer arrive as a Prisma `update` payload —
   * they are the single parameterized failure statement — so the assertions
   * read the RESULTING STORED ROW.
   */
  function failureWritesFor(mediaKey: string) {
    return store.writesFor(mediaKey);
  }

  it("attempts=8 + TRANSIENT recovery failure → r2_attempts REMAINS 8 (counter not written)", async () => {
    const parkedRow = parkedFixture();
    wireBacklogMocks([], [parkedRow]);
    const mirrorDeps = makeMirrorDeps();
    (mirrorDeps.existsInR2 as jest.Mock).mockRejectedValue(new Error("transient R2 outage"));

    const result = await runMediaSync(makeOptions({ mirrorDeps }));

    expect(result.r2_failed).toBe(1);
    const writes = failureWritesFor(parkedRow.media_key as string);
    expect(writes.length).toBe(1);
    // Stays exactly 8 in the DB, and a transient failure never tombstones.
    expect(writes[0].after.r2_attempts).toBe(R2_RETRY_EXHAUSTED_THRESHOLD);
    expect(writes[0].after.status).toBe("active");
  });

  it("TRANSIENT recovery failure writes ONLY the cooldown restart (r2_last_attempt_at)", async () => {
    const parkedRow = parkedFixture();
    wireBacklogMocks([], [parkedRow]);
    const mirrorDeps = makeMirrorDeps();
    (mirrorDeps.existsInR2 as jest.Mock).mockRejectedValue(new Error("transient R2 outage"));

    await runMediaSync(makeOptions({ mirrorDeps }));

    const write = failureWritesFor(parkedRow.media_key as string)[0];
    expect(write.after.r2_last_attempt_at).toBeInstanceOf(Date);
    // Stronger than listing the payload keys: NOTHING else about the row moved.
    expect(write.after.r2_attempts).toBe(write.before.r2_attempts);
    expect(write.after.status).toBe(write.before.status);
    expect(write.after.r2_key).toBe(write.before.r2_key);
    expect(write.after.media_url_cached).toBe(write.before.media_url_cached);
  });

  it("after a transient recovery failure the row re-enters eligibility ONLY after the long cooldown (retryable while active + un-mirrored + un-tombstoned; never one-shot)", async () => {
    const parkedRow = parkedFixture();
    wireBacklogMocks([], [parkedRow]);
    const mirrorDeps = makeMirrorDeps();
    (mirrorDeps.existsInR2 as jest.Mock).mockRejectedValue(new Error("transient R2 outage"));

    await runMediaSync(makeOptions({ mirrorDeps }));

    const write = failureWritesFor(parkedRow.media_key as string)[0];
    const failedAt = write.after.r2_last_attempt_at as Date;
    // Post-failure DB state, read from the stored row itself.
    const attemptsAfter = write.after.r2_attempts as number;

    const eligibleAgainst = (threshold: Date): boolean => {
      const where = buildR2ParkedRecoveryWhere(threshold) as {
        r2_attempts: unknown;
        r2_last_attempt_at: { lt: Date };
      };
      const attemptsOk =
        typeof where.r2_attempts === "number"
          ? attemptsAfter === where.r2_attempts
          : attemptsAfter >= (where.r2_attempts as { gte: number }).gte;
      return attemptsOk && failedAt < where.r2_last_attempt_at.lt;
    };

    // NOT eligible while the fresh cooldown is running…
    expect(eligibleAgainst(new Date(failedAt.getTime() - 1000))).toBe(false);
    // …but eligible again once the long cooldown has fully elapsed.
    expect(eligibleAgainst(new Date(failedAt.getTime() + R2_PARKED_RECOVERY_COOLDOWN_MS + 1000))).toBe(true);
  });

  it("NO recovery failure path ever writes the #534 policy sentinel (attempts=9) — transient AND permanent", async () => {
    // Transient run.
    const transientRow = parkedFixture();
    wireBacklogMocks([], [transientRow]);
    const transientDeps = makeMirrorDeps();
    (transientDeps.existsInR2 as jest.Mock).mockRejectedValue(new Error("transient"));
    await runMediaSync(makeOptions({ mirrorDeps: transientDeps }));

    // Permanent-404 run.
    const permanentRow = parkedFixture();
    wireBacklogMocks([], [permanentRow]);
    const permanentDeps = makeMirrorDeps();
    (permanentDeps.existsInR2 as jest.Mock).mockResolvedValue(false);
    (permanentDeps.fetchFn as jest.Mock).mockResolvedValue({ ok: false, status: 404 } as unknown as Response);
    await runMediaSync(makeOptions({ mirrorDeps: permanentDeps }));

    for (const call of mockListingMediaUpdate.mock.calls) {
      const data = (call[0] as { data: Record<string, unknown> }).data;
      if ("r2_attempts" in data) {
        expect(data.r2_attempts).not.toBe(R2_RETRY_EXHAUSTED_THRESHOLD + 1);
        expect(data.r2_attempts as number).toBeLessThanOrEqual(R2_RETRY_EXHAUSTED_THRESHOLD);
      }
    }
    // The failure statements must not reach the sentinel either.
    expect(store.writes.length).toBeGreaterThan(0);
    for (const write of store.writes) {
      expect(write.after.r2_attempts).not.toBe(R2_RETRY_EXHAUSTED_THRESHOLD + 1);
      expect(write.after.r2_attempts as number).toBeLessThanOrEqual(R2_RETRY_EXHAUSTED_THRESHOLD);
    }
  });

  it("policy-park sentinel rows (attempts=9) remain excluded from recovery selection", () => {
    const where = buildR2ParkedRecoveryWhere(new Date("2026-07-14T00:00:00Z")) as {
      r2_attempts: unknown;
      r2_last_attempt_at: { lt: Date };
    };
    const sentinelEligible =
      typeof where.r2_attempts === "number"
        ? R2_RETRY_EXHAUSTED_THRESHOLD + 1 === where.r2_attempts
        : R2_RETRY_EXHAUSTED_THRESHOLD + 1 >= (where.r2_attempts as { gte: number }).gte;
    expect(sentinelEligible).toBe(false);
  });

  it("SUCCESSFUL recovery clears normal retry state via the standard success path (attempts→0, cooldown→null)", async () => {
    const parkedRow = parkedFixture();
    wireBacklogMocks([], [parkedRow]);
    const mirrorDeps = makeMirrorDeps(); // existsInR2 → true → reuse + drift write

    const result = await runMediaSync(makeOptions({ mirrorDeps }));

    expect(result.r2_mirrored).toBe(1);
    const data = (writesFor(parkedRow.media_key as string)[0][0] as { data: Record<string, unknown> }).data;
    expect(data.r2_attempts).toBe(0);
    expect(data.r2_last_attempt_at).toBeNull();
  });

  it("PERMANENT 404 on a recovery row still tombstones (inherited E8 contract) — without writing the sentinel", async () => {
    const parkedRow = parkedFixture();
    wireBacklogMocks([], [parkedRow]);
    const mirrorDeps = makeMirrorDeps();
    (mirrorDeps.existsInR2 as jest.Mock).mockResolvedValue(false);
    (mirrorDeps.fetchFn as jest.Mock).mockResolvedValue({ ok: false, status: 404 } as unknown as Response);

    const result = await runMediaSync(makeOptions({ mirrorDeps }));

    expect(result.r2_failed).toBe(1);
    const write = failureWritesFor(parkedRow.media_key as string)[0];
    // Proven-permanent source loss → tombstone still applies (threshold 3
    // long since satisfied at 8) — but the counter is NOT advanced to the
    // #534 sentinel value.
    expect(write.after.status).toBe("deleted");
    expect(write.after.r2_attempts).toBe(R2_RETRY_EXHAUSTED_THRESHOLD);
    expect(write.after.r2_attempts).not.toBe(R2_RETRY_EXHAUSTED_THRESHOLD + 1);
    expect(write.after.r2_last_attempt_at).toBeInstanceOf(Date);
  });
});

// ── Codex post-merge review: NULL media_key rows must not monopolize the bounded window ──
import { buildR2BacklogWhere as __bw, buildR2ParkedRecoveryWhere as __pw } from "../media-sync";
describe("bounded selections exclude unmirrorable media_key IS NULL rows", () => {
  it("main backlog where requires media_key not-null (fixed 60-row window cannot be monopolized by unmirrorable rows)", () => {
    const w = __bw(new Date("2026-07-01T00:00:00Z"), []) as Record<string, unknown>;
    expect(w.media_key).toEqual({ not: null });
  });
  it("parked-recovery where requires media_key not-null", () => {
    const w = __pw(new Date("2026-07-01T00:00:00Z")) as Record<string, unknown>;
    expect(w.media_key).toEqual({ not: null });
  });
});
