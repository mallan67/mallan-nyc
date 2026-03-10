// /api/crm/intent/stats
// GET: Aggregate buyer intent stats for dashboard
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  // Scope to agent's leads (unless broker)
  const leadFilter: Record<string, unknown> = {};
  if (auth.role !== "BROKER") {
    leadFilter.lead = { agent_id: auth.userId };
  }

  const [
    totalProfiles,
    avgStrength,
    byStage,
    recentEvents,
    readyLeads,
  ] = await Promise.all([
    prisma.buyerIntentProfile.count({ where: leadFilter }),
    prisma.buyerIntentProfile.aggregate({
      where: leadFilter,
      _avg: { intent_strength: true },
    }),
    prisma.buyerIntentProfile.groupBy({
      by: ["intent_stage"],
      where: leadFilter,
      _count: { intent_stage: true },
    }),
    prisma.intentEvent.count({
      where: {
        recorded_at: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        ...(auth.role !== "BROKER" ? { lead: { agent_id: auth.userId } } : {}),
      },
    }),
    prisma.buyerIntentProfile.findMany({
      where: { ...leadFilter, intent_stage: "ready" },
      include: {
        lead: { select: { id: true, first_name: true, last_name: true, email: true } },
      },
      orderBy: { intent_strength: "desc" },
      take: 10,
    }),
  ]);

  const stageCounts: Record<string, number> = {};
  for (const s of byStage) {
    stageCounts[s.intent_stage] = s._count.intent_stage;
  }

  return NextResponse.json({
    ok: true,
    stats: {
      total_profiles: totalProfiles,
      avg_strength: Math.round(avgStrength._avg.intent_strength ?? 0),
      stage_counts: stageCounts,
      events_7d: recentEvents,
      ready_leads: readyLeads.map(r => ({
        ...r,
        id: r.id.toString(),
        lead_id: r.lead_id.toString(),
        lead: r.lead ? { ...r.lead, id: r.lead.id.toString() } : null,
      })),
    },
  });
}
