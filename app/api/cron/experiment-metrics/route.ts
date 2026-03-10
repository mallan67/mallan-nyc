// /api/cron/experiment-metrics
// POST: Daily aggregation of experiment metrics + auto-conclude check
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { aggregateExperimentMetrics, shouldConclude } from "@/lib/pricing-experiments/stats";
import { concludeExperiment } from "@/lib/pricing-experiments/lifecycle";
import { AUTO_CONCLUDE_AFTER_DAYS } from "@/lib/pricing-experiments/config";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Find all active experiments
    const active = await prisma.pricingExperiment.findMany({
      where: { status: "active" },
      select: { id: true, start_date: true },
    });

    let aggregated = 0;
    let concluded = 0;

    for (const exp of active) {
      try {
        // Aggregate metrics
        await aggregateExperimentMetrics(exp.id);
        aggregated++;

        // Check auto-conclude conditions
        const reachedTarget = await shouldConclude(exp.id);
        const expiredDuration = exp.start_date &&
          (Date.now() - exp.start_date.getTime()) > AUTO_CONCLUDE_AFTER_DAYS * 24 * 60 * 60 * 1000;

        if (reachedTarget || expiredDuration) {
          await concludeExperiment(exp.id);
          concluded++;
        }
      } catch (err) {
        console.warn(`[cron/experiment-metrics] Failed for experiment ${exp.id}:`, err);
      }
    }

    console.log(`[cron/experiment-metrics] Aggregated: ${aggregated}, Auto-concluded: ${concluded}`);
    return NextResponse.json({ ok: true, aggregated, concluded });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Cron failed";
    console.error("[cron/experiment-metrics] Error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
