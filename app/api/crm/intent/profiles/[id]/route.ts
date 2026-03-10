// /api/crm/intent/profiles/[id]
// GET: Intent profile detail. POST: Recompute profile.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { computeIntentProfile } from "@/lib/buyer-intent/profiler";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const leadId = BigInt(id);

  const profile = await prisma.buyerIntentProfile.findUnique({
    where: { lead_id: leadId },
    include: {
      lead: {
        select: { id: true, first_name: true, last_name: true, email: true, phone: true, agent_id: true },
      },
    },
  });

  if (!profile) {
    return NextResponse.json({ ok: false, error: "Intent profile not found" }, { status: 404 });
  }

  // Ownership check
  if (auth.role !== "BROKER" && profile.lead?.agent_id !== auth.userId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  // Recent events
  const events = await prisma.intentEvent.findMany({
    where: { lead_id: leadId },
    orderBy: { recorded_at: "desc" },
    take: 50,
  });

  return NextResponse.json({
    ok: true,
    item: {
      ...profile,
      id: profile.id.toString(),
      lead_id: profile.lead_id.toString(),
      lead: profile.lead ? { ...profile.lead, id: profile.lead.id.toString(), agent_id: profile.lead.agent_id?.toString() ?? null } : null,
    },
    events: events.map(e => ({
      ...e,
      id: e.id.toString(),
      lead_id: e.lead_id.toString(),
    })),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const writeBlock = assertWriteAllowed();
  if (writeBlock) return writeBlock;

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

  const result = await computeIntentProfile(leadId);
  await logAuditEvent("recompute", "intent_profile", id, auth);

  return NextResponse.json({
    ok: true,
    item: {
      ...result,
      lead_id: result.lead_id.toString(),
    },
  });
}
