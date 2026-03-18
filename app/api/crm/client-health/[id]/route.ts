// GET /api/crm/client-health/[id] — compute and return client health score
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import { computeClientHealth } from "@/lib/client-health/compute";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const leadId = safeBigInt(id);
  if (!leadId) {
    return NextResponse.json({ error: "Invalid client ID" }, { status: 400 });
  }

  // Ownership check
  if (auth.role !== "BROKER") {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { agent_id: true },
    });
    if (!lead || lead.agent_id !== auth.userId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
  }

  const health = await computeClientHealth(leadId);
  return NextResponse.json({ clientId: id, ...health });
}
