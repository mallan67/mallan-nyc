// /api/crm/rentals/prospects — GET: viewed/did-not-rent with showing history
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  // Prospects are renters who are in past/closed status or have showing history but no active lease
  const where: Record<string, unknown> = {
    roles: { has: "renter" },
    OR: [
      { status: { in: ["past", "closed"] } },
      { pipeline_stage: { in: ["past", "closed"] } },
    ],
    // Exclude those with active leases (they're current tenants)
    lease_end_date: { lt: new Date() },
  };

  if (auth.role !== "BROKER") {
    where.agent_id = auth.userId;
  }

  // Also include renters with showing history but no lease
  const prospects = await prisma.lead.findMany({
    where: {
      roles: { has: "renter" },
      agent_id: auth.role !== "BROKER" ? auth.userId : undefined,
      OR: [
        { status: { in: ["past", "closed"] } },
        { pipeline_stage: { in: ["past", "closed"] } },
        { lease_end_date: { lt: new Date() } },
        { AND: [{ lease_end_date: null }, { status: { not: "active" } }] },
      ],
    },
    orderBy: { updated_at: "desc" },
    take: 200,
    include: {
      showing_history: {
        orderBy: { showing_date: "desc" },
        take: 1,
      },
    },
  });

  const enriched = prospects.map((p) => {
    const lastShowing = p.showing_history[0];
    return {
      ...p,
      id: String(p.id),
      agent_id: p.agent_id ? String(p.agent_id) : null,
      name: `${p.first_name} ${p.last_name}`.trim(),
      last_viewed_address: lastShowing?.address || "",
      last_viewed_date: lastShowing?.showing_date || null,
    };
  });

  return NextResponse.json({ prospects: enriched });
}
