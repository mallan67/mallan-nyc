// /api/crm/demand/stats
// GET: Aggregate demand stats for dashboard
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const [totalNeighborhoods, avgScore, byTrend, topNeighborhoods, recentSignals] =
    await Promise.all([
      prisma.demandIndex.count(),
      prisma.demandIndex.aggregate({ _avg: { score: true } }),
      prisma.demandIndex.groupBy({
        by: ["trend"],
        _count: { trend: true },
      }),
      prisma.demandIndex.findMany({
        orderBy: { score: "desc" },
        take: 10,
        select: { neighborhood: true, borough: true, score: true, trend: true },
      }),
      prisma.demandSignal.count({
        where: {
          collected_at: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

  const trendCounts: Record<string, number> = {};
  for (const t of byTrend) {
    trendCounts[t.trend] = t._count.trend;
  }

  return NextResponse.json({
    ok: true,
    stats: {
      total_neighborhoods: totalNeighborhoods,
      avg_score: Math.round(avgScore._avg.score ?? 0),
      trend_counts: trendCounts,
      top_neighborhoods: topNeighborhoods,
      signals_7d: recentSignals,
    },
  });
}
