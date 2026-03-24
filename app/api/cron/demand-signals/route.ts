// /api/cron/demand-signals — Daily 10am: collect demand signals and compute neighborhood index
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { batchComputeDemandIndex } from "@/lib/demand-index/collector";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || (() => { const expected = "Bearer " + (process.env.CRON_SECRET || ""); return authHeader.length !== expected.length || !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected)); })()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();

  try {
    const result = await batchComputeDemandIndex();

    await prisma.auditEvent.create({
      data: {
        action: "cron_demand_signals",
        entity_type: "cron",
        entity_id: "demand-signals",
        user_type: "system",
        changes: JSON.parse(JSON.stringify({ ...result, durationMs: Date.now() - started })),
      },
    });

    return NextResponse.json({ ok: true, ...result, durationMs: Date.now() - started });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.auditEvent.create({
      data: {
        action: "cron_demand_signals_error",
        entity_type: "cron",
        entity_id: "demand-signals",
        user_type: "system",
        changes: JSON.parse(JSON.stringify({ error: message })),
      },
    }).catch(() => {});

    console.error("[cron/demand-signals] Error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
