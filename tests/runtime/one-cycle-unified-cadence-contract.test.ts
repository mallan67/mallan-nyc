/// <reference types="jest" />
/**
 * ONE MACHINE — coordinated cadence and concurrency contract.
 *
 * Emergency containment (2026-07-26): while the permanent Neon write-
 * suppression repair is completed, the scheduler fires hourly instead of every
 * 10 minutes. Cache/ISR fallback constants remain 600 seconds so genuine source
 * changes can still be reflected sooner through tag invalidation and revalidation.
 *
 * This file proves:
 *   1. Exactly one scheduled one-cycle entry, currently hourly.
 *   2. No independently scheduled idx-sync or media-sync entry remains.
 *   3. SYNC_CADENCE_SECONDS === 600.
 *   4. The listing-detail route contains `export const revalidate = 600`.
 *   5. The orchestrator interval safety constant remains 600000 ms.
 *   6. No 1800-second / 30-minute cadence remains on listing/cache/sync surfaces.
 *   7. There is NO HTTP header/query/bearer exemption.
 *   8. A second overlapping one-cycle invocation exits safely.
 *   9. A normal cycle executes idx-sync then media-sync exactly once.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { NextRequest } from "next/server";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

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

describe("1–2. schedule: one coordinated hourly cycle, no independent sync crons", () => {
  const crons = (JSON.parse(read("vercel.json")).crons ?? []) as Array<{
    path: string;
    schedule: string;
  }>;

  it("1. exactly one scheduled /api/cron/one-cycle at 0 * * * *", () => {
    const oneCycleEntries = crons.filter((c) => c.path === "/api/cron/one-cycle");
    expect(oneCycleEntries).toHaveLength(1);
    expect(oneCycleEntries[0].schedule).toBe("0 * * * *");
  });

  it("2. no independently scheduled idx-sync or media-sync cron entry", () => {
    expect(crons.find((c) => c.path === "/api/cron/idx-sync")).toBeUndefined();
    expect(crons.find((c) => c.path === "/api/cron/media-sync")).toBeUndefined();
  });

  it("2b. one-cycle has an EXPLICIT 300s vercel.json function override", () => {
    const functions = (JSON.parse(read("vercel.json")).functions ?? {}) as Record<
      string,
      { maxDuration?: number }
    >;
    const oneCycleFn = functions["app/api/cron/one-cycle/route.ts"];
    expect(oneCycleFn).toBeDefined();
    expect(oneCycleFn!.maxDuration).toBe(300);
  });
});

describe("3–5. cache and execution safety constants remain 600s / 600000ms", () => {
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

  it("vercel.json has no independently scheduled sync-member cron", () => {
    const raw = read("vercel.json");
    expect(raw).not.toMatch(/"\/api\/cron\/idx-sync"/);
    expect(raw).not.toMatch(/"\/api\/cron\/media-sync"/);
  });
});

describe("7. no forgeable HTTP exemption to the concurrency guard", () => {
  it.each([
    "app/api/cron/idx-sync/route.ts",
    "app/api/cron/media-sync/route.ts",
  ])("%s: never reads a one-cycle header and ALWAYS calls claimMachine after auth", (rel) => {
    const src = read(rel);
    expect(src).not.toMatch(/x-one-cycle-member/);
    expect(src).not.toMatch(/x-one-cycle-run-id/);
    expect(src).toMatch(/claimMachine\(/);
    expect(src.indexOf("Unauthorized")).toBeGreaterThan(-1);
    expect(src.indexOf("Unauthorized")).toBeLessThan(src.indexOf("claimMachine("));
  });

  it("the orchestrator reaches the unclaimed path ONLY by importing member functions in-process", () => {
    const src = read("app/api/cron/one-cycle/route.ts");
    expect(src).toMatch(/import \{ runIdxSyncMember \} from '@\/lib\/idx\/idx-sync-member'/);
    expect(src).toMatch(/import \{ runMediaSyncMember \} from '@\/lib\/idx\/media-sync-member'/);
    expect(src).toMatch(/runMember\(name, fn, runId, budget\)/);
    expect(src).not.toMatch(/x-one-cycle-member/);
    expect(src).not.toMatch(/require\('@\/app\/api\/cron\/idx-sync\/route'\)/);
    expect(src).not.toMatch(/require\('@\/app\/api\/cron\/media-sync\/route'\)/);
  });
});

describe("8. a second overlapping one-cycle invocation exits without starting members", () => {
  it("advisory-lock contended → skipped, neither member runs", async () => {
    claimState.lockGranted = false;
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
    claimState.completedAfter = null;
    const res = await GET(makeReq(AUTH));
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(body.reason).toBe("overlap_in_progress");
    expect(idxMember).not.toHaveBeenCalled();
    expect(mediaMember).not.toHaveBeenCalled();
  });
});

describe("9. a normal cycle executes idx-sync then media-sync exactly once", () => {
  it("both members run once, in authority-hierarchy order, after a granted claim", async () => {
    const res = await GET(makeReq(AUTH));
    expect(res.status).toBe(200);
    expect(idxMember).toHaveBeenCalledTimes(1);
    expect(mediaMember).toHaveBeenCalledTimes(1);
    expect(idxMember.mock.invocationCallOrder[0]).toBeLessThan(
      mediaMember.mock.invocationCallOrder[0],
    );
    expect(
      auditCreate.mock.calls.some(
        (c) => (c[0] as { data?: { action?: string } })?.data?.action === "one_cycle_started",
      ),
    ).toBe(true);
  });
});
