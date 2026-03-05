// GET /api/crm/showings — Agent's showings list with ownership enforcement.
// POST /api/crm/showings — Agent creates a showing for their client.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
  const offset = parseInt(searchParams.get("offset") || "0");

  const where: Record<string, unknown> = {};

  // Ownership: agent sees own showings, broker sees all
  if (auth.role !== "BROKER") {
    where.agent_id = auth.userId;
  }

  if (status) where.status = status;
  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) (where.date as Record<string, unknown>).gte = new Date(dateFrom);
    if (dateTo) (where.date as Record<string, unknown>).lte = new Date(dateTo);
  }

  const [showings, total] = await Promise.all([
    prisma.showing.findMany({
      where,
      include: {
        lead: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
            phone: true,
          },
        },
        listing: {
          select: {
            id: true,
            listing_id: true,
            address: true,
            list_price: true,
            status: true,
            listing_type: true,
          },
        },
      },
      orderBy: { date: "asc" },
      take: limit,
      skip: offset,
    }),
    prisma.showing.count({ where }),
  ]);

  const serialized = showings.map((s) => ({
    id: s.id.toString(),
    lead_id: s.lead_id?.toString() ?? null,
    listing_id: s.listing_id.toString(),
    agent_id: s.agent_id.toString(),
    date: s.date,
    time: s.time,
    type: s.type,
    status: s.status,
    notes: s.notes,
    created_at: s.created_at,
    updated_at: s.updated_at,
    lead: s.lead
      ? { ...s.lead, id: s.lead.id.toString() }
      : null,
    listing: {
      ...s.listing,
      id: s.listing.id.toString(),
      list_price: s.listing.list_price.toString(),
    },
  }));

  return NextResponse.json({
    showings: serialized,
    total,
    limit,
    offset,
  });
}

/**
 * POST /api/crm/showings
 * Agent creates a showing for a client + listing.
 * Body: { listing_id: string, lead_id?: string, date: string, time?: string, type?: string, notes?: string }
 */
export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const listingIdStr = body.listing_id as string;
  const dateStr = body.date as string;

  if (!listingIdStr || !dateStr) {
    return NextResponse.json(
      { error: "listing_id and date are required" },
      { status: 400 }
    );
  }

  const showingDate = new Date(dateStr);
  if (isNaN(showingDate.getTime())) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  // Resolve listing by numeric ID or listing_id string
  const numericId = parseInt(listingIdStr);
  let listing;
  if (!isNaN(numericId)) {
    listing = await prisma.listing.findUnique({ where: { id: BigInt(numericId) } });
  }
  if (!listing) {
    listing = await prisma.listing.findUnique({ where: { listing_id: listingIdStr } });
  }
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  // Optional: resolve lead (client)
  let leadId: bigint | null = null;
  if (body.lead_id) {
    const lead = await prisma.lead.findUnique({
      where: { id: BigInt(parseInt(body.lead_id as string)) },
      select: { id: true, agent_id: true },
    });
    if (!lead) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    // Agent can only create showings for their own clients (broker can for any)
    if (auth.role !== "BROKER" && lead.agent_id !== auth.userId) {
      return NextResponse.json({ error: "Client is not assigned to you" }, { status: 403 });
    }
    leadId = lead.id;
  }

  const showing = await prisma.showing.create({
    data: {
      listing_id: listing.id,
      agent_id: auth.userId,
      lead_id: leadId,
      date: showingDate,
      time: (body.time as string) ?? null,
      type: (body.type as string) ?? "private",
      status: "confirmed", // Agent-created showings are auto-confirmed
      notes: (body.notes as string) ?? null,
    },
  });

  await logAuditEvent(
    "create",
    "showing",
    showing.id.toString(),
    auth,
    { listing_id: listingIdStr, lead_id: leadId?.toString() ?? null },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json(
    {
      id: showing.id.toString(),
      status: "confirmed",
      date: showing.date,
    },
    { status: 201 }
  );
}
