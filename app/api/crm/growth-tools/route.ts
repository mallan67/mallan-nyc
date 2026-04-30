// GET /api/crm/growth-tools
// Agent/broker operational queues for pipeline, marketing cadence, and seller-potential signals.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isAuthError, requireAgentOrBroker } from "@/lib/auth";
import { summarizeGrowthTools } from "@/lib/crm/growth-tools";
import { SELLER_SIGNAL_EVENT_TYPES } from "@/lib/seller-signals/summary";
import { RENTAL_SIGNAL_EVENT_TYPES } from "@/lib/rental-signals/summary";

function clampLimit(value: string | null) {
  const parsed = Number(value || 500);
  if (!Number.isFinite(parsed)) return 500;
  return Math.max(50, Math.min(1000, Math.floor(parsed)));
}

function daysFromNow(days: number) {
  return new Date(Date.now() + days * 86400000);
}

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const limit = clampLimit(req.nextUrl.searchParams.get("limit"));
  const isBroker = auth.role === "BROKER";
  const leadWhere = isBroker ? {} : { agent_id: auth.userId };
  const leaseWhere = isBroker
    ? { status: { in: ["active", "pending"] } }
    : {
        status: { in: ["active", "pending"] },
        OR: [
          { agent_id: auth.userId },
          { landlord: { agent_id: auth.userId } },
          { tenant: { agent_id: auth.userId } },
        ],
      };

  const [leads, campaigns, tasks, leases] = await Promise.all([
    prisma.lead.findMany({
      where: leadWhere,
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        phone: true,
        roles: true,
        status: true,
        agent_id: true,
        pipeline_stage: true,
        seller_potential: true,
        seller_potential_reason: true,
        vacancy_risk: true,
        relist_reminder_date: true,
        last_contacted_at: true,
        next_follow_up: true,
        last_login_at: true,
        last_response_at: true,
        last_click_at: true,
        last_viewed_listing_at: true,
        sales_drip_on: true,
        rental_drip_on: true,
        renewal_drip_on: true,
        sales_drip_status: true,
        rental_drip_status: true,
        last_unsubscribe_at: true,
        closing_date: true,
        gift_sent_at: true,
        anniversary_6mo_sent_at: true,
        anniversary_1yr_sent_at: true,
        active_sale_listing_id: true,
        active_rental_listing_id: true,
        property_address: true,
        home_address: true,
        buyer_rep_agreement: true,
        docs_readiness: true,
        documents_collected: true,
        disclosures: true,
        marketing_strategy: true,
        is_high_net_worth: true,
        is_investor: true,
        investment_properties: true,
        net_worth_estimate: true,
        portfolio_value_estimate: true,
        created_at: true,
        updated_at: true,
      },
      orderBy: [{ next_follow_up: "asc" }, { updated_at: "desc" }],
      take: limit,
    }),
    prisma.campaign.findMany({
      where: isBroker ? {} : { agent_id: auth.userId },
      select: {
        id: true,
        name: true,
        audience_type: true,
        campaign_type: true,
        status: true,
        frequency: true,
        last_run_at: true,
        next_run_at: true,
        recipient_count: true,
        sent_count: true,
        open_count: true,
        click_count: true,
        response_count: true,
      },
      orderBy: [{ next_run_at: "asc" }, { updated_at: "desc" }],
      take: 250,
    }),
    prisma.followUpTask.findMany({
      where: {
        ...(isBroker ? {} : { agent_id: auth.userId }),
        status: { in: ["pending", "overdue"] },
        due_date: { lte: daysFromNow(14) },
      },
      select: {
        id: true,
        lead_id: true,
        title: true,
        priority: true,
        status: true,
        task_type: true,
        due_date: true,
      },
      orderBy: [{ due_date: "asc" }, { priority: "desc" }],
      take: 250,
    }),
    prisma.activeLease.findMany({
      where: leaseWhere,
      select: {
        id: true,
        landlord_lead_id: true,
        tenant_lead_id: true,
        address: true,
        status: true,
        lease_end_date: true,
        renewal_status: true,
        seller_comps_6mo_sent_at: true,
        seller_comps_1yr_sent_at: true,
        outreach_90d_sent_at: true,
        outreach_60d_sent_at: true,
        outreach_30d_sent_at: true,
        relist_target_date: true,
      },
      orderBy: { lease_end_date: "asc" },
      take: 500,
    }),
  ]);

  const leadIds = leads.map((lead) => lead.id);
  const portalEvents = leadIds.length
    ? await prisma.portalEvent.findMany({
        where: {
          lead_id: { in: leadIds },
          event_type: { in: [...SELLER_SIGNAL_EVENT_TYPES, ...RENTAL_SIGNAL_EVENT_TYPES] },
          created_at: { gte: daysFromNow(-365) },
        },
        select: {
          id: true,
          lead_id: true,
          event_type: true,
          listing_id: true,
          metadata: true,
          created_at: true,
        },
        orderBy: { created_at: "desc" },
        take: 1000,
      })
    : [];

  return NextResponse.json({
    growth_tools: summarizeGrowthTools({
      leads,
      campaigns,
      tasks,
      leases,
      portalEvents,
      isBroker,
    }),
  });
}
