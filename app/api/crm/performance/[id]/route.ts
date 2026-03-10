// /api/crm/performance/[id]
// GET: Agent performance detail with monthly metrics
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const agentId = BigInt(id);

  // Agent can only see their own detail
  if (auth.role !== "BROKER" && agentId !== auth.userId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const index = await prisma.agentPerformanceIndex.findUnique({
    where: { agent_id: agentId },
    include: {
      agent: {
        select: { id: true, full_name: true, email: true },
      },
    },
  });

  if (!index) {
    return NextResponse.json({ ok: false, error: "Performance index not found" }, { status: 404 });
  }

  // Get monthly metrics (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const monthlyMetrics = await prisma.agentMetrics.findMany({
    where: {
      agent_id: agentId,
      month: { gte: sixMonthsAgo },
    },
    orderBy: { month: "desc" },
  });

  return NextResponse.json({
    ok: true,
    item: {
      ...index,
      id: index.id.toString(),
      agent_id: index.agent_id.toString(),
      agent: { ...index.agent, id: index.agent.id.toString() },
    },
    monthly_metrics: monthlyMetrics.map(m => ({
      ...m,
      id: m.id.toString(),
      agent_id: m.agent_id.toString(),
    })),
  });
}
