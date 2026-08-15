/// <reference types="jest" />
/**
 * ONE MACHINE — unified 10-minute cadence with a Neon-free no-change path.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import type {
  OneCycleCompletionInput,
  OneCyclePreflightDecision,
} from "@/lib/idx/one-cycle-preflight";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const runOneCycle: jest.MockedFunction<(req: NextRequest) => Promise<NextResponse>> = jest.fn(
  async (_req: NextRequest) => NextResponse.json({
    success: true,
    complete: true,
    outcome: "success",
    members: [
      { member: "idx-sync", status: "ok", summary: { listings_fetched: 0 } },
      { member: "media-sync", status: "ok", summary: { backlog_remaining: 0 } },
    ],
  }),
);
const decidePreflight: jest.MockedFunction<
  (now?: Date) => Promise<OneCyclePreflightDecision>
> = jest.fn();
const finalizePreflight: jest.MockedFunction<
  (
    decision: OneCyclePreflightDecision,
    completion: OneCycleCompletionInput,
    now?: Date,
  ) => Promise<void>
> = jest.fn(async (
  _decision: OneCyclePreflightDecision,
  _completion: OneCycleCompletionInput,
  _now?: Date,
) => undefined);

jest.mock("@/app/api/cron/one-cycle/route", () => ({
  GET: (req: NextRequest) => runOneCycle(req),
}));
jest.mock("@/lib/idx/one-cycle-preflight", () => ({
  decideOneCyclePreflight: (now?: Date) => decidePreflight(now),
  finalizeOneCyclePreflight: (
    decision: OneCyclePreflightDecision,
    completion: OneCycleCompletionInput,
    now?: Date,
  ) => finalizePreflight(decision, completion, now),
}));

process.env.CRON_SECRET = "unit-secret";
const AUTH = "Bearer unit-secret";
const { GET } = require("@/app/api/cron/one-cycle-preflight/route") as {
  GET: (req: NextRequest) => Promise<NextResponse>;
};
const makeReq = (auth?: string) =>
  new NextRequest("https://mallan.nyc/api/cron/one-cycle-preflight", {
    headers: auth ? { authorization: auth } : {},
  });

const sourceSnapshot = {
  modification: { timestamp: "2026-08-02T05:50:00.000Z", listingKey: "M-1", populationAtHead: 1 },
  photos: { timestamp: "2026-08-02T05:45:00.000Z", listingKey: "P-1", populationAtHead: 1 },
  capturedAt: "2026-08-02T06:00:00.000Z",
};

beforeEach(() => {
  runOneCycle.mockClear();
  decidePreflight.mockReset();
  finalizePreflight.mockClear();
});

describe("schedule and duration", () => {
  const config = JSON.parse(read("vercel.json")) as {
    crons?: Array<{ path: string; schedule: string }>;
    functions?: Record<string, { maxDuration?: number }>;
  };

  it("schedules exactly one preflight every ten minutes and no direct sync cron", () => {
    const scheduled = config.crons ?? [];
    expect(scheduled.filter((c) => c.path === "/api/cron/one-cycle-preflight")).toEqual([
      { path: "/api/cron/one-cycle-preflight", schedule: "*/10 * * * *" },
    ]);
    expect(scheduled.find((c) => c.path === "/api/cron/one-cycle")).toBeUndefined();
    expect(scheduled.find((c) => c.path === "/api/cron/idx-sync")).toBeUndefined();
    expect(scheduled.find((c) => c.path === "/api/cron/media-sync")).toBeUndefined();
  });

  it("gives the wrapper and underlying orchestrator the full 300-second ceiling", () => {
    expect(config.functions?.["app/api/cron/one-cycle-preflight/route.ts"]?.maxDuration).toBe(300);
    expect(config.functions?.["app/api/cron/one-cycle/route.ts"]?.maxDuration).toBe(300);
  });

  it("preserves the 600-second canonical cadence and listing ISR fallback", () => {
    const { SYNC_CADENCE_SECONDS } = require("@/lib/cache/public-cache");
    expect(SYNC_CADENCE_SECONDS).toBe(600);

    // Read CYCLE_INTERVAL_MS from SOURCE rather than require()ing the
    // module. This file mocks "@/app/api/cron/one-cycle/route" so the
    // delegation tests never execute the real Prisma-backed cycle, and
    // that mock factory exports only GET — so require() returned
    // undefined here. Asserting the source text proves the real constant
    // and cannot be satisfied by the mock, which is what a cadence
    // contract must guarantee.
    expect(read("app/api/cron/one-cycle/route.ts")).toMatch(
      /export const CYCLE_INTERVAL_MS = 600_000;/,
    );
    // The CRON cadence above is unchanged. The listing-detail page is deliberately NO LONGER
    // part of that unified timeline: it is event-driven (`revalidate = false`), because a periodic
    // window on the dominant continuous Neon reader regenerated unchanged pages indefinitely.
    expect(read("app/listing/[...slug]/page.tsx")).toMatch(/export const revalidate = false;/);
  });
});

describe("Neon-free skip contract", () => {
  it("authenticates before probing", async () => {
    expect((await GET(makeReq())).status).toBe(401);
    expect(decidePreflight).not.toHaveBeenCalled();
    expect(runOneCycle).not.toHaveBeenCalled();
  });

  it("verified no-change returns without invoking the Neon-backed route", async () => {
    decidePreflight.mockResolvedValue({
      shouldRun: false,
      reason: "source_unchanged_no_backlog_due",
      snapshot: sourceSnapshot,
      snapshotTrusted: true,
      priorState: null,
    });
    const response = await GET(makeReq(AUTH));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.neon_touched).toBe(false);
    expect(body.skipped).toBe(true);
    expect(runOneCycle).not.toHaveBeenCalled();
    expect(finalizePreflight).not.toHaveBeenCalled();
  });

  it("uncertain/change decisions fail open to the existing orchestrator", async () => {
    const decision: OneCyclePreflightDecision = {
      shouldRun: true,
      reason: "source_probe_failed",
      snapshot: null,
      snapshotTrusted: false,
      priorState: null,
    };
    decidePreflight.mockResolvedValue(decision);
    const response = await GET(makeReq(AUTH));
    expect(response.status).toBe(200);
    expect(runOneCycle).toHaveBeenCalledTimes(1);
    expect(finalizePreflight).toHaveBeenCalledTimes(1);
  });

  it("translates the whitelisted capped-fetch alias before finalizing", async () => {
    const decision: OneCyclePreflightDecision = {
      shouldRun: true,
      reason: "source_changed",
      snapshot: sourceSnapshot,
      snapshotTrusted: true,
      priorState: null,
    };
    decidePreflight.mockResolvedValue(decision);
    runOneCycle.mockResolvedValueOnce(NextResponse.json({
      success: true,
      complete: true,
      outcome: "success",
      members: [
        { member: "idx-sync", status: "ok", summary: { listings_fetched: 500 } },
        { member: "media-sync", status: "ok", summary: { backlog_remaining: 0 } },
      ],
    }));
    await GET(makeReq(AUTH));
    const completion = finalizePreflight.mock.calls.at(0)?.[1];
    expect(completion).toBeDefined();
    expect(completion!.members[0].summary.total_fetched).toBe(500);
  });
});
