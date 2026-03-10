// /api/crm/intent/recommendations/[id]
// GET: Get personalized listing recommendations for a lead
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { getRecommendations } from "@/lib/buyer-intent/recommender";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const leadId = BigInt(id);

  // Ownership check
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { agent_id: true },
  });

  if (!lead) {
    return NextResponse.json({ ok: false, error: "Lead not found" }, { status: 404 });
  }
  if (auth.role !== "BROKER" && lead.agent_id !== auth.userId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

  const recommendations = await getRecommendations(leadId, limit);

  return NextResponse.json({ ok: true, items: recommendations });
}
