// GET /api/crm/clients/[id]/rental-signals
// Agent/broker visibility into tenant and landlord portal workflow signals.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isAuthError, requireAgentOrBroker } from "@/lib/auth";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import {
  RENTAL_SIGNAL_EVENT_TYPES,
  summarizeLandlordSignals,
  summarizeTenantSignals,
} from "@/lib/rental-signals/summary";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const leadId = safeBigInt(id);
  if (!leadId) {
    return NextResponse.json({ error: "Invalid client id" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      agent_id: true,
      roles: true,
      portal_role: true,
      active_rental_listing_id: true,
      property_address: true,
      unit_number: true,
      lease_start_date: true,
      lease_end_date: true,
      rent_per_month: true,
      rental_deposit: true,
      renewal_status: true,
      vacancy_risk: true,
      relist_reminder_date: true,
      docs_readiness: true,
    },
  });

  if (!lead) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  if (auth.role !== "BROKER" && lead.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const events = await prisma.portalEvent.findMany({
    where: {
      lead_id: lead.id,
      workspace: { in: ["tenant", "landlord"] },
      event_type: { in: RENTAL_SIGNAL_EVENT_TYPES },
    },
    orderBy: { created_at: "desc" },
    take: 250,
  });

  return NextResponse.json({
    client_id: lead.id.toString(),
    roles: lead.roles,
    portal_role: lead.portal_role,
    rental_context: {
      active_rental_listing_id: lead.active_rental_listing_id,
      property_address: lead.property_address,
      unit_number: lead.unit_number,
      lease_start_date: lead.lease_start_date,
      lease_end_date: lead.lease_end_date,
      rent_per_month: lead.rent_per_month ? Number(lead.rent_per_month) : null,
      rental_deposit: lead.rental_deposit ? Number(lead.rental_deposit) : null,
      renewal_status: lead.renewal_status,
      vacancy_risk: lead.vacancy_risk,
      relist_reminder_date: lead.relist_reminder_date,
      docs_readiness: lead.docs_readiness,
    },
    tenant_signals: summarizeTenantSignals(events),
    landlord_signals: summarizeLandlordSignals(events),
  });
}
