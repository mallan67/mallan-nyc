/// <reference types="jest" />
/**
 * Archive eligibility fix (scope-archive-eligibility-bug-2026-06-15).
 *
 * Defect: the T+180 archive query filtered `status_changed_at < cutoff`, and a
 * NULL `status_changed_at` silently fails `{ lt }` (NULL < ts is NULL), so
 * bulk-synced terminal rows are invisible to the archive forever (34 of ~91,536).
 *
 * Fix: behind a DEFAULT-OFF flag `ARCHIVE_T180_BACKLOG_ENABLED`, broaden the
 * predicate to COALESCE(status_changed_at, modification_timestamp) < cutoff
 * (Prisma OR form). modification_timestamp — NOT updated_at — because updated_at
 * is bumped by unrelated rewrites and would keep the backlog perpetually recent.
 *
 * RED on main: main has no flag/OR, so the flag-ON assertion (OR present, with a
 * modification_timestamp branch) fails. GREEN after the fix.
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

  it("flag ON: broadens to COALESCE(status_changed_at, modification_timestamp) via an OR — NULL-dated old rows SELECTED", async () => {
    process.env.ARCHIVE_T180_BACKLOG_ENABLED = "true";
    await runCron();
    const where = archiveWhere();
    const or = where.OR as Array<Record<string, unknown>>;
    expect(Array.isArray(or)).toBe(true);
    expect(or).toHaveLength(2);
    // Branch 1: non-null old status_changed_at.
    expect(or[0].status_changed_at).toEqual({ lt: expect.any(Date) });
    // Branch 2: NULL status_changed_at AND old modification_timestamp (the fix).
    const nullBranch = or.find((b) => b.status_changed_at === null);
    expect(nullBranch).toBeDefined();
    expect((nullBranch!.modification_timestamp as Record<string, unknown>).lt).toBeInstanceOf(Date);
  });

  it("anti-updated_at: the archive predicate NEVER references updated_at (flag ON)", async () => {
    process.env.ARCHIVE_T180_BACKLOG_ENABLED = "true";
    await runCron();
    const where = archiveWhere();
    // updated_at is bumped by unrelated rewrites; ageing off it would stick the
    // backlog forever. It must not appear anywhere in the predicate.
    expect(JSON.stringify(where)).not.toContain("updated_at");
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
