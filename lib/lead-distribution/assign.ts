import prisma from "@/lib/prisma";

type AssignLeadOptions = {
  leadId: bigint;
  agentId?: bigint | null;
  assignedById?: bigint | null;
  assignedByRole?: string | null;
  brokerNote?: string | null;
  status?: string | null;
  pipelineStage?: string | null;
  notify?: boolean;
};

function roleDisplay(lead: { portal_role: string | null; roles: string[] }) {
  const role = lead.portal_role || lead.roles[0] || "client";
  if (role === "tenant" || role === "renter") return "Renter";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function brokerNoteText(note: string | null | undefined, existingNotes: string | null) {
  const clean = note?.trim();
  if (!clean) return undefined;
  const prefix = `[Broker note ${new Date().toLocaleDateString("en-US")}]: ${clean}`;
  return existingNotes ? `${prefix}\n\n${existingNotes}` : prefix;
}

function actorType(role: string | null | undefined) {
  const normalized = role?.toLowerCase();
  if (normalized === "broker") return "broker";
  if (normalized === "system") return "system";
  return "agent";
}

export async function assignLeadToAgent(options: AssignLeadOptions) {
  const lead = await prisma.lead.findUnique({
    where: { id: options.leadId },
    select: {
      id: true,
      first_name: true,
      last_name: true,
      email: true,
      phone: true,
      roles: true,
      portal_role: true,
      agent_id: true,
      source: true,
      notes: true,
    },
  });

  if (!lead) {
    throw new Error("Lead not found");
  }

  let agent: { id: bigint; first_name: string; last_name: string; email: string; status: string } | null = null;
  if (options.agentId) {
    agent = await prisma.agent.findUnique({
      where: { id: options.agentId },
      select: { id: true, first_name: true, last_name: true, email: true, status: true },
    });
    if (!agent) throw new Error("Agent not found");
    if (agent.status !== "active") throw new Error("Agent is not active");
  }

  const noteUpdate = brokerNoteText(options.brokerNote, lead.notes);
  const leadData: Record<string, unknown> = {};
  if ("agentId" in options) leadData.agent_id = options.agentId;
  if (options.status) leadData.status = options.status;
  if (options.pipelineStage) leadData.pipeline_stage = options.pipelineStage;
  if (noteUpdate !== undefined) leadData.notes = noteUpdate;

  const inherited = await prisma.$transaction(async (tx) => {
    const updated = await tx.lead.update({
      where: { id: lead.id },
      data: leadData,
      select: { id: true, agent_id: true, status: true, pipeline_stage: true },
    });

    const counts = {
      external_listings: 0,
      saved_searches: 0,
      active_leases: 0,
    };

    if (options.agentId) {
      const [externalListings, savedSearches, activeLeases] = await Promise.all([
        tx.externalListing.updateMany({
          where: { lead_id: lead.id, agent_id: null },
          data: { agent_id: options.agentId },
        }),
        tx.savedSearch.updateMany({
          where: { lead_id: lead.id, agent_id: null },
          data: { agent_id: options.agentId },
        }),
        tx.activeLease.updateMany({
          where: {
            agent_id: null,
            OR: [
              { landlord_lead_id: lead.id },
              { tenant_lead_id: lead.id },
            ],
          },
          data: { agent_id: options.agentId },
        }),
      ]);
      counts.external_listings = externalListings.count;
      counts.saved_searches = savedSearches.count;
      counts.active_leases = activeLeases.count;
    }

    await tx.activityLog.create({
      data: {
        lead_id: lead.id,
        activity_type: "lead_assigned",
        title: options.agentId ? "Lead assigned to agent" : "Lead unassigned",
        detail: options.agentId
          ? `Assigned to ${agent ? `${agent.first_name} ${agent.last_name}`.trim() : "agent"}.`
          : "Lead returned to broker distribution queue.",
        actor_type: actorType(options.assignedByRole),
        actor_id: options.assignedById ?? null,
        metadata: {
          previous_agent_id: lead.agent_id?.toString() ?? null,
          assigned_agent_id: options.agentId?.toString() ?? null,
          inherited: counts,
          broker_note: options.brokerNote ?? null,
        },
      },
    });

    if (options.notify !== false && options.agentId && options.agentId !== lead.agent_id && agent) {
      const display = roleDisplay(lead);
      await tx.notification.create({
        data: {
          recipient_type: "agent",
          recipient_id: options.agentId,
          channel: "in_app",
          type: "lead_assigned",
          title: `New Lead Assigned - ${lead.first_name} ${lead.last_name}`,
          body: `You have been assigned a new ${display} lead from ${lead.source || "website"}. Please review their portal history and reach out within 24 hours.`,
          data: {
            lead_id: lead.id.toString(),
            lead_name: `${lead.first_name} ${lead.last_name}`.trim(),
            lead_email: lead.email,
            lead_phone: lead.phone,
            role: display,
            source: lead.source,
            broker_note: options.brokerNote ?? null,
            inherited: counts,
          },
          status: "pending",
        },
      });
    }

    return { updated, counts };
  });

  return {
    lead_id: lead.id,
    previous_agent_id: lead.agent_id,
    assigned_agent_id: inherited.updated.agent_id,
    status: inherited.updated.status,
    pipeline_stage: inherited.updated.pipeline_stage,
    inherited: inherited.counts,
  };
}
