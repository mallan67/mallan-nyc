// /api/crm/performance/stats
// GET: Aggregate performance stats (broker-only dashboard)
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  const [totalAgents, avgScore, byTier, topAgents] = await Promise.all([
    prisma.agentPerformanceIndex.count(),
    prisma.agentPerformanceIndex.aggregate({ _avg: { index_score: true } }),
    prisma.agentPerformanceIndex.groupBy({
      by: ["tier"],
      _count: { tier: true },
    }),
    prisma.agentPerformanceIndex.findMany({
      orderBy: { index_score: "desc" },
      take: 5,
      include: {
        agent: { select: { id: true, full_name: true } },
      },
    }),
  ]);

  const tierCounts: Record<string, number> = {};
  for (const t of byTier) {
    tierCounts[t.tier] = t._count.tier;
  }

  return NextResponse.json({
    ok: true,
    stats: {
      total_agents: totalAgents,
      avg_score: Math.round(avgScore._avg.index_score ?? 0),
      tier_counts: tierCounts,
      top_agents: topAgents.map(a => ({
        agent_id: a.agent_id.toString(),
        agent_name: a.agent.full_name,
        index_score: a.index_score,
        tier: a.tier,
        rank: a.rank,
      })),
    },
  });
}
