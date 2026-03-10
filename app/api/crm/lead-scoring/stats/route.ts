// /api/crm/lead-scoring/stats — GET: aggregate lead scoring stats
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const leadFilter: Record<string, unknown> = {};
  if (auth.role !== "BROKER") {
    leadFilter.lead = { agent_id: auth.userId };
  }

  const [totalScored, avgScore, byGrade, topLeads] = await Promise.all([
    prisma.leadScore.count({ where: leadFilter }),
    prisma.leadScore.aggregate({ where: leadFilter, _avg: { score: true } }),
    prisma.leadScore.groupBy({ by: ["grade"], where: leadFilter, _count: { grade: true } }),
    prisma.leadScore.findMany({
      where: leadFilter,
      orderBy: { score: "desc" },
      take: 10,
      include: { lead: { select: { id: true, first_name: true, last_name: true, email: true } } },
    }),
  ]);

  const gradeCounts: Record<string, number> = {};
  for (const g of byGrade) gradeCounts[g.grade] = g._count.grade;

  return NextResponse.json({
    ok: true,
    stats: {
      total_scored: totalScored,
      avg_score: Math.round(avgScore._avg.score ?? 0),
      grade_counts: gradeCounts,
      top_leads: topLeads.map(l => ({
        ...l, id: l.id.toString(), lead_id: l.lead_id.toString(),
        lead: l.lead ? { ...l.lead, id: l.lead.id.toString() } : null,
      })),
    },
  });
}
