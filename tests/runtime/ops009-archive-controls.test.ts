/// <reference types="jest" />
/**
 * OPS-009 — two-flag fail-closed archive controls (Maya decision 2026-07-02).
 *
 * SPEC UNDER TEST (registry OPS-009, implementation approved as Track 2):
 *  - `ARCHIVE_ENABLED` — global kill switch. Absent/empty/anything-but-"true" = OFF →
 *    NO archive writes anywhere (nightly T+180 loop AND operator drain). Dry-runs still work.
 *  - `ARCHIVE_BACKLOG_DRAIN_ENABLED` — gates ONLY the operator backlog drain.
 *  - Three states: OFF (nothing archives) · MAINTENANCE (ARCHIVE_ENABLED=true only →
 *    nightly 500-cap T+180 loop only) · DRAIN (both true → operator drain permitted,
 *    LAYERED on the existing gates: --execute, --ack-rollback-branch, --max-rows,
 *    25,000 ceiling, cold-waterfall host guard, in-transaction eligibility re-check).
 *  - MANDATORY CARVE-OUT: ARCHIVE_ENABLED=false must NOT disable the T+24h off-market
 *    display removal (REBNY UCBA Art. I §6 / RLS §2.05 compliance, not archiving).
 *  - T+30d media-null IS gated under ARCHIVE_ENABLED (archive-family destructive write).
 *  - `ARCHIVE_T180_BACKLOG_ENABLED` keeps its clock-swap semantics unchanged
 *    (terminal_since vs status_changed_at) — the NEW flags gate whether writes happen at all.
 */
import fs from "node:fs";
import path from "node:path";
import { makeRequest } from "./helpers";

import {
  archiveWritesEnabled,
  backlogDrainEnabled,
  archiveControlState,
  assertDrainExecuteAllowed,
} from "@/lib/retention/archive-controls";
import { runDrain } from "@/lib/retention/drain-core";

// ── Prisma mock with call capture (pattern of data-retention-archive-eligibility.test.ts) ──
const archiveFindManyWheres: Array<Record<string, unknown>> = [];
const t30FindManyCalls: Array<Record<string, unknown>> = [];
const staleClosedFindManyCalls: Array<Record<string, unknown>> = [];
const listingUpdateManyCalls: Array<Record<string, unknown>> = [];
const auditCreateCalls: Array<Record<string, unknown>> = [];
// One stale-closed (T+24h) row so the carve-out path has something to flip.
const STALE_CLOSED_ROW = {
  id: 1,
  listing_id: "RLS1",
  status: "Closed",
  status_changed_at: new Date("2026-01-01T00:00:00Z"),
};

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    session: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    mfaSession: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    auditEvent: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
      createMany: jest.fn(async () => ({})),
      create: jest.fn(async (a: Record<string, unknown>) => {
        auditCreateCalls.push(a);
        return {};
      }),
    },
    listing: {
      findMany: jest.fn(async (args: { where?: Record<string, unknown>; take?: number }) => {
        // T+24h stale-closed query — identified by the idx_display_yn:true filter.
        if (args?.where && (args.where as Record<string, unknown>).idx_display_yn === true) {
          staleClosedFindManyCalls.push(args);
          return [STALE_CLOSED_ROW];
        }
        // T+30d media-null query — identified by take === 1000 (T30_BATCH_CAP).
        if (args?.take === 1000) {
          t30FindManyCalls.push(args);
          return [];
        }
        // T+180 archive query — identified by take === 500 (T180_BATCH_CAP).
        if (args?.take === 500 && args.where) {
          archiveFindManyWheres.push(args.where);
          return [];
        }
        return [];
      }),
      updateMany: jest.fn(async (a: Record<string, unknown>) => {
        listingUpdateManyCalls.push(a);
        return { count: 1 };
      }),
      update: jest.fn(async () => ({})),
    },
    listingsArchive: { upsert: jest.fn(async () => ({})) },
    syncError: { create: jest.fn(async () => ({})) },
    lead: { updateMany: jest.fn(async () => ({ count: 0 })) },
    notification: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    geocodeCache: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    $transaction: jest.fn(async (arg: unknown) => (Array.isArray(arg) ? [] : null)),
  },
}));

jest.mock("@/lib/search/listing-search-projection", () => ({
  __esModule: true,
  dualWriteProjectionForListingId: jest.fn(async () => undefined),
}));

import { GET } from "@/app/api/cron/data-retention/route";

function runCron() {
  return GET(
    makeRequest({
      method: "GET",
      url: "http://localhost/api/cron/data-retention",
      headers: { authorization: "Bearer test-secret" },
    }),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  archiveFindManyWheres.length = 0;
  t30FindManyCalls.length = 0;
  staleClosedFindManyCalls.length = 0;
  listingUpdateManyCalls.length = 0;
  auditCreateCalls.length = 0;
  process.env.CRON_SECRET = "test-secret";
  delete process.env.ARCHIVE_ENABLED;
  delete process.env.ARCHIVE_BACKLOG_DRAIN_ENABLED;
  delete process.env.ARCHIVE_T180_BACKLOG_ENABLED;
});

afterAll(() => {
  delete process.env.ARCHIVE_ENABLED;
  delete process.env.ARCHIVE_BACKLOG_DRAIN_ENABLED;
  delete process.env.ARCHIVE_T180_BACKLOG_ENABLED;
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Pure helpers — fail-closed flag reads + three-state model
// ─────────────────────────────────────────────────────────────────────────────

describe("archive-controls helpers — fail-closed flag reads", () => {
  const OFF_VALUES: Array<string | undefined> = [undefined, "", "false", "FALSE", "TRUE", "True", "1", "yes", " true", "true ", "on", "garbage"];

  it('archiveWritesEnabled: ONLY the exact string "true" enables', () => {
    expect(archiveWritesEnabled({ ARCHIVE_ENABLED: "true" })).toBe(true);
    for (const v of OFF_VALUES) {
      expect(archiveWritesEnabled({ ARCHIVE_ENABLED: v })).toBe(false);
    }
    expect(archiveWritesEnabled({})).toBe(false);
  });

  it('backlogDrainEnabled: ONLY the exact string "true" enables', () => {
    expect(backlogDrainEnabled({ ARCHIVE_BACKLOG_DRAIN_ENABLED: "true" })).toBe(true);
    for (const v of OFF_VALUES) {
      expect(backlogDrainEnabled({ ARCHIVE_BACKLOG_DRAIN_ENABLED: v })).toBe(false);
    }
    expect(backlogDrainEnabled({})).toBe(false);
  });

  it("archiveControlState: OFF / MAINTENANCE / DRAIN mapping", () => {
    expect(archiveControlState({})).toBe("OFF");
    expect(archiveControlState({ ARCHIVE_ENABLED: "true" })).toBe("MAINTENANCE");
    expect(
      archiveControlState({ ARCHIVE_ENABLED: "true", ARCHIVE_BACKLOG_DRAIN_ENABLED: "true" }),
    ).toBe("DRAIN");
  });

  it("drain flag ALONE is OFF — the global kill switch always wins (fail-closed)", () => {
    expect(archiveControlState({ ARCHIVE_BACKLOG_DRAIN_ENABLED: "true" })).toBe("OFF");
    expect(archiveWritesEnabled({ ARCHIVE_BACKLOG_DRAIN_ENABLED: "true" })).toBe(false);
  });

  it("assertDrainExecuteAllowed: refuses naming BOTH missing flags when neither is set", () => {
    expect(() => assertDrainExecuteAllowed({})).toThrow(
      /missing flag\(s\): ARCHIVE_ENABLED, ARCHIVE_BACKLOG_DRAIN_ENABLED/,
    );
  });

  it("assertDrainExecuteAllowed: refuses naming the ONE missing flag (drain flag off)", () => {
    expect(() => assertDrainExecuteAllowed({ ARCHIVE_ENABLED: "true" })).toThrow(
      /missing flag\(s\): ARCHIVE_BACKLOG_DRAIN_ENABLED\./,
    );
  });

  it("assertDrainExecuteAllowed: refuses naming the ONE missing flag (global kill switch off)", () => {
    expect(() => assertDrainExecuteAllowed({ ARCHIVE_BACKLOG_DRAIN_ENABLED: "true" })).toThrow(
      /missing flag\(s\): ARCHIVE_ENABLED\./,
    );
  });

  it("assertDrainExecuteAllowed: passes only in DRAIN state (both flags exactly 'true')", () => {
    expect(() =>
      assertDrainExecuteAllowed({ ARCHIVE_ENABLED: "true", ARCHIVE_BACKLOG_DRAIN_ENABLED: "true" }),
    ).not.toThrow();
    expect(() =>
      assertDrainExecuteAllowed({ ARCHIVE_ENABLED: "TRUE", ARCHIVE_BACKLOG_DRAIN_ENABLED: "true" }),
    ).toThrow(/ARCHIVE_ENABLED/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Nightly cron route — OFF skips the archive family; T+24h carve-out unconditional
// ─────────────────────────────────────────────────────────────────────────────

describe("data-retention route — OFF state (no flags set)", () => {
  it("skips the T+180 archive loop entirely (no archive findMany, no strip)", async () => {
    const res = await runCron();
    const body = await res.json();
    expect(archiveFindManyWheres).toHaveLength(0);
    expect(body.t180d_listings_archived).toBe(0);
  });

  it("reports the skip in the result JSON (archive_skipped_reason + state)", async () => {
    const res = await runCron();
    const body = await res.json();
    expect(body.archive_skipped_reason).toBe("ARCHIVE_ENABLED off");
    expect(body.archive_control_state).toBe("OFF");
  });

  it("T+30d media-null is GATED under ARCHIVE_ENABLED — does not run when OFF", async () => {
    const res = await runCron();
    const body = await res.json();
    expect(t30FindManyCalls).toHaveLength(0);
    expect(body.t30d_media_nulled).toBe(0);
    // No updateMany call may touch media when OFF.
    for (const c of listingUpdateManyCalls) {
      expect(JSON.stringify((c as { data?: unknown }).data ?? {})).not.toContain("media");
    }
  });

  it("MANDATORY CARVE-OUT: the T+24h off-market display removal STILL runs (UCBA Art. I §6 — not archiving)", async () => {
    const res = await runCron();
    const body = await res.json();
    // The stale-closed query ran and the display flip was written.
    expect(staleClosedFindManyCalls).toHaveLength(1);
    const flip = listingUpdateManyCalls.find(
      (c) => JSON.stringify((c as { data?: unknown }).data) === JSON.stringify({ idx_display_yn: false }),
    );
    expect(flip).toBeDefined();
    expect(body.closed_listings_removed_from_idx).toBe(1);
  });

  it("still writes the cron's data_retention_run audit event (with the skip recorded)", async () => {
    await runCron();
    expect(auditCreateCalls).toHaveLength(1);
    const data = (auditCreateCalls[0] as { data: { action: string; changes: Record<string, unknown> } }).data;
    expect(data.action).toBe("data_retention_run");
    expect(data.changes.archive_skipped_reason).toBe("ARCHIVE_ENABLED off");
  });

  it("drain flag alone does NOT enable the nightly loop (still OFF)", async () => {
    process.env.ARCHIVE_BACKLOG_DRAIN_ENABLED = "true";
    const res = await runCron();
    const body = await res.json();
    expect(archiveFindManyWheres).toHaveLength(0);
    expect(t30FindManyCalls).toHaveLength(0);
    expect(body.archive_control_state).toBe("OFF");
  });

  it("fail-closed on garbage values (ARCHIVE_ENABLED=TRUE / 1 / yes → OFF)", async () => {
    for (const v of ["TRUE", "1", "yes", ""]) {
      archiveFindManyWheres.length = 0;
      process.env.ARCHIVE_ENABLED = v;
      const res = await runCron();
      const body = await res.json();
      expect(archiveFindManyWheres).toHaveLength(0);
      expect(body.archive_control_state).toBe("OFF");
    }
  });
});

describe("data-retention route — MAINTENANCE state (ARCHIVE_ENABLED=true only)", () => {
  beforeEach(() => {
    process.env.ARCHIVE_ENABLED = "true";
  });

  it("runs the nightly T+180 archive loop (500-cap query fires)", async () => {
    const res = await runCron();
    const body = await res.json();
    expect(archiveFindManyWheres).toHaveLength(1);
    expect(body.archive_control_state).toBe("MAINTENANCE");
    expect(body.archive_skipped_reason).toBeUndefined();
  });

  it("runs the T+30d media-null step", async () => {
    await runCron();
    expect(t30FindManyCalls).toHaveLength(1);
  });

  it("ARCHIVE_T180_BACKLOG_ENABLED keeps its clock-swap semantics — OFF = legacy status_changed_at", async () => {
    await runCron();
    const where = archiveFindManyWheres[0];
    expect(where.status_changed_at).toBeDefined();
    expect(where.terminal_since).toBeUndefined();
  });

  it("ARCHIVE_T180_BACKLOG_ENABLED keeps its clock-swap semantics — ON = stable terminal_since", async () => {
    process.env.ARCHIVE_T180_BACKLOG_ENABLED = "true";
    await runCron();
    const where = archiveFindManyWheres[0];
    expect((where.terminal_since as Record<string, unknown>).lt).toBeInstanceOf(Date);
    expect(where.status_changed_at).toBeUndefined();
  });
});

describe("data-retention route — DRAIN state (both flags true)", () => {
  it("the nightly loop behaves exactly as MAINTENANCE (drain flag is drain-only)", async () => {
    process.env.ARCHIVE_ENABLED = "true";
    process.env.ARCHIVE_BACKLOG_DRAIN_ENABLED = "true";
    const res = await runCron();
    const body = await res.json();
    expect(archiveFindManyWheres).toHaveLength(1);
    expect(body.archive_control_state).toBe("DRAIN");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Operator drain — execute requires BOTH flags; dry-run unaffected
// ─────────────────────────────────────────────────────────────────────────────

describe("runDrain — OPS-009 execute gate layered on the existing gates", () => {
  function terminalRow(id: number) {
    return { id, listing_id: `RLS${id}`, mls_id: `RLS${id}`, status: "Closed", sync_status: "synced" };
  }
  function supply() {
    return (lastId: unknown, take: number) =>
      Promise.resolve(Array.from({ length: take }, (_, i) => terminalRow(Number(lastId) + i + 1)));
  }

  it("execute with NO flags: refuses fail-closed naming both flags; zero writes", async () => {
    const archiveRow = jest.fn(async () => ({ ok: true }));
    const recordTouched = jest.fn();
    await expect(
      runDrain({
        selectChunk: supply(), archiveRow, recordTouched,
        execute: true, maxRows: 5, chunkSize: 2, env: {},
      }),
    ).rejects.toThrow(/missing flag\(s\): ARCHIVE_ENABLED, ARCHIVE_BACKLOG_DRAIN_ENABLED/);
    expect(archiveRow).not.toHaveBeenCalled();
    expect(recordTouched).not.toHaveBeenCalled();
  });

  it("execute with ARCHIVE_ENABLED=true only: refuses naming ARCHIVE_BACKLOG_DRAIN_ENABLED", async () => {
    const archiveRow = jest.fn(async () => ({ ok: true }));
    await expect(
      runDrain({
        selectChunk: supply(), archiveRow, recordTouched: jest.fn(),
        execute: true, maxRows: 5, chunkSize: 2, env: { ARCHIVE_ENABLED: "true" },
      }),
    ).rejects.toThrow(/missing flag\(s\): ARCHIVE_BACKLOG_DRAIN_ENABLED/);
    expect(archiveRow).not.toHaveBeenCalled();
  });

  it("execute with drain flag only: refuses naming ARCHIVE_ENABLED (kill switch wins)", async () => {
    const archiveRow = jest.fn(async () => ({ ok: true }));
    await expect(
      runDrain({
        selectChunk: supply(), archiveRow, recordTouched: jest.fn(),
        execute: true, maxRows: 5, chunkSize: 2, env: { ARCHIVE_BACKLOG_DRAIN_ENABLED: "true" },
      }),
    ).rejects.toThrow(/missing flag\(s\): ARCHIVE_ENABLED/);
    expect(archiveRow).not.toHaveBeenCalled();
  });

  it("execute in DRAIN state (both true): proceeds and archives", async () => {
    const archiveRow = jest.fn(async () => ({ ok: true }));
    const recordTouched = jest.fn();
    const res = await runDrain({
      selectChunk: supply(), archiveRow, recordTouched,
      execute: true, maxRows: 3, chunkSize: 2,
      env: { ARCHIVE_ENABLED: "true", ARCHIVE_BACKLOG_DRAIN_ENABLED: "true" },
    });
    expect(res.archived).toBe(3);
    expect(archiveRow).toHaveBeenCalledTimes(3);
  });

  it("dry-run is unaffected — works with NO flags and performs zero writes", async () => {
    const archiveRow = jest.fn(async () => ({ ok: true }));
    const recordTouched = jest.fn();
    const res = await runDrain({
      selectChunk: supply(), archiveRow, recordTouched,
      execute: false, maxRows: 6, chunkSize: 2, env: {},
    });
    expect(res.scanned).toBe(6);
    expect(res.archived).toBe(0);
    expect(archiveRow).not.toHaveBeenCalled();
    expect(recordTouched).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Static wiring + existing gates NOT weakened
// ─────────────────────────────────────────────────────────────────────────────

describe("static wiring — flags are LAYERED, existing gates intact", () => {
  const read = (f: string) => fs.readFileSync(path.resolve(__dirname, "../../", f), "utf8");

  it("operator script wires the OPS-009 gate AND keeps every pre-existing gate", () => {
    const src = read("scripts/drain-archive-backlog.ts");
    expect(src).toMatch(/assertDrainExecuteAllowed/); // new two-flag gate
    expect(src).toMatch(/REFUSING --execute without --ack-rollback-branch/); // unchanged
    expect(src).toMatch(/parseDrainArgs/); // --max-rows mandatory + 25,000 ceiling (unchanged)
    expect(src).toMatch(/assertCanonicalHost\(url\)/); // cold-waterfall host guard (unchanged)
    expect(src).toMatch(/archiveOneListing\(prisma,/); // in-transaction eligibility re-check (unchanged)
  });

  it("route documents the T+24h carve-out and the T+30d gating decision in code comments", () => {
    const src = read("app/api/cron/data-retention/route.ts");
    expect(src).toMatch(/CARVE-OUT/i);
    expect(src).toMatch(/UCBA/);
    // T+24h step must not reference the new flags; the archive family must.
    expect(src).toMatch(/archiveWritesEnabled|archiveControlState/);
  });

  it("clock-selection flag semantics unchanged: the ternary on ARCHIVE_T180_BACKLOG_ENABLED survives", () => {
    const src = read("app/api/cron/data-retention/route.ts");
    expect(src).toMatch(/ARCHIVE_T180_BACKLOG_ENABLED/);
    expect(src).toMatch(/terminal_since:\s*\{\s*lt:\s*oneEightyDayCutoff\s*\}/);
    expect(src).toMatch(/status_changed_at:\s*\{\s*lt:\s*oneEightyDayCutoff\s*\}/);
  });
});
