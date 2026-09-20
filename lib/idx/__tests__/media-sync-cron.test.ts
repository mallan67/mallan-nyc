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

// The shared atomic claim is mocked; overlap/atomicity is covered separately in
// one-cycle-standalone-overlap.test.ts + machine-claim.integration.test.ts.
// Default: the claim is GRANTED (no active machine) so the happy-path tests run.
const mockClaimMachine = jest.fn<Promise<{ ok: boolean; reason?: string }>, [unknown, unknown]>(async () => ({ ok: true }));
const mockCompleteMachine = jest.fn<Promise<void>, [unknown, unknown]>(async () => {});
jest.mock("@/lib/idx/machine-claim", () => ({
  claimMachine: (db: unknown, input: unknown) => mockClaimMachine(db, input),
  completeMachine: (db: unknown, input: unknown) => mockCompleteMachine(db, input),
  MACHINE_STALE_MS: 300_000,
  MACHINE_STARTED: "one_cycle_started",
  MACHINE_COMPLETED: "one_cycle_run",
}));

// Imported AFTER mocks are wired up.
import { GET } from "@/app/api/cron/media-sync/route";
import { NextRequest } from "next/server";

beforeEach(() => {
  mockAuditFindFirst.mockReset();
  mockAuditCreate.mockReset();
  mockHasCredentials.mockReset();
  mockRunMediaSync.mockReset();
  mockClaimMachine.mockReset().mockResolvedValue({ ok: true });
  mockCompleteMachine.mockClear();
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
    // Phase-1 write-amplification forensic — physical-write cause counters.
    delivery_url_refreshed: 0,
    suppressed_url_signature_rotation: 0,
    suppressed_url_identity_changed: 0,
    write_failures: 0,
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
  it("returns 503 when Trestle credentials are missing — no sync work runs", async () => {
    // W2 (2026-07-24): the route is a thin claim wrapper; the credential
    // pre-check now lives in runMediaSyncMember and soft-fails 503 before any
    // Trestle/R2/DB work. (The claim may be taken and released around it — that
    // is harmless; the point is NO media sync executes.)
    mockHasCredentials.mockReturnValue(false);
    const res = await GET(authedReq());
    expect(res.status).toBe(503);
    expect(mockRunMediaSync).not.toHaveBeenCalled();
  });
});

// ─── Machine claim (atomic overlap admission) ────────────────────────────

describe("GET /api/cron/media-sync — atomic machine claim", () => {
  it("skips (starts no work) when the shared claim is refused", async () => {
    mockHasCredentials.mockReturnValue(true);
    mockClaimMachine.mockResolvedValue({ ok: false, reason: "overlap_in_progress" } as never);

    const res = await GET(authedReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(body.reason).toMatch(/machine claim not granted/);
    expect(mockRunMediaSync).not.toHaveBeenCalled();
    expect(mockCompleteMachine).not.toHaveBeenCalled(); // never claimed ⇒ never completes
  });

  it("takes the standalone-media-sync claim and writes a completion in finally when granted", async () => {
    mockHasCredentials.mockReturnValue(true);
    mockClaimMachine.mockResolvedValue({ ok: true } as never);
    mockRunMediaSync.mockResolvedValueOnce(makeRunResult());
    mockAuditCreate.mockResolvedValueOnce(undefined);

    await GET(authedReq());

    expect(mockClaimMachine).toHaveBeenCalledTimes(1);
    const claimInput = mockClaimMachine.mock.calls[0][1] as { executionType: string; member: string };
    expect(claimInput.executionType).toBe("standalone-media-sync");
    expect(claimInput.member).toBe("media-sync");
    expect(mockRunMediaSync).toHaveBeenCalledTimes(1);
    expect(mockCompleteMachine).toHaveBeenCalledTimes(1);
    expect((mockCompleteMachine.mock.calls[0][1] as { outcome: string }).outcome).toBe("success");
  });
});

// ─── Semantic outcome: audit + completion marker are NOT derived from HTTP ────
describe("GET /api/cron/media-sync — semantic outcome (partial / skipped)", () => {
  const auditOutcomeFor = (action: string) =>
    (mockAuditCreate.mock.calls
      .map((c) => (c[0] as { data: { action: string; changes: Record<string, unknown> } }).data)
      .find((d) => d.action === action)?.changes.outcome);
  const markerOutcome = () => (mockCompleteMachine.mock.calls[0][1] as { outcome: string }).outcome;

  beforeEach(() => {
    mockHasCredentials.mockReturnValue(true);
    mockClaimMachine.mockResolvedValue({ ok: true } as never);
    mockAuditCreate.mockResolvedValue(undefined);
  });

  it("rows_failed > 0 ⇒ media_sync_cron audit outcome 'partial' (NOT 'success') and marker 'partial'", async () => {
    // runMediaSync reports status "partial" when rows_failed>0; the member must
    // classify that as a partial outcome, never success — even though HTTP is 200.
    mockRunMediaSync.mockResolvedValueOnce(makeRunResult({ status: "partial", rows_failed: 3 }));
    const res = await GET(authedReq());
    expect(res.status).toBe(200);
    expect(auditOutcomeFor("media_sync_cron")).toBe("partial");
    expect(markerOutcome()).toBe("partial");
  });

  it("r2_failed > 0 ⇒ audit outcome 'partial' and marker 'partial'", async () => {
    mockRunMediaSync.mockResolvedValueOnce(makeRunResult({ status: "partial", r2_failed: 4 }));
    await GET(authedReq());
    expect(auditOutcomeFor("media_sync_cron")).toBe("partial");
    expect(markerOutcome()).toBe("partial");
  });

  it("a clean run (no failures) still writes audit outcome 'success' and marker 'success'", async () => {
    mockRunMediaSync.mockResolvedValueOnce(makeRunResult());
    await GET(authedReq());
    expect(auditOutcomeFor("media_sync_cron")).toBe("success");
    expect(markerOutcome()).toBe("success");
  });

  it("missing credentials ⇒ 503, member outcome 'skipped' ⇒ completion marker 'skipped' (not 'success')", async () => {
    mockHasCredentials.mockReturnValue(false);
    const res = await GET(authedReq());
    expect(res.status).toBe(503);
    expect(mockRunMediaSync).not.toHaveBeenCalled();
    expect(mockCompleteMachine).toHaveBeenCalledTimes(1);
    expect(markerOutcome()).toBe("skipped");
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

    // PHASE 4a — bounded R2 policy re-admission. This AuditEvent is the DOMAIN
    // record for media-sync and the only durable evidence a standalone
    // (non-One-Cycle) run leaves behind, so the sweep's counters must persist
    // HERE, not only in the One Cycle member summary. `reevaluated` (rows
    // examined) and `decided` (bounded write-intent) are separate fields on
    // purpose. The two cursor flags stop a fail-open rotation from failing
    // invisibly. All aggregate integers/booleans — same allowlist class.
    const phase4aPolicyCounters = [
      "r2_policy_reevaluated", "r2_policy_decided", "r2_policy_readmitted",
      "r2_policy_kept_parked", "r2_policy_deferred", "r2_policy_write_failed",
      "r2_policy_selector_failed",
      "r2_policy_cursor_read_failed", "r2_policy_cursor_write_failed",
      "r2_policy_budget_exhausted",
    ];
    for (const k of phase4aPolicyCounters) {
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

    // Phase-1 write-amplification forensic (2026-07-25) — explicit physical-write
    // cause attribution must persist so the ~10K/day previously-unattributed media
    // writes can be split (delivery-refresh vs material vs insert vs tombstone).
    // Compact integers only; additive/observability — no URLs/values/PII.
    const phase1CauseCounters = [
      "delivery_url_refreshed", "suppressed_url_signature_rotation",
      "suppressed_url_identity_changed", "write_failures",
    ];
    for (const k of phase1CauseCounters) {
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
      ...phase1CauseCounters,
      ...phase4aPolicyCounters,
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

  it("emits Phase-1 cause counters with EXACT nonzero values and the physical-write invariant holds", async () => {
    // Distinct nonzero values so a wiring bug that dropped/zeroed any counter
    // fails loudly (the zero-default toHaveProperty check could not). Chosen to
    // satisfy the physical-write invariant that lets the ~10K/day writes be
    // split by cause using ONLY durable fields (physical_writes/non_tombstone
    // are intentionally NOT stored — audit-growth minimization):
    //   rows_updated === rows_inserted + rows_updated_changed
    //                    + delivery_url_refreshed + tombstoned_explicit + tombstoned_vanished
    const inserted = 3, updatedChanged = 5, deliveryRefresh = 7, tExplicit = 2, tVanished = 1;
    const rowsUpdated = inserted + updatedChanged + deliveryRefresh + tExplicit + tVanished; // 18
    mockRunMediaSync.mockResolvedValueOnce(
      makeRunResult({
        rows_checked: 40,
        rows_updated: rowsUpdated,
        rows_inserted: inserted,
        rows_updated_changed: updatedChanged,
        delivery_url_refreshed: deliveryRefresh,
        suppressed_url_signature_rotation: 9,
        suppressed_url_identity_changed: 4,
        write_failures: 0,
        tombstoned_explicit: tExplicit,
        tombstoned_vanished: tVanished,
        rows_tombstoned: tExplicit + tVanished,
      }),
    );
    mockAuditCreate.mockResolvedValueOnce(undefined);

    await GET(authedReq());
    const ch = (mockAuditCreate.mock.calls[0][0] as {
      data: { changes: Record<string, number> };
    }).data.changes;

    // Exact values flowed member → durable payload (not zeros, not dropped).
    expect(ch.delivery_url_refreshed).toBe(7);
    expect(ch.suppressed_url_signature_rotation).toBe(9);
    expect(ch.suppressed_url_identity_changed).toBe(4);
    expect(ch.write_failures).toBe(0);

    // Invariant holds on the durable payload → cause split is fully recoverable.
    expect(ch.rows_updated).toBe(
      ch.rows_inserted +
        ch.rows_updated_changed +
        ch.delivery_url_refreshed +
        ch.tombstoned_explicit +
        ch.tombstoned_vanished,
    );
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
