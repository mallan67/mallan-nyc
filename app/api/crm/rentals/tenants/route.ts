// /api/crm/rentals/tenants — GET: current tenants with lease data
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const now = new Date();

  const where: Record<string, unknown> = {
    roles: { has: "renter" },
    status: "active",
    lease_end_date: { gte: now }, // Active lease hasn't expired
  };

  if (auth.role !== "BROKER") {
    where.agent_id = auth.userId;
  }

  const tenants = await prisma.lead.findMany({
    where,
    orderBy: { lease_end_date: "asc" }, // Soonest expiring first
    take: 200,
  });

  const enriched = tenants.map((t) => ({
    ...t,
    id: String(t.id),
    agent_id: t.agent_id ? String(t.agent_id) : null,
    name: `${t.first_name} ${t.last_name}`.trim(),
  }));

  return NextResponse.json({ tenants: enriched });
}
