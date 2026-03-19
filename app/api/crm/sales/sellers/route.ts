// /api/crm/sales/sellers — GET: active sellers with listing + activity data
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const phase = req.nextUrl.searchParams.get("phase");

  const where: Record<string, unknown> = {
    roles: { has: "seller" },
    status: { in: ["active", "contacted", "new"] },
  };

  // Phase filtering: prospect = no listing linked, active = has listing linked
  if (phase === "prospect") {
    where.pipeline_stage = { in: ["new", "contacted", "nurturing", "prospect"] };
    where.active_sale_listing_id = null;
  } else if (phase === "active") {
    where.OR = [
      { pipeline_stage: { in: ["active", "active_seller"] } },
      { active_sale_listing_id: { not: null } },
    ];
    delete where.status; // active sellers may have various statuses
  }

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
      let list_price: number | null = null;
      let dom = 0;
      let showings_count = s.showings.length;

      if (s.active_sale_listing_id) {
        const listing = await prisma.listing.findFirst({
          where: { listing_id: s.active_sale_listing_id },
          select: { status: true, list_price: true, days_on_market: true },
        });
        if (listing) {
          listing_status = listing.status;
          list_price = listing.list_price ? Number(listing.list_price) : null;
          dom = listing.days_on_market || 0;
        }
      }

      return {
        ...s,
        id: String(s.id),
        agent_id: s.agent_id ? String(s.agent_id) : null,
        listing_status,
        list_price,
        dom,
        showings_count,
        name: `${s.first_name} ${s.last_name}`.trim(),
      };
    })
  );

  return NextResponse.json({ sellers: enriched });
}
