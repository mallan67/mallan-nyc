/// <reference types="jest" />
/**
 * Standalone / manual idx-sync + media-sync must NOT overlap an active One
 * Cycle, and NO forged HTTP header can bypass the shared atomic claim.
 *
 * The confused-deputy fix: the public GET routes no longer read
 * x-one-cycle-member / x-one-cycle-run-id. A caller holding CRON_SECRET can no
 * longer forge "I am the orchestrator" to reach the unclaimed member path. The
 * ONLY unclaimed path is the in-process import of runIdxSyncMember /
 * runMediaSyncMember, unreachable over HTTP.
 *
 * Proves:
 *   - a public idx-sync request with a valid Bearer + FORGED x-one-cycle-member
 *     STILL takes the shared claim (granted ⇒ runs, refused ⇒ no work);
 *   - ?full=true still claims (no bypass);
 *   - equivalent media-sync cases;
 *   - the internal member functions never claim (import-only unclaimed path);
 *   - member telemetry persists (with the route's OWN claim run_id) on success
 *     AND error.
 */
import { NextRequest } from "next/server";

// The shared atomic claim is mocked so we can drive granted/refused deterministically.
const claimMachine = jest.fn<Promise<{ ok: boolean; reason?: string; runId?: string }>, [unknown, unknown]>();
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
// runIdxSyncMember resolves its resume position via getPropertyKeysetCursor
// (timestamp + ListingKey tie-breaker), not the bare timestamp. Mocking only
// getLastSyncTimestamp leaves the cursor accessor undefined, which throws before
// syncListings is ever reached.
const getPropertyKeysetCursor = jest.fn(async () => ({
  since: new Date("2026-07-20T00:00:00Z"),
  listingKey: null as string | null,
}));
jest.mock("@/lib/idx/sync", () => ({
  syncListings: (...a: unknown[]) => syncListings(...a),
  getLastSyncTimestamp: () => getLastSyncTimestamp(),
  getPropertyKeysetCursor: () => getPropertyKeysetCursor(),
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
// The internal member work functions — the ONLY unclaimed path (import-only).
const { runIdxSyncMember } = require("@/lib/idx/idx-sync-member");
const { runMediaSyncMember } = require("@/lib/idx/media-sync-member");

// `forged` sets x-one-cycle-member = CRON_SECRET (the exact forgery a
// CRON_SECRET holder could send). The routes must IGNORE it and claim anyway.
const req = (opts: { url?: string; forged?: boolean; runId?: string } = {}) => {
  const headers: Record<string, string> = { authorization: AUTH };
  if (opts.forged) headers["x-one-cycle-member"] = "sec";
  if (opts.runId) headers["x-one-cycle-run-id"] = opts.runId;
  return new NextRequest(opts.url ?? "https://mallan.nyc/api/cron/idx-sync", { headers });
};

// The route generates its OWN claim run_id (randomUUID) and passes it to
// claimMachine as `runId` AND to the member as `oneCycleRunId`. This reads it
// back from the claim call so telemetry correlation can be asserted.
const routeRunId = () => (claimMachine.mock.calls[0][1] as { runId: string }).runId;

// A clean (status "ok", zero-failure) runMediaSync result. Spread + override to
// build partial variants (rows_failed / r2_failed).
const mediaOkResult = () => ({
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

beforeEach(() => {
  syncListings.mockReset().mockResolvedValue({ processed: 0 });
  runMediaSync.mockReset().mockResolvedValue(mediaOkResult());
  claimMachine.mockReset().mockResolvedValue({ ok: true });
  completeMachine.mockClear();
  auditCreate.mockClear();
});

describe("standalone idx-sync ALWAYS claims — a forged header cannot bypass", () => {
  it("valid Bearer + FORGED x-one-cycle-member, refused by the claim, starts NO work", async () => {
    claimMachine.mockResolvedValue({ ok: false, reason: "overlap_in_progress" });
    const res = await idxGET(req({ forged: true, runId: "attacker-run" }));
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(body.reason).toMatch(/machine claim not granted/);
    // The forged header did NOT exempt the request — the claim WAS attempted.
    expect(claimMachine).toHaveBeenCalledTimes(1);
    expect((claimMachine.mock.calls[0][1] as { executionType: string }).executionType).toBe("standalone-idx-sync");
    expect(syncListings).not.toHaveBeenCalled();
    expect(completeMachine).not.toHaveBeenCalled(); // never claimed ⇒ never completes
  });

  it("valid Bearer + FORGED x-one-cycle-member, GRANTED the claim, runs under a fresh route run_id", async () => {
    claimMachine.mockResolvedValue({ ok: true });
    await idxGET(req({ forged: true, runId: "attacker-run" }));
    // Claim taken (forgery ignored), work ran, completion written.
    expect(claimMachine).toHaveBeenCalledTimes(1);
    expect(syncListings).toHaveBeenCalledTimes(1);
    expect(completeMachine).toHaveBeenCalledTimes(1);
    // The route used its OWN randomUUID run id, NOT the forged header value.
    expect(routeRunId()).not.toBe("attacker-run");
  });

  it("?full=true refused by the claim starts NO work (cannot escape the shared claim)", async () => {
    claimMachine.mockResolvedValue({ ok: false, reason: "lock_contended" });
    const res = await idxGET(req({ url: "https://mallan.nyc/api/cron/idx-sync?full=true", forged: true }));
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(syncListings).not.toHaveBeenCalled();
    expect(claimMachine).toHaveBeenCalledTimes(1);
    expect((claimMachine.mock.calls[0][1] as { executionType: string }).executionType).toBe("standalone-idx-sync");
  });

  it("manual idx-sync GRANTED the claim runs and writes a completion in finally", async () => {
    claimMachine.mockResolvedValue({ ok: true });
    await idxGET(req());
    expect(syncListings).toHaveBeenCalledTimes(1);
    expect(completeMachine).toHaveBeenCalledTimes(1);
    expect((completeMachine.mock.calls[0][1] as { outcome: string }).outcome).toBe("success");
  });
});

describe("standalone media-sync ALWAYS claims — a forged header cannot bypass", () => {
  const mediaReq = (forged: boolean) =>
    new NextRequest("https://mallan.nyc/api/cron/media-sync", {
      headers: forged
        ? { authorization: AUTH, "x-one-cycle-member": "sec", "x-one-cycle-run-id": "attacker-run" }
        : { authorization: AUTH },
    });

  it("valid Bearer + FORGED x-one-cycle-member, refused by the claim, starts NO work", async () => {
    claimMachine.mockResolvedValue({ ok: false, reason: "overlap_in_progress" });
    const res = await mediaGET(mediaReq(true));
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(body.reason).toMatch(/machine claim not granted/);
    expect(claimMachine).toHaveBeenCalledTimes(1);
    expect((claimMachine.mock.calls[0][1] as { executionType: string }).executionType).toBe("standalone-media-sync");
    expect(runMediaSync).not.toHaveBeenCalled();
  });

  it("valid Bearer + FORGED x-one-cycle-member, GRANTED the claim, runs under a fresh route run_id", async () => {
    claimMachine.mockResolvedValue({ ok: true });
    await mediaGET(mediaReq(true));
    expect(claimMachine).toHaveBeenCalledTimes(1);
    expect(runMediaSync).toHaveBeenCalledTimes(1);
    expect(routeRunId()).not.toBe("attacker-run");
  });
});

describe("internal member functions never claim (import-only unclaimed path)", () => {
  it("runIdxSyncMember called directly does NOT claim and runs the work", async () => {
    await runIdxSyncMember({ oneCycleRunId: "orchestrator-run", forceFull: false });
    expect(claimMachine).not.toHaveBeenCalled();
    expect(syncListings).toHaveBeenCalledTimes(1);
  });

  it("runMediaSyncMember called directly does NOT claim and runs the work", async () => {
    await runMediaSyncMember({ oneCycleRunId: "orchestrator-run" });
    expect(claimMachine).not.toHaveBeenCalled();
    expect(runMediaSync).toHaveBeenCalledTimes(1);
  });
});

// ─── standalone completion markers preserve the SEMANTIC outcome ──────────────
describe("standalone completion markers preserve skipped / partial / error", () => {
  const markerOutcome = () => (completeMachine.mock.calls[0][1] as { outcome: string }).outcome;

  it("IDX disabled ⇒ marker outcome 'skipped' (NOT 'success'); no sync work runs", async () => {
    claimMachine.mockResolvedValue({ ok: true });
    const prev = process.env.IDX_ENABLED;
    process.env.IDX_ENABLED = "false"; // precondition failure inside the member
    try {
      const res = await idxGET(req());
      const body = await res.json();
      expect(body.skipped).toBe(true); // HTTP body stays backward-compatible
      expect(syncListings).not.toHaveBeenCalled(); // no work
      expect(completeMachine).toHaveBeenCalledTimes(1);
      expect(markerOutcome()).toBe("skipped"); // ledger truth: never "success"
    } finally {
      process.env.IDX_ENABLED = prev;
    }
  });

  it("media rows_failed > 0 ⇒ member 'partial' ⇒ marker outcome 'partial'", async () => {
    claimMachine.mockResolvedValue({ ok: true });
    runMediaSync.mockResolvedValueOnce({ ...mediaOkResult(), status: "partial", rows_failed: 3 });
    await mediaGET(new NextRequest("https://mallan.nyc/api/cron/media-sync", { headers: { authorization: AUTH } }));
    expect(runMediaSync).toHaveBeenCalledTimes(1);
    expect(completeMachine).toHaveBeenCalledTimes(1);
    expect(markerOutcome()).toBe("partial");
  });

  it("media r2_failed > 0 ⇒ member 'partial' ⇒ marker outcome 'partial'", async () => {
    claimMachine.mockResolvedValue({ ok: true });
    runMediaSync.mockResolvedValueOnce({ ...mediaOkResult(), status: "partial", r2_failed: 4 });
    await mediaGET(new NextRequest("https://mallan.nyc/api/cron/media-sync", { headers: { authorization: AUTH } }));
    expect(markerOutcome()).toBe("partial");
  });

  it("media thrown failure ⇒ member 'error' ⇒ marker outcome 'error'", async () => {
    claimMachine.mockResolvedValue({ ok: true });
    runMediaSync.mockRejectedValueOnce(new Error("Neon write timeout"));
    const res = await mediaGET(new NextRequest("https://mallan.nyc/api/cron/media-sync", { headers: { authorization: AUTH } }));
    expect(res.status).toBe(500);
    expect(completeMachine).toHaveBeenCalledTimes(1);
    expect(markerOutcome()).toBe("error");
  });

  it("IDX syncListings errors>0 ⇒ member 'partial' ⇒ audit outcome 'partial' + marker 'partial'", async () => {
    // syncListings resolves (does not throw) with a nonzero per-record error
    // count; the member must classify that as partial, not success.
    claimMachine.mockResolvedValue({ ok: true });
    syncListings.mockResolvedValueOnce({
      total_fetched: 500, upserted: 496, skipped_gates: 0, skipped_validation: 0,
      errors: 4, duration_ms: 1, write_paths: {},
    });
    await idxGET(req());
    const idxAudit = auditCreate.mock.calls
      .map((c) => (c[0] as { data: { action: string; changes: Record<string, unknown> } }).data)
      .find((d) => d.action === "idx_sync_cron");
    expect(idxAudit).toBeDefined();
    expect(idxAudit!.changes.outcome).toBe("partial"); // NOT "success"
    expect(completeMachine).toHaveBeenCalledTimes(1);
    expect(markerOutcome()).toBe("partial");
  });

  it("IDX syncListings errors===0 ⇒ member 'ok' ⇒ audit outcome 'success' + marker 'success'", async () => {
    claimMachine.mockResolvedValue({ ok: true });
    syncListings.mockResolvedValueOnce({
      total_fetched: 500, upserted: 500, skipped_gates: 0, skipped_validation: 0,
      errors: 0, duration_ms: 1, write_paths: {},
    });
    await idxGET(req());
    const idxAudit = auditCreate.mock.calls
      .map((c) => (c[0] as { data: { action: string; changes: Record<string, unknown> } }).data)
      .find((d) => d.action === "idx_sync_cron");
    expect(idxAudit!.changes.outcome).toBe("success");
    expect(markerOutcome()).toBe("success");
  });
});

describe("telemetry persists with the route's OWN claim run_id on success AND error", () => {
  it("success: idx_sync_cron audit carries the route run_id + cotality snapshot + outcome", async () => {
    // The mock runs INSIDE the collector context (member wraps it) → records real counters.
    syncListings.mockImplementation(async () => {
      recordCotalityHttp({ url: "/odata/Property", durationMs: 20, status: 200 });
      return { processed: 1 };
    });
    await idxGET(req({ forged: true, runId: "attacker-run" }));
    const audit = auditCreate.mock.calls.map((c) => (c[0] as { data: { action: string; changes: Record<string, unknown> } }).data)
      .find((d) => d.action === "idx_sync_cron");
    expect(audit).toBeDefined();
    // Correlated with the ROUTE's claim run_id — never the forged header value.
    expect(audit!.changes.one_cycle_run_id).toBe(routeRunId());
    expect(audit!.changes.one_cycle_run_id).not.toBe("attacker-run");
    expect(audit!.changes.outcome).toBe("success");
    expect((audit!.changes.cotality as Record<string, number>).total_cotality_requests).toBe(1);
  });

  it("error: idx_sync_cron_error audit RETAINS the route run_id + the 429/retry/request/duration counters", async () => {
    syncListings.mockImplementation(async () => {
      // A 429 + retry + a token refresh happen, THEN the run throws.
      recordCotalityHttp({ url: "/odata/Property", durationMs: 12, status: 429, retryAfterSeconds: 5 });
      const t = require("@/lib/idx/cotality-telemetry");
      t.recordRetry();
      t.recordTokenRefresh();
      throw new Error("Trestle exploded");
    });
    const res = await idxGET(req({ forged: true, runId: "attacker-run" }));
    expect(res.status).toBe(500);
    const audit = auditCreate.mock.calls.map((c) => (c[0] as { data: { action: string; changes: Record<string, unknown> } }).data)
      .find((d) => d.action === "idx_sync_cron_error");
    expect(audit).toBeDefined();
    expect(audit!.changes.one_cycle_run_id).toBe(routeRunId());
    expect(audit!.changes.one_cycle_run_id).not.toBe("attacker-run");
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
