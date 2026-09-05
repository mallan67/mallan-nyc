// /api/crm/referrals — GET: list referrals, POST: create referral.
// Stored as AuditEvents with action "referral" to avoid new Prisma model.
// Each referral is a single AuditEvent with all fields in `changes` JSON.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = req.nextUrl;
  const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);

  const where: Prisma.AuditEventWhereInput = {
    action: "referral",
  };

  // Ownership: agent sees own referrals, broker sees all
  if (auth.role !== "BROKER") {
    where.user_id = auth.userId;
  }

  const events = await prisma.auditEvent.findMany({
    where,
    orderBy: { created_at: "desc" },
    take: limit,
  });

  const referrals = events.map((e) => {
    const d = (e.changes || {}) as Record<string, unknown>;
    return {
      id: e.id.toString(),
      direction: d.direction || "outgoing",
      partner_name: d.partner_name || d.partner_brokerage || null,
      partner_brokerage: d.partner_brokerage || null,
      partner_agent: d.partner_agent || null,
      partner_email: d.partner_email || null,
      partner_phone: d.partner_phone || null,
      our_agent_id: (d.our_agent_id as string) || e.user_id?.toString() || null,
      assigned_agent_id: (d.assigned_agent_id as string) || e.user_id?.toString() || null,
      client_id: d.client_id || null,
      client_name: d.client_name || null,
      referral_type: d.referral_type || d.type || null,
      fee_percent: d.fee_percent || null,
      fee_amount: d.fee_amount || null,
      agreement_status: d.agreement_status || d.status || "pending",
      status: d.agreement_status || d.status || "pending",
      property_address: d.property_address || null,
      notes: d.notes || null,
      sale_price: d.sale_price || null,
      monthly_rent: d.monthly_rent || null,
      created_at: e.created_at.toISOString(),
      createdAt: e.created_at.toISOString(),
      date: e.created_at.toISOString(),
    };
  });

  return NextResponse.json({ referrals });
}

export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.partner_brokerage && !body.partner_name) {
    return NextResponse.json({ error: "Partner brokerage name is required" }, { status: 400 });
  }

  const event = await prisma.auditEvent.create({
    data: {
      action: "referral",
      entity_type: "referral",
      entity_id: `ref_${Date.now()}`,
      user_type: auth.userType,
      user_id: auth.userId,
      actor_user_id: auth.actorUserId ?? null,  // broker actor when delegated; null otherwise
      changes: body as Prisma.InputJsonValue,
      ip_address: req.headers.get("x-forwarded-for") ?? null,
    },
  });

  return NextResponse.json({ id: event.id.toString(),
    created_at: event.created_at.toISOString(),
  }, { status: 201 });
}
