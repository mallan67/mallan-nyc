// /api/crm/leads/[id]
//
// PATCH - broker lead assignment and status updates.
//
// Self-registered mallan.nyc leads enter the broker distribution queue.
// Assigning from this endpoint also hands off related portal work to the
// assigned agent so the CRM opens with the client history intact.

import { NextRequest, NextResponse } from "next/server";
import { requireBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { assignLeadToAgent } from "@/lib/lead-distribution/assign";
import { safeBigInt } from "@/lib/utils/safe-bigint";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const leadId = safeBigInt(id);
  if (!leadId) {
    return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const newAgentId = body.assigned_agent_id !== undefined
    ? (body.assigned_agent_id ? safeBigInt(String(body.assigned_agent_id)) : null)
    : undefined;

  if (body.assigned_agent_id !== undefined && body.assigned_agent_id && !newAgentId) {
    return NextResponse.json({ error: "Invalid assigned_agent_id" }, { status: 400 });
  }

  if (newAgentId === undefined && !body.status && !body.pipeline_stage && body.broker_note === undefined) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  try {
    const assignment = await assignLeadToAgent({
      leadId,
      agentId: newAgentId,
      assignedById: auth.userId,
      assignedByRole: auth.role,
      brokerNote: typeof body.broker_note === "string" ? body.broker_note : null,
      status: body.status ? String(body.status) : null,
      pipelineStage: body.pipeline_stage ? String(body.pipeline_stage) : null,
      notify: true,
    });

    await logAuditEvent("update", "lead", id, auth, {
      assigned_agent_id: assignment.assigned_agent_id?.toString() ?? null,
      previous_agent_id: assignment.previous_agent_id?.toString() ?? null,
      status: body.status || undefined,
      inherited: assignment.inherited,
    }, req.headers.get("x-forwarded-for") ?? undefined);

    return NextResponse.json({
      lead: {
        id: assignment.lead_id.toString(),
        agent_id: assignment.assigned_agent_id?.toString() ?? null,
        status: assignment.status,
        pipeline_stage: assignment.pipeline_stage,
        inherited: assignment.inherited,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to assign lead" },
      { status: 400 }
    );
  }
}
