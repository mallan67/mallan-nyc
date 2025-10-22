// app/api/crm/deals/route.ts
import { NextResponse } from "next/server";
import { PrismaClient, DealType } from "@prisma/client";
import { computeAgentCommission, pctToUnit } from "@/lib/commission";

const prisma = new PrismaClient();

// GET /api/crm/deals?agent=licenseNo_or_email_or_id
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const agentParam = (searchParams.get("agent") || "").trim();

  let agent = null;
  if (agentParam) {
    // try id
    agent = await prisma.agent.findUnique({ where: { id: agentParam } });
    if (!agent) agent = await prisma.agent.findUnique({ where: { licenseNo: agentParam } });
    if (!agent) agent = await prisma.agent.findUnique({ where: { email: agentParam.toLowerCase() } });
  }

  const where = agent ? { agentId: agent.id } : {};
  const deals = await prisma.deal.findMany({
    where,
    orderBy: [{ contractClosedAt: "desc" }, { createdAt: "desc" }],
    include: {
      agent: {
        select: { firstName: true, lastName: true, licenseNo: true, email: true },
      },
    },
  });

  return NextResponse.json(deals);
}

/**
 * POST /api/crm/deals
 * body: {
 *   agentLookup: { licenseNo?: string, email?: string, id?: string },
 *   type: "SALE" | "RENT",
 *   address: string,
 *   price: number, // whole dollars
 *   // Either send one of these:
 *   agentCommissionPercent?: number, // 60 or 0.6
 *   splitOverridePercent?: number,    // 60 or 0.6 (if you want to force split for this deal)
 *   contractSignedAt?: string (ISO),
 *   contractClosedAt?: string (ISO)
 * }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { agentLookup } = body || {};

    // 1) resolve agent
    let agent = null;
    if (agentLookup?.id) {
      agent = await prisma.agent.findUnique({ where: { id: String(agentLookup.id) } });
    }
    if (!agent && agentLookup?.licenseNo) {
      agent = await prisma.agent.findUnique({ where: { licenseNo: String(agentLookup.licenseNo) } });
    }
    if (!agent && agentLookup?.email) {
      agent = await prisma.agent.findUnique({ where: { email: String(agentLookup.email).toLowerCase() } });
    }
    if (!agent) {
      return NextResponse.json({ error: "Agent not found." }, { status: 404 });
    }

    // 2) validate input
    const type = String(body.type) as DealType;
    if (!["SALE", "RENT"].includes(type)) {
      return NextResponse.json({ error: "type must be SALE or RENT" }, { status: 400 });
    }
    const address = String(body.address || "").trim();
    const price = Number(body.price);
    if (!address || !Number.isFinite(price) || price <= 0) {
      return NextResponse.json({ error: "Invalid address or price" }, { status: 400 });
    }

    // 3) split to use (override > agent default)
    const splitUnit = body.splitOverridePercent != null
      ? pctToUnit(Number(body.splitOverridePercent))
      : type === "SALE"
        ? pctToUnit(agent.saleSplit ?? 0.6)
        : pctToUnit(agent.rentSplit ?? 0.6);

    // 4) agent commission percent on commission base
    const agentCommissionPercentUnit = body.agentCommissionPercent != null
      ? pctToUnit(Number(body.agentCommissionPercent))
      : splitUnit;

    // Define commission base rule:
    // For now, use price as the base. If your brokerage uses a rate (e.g., 6% of price),
    // change this to: const commissionBase = Math.round(price * 0.06);
    const commissionBase = price;

    const { unit: finalUnit, agentAmt } = computeAgentCommission(
      commissionBase,
      agentCommissionPercentUnit
    );

    const deal = await prisma.deal.create({
      data: {
        type,
        address,
        price,
        agentId: agent.id,
        licenseNo: agent.licenseNo,
        agentCommissionPercent: finalUnit,
        agentCommissionAmount: agentAmt,
        splitPercent: splitUnit,
        contractSignedAt: body.contractSignedAt ? new Date(body.contractSignedAt) : null,
        contractClosedAt: body.contractClosedAt ? new Date(body.contractClosedAt) : null,
      },
      include: {
        agent: { select: { firstName: true, lastName: true, licenseNo: true, email: true } },
      },
    });

    return NextResponse.json(deal, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
