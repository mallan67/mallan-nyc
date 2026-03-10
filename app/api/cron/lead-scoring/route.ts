// /api/cron/lead-scoring — daily batch lead scoring
import { NextRequest, NextResponse } from "next/server";
import { batchScoreLeads } from "@/lib/lead-scoring/scorer";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const scored = await batchScoreLeads(100);
    console.log(`[cron/lead-scoring] Scored ${scored} leads`);
    return NextResponse.json({ ok: true, scored });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Batch scoring failed";
    console.error("[cron/lead-scoring] Error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
