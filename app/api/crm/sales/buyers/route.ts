// /api/crm/sales/buyers — GET: active buyers + investors with behavioral data
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const where: Record<string, unknown> = {
    roles: { has: "buyer" },
    status: { in: ["active", "contacted", "new"] },
  };

  if (auth.role !== "BROKER") {
    where.agent_id = auth.userId;
  }

  const buyers = await prisma.lead.findMany({
    where,
    orderBy: { updated_at: "desc" },
    take: 200,
    include: {
      lead_score: { select: { score: true } },
      actions: {
        orderBy: { created_at: "desc" },
        take: 5,
        select: { action: true, created_at: true, listing_id: true },
      },
    },
  });

  const enriched = buyers.map((b) => ({
    ...b,
    id: String(b.id),
    agent_id: b.agent_id ? String(b.agent_id) : null,
    name: `${b.first_name} ${b.last_name}`.trim(),
    conviction_score: b.lead_score?.score || 0,
  }));

  return NextResponse.json({ buyers: enriched });
}
