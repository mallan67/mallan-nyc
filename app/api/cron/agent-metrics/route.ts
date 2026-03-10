// /api/cron/agent-metrics
// POST: Cron-triggered batch agent performance reindexing
import { NextRequest, NextResponse } from "next/server";
import { batchReindex } from "@/lib/agent-performance/indexer";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const computed = await batchReindex();
    console.log(`[cron/agent-metrics] Reindexed ${computed} agents`);
    return NextResponse.json({ ok: true, computed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Batch reindex failed";
    console.error("[cron/agent-metrics] Error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
