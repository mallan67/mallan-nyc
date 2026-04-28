// GET /api/cron/neon-branch-prune
// Daily cron — deletes idle Neon branches that the Neon-Vercel
// marketplace integration accumulates from preview deploys. Without
// pruning, a fast-pushing day burns through the free-tier 10-branch
// cap and every subsequent preview deploy posts "Branch limit
// exceeded" to Vercel's Checks panel. With this cron + a 24h
// retention window, branches auto-expire long before the cap is hit.
//
// Mirrors scripts/neon-prune-branches.ts so an operator can verify the
// cron's decisions locally before deploys. See lib/neon/branches.ts
// for the shared logic and NEON.md §11 for the full architecture note.
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { pruneBranches } from "@/lib/neon/branches";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
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

  const apiKey = process.env.NEON_API_KEY;
  const projectId = process.env.NEON_PROJECT_ID;
  if (!apiKey || !projectId) {
    // Skip cleanly rather than 500. Without these env vars the cron
    // can't talk to Neon, but that's a configuration gap (operator
    // hasn't yet set the secrets), not a runtime bug. Surface it as a
    // structured response so the operator can see the gap in their
    // Vercel cron logs without a noisy stack trace.
    return NextResponse.json(
      {
        ok: true,
        skipped: true,
        reason: "NEON_API_KEY or NEON_PROJECT_ID not set on this Vercel environment",
      },
      { status: 200 }
    );
  }

  try {
    const result = await pruneBranches({
      apiKey,
      projectId,
      retentionHours: 24,
      execute: true,
    });
    const body = {
      ok: result.errors.length === 0,
      examined: result.examined,
      pruned: result.pruned.length,
      pruned_branches: result.pruned.map((b) => b.name),
      kept: {
        primary: result.primary_count,
        protected: result.protected_count,
        within_retention: result.too_recent_count,
      },
      errors: result.errors,
      ts: new Date().toISOString(),
    };
    if (result.errors.length > 0) {
      // Per-branch DELETE failures are surfaced as a 500 so Vercel's
      // cron logs flag the run as failed and an operator notices. A
      // 200 here would let stale branches accumulate silently and
      // defeat the whole point of the cron — `pruneBranches` already
      // collected the per-branch errors instead of aborting, so the
      // body still contains the partial-success details for triage.
      console.error(
        `[neon-branch-prune] ${result.errors.length} delete(s) failed:`,
        result.errors.map((e) => `${e.name}: ${e.message}`).join("; ")
      );
      return NextResponse.json(body, { status: 500 });
    }
    return NextResponse.json(body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    console.error("[neon-branch-prune] Failed:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
