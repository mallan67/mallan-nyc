// /api/cron/agent-metrics — Weekly Mon 12pm: compute rolling 6-month performance index
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { batchReindex } from "@/lib/agent-performance/indexer";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || (() => { const expected = "Bearer " + (process.env.CRON_SECRET || ""); return authHeader.length !== expected.length || !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected)); })()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();

  try {
    const indexed = await batchReindex();

    await prisma.auditEvent.create({
      data: {
        action: "cron_agent_metrics",
        entity_type: "cron",
        entity_id: "agent-metrics",
        user_type: "system",
        changes: JSON.parse(JSON.stringify({ indexed, durationMs: Date.now() - started })),
      },
    });

    return NextResponse.json({ ok: true, indexed, durationMs: Date.now() - started });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.auditEvent.create({
      data: {
        action: "cron_agent_metrics_error",
        entity_type: "cron",
        entity_id: "agent-metrics",
        user_type: "system",
        changes: JSON.parse(JSON.stringify({ error: message })),
      },
    }).catch(() => {});

    console.error("[cron/agent-metrics] Error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
