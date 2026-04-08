/**
 * Experiment Metrics Aggregator
 *
 * Auto-concludes PricingExperiment records past their end_date.
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
