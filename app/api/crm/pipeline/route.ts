// /api/crm/pipeline — Agent pipeline view
// GET: Returns leads grouped by pipeline_stage with counts
import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import prisma from "@/lib/prisma";

const STAGES = ["new", "contacted", "nurturing", "active", "showing", "offer", "deal", "closed", "past"];

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const where: Record<string, unknown> = {};
  if (auth.role !== "BROKER") where.agent_id = auth.userId;

  const leads = await prisma.lead.findMany({
    where,
    select: {
      id: true,
      first_name: true,
      last_name: true,
      email: true,
      phone: true,
      portal_role: true,
      pipeline_stage: true,
      status: true,
      source: true,
      next_follow_up: true,
      last_contacted_at: true,
      lease_end_date: true,
      pre_approved: true,
      annual_income: true,
      credit_score_range: true,
      created_at: true,
      updated_at: true,
      lead_score: { select: { score: true, grade: true } },
    },
    orderBy: { updated_at: "desc" },
  });

  const pipeline = STAGES.map((stage) => {
    const stageLeads = leads.filter((l) => (l.pipeline_stage || "new") === stage);
    return {
      stage,
      count: stageLeads.length,
      leads: stageLeads.map((l) => ({
        id: l.id.toString(),
        name: `${l.first_name} ${l.last_name}`,
        email: l.email,
        phone: l.phone,
        role: l.portal_role,
        source: l.source,
        score: l.lead_score?.score ?? null,
        grade: l.lead_score?.grade ?? null,
        next_follow_up: l.next_follow_up,
        last_contacted: l.last_contacted_at,
        lease_end: l.lease_end_date,
        pre_approved: l.pre_approved,
        income: l.annual_income ? Number(l.annual_income) : null,
        credit: l.credit_score_range,
        created_at: l.created_at,
      })),
    };
  });

  const total = leads.length;
  const conversionRate = total > 0
    ? Math.round((leads.filter((l) => l.pipeline_stage === "deal" || l.pipeline_stage === "closed").length / total) * 100)
    : 0;

  return NextResponse.json({
    pipeline,
    stats: {
      total,
      active: leads.filter((l) => !["closed", "past"].includes(l.pipeline_stage || "new")).length,
      conversion_rate: conversionRate,
    },
  });
}
