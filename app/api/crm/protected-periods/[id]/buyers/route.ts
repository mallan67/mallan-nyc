// POST /api/crm/protected-periods/[id]/buyers — add a protected buyer (max 6)
// DELETE /api/crm/protected-periods/[id]/buyers?buyer_id=X — remove a buyer (before deadline)
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireAgentOrBroker,
  isAuthError,
  logAuditEvent,
} from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const { id } = await params;

  const period = await prisma.protectedPeriod.findUnique({
    where: { id: BigInt(id) },
    include: { protected_buyers: true },
  });

  if (!period) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (auth.role !== "BROKER" && period.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // Check deadline
  if (new Date() > period.names_deadline && auth.role !== "BROKER") {
    return NextResponse.json(
      { error: "7 business day deadline has passed for submitting protected buyer names" },
      { status: 422 }
    );
  }

  // Check max 6
  if (period.protected_buyers.length >= 6) {
    return NextResponse.json(
      { error: "Maximum of 6 protected buyers allowed (UCBA A6)" },
      { status: 422 }
    );
  }

  let body: { buyer_name: string; buyer_email?: string; buyer_phone?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.buyer_name?.trim()) {
    return NextResponse.json({ error: "buyer_name is required" }, { status: 400 });
  }

  const buyer = await prisma.protectedBuyer.create({
    data: {
      protected_period_id: period.id,
      buyer_name: body.buyer_name.trim(),
      buyer_email: body.buyer_email?.trim() || null,
      buyer_phone: body.buyer_phone?.trim() || null,
      notes: body.notes?.trim() || null,
    },
  });

  // If this is the first buyer being added, update period status and timestamp
  if (period.protected_buyers.length === 0) {
    await prisma.protectedPeriod.update({
      where: { id: period.id },
      data: {
        status: "active",
        names_submitted_at: new Date(),
      },
    });
  }

  await logAuditEvent(
    "create",
    "protected_buyer",
    buyer.id.toString(),
    auth,
    { period_id: id, buyer_name: body.buyer_name }
  );

  return NextResponse.json({
    id: buyer.id.toString(),
    buyer_name: buyer.buyer_name,
    buyer_email: buyer.buyer_email,
    buyer_phone: buyer.buyer_phone,
    notes: buyer.notes,
  }, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const { id } = await params;

  const url = new URL(req.url);
  const buyerId = url.searchParams.get("buyer_id");
  if (!buyerId) {
    return NextResponse.json({ error: "buyer_id required" }, { status: 400 });
  }

  const period = await prisma.protectedPeriod.findUnique({
    where: { id: BigInt(id) },
  });
  if (!period) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (auth.role !== "BROKER" && period.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // Only allow deletion before deadline
  if (new Date() > period.names_deadline && auth.role !== "BROKER") {
    return NextResponse.json(
      { error: "Cannot remove buyers after deadline" },
      { status: 422 }
    );
  }

  const buyer = await prisma.protectedBuyer.findFirst({
    where: { id: BigInt(buyerId), protected_period_id: period.id },
  });
  if (!buyer) {
    return NextResponse.json({ error: "Buyer not found" }, { status: 404 });
  }

  await prisma.protectedBuyer.delete({ where: { id: buyer.id } });

  await logAuditEvent(
    "delete",
    "protected_buyer",
    buyerId,
    auth,
    { period_id: id, buyer_name: buyer.buyer_name }
  );

  return NextResponse.json({ deleted: true });
}
