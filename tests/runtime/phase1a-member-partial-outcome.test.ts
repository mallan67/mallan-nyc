/// <reference types="jest" />
/**
 * Phase 1A — `run_status: "partial"` must reach the scheduled member.
 *
 * syncListings reports partial for an INCOMPLETE legacy-media batch with
 * errors === 0 (stored media preserved, watermark capped for retry). The member
 * previously derived its outcome from `errors` alone, so that case surfaced as
 * a fully successful cycle member — and the orchestrator's non-ok chain stop,
 * which is what HOLDS the downstream media member, never fired.
 */

const mockAuditCreate = jest.fn();
jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: { auditEvent: { create: (a: unknown) => mockAuditCreate(a) } },
}));

jest.mock("@/lib/idx/auth", () => ({
  __esModule: true,
  hasCredentials: () => true,
  getAccessToken: async () => "mock-token",
}));

const mockSyncListings = jest.fn();
const mockGetLastSyncTimestamp = jest.fn();
jest.mock("@/lib/idx/sync", () => ({
  __esModule: true,
  syncListings: (a: unknown) => mockSyncListings(a),
  getLastSyncTimestamp: () => mockGetLastSyncTimestamp(),
}));

import { runIdxSyncMember } from "@/lib/idx/idx-sync-member";

/** Minimal SyncResult shape the member consumes. */
function syncResult(over: Record<string, unknown> = {}) {
  return {
    total_fetched: 1,
    upserted: 0,
    skipped_gates: 0,
    skipped_validation: 0,
    errors: 0,
    duration_ms: 5,
    ...over,
  };
}

function auditOutcome(): string | undefined {
  const call = mockAuditCreate.mock.calls
    .map((c) => c[0] as { data: { action: string; changes: Record<string, unknown> } })
    .find((c) => c.data.action === "idx_sync_cron");
  return call?.data.changes.outcome as string | undefined;
}

beforeEach(() => {
  process.env.IDX_ENABLED = "true";
  jest.clearAllMocks();
  mockAuditCreate.mockResolvedValue({});
  mockGetLastSyncTimestamp.mockResolvedValue(new Date("2026-07-01T00:00:00Z"));
});

it("run_status partial with errors 0 yields a PARTIAL member, not ok", async () => {
  mockSyncListings.mockResolvedValue(
    syncResult({
      errors: 0,
      run_status: "partial",
      legacy_media_batches: {
        batches_complete: 0, batches_incomplete: 1,
        listings_complete_nonempty: 0, listings_complete_empty: 0,
        listings_incomplete: 3, listings_write_failed: 0,
        incomplete_reasons: { http_error: 1 },
      },
    }),
  );

  const res = await runIdxSyncMember({ forceFull: false, oneCycleRunId: "run-1" });

  expect(res.outcome).toBe("partial");        // holds the downstream media member
  expect(auditOutcome()).toBe("partial");     // durable idx_sync_cron record
});

it("run_status ok yields an OK member", async () => {
  mockSyncListings.mockResolvedValue(syncResult({ errors: 0, run_status: "ok" }));

  const res = await runIdxSyncMember({ forceFull: false, oneCycleRunId: "run-2" });

  expect(res.outcome).toBe("ok");
  expect(auditOutcome()).toBe("success");
});

it("hard errors still yield PARTIAL even when run_status says error", async () => {
  mockSyncListings.mockResolvedValue(syncResult({ errors: 2, run_status: "error" }));

  const res = await runIdxSyncMember({ forceFull: false, oneCycleRunId: "run-3" });

  expect(res.outcome).toBe("partial");
  expect(auditOutcome()).toBe("partial");
});

it("a legacy result with NO run_status falls back to the errors heuristic", async () => {
  // Backward compatibility: nothing in-flight should be reclassified.
  mockSyncListings.mockResolvedValue(syncResult({ errors: 0 }));
  expect((await runIdxSyncMember({ forceFull: false, oneCycleRunId: "run-4" })).outcome).toBe("ok");

  jest.clearAllMocks();
  mockAuditCreate.mockResolvedValue({});
  mockGetLastSyncTimestamp.mockResolvedValue(new Date("2026-07-01T00:00:00Z"));
  mockSyncListings.mockResolvedValue(syncResult({ errors: 1 }));
  expect((await runIdxSyncMember({ forceFull: false, oneCycleRunId: "run-5" })).outcome).toBe("partial");
});
