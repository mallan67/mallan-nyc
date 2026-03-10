// /api/crm/performance
// GET: List agent performance indices (broker sees all, agent sees anonymized)
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = req.nextUrl;
  const tier = searchParams.get("tier");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
  const offset = parseInt(searchParams.get("offset") || "0");

  const where: Record<string, unknown> = {};
  if (tier) where.tier = tier;

  const [indices, total] = await Promise.all([
    prisma.agentPerformanceIndex.findMany({
      where,
      orderBy: { index_score: "desc" },
      take: limit,
      skip: offset,
      include: {
        agent: {
          select: { id: true, full_name: true, email: true },
        },
      },
    }),
    prisma.agentPerformanceIndex.count({ where }),
  ]);

  const isBroker = auth.role === "BROKER";

  const serialized = indices.map((p, i) => ({
    id: p.id.toString(),
    agent_id: p.agent_id.toString(),
    agent_name: isBroker ? p.agent.full_name : (p.agent_id === auth.userId ? p.agent.full_name : `Agent #${offset + i + 1}`),
    is_self: p.agent_id === auth.userId,
    index_score: p.index_score,
    rank: p.rank,
    tier: p.tier,
    components: p.components,
    months_included: p.months_included,
    last_computed: p.last_computed,
  }));

  return NextResponse.json({ ok: true, total, items: serialized });
}
