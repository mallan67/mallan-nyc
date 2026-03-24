// GET/PATCH /api/crm/protected-periods/[id]
// GET: Retrieve a protected period with all buyers.
// PATCH: Update status, record notice upload, notify new broker (UCBA A8).
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { safeJson } from "@/lib/api/safe-json";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await ctx.params;
  const periodId = BigInt(id);

  const period = await prisma.protectedPeriod.findUnique({
    where: { id: periodId },
    include: {
      listing: {
        select: {
          listing_id: true,
          address: true,
          list_price: true,
          listing_type: true,
          status: true,
        },
      },
      agent: {
        select: { id: true, first_name: true, last_name: true, email: true },
      },
      protected_buyers: true,
    },
  });

  if (!period) {
    return NextResponse.json({ error: "Protected period not found" }, { status: 404 });
  }

  // Agent can only view their own
  if (auth.role !== "BROKER" && period.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  return NextResponse.json({
    id: period.id.toString(),
    listing_id: period.listing.listing_id,
    address: period.listing.address,
    list_price: period.listing.list_price,
    listing_type: period.listing.listing_type,
    listing_status: period.listing.status,
    agent: {
      id: period.agent.id.toString(),
      name: `${period.agent.first_name} ${period.agent.last_name}`,
      email: period.agent.email,
    },
    agreement_expired_at: period.agreement_expired_at,
    names_deadline: period.names_deadline,
    protection_ends_at: period.protection_ends_at,
    names_submitted_at: period.names_submitted_at,
    notice_uploaded_at: period.notice_uploaded_at,
    notice_document_id: period.notice_document_id?.toString() ?? null,
    status: period.status,
    buyers: period.protected_buyers.map((b) => ({
      id: b.id.toString(),
      buyer_name: b.buyer_name,
      buyer_email: b.buyer_email,
      buyer_phone: b.buyer_phone,
      notes: b.notes,
      deal_executed: b.deal_executed,
      deal_executed_at: b.deal_executed_at,
      deal_price: b.deal_price,
      created_at: b.created_at,
    })),
    created_at: period.created_at,
    updated_at: period.updated_at,
  });
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await ctx.params;
  const periodId = BigInt(id);

  const period = await prisma.protectedPeriod.findUnique({
    where: { id: periodId },
    include: {
      listing: { select: { listing_id: true, address: true } },
    },
  });

  if (!period) {
    return NextResponse.json({ error: "Protected period not found" }, { status: 404 });
  }

  // Agent can update their own; broker can update any
  if (auth.role !== "BROKER" && period.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const [body, _parseErr] = await safeJson(req);
  if (_parseErr) return _parseErr;
  const update: Record<string, unknown> = {};

  // Record notice document upload
  if (body.notice_document_id) {
    update.notice_document_id = BigInt(body.notice_document_id);
    update.notice_uploaded_at = new Date();
  }

  // UCBA A8: Record that new broker was notified of protected period
  // This is an audit action — the notification itself is handled externally
  if (body.new_broker_notified === true) {
    await logAuditEvent(
      "protected_period_new_broker_notified",
      "protected_period",
      periodId.toString(),
      auth,
      {
        listing_id: period.listing.listing_id,
        notified_by: auth.userId.toString(),
        notified_at: new Date().toISOString(),
        new_broker_name: body.new_broker_name || null,
        new_broker_firm: body.new_broker_firm || null,
      },
    );
  }

  // Status transitions (broker only for some)
  if (body.status) {
    const validTransitions: Record<string, string[]> = {
      pending_names: ["active"],       // After names submitted
      active: ["converted", "expired"],
      missed_deadline: ["expired"],
    };

    const allowed = validTransitions[period.status];
    if (!allowed || !allowed.includes(body.status)) {
      return NextResponse.json(
        { error: `Cannot transition from '${period.status}' to '${body.status}'` },
        { status: 400 }
      );
    }

    update.status = body.status;

    if (body.status === "converted") {
      // Broker confirms a protected buyer executed a deal
      await logAuditEvent(
        "protected_period_converted",
        "protected_period",
        periodId.toString(),
        auth,
        { previous_status: period.status },
      );
    }
  }

  if (Object.keys(update).length === 0 && !body.new_broker_notified) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const updated = Object.keys(update).length > 0
    ? await prisma.protectedPeriod.update({
        where: { id: periodId },
        data: update,
      })
    : period;

  return NextResponse.json({
    id: updated.id.toString(),
    status: updated.status,
    notice_uploaded_at: updated.notice_uploaded_at,
    updated_at: updated.updated_at,
  });
}
