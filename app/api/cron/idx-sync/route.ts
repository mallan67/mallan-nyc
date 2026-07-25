// GET /api/cron/idx-sync
// PUBLIC manual-trigger wrapper. NOT a Vercel cron entry — One Cycle runs the
// IDX member in-process (runIdxSyncMember). Every request here ALWAYS takes the
// shared atomic machine claim: there is NO request header, query param, or
// bearer combination that reaches the unclaimed member path over HTTP — the
// unclaimed path is the in-process import only. Protected by CRON_SECRET.
import { timingSafeEqual, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { runIdxSyncMember } from "@/lib/idx/idx-sync-member";
import { claimMachine, completeMachine } from "@/lib/idx/machine-claim";
import prisma from "@/lib/prisma";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  // 1. CRON_SECRET timing-safe Bearer auth.
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !authHeader || authHeader.length !== ("Bearer " + cronSecret).length || !timingSafeEqual(Buffer.from(authHeader), Buffer.from("Bearer " + cronSecret))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const forceFull = req.nextUrl.searchParams.get('full') === 'true';

  // 2. ALWAYS take the shared atomic machine claim — no request header is read
  // to exempt a caller, so a CRON_SECRET holder cannot forge "I am the
  // orchestrator" to bypass it. `?full=true` takes the claim like any other
  // request; the full behavior applies AFTER a successful claim. Fail closed.
  const machineRunId = randomUUID();
  const machineStartedAt = new Date();
  const claim = await claimMachine(prisma, {
    runId: machineRunId,
    executionType: "standalone-idx-sync",
    member: "idx-sync",
    now: machineStartedAt,
  });
  if (!claim.ok) {
    return NextResponse.json({
      skipped: true,
      reason: `blocked: machine claim not granted (${claim.reason}) — standalone idx-sync must not overlap the machine`,
    });
  }

  let outcome = "error";
  try {
    // Standalone runs correlate telemetry with their own claim run_id.
    const res = await runIdxSyncMember({ oneCycleRunId: machineRunId, forceFull });
    outcome = res.status >= 200 && res.status < 300 ? "success" : "error";
    return NextResponse.json(res.body, { status: res.status });
  } finally {
    // ALWAYS write the matching completion marker so the next execution is
    // permitted (releases the claim window).
    await completeMachine(prisma, {
      runId: machineRunId,
      executionType: "standalone-idx-sync",
      member: "idx-sync",
      outcome,
      startedAt: machineStartedAt,
    });
  }
}
