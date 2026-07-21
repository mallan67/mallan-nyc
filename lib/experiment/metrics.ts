/**
 * Experiment Metrics Aggregator
 *
 * Auto-concludes PricingExperiment records past their end_date.
 *
 * Phase 3 item-6 inventory decision — NO change needed: this weekly cron is
 * ALREADY write-on-change. It updates a row only on the one-time
 * active→concluded state transition (end_date reached); unchanged
 * experiments perform zero writes. No unconditional timestamp refresh
 * exists on this path.
 */
import prisma from "@/lib/prisma";

export async function batchComputeExperimentMetrics(): Promise<{
  experimentsProcessed: number;
  armsUpdated: number;
  autoConcluded: number;
}> {
  const experiments = await prisma.pricingExperiment.findMany({
    where: { status: "active" },
  });

  let autoConcluded = 0;

  for (const exp of experiments) {
    if (exp.end_date && exp.end_date < new Date()) {
      await prisma.pricingExperiment.update({
        where: { id: exp.id },
        data: {
          status: "concluded",
          conclusion_notes: "Auto-concluded: end date reached.",
        },
      });
      autoConcluded++;
    }
  }

  return {
    experimentsProcessed: experiments.length,
    armsUpdated: 0,
    autoConcluded,
  };
}
