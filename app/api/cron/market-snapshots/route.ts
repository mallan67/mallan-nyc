// /api/cron/market-snapshots — Monthly 1st 6am: compute neighborhood-level market statistics
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { batchComputeSnapshots } from "@/lib/market-pulse/snapshot";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || (() => { const expected = "Bearer " + (process.env.CRON_SECRET || ""); return authHeader.length !== expected.length || !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected)); })()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();

  try {
    const computed = await batchComputeSnapshots();

    await prisma.auditEvent.create({
      data: {
        action: "cron_market_snapshots",
        entity_type: "cron",
        entity_id: "market-snapshots",
        user_type: "system",
        changes: JSON.parse(JSON.stringify({ computed, durationMs: Date.now() - started })),
      },
    });

    return NextResponse.json({ computed, durationMs: Date.now() - started });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.auditEvent.create({
      data: {
        action: "cron_market_snapshots_error",
        entity_type: "cron",
        entity_id: "market-snapshots",
        user_type: "system",
        changes: JSON.parse(JSON.stringify({ error: message })),
      },
    }).catch(() => {});

    console.error("[cron/market-snapshots] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
