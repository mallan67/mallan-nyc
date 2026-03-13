// /api/crm/commissions/[id] — PATCH: update payment status
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const writeBlock = assertWriteAllowed();
  if (writeBlock) return writeBlock;

  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const paymentId = BigInt(id);

  const existing = await prisma.commissionPayment.findUnique({ where: { id: paymentId } });
  if (!existing) return NextResponse.json({ ok: false, error: "Payment not found" }, { status: 404 });

  let body: { status?: string; date?: string; reference?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const data: Record<string, unknown> = {};
  if (body.status) data.status = body.status;
  if (body.date) data.date = new Date(body.date);
  if (body.reference !== undefined) data.reference = body.reference;
  if (body.notes !== undefined) data.notes = body.notes;

  const updated = await prisma.commissionPayment.update({ where: { id: paymentId }, data });
  await logAuditEvent("update", "commission_payment", id, auth, data);

  return NextResponse.json({
    ok: true,
    item: { ...updated, id: updated.id.toString(), deal_id: updated.deal_id.toString(), amount: updated.amount.toString() },
  });
}
