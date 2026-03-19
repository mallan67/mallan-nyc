// /api/crm/sales/landlord-sellers — GET: landlords with seller_potential != none
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const where: Record<string, unknown> = {
    roles: { has: "landlord" },
    seller_potential: { not: "none" },
  };

  if (auth.role !== "BROKER") {
    where.agent_id = auth.userId;
  }

  const landlordSellers = await prisma.lead.findMany({
    where,
    orderBy: { updated_at: "desc" },
    take: 200,
  });

  const enriched = landlordSellers.map((l) => ({
    ...l,
    id: String(l.id),
    agent_id: l.agent_id ? String(l.agent_id) : null,
    name: `${l.first_name} ${l.last_name}`.trim(),
  }));

  return NextResponse.json({ landlordSellers: enriched });
}
