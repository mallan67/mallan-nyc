// /api/crm/deals/[id]
// GET: Single deal detail. PATCH: Update deal fields.
// Ownership enforced: agent can only access their own deals.
import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { findDealById, updateDeal } from "@/lib/db/deals";
import { parseBody } from "@/lib/api/parse-body";
import { updateDealSchema } from "@/lib/api/schemas/deal";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const deal = await findDealById(id);

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  if (auth.role !== "BROKER" && String(deal.agent_id) !== String(auth.userId)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  return NextResponse.json(deal);
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const deal = await findDealById(id);

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  if (auth.role !== "BROKER" && String(deal.agent_id) !== String(auth.userId)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const { data, error } = await parseBody(req, updateDealSchema);
  if (error) return error;

  // Build update data, converting types for Prisma
  const update: Record<string, unknown> = {};
  if (data.property_address !== undefined) update.property_address = data.property_address;
  if (data.price_usd !== undefined) update.price_usd = data.price_usd;
  if (data.commission_rate_percent !== undefined) update.commission_rate_percent = data.commission_rate_percent;
  if (data.split_percent !== undefined) update.split_percent = data.split_percent;
  if (data.agent_fee_usd !== undefined) update.agent_fee_usd = data.agent_fee_usd;
  if (data.company_fee_usd !== undefined) update.company_fee_usd = data.company_fee_usd;
  if (data.gross_commission_usd !== undefined) update.gross_commission_usd = data.gross_commission_usd;
  if (data.representation_code !== undefined) update.representation_code = data.representation_code;
  if (data.contract_signed !== undefined) {
    update.contract_signed = data.contract_signed ? new Date(data.contract_signed) : null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const numericId = parseInt(id);
  const updated = await updateDeal(BigInt(numericId), update);

  await logAuditEvent(
    "update",
    "deal",
    String(deal.id),
    auth,
    { fields_updated: Object.keys(update) },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    updated_fields: Object.keys(update),
  });
}
