/**
 * One Cycle W3 — adaptive bounded drain + overlap safety + index-friendly
 * query shapes (failing-first TDD).
 *
 * Hierarchy (verbatim): Cotality API → sole listing and feed-media truth →
 * One Cycle → Neon operational copy → projections → Vercel cache. Business
 * data never overrides listing facts.
 *
 * Contract:
 *   1. ADAPTIVE SIZING — batch = clamp(MIN, inflow + CATCHUP, HARD_CAP):
 *      exceeds measured inflow by a catch-up increment, floored at the
 *      Phase-4 minimum, hard-capped (NEON-001: never unbounded). Inflow is
 *      measured DURABLY from the last two media_sync_cron audit events
 *      (remaining[n-1] − remaining[n-2] + drained[n-1]); if unavailable the
 *      drain falls back to the MIN batch (classification 'fallback_min').
 *   2. OVERLAP SAFETY — candidate selection runs inside a short advisory-
 *      locked transaction (pg_try_advisory_xact_lock): a concurrent run
 *      that cannot take the lock SKIPS the drain (overlap_prevented=1,
 *      classification 'skipped_overlap', zero selection queries). The
 *      mirror phase itself is idempotent (existsInR2 reuse + write-once
 *      rows), so the selection mutex makes overlapping runs harmless.
 *   3. QUERY SHAPES — selection orders by [{id asc}] (PK-streamable; id is
 *      a monotone insertion key so FIFO fairness is preserved without a
 *      created_at sort node); backlog_remaining becomes a BOUNDED probe
 *      (take R2_BACKLOG_PROBE_CAP+1 ids; value >cap reports cap+1).
 *   4. All Phase-4 fail-closed semantics (cooldowns, hard failure cap +
 *      truthful flag, parked 8/9 reservation, transient-recovery-keeps-8)
 *      are preserved — the existing phase4 suite keeps running unchanged
 *      except for the ordering/take expectations updated here.
 */

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
const mockAuditFindMany = jest.fn<Promise<unknown[]>, [unknown]>();
const mockTryLock = jest.fn<Promise<Array<{ locked: boolean }>>, []>();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    mediaSyncState: {
      findUnique: (a: unknown) => mockMediaSyncFindUnique(a),
      upsert: (a: unknown) => mockMediaSyncUpsert(a),
    },
    listingMedia: {
      findUnique: (a: unknown) => mockListingMediaFindUnique(a),
      create: (a: unknown) => mockListingMediaCreate(a),
      update: (a: unknown) => mockListingMediaUpdate(a),
      updateMany: (a: unknown) => mockListingMediaUpdateMany(a),
      findMany: (a: unknown) => mockListingMediaFindMany(a),
      count: (a: unknown) => mockListingMediaCount(a),
    },
    listing: {
      update: (a: unknown) => mockListingUpdate(a),
      findUnique: (a: unknown) => mockListingFindUnique(a),
    },
    auditEvent: {
      findMany: (a: unknown) => mockAuditFindMany(a),
    },
    $transaction: (fn: unknown) =>
      (fn as (tx: unknown) => unknown)({
        $queryRaw: () => mockTryLock(),
        listingMedia: { findMany: (a: unknown) => mockListingMediaFindMany(a) },
      }),
  },
}));

jest.mock("@/lib/cache/public-cache", () => ({
  __esModule: true,
  SEARCH_CACHE_TAG: "search",
  listingCacheTag: (id: string) => `listing:${id}`,
  newRevalidationCounters: () => ({ pages_revalidated: 0, revalidation_failures: 0 }),
  safeRevalidateTags: jest.fn(),
}));

import type { MediaSyncFetchDeps, MirrorMediaToR2Deps, RunMediaSyncOptions } from "../media-sync";
import {
  runMediaSync,
  computeAdaptiveDrainLimit,
  measureBacklogInflow,
  R2_BACKLOG_BATCH_LIMIT,
  R2_DRAIN_CATCHUP_INCREMENT,
  R2_DRAIN_HARD_CAP,
  R2_BACKLOG_PROBE_CAP,
} from "../media-sync";
import { readFileSync } from "fs";
import * as path from "path";

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
  mockAuditFindMany.mockResolvedValue([]);
  mockTryLock.mockResolvedValue([{ locked: true }]);
});

function makeFetchDeps(): MediaSyncFetchDeps {
  return { fetchProperties: jest.fn().mockResolvedValue([]), fetchMedia: jest.fn().mockResolvedValue([]) };
}
function makeMirrorDeps(): MirrorMediaToR2Deps {
  return {
    existsInR2: jest.fn<Promise<boolean>, [string]>().mockResolvedValue(true),
    uploadToR2: jest.fn<Promise<string>, [string, Buffer, string]>().mockImplementation(async (k) => `https://r2/${k}`),
    getR2PublicUrl: jest.fn<string, [string]>().mockImplementation((k) => `https://r2/${k}`),
    getAccessToken: jest.fn<Promise<string>, []>().mockResolvedValue("t"),
    fetchFn: jest.fn(),
  };
}
function makeOptions(over: Partial<RunMediaSyncOptions> = {}): RunMediaSyncOptions {
  return { listingsPerRun: 10, mediaPerListing: 5, fallbackWindowDays: 7, fetchDeps: makeFetchDeps(), mirrorDeps: makeMirrorDeps(), ...over };
}
/**
 * PHASE 4a's bounded policy RE-ADMISSION select. It shares `status:'active'`
 * and a top-level `OR` with the main backlog select, so it must be excluded or
 * "exactly one main selection" would silently start counting two structurally
 * different queries. Keyed on the one clause only this selector carries: an
 * AGE test on `r2_policy_excluded_at`.
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

function isMainBacklogCall(call: unknown[]): boolean {
  const a = call[0] as { where?: { status?: string; OR?: unknown[]; r2_attempts?: unknown }; take?: number };
  return (
    a?.where?.status === "active" &&
    Array.isArray(a.where.OR) &&
    a.where.r2_attempts === undefined &&
    !isPolicyReevalCall(call) &&
    a.take !== R2_BACKLOG_PROBE_CAP + 1 // exclude the bounded remaining-probe
  );
}
function auditEvent(remaining: number, drained: number) {
  return { changes: { backlog_remaining: remaining, r2_mirrored: drained } };
}

describe("W3 — computeAdaptiveDrainLimit (pure bounds)", () => {
  it("null inflow → MIN floor (fallback)", () => {
    expect(computeAdaptiveDrainLimit(null)).toBe(R2_BACKLOG_BATCH_LIMIT);
  });
  it("small inflow → floored at MIN", () => {
    expect(computeAdaptiveDrainLimit(5)).toBe(R2_BACKLOG_BATCH_LIMIT);
  });
  it("mid inflow → inflow + catch-up increment (exceeds inflow)", () => {
    const inflow = R2_BACKLOG_BATCH_LIMIT + 40;
    expect(computeAdaptiveDrainLimit(inflow)).toBe(inflow + R2_DRAIN_CATCHUP_INCREMENT);
  });
  it("huge inflow → HARD CAP (never unbounded — NEON-001)", () => {
    expect(computeAdaptiveDrainLimit(10_000)).toBe(R2_DRAIN_HARD_CAP);
    expect(R2_DRAIN_HARD_CAP).toBeLessThanOrEqual(500);
  });
  it("negative/garbage inflow → MIN floor (fail-closed)", () => {
    expect(computeAdaptiveDrainLimit(-50)).toBe(R2_BACKLOG_BATCH_LIMIT);
    expect(computeAdaptiveDrainLimit(Number.NaN)).toBe(R2_BACKLOG_BATCH_LIMIT);
  });
});

describe("W3 — durable inflow measurement (audit-event derived)", () => {
  it("inflow = remaining[n-1] − remaining[n-2] + drained[n-1], floored at 0", () => {
    expect(measureBacklogInflow([auditEvent(1211, 60), auditEvent(1150, 55)])).toBe(1211 - 1150 + 60);
    expect(measureBacklogInflow([auditEvent(100, 0), auditEvent(500, 0)])).toBe(0); // shrinking backlog → no inflow signal
  });
  it("fewer than two usable events → null (fallback to MIN)", () => {
    expect(measureBacklogInflow([])).toBeNull();
    expect(measureBacklogInflow([auditEvent(10, 1)])).toBeNull();
    expect(measureBacklogInflow([{ changes: {} }, { changes: {} }])).toBeNull();
  });
});

describe("W3 — runMediaSync adaptive drain wiring", () => {
  it("sizes the selection take adaptively from the audit-derived inflow and reports counters", async () => {
    // remaining went 1150 → 1211 while draining 60 → inflow 121 → take 121+CATCHUP.
    mockAuditFindMany.mockResolvedValue([auditEvent(1211, 60), auditEvent(1150, 55)]);

    const result = await runMediaSync(makeOptions());

    const mainCalls = mockListingMediaFindMany.mock.calls.filter(isMainBacklogCall);
    expect(mainCalls.length).toBe(1);
    expect((mainCalls[0][0] as { take: number }).take).toBe(121 + R2_DRAIN_CATCHUP_INCREMENT);
    expect((mainCalls[0][0] as { orderBy: unknown }).orderBy).toEqual([{ id: "asc" }]);
    expect(result.backlog_inflow_since_last_run).toBe(121);
    expect(result.query_path_classification).toBe("adaptive");
    expect(result.overlap_prevented).toBe(0);
  });

  it("no usable audit history → MIN batch, classification 'fallback_min'", async () => {
    mockAuditFindMany.mockResolvedValue([]);
    const result = await runMediaSync(makeOptions());
    const mainCalls = mockListingMediaFindMany.mock.calls.filter(isMainBacklogCall);
    expect((mainCalls[0][0] as { take: number }).take).toBe(R2_BACKLOG_BATCH_LIMIT);
    expect(result.backlog_inflow_since_last_run).toBeNull();
    expect(result.query_path_classification).toBe("fallback_min");
  });

  it("advisory try-lock NOT acquired → drain skipped entirely: zero selection queries, overlap_prevented=1", async () => {
    mockTryLock.mockResolvedValue([{ locked: false }]);
    const result = await runMediaSync(makeOptions());
    expect(mockListingMediaFindMany.mock.calls.filter(isMainBacklogCall).length).toBe(0);
    expect(result.overlap_prevented).toBe(1);
    expect(result.query_path_classification).toBe("skipped_overlap");
    expect(result.r2_mirrored).toBe(0);
  });

  it("required durable counters are present and mapped to physical outcomes", async () => {
    // R2-1 interplay: rows must be admission-ELIGIBLE for the drain to mirror
    // them — Mallan-owned (SL- prefix + rls_eligible=false ⇒ all_active scope)
    // so this test measures W3 drain accounting, not the admission policy
    // (which has its own suite: media-sync-r21-mirror-policy.test.ts).
    const mallanListing = (lid: string) => ({
      listing_id: lid, rls_eligible: false, status: "Active",
      idx_display_yn: true, owner_opt_out: false, participant_only: false,
      internet_entire_listing_display_yn: true,
    });
    const rows = [
      { id: 1n, listing_id: "SL-A", media_key: "K1", media_type: "Photo", order: 1, media_url_original: "u1", r2_key: null, media_url_cached: null, r2_attempts: null, listing: mallanListing("SL-A") },
      { id: 2n, listing_id: "SL-B", media_key: "K2", media_type: "Photo", order: 1, media_url_original: "u2", r2_key: null, media_url_cached: null, r2_attempts: null, listing: mallanListing("SL-B") },
    ];
    let served = false;
    mockListingMediaFindMany.mockImplementation(async (args: unknown) => {
      if (isMainBacklogCall([args]) && !served) {
        served = true;
        return rows;
      }
      return [];
    });

    const result = await runMediaSync(makeOptions());

    expect(result.rows_selected).toBe(2);
    expect(result.rows_attempted).toBe(2);
    expect(result.rows_drained).toBe(2); // = r2_mirrored
    expect(result.failures).toBe(0); // = r2_failed alias
    expect(result.time_budget_exhausted).toBe(false);
    expect(typeof result.run_duration_ms).toBe("number");
  });

  it("backlog_remaining is a BOUNDED probe (take = probe cap + 1, ids only) — never an unbounded COUNT", async () => {
    await runMediaSync(makeOptions());
    const probeCalls = mockListingMediaFindMany.mock.calls.filter((c) => {
      const a = c[0] as { take?: number; select?: Record<string, unknown> };
      return a?.take === R2_BACKLOG_PROBE_CAP + 1 && a?.select && Object.keys(a.select).join(",") === "id";
    });
    expect(probeCalls.length).toBe(1);
    expect(mockListingMediaCount).not.toHaveBeenCalled();
  });
});

describe("W3 — /api/market bounded scans (source contract)", () => {
  const src = readFileSync(path.resolve(__dirname, "../../../app/api/market/route.ts"), "utf8");
  it("both stats findMany reads carry the bounded row cap", () => {
    expect((src.match(/take: MARKET_STATS_ROW_CAP/g) || []).length).toBe(2);
    expect(src).toMatch(/MARKET_STATS_ROW_CAP = 5000/);
  });
});
