/// <reference types="jest" />
/**
 * ONE MACHINE — unified 10-minute cadence contract (permanent).
 *
 * Maya directive (2026-07-24): the whole feed/media machine runs on ONE
 * 10-minute timeline. This file is the source-of-truth contract for that
 * cadence and the orchestrator's concurrency protection. It proves, per the
 * nine required points:
 *
 *   1. Exactly one scheduled one-cycle entry every 10 minutes.
 *   2. No independently scheduled idx-sync or media-sync entry remains.
 *   3. SYNC_CADENCE_SECONDS === 600.
 *   4. The listing-detail route contains the statically-analyzable literal
 *      `export const revalidate = 600`.
 *   5. The orchestrator interval === 600000 ms.
 *   6. No 1800-second / 30-minute cadence remains on the listing/cache/sync
 *      surfaces.
 *   7. There is NO HTTP header/query/bearer exemption: the public idx-sync and
 *      media-sync GET routes never read x-one-cycle-member / x-one-cycle-run-id
 *      and ALWAYS take claimMachine(); the orchestrator reaches the unclaimed
 *      member path only by importing the internal member functions in-process.
 *   8. A second overlapping one-cycle invocation exits safely without starting
 *      either member.
 *   9. A normal cycle executes idx-sync then media-sync exactly once.
 *
 * NOTE on ISR: `revalidate = 600` is the TIME-BASED staleness fallback, not a
 * proactive re-render — real data changes expire pages sooner via sync-driven
 * revalidateTag. This contract deliberately does not assert "every page
 * re-renders every 10 minutes" because that is not what ISR does.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { NextRequest } from "next/server";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// ── member WORK functions mocked (behavioral points 8, 9 drive the orchestrator)
// The orchestrator imports and calls these in-process; they return a
// MemberRunResult ({ status, outcome, body }), NOT a NextResponse. `outcome` is
// the explicit semantic result the machine derives truth from.
type MemberArgs = { oneCycleRunId: string; forceFull?: boolean };
type MemberOut = { status: number; outcome: "ok" | "partial" | "skipped" | "error"; body: Record<string, unknown> };
const idxMember = jest.fn<Promise<MemberOut>, [MemberArgs]>(
  async () => ({ status: 200, outcome: "ok", body: { success: true, listings_processed: 1 } }),
);
const mediaMember = jest.fn<Promise<MemberOut>, [MemberArgs]>(
  async () => ({ status: 200, outcome: "ok", body: { success: true, r2_mirrored: 0 } }),
);
jest.mock("@/lib/idx/idx-sync-member", () => ({ runIdxSyncMember: (a: MemberArgs) => idxMember(a) }));
jest.mock("@/lib/idx/media-sync-member", () => ({ runMediaSyncMember: (a: MemberArgs) => mediaMember(a) }));

const auditCreate = jest.fn(async (_a?: unknown) => ({}));
// claimMachine transaction stand-in — lockGranted / startedMarker / completedAfter
// are flipped per-test to drive the overlap guard.
const claimState = {
  lockGranted: true,
  startedMarker: null as unknown,
  completedAfter: null as unknown,
};
const transactionMock = jest.fn(async (fn: (tx: unknown) => unknown) =>
  fn({
    $queryRaw: async () => [{ locked: claimState.lockGranted }],
    auditEvent: {
      findFirst: async (args: { where?: { action?: string } }) =>
        args?.where?.action === "one_cycle_started"
          ? claimState.startedMarker
          : claimState.completedAfter,
      create: (a: unknown) => auditCreate(a),
    },
  }),
);
jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    $transaction: (fn: unknown) => transactionMock(fn as (tx: unknown) => unknown),
    auditEvent: { create: (a: unknown) => auditCreate(a), findFirst: async (_a?: unknown) => null },
  },
}));
jest.mock("@/lib/idx/media-sync", () => ({
  getMediaSyncCursor: async () => ({ last_photos_change: new Date() }),
}));

process.env.CRON_SECRET = "unit-secret";
const AUTH = "Bearer unit-secret";
const oneCycle = require("@/app/api/cron/one-cycle/route");
const GET = oneCycle.GET as (r: NextRequest) => Promise<Response>;

const makeReq = (auth?: string) =>
  new NextRequest("https://mallan.nyc/api/cron/one-cycle", {
    headers: auth ? { authorization: auth } : {},
  });

beforeEach(() => {
  idxMember.mockClear();
  mediaMember.mockClear();
  auditCreate.mockClear();
  transactionMock.mockClear();
  claimState.lockGranted = true;
  claimState.startedMarker = null;
  claimState.completedAfter = null;
});

// ─── Points 1–2: schedule (vercel.json) ──────────────────────────────────────
describe("1–2. schedule: exactly one one-cycle at */10, no independent sync crons", () => {
  const crons = (JSON.parse(read("vercel.json")).crons ?? []) as Array<{
    path: string;
    schedule: string;
  }>;

  it("1. exactly one scheduled /api/cron/one-cycle at */10 * * * *", () => {
    const oneCycleEntries = crons.filter((c) => c.path === "/api/cron/one-cycle");
    expect(oneCycleEntries).toHaveLength(1);
    expect(oneCycleEntries[0].schedule).toBe("*/10 * * * *");
  });

  it("2. no independently scheduled idx-sync or media-sync cron entry", () => {
    expect(crons.find((c) => c.path === "/api/cron/idx-sync")).toBeUndefined();
    expect(crons.find((c) => c.path === "/api/cron/media-sync")).toBeUndefined();
  });
});

// ─── Points 3–5: cadence constants ───────────────────────────────────────────
describe("3–5. cadence constants are all 600s / 600000ms", () => {
  it("3. SYNC_CADENCE_SECONDS === 600", () => {
    const { SYNC_CADENCE_SECONDS } = require("@/lib/cache/public-cache");
    expect(SYNC_CADENCE_SECONDS).toBe(600);
  });

  it("4. listing-detail route has the static literal `export const revalidate = 600`", () => {
    const src = read("app/listing/[...slug]/page.tsx");
    expect(src).toMatch(/export const revalidate = 600;/);
  });

  it("5. orchestrator CYCLE_INTERVAL_MS === 600000", () => {
    expect(oneCycle.CYCLE_INTERVAL_MS).toBe(600_000);
  });
});

// ─── Point 6: no stale 30-minute / 1800s cadence on the machine surfaces ──────
describe("6. no 1800s / 30-min cadence remains on listing/cache/sync surfaces", () => {
  const SURFACES = [
    "app/listing/[...slug]/page.tsx",
    "lib/cache/public-cache.ts",
    "app/api/cron/one-cycle/route.ts",
    "app/api/cron/idx-sync/route.ts",
    "app/api/cron/media-sync/route.ts",
  ];
  it.each(SURFACES)("%s contains no 1800, `30 * 60`, or */30 cadence", (rel) => {
    const src = read(rel);
    expect(src).not.toMatch(/\b1800\b/);
    expect(src).not.toMatch(/30\s*\*\s*60/);
    expect(src).not.toMatch(/\*\/30 \* \* \* \*/);
  });

  it("vercel.json has no */30 or hourly sync-cron cadence line", () => {
    const raw = read("vercel.json");
    expect(raw).not.toMatch(/"\/api\/cron\/idx-sync"/);
    expect(raw).not.toMatch(/"\/api\/cron\/media-sync"/);
  });
});

// ─── Point 7: NO HTTP exemption — routes always claim; members are import-only ─
describe("7. no forgeable HTTP exemption to the concurrency guard", () => {
  it.each([
    "app/api/cron/idx-sync/route.ts",
    "app/api/cron/media-sync/route.ts",
  ])("%s: never reads a one-cycle header and ALWAYS calls claimMachine after auth", (rel) => {
    const src = read(rel);
    // The forgeable exemption is GONE — these headers are not read at all.
    expect(src).not.toMatch(/x-one-cycle-member/);
    expect(src).not.toMatch(/x-one-cycle-run-id/);
    // Every request takes the shared atomic claim.
    expect(src).toMatch(/claimMachine\(/);
    // Auth (401) is evaluated BEFORE the claim, and there is no code path that
    // skips the claim for an authenticated caller.
    expect(src.indexOf("Unauthorized")).toBeGreaterThan(-1);
    expect(src.indexOf("Unauthorized")).toBeLessThan(src.indexOf("claimMachine("));
  });

  it("the orchestrator reaches the unclaimed path ONLY by importing the member functions in-process", () => {
    const src = read("app/api/cron/one-cycle/route.ts");
    // Imports and calls the internal work functions directly — no HTTP fan-out.
    expect(src).toMatch(/import \{ runIdxSyncMember \} from '@\/lib\/idx\/idx-sync-member'/);
    expect(src).toMatch(/import \{ runMediaSyncMember \} from '@\/lib\/idx\/media-sync-member'/);
    expect(src).toMatch(/runMember\(name, fn, runId, budget\)/);
    // No bypass token / header is forwarded to members (there is no HTTP boundary).
    expect(src).not.toMatch(/x-one-cycle-member/);
    // It does NOT lazy-require the public route GET handlers any more.
    expect(src).not.toMatch(/require\('@\/app\/api\/cron\/idx-sync\/route'\)/);
    expect(src).not.toMatch(/require\('@\/app\/api\/cron\/media-sync\/route'\)/);
  });
});

// ─── Point 8: a second overlapping cycle exits without starting members ───────
describe("8. a second overlapping one-cycle invocation exits without starting members", () => {
  it("advisory-lock contended → skipped, neither member runs", async () => {
    claimState.lockGranted = false; // another cycle holds the claim
    const res = await GET(makeReq(AUTH));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.skipped).toBe(true);
    expect(body.reason).toBe("lock_contended");
    expect(idxMember).not.toHaveBeenCalled();
    expect(mediaMember).not.toHaveBeenCalled();
  });

  it("an in-progress started-marker with no completion → overlap skip, neither member runs", async () => {
    claimState.lockGranted = true;
    claimState.startedMarker = { created_at: new Date() };
    claimState.completedAfter = null; // no completion after the start
    const res = await GET(makeReq(AUTH));
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(body.reason).toBe("overlap_in_progress");
    expect(idxMember).not.toHaveBeenCalled();
    expect(mediaMember).not.toHaveBeenCalled();
  });
});

// ─── Point 9: a normal cycle runs idx-sync then media-sync exactly once ───────
describe("9. a normal cycle executes idx-sync then media-sync exactly once", () => {
  it("both members run once, in authority-hierarchy order, after a granted claim", async () => {
    const res = await GET(makeReq(AUTH));
    expect(res.status).toBe(200);
    expect(idxMember).toHaveBeenCalledTimes(1);
    expect(mediaMember).toHaveBeenCalledTimes(1);
    expect(idxMember.mock.invocationCallOrder[0]).toBeLessThan(
      mediaMember.mock.invocationCallOrder[0],
    );
    // The claim wrote a one_cycle_started marker inside the transaction.
    expect(
      auditCreate.mock.calls.some(
        (c) => (c[0] as { data?: { action?: string } })?.data?.action === "one_cycle_started",
      ),
    ).toBe(true);
  });
});
