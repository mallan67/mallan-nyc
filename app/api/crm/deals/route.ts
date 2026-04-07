// /api/crm/deals
// GET: Returns deals with ownership enforcement. POST: Create a commission request.
import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { findDeals, createDeal } from "@/lib/db/deals";
import { parseBody } from "@/lib/api/parse-body";
import { createDealSchema } from "@/lib/api/schemas/deal";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  try {
    const { searchParams } = req.nextUrl;
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50") || 50, 1), 200);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0") || 0, 0);
    const result = await findDeals({
      userId: auth.userId,
      role: auth.role,
      status: searchParams.get("status"),
      limit,
      offset,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[CRM:Deals] GET error:", err);
    return NextResponse.json({ error: "Failed to fetch deals" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { data, error } = await parseBody(req, createDealSchema);
  if (error) return error;

  try {
    const deal = await createDeal({
      agent_id: auth.userId,
      representation_code: data.representation_code ?? null,
      property_address: data.property_address ?? null,
      price_usd: data.price_usd ?? null,
      commission_rate_percent: data.commission_rate_percent ?? null,
      split_percent: data.split_percent ?? null,
      agent_fee_usd: data.agent_fee_usd ?? null,
      company_fee_usd: data.company_fee_usd ?? null,
      gross_commission_usd: data.gross_commission_usd ?? null,
      contract_signed: data.contract_signed ? new Date(data.contract_signed) : null,
    });

    await logAuditEvent(
      "create",
      "deal",
      String(deal.id),
      auth,
      { representation_code: data.representation_code, property_address: data.property_address },
      req.headers.get("x-forwarded-for") ?? undefined
    );

    return NextResponse.json(
      { id: deal.id, status: deal.status },
      { status: 201 }
    );
  } catch (err) {
    console.error("[CRM:Deals] POST error:", err);
    return NextResponse.json({ error: "Failed to create deal" }, { status: 500 });
  }
}
