/// <reference types="jest" />
/**
 * Gate 6 — accelerated archive-drain operator tooling (board #415).
 *
 * Covers the reusable archive core (lib/retention/archive-terminals.ts) and the operator
 * drain orchestration/guards (lib/retention/drain-core.ts) used by scripts/drain-archive-backlog.ts.
 *
 * SAFETY CONTRACT under test (per the Gate 6 plan + approval):
 *  - dry-run performs NO writes; --execute is required for writes; no unlimited mode.
 *  - host-guarded to canonical cold-waterfall; refuses stale royal-dawn.
 *  - bounded by --max-rows (hard MAX_RUN_CEILING) and --chunk-size.
 *  - only eligible terminal, not-yet-archived rows are processed (fail-closed assert).
 *  - strip contract is exactly raw_data=JsonNull, media=[], compliance={}, sync_status='archived'.
 *  - touched-id log records ids only — never the stripped raw payloads.
 *  - the nightly cron route stays capped at 500 (NOT changed by this work).
 */
import fs from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";

import {
  ARCHIVE_TERMINAL_STATUSES,
  ARCHIVE_STRIP_DATA,
  archiveEligibilityWhere,
  buildArchiveSummaryCreate,
  archiveOneListing,
} from "@/lib/retention/archive-terminals";

import {
  MAX_RUN_CEILING,
  MAX_CHUNK_SIZE,
  DEFAULT_CHUNK_SIZE,
  parseDrainArgs,
  assertCanonicalHost,
  assertArchivable,
  formatTouchedLine,
  runDrain,
} from "@/lib/retention/drain-core";

const COLD = "postgresql://u:p@ep-cold-waterfall-adno3ao2.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require";
const POOLER = "postgresql://u:p@ep-cold-waterfall-adno3ao2-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require";
const ROYAL = "postgresql://u:p@ep-royal-dawn-ad6eh8t2.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require";
const OTHER = "postgresql://u:p@ep-some-other-host.neon.tech/neondb?sslmode=require";
const QUERY_INJECT = "postgresql://u:p@evil.example.com/neondb?application_name=ep-cold-waterfall-adno3ao2";
const PW_INJECT = "postgresql://u:ep-cold-waterfall-adno3ao2@evil.example.com/neondb";
const MALFORMED = "not a valid url at all";

function terminalRow(id: number, over = {}): any {
  return {
    id,
    listing_id: `RLS${id}`,
    mls_id: `RLS${id}`,
    status: "Closed",
    sync_status: "synced",
    listing_type: "sale",
    list_price: 100,
    raw_data: { ClosePrice: 500000, CloseDate: "2024-01-01", OriginalListPrice: 525000 },
    address: { StreetNumber: "1", StreetName: "Main St", UnitNumber: "4B" },
    created_at: new Date("2023-01-01"),
    ...over,
  };
}

describe("archiveEligibilityWhere — only eligible terminal rows", () => {
  const now = new Date("2026-06-29T00:00:00Z");

  it("flag-ON clock = stable terminal_since; no OR, no status_changed_at", () => {
    const w = archiveEligibilityWhere({ now, clock: "terminal_since" }) as Record<string, any>;
    expect(w.status).toEqual({ in: ARCHIVE_TERMINAL_STATUSES });
    expect(w.sync_status).toEqual({ not: "archived" });
    expect(w.terminal_since.lt).toBeInstanceOf(Date);
    expect(w.OR).toBeUndefined();
    expect(w.status_changed_at).toBeUndefined();
    // cutoff is now - 180d
    expect((w.terminal_since.lt as Date).getTime()).toBe(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  });

  it("legacy clock = status_changed_at", () => {
    const w = archiveEligibilityWhere({ now, clock: "status_changed_at" }) as Record<string, any>;
    expect(w.status_changed_at.lt).toBeInstanceOf(Date);
    expect(w.terminal_since).toBeUndefined();
  });
});

describe("strip contract", () => {
  it("ARCHIVE_STRIP_DATA matches the exact archive strip", () => {
    expect(ARCHIVE_STRIP_DATA.sync_status).toBe("archived");
    expect(ARCHIVE_STRIP_DATA.raw_data).toBe(Prisma.JsonNull);
    expect(ARCHIVE_STRIP_DATA.media).toEqual([]);
    expect(ARCHIVE_STRIP_DATA.compliance).toEqual({});
  });
});

describe("buildArchiveSummaryCreate — typed-first summary, key = mls_id||listing_id", () => {
  it("maps close price/date, assembles address_line, prefers typed agent name", () => {
    const row = terminalRow(7, {
      mls_id: "MLS7",
      list_agent_full_name: "Jane Broker",
      list_office_name: "Mallan Real Estate Inc.",
    });
    const c = buildArchiveSummaryCreate(row) as Record<string, any>;
    expect(c.listing_key).toBe("MLS7"); // mls_id wins
    expect(Number(c.close_price)).toBe(500000);
    expect(c.address_line).toBe("1 Main St, Apt 4B");
    expect(c.list_agent_full_name).toBe("Jane Broker");
    expect(c.original_created_at).toEqual(new Date("2023-01-01"));
  });

  it("falls back to listing_id for listing_key when mls_id is null", () => {
    const c = buildArchiveSummaryCreate(terminalRow(8, { mls_id: null })) as Record<string, any>;
    expect(c.listing_key).toBe("RLS8");
  });
});

describe("archiveOneListing — guarded strip re-checks eligibility inside the write tx", () => {
  const guard = archiveEligibilityWhere({ now: new Date("2026-06-29T00:00:00Z"), clock: "terminal_since" });

  function fakePrisma(updateCount = 1) {
    const calls: any = { updateMany: [], upsert: [], syncError: [], tx: 0 };
    const tx: any = {
      listing: { updateMany: (a: any) => { calls.updateMany.push(a); return Promise.resolve({ count: updateCount }); } },
      listingsArchive: { upsert: (a: any) => { calls.upsert.push(a); return Promise.resolve({}); } },
    };
    const prisma: any = {
      $transaction: (fn: any) => { calls.tx++; return fn(tx); },
      syncError: { create: (a: any) => { calls.syncError.push(a); return Promise.resolve({}); } },
    };
    return { prisma, calls };
  }

  it("eligible row: guarded updateMany strips by the FULL predicate (+id), then upserts the summary", async () => {
    const { prisma, calls } = fakePrisma(1);
    const res = await archiveOneListing(prisma, terminalRow(1) as any, guard);
    expect(res.ok).toBe(true);
    expect(res.skipped).toBeFalsy();
    const w = calls.updateMany[0].where;
    expect(w.id).toBe(1);
    expect(w.status).toEqual({ in: ARCHIVE_TERMINAL_STATUSES }); // not by id alone
    expect(w.sync_status).toEqual({ not: "archived" });
    expect(w.terminal_since.lt).toBeInstanceOf(Date);
    expect(calls.updateMany[0].data).toBe(ARCHIVE_STRIP_DATA);
    expect(calls.upsert[0].where).toEqual({ listing_key: "RLS1" });
    expect(calls.syncError).toHaveLength(0);
  });

  it("eligibility drift (0 rows updated → reactivated/already-archived/aged-out): SKIPS, writes NO summary, no error", async () => {
    const { prisma, calls } = fakePrisma(0);
    const res = await archiveOneListing(prisma, terminalRow(1) as any, guard);
    expect(res.ok).toBe(false);
    expect(res.skipped).toBe(true);
    expect(calls.upsert).toHaveLength(0); // a row that wasn't stripped must NOT get a summary
    expect(calls.syncError).toHaveLength(0);
  });

  it("transaction failure: records a listings_archive_move sync_error, returns ok:false (NOT skipped)", async () => {
    const { prisma, calls } = fakePrisma();
    prisma.$transaction = () => Promise.reject(new Error("boom"));
    const res = await archiveOneListing(prisma, terminalRow(2) as any, guard);
    expect(res.ok).toBe(false);
    expect(res.skipped).toBeFalsy();
    expect(calls.syncError[0].data.resource).toBe("listings_archive_move");
    expect(calls.syncError[0].data.listing_id).toBe("RLS2");
  });
});

describe("parseDrainArgs — bounded, no unlimited mode", () => {
  it("dry-run by default; --execute opt-in", () => {
    expect(parseDrainArgs(["--max-rows=5000"]).execute).toBe(false);
    expect(parseDrainArgs(["--execute", "--max-rows=5000"]).execute).toBe(true);
  });

  it("defaults chunk-size and parses max-rows", () => {
    const a = parseDrainArgs(["--max-rows=5000"]);
    expect(a.maxRows).toBe(5000);
    expect(a.chunkSize).toBe(DEFAULT_CHUNK_SIZE);
  });

  it("requires --max-rows (no unlimited mode)", () => {
    expect(() => parseDrainArgs(["--execute"])).toThrow(/max-rows/i);
  });

  it("enforces the hard safety ceiling", () => {
    expect(() => parseDrainArgs([`--max-rows=${MAX_RUN_CEILING + 1}`])).toThrow(/ceiling/i);
    expect(parseDrainArgs([`--max-rows=${MAX_RUN_CEILING}`]).maxRows).toBe(MAX_RUN_CEILING);
  });

  it("rejects non-positive max-rows and oversized chunk-size", () => {
    expect(() => parseDrainArgs(["--max-rows=0"])).toThrow();
    expect(() => parseDrainArgs([`--max-rows=5000`, `--chunk-size=${MAX_CHUNK_SIZE + 1}`])).toThrow(/chunk/i);
  });
});

describe("assertCanonicalHost — parses + validates the hostname (not substring)", () => {
  it("accepts canonical cold-waterfall direct host", () => {
    expect(() => assertCanonicalHost(COLD)).not.toThrow();
  });
  it("accepts the canonical pooler host variant", () => {
    expect(() => assertCanonicalHost(POOLER)).not.toThrow();
  });
  it("refuses stale royal-dawn", () => {
    expect(() => assertCanonicalHost(ROYAL)).toThrow(/royal-dawn|stale/i);
  });
  it("refuses any non-canonical host", () => {
    expect(() => assertCanonicalHost(OTHER)).toThrow();
  });
  it("refuses a non-canonical host that only has the canonical string in a query param", () => {
    expect(() => assertCanonicalHost(QUERY_INJECT)).toThrow(/not the canonical/i);
  });
  it("refuses a non-canonical host that only has the canonical string in the password", () => {
    expect(() => assertCanonicalHost(PW_INJECT)).toThrow(/not the canonical/i);
  });
  it("fails closed on a malformed DATABASE_URL", () => {
    expect(() => assertCanonicalHost(MALFORMED)).toThrow(/malformed|unparseable|host/i);
  });
});

describe("assertArchivable — fail-closed on non-eligible rows (stop on safety mismatch)", () => {
  it("passes a terminal, not-archived row", () => {
    expect(() => assertArchivable(terminalRow(1) as any)).not.toThrow();
  });
  it("throws on a non-terminal/live row", () => {
    expect(() => assertArchivable(terminalRow(1, { status: "Active" }) as any)).toThrow(/mismatch|terminal/i);
  });
  it("throws on an already-archived row", () => {
    expect(() => assertArchivable(terminalRow(1, { sync_status: "archived" }) as any)).toThrow(/mismatch|archived/i);
  });
});

describe("formatTouchedLine — ids only, never the stripped payloads", () => {
  it("records id/listing_key/status/run and excludes raw_data/media/compliance", () => {
    const line = formatTouchedLine({ id: 42, listing_key: "RLS42", status: "Closed", run: "RUN1" });
    const obj = JSON.parse(line);
    expect(obj.id).toBe(42);
    expect(obj.listing_key).toBe("RLS42");
    expect(obj.status).toBe("Closed");
    expect(obj.archived_run).toBe("RUN1");
    expect(line).not.toMatch(/raw_data|media|compliance/);
  });
});

describe("runDrain — bounded, dry-run safe, execute writes", () => {
  // An infinite supply of eligible terminal rows, keyset by id.
  function supply() {
    return (lastId: any, take: number) =>
      Promise.resolve(Array.from({ length: take }, (_, i) => terminalRow(Number(lastId) + i + 1)));
  }

  it("dry-run performs NO writes (no archiveRow, no touched-id log)", async () => {
    const archiveRow = jest.fn(async () => ({ ok: true }));
    const recordTouched = jest.fn();
    const res = await runDrain({
      selectChunk: supply(), archiveRow, recordTouched,
      execute: false, maxRows: 6, chunkSize: 2,
    });
    expect(archiveRow).not.toHaveBeenCalled();
    expect(recordTouched).not.toHaveBeenCalled();
    expect(res.scanned).toBe(6);
    expect(res.archived).toBe(0);
  });

  it("--execute archives each row once and logs each touched id", async () => {
    const archiveRow = jest.fn(async () => ({ ok: true }));
    const recordTouched = jest.fn();
    const res = await runDrain({
      selectChunk: supply(), archiveRow, recordTouched,
      execute: true, maxRows: 5, chunkSize: 2,
    });
    expect(archiveRow).toHaveBeenCalledTimes(5);
    expect(recordTouched).toHaveBeenCalledTimes(5);
    expect(res.archived).toBe(5);
  });

  it("respects --max-rows even when more rows are eligible", async () => {
    const archiveRow = jest.fn(async () => ({ ok: true }));
    const res = await runDrain({
      selectChunk: supply(), archiveRow, recordTouched: jest.fn(),
      execute: true, maxRows: 3, chunkSize: 10,
    });
    expect(res.scanned).toBe(3);
    expect(archiveRow).toHaveBeenCalledTimes(3);
  });

  it("respects --chunk-size (never requests more than chunkSize per page)", async () => {
    const takes: number[] = [];
    const selectChunk = (lastId: any, take: number) => {
      takes.push(take);
      return Promise.resolve(Array.from({ length: take }, (_, i) => terminalRow(Number(lastId) + i + 1)));
    };
    await runDrain({ selectChunk, archiveRow: jest.fn(async () => ({ ok: true })), recordTouched: jest.fn(), execute: true, maxRows: 5, chunkSize: 2 });
    expect(Math.max(...takes)).toBeLessThanOrEqual(2);
    expect(takes.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(5);
  });

  it("stops on a safety mismatch (non-terminal row surfaced by the query)", async () => {
    const selectChunk = () => Promise.resolve([terminalRow(1, { status: "Active" })]);
    await expect(
      runDrain({ selectChunk, archiveRow: jest.fn(async () => ({ ok: true })), recordTouched: jest.fn(), execute: true, maxRows: 5, chunkSize: 2 }),
    ).rejects.toThrow(/mismatch|terminal/i);
  });

  it("counts errors when a row fails to archive (intent still logged pre-commit)", async () => {
    const archiveRow = jest.fn(async () => ({ ok: false }));
    const recordTouched = jest.fn();
    const res = await runDrain({
      selectChunk: () => Promise.resolve([terminalRow(1), terminalRow(2)]),
      archiveRow, recordTouched, execute: true, maxRows: 2, chunkSize: 5,
    });
    expect(res.errors).toBe(2);
    expect(res.archived).toBe(0);
    expect(recordTouched).toHaveBeenCalledTimes(2); // intent is written BEFORE the strip attempt
  });

  it("writes the intent log BEFORE the strip — a failing intent write aborts before archiveRow", async () => {
    const archiveRow = jest.fn(async () => ({ ok: true }));
    const recordTouched = jest.fn(() => { throw new Error("disk full"); });
    await expect(
      runDrain({ selectChunk: () => Promise.resolve([terminalRow(1)]), archiveRow, recordTouched, execute: true, maxRows: 1, chunkSize: 1 }),
    ).rejects.toThrow(/disk full/);
    expect(archiveRow).not.toHaveBeenCalled(); // the strip never ran → no unlogged stripped row
  });

  it("a skipped row (eligibility drift) is not archived and not an error; intent still logged", async () => {
    const archiveRow = jest.fn(async () => ({ ok: false, skipped: true }));
    const recordTouched = jest.fn();
    const res = await runDrain({
      selectChunk: () => Promise.resolve([terminalRow(1), terminalRow(2)]),
      archiveRow, recordTouched, execute: true, maxRows: 2, chunkSize: 5,
    });
    expect(res.skipped).toBe(2);
    expect(res.archived).toBe(0);
    expect(res.errors).toBe(0);
    expect(recordTouched).toHaveBeenCalledTimes(2); // pre-commit intent over-reports on skip (acceptable)
  });

  it("stops when eligibility-drift skips exceed the safety threshold", async () => {
    const archiveRow = jest.fn(async () => ({ ok: false, skipped: true }));
    await expect(
      runDrain({
        selectChunk: (lastId: any, take: number) =>
          Promise.resolve(Array.from({ length: take }, (_, i) => terminalRow(Number(lastId) + i + 1))),
        archiveRow, recordTouched: jest.fn(), execute: true, maxRows: 10, chunkSize: 2, skipThreshold: 1,
      }),
    ).rejects.toThrow(/SAFETY STOP|threshold/i);
  });
});

describe("cron route stays capped at 500 (NOT changed by Gate 6)", () => {
  it("data-retention route still defines T180_BATCH_CAP = 500 and uses it as take", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../app/api/cron/data-retention/route.ts"),
      "utf8",
    );
    expect(src).toMatch(/const\s+T180_BATCH_CAP\s*=\s*500/);
    expect(src).toMatch(/take:\s*T180_BATCH_CAP/);
  });

  it("the cron route uses the shared archive core (so cron + operator drain cannot drift)", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../app/api/cron/data-retention/route.ts"),
      "utf8",
    );
    expect(src).toMatch(/from "@\/lib\/retention\/archive-terminals"/);
    // passes the archive `where` as the in-transaction eligibility guard (3rd arg)
    expect(src).toMatch(/archiveOneListing\(prisma,\s*l,\s*archiveWhere\)/);
  });
});

describe("operator script wires the safety primitives (scripts/drain-archive-backlog.ts)", () => {
  const src = fs.readFileSync(path.resolve(__dirname, "../../scripts/drain-archive-backlog.ts"), "utf8");

  it("dry-run by default; --execute gated; --ack-rollback-branch required for writes", () => {
    expect(src).toMatch(/parseDrainArgs/);
    expect(src).toMatch(/--ack-rollback-branch/);
    expect(src).toMatch(/REFUSING --execute without --ack-rollback-branch/);
  });

  it("host-guards to canonical cold-waterfall before anything else", () => {
    expect(src).toMatch(/assertCanonicalHost\(url\)/);
  });

  it("reuses the shared archive core on the stable terminal_since clock (no drift)", () => {
    expect(src).toMatch(/from "\.\.\/lib\/retention\/archive-terminals"/);
    expect(src).toMatch(/archiveOneListing\(prisma,/);
    expect(src).toMatch(/clock:\s*"terminal_since"/);
  });

  it("neither the script nor the shared core READS the Vercel cron flag from the environment", () => {
    // (Doc/comment mentions of the flag name are fine; the safety property is no runtime env read.)
    for (const f of [
      "scripts/drain-archive-backlog.ts",
      "lib/retention/drain-core.ts",
      "lib/retention/archive-terminals.ts",
    ]) {
      const s = fs.readFileSync(path.resolve(__dirname, "../../", f), "utf8");
      expect(s).not.toMatch(/process\.env\.ARCHIVE_T180_BACKLOG_ENABLED/);
    }
  });

  it("touched-id log is durable (fsync) and records ids only (formatTouchedLine)", () => {
    expect(src).toMatch(/fsyncSync/);
    expect(src).toMatch(/formatTouchedLine/);
  });
});
