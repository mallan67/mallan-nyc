// /api/cron/experiment-metrics — Daily 9am: aggregate engagement KPIs for active experiments
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { batchComputeExperimentMetrics } from "@/lib/experiment/metrics";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();

  try {
    const result = await batchComputeExperimentMetrics();

    await prisma.auditEvent.create({
      data: {
        action: "cron_experiment_metrics",
        entity_type: "cron",
        entity_id: "experiment-metrics",
        user_type: "system",
        changes: JSON.parse(JSON.stringify({ ...result, durationMs: Date.now() - started })),
      },
    });

    return NextResponse.json({ ok: true, ...result, durationMs: Date.now() - started });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.auditEvent.create({
      data: {
        action: "cron_experiment_metrics_error",
        entity_type: "cron",
        entity_id: "experiment-metrics",
        user_type: "system",
        changes: JSON.parse(JSON.stringify({ error: message })),
      },
    }).catch(() => {});

    console.error("[cron/experiment-metrics] Error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
