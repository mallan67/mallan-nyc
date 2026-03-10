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

  return NextResponse.json({ ok: true, total, items: serialized });
}

export async function POST(req: NextRequest) {
  const writeBlock = assertWriteAllowed();
  if (writeBlock) return writeBlock;

  // Only broker can record commission payments
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const body = await req.json();
  const { deal_id, payment_type, amount, date, status, reference, notes } = body;

  if (!deal_id || !payment_type || !amount) {
    return NextResponse.json({ ok: false, error: "deal_id, payment_type, amount are required" }, { status: 400 });
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

  return NextResponse.json({
    ok: true,
    item: { ...payment, id: payment.id.toString(), deal_id: payment.deal_id.toString(), amount: payment.amount.toString() },
  }, { status: 201 });
}
