// /api/crm/experiments/stats
// GET: Summary dashboard stats across all experiments
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const ownerFilter = auth.role !== "BROKER"
    ? { created_by_id: auth.userId }
    : {};

  const [
    total,
    byStatus,
    byType,
    concludedExperiments,
  ] = await Promise.all([
    prisma.pricingExperiment.count({ where: ownerFilter }),

    prisma.pricingExperiment.groupBy({
      by: ["status"],
      where: ownerFilter,
      _count: true,
    }),

    prisma.pricingExperiment.groupBy({
      by: ["experiment_type"],
      where: ownerFilter,
      _count: true,
    }),

    // Get concluded experiments with results for avg lift calculation
    prisma.pricingExperiment.findMany({
      where: { ...ownerFilter, status: "concluded", result_summary: { not: Prisma.JsonNull } },
      select: { result_summary: true },
    }),
  ]);

  const statusCounts = Object.fromEntries(
    byStatus.map(s => [s.status, s._count])
  );

  const typeCounts = Object.fromEntries(
    byType.map(t => [t.experiment_type, t._count])
  );

  // Calculate average composite lift from concluded experiments
  let avgLift = 0;
  if (concludedExperiments.length > 0) {
    const lifts = concludedExperiments
      .map(e => {
        const result = e.result_summary as Record<string, unknown> | null;
        const lift = result?.lift as Record<string, number> | undefined;
        return lift?.composite ?? 0;
      })
      .filter(l => l !== 0);

    if (lifts.length > 0) {
      avgLift = Math.round(lifts.reduce((a, b) => a + b, 0) / lifts.length * 100) / 100;
    }
  }

  return NextResponse.json({
    ok: true,
    stats: {
      total,
      avg_lift_pct: avgLift,
      by_status: {
        draft: statusCounts.draft ?? 0,
        active: statusCounts.active ?? 0,
        concluded: statusCounts.concluded ?? 0,
        archived: statusCounts.archived ?? 0,
      },
      by_type: typeCounts,
    },
  });
}
