/// <reference types="jest" />
/**
 * One Cycle orchestrator — behavioral contract.
 *
 * Proves the corrected orchestration (no Promise.race; sequential await;
 * run_id-paired markers; strict success semantics):
 *   - a delayed IDX member beyond its budget does not let media start
 *     concurrently;
 *   - a timed_out member cannot yield success:true;
 *   - a budget_skipped member cannot yield success:true;
 *   - no completion audit is written while a member is unresolved
 *     (completion happens only after every member settled);
 *   - one_cycle_started and one_cycle_run share the same run_id;
 *   - a normal cycle runs idx-sync then media-sync exactly once;
 *   - an overlapping cycle claim starts neither member;
 *   - members are called IN-PROCESS (no HTTP handler, no header, no nested claim).
 */
import { NextRequest } from "next/server";

// ── member WORK functions mocked (in-process, NOT route handlers) ─────────────
// The member functions return a MemberRunResult ({ status, outcome, body }) —
// NOT a NextResponse. `outcome` is the EXPLICIT semantic result; the machine's
// complete/success and the completion ledger derive from it, never from status.
type MemberArgs = { oneCycleRunId: string; forceFull?: boolean };
type MemberOut = { status: number; outcome: "ok" | "partial" | "skipped" | "error"; body: Record<string, unknown> };
const idxMember = jest.fn<Promise<MemberOut>, [MemberArgs]>(
  async () => ({ status: 200, outcome: "ok", body: { success: true, listings_processed: 7, rows_suppressed_unchanged: 3 } }),
);
const mediaMember = jest.fn<Promise<MemberOut>, [MemberArgs]>(
  async () => ({ status: 200, outcome: "ok", body: { success: true, r2_mirrored: 2, mirror_allowed: 2 } }),
);
jest.mock("@/lib/idx/idx-sync-member", () => ({ runIdxSyncMember: (a: MemberArgs) => idxMember(a) }));
jest.mock("@/lib/idx/media-sync-member", () => ({ runMediaSyncMember: (a: MemberArgs) => mediaMember(a) }));

// ── prisma mocked (claim transaction + completion audit) ──────────────────────
const startedMarkerCreate = jest.fn(async (_a?: unknown) => ({}));
const cycleRunCreate = jest.fn(async (_a?: unknown) => ({}));
const claimState = {
  lockGranted: true,
  lastStarted: null as unknown, // most-recent one_cycle_started marker (or null)
  completedForPrev: null as unknown, // matching one_cycle_run for the prev marker (or null)
};
const transactionMock = jest.fn(async (fn: (tx: unknown) => unknown) =>
  fn({
    $queryRaw: async () => [{ locked: claimState.lockGranted }],
    auditEvent: {
      findFirst: async (args: { where?: { action?: string } }) =>
        args?.where?.action === "one_cycle_started"
          ? claimState.lastStarted
          : claimState.completedForPrev,
      create: (a: unknown) => startedMarkerCreate(a),
    },
  }),
);
jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    $transaction: (fn: unknown) => transactionMock(fn as (tx: unknown) => unknown),
    auditEvent: { create: (a: unknown) => cycleRunCreate(a), findFirst: async (_a?: unknown) => null },
  },
}));
jest.mock("@/lib/idx/media-sync", () => ({
  getMediaSyncCursor: async () => ({ last_photos_change: new Date(Date.now() - 90_000) }),
}));

process.env.CRON_SECRET = "unit-secret";
const AUTH = "Bearer unit-secret";
const { GET } = require("@/app/api/cron/one-cycle/route");

const makeReq = (auth?: string) =>
  new NextRequest("https://mallan.nyc/api/cron/one-cycle", {
    headers: auth ? { authorization: auth } : {},
  });

const runIdOf = (createMock: jest.Mock) => {
  const call = createMock.mock.calls[0]?.[0] as
    | { data?: { changes?: { run_id?: string } } }
    | undefined;
  return call?.data?.changes?.run_id;
};

beforeEach(() => {
  idxMember.mockReset();
  mediaMember.mockReset();
  startedMarkerCreate.mockClear();
  cycleRunCreate.mockClear();
  transactionMock.mockClear();
  claimState.lockGranted = true;
  claimState.lastStarted = null;
  claimState.completedForPrev = null;
  delete process.env.ONE_CYCLE_BUDGET_MS_IDX_SYNC;
  delete process.env.ONE_CYCLE_BUDGET_MS_MEDIA_SYNC;
  idxMember.mockImplementation(async () => ({
    status: 200,
    outcome: "ok",
    body: { success: true, listings_processed: 7, rows_suppressed_unchanged: 3 },
  }));
  mediaMember.mockImplementation(async () => ({
    status: 200,
    outcome: "ok",
    body: { success: true, r2_mirrored: 2, mirror_allowed: 2 },
  }));
});

// ─── auth + in-process member invocation ──────────────────────────────────────
describe("auth + in-process member invocation", () => {
  it("401 on missing/wrong bearer; NO member runs, NO claim taken", async () => {
    expect((await GET(makeReq())).status).toBe(401);
    expect((await GET(makeReq("Bearer wrong-secret-value"))).status).toBe(401);
    expect(idxMember).not.toHaveBeenCalled();
    expect(mediaMember).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("calls both member functions in-process — no HTTP handler, no forgeable header, idx incremental", async () => {
    await GET(makeReq(AUTH));
    // Members are invoked with the run correlation id only — no auth header, no
    // secret, no bypass token is threaded to them (there is no HTTP boundary).
    expect(idxMember).toHaveBeenCalledTimes(1);
    expect(mediaMember).toHaveBeenCalledTimes(1);
    expect(typeof idxMember.mock.calls[0][0].oneCycleRunId).toBe("string");
    expect(typeof mediaMember.mock.calls[0][0].oneCycleRunId).toBe("string");
    // One Cycle drives INCREMENTAL idx-sync — a full drain is a manual claimed GET.
    expect(idxMember.mock.calls[0][0].forceFull).toBe(false);
  });
});

// ─── 6. normal cycle: idx then media, exactly once ────────────────────────────
describe("normal cycle", () => {
  it("runs idx-sync then media-sync exactly once, success:true, complete:true", async () => {
    const res = await GET(makeReq(AUTH));
    const body = await res.json();
    expect(idxMember).toHaveBeenCalledTimes(1);
    expect(mediaMember).toHaveBeenCalledTimes(1);
    expect(idxMember.mock.invocationCallOrder[0]).toBeLessThan(mediaMember.mock.invocationCallOrder[0]);
    expect(body.success).toBe(true);
    expect(body.complete).toBe(true);
    expect(body.members_ok).toBe(2);
    expect(body.members_unresolved).toBe(0);
  });
});

// ─── 1. delayed IDX beyond budget must not let media run concurrently ─────────
describe("no concurrent members", () => {
  it("media never starts until idx has fully settled (sequential await)", async () => {
    let idxResolved = false;
    let mediaStartedWhileIdxUnresolved = false;
    let releaseIdx: () => void = () => {};
    idxMember.mockImplementation(
      () =>
        new Promise<MemberOut>((resolve) => {
          releaseIdx = () => {
            idxResolved = true;
            resolve({ status: 200, outcome: "ok", body: { success: true } });
          };
        }),
    );
    mediaMember.mockImplementation(async () => {
      if (!idxResolved) mediaStartedWhileIdxUnresolved = true;
      return { status: 200, outcome: "ok", body: { success: true } };
    });

    const p = GET(makeReq(AUTH));
    // Wait until idx has actually STARTED (past auth + the claim transaction).
    for (let i = 0; i < 100 && idxMember.mock.calls.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 1));
    }
    expect(idxMember).toHaveBeenCalledTimes(1);
    // idx is pending (unresolved) — media must NOT have started.
    expect(mediaMember).not.toHaveBeenCalled();
    releaseIdx();
    await p;
    expect(mediaStartedWhileIdxUnresolved).toBe(false);
    expect(mediaMember).toHaveBeenCalledTimes(1);
  });

  it("an IDX member OVER its budget is timed_out, stops the chain, and media never starts", async () => {
    // Valid POSITIVE 1ms budget (config-valid) + a >1ms real delay ⇒ timed_out.
    process.env.ONE_CYCLE_BUDGET_MS_IDX_SYNC = "1";
    idxMember.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 15));
      return { status: 200, outcome: "ok", body: { success: true } };
    });
    const body = await (await GET(makeReq(AUTH))).json();
    const idx = body.members.find((m: { member: string }) => m.member === "idx-sync");
    const media = body.members.find((m: { member: string }) => m.member === "media-sync");
    expect(idx.status).toBe("timed_out");
    expect(idx.settled).toBe(true); // awaited to settlement — never abandoned
    expect(media.status).toBe("budget_skipped");
    expect(mediaMember).not.toHaveBeenCalled(); // media never STARTED
  });
});

// ─── 2 + 3. complete / settled / success truth table ──────────────────────────
describe("truth semantics: settled / complete / success", () => {
  const forceIdxTimeout = () => {
    process.env.ONE_CYCLE_BUDGET_MS_IDX_SYNC = "1";
    idxMember.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 15));
      return { status: 200, outcome: "ok", body: { success: true } };
    });
  };

  it("both ok ⇒ settled true, complete true, success true", async () => {
    const body = await (await GET(makeReq(AUTH))).json();
    expect(body.orchestration_settled).toBe(true);
    expect(body.complete).toBe(true);
    expect(body.success).toBe(true);
  });

  it("idx timed_out + media budget_skipped ⇒ settled true, complete FALSE, success false", async () => {
    forceIdxTimeout();
    const body = await (await GET(makeReq(AUTH))).json();
    expect(body.members_timed_out).toBe(1);
    expect(body.members_budget_skipped).toBe(1);
    expect(body.orchestration_settled).toBe(true); // nothing abandoned
    expect(body.complete).toBe(false); // media did NOT complete
    expect(body.success).toBe(false);
  });

  it("idx failed + media budget_skipped ⇒ settled true, complete FALSE, success false", async () => {
    idxMember.mockImplementation(async () => ({ status: 500, outcome: "error", body: { error: "boom" } }));
    const body = await (await GET(makeReq(AUTH))).json();
    expect(body.members_budget_skipped).toBe(1);
    expect(body.orchestration_settled).toBe(true);
    expect(body.complete).toBe(false); // a required member was skipped
    expect(body.success).toBe(false);
  });

  it("a skipped required member can NEVER produce complete:true", async () => {
    forceIdxTimeout();
    const body = await (await GET(makeReq(AUTH))).json();
    const media = body.members.find((m: { member: string }) => m.member === "media-sync");
    expect(media.status).toBe("budget_skipped");
    expect(body.complete).toBe(false);
  });

  it("a failed member (non-2xx) forces success:false and stops the chain", async () => {
    idxMember.mockImplementation(async () => ({ status: 500, outcome: "error", body: { error: "boom" } }));
    const body = await (await GET(makeReq(AUTH))).json();
    const idx = body.members.find((m: { member: string }) => m.member === "idx-sync");
    expect(idx.status).toBe("failed");
    expect(body.success).toBe(false);
    expect(mediaMember).not.toHaveBeenCalled(); // chain stops on non-ok
  });

  it("a thrown member is member_error, success:false, chain stops", async () => {
    idxMember.mockImplementation(async () => {
      throw new Error("simulated crash");
    });
    const body = await (await GET(makeReq(AUTH))).json();
    const idx = body.members.find((m: { member: string }) => m.member === "idx-sync");
    expect(idx.status).toBe("member_error");
    expect(idx.settled).toBe(true);
    expect(body.success).toBe(false);
    expect(mediaMember).not.toHaveBeenCalled();
  });
});

// ─── 4. no completion audit while a member is unresolved ──────────────────────
describe("completion ordering", () => {
  it("one_cycle_run is written ONLY after every member settled (never mid-flight)", async () => {
    await GET(makeReq(AUTH));
    expect(cycleRunCreate).toHaveBeenCalledTimes(1);
    // The completion audit create runs AFTER both member calls resolved.
    expect(cycleRunCreate.mock.invocationCallOrder[0]).toBeGreaterThan(
      idxMember.mock.invocationCallOrder[0],
    );
    expect(cycleRunCreate.mock.invocationCallOrder[0]).toBeGreaterThan(
      mediaMember.mock.invocationCallOrder[0],
    );
    // And the written audit proves nothing was unresolved.
    const changes = (cycleRunCreate.mock.calls[0][0] as { data: { changes: Record<string, unknown> } })
      .data.changes;
    expect(changes.members_unresolved).toBe(0);
    expect(changes.complete).toBe(true);
    const members = changes.members as Array<{ status: string; settled: boolean }>;
    for (const m of members) {
      if (m.status !== "budget_skipped") expect(m.settled).toBe(true);
    }
  });
});

// ─── 5. run_id pairing ────────────────────────────────────────────────────────
describe("run_id pairing", () => {
  it("one_cycle_started and one_cycle_run carry the SAME run_id", async () => {
    const body = await (await GET(makeReq(AUTH))).json();
    const startedRunId = runIdOf(startedMarkerCreate);
    const completedRunId = runIdOf(cycleRunCreate);
    expect(typeof startedRunId).toBe("string");
    expect(startedRunId).toBe(completedRunId);
    expect(body.run_id).toBe(startedRunId); // response echoes it too
  });
});

// ─── 7. overlapping cycle claim starts neither member ─────────────────────────
describe("overlap guard", () => {
  it("lock contended → skipped, neither member runs, no completion audit", async () => {
    claimState.lockGranted = false;
    const body = await (await GET(makeReq(AUTH))).json();
    expect(body.skipped).toBe(true);
    expect(body.reason).toBe("lock_contended");
    expect(idxMember).not.toHaveBeenCalled();
    expect(mediaMember).not.toHaveBeenCalled();
    expect(cycleRunCreate).not.toHaveBeenCalled();
  });

  it("in-progress prior started-marker (no matching completion) → overlap skip, neither member runs", async () => {
    claimState.lockGranted = true;
    claimState.lastStarted = { created_at: new Date(), changes: { run_id: "prev-run" } };
    claimState.completedForPrev = null; // no one_cycle_run for prev-run yet
    const body = await (await GET(makeReq(AUTH))).json();
    expect(body.skipped).toBe(true);
    expect(body.reason).toBe("overlap_in_progress");
    expect(idxMember).not.toHaveBeenCalled();
    expect(mediaMember).not.toHaveBeenCalled();
  });

  it("prior started-marker WITH a matching completion → claim granted, members run", async () => {
    claimState.lastStarted = { created_at: new Date(Date.now() - 1000), changes: { run_id: "prev-run" } };
    claimState.completedForPrev = { id: 1 }; // prev-run completed
    await GET(makeReq(AUTH));
    expect(idxMember).toHaveBeenCalledTimes(1);
    expect(mediaMember).toHaveBeenCalledTimes(1);
  });
});

// ─── budget config validation (fail closed) ───────────────────────────────────
describe("budget config validation fails closed", () => {
  it.each([
    ["zero", "0"],
    ["negative", "-5"],
    ["non-integer", "1.5"],
    ["non-finite", "abc"],
    ["over the max", "999999"],
  ])("rejects a %s budget → 500 configuration_error, NO claim, NO member starts", async (_label, val) => {
    process.env.ONE_CYCLE_BUDGET_MS_IDX_SYNC = val;
    const res = await GET(makeReq(AUTH));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(typeof body.configuration_error).toBe("string");
    expect(body.started).toBe(false);
    expect(transactionMock).not.toHaveBeenCalled(); // no claim taken
    expect(idxMember).not.toHaveBeenCalled();
    expect(mediaMember).not.toHaveBeenCalled();
  });

  it("rejects combined budgets that don't fit inside maxDuration", async () => {
    // idx 200000 + media default 150000 + headroom 20000 = 370000 >= 300000.
    process.env.ONE_CYCLE_BUDGET_MS_IDX_SYNC = "200000";
    const res = await GET(makeReq(AUTH));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.configuration_error).toMatch(/do not fit inside maxDuration/);
    expect(idxMember).not.toHaveBeenCalled();
  });

  it("accepts a valid positive override within range", async () => {
    process.env.ONE_CYCLE_BUDGET_MS_IDX_SYNC = "60000"; // valid
    const res = await GET(makeReq(AUTH));
    expect(res.status).toBe(200);
    expect(idxMember).toHaveBeenCalledTimes(1);
  });
});

// ─── run_id passed to members for telemetry correlation ───────────────────────
describe("member telemetry correlation", () => {
  it("passes oneCycleRunId to both members, equal to the cycle run_id", async () => {
    const body = await (await GET(makeReq(AUTH))).json();
    expect(idxMember.mock.calls[0][0].oneCycleRunId).toBe(body.run_id);
    expect(mediaMember.mock.calls[0][0].oneCycleRunId).toBe(body.run_id);
  });
});

// ─── member SEMANTIC outcome drives machine truth (NOT HTTP status) ───────────
describe("member outcome semantics (machine truth ≠ HTTP status)", () => {
  it("IDX precondition skip (HTTP 200, outcome 'skipped') CANNOT yield machine success=true and STOPS media", async () => {
    // Exactly the disabled/missing-credentials case: the member returns 200 with
    // a skip body but outcome 'skipped'. HTTP-status-only classification would
    // have counted this as ok — the semantic outcome must not.
    idxMember.mockImplementation(async () => ({
      status: 200,
      outcome: "skipped",
      body: { skipped: true, reason: "IDX disabled or credentials missing" },
    }));
    const res = await GET(makeReq(AUTH));
    const body = await res.json();
    const idx = body.members.find((m: { member: string }) => m.member === "idx-sync");
    const media = body.members.find((m: { member: string }) => m.member === "media-sync");

    expect(idx.status).toBe("skipped");
    expect(idx.outcome).toBe("skipped");
    expect(body.success).toBe(false); // never success on a precondition skip
    expect(body.complete).toBe(false); // idx did not do its work
    expect(body.members_ok).toBe(0); // a 200 skip is NOT ok
    expect(media.status).toBe("budget_skipped"); // chain stopped BEFORE media
    expect(mediaMember).not.toHaveBeenCalled();
    expect(body.outcome).toBe("incomplete"); // machine-level outcome
  });

  it("IDX partial (per-record errors → outcome 'partial') HOLDS media and CANNOT yield success=true", async () => {
    // syncListings catches per-record failures and resolves with errors>0; the
    // IDX member returns outcome 'partial'. Per Maya (2026-07-25) a partial IDX
    // HOLDS media — the non-ok chain-stop budget-skips media, so the cycle is
    // complete=false / success=false and never reports the machine successful.
    idxMember.mockImplementation(async () => ({
      status: 200,
      outcome: "partial",
      body: { success: true, errors: 4, upserted: 496 },
    }));
    const res = await GET(makeReq(AUTH));
    const body = await res.json();
    const idx = body.members.find((m: { member: string }) => m.member === "idx-sync");
    const media = body.members.find((m: { member: string }) => m.member === "media-sync");

    expect(idx.status).toBe("partial");
    expect(idx.outcome).toBe("partial");
    expect(body.members_partial).toBe(1);
    expect(body.success).toBe(false); // partial IDX is never machine success
    expect(media.status).toBe("budget_skipped"); // media HELD
    expect(mediaMember).not.toHaveBeenCalled();
    expect(body.complete).toBe(false); // media did not run to settlement
    expect(body.outcome).toBe("incomplete");
  });

  it("media partial (HTTP 200, outcome 'partial') ⇒ complete=true, success=false, machine outcome 'partial'", async () => {
    mediaMember.mockImplementation(async () => ({
      status: 200,
      outcome: "partial",
      body: { success: true, rows_failed: 3, r2_failed: 0 },
    }));
    const res = await GET(makeReq(AUTH));
    const body = await res.json();
    const media = body.members.find((m: { member: string }) => m.member === "media-sync");

    expect(media.status).toBe("partial");
    expect(media.outcome).toBe("partial");
    // The member STARTED and settled, so the cycle is complete — but not success.
    expect(body.complete).toBe(true);
    expect(body.success).toBe(false);
    expect(body.members_partial).toBe(1);
    expect(body.members_ok).toBe(1); // idx ok
    expect(body.outcome).toBe("partial"); // machine-level outcome is partial
  });

  it("media error (outcome 'error' returned over HTTP 200) forces success=false — not counted ok", async () => {
    // A graceful runMediaSync error returns 200 but outcome 'error'. Status-only
    // classification would call it ok; the semantic outcome must force failure.
    mediaMember.mockImplementation(async () => ({
      status: 200,
      outcome: "error",
      body: { success: true, error: "Property fetch failed" },
    }));
    const body = await (await GET(makeReq(AUTH))).json();
    const media = body.members.find((m: { member: string }) => m.member === "media-sync");
    expect(media.status).toBe("failed");
    expect(media.outcome).toBe("error");
    expect(body.success).toBe(false);
    expect(body.members_ok).toBe(1); // only idx
  });

  it("both fully-ok members ⇒ complete=true, success=true, machine outcome 'success'", async () => {
    const body = await (await GET(makeReq(AUTH))).json();
    expect(body.complete).toBe(true);
    expect(body.success).toBe(true);
    expect(body.members_partial).toBe(0);
    expect(body.members_precondition_skipped).toBe(0);
    expect(body.outcome).toBe("success");
  });
});
