// /api/crm/leads/[id]
//
// PATCH — assign lead to agent + notify agent (broker only)
//         also updates status, pipeline_stage, priority, notes
//
// When a lead self-registers on mallan.nyc the broker sees them in
// the Unassigned Leads panel and distributes via this endpoint.
// The assigned agent receives an in-app notification immediately.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const leadId = BigInt(id);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true, first_name: true, last_name: true, email: true,
      phone: true, roles: true, portal_role: true, agent_id: true,
      source: true, notes: true,
    },
  });
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  // Agent assignment
  const newAgentId = body.assigned_agent_id !== undefined
    ? (body.assigned_agent_id ? BigInt(body.assigned_agent_id as string) : null)
    : undefined;
  if (newAgentId !== undefined) data.agent_id = newAgentId;

  // Status + stage
  if (body.status) data.status = body.status;
  if (body.pipeline_stage) data.pipeline_stage = body.pipeline_stage;

  // Priority note from broker
  if (body.broker_note !== undefined) {
    const existingNotes = lead.notes || '';
    const notePrefix = `[Broker note ${new Date().toLocaleDateString()}]: ${body.broker_note}`;
    data.notes = existingNotes ? notePrefix + '\n\n' + existingNotes : notePrefix;
  }

  const updated = await prisma.lead.update({
    where: { id: leadId },
    data,
  });

  // Notify assigned agent (if a new agent was assigned)
  if (newAgentId && newAgentId !== lead.agent_id) {
    const agent = await prisma.agent.findUnique({
      where: { id: newAgentId },
      select: { id: true, first_name: true, last_name: true },
    });

    if (agent) {
      const roleLabel = (lead.portal_role || lead.roles[0] || 'client');
      const roleDisplay = roleLabel === 'tenant' ? 'Renter'
        : roleLabel.charAt(0).toUpperCase() + roleLabel.slice(1);

      await prisma.notification.create({
        data: {
          recipient_type: 'agent',
          recipient_id: newAgentId,
          channel: 'in_app',
          type: 'lead_assigned',
          title: `New Lead Assigned — ${lead.first_name} ${lead.last_name}`,
          body: `You have been assigned a new ${roleDisplay} lead from ${lead.source || 'website'}. Please reach out within 24 hours.`,
          data: {
            lead_id: lead.id.toString(),
            lead_name: `${lead.first_name} ${lead.last_name}`,
            lead_email: lead.email,
            lead_phone: lead.phone,
            role: roleDisplay,
            source: lead.source,
            broker_note: body.broker_note || null,
          },
          status: 'pending',
        },
      });
    }
  }

  await logAuditEvent("update", "lead", id, auth, {
    assigned_agent_id: body.assigned_agent_id || null,
    previous_agent_id: lead.agent_id?.toString() || null,
    status: body.status || undefined,
  }, req.headers.get("x-forwarded-for") ?? undefined);

  return NextResponse.json({
    ok: true,
    lead: {
      id: updated.id.toString(),
      agent_id: updated.agent_id?.toString() ?? null,
      status: updated.status,
    },
  });
}
