// /api/crm/leads — GET: list leads with assignment filtering.
// This is the same Lead model the clients endpoint uses, but with
// filters the Broker Dashboard needs: unassigned leads, by source, etc.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = req.nextUrl;
  const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);
  const offset = parseInt(searchParams.get("offset") || "0");
  const unassigned = searchParams.get("unassigned");
  const source = searchParams.get("source");
  const status = searchParams.get("status");

  const where: Record<string, unknown> = {};

  // Lead Distribution = only unassigned leads (no agent_id)
  // Assigned leads are clients — they show in My Clients, not here
  if (auth.role !== "BROKER") {
    where.agent_id = auth.userId;
  } else {
    // Broker: default to unassigned only (Lead Distribution purpose)
    // Pass ?all=true to see everything (for broker dashboard stats)
    if (searchParams.get("all") !== "true") {
      where.agent_id = null;
    }
  }

  // Legacy unassigned filter
  if (unassigned === "true") {
    where.agent_id = null;
  }

  if (source) where.source = source;
  if (status) where.status = status;

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        phone: true,
        source: true,
        status: true,
        pipeline_stage: true,
        portal_role: true,
        roles: true,
        agent_id: true,
        created_at: true,
        updated_at: true,
      },
    }),
    prisma.lead.count({ where }),
  ]);

  const serialized = leads.map((l) => ({
    id: l.id.toString(),
    first_name: l.first_name,
    last_name: l.last_name,
    name: `${l.first_name || ""} ${l.last_name || ""}`.trim() || null,
    email: l.email,
    phone: l.phone,
    source: l.source,
    status: l.status,
    pipeline_stage: l.pipeline_stage,
    portal_role: l.portal_role,
    roles: l.roles,
    assignedAgentId: l.agent_id?.toString() ?? null,
    assigned_agent_id: l.agent_id?.toString() ?? null,
    created_at: l.created_at,
    updated_at: l.updated_at,
  }));

  return NextResponse.json({ leads: serialized, total, limit, offset });
}
