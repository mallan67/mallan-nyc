/// <reference types="jest" />
/**
 * Standalone / manual idx-sync + media-sync must NOT overlap an active One
 * Cycle, and member telemetry must persist (with run_id) on success AND error.
 *
 * Proves:
 *   - manual idx-sync during an active One Cycle starts no work;
 *   - ?full=true during an active One Cycle starts no work;
 *   - manual media-sync during an active One Cycle starts no work;
 *   - the orchestrated call itself is exempt (it IS the machine);
 *   - error audits retain run_id + the Cotality counters (429/retry/request/duration);
 *   - successful member telemetry is correlated with the run_id.
 */
import { NextRequest } from "next/server";

// The shared atomic claim is mocked so we can drive granted/refused deterministically.
const claimMachine = jest.fn<Promise<{ ok: boolean; reason?: string }>, [unknown, unknown]>();
const completeMachine = jest.fn<Promise<void>, [unknown, unknown]>(async () => {});
jest.mock("@/lib/idx/machine-claim", () => ({
  claimMachine: (db: unknown, input: unknown) => claimMachine(db, input),
  completeMachine: (db: unknown, input: unknown) => completeMachine(db, input),
  MACHINE_STALE_MS: 300_000,
  MACHINE_STARTED: "one_cycle_started",
  MACHINE_COMPLETED: "one_cycle_run",
}));

const syncListings = jest.fn();
const getLastSyncTimestamp = jest.fn(async () => new Date("2026-07-20T00:00:00Z"));
jest.mock("@/lib/idx/sync", () => ({
  syncListings: (...a: unknown[]) => syncListings(...a),
  getLastSyncTimestamp: () => getLastSyncTimestamp(),
}));

const runMediaSync = jest.fn();
jest.mock("@/lib/idx/media-sync", () => ({
  runMediaSync: (...a: unknown[]) => runMediaSync(...a),
  getMediaSyncCursor: async () => ({ last_photos_change: new Date() }),
}));

jest.mock("@/lib/idx/auth", () => ({
  hasCredentials: () => true,
  getAccessToken: async () => "test-token",
}));

const auditCreate = jest.fn(async (_a?: unknown) => ({}));
jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    auditEvent: { findFirst: async () => null, create: (a: unknown) => auditCreate(a) },
  },
}));

// The REAL telemetry module (not mocked) so ALS + counters behave for real.
const { recordCotalityHttp } = require("@/lib/idx/cotality-telemetry");

process.env.CRON_SECRET = "sec";
process.env.IDX_ENABLED = "true";
const AUTH = "Bearer sec";
const { GET: idxGET } = require("@/app/api/cron/idx-sync/route");
const { GET: mediaGET } = require("@/app/api/cron/media-sync/route");

const req = (opts: { url?: string; orchestrated?: boolean; runId?: string } = {}) => {
  const headers: Record<string, string> = { authorization: AUTH };
  if (opts.orchestrated) headers["x-one-cycle-member"] = "sec";
  if (opts.runId) headers["x-one-cycle-run-id"] = opts.runId;
  return new NextRequest(opts.url ?? "https://mallan.nyc/api/cron/idx-sync", { headers });
};

beforeEach(() => {
  syncListings.mockReset().mockResolvedValue({ processed: 0 });
  runMediaSync.mockReset().mockResolvedValue({
    status: "ok", exit_reason: "completed", rows_checked: 0, rows_updated: 0,
    rows_inserted: 0, rows_updated_changed: 0, rows_skipped_unchanged: 0,
    rows_skipped_invalid: 0, delete_signals_received: 0, tombstoned_explicit: 0,
    tombstoned_vanished: 0, rows_tombstoned: 0, existing_rows_compared: 0,
    mismatch_status: 0, mismatch_listing_id: 0, mismatch_resource_record_key: 0,
    mismatch_resource_record_id: 0, mismatch_media_url_exact: 0,
    mismatch_media_url_identity: 0, mismatch_media_url_identity_equivalent: 0,
    mismatch_media_type: 0, mismatch_media_category: 0, mismatch_media_classification: 0,
    mismatch_order: 0, mismatch_preferred_photo: 0, mismatch_media_modification_ts: 0,
    mismatch_modification_ts: 0, rows_with_one_mismatch: 0, rows_with_multiple_mismatches: 0,
    rows_failed: 0, listings_processed: 0, listings_skipped: 0, r2_mirrored: 0,
    r2_failed: 0, r2_skipped: 0, backlog_remaining: 0, r2_backlog_batch_selected: 0,
    r2_parked_recovery_selected: 0, r2_parked_recovery_attempted: 0,
    r2_failure_budget_exhausted: false,
    summary_writes: { rows_checked: 0, rows_materially_changed: 0, rows_suppressed_unchanged: 0, rows_inserted: 0, rows_updated: 0, rows_failed: 0 },
    pages_revalidated: 0, revalidation_failures: 0, backlog_inflow_since_last_run: 0,
    rows_selected: 0, rows_attempted: 0, rows_drained: 0, failures: 0, overlap_prevented: 0,
    time_budget_exhausted: false, query_path_classification: "backlog", run_duration_ms: 1,
    mirror_allowed: 0, mirror_rejected_policy: 0, mirror_rejected_policy_parked: 0,
    r2_uploaded: 0, r2_reused: 0, duration_ms: 1, ghost_listings_skipped: 0, ghost_listing_ids: [],
  });
  claimMachine.mockReset().mockResolvedValue({ ok: true });
  completeMachine.mockClear();
  auditCreate.mockClear();
});

describe("standalone idx-sync overlap block (atomic claim)", () => {
  it("manual idx-sync refused by the claim starts NO work", async () => {
    claimMachine.mockResolvedValue({ ok: false, reason: "overlap_in_progress" });
    const res = await idxGET(req());
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(body.reason).toMatch(/machine claim not granted/);
    expect(syncListings).not.toHaveBeenCalled();
    expect(completeMachine).not.toHaveBeenCalled(); // never claimed ⇒ never completes
  });

  it("?full=true refused by the claim starts NO work (cannot escape the shared claim)", async () => {
    claimMachine.mockResolvedValue({ ok: false, reason: "lock_contended" });
    const res = await idxGET(req({ url: "https://mallan.nyc/api/cron/idx-sync?full=true" }));
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(syncListings).not.toHaveBeenCalled();
    // The claim WAS attempted for full=true (no bypass).
    expect(claimMachine).toHaveBeenCalledTimes(1);
    expect((claimMachine.mock.calls[0][1] as { executionType: string }).executionType).toBe("standalone-idx-sync");
  });

  it("the ORCHESTRATED call takes NO claim and runs (One Cycle owns the machine)", async () => {
    await idxGET(req({ orchestrated: true, runId: "run-x" }));
    expect(claimMachine).not.toHaveBeenCalled();
    expect(syncListings).toHaveBeenCalledTimes(1);
  });

  it("manual idx-sync GRANTED the claim runs and writes a completion in finally", async () => {
    claimMachine.mockResolvedValue({ ok: true });
    await idxGET(req());
    expect(syncListings).toHaveBeenCalledTimes(1);
    expect(completeMachine).toHaveBeenCalledTimes(1);
    expect((completeMachine.mock.calls[0][1] as { outcome: string }).outcome).toBe("success");
  });
});

describe("standalone media-sync overlap block (atomic claim)", () => {
  it("manual media-sync refused by the claim starts NO work", async () => {
    claimMachine.mockResolvedValue({ ok: false, reason: "overlap_in_progress" });
    const res = await mediaGET(new NextRequest("https://mallan.nyc/api/cron/media-sync", { headers: { authorization: AUTH } }));
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(body.reason).toMatch(/machine claim not granted/);
    expect(runMediaSync).not.toHaveBeenCalled();
  });

  it("the ORCHESTRATED media-sync call takes NO claim and runs", async () => {
    await mediaGET(new NextRequest("https://mallan.nyc/api/cron/media-sync", {
      headers: { authorization: AUTH, "x-one-cycle-member": "sec", "x-one-cycle-run-id": "run-y" },
    }));
    expect(runMediaSync).toHaveBeenCalledTimes(1);
  });
});

describe("telemetry persists with run_id on success AND error", () => {
  it("success: idx_sync_cron audit carries run_id + cotality snapshot + outcome", async () => {
    // The mock runs INSIDE the collector context (route wraps it) → records real counters.
    syncListings.mockImplementation(async () => {
      recordCotalityHttp({ url: "/odata/Property", durationMs: 20, status: 200 });
      return { processed: 1 };
    });
    await idxGET(req({ orchestrated: true, runId: "run-ok" }));
    const audit = auditCreate.mock.calls.map((c) => (c[0] as { data: { action: string; changes: Record<string, unknown> } }).data)
      .find((d) => d.action === "idx_sync_cron");
    expect(audit).toBeDefined();
    expect(audit!.changes.one_cycle_run_id).toBe("run-ok");
    expect(audit!.changes.outcome).toBe("success");
    expect((audit!.changes.cotality as Record<string, number>).total_cotality_requests).toBe(1);
  });

  it("error: idx_sync_cron_error audit RETAINS run_id + the 429/retry/request/duration counters", async () => {
    syncListings.mockImplementation(async () => {
      // A 429 + retry + a token refresh happen, THEN the run throws.
      recordCotalityHttp({ url: "/odata/Property", durationMs: 12, status: 429, retryAfterSeconds: 5 });
      const t = require("@/lib/idx/cotality-telemetry");
      t.recordRetry();
      t.recordTokenRefresh();
      throw new Error("Trestle exploded");
    });
    const res = await idxGET(req({ orchestrated: true, runId: "run-err" }));
    expect(res.status).toBe(500);
    const audit = auditCreate.mock.calls.map((c) => (c[0] as { data: { action: string; changes: Record<string, unknown> } }).data)
      .find((d) => d.action === "idx_sync_cron_error");
    expect(audit).toBeDefined();
    expect(audit!.changes.one_cycle_run_id).toBe("run-err");
    expect(audit!.changes.outcome).toBe("error");
    const cot = audit!.changes.cotality as Record<string, number>;
    expect(cot.http_429_count).toBe(1);
    expect(cot.retry_after_seconds).toBe(5);
    expect(cot.retries).toBe(1);
    expect(cot.token_refreshes).toBe(1);
    expect(cot.total_cotality_requests).toBe(1);
    expect(cot.cotality_duration_ms).toBe(12);
  });
});
