// /api/crm/activity — Unified activity timeline per lead
// GET ?lead_id=123 — all activity for a lead
import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const leadId = req.nextUrl.searchParams.get("lead_id");
  if (!leadId) {
    return NextResponse.json({ error: "lead_id required" }, { status: 400 });
  }

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 50, 200);

  const activities = await prisma.activityLog.findMany({
    where: { lead_id: BigInt(leadId) },
    orderBy: { created_at: "desc" },
    take: limit,
  });

  return NextResponse.json({
    lead_id: leadId,
    count: activities.length,
    activities: activities.map((a) => ({
      id: a.id.toString(),
      type: a.activity_type,
      title: a.title,
      detail: a.detail,
      actor_type: a.actor_type,
      created_at: a.created_at,
      metadata: a.metadata,
    })),
  });
}
