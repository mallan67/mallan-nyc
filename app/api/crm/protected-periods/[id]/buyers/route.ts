// GET/POST /api/crm/protected-periods/[id]/buyers
// GET: List protected buyers for a period.
// POST: Submit protected buyer names (max 6, UCBA A6).
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string }> };

const MAX_PROTECTED_BUYERS = 6; // UCBA A6 limit

export async function GET(req: NextRequest, ctx: RouteContext) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await ctx.params;
  const periodId = BigInt(id);

  const period = await prisma.protectedPeriod.findUnique({
    where: { id: periodId },
    select: { agent_id: true },
  });

  if (!period) {
    return NextResponse.json({ error: "Protected period not found" }, { status: 404 });
  }

  if (auth.role !== "BROKER" && period.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const buyers = await prisma.protectedBuyer.findMany({
    where: { protected_period_id: periodId },
    orderBy: { created_at: "asc" },
  });

  return NextResponse.json({
    data: buyers.map((b) => ({
      id: b.id.toString(),
      buyer_name: b.buyer_name,
      buyer_email: b.buyer_email,
      buyer_phone: b.buyer_phone,
      notes: b.notes,
      deal_executed: b.deal_executed,
      deal_executed_at: b.deal_executed_at,
      deal_price: b.deal_price,
      created_at: b.created_at,
    })),
    total: buyers.length,
    max: MAX_PROTECTED_BUYERS,
  });
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await ctx.params;
  const periodId = BigInt(id);

  const period = await prisma.protectedPeriod.findUnique({
    where: { id: periodId },
    include: {
      protected_buyers: { select: { id: true } },
      listing: { select: { listing_id: true, address: true } },
    },
  });

  if (!period) {
    return NextResponse.json({ error: "Protected period not found" }, { status: 404 });
  }

  // Only the agent who held the exclusive can submit names
  if (period.agent_id !== auth.userId && auth.role !== "BROKER") {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // Must be in pending_names status
  if (period.status !== "pending_names") {
    return NextResponse.json(
      { error: `Cannot submit names — period status is '${period.status}'` },
      { status: 400 }
    );
  }

  // Check deadline
  if (new Date() > period.names_deadline) {
    return NextResponse.json(
      { error: "7 business day deadline has passed. Names can no longer be submitted." },
      { status: 400 }
    );
  }

  const body = await req.json();
  const buyers: Array<{ name: string; email?: string; phone?: string; notes?: string }> =
    body.buyers;

  if (!Array.isArray(buyers) || buyers.length === 0) {
    return NextResponse.json({ error: "Provide an array of buyers" }, { status: 400 });
  }

  // Enforce max 6 buyers total
  const existingCount = period.protected_buyers.length;
  if (existingCount + buyers.length > MAX_PROTECTED_BUYERS) {
    return NextResponse.json(
      {
        error: `Maximum ${MAX_PROTECTED_BUYERS} protected buyers allowed. You have ${existingCount} existing, tried to add ${buyers.length}.`,
      },
      { status: 400 }
    );
  }

  // Validate each buyer has a name
  for (const b of buyers) {
    if (!b.name || typeof b.name !== "string" || b.name.trim().length === 0) {
      return NextResponse.json({ error: "Each buyer must have a name" }, { status: 400 });
    }
  }

  // Create buyers
  const created = await prisma.protectedBuyer.createMany({
    data: buyers.map((b) => ({
      protected_period_id: periodId,
      buyer_name: b.name.trim(),
      buyer_email: b.email?.trim() || null,
      buyer_phone: b.phone?.trim() || null,
      notes: b.notes?.trim() || null,
    })),
  });

  // If we now have buyers, transition to active and record submission time
  const totalBuyers = existingCount + created.count;
  await prisma.protectedPeriod.update({
    where: { id: periodId },
    data: {
      status: "active",
      names_submitted_at: new Date(),
    },
  });

  // Audit log
  await logAuditEvent(
    "protected_buyers_submitted",
    "protected_period",
    periodId.toString(),
    auth,
    {
      listing_id: period.listing.listing_id,
      buyers_added: created.count,
      total_buyers: totalBuyers,
    },
  );

  // Notify broker
  const brokers = await prisma.agent.findMany({
    where: { role: "BROKER", status: "active" },
    select: { id: true },
  });

  const { createNotification } = await import("@/lib/notifications/engine");
  for (const broker of brokers) {
    await createNotification({
      recipient_type: "agent",
      recipient_id: broker.id,
      type: "listing_expiration",
      title: "Protected buyers submitted",
      body: `${created.count} protected buyer name(s) submitted for ${period.listing.listing_id}. Total: ${totalBuyers}/${MAX_PROTECTED_BUYERS}. Protection runs until ${period.protection_ends_at.toLocaleDateString()}.`,
      data: { listing_id: period.listing.listing_id },
    });
  }

  return NextResponse.json({
    created: created.count,
    total_buyers: totalBuyers,
    max: MAX_PROTECTED_BUYERS,
    status: "active",
    protection_ends_at: period.protection_ends_at,
  });
}
