// POST /api/crm/protected-periods/[id]/convert — mark a buyer as deal executed
// Used when a deal closes with a protected buyer within the 90-day window.
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

  // Only broker can mark conversions (compensation decision)
  if (auth.role !== "BROKER") {
    return NextResponse.json(
      { error: "Only broker can mark deal conversions" },
      { status: 403 }
    );
  }

  // Must be in active or pending_names status
  if (!["active", "pending_names"].includes(period.status)) {
    return NextResponse.json(
      { error: `Cannot convert — period status is ${period.status}` },
      { status: 422 }
    );
  }

  // Check 90-day window
  if (new Date() > period.protection_ends_at) {
    return NextResponse.json(
      { error: "90-day protection window has expired" },
      { status: 422 }
    );
  }

  let body: { buyer_id: number; deal_price?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const buyer = period.protected_buyers.find(
    (b) => b.id === BigInt(body.buyer_id)
  );
  if (!buyer) {
    return NextResponse.json(
      { error: "Buyer not found in this protected period" },
      { status: 404 }
    );
  }

  // Mark buyer as deal executed
  await prisma.protectedBuyer.update({
    where: { id: buyer.id },
    data: {
      deal_executed: true,
      deal_executed_at: new Date(),
      deal_price: body.deal_price ?? null,
    },
  });

  // Update period status to converted
  await prisma.protectedPeriod.update({
    where: { id: period.id },
    data: { status: "converted" },
  });

  await logAuditEvent(
    "update",
    "protected_period",
    id,
    auth,
    {
      action: "deal_converted",
      buyer_id: body.buyer_id,
      buyer_name: buyer.buyer_name,
      deal_price: body.deal_price,
    }
  );

  return NextResponse.json({
    id: period.id.toString(),
    status: "converted",
    buyer_id: buyer.id.toString(),
    buyer_name: buyer.buyer_name,
  });
}
