/**
 * GET /api/crm/unassigned-leads
 *
 * Broker only. Returns all leads with agent_id = null (unassigned).
 * These are leads that self-registered on mallan.nyc and are waiting
 * to be distributed to an agent.
 *
 * Also returns the agent roster for the assignment dropdown.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  const [leads, agents] = await Promise.all([
    prisma.lead.findMany({
      where: { agent_id: null },
      orderBy: { created_at: "desc" },
      take: 200,
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        phone: true,
        roles: true,
        portal_role: true,
        status: true,
        source: true,
        notes: true,
        created_at: true,
        // Optional intake context captured at sign-up
        annual_income: true,
        pre_approved: true,
        pre_approved_amount: true,
        tenant_origin: true,
        is_high_net_worth: true,
        _count: {
          select: {
            portal_events: true,
            external_listings: true,
            saved_searches: true,
            activity_logs: true,
            actions: true,
          },
        },
      },
    }),
    prisma.agent.findMany({
      where: { status: "active" },
      orderBy: { first_name: "asc" },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        role: true,
        email: true,
        // Count of currently assigned active leads
        leads: {
          where: { status: { notIn: ["closed", "past"] } },
          select: { id: true },
        },
      },
    }),
  ]);

  return NextResponse.json({
    leads: leads.map(l => {
      const { _count, ...lead } = l;
      return {
        ...lead,
        id: l.id.toString(),
        pre_approved_amount: l.pre_approved_amount?.toString() ?? null,
        annual_income: l.annual_income?.toString() ?? null,
        portal_activity_count: _count.portal_events,
        external_listing_count: _count.external_listings,
        saved_search_count: _count.saved_searches,
        activity_count: _count.activity_logs,
        listing_action_count: _count.actions,
        hours_since_signup: Math.round(
          (Date.now() - new Date(l.created_at).getTime()) / (1000 * 60 * 60)
        ),
      };
    }),
    agents: agents.map(a => ({
      id: a.id.toString(),
      name: `${a.first_name} ${a.last_name}`,
      role: a.role,
      email: a.email,
      active_lead_count: a.leads.length,
    })),
    total: leads.length,
  });
}
