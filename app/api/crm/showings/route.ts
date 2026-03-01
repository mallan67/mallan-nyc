// GET /api/crm/showings
// Agent's showings list with ownership enforcement.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

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
