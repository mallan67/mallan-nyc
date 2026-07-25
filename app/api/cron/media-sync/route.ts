// GET /api/cron/media-sync
// PUBLIC manual-trigger wrapper. NOT a Vercel cron entry — One Cycle runs the
// media member in-process. Every request here ALWAYS takes the shared atomic
// machine claim: there is NO request header, query param, or bearer combination
// that reaches the unclaimed member path over HTTP (the orchestrated in-process
// call goes through runMediaSyncMember directly, import-only). Protected by
// CRON_SECRET (timing-safe).
import { timingSafeEqual, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { runMediaSyncMember } from "@/lib/idx/media-sync-member";
import { claimMachine, completeMachine } from "@/lib/idx/machine-claim";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  // 1. CRON_SECRET timing-safe Bearer auth.
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (
    !cronSecret ||
    !authHeader ||
    authHeader.length !== ("Bearer " + cronSecret).length ||
    !timingSafeEqual(Buffer.from(authHeader), Buffer.from("Bearer " + cronSecret))
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. ALWAYS take the shared atomic machine claim — no request header is read
  // to exempt a caller, so a CRON_SECRET holder cannot forge orchestrator
  // identity to bypass it. The only unclaimed path is the in-process
  // runMediaSyncMember import, unreachable via HTTP. Fail closed on refusal.
  const machineRunId = randomUUID();
  const machineStartedAt = new Date();
  const claim = await claimMachine(prisma, {
    runId: machineRunId,
    executionType: "standalone-media-sync",
    member: "media-sync",
    now: machineStartedAt,
  });
  if (!claim.ok) {
    return NextResponse.json({
      skipped: true,
      reason: `blocked: machine claim not granted (${claim.reason}) — standalone media-sync must not overlap the machine`,
    });
  }

  // Completion-marker outcome is the member's SEMANTIC outcome, not HTTP status:
  // a partial run (200) must be recorded "partial", never "success".
  let outcome = "error";
  try {
    // Standalone runs correlate telemetry with their own claim run_id.
    const res = await runMediaSyncMember({ oneCycleRunId: machineRunId });
    outcome = res.outcome === "ok" ? "success" : res.outcome; // success | partial | skipped | error
    return NextResponse.json(res.body, { status: res.status });
  } finally {
    // ALWAYS write the matching completion marker so the next execution is
    // permitted (releases the claim window).
    await completeMachine(prisma, {
      runId: machineRunId,
      executionType: "standalone-media-sync",
      member: "media-sync",
      outcome,
      startedAt: machineStartedAt,
    });
  }
}
