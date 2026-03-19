// /api/crm/sales/sellers — GET: active sellers with listing + activity data
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const where: Record<string, unknown> = {
    roles: { has: "seller" },
    status: { in: ["active", "contacted", "new"] },
  };

  // Agent sees only own clients; broker sees all
  if (auth.role !== "BROKER") {
    where.agent_id = auth.userId;
  }

  const sellers = await prisma.lead.findMany({
    where,
    orderBy: { updated_at: "desc" },
    take: 200,
    include: {
      showings: { select: { id: true } },
      activity_logs: {
        orderBy: { created_at: "desc" },
        take: 1,
        select: { title: true, created_at: true },
      },
    },
  });

  // Enrich with listing data
  const enriched = await Promise.all(
    sellers.map(async (s) => {
      let listing_status = "No Listing";
      let showings_count = s.showings.length;

      if (s.active_sale_listing_id) {
        const listing = await prisma.listing.findFirst({
          where: { listing_id: s.active_sale_listing_id },
          select: { status: true },
        });
        if (listing) listing_status = listing.status;
      }

      return {
        ...s,
        id: String(s.id),
        agent_id: s.agent_id ? String(s.agent_id) : null,
        listing_status,
        showings_count,
        name: `${s.first_name} ${s.last_name}`.trim(),
      };
    })
  );

  return NextResponse.json({ sellers: enriched });
}
