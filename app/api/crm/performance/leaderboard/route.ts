// /api/crm/performance/leaderboard
// GET: Ranked leaderboard — broker sees names, agents see anonymized
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = req.nextUrl;
  const tier = searchParams.get("tier");
  const limit = Math.min(parseInt(searchParams.get("limit") || "25"), 100);

  const where: Record<string, unknown> = {};
  if (tier) where.tier = tier;

  const entries = await prisma.agentPerformanceIndex.findMany({
    where,
    orderBy: { rank: "asc" },
    take: limit,
    include: {
      agent: {
        select: { id: true, full_name: true },
      },
    },
  });

  const isBroker = auth.role === "BROKER";

  const leaderboard = entries.map(e => ({
    rank: e.rank,
    agent_id: e.agent_id.toString(),
    agent_name: isBroker ? e.agent.full_name : (e.agent_id === auth.userId ? e.agent.full_name : null),
    is_self: e.agent_id === auth.userId,
    index_score: e.index_score,
    tier: e.tier,
    components: e.components,
  }));

  return NextResponse.json({ ok: true, items: leaderboard });
}
