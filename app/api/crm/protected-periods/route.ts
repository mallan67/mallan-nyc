// GET /api/crm/protected-periods
// List protected periods for the authenticated agent (or all for broker).
// UCBA A6/A7/A8 — exclusive expiration, 7-biz-day name submission, 90-day protection.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status"); // pending_names | active | missed_deadline | expired | converted
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
  const offset = parseInt(searchParams.get("offset") || "0");

  const where: Record<string, unknown> = {};

  // Agent sees only their own; broker sees all
  if (auth.role !== "BROKER") {
    where.agent_id = auth.userId;
  }

  if (status) where.status = status;

  const [periods, total] = await Promise.all([
    prisma.protectedPeriod.findMany({
      where,
      include: {
        listing: {
          select: {
            listing_id: true,
            address: true,
            list_price: true,
            listing_type: true,
          },
        },
        agent: {
          select: { id: true, first_name: true, last_name: true },
        },
        protected_buyers: {
          select: {
            id: true,
            buyer_name: true,
            deal_executed: true,
            created_at: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.protectedPeriod.count({ where }),
  ]);

  return NextResponse.json({
    data: periods.map((p) => ({
      id: p.id.toString(),
      listing_id: p.listing.listing_id,
      address: p.listing.address,
      list_price: p.listing.list_price,
      listing_type: p.listing.listing_type,
      agent: {
        id: p.agent.id.toString(),
        name: `${p.agent.first_name} ${p.agent.last_name}`,
      },
      agreement_expired_at: p.agreement_expired_at,
      names_deadline: p.names_deadline,
      protection_ends_at: p.protection_ends_at,
      names_submitted_at: p.names_submitted_at,
      notice_uploaded_at: p.notice_uploaded_at,
      status: p.status,
      buyer_count: p.protected_buyers.length,
      buyers_with_deals: p.protected_buyers.filter((b) => b.deal_executed).length,
      created_at: p.created_at,
    })),
    total,
    limit,
    offset,
  });
}
