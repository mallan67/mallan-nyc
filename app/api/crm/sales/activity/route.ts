// /api/crm/sales/activity — GET: sales activity feed (filterable)
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || "100"), 200);

  // Get all sales-related leads (sellers + buyers)
  const leadWhere: Record<string, unknown> = {
    roles: { hasSome: ["seller", "buyer"] },
  };

  if (auth.role !== "BROKER") {
    leadWhere.agent_id = auth.userId;
  }

  const leads = await prisma.lead.findMany({
    where: leadWhere,
    select: { id: true, first_name: true, last_name: true, roles: true },
  });

  const leadIds = leads.map((l) => l.id);
  const leadMap = new Map(leads.map((l) => [String(l.id), { name: `${l.first_name} ${l.last_name}`.trim(), roles: l.roles }]));

  if (leadIds.length === 0) {
    return NextResponse.json({ events: [] });
  }

  const events = await prisma.activityLog.findMany({
    where: { lead_id: { in: leadIds } },
    orderBy: { created_at: "desc" },
    take: limit,
  });

  const enriched = events.map((e) => {
    const lead = leadMap.get(String(e.lead_id));
    const clientType = lead?.roles?.includes("seller") ? "sellers"
      : lead?.roles?.includes("buyer") ? "buyers"
      : "all";
    return {
      ...e,
      id: String(e.id),
      lead_id: String(e.lead_id),
      client_name: lead?.name || "Unknown",
      client_type: clientType,
    };
  });

  return NextResponse.json({ events: enriched });
}
