// /api/cron/intent-profiles
// POST: Cron-triggered batch recompute of stale buyer intent profiles
import { NextRequest, NextResponse } from "next/server";
import { batchRecompute } from "@/lib/buyer-intent/profiler";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const computed = await batchRecompute(50);
    console.log(`[cron/intent-profiles] Recomputed ${computed} profiles`);
    return NextResponse.json({ ok: true, computed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Batch recompute failed";
    console.error("[cron/intent-profiles] Error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
