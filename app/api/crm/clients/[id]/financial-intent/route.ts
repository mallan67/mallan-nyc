// GET /api/crm/clients/[id]/financial-intent
// Agent/broker view of buyer-side calculator and financial tool behavior.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isAuthError, requireAgentOrBroker } from "@/lib/auth";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import { summarizeFinancialIntent } from "@/lib/buyer-intent/financial-intent";

type RouteParams = { params: Promise<{ id: string }> };

function decimalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

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
      annual_income: true,
      pre_approved: true,
      pre_approved_amount: true,
      down_payment: true,
      available_funds: true,
      monthly_debt: true,
      total_monthly_expense: true,
      preferences: {
        select: {
          min_price: true,
          max_price: true,
        },
      },
      intent_profile: {
        select: {
          intent_strength: true,
          intent_stage: true,
          price_min: true,
          price_max: true,
          event_count: true,
          last_event_at: true,
        },
      },
    },
  });

  if (!lead) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  if (auth.role !== "BROKER" && lead.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const events = await prisma.intentEvent.findMany({
    where: { lead_id: lead.id },
    orderBy: { recorded_at: "desc" },
    take: 250,
  });

  const statedBudgetMax =
    decimalNumber(lead.preferences?.max_price) ??
    decimalNumber(lead.pre_approved_amount);
  const summary = summarizeFinancialIntent(events, statedBudgetMax);

  return NextResponse.json({
    client_id: lead.id.toString(),
    roles: lead.roles,
    stated_financials: {
      annual_income: decimalNumber(lead.annual_income),
      pre_approved: lead.pre_approved,
      pre_approved_amount: decimalNumber(lead.pre_approved_amount),
      down_payment: decimalNumber(lead.down_payment),
      available_funds: decimalNumber(lead.available_funds),
      monthly_debt: decimalNumber(lead.monthly_debt),
      total_monthly_expense: decimalNumber(lead.total_monthly_expense),
      stated_budget_min: decimalNumber(lead.preferences?.min_price),
      stated_budget_max: statedBudgetMax,
    },
    buyer_intent_profile: lead.intent_profile
      ? {
          intent_strength: lead.intent_profile.intent_strength,
          intent_stage: lead.intent_profile.intent_stage,
          price_min: decimalNumber(lead.intent_profile.price_min),
          price_max: decimalNumber(lead.intent_profile.price_max),
          event_count: lead.intent_profile.event_count,
          last_event_at: lead.intent_profile.last_event_at,
        }
      : null,
    financial_intent: summary,
  });
}
