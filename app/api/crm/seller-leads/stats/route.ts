// /api/crm/seller-leads/stats
// GET: KPI dashboard stats for seller readiness pipeline
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const agentFilter = auth.role !== "BROKER"
    ? { assigned_agent_id: auth.userId }
    : {};

  const [
    totalLeads,
    byStatus,
    byGrade,
    recentOutreach,
    avgScore,
  ] = await Promise.all([
    // Total leads
    prisma.sellerLead.count({ where: agentFilter }),

    // By status
    prisma.sellerLead.groupBy({
      by: ["status"],
      where: agentFilter,
      _count: true,
    }),

    // By grade
    prisma.sellerLead.groupBy({
      by: ["score_grade"],
      where: agentFilter,
      _count: true,
    }),

    // Outreach events in last 30 days
    prisma.outreachEvent.count({
      where: {
        created_at: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        ...(auth.role !== "BROKER" ? { agent_id: auth.userId } : {}),
      },
    }),

    // Average score
    prisma.sellerLead.aggregate({
      where: agentFilter,
      _avg: { readiness_score: true },
    }),
  ]);

  // Conversion funnel
  const statusCounts = Object.fromEntries(
    byStatus.map(s => [s.status, s._count])
  );

  const gradeCounts = Object.fromEntries(
    byGrade.map(g => [g.score_grade, g._count])
  );

  return NextResponse.json({
    ok: true,
    stats: {
      total_leads: totalLeads,
      avg_score: Math.round(avgScore._avg.readiness_score ?? 0),
      outreach_30d: recentOutreach,
      by_status: {
        new: statusCounts.new ?? 0,
        contacted: statusCounts.contacted ?? 0,
        replied: statusCounts.replied ?? 0,
        meeting: statusCounts.meeting ?? 0,
        signed: statusCounts.signed ?? 0,
        declined: statusCounts.declined ?? 0,
      },
      by_grade: {
        A: gradeCounts.A ?? 0,
        B: gradeCounts.B ?? 0,
        C: gradeCounts.C ?? 0,
        D: gradeCounts.D ?? 0,
        F: gradeCounts.F ?? 0,
      },
    },
  });
}
