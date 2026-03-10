// /api/cron/seller-scoring
// POST: Cron-triggered batch re-scoring of stale seller leads
// Protected by CRON_SECRET header (same pattern as other cron jobs)
import { NextRequest, NextResponse } from "next/server";
import { batchRescore } from "@/lib/seller-readiness/scorer";

export const runtime = "nodejs";
export const maxDuration = 30; // Vercel serverless max

export async function POST(req: NextRequest) {
  // Verify cron secret
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const scored = await batchRescore(50);
    console.log(`[cron/seller-scoring] Re-scored ${scored} leads`);
    return NextResponse.json({ ok: true, scored });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Batch scoring failed";
    console.error("[cron/seller-scoring] Error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
