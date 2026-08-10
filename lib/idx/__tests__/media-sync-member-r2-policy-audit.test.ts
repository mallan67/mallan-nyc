/// <reference types="jest" />
/**
 * PHASE 4a telemetry must reach the DOMAIN audit, not only the One Cycle
 * member summary.
 *
 * DEFECT (found in review of 892eb8e3). `runMediaSync()` returns the
 * `r2_policy_*` counters, and the route hands the whole result back as its HTTP
 * body — so One Cycle's member summary carried them. But
 * `media-sync-member.ts` writes the `media_sync_cron` AuditEvent from an
 * EXPLICIT field list, and that list jumped straight from
 * `mirror_rejected_policy_parked` to `r2_mirrored`. The counters were therefore
 * absent from the domain audit and from every standalone (non-One-Cycle)
 * media-sync run — which is exactly the evidence path Production verification
 * uses. A correction whose primary audit omits its own counters is not
 * observable.
 *
 * These tests drive the REAL `runMediaSyncMember` and assert on the AuditEvent
 * it actually persists. A source grep would not have caught the omission,
 * because the fields exist on the result type either way.
 */

const mockRunMediaSync = jest.fn<Promise<Record<string, unknown>>, []>();
const mockAuditCreate = jest.fn<Promise<unknown>, [unknown]>();

jest.mock("@/lib/idx/auth", () => ({
  __esModule: true,
  hasCredentials: () => true,
}));

jest.mock("@/lib/idx/media-sync", () => ({
  __esModule: true,
  runMediaSync: () => mockRunMediaSync(),
}));

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: { auditEvent: { create: (args: unknown) => mockAuditCreate(args) } },
}));

import { runMediaSyncMember } from "../media-sync-member";

/** Every PHASE 4a field the domain audit must carry. */
const R2_POLICY_FIELDS = [
  "r2_policy_reevaluated",
  "r2_policy_decided",
  "r2_policy_readmitted",
  "r2_policy_kept_parked",
  "r2_policy_deferred",
  "r2_policy_write_failed",
  "r2_policy_selector_failed",
  "r2_policy_cursor_read_failed",
  "r2_policy_cursor_write_failed",
] as const;

/** A minimally complete `runMediaSync` result with distinguishable values. */
function makeResult(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    rows_checked: 0, rows_inserted: 0, rows_updated: 0, rows_updated_changed: 0,
    rows_skipped_unchanged: 0, rows_skipped_invalid: 0, rows_tombstoned: 0,
    mismatch_status: 0, mismatch_listing_id: 0, mismatch_media_url_original: 0,
    mismatch_resource_record_key: 0, mismatch_resource_record_id: 0,
    mismatch_media_url_exact: 0, mismatch_media_url_identity: 0,
    mismatch_media_url_identity_equivalent: 0, mismatch_media_type: 0,
    mismatch_media_category: 0, mismatch_media_classification: 0,
    mismatch_order: 0, mismatch_preferred_photo: 0,
    mismatch_media_modification_ts: 0, mismatch_modification_ts: 0,
    rows_with_one_mismatch: 0, rows_with_multiple_mismatches: 0, rows_failed: 0,
    listings_processed: 0, listings_skipped: 0,
    summary_writes: {
      rows_checked: 0, rows_materially_changed: 0, rows_suppressed_unchanged: 0,
      rows_inserted: 0, rows_updated: 0, rows_failed: 0,
    },
    pages_revalidated: 0, revalidation_failures: 0,
    backlog_inflow_since_last_run: 0, rows_selected: 0, rows_attempted: 0,
    rows_drained: 0, failures: [], overlap_prevented: 0,
    time_budget_exhausted: false, query_path_classification: "adaptive",
    run_duration_ms: 1, r2_backlog_batch_selected: 0,
    r2_parked_recovery_selected: 0, r2_parked_recovery_attempted: 0,
    r2_failure_budget_exhausted: false, mirror_allowed: 0,
    mirror_rejected_policy: 0, mirror_rejected_policy_parked: 0,
    // PHASE 4a — deliberately distinct values so a mis-wired field is visible.
    r2_policy_reevaluated: 71, r2_policy_decided: 60, r2_policy_readmitted: 5,
    r2_policy_kept_parked: 54, r2_policy_deferred: 11, r2_policy_write_failed: 1,
    r2_policy_selector_failed: false,
    r2_policy_cursor_read_failed: false, r2_policy_cursor_write_failed: false,
    r2_mirrored: 0, r2_uploaded: 0, r2_reused: 0, r2_failed: 0, r2_skipped: 0,
    backlog_remaining: 0, duration_ms: 1,
    ghost_listings_skipped: 0, ghost_listing_ids: [],
    ...over,
  };
}

function auditPayload(): Record<string, unknown> {
  const call = mockAuditCreate.mock.calls.at(-1)?.[0] as
    | { data: { action: string; changes: Record<string, unknown> } }
    | undefined;
  expect(call?.data.action).toBe("media_sync_cron");
  return call!.data.changes;
}

beforeEach(() => {
  mockRunMediaSync.mockReset();
  mockAuditCreate.mockReset().mockResolvedValue(undefined);
});

describe("media_sync_cron audit carries the PHASE 4a policy telemetry", () => {
  it("persists every r2_policy_* field with the value runMediaSync returned", async () => {
    mockRunMediaSync.mockResolvedValue(makeResult());

    await runMediaSyncMember({ oneCycleRunId: "run-1" });

    const changes = auditPayload();
    for (const field of R2_POLICY_FIELDS) {
      expect({ field, present: field in changes }).toEqual({ field, present: true });
    }
    // Values, not just presence — a field wired to the wrong source would pass
    // a presence check.
    expect(changes.r2_policy_reevaluated).toBe(71);
    expect(changes.r2_policy_decided).toBe(60);
    expect(changes.r2_policy_readmitted).toBe(5);
    expect(changes.r2_policy_kept_parked).toBe(54);
    expect(changes.r2_policy_deferred).toBe(11);
    expect(changes.r2_policy_write_failed).toBe(1);
    expect(changes.r2_policy_selector_failed).toBe(false);
  });

  it("scanned and decided stay DISTINCT in the durable record", async () => {
    // The batch limit bounds `decided`, not `reevaluated`; collapsing them in
    // the audit would hide a top-up that replaced deferred rows.
    mockRunMediaSync.mockResolvedValue(makeResult());
    await runMediaSyncMember({ oneCycleRunId: null });
    const changes = auditPayload();
    expect(changes.r2_policy_reevaluated).not.toBe(changes.r2_policy_decided);
    expect(changes.r2_policy_decided).toBe(
      (changes.r2_policy_readmitted as number) +
        (changes.r2_policy_kept_parked as number) +
        (changes.r2_policy_write_failed as number),
    );
  });

  it("a selector failure is durable, and distinguishable from a quiet run", async () => {
    mockRunMediaSync.mockResolvedValue(
      makeResult({ r2_policy_reevaluated: 0, r2_policy_decided: 0, r2_policy_readmitted: 0,
                   r2_policy_kept_parked: 0, r2_policy_deferred: 0, r2_policy_write_failed: 0,
                   r2_policy_selector_failed: true }),
    );
    await runMediaSyncMember({ oneCycleRunId: null });
    expect(auditPayload().r2_policy_selector_failed).toBe(true);
  });

  it("cursor read and write failures are durable — fail-open, not fail-invisible", async () => {
    mockRunMediaSync.mockResolvedValue(
      makeResult({ r2_policy_cursor_read_failed: true, r2_policy_cursor_write_failed: true }),
    );
    await runMediaSyncMember({ oneCycleRunId: "run-2" });
    const changes = auditPayload();
    expect(changes.r2_policy_cursor_read_failed).toBe(true);
    expect(changes.r2_policy_cursor_write_failed).toBe(true);
  });

  it("the One Cycle member summary carries the same fields (HTTP body is the result)", async () => {
    mockRunMediaSync.mockResolvedValue(makeResult());
    const res = await runMediaSyncMember({ oneCycleRunId: "run-3" });
    const body = res.body as Record<string, unknown>;
    for (const field of R2_POLICY_FIELDS) {
      expect({ field, present: field in body }).toEqual({ field, present: true });
    }
  });

  it("no private value enters the telemetry", async () => {
    mockRunMediaSync.mockResolvedValue(makeResult());
    await runMediaSyncMember({ oneCycleRunId: "run-4" });
    const changes = auditPayload();
    const policyOnly = Object.fromEntries(
      Object.entries(changes).filter(([k]) => k.startsWith("r2_policy_")),
    );
    // Counters and booleans only — never an id, key, URL or listing identifier.
    for (const [key, value] of Object.entries(policyOnly)) {
      expect({ key, type: typeof value }).toEqual({
        key,
        type: typeof value === "boolean" ? "boolean" : "number",
      });
    }
    expect(JSON.stringify(policyOnly)).not.toMatch(/https?:|crm:|RLS\d|SL-\d|media_key/i);
  });
});

export {};
