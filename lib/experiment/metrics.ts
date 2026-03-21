/**
 * Experiment Metrics Aggregator
 *
 * Computes summary KPIs for active PricingExperiment records by
 * aggregating EngagementEvent data per ExperimentArm.
 * Auto-concludes experiments past their end_date.
 */
import prisma from "@/lib/prisma";

interface ArmMetrics {
  total_views: number;
  total_inquiries: number;
  total_showing_requests: number;
  total_saves: number;
  total_cta_clicks: number;
  avg_time_on_page: number;
  event_count: number;
}

export async function batchComputeExperimentMetrics(): Promise<{
  experimentsProcessed: number;
  armsUpdated: number;
  autoConcluded: number;
}> {
  const experiments = await prisma.pricingExperiment.findMany({
    where: { status: "active" },
    include: {
      arms: {
        include: {
          listings: {
            where: { withdrawn_at: null },
            select: { id: true },
          },
        },
      },
    },
  });

  let armsUpdated = 0;
  let autoConcluded = 0;

  for (const exp of experiments) {
    // Auto-conclude if past end_date
    if (exp.end_date && exp.end_date < new Date()) {
      await prisma.pricingExperiment.update({
        where: { id: exp.id },
        data: {
          status: "concluded",
          conclusion_notes: "Auto-concluded: end date reached.",
        },
      });
      autoConcluded++;
      continue;
    }

    for (const arm of exp.arms) {
      const listingIds = arm.listings.map((l) => l.id);
      if (listingIds.length === 0) continue;

      // Aggregate engagement events across all listings in this arm
      const events = await prisma.engagementEvent.groupBy({
        by: ["event_type"],
        where: { experiment_listing_id: { in: listingIds } },
        _count: true,
        _sum: { value: true },
      });

      const metrics: ArmMetrics = {
        total_views: 0,
        total_inquiries: 0,
        total_showing_requests: 0,
        total_saves: 0,
        total_cta_clicks: 0,
        avg_time_on_page: 0,
        event_count: 0,
      };

      let timeSum = 0;
      let timeCount = 0;

      for (const e of events) {
        const count = e._count;
        metrics.event_count += count;

        switch (e.event_type) {
          case "page_view":
            metrics.total_views = count;
            break;
          case "inquiry":
            metrics.total_inquiries = count;
            break;
          case "showing_request":
            metrics.total_showing_requests = count;
            break;
          case "save_favorite":
            metrics.total_saves = count;
            break;
          case "cta_click":
            metrics.total_cta_clicks = count;
            break;
          case "time_on_page":
            timeSum = Number(e._sum.value || 0);
            timeCount = count;
            break;
        }
      }

      metrics.avg_time_on_page = timeCount > 0 ? Math.round(timeSum / timeCount) : 0;

      await prisma.experimentArm.update({
        where: { id: arm.id },
        data: { summary_metrics: JSON.parse(JSON.stringify(metrics)) },
      });
      armsUpdated++;
    }
  }

  return {
    experimentsProcessed: experiments.length,
    armsUpdated,
    autoConcluded,
  };
}
