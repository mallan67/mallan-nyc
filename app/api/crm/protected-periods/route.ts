// GET /api/crm/protected-periods — list all protected periods
// POST /api/crm/protected-periods — manually create one (broker only)
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireAgentOrBroker,
  isAuthError,
  logAuditEvent,
} from "@/lib/auth";
import { addBusinessDays, addCalendarDays } from "@/lib/compliance/business-days";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const agentId = url.searchParams.get("agent_id");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  // Agents see only their own; broker sees all
  if (auth.role !== "BROKER") {
    where.agent_id = auth.userId;
  } else if (agentId) {
    where.agent_id = BigInt(agentId);
  }

  const periods = await prisma.protectedPeriod.findMany({
    where,
    include: {
      protected_buyers: true,
      listing: {
        select: { listing_id: true, address: true, listing_type: true, list_price: true },
      },
      agent: {
        select: { id: true, full_name: true, email: true },
      },
    },
    orderBy: { created_at: "desc" },
  });

  return NextResponse.json(
    periods.map((p) => ({
      ...p,
      id: p.id.toString(),
      listing_id: p.listing_id.toString(),
      agent_id: p.agent_id.toString(),
      notice_document_id: p.notice_document_id?.toString() ?? null,
      agent: { ...p.agent, id: p.agent.id.toString() },
      listing: p.listing,
      protected_buyers: p.protected_buyers.map((b) => ({
        ...b,
        id: b.id.toString(),
        protected_period_id: b.protected_period_id.toString(),
        deal_price: b.deal_price?.toString() ?? null,
      })),
    }))
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  // Only broker can manually create
  if (auth.role !== "BROKER") {
    return NextResponse.json({ error: "Broker only" }, { status: 403 });
  }

  let body: { listing_id: number; agent_id?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const listing = await prisma.listing.findUnique({
    where: { id: BigInt(body.listing_id) },
  });
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  // Check no existing protected period
  const existing = await prisma.protectedPeriod.findUnique({
    where: { listing_id: listing.id },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Protected period already exists for this listing" },
      { status: 409 }
    );
  }

  const agentId = body.agent_id ? BigInt(body.agent_id) : listing.agent_id;
  if (!agentId) {
    return NextResponse.json({ error: "No agent associated with listing" }, { status: 400 });
  }

  const now = new Date();
  const expiredAt = listing.expiration_date ?? now;
  const namesDeadline = addBusinessDays(expiredAt, 7);
  const protectionEnds = addCalendarDays(expiredAt, 90);

  const period = await prisma.protectedPeriod.create({
    data: {
      listing_id: listing.id,
      agent_id: agentId,
      agreement_expired_at: expiredAt,
      names_deadline: namesDeadline,
      protection_ends_at: protectionEnds,
      status: "pending_names",
    },
  });

  await logAuditEvent(
    "create",
    "protected_period",
    period.id.toString(),
    auth,
    { listing_id: listing.listing_id, names_deadline: namesDeadline.toISOString() }
  );

  return NextResponse.json({
    id: period.id.toString(),
    status: period.status,
    names_deadline: period.names_deadline,
    protection_ends_at: period.protection_ends_at,
  }, { status: 201 });
}
