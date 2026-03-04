// /api/crm/deals/[id]
// GET: Single deal detail. PATCH: Update deal fields.
// Ownership enforced: agent can only access their own deals.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireAgentOrBroker,
  isAuthError,
  logAuditEvent,
} from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

type RouteParams = { params: Promise<{ id: string }> };

async function findDeal(id: string) {
  const numericId = parseInt(id);
  if (!isNaN(numericId)) {
    return prisma.deal.findUnique({ where: { id: BigInt(numericId) } });
  }
  return null;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const deal = await findDeal(id);

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  if (auth.role !== "BROKER" && deal.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  return NextResponse.json({
    ...deal,
    id: deal.id.toString(),
    agent_id: deal.agent_id.toString(),
    price_usd: deal.price_usd?.toString() ?? null,
    commission_rate_percent: deal.commission_rate_percent?.toString() ?? null,
    split_percent: deal.split_percent?.toString() ?? null,
    agent_fee_usd: deal.agent_fee_usd?.toString() ?? null,
    company_fee_usd: deal.company_fee_usd?.toString() ?? null,
    gross_commission_usd: deal.gross_commission_usd?.toString() ?? null,
  });
}

/**
 * PATCH /api/crm/deals/[id]
 * Update deal fields. Owner agent or broker.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const deal = await findDeal(id);

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  if (auth.role !== "BROKER" && deal.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Build update — only allow specific fields
  const update: Record<string, unknown> = {};

  if (body.property_address !== undefined)
    update.property_address = String(body.property_address);
  if (body.price_usd !== undefined) update.price_usd = Number(body.price_usd);
  if (body.commission_rate_percent !== undefined)
    update.commission_rate_percent = Number(body.commission_rate_percent);
  if (body.split_percent !== undefined)
    update.split_percent = Number(body.split_percent);
  if (body.agent_fee_usd !== undefined)
    update.agent_fee_usd = Number(body.agent_fee_usd);
  if (body.company_fee_usd !== undefined)
    update.company_fee_usd = Number(body.company_fee_usd);
  if (body.gross_commission_usd !== undefined)
    update.gross_commission_usd = Number(body.gross_commission_usd);
  if (body.representation_code !== undefined)
    update.representation_code = String(body.representation_code);
  if (body.contract_signed !== undefined)
    update.contract_signed = body.contract_signed
      ? new Date(body.contract_signed as string)
      : null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  const updated = await prisma.deal.update({
    where: { id: deal.id },
    data: update,
  });

  await logAuditEvent(
    "update",
    "deal",
    deal.id.toString(),
    auth,
    { fields_updated: Object.keys(update) },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({
    id: updated.id.toString(),
    status: updated.status,
    updated_fields: Object.keys(update),
  });
}
