// /api/crm/commissions — GET: list, POST: record payment
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = req.nextUrl;
  const dealId = searchParams.get("deal_id");
  const status = searchParams.get("status");
  const paymentType = searchParams.get("payment_type");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
  const offset = parseInt(searchParams.get("offset") || "0");

  const where: Record<string, unknown> = {};
  if (dealId) where.deal_id = BigInt(dealId);
  if (status) where.status = status;
  if (paymentType) where.payment_type = paymentType;

  // Scope to agent's deals
  if (auth.role !== "BROKER") {
    where.deal = { agent_id: auth.userId };
  }

  const [payments, total] = await Promise.all([
    prisma.commissionPayment.findMany({
      where, orderBy: { created_at: "desc" }, take: limit, skip: offset,
      include: { deal: { select: { id: true, property_address: true, status: true, agent_id: true } } },
    }),
    prisma.commissionPayment.count({ where }),
  ]);

  const serialized = payments.map(p => ({
    ...p, id: p.id.toString(), deal_id: p.deal_id.toString(),
    amount: p.amount.toString(),
    deal: p.deal ? { ...p.deal, id: p.deal.id.toString(), agent_id: p.deal.agent_id.toString() } : null,
  }));

  return NextResponse.json({ total, items: serialized });
}

export async function POST(req: NextRequest) {
  const writeBlock = assertWriteAllowed();
  if (writeBlock) return writeBlock;

  // Only broker can record commission payments
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { deal_id, payment_type, amount, date, status, reference, notes } = body as {
    deal_id?: string; payment_type?: string; amount?: number; date?: string;
    status?: string; reference?: string; notes?: string;
  };

  if (!deal_id || !payment_type || !amount) {
    return NextResponse.json({ error: "deal_id, payment_type, amount are required" }, { status: 400 });
  }

  const validTypes = ["received", "agent_split", "company_split", "referral", "adjustment"];
  if (!validTypes.includes(payment_type)) {
    return NextResponse.json({ error: `Invalid payment_type. Must be one of: ${validTypes.join(", ")}` }, { status: 400 });
  }

  // Fail-closed: validate commission split before recording agent/company payments
  if (payment_type === "agent_split" || payment_type === "company_split") {
    const deal = await prisma.deal.findUnique({ where: { id: BigInt(deal_id) } });
    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }
    if (!deal.gross_commission_usd || !deal.split_percent) {
      return NextResponse.json({ error: "Cannot record split payment: deal is missing gross_commission_usd or split_percent. Complete deal financials first.",
      }, { status: 422 });
    }

    // Validate total split payments don't exceed gross commission
    const existingPayments = await prisma.commissionPayment.findMany({
      where: { deal_id: BigInt(deal_id), payment_type: { in: ["agent_split", "company_split"] }, status: { not: "void" } },
    });
    const existingTotal = existingPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    const newTotal = existingTotal + Number(amount);
    const grossCommission = Number(deal.gross_commission_usd);

    if (newTotal > grossCommission * 1.001) { // 0.1% tolerance for rounding
      return NextResponse.json({ error: `Split payments ($${newTotal.toFixed(2)}) would exceed gross commission ($${grossCommission.toFixed(2)})`,
      }, { status: 422 });
    }
  }

  const payment = await prisma.commissionPayment.create({
    data: {
      deal_id: BigInt(deal_id),
      payment_type,
      amount,
      date: date ? new Date(date) : null,
      status: status || "pending",
      reference: reference || null,
      notes: notes || null,
    },
  });

  await logAuditEvent("create", "commission_payment", payment.id.toString(), auth);

  return NextResponse.json({ item: { ...payment, id: payment.id.toString(), deal_id: payment.deal_id.toString(), amount: payment.amount.toString() },
  }, { status: 201 });
}
