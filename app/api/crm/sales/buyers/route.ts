// /api/crm/sales/buyers — GET: all buyers + investors, POST: create, PATCH: update
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeJson } from "@/lib/api/safe-json";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const where: Record<string, unknown> = {
    roles: { has: "buyer" },
  };

  if (auth.role !== "BROKER") {
    where.agent_id = auth.userId;
  }

  const buyers = await prisma.lead.findMany({
    where,
    orderBy: { updated_at: "desc" },
    take: 200,
    include: {
      lead_score: { select: { score: true } },
      showings: { select: { id: true } },
      actions: {
        orderBy: { created_at: "desc" },
        take: 5,
        select: { action: true, created_at: true, listing_id: true },
      },
    },
  });

  const enriched = buyers.map((b) => {
    const sentListings = new Set<string>();
    (b.actions || []).forEach((a) => {
      if (a.listing_id) sentListings.add(String(a.listing_id));
    });
    return {
      ...b,
      id: String(b.id),
      agent_id: b.agent_id ? String(b.agent_id) : null,
      name: `${b.first_name} ${b.last_name}`.trim(),
      conviction_score: b.lead_score?.score || 0,
      listings_sent_count: sentListings.size,
      showings_count: b.showings.length,
    };
  });

  return NextResponse.json({ buyers: enriched });
}

export async function POST(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const writeCheck = assertWriteAllowed();
  if (writeCheck) return writeCheck;

  const [body, _parseErr] = await safeJson(req);
  if (_parseErr) return _parseErr;
  const { first_name, last_name, email, phone, is_investor, entity_name, entity_type, pre_approved, pre_approved_amount, down_payment, available_funds, investment_strategy, notes } = body;

  if (!first_name || !last_name || !email) {
    return NextResponse.json({ error: "first_name, last_name, email required" }, { status: 400 });
  }

  const buyer = await prisma.lead.create({
    data: {
      first_name,
      last_name,
      email,
      phone: phone || "",
      roles: ["buyer"],
      status: "new",
      pipeline_stage: "new",
      agent_id: auth.userId,
      source: "manual",
      is_investor: is_investor || false,
      entity_name,
      entity_type,
      pre_approved: pre_approved || false,
      pre_approved_amount: pre_approved_amount ? Number(pre_approved_amount) : undefined,
      down_payment: down_payment ? Number(down_payment) : undefined,
      available_funds: available_funds ? Number(available_funds) : undefined,
      investment_strategy,
      notes,
    },
  });

  await logAuditEvent("create_buyer", "lead", String(buyer.id), auth, { first_name, last_name, is_investor });

  return NextResponse.json({
    buyer: { ...buyer, id: String(buyer.id), name: `${buyer.first_name} ${buyer.last_name}`.trim() },
  }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const writeCheck = assertWriteAllowed();
  if (writeCheck) return writeCheck;

  const [body, _parseErr] = await safeJson(req);
  if (_parseErr) return _parseErr;
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const existing = await prisma.lead.findFirst({
    where: { id: BigInt(id), ...(auth.role !== "BROKER" ? { agent_id: auth.userId } : {}) },
  });

  if (!existing) {
    return NextResponse.json({ error: "Buyer not found" }, { status: 404 });
  }

  const allowed = [
    "first_name", "last_name", "email", "phone", "status", "pipeline_stage",
    "is_investor", "entity_name", "entity_type", "pre_approved", "pre_approved_amount",
    "down_payment", "available_funds", "monthly_debt", "annual_income", "bonuses",
    "credit_score_range", "employer", "work_title",
    "investment_strategy", "cap_rate_target", "cash_on_cash_target", "holding_period_years",
    "exchange_1031_status", "exchange_1031_deadline", "current_portfolio",
    "notes", "next_follow_up", "last_contacted_at", "buyer_rep_agreement", "buyer_rep_agreement_date",
    "secondary_first_name", "secondary_last_name", "secondary_email", "secondary_phone", "secondary_relationship",
    "legal_ownership_name", "authorized_signatories",
  ];

  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in updates) data[key] = updates[key];
  }

  const updated = await prisma.lead.update({
    where: { id: BigInt(id) },
    data,
  });

  await logAuditEvent("update_buyer", "lead", String(updated.id), auth, { fields: Object.keys(data) });

  return NextResponse.json({
    buyer: { ...updated, id: String(updated.id), name: `${updated.first_name} ${updated.last_name}`.trim() },
  });
}
