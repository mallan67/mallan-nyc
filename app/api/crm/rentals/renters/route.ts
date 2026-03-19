// /api/crm/rentals/renters — GET: renters filtered by phase (prospect/active)
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const phase = req.nextUrl.searchParams.get("phase");

  const where: Record<string, unknown> = {
    roles: { has: "renter" },
    status: { in: ["active", "contacted", "new"] },
  };

  if (phase === "prospect") {
    where.pipeline_stage = { in: ["new", "contacted", "nurturing", "prospect"] };
  } else if (phase === "active") {
    where.pipeline_stage = { in: ["active", "active_renter", "showing"] };
  }

  if (auth.role !== "BROKER") {
    where.agent_id = auth.userId;
  }

  const renters = await prisma.lead.findMany({
    where,
    orderBy: { updated_at: "desc" },
    take: 200,
    include: {
      showings: { select: { id: true } },
      lead_score: { select: { score: true } },
    },
  });

  const enriched = renters.map((r) => ({
    ...r,
    id: String(r.id),
    agent_id: r.agent_id ? String(r.agent_id) : null,
    name: `${r.first_name} ${r.last_name}`.trim(),
    showings_count: r.showings.length,
    conviction_score: r.lead_score?.score || 0,
  }));

  return NextResponse.json({ renters: enriched });
}
