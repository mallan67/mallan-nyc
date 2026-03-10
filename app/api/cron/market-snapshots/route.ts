// /api/cron/market-snapshots — monthly market snapshot computation
import { NextRequest, NextResponse } from "next/server";
import { batchComputeSnapshots } from "@/lib/market-pulse/snapshot";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const computed = await batchComputeSnapshots();
    console.log(`[cron/market-snapshots] Computed ${computed} neighborhood snapshots`);
    return NextResponse.json({ ok: true, computed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Batch snapshot failed";
    console.error("[cron/market-snapshots] Error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
