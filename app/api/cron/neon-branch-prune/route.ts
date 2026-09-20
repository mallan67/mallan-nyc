// GET /api/cron/neon-branch-prune
// QUARANTINED_DIRECT_NEON_CONTROL
//
// This route formerly called the Neon API directly to delete branches. Mallan's
// Neon control path is Vercel-managed, so direct Neon branch mutation is no longer
// an authorized runtime operation. The Vercel cron schedule is removed in the same
// convergence change. This tombstone remains fail-closed for stale callers.
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

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

  return NextResponse.json(
    {
      ok: false,
      refused: true,
      reason: "direct_neon_control_quarantined",
      message:
        "Direct Neon branch pruning is disabled. Use the Vercel-managed Neon resource path through an authorized Git control packet.",
    },
    { status: 410 }
  );
}
