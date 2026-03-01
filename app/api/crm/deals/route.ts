// /api/crm/deals
// GET: Returns deals with ownership enforcement. POST: Create a commission request.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
  const offset = parseInt(searchParams.get("offset") || "0");

  const where: Record<string, unknown> = {};

  // Ownership: agent sees only their own, broker sees all
  if (auth.role !== "BROKER") {
    where.agent_id = auth.userId;
  }

  if (status) where.status = status;

  const [deals, total] = await Promise.all([
    prisma.deal.findMany({
      where,
      orderBy: { updated_at: "desc" },
      take: limit,
      skip: offset,
      include: {
        agent: {
          select: {
            id: true,
            full_name: true,
            email: true,
          },
        },
      },
    }),
    prisma.deal.count({ where }),
  ]);

  const serialized = deals.map((d) => ({
    ...d,
    id: d.id.toString(),
    agent_id: d.agent_id.toString(),
    price_usd: d.price_usd?.toString() ?? null,
    commission_rate_percent: d.commission_rate_percent?.toString() ?? null,
    split_percent: d.split_percent?.toString() ?? null,
    agent_fee_usd: d.agent_fee_usd?.toString() ?? null,
    company_fee_usd: d.company_fee_usd?.toString() ?? null,
    gross_commission_usd: d.gross_commission_usd?.toString() ?? null,
    agent: d.agent
      ? { ...d.agent, id: d.agent.id.toString() }
      : null,
  }));

  return NextResponse.json({
    deals: serialized,
    total,
    limit,
    offset,
  });
}

/**
 * POST /api/crm/deals
 * Create a new commission request. Agent or broker.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const repCode = body.representation_code as string | undefined;
  if (repCode && !["buyer", "tenant"].includes(repCode)) {
    return NextResponse.json(
      { error: "representation_code must be 'buyer' or 'tenant'" },
      { status: 400 }
    );
  }

  const deal = await prisma.deal.create({
    data: {
      agent_id: auth.userId,
      representation_code: repCode ?? null,
      property_address: (body.property_address as string) ?? null,
      price_usd: body.price_usd ? Number(body.price_usd) : null,
      commission_rate_percent: body.commission_rate_percent
        ? Number(body.commission_rate_percent)
        : null,
      split_percent: body.split_percent ? Number(body.split_percent) : null,
      agent_fee_usd: body.agent_fee_usd ? Number(body.agent_fee_usd) : null,
      company_fee_usd: body.company_fee_usd
        ? Number(body.company_fee_usd)
        : null,
      gross_commission_usd: body.gross_commission_usd
        ? Number(body.gross_commission_usd)
        : null,
      status: "submitted",
      contract_signed: body.contract_signed
        ? new Date(body.contract_signed as string)
        : null,
    },
  });

  await logAuditEvent(
    "create",
    "deal",
    deal.id.toString(),
    auth,
    { representation_code: repCode, property_address: body.property_address },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json(
    {
      id: deal.id.toString(),
      status: deal.status,
    },
    { status: 201 }
  );
}
