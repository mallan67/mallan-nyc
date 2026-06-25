/// <reference types="jest" />
/**
 * Archive eligibility fix (scope-archive-eligibility-bug-2026-06-15).
 *
 * Defect: the T+180 archive query filtered `status_changed_at < cutoff`, and a
 * NULL `status_changed_at` silently fails `{ lt }` (NULL < ts is NULL), so
 * bulk-synced terminal rows are invisible to the archive forever (34 of ~91,536).
 *
 * History: PR #405 broadened the flag-ON predicate to COALESCE(status_changed_at,
 * modification_timestamp) < cutoff. Archive Clock PR-2 (#415) SUPERSEDES that — both clocks are
 * re-stamped by idx-sync, so the flag-ON predicate now ages off the STABLE `terminal_since` clock
 * (set once on transition, never re-stamped). Flag-OFF stays the legacy status_changed_at predicate
 * so merging drains nothing. NULL terminal_since can never match `{ lt }` (fail-safe — no invented dates).
 */

import { makeRequest } from "./helpers";

// Captured `where` clauses from the T+180 archive `prisma.listing.findMany`
// (identified by take === 500 = T180_BATCH_CAP). Referenced only inside the
// jest.fn closure, so it is not an out-of-scope factory reference.
const archiveWheres: Array<Record<string, unknown>> = [];

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    session: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    mfaSession: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    auditEvent: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
      createMany: jest.fn(async () => ({})),
      create: jest.fn(async () => ({})),
    },
    listing: {
      // Two findMany calls fire (stale-closed + archive); the archive one is the
      // only one with take === T180_BATCH_CAP (500).
      findMany: jest.fn(async (args: { where?: Record<string, unknown>; take?: number }) => {
        if (args?.take === 500 && args.where) archiveWheres.push(args.where);
        return [];
      }),
      updateMany: jest.fn(async () => ({ count: 0 })),
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

function archiveWhere(): Record<string, unknown> {
  expect(archiveWheres).toHaveLength(1);
  return archiveWheres[0];
}

beforeEach(() => {
  jest.clearAllMocks(); // reset mock.calls history (implementations preserved)
  archiveWheres.length = 0;
  process.env.CRON_SECRET = "test-secret";
  delete process.env.ARCHIVE_T180_BACKLOG_ENABLED;
});

describe("data-retention T+180 archive eligibility", () => {
  it("flag OFF (default): keeps the narrow predicate — NULL-dated rows stay EXCLUDED (no OR)", async () => {
    await runCron();
    const where = archiveWhere();
    // Narrow predicate: status_changed_at filter present, no OR/backlog branch.
    expect(where.OR).toBeUndefined();
    expect(where.status_changed_at).toBeDefined();
    expect((where.status_changed_at as Record<string, unknown>).lt).toBeInstanceOf(Date);
  });

  it("flag ON (PR-2): ages off the stable terminal_since clock — single { terminal_since: { lt } }, no OR", async () => {
    process.env.ARCHIVE_T180_BACKLOG_ENABLED = "true";
    await runCron();
    const where = archiveWhere();
    // Stable clock: a single terminal_since < cutoff date branch (no OR, no coalesce).
    expect(where.OR).toBeUndefined();
    expect((where.terminal_since as Record<string, unknown>).lt).toBeInstanceOf(Date);
    // contaminated clocks are gone from the eligibility branch
    expect(where.status_changed_at).toBeUndefined();
    expect(where.modification_timestamp).toBeUndefined();
    // terminal-status + archived filters preserved
    expect(where.status).toBeDefined();
    expect(where.sync_status).toEqual({ not: "archived" });
  });

  it("fail-safe: flag ON predicate is `terminal_since < cutoff` only, so NULL-clock rows can never match (no invented dates)", async () => {
    // NULL terminal_since fails `{ lt }` in Postgres (NULL < ts → NULL), so rows whose clock has
    // not been backfilled are excluded by construction. Proven structurally: the date branch is
    // exactly terminal_since with NO OR / coalesce fallback that could re-include NULLs.
    process.env.ARCHIVE_T180_BACKLOG_ENABLED = "true";
    await runCron();
    const where = archiveWhere();
    expect(Object.keys(where)).toEqual(expect.arrayContaining(["status", "sync_status", "terminal_since"]));
    expect(where.OR).toBeUndefined();
  });

  it("anti-updated_at / anti-modification_timestamp: the archive predicate references neither (flag ON)", async () => {
    process.env.ARCHIVE_T180_BACKLOG_ENABLED = "true";
    await runCron();
    const where = archiveWhere();
    // both are re-stamped/unrelated clocks; ageing off them would stick or mis-age the backlog.
    expect(JSON.stringify(where)).not.toContain("updated_at");
    expect(JSON.stringify(where)).not.toContain("modification_timestamp");
  });

  it("preserves the 500/run batch cap in BOTH flag states", async () => {
    const prisma = (await import("@/lib/prisma")).default as unknown as {
      listing: { findMany: jest.Mock };
    };
    await runCron(); // flag OFF
    process.env.ARCHIVE_T180_BACKLOG_ENABLED = "true";
    await runCron(); // flag ON
    const archiveCalls = prisma.listing.findMany.mock.calls
      .map((c) => c[0] as { take?: number })
      .filter((a) => a?.take === 500);
    expect(archiveCalls.length).toBe(2); // one per run
    archiveCalls.forEach((a) => expect(a.take).toBe(500));
  });
});
