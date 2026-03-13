// /api/crm/seller-leads/[id]/outreach
// GET: List outreach events. POST: Log a new outreach event.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { OUTREACH_CHANNELS } from "@/lib/seller-readiness/types";
import type { OutreachChannel } from "@/lib/seller-readiness/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const leadId = BigInt(id);

  // Verify lead exists and agent has access
  const lead = await prisma.sellerLead.findUnique({ where: { id: leadId } });
  if (!lead) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (auth.role !== "BROKER" && lead.assigned_agent_id !== auth.userId) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const events = await prisma.outreachEvent.findMany({
    where: { seller_lead_id: leadId },
    orderBy: { created_at: "desc" },
    take: 50,
  });

  return NextResponse.json({
    ok: true,
    items: events.map(e => ({
      ...e,
      id: e.id.toString(),
      seller_lead_id: e.seller_lead_id.toString(),
      agent_id: e.agent_id.toString(),
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

  // Verify lead exists and agent has access
  const lead = await prisma.sellerLead.findUnique({ where: { id: leadId } });
  if (!lead) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (auth.role !== "BROKER" && lead.assigned_agent_id !== auth.userId) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const { channel, direction, template_id, subject, body_preview, outcome, consent_verified } = body as { channel?: string; direction?: string; template_id?: string; subject?: string; body_preview?: string; outcome?: string; consent_verified?: boolean };

  // Validate channel
  if (!channel || !OUTREACH_CHANNELS.includes(channel as OutreachChannel)) {
    return NextResponse.json(
      { ok: false, error: `channel required. Must be one of: ${OUTREACH_CHANNELS.join(", ")}` },
      { status: 400 }
    );
  }

  // TCPA: phone/email outreach requires consent verification
  if ((channel === "phone" || channel === "email") && !consent_verified && !lead.consent_given) {
    return NextResponse.json(
      { ok: false, error: "TCPA: consent must be verified before phone/email outreach" },
      { status: 400 }
    );
  }

  const event = await prisma.outreachEvent.create({
    data: {
      seller_lead_id: leadId,
      channel,
      direction: direction || "outbound",
      template_id: template_id || undefined,
      subject: subject || undefined,
      body_preview: typeof body_preview === "string" ? body_preview.slice(0, 500) : undefined,
      outcome: outcome || "sent",
      consent_verified: consent_verified || false,
      agent_id: auth.userId,
    },
  });

  // Auto-update lead status if first outreach
  if (lead.status === "new") {
    await prisma.sellerLead.update({
      where: { id: leadId },
      data: { status: "contacted" },
    });
  }

  await logAuditEvent("create", "outreach_event", event.id.toString(), auth);

  return NextResponse.json({
    ok: true,
    item: {
      ...event,
      id: event.id.toString(),
      seller_lead_id: event.seller_lead_id.toString(),
      agent_id: event.agent_id.toString(),
    },
  }, { status: 201 });
}
