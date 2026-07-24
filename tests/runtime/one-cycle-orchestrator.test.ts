/// <reference types="jest" />
/**
 * One Cycle W2 orchestrator — /api/cron/one-cycle (10-minute cadence).
 *
 * Contracts (W2 design §(b)/(d) + Maya's 2026-07-24 cadence directive):
 *   1. CRON_SECRET Bearer auth (timing-safe), like every member.
 *   2. Member order = authority hierarchy: idx-sync BEFORE media-sync.
 *   3. A failed member never breaks the chain; statuses are recorded.
 *   4. Exactly ONE `one_cycle_run` AuditEvent per firing with the
 *      per-member status array + machine roll-up (cadence, cursor lag,
 *      previous-run overlap, ok/failed/skipped counts).
 *   5. Members are invoked in-process with the forwarded auth header —
 *      their own guards/audits stay authoritative.
 *   6. SCHEDULE contract: vercel.json runs one-cycle at *&#47;10 and no longer
 *      schedules idx-sync / media-sync independently (routes stay deployed
 *      for manual triggering during the transition window).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { NextRequest, NextResponse } from "next/server";

// Typed to the generic member contract (Response) so a test can override with
// any status (e.g. a 500 body) without fighting the inferred success shape.
const idxGET = jest.fn<Promise<Response>, [NextRequest]>(async (_req: NextRequest) =>
  NextResponse.json({ success: true, listings_processed: 7, rows_suppressed_unchanged: 3 }),
);
const mediaGET = jest.fn<Promise<Response>, [NextRequest]>(async (_req: NextRequest) =>
  NextResponse.json({ success: true, r2_mirrored: 2, mirror_allowed: 2, rows_drained: 2 }),
);
jest.mock("@/app/api/cron/idx-sync/route", () => ({ GET: (r: NextRequest) => idxGET(r) }));
jest.mock("@/app/api/cron/media-sync/route", () => ({ GET: (r: NextRequest) => mediaGET(r) }));

const auditCreate = jest.fn(async (_args: unknown) => ({}));
const auditFindFirst = jest.fn(async () => null as unknown);
jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    auditEvent: {
      create: (a: unknown) => auditCreate(a),
      findFirst: (a: unknown) => auditFindFirst(),
    },
  },
}));

const cursorMock = jest.fn(async () => ({
  last_photos_change: new Date(Date.now() - 90_000),
}));
jest.mock("@/lib/idx/media-sync", () => ({
  getMediaSyncCursor: () => cursorMock(),
}));

process.env.CRON_SECRET = "test-cycle-secret";
const AUTH = "Bearer test-cycle-secret";
const { GET } = require("@/app/api/cron/one-cycle/route");

const makeReq = (auth?: string) =>
  new NextRequest("https://mallan.nyc/api/cron/one-cycle", {
    headers: auth ? { authorization: auth } : {},
  });

beforeEach(() => {
  idxGET.mockClear();
  mediaGET.mockClear();
  auditCreate.mockClear();
  auditFindFirst.mockClear();
});

describe("one-cycle — auth", () => {
  it("rejects a missing/wrong bearer with 401 and runs NO member", async () => {
    expect((await GET(makeReq())).status).toBe(401);
    expect((await GET(makeReq("Bearer wrong-secret-value"))).status).toBe(401);
    expect(idxGET).not.toHaveBeenCalled();
    expect(mediaGET).not.toHaveBeenCalled();
  });
});

describe("one-cycle — ordering + auth forwarding", () => {
  it("runs idx-sync strictly BEFORE media-sync, forwarding the cron bearer to both", async () => {
    const res = await GET(makeReq(AUTH));
    expect(res.status).toBe(200);
    expect(idxGET).toHaveBeenCalledTimes(1);
    expect(mediaGET).toHaveBeenCalledTimes(1);
    expect(idxGET.mock.invocationCallOrder[0]).toBeLessThan(
      mediaGET.mock.invocationCallOrder[0],
    );
    expect(idxGET.mock.calls[0][0].headers.get("authorization")).toBe(AUTH);
    expect(mediaGET.mock.calls[0][0].headers.get("authorization")).toBe(AUTH);
  });

  it("signals both members they are orchestrated (x-one-cycle-member=1) so their 10-min guards do not self-skip the 10-min cadence", async () => {
    // The concurrency-guard bypass depends on this exact header: a 10-minute
    // AuditEvent guard at a 10-minute cadence would otherwise false-trigger and
    // drop every other cycle to an effective 20-minute cadence.
    await GET(makeReq(AUTH));
    expect(idxGET.mock.calls[0][0].headers.get("x-one-cycle-member")).toBe("1");
    expect(mediaGET.mock.calls[0][0].headers.get("x-one-cycle-member")).toBe("1");
  });
});

describe("one-cycle — failure isolation (W2 §(d))", () => {
  it("an idx-sync throw does NOT stop media-sync; statuses recorded; cycle audit written", async () => {
    idxGET.mockRejectedValueOnce(new Error("simulated member crash"));
    const res = await GET(makeReq(AUTH));
    const body = await res.json();
    expect(mediaGET).toHaveBeenCalledTimes(1); // chain survived
    const statuses = Object.fromEntries(
      body.members.map((m: { member: string; status: string }) => [m.member, m.status]),
    );
    expect(statuses["idx-sync"]).toBe("member_error");
    expect(statuses["media-sync"]).toBe("ok");
    expect(body.members_failed).toBe(1);
    expect(body.success).toBe(false);
  });

  it("a member 500 response is recorded as failed, not thrown", async () => {
    idxGET.mockResolvedValueOnce(
      NextResponse.json({ error: "boom" }, { status: 500 }),
    );
    const body = await (await GET(makeReq(AUTH))).json();
    const idx = body.members.find((m: { member: string }) => m.member === "idx-sync");
    expect(idx.status).toBe("failed");
    expect(idx.http_status).toBe(500);
  });
});

describe("one-cycle — the single machine audit event", () => {
  it("writes exactly ONE one_cycle_run AuditEvent with member array + machine roll-up", async () => {
    await GET(makeReq(AUTH));
    const cycleAudits = auditCreate.mock.calls.filter(
      (c) => (c[0] as { data: { action: string } }).data.action === "one_cycle_run",
    );
    expect(cycleAudits.length).toBe(1);
    const ch = (cycleAudits[0][0] as { data: { changes: Record<string, unknown> } }).data
      .changes;
    for (const k of [
      "started_at", "ended_at", "duration_ms", "members", "cadence",
      "previous_run_overlap", "media_cursor_lag_seconds",
      "members_ok", "members_failed", "members_skipped",
    ]) {
      expect(ch).toHaveProperty(k);
    }
    expect(ch.cadence).toBe("10m");
    // cursor mock is 90s behind ⇒ lag ≈ 90 (±5s of test execution)
    expect(ch.media_cursor_lag_seconds as number).toBeGreaterThanOrEqual(85);
    expect(ch.media_cursor_lag_seconds as number).toBeLessThanOrEqual(120);
    // member summaries carry whitelisted counters only
    const members = ch.members as Array<{ member: string; summary: Record<string, unknown> }>;
    const idx = members.find((m) => m.member === "idx-sync")!;
    expect(idx.summary).toHaveProperty("listings_processed", 7);
    expect(idx.summary).toHaveProperty("rows_suppressed_unchanged", 3);
    expect(idx.summary).not.toHaveProperty("success");
    const media = members.find((m) => m.member === "media-sync")!;
    expect(media.summary).toHaveProperty("mirror_allowed", 2);
  });

  it("an audit-write failure never fails the cycle response", async () => {
    auditCreate.mockRejectedValueOnce(new Error("audit table unavailable"));
    const res = await GET(makeReq(AUTH));
    expect(res.status).toBe(200);
  });
});

describe("one-cycle — schedule contract (vercel.json)", () => {
  const cfg = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../vercel.json"), "utf8"),
  ) as { crons: Array<{ path: string; schedule: string }> };

  it("one-cycle is scheduled every 10 minutes", () => {
    const entry = cfg.crons.find((c) => c.path === "/api/cron/one-cycle");
    expect(entry).toBeDefined();
    expect(entry!.schedule).toBe("*/10 * * * *");
  });

  it("idx-sync and media-sync are no longer independently scheduled (routes remain deployed)", () => {
    expect(cfg.crons.some((c) => c.path === "/api/cron/idx-sync")).toBe(false);
    expect(cfg.crons.some((c) => c.path === "/api/cron/media-sync")).toBe(false);
    expect(fs.existsSync(path.resolve(__dirname, "../../app/api/cron/idx-sync/route.ts"))).toBe(true);
    expect(fs.existsSync(path.resolve(__dirname, "../../app/api/cron/media-sync/route.ts"))).toBe(true);
  });
});
