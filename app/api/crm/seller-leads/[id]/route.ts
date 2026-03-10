// /api/crm/seller-leads/[id]
// GET: Single lead detail with signals. PATCH: Update lead fields.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import type { LeadStatus } from "@/lib/seller-readiness/types";
import { LEAD_STATUSES } from "@/lib/seller-readiness/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const leadId = BigInt(id);

  const lead = await prisma.sellerLead.findUnique({
    where: { id: leadId },
    include: {
      assigned_agent: {
        select: { id: true, full_name: true, email: true },
      },
      signals: {
        orderBy: { collected_at: "desc" },
        take: 50,
      },
      outreach_events: {
        orderBy: { created_at: "desc" },
        take: 20,
      },
    },
  });

  if (!lead) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  // Ownership check: agent can only see their own assigned leads
  if (auth.role !== "BROKER" && lead.assigned_agent_id !== auth.userId) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    item: {
      ...lead,
      id: lead.id.toString(),
      assigned_agent_id: lead.assigned_agent_id?.toString() ?? null,
      assigned_agent: lead.assigned_agent
        ? { ...lead.assigned_agent, id: lead.assigned_agent.id.toString() }
        : null,
      signals: lead.signals.map(s => ({
        ...s,
        id: s.id.toString(),
        seller_lead_id: s.seller_lead_id.toString(),
      })),
      outreach_events: lead.outreach_events.map(e => ({
        ...e,
        id: e.id.toString(),
        seller_lead_id: e.seller_lead_id.toString(),
      })),
    },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const writeBlock = assertWriteAllowed();
  if (writeBlock) return writeBlock;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const leadId = BigInt(id);

  const lead = await prisma.sellerLead.findUnique({ where: { id: leadId } });
  if (!lead) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  // Ownership check
  if (auth.role !== "BROKER" && lead.assigned_agent_id !== auth.userId) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const allowedFields = [
    "status", "owner_name", "owner_email", "owner_phone",
    "notes", "assigned_agent_id", "consent_given", "consent_method",
    "borough", "neighborhood", "postal_code", "bbl", "bin",
  ];

  const data: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) {
      data[field] = body[field];
    }
  }

  // Validate status
  if (data.status && !LEAD_STATUSES.includes(data.status as LeadStatus)) {
    return NextResponse.json(
      { ok: false, error: `Invalid status. Must be one of: ${LEAD_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  // Consent tracking
  if (data.consent_given === true && !lead.consent_given) {
    data.consent_date = new Date();
  }

  // Agent assignment (broker only)
  if ("assigned_agent_id" in data) {
    if (auth.role !== "BROKER") {
      return NextResponse.json({ ok: false, error: "Only broker can reassign leads" }, { status: 403 });
    }
    if (data.assigned_agent_id) {
      data.assigned_agent_id = BigInt(data.assigned_agent_id as string);
    }
  }

  const updated = await prisma.sellerLead.update({
    where: { id: leadId },
    data,
  });

  await logAuditEvent("update", "seller_lead", id, auth, data);

  return NextResponse.json({
    ok: true,
    item: { ...updated, id: updated.id.toString(), assigned_agent_id: updated.assigned_agent_id?.toString() ?? null },
  });
}
