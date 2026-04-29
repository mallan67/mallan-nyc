// GET /api/crm/clients/[id]/seller-signals
// Agent/broker visibility into first-party seller portal planning signals.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isAuthError, requireAgentOrBroker } from "@/lib/auth";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import { summarizeSellerSignals } from "@/lib/seller-signals/summary";

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
      active_sale_listing_id: true,
      property_address: true,
      home_address: true,
      attorney_name: true,
      attorney_email: true,
      attorney_phone: true,
      attorney_firm: true,
      home_prep_checklist: true,
      documents_collected: true,
      disclosures: true,
      marketing_strategy: true,
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
      workspace: "seller",
      event_type: {
        in: [
          "seller_valuation_request",
          "seller_proceeds_estimate",
          "seller_closing_cost_estimate",
          "seller_readiness_update",
        ],
      },
    },
    orderBy: { created_at: "desc" },
    take: 250,
  });

  return NextResponse.json({
    client_id: lead.id.toString(),
    roles: lead.roles,
    property_context: {
      active_sale_listing_id: lead.active_sale_listing_id,
      property_address: lead.property_address,
      home_address: lead.home_address,
    },
    attorney: {
      name: lead.attorney_name,
      email: lead.attorney_email,
      phone: lead.attorney_phone,
      firm: lead.attorney_firm,
    },
    structured_readiness: {
      home_prep_checklist: lead.home_prep_checklist,
      documents_collected: lead.documents_collected,
      disclosures: lead.disclosures,
      marketing_strategy: lead.marketing_strategy,
    },
    seller_signals: summarizeSellerSignals(events),
  });
}
