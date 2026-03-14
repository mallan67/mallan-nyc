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

  const { searchParams } = req.nextUrl;
  const result = await findDeals({
    userId: auth.userId,
    role: auth.role,
    status: searchParams.get("status"),
    limit: parseInt(searchParams.get("limit") || "50"),
    offset: parseInt(searchParams.get("offset") || "0"),
  });

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { data, error } = await parseBody(req, createDealSchema);
  if (error) return error;

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
}
