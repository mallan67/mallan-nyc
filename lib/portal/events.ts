import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

type PortalWorkspace = "buyer" | "seller" | "landlord" | "tenant";

interface RecordPortalEventInput {
  leadId: bigint;
  eventType: string;
  workspace?: string | null;
  listingId?: string | null;
  propertyId?: string | null;
  campaignId?: bigint | null;
  metadata?: Record<string, unknown>;
}

function normalizeWorkspace(role?: string | null): PortalWorkspace {
  if (role === "seller") return "seller";
  if (role === "landlord") return "landlord";
  if (role === "tenant") return "tenant";
  return "buyer";
}

export async function recordPortalEvent(input: RecordPortalEventInput): Promise<void> {
  try {
    let workspace = input.workspace;
    if (!workspace) {
      const lead = await prisma.lead.findUnique({
        where: { id: input.leadId },
        select: { primary_portal_role: true, portal_role: true, roles: true },
      });
      workspace =
        lead?.primary_portal_role ||
        lead?.portal_role ||
        lead?.roles?.[0] ||
        "buyer";
    }

    await prisma.portalEvent.create({
      data: {
        lead_id: input.leadId,
        workspace: normalizeWorkspace(workspace),
        event_type: input.eventType,
        listing_id: input.listingId || null,
        property_id: input.propertyId || null,
        campaign_id: input.campaignId || null,
        metadata: (input.metadata || {}) as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.warn("[portal/events] failed to record event:", err instanceof Error ? err.message : err);
  }
}
