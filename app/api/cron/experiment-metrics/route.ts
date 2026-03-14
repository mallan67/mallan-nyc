// Fixed: was POST-only (Vercel Cron sends GET)
// Kept inline because it has experiment-specific loop + auto-conclude logic
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { aggregateExperimentMetrics, shouldConclude } from "@/lib/pricing-experiments/stats";
import { concludeExperiment } from "@/lib/pricing-experiments/lifecycle";
import { AUTO_CONCLUDE_AFTER_DAYS } from "@/lib/pricing-experiments/config";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const start = Date.now();
  try {
    const active = await prisma.pricingExperiment.findMany({
      where: { status: "active" },
      select: { id: true, start_date: true },
    });

    let aggregated = 0;
    let concluded = 0;

    for (const exp of active) {
      try {
        await aggregateExperimentMetrics(exp.id);
        aggregated++;

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

    const duration_ms = Date.now() - start;
    console.log(`[cron/experiment-metrics] OK (${duration_ms}ms) aggregated=${aggregated} concluded=${concluded}`);
    return NextResponse.json({ ok: true, aggregated, concluded, duration_ms });
  } catch (err: unknown) {
    const duration_ms = Date.now() - start;
    const msg = err instanceof Error ? err.message : "Cron failed";
    console.error(`[cron/experiment-metrics] FAIL (${duration_ms}ms):`, msg);
    return NextResponse.json({ ok: false, error: msg, duration_ms }, { status: 500 });
  }
}
