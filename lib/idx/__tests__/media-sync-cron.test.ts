/**
 * PR 3 Checkpoint 5 — cron route at app/api/cron/media-sync/route.ts.
 *
 * High-scrutiny boundary: this is the FIRST production-execution checkpoint.
 * The route handler is verified via mocks for:
 *   - prisma.auditEvent (concurrency guard + run summary)
 *   - runMediaSync (mocked entirely; we don't exercise orchestration here)
 *   - lib/idx/auth.hasCredentials (Trestle creds pre-check)
 *
 * No live cron trigger. No live Trestle. No live R2. No live DB.
 */

// ─── Mocks ───────────────────────────────────────────────────────────────

const mockAuditFindFirst = jest.fn<Promise<unknown>, [unknown]>();
const mockAuditCreate = jest.fn<Promise<unknown>, [unknown]>();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    auditEvent: {
      findFirst: (args: unknown) => mockAuditFindFirst(args),
      create: (args: unknown) => mockAuditCreate(args),
    },
  },
}));

const mockHasCredentials = jest.fn<boolean, []>();
jest.mock("@/lib/idx/auth", () => ({
  __esModule: true,
  hasCredentials: () => mockHasCredentials(),
  getAccessToken: () => Promise.resolve("test-token"),
}));

const mockRunMediaSync = jest.fn<Promise<unknown>, [unknown?]>();
jest.mock("@/lib/idx/media-sync", () => {
  const actual = jest.requireActual("@/lib/idx/media-sync");
  return {
    ...actual,
    runMediaSync: (opts?: unknown) => mockRunMediaSync(opts),
  };
});

// No active One Cycle in these standalone-route tests — the machine-overlap
// block is covered separately in one-cycle-standalone-overlap.test.ts.
jest.mock("@/lib/idx/one-cycle-active", () => ({
  isOneCycleActive: async () => false,
  ONE_CYCLE_STALE_MS: 300_000,
}));

// Imported AFTER mocks are wired up.
import { GET } from "@/app/api/cron/media-sync/route";
import { NextRequest } from "next/server";

beforeEach(() => {
  mockAuditFindFirst.mockReset();
  mockAuditCreate.mockReset();
  mockHasCredentials.mockReset();
  mockRunMediaSync.mockReset();
  process.env.CRON_SECRET = "test-secret";
});

afterAll(() => {
  delete process.env.CRON_SECRET;
});

// ─── Helpers ─────────────────────────────────────────────────────────────

function makeReq(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://mallan.nyc/api/cron/media-sync", { headers });
}

function authedReq(): NextRequest {
  return makeReq({ authorization: "Bearer test-secret" });
}

function makeRunResult(overrides: Record<string, unknown> = {}) {
  return {
    status: "ok",
    exit_reason: "completed",
    rows_checked: 0,
    rows_updated: 0,
    rows_inserted: 0,
    rows_updated_changed: 0,
    rows_skipped_unchanged: 0,
    rows_skipped_invalid: 0,
    delete_signals_received: 0,
    tombstoned_explicit: 0,
    tombstoned_vanished: 0,
    rows_tombstoned: 0,
    existing_rows_compared: 0,
    mismatch_status: 0,
    mismatch_listing_id: 0,
    mismatch_resource_record_key: 0,
    mismatch_resource_record_id: 0,
    mismatch_media_url_exact: 0,
    mismatch_media_url_identity: 0,
    mismatch_media_url_identity_equivalent: 0,
    mismatch_media_type: 0,
    mismatch_media_category: 0,
    mismatch_media_classification: 0,
    mismatch_order: 0,
    mismatch_preferred_photo: 0,
    mismatch_media_modification_ts: 0,
    mismatch_modification_ts: 0,
    rows_with_one_mismatch: 0,
    rows_with_multiple_mismatches: 0,
    rows_failed: 0,
    listings_processed: 0,
    listings_skipped: 0,
    // R2-1 mirror-admission counters (additive; legacy r2_* keys retained).
    mirror_allowed: 0,
    mirror_rejected_policy: 0,
    mirror_rejected_policy_parked: 0,
    r2_mirrored: 0,
    r2_uploaded: 0,
    r2_reused: 0,
    r2_failed: 0,
    r2_skipped: 0,
    backlog_remaining: 0,
    // Phase 4 — bounded drain / reserved recovery observability.
    r2_backlog_batch_selected: 0,
    r2_parked_recovery_selected: 0,
    r2_parked_recovery_attempted: 0,
    r2_failure_budget_exhausted: false,
    // Phase 3 surface C — summary-write suppression counters (flattened into
    // the audit allowlist by the route; Codex #549 review).
    summary_writes: {
      rows_checked: 0,
      rows_materially_changed: 0,
      rows_suppressed_unchanged: 0,
      rows_inserted: 0,
      rows_updated: 0,
      rows_failed: 0,
    },
    duration_ms: 100,
    ...overrides,
  };
}

// ─── Auth ────────────────────────────────────────────────────────────────

describe("GET /api/cron/media-sync — auth", () => {
  it("returns 401 with no Authorization header — no DB writes, no sync", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    expect(mockAuditFindFirst).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
    expect(mockRunMediaSync).not.toHaveBeenCalled();
    expect(mockHasCredentials).not.toHaveBeenCalled();
  });

  it("returns 401 with wrong Bearer token", async () => {
    const res = await GET(makeReq({ authorization: "Bearer wrong-secret" }));
    expect(res.status).toBe(401);
    expect(mockRunMediaSync).not.toHaveBeenCalled();
  });

  it("returns 401 when CRON_SECRET env is unset", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeReq({ authorization: "Bearer anything" }));
    expect(res.status).toBe(401);
    process.env.CRON_SECRET = "test-secret";
  });

  it("returns 401 with a length-mismatched header (timing-safe guard)", async () => {
    const res = await GET(makeReq({ authorization: "Bearer x" }));
    expect(res.status).toBe(401);
  });
});

// ─── Trestle credentials gate ────────────────────────────────────────────

describe("GET /api/cron/media-sync — trestle credentials gate", () => {
  it("returns 503 when Trestle credentials are missing — no concurrency check, no sync", async () => {
    mockHasCredentials.mockReturnValue(false);
    const res = await GET(authedReq());
    expect(res.status).toBe(503);
    expect(mockAuditFindFirst).not.toHaveBeenCalled();
    expect(mockRunMediaSync).not.toHaveBeenCalled();
  });
});

// ─── Concurrency guard ───────────────────────────────────────────────────

describe("GET /api/cron/media-sync — concurrency guard", () => {
  it("returns skipped when a media_sync_cron auditEvent exists in the last 10 minutes", async () => {
    mockHasCredentials.mockReturnValue(true);
    mockAuditFindFirst.mockResolvedValueOnce({
      id: 1,
      action: "media_sync_cron",
      created_at: new Date(),
    });

    const res = await GET(authedReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(body.reason).toMatch(/within last 10 minutes/);
    expect(mockRunMediaSync).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("queries auditEvent with the correct concurrency window", async () => {
    mockHasCredentials.mockReturnValue(true);
    mockAuditFindFirst.mockResolvedValueOnce(null);
    mockRunMediaSync.mockResolvedValueOnce(makeRunResult());
    mockAuditCreate.mockResolvedValueOnce(undefined);

    await GET(authedReq());

    const args = mockAuditFindFirst.mock.calls[0][0] as {
      where: { action: string; created_at: { gte: Date } };
      orderBy: unknown;
    };
    expect(args.where.action).toBe("media_sync_cron");
    expect(args.where.created_at.gte).toBeInstanceOf(Date);
    // Window must be exactly 10 minutes (within a few ms of now-10min).
    const expectedGte = Date.now() - 10 * 60 * 1000;
    const actualGte = args.where.created_at.gte.getTime();
    expect(Math.abs(actualGte - expectedGte)).toBeLessThan(2000);
  });
});

// ─── Happy path ──────────────────────────────────────────────────────────

describe("GET /api/cron/media-sync — happy path", () => {
  beforeEach(() => {
    mockHasCredentials.mockReturnValue(true);
    mockAuditFindFirst.mockResolvedValue(null);
  });

  it("calls runMediaSync and writes media_sync_cron audit event with the summary", async () => {
    mockRunMediaSync.mockResolvedValueOnce(
      makeRunResult({
        rows_checked: 50,
        rows_updated: 45,
        rows_failed: 0,
        listings_processed: 10,
        listings_skipped: 2,
        duration_ms: 4321,
      }),
    );
    mockAuditCreate.mockResolvedValueOnce(undefined);

    const res = await GET(authedReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.rows_updated).toBe(45);

    // Audit event payload includes the summary fields.
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const auditArgs = mockAuditCreate.mock.calls[0][0] as {
      data: { action: string; entity_type: string; user_type: string; changes: Record<string, unknown> };
    };
    expect(auditArgs.data.action).toBe("media_sync_cron");
    expect(auditArgs.data.entity_type).toBe("listing_media");
    expect(auditArgs.data.user_type).toBe("system");
    expect(auditArgs.data.changes.status).toBe("ok");
    expect(auditArgs.data.changes.rows_checked).toBe(50);
    expect(auditArgs.data.changes.rows_updated).toBe(45);
    expect(auditArgs.data.changes.rows_failed).toBe(0);
    expect(auditArgs.data.changes.listings_processed).toBe(10);
    expect(auditArgs.data.changes.listings_skipped).toBe(2);
    expect(auditArgs.data.changes.duration_ms).toBe(4321);
  });

  it("emits action='media_sync_cron' on a partial success run (not 'media_sync_cron_error')", async () => {
    mockRunMediaSync.mockResolvedValueOnce(
      makeRunResult({ status: "partial", rows_failed: 3 }),
    );
    mockAuditCreate.mockResolvedValueOnce(undefined);

    await GET(authedReq());
    const auditArgs = mockAuditCreate.mock.calls[0][0] as {
      data: { action: string; changes: Record<string, unknown> };
    };
    expect(auditArgs.data.action).toBe("media_sync_cron");
    expect(auditArgs.data.changes.status).toBe("partial");
    expect(auditArgs.data.changes.rows_failed).toBe(3);
  });

  it("audit changes payload includes all Phase 3 observability fields (exit_reason, r2_*, backlog_remaining)", async () => {
    // Required for the 48h PR-4 observation clock to verify Phase 3 health
    // from audit log alone, without ad-hoc DB queries.
    mockRunMediaSync.mockResolvedValueOnce(
      makeRunResult({
        status: "partial",
        exit_reason: "budget_phase2",
        rows_checked: 806,
        rows_updated: 806,
        rows_failed: 0,
        listings_processed: 50,
        listings_skipped: 0,
        mirror_allowed: 15,
        mirror_rejected_policy: 37,
        mirror_rejected_policy_parked: 22,
        r2_mirrored: 11,
        r2_uploaded: 7,
        r2_reused: 4,
        r2_failed: 4,
        r2_skipped: 0,
        backlog_remaining: 1102,
        duration_ms: 88424,
      }),
    );
    mockAuditCreate.mockResolvedValueOnce(undefined);

    await GET(authedReq());

    const auditArgs = mockAuditCreate.mock.calls[0][0] as {
      data: { action: string; changes: Record<string, unknown> };
    };
    const ch = auditArgs.data.changes;

    // Pre-existing fields preserved.
    expect(ch.status).toBe("partial");
    expect(ch.rows_checked).toBe(806);
    expect(ch.rows_updated).toBe(806);
    expect(ch.rows_failed).toBe(0);
    expect(ch.listings_processed).toBe(50);
    expect(ch.listings_skipped).toBe(0);
    expect(ch.duration_ms).toBe(88424);

    // NEW: Phase 3 observability fields must be present.
    expect(ch.exit_reason).toBe("budget_phase2");
    expect(ch.r2_mirrored).toBe(11);
    expect(ch.r2_failed).toBe(4);
    expect(ch.r2_skipped).toBe(0);
    expect(ch.backlog_remaining).toBe(1102);

    // #530: every detailed outcome counter is persisted in the audit JSON.
    const detailedCounters = [
      "rows_inserted", "rows_updated_changed", "rows_skipped_unchanged",
      "rows_skipped_invalid", "delete_signals_received", "tombstoned_explicit",
      "tombstoned_vanished", "rows_tombstoned",
    ];
    // #541: every comparator-attribution counter is persisted too.
    const attributionCounters = [
      "existing_rows_compared", "mismatch_status", "mismatch_listing_id",
      "mismatch_resource_record_key", "mismatch_resource_record_id",
      "mismatch_media_url_exact", "mismatch_media_url_identity",
      "mismatch_media_url_identity_equivalent", "mismatch_media_type",
      "mismatch_media_category", "mismatch_media_classification", "mismatch_order",
      "mismatch_preferred_photo", "mismatch_media_modification_ts",
      "mismatch_modification_ts", "rows_with_one_mismatch", "rows_with_multiple_mismatches",
    ];
    for (const k of [...detailedCounters, ...attributionCounters]) {
      expect(ch).toHaveProperty(k);
    }

    // Phase 3 surface C — flattened summary-suppression counters must persist
    // in the durable audit payload (Codex #549 review: allowlist omission).
    const summaryCounters = [
      "summary_rows_checked", "summary_rows_materially_changed",
      "summary_rows_suppressed_unchanged", "summary_rows_inserted",
      "summary_rows_updated", "summary_rows_failed",
    ];
    for (const k of summaryCounters) {
      expect(ch).toHaveProperty(k);
    }

    // Phase 4 — bounded drain / reserved recovery observability must persist too.
    const phase4Counters = [
      "r2_backlog_batch_selected", "r2_parked_recovery_selected",
      "r2_parked_recovery_attempted", "r2_failure_budget_exhausted",
    ];
    for (const k of phase4Counters) {
      expect(ch).toHaveProperty(k);
    }

    // One Cycle W1 — sync-driven cache revalidation counters must persist
    // (bounded aggregate integers only; same allowlist class).
    const w1RevalidationCounters = ["pages_revalidated", "revalidation_failures"];
    for (const k of w1RevalidationCounters) {
      expect(ch).toHaveProperty(k);
    }

    // R2-1: mirror-admission counters must land in the audit payload so the
    // policy's effect (allowed vs rejected/parked, uploaded vs reused) is
    // verifiable from audit alone.
    const r21Counters = [
      "mirror_allowed", "mirror_rejected_policy", "mirror_rejected_policy_parked",
      "r2_uploaded", "r2_reused",
    ];
    for (const k of r21Counters) {
      expect(ch).toHaveProperty(k);
    }

    // One Cycle W3 — adaptive-drain counters must persist (bounded values;
    // query_path_classification is a closed enum label, never free text).
    const w3DrainCounters = [
      "backlog_inflow_since_last_run", "rows_selected", "rows_attempted",
      "rows_drained", "failures", "overlap_prevented",
      "time_budget_exhausted", "query_path_classification", "run_duration_ms",
    ];
    for (const k of w3DrainCounters) {
      expect(ch).toHaveProperty(k);
    }

    // No accidental field leakage — explicit allowlist only.
    const allowed = new Set([
      "status", "exit_reason", "rows_checked", "rows_updated", "rows_failed",
      "listings_processed", "listings_skipped",
      ...detailedCounters,
      ...attributionCounters,
      ...summaryCounters,
      ...phase4Counters,
      ...w1RevalidationCounters,
      ...r21Counters,
      ...w3DrainCounters,
      "r2_mirrored", "r2_failed", "r2_skipped", "backlog_remaining",
      "duration_ms", "error",
      // Durable Cotality usage telemetry + One Cycle run correlation (aggregate
      // integers only; no URLs/ids — same allowlist class as the counters above).
      "cotality", "one_cycle_run_id", "outcome",
    ]);
    for (const key of Object.keys(ch)) {
      expect(allowed.has(key)).toBe(true);
    }
  });

  it("logs runMediaSync's status='error' result in the SAME media_sync_cron event (not media_sync_cron_error)", async () => {
    // runMediaSync returning {status:'error'} = source-fetch failure path —
    // it returns gracefully, doesn't throw. The route MUST log this in the
    // standard summary event for cursor / drift trends to remain analyzable.
    mockRunMediaSync.mockResolvedValueOnce(
      makeRunResult({ status: "error", error: "Property fetch failed: HTTP 503" }),
    );
    mockAuditCreate.mockResolvedValueOnce(undefined);

    const res = await GET(authedReq());
    expect(res.status).toBe(200);
    const auditArgs = mockAuditCreate.mock.calls[0][0] as {
      data: { action: string; changes: Record<string, unknown> };
    };
    expect(auditArgs.data.action).toBe("media_sync_cron");
    expect(auditArgs.data.changes.status).toBe("error");
    expect(auditArgs.data.changes.error).toBe("Property fetch failed: HTTP 503");
  });
});

// ─── Route-level error path ──────────────────────────────────────────────

describe("GET /api/cron/media-sync — route-level error path", () => {
  beforeEach(() => {
    mockHasCredentials.mockReturnValue(true);
    mockAuditFindFirst.mockResolvedValue(null);
  });

  it("returns 500 and writes media_sync_cron_error audit event when runMediaSync throws", async () => {
    mockRunMediaSync.mockRejectedValueOnce(new Error("Neon write timeout"));
    mockAuditCreate.mockResolvedValueOnce(undefined);

    const res = await GET(authedReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Neon write timeout");

    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const auditArgs = mockAuditCreate.mock.calls[0][0] as {
      data: { action: string; changes: Record<string, unknown> };
    };
    expect(auditArgs.data.action).toBe("media_sync_cron_error");
    expect(auditArgs.data.changes.error).toBe("Neon write timeout");
  });

  it("error response does not leak Bearer tokens or full request headers", async () => {
    mockRunMediaSync.mockRejectedValueOnce(new Error("upstream failure"));
    mockAuditCreate.mockResolvedValueOnce(undefined);

    const res = await GET(authedReq());
    const body = await res.json();
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("test-secret");
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("test-token");
  });

  it("audit-write failure inside the catch does not mask the original error response", async () => {
    mockRunMediaSync.mockRejectedValueOnce(new Error("boom"));
    mockAuditCreate.mockRejectedValueOnce(new Error("audit write failed"));

    const res = await GET(authedReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("boom");
  });
});
