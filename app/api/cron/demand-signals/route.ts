// /api/cron/demand-signals
// POST: Cron-triggered batch signal collection + reindexing
import { NextRequest, NextResponse } from "next/server";
import { batchReindex } from "@/lib/demand-heatmap/indexer";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const indexed = await batchReindex();
    console.log(`[cron/demand-signals] Reindexed ${indexed} neighborhoods`);
    return NextResponse.json({ ok: true, indexed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Batch reindex failed";
    console.error("[cron/demand-signals] Error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
