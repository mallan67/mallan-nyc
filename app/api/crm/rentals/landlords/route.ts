// /api/crm/rentals/landlords — GET: landlords with unit + listing data
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const phase = req.nextUrl.searchParams.get("phase");

  const where: Record<string, unknown> = {
    roles: { has: "landlord" },
    status: { in: ["active", "contacted", "new"] },
  };

  if (phase === "prospect") {
    where.pipeline_stage = { in: ["new", "contacted", "nurturing", "prospect"] };
    where.active_rental_listing_id = null;
  } else if (phase === "active") {
    where.OR = [
      { pipeline_stage: { in: ["active", "active_landlord"] } },
      { active_rental_listing_id: { not: null } },
    ];
    delete where.status;
  }

  if (auth.role !== "BROKER") {
    where.agent_id = auth.userId;
  }

  const landlords = await prisma.lead.findMany({
    where,
    orderBy: { updated_at: "desc" },
    take: 200,
    include: {
      showings: { select: { id: true } },
    },
  });

  // Enrich with listing data
  const enriched = await Promise.all(
    landlords.map(async (l) => {
      let listing_status = "No Listing";
      let list_price: number | null = null;
      let dom = 0;

      if (l.active_rental_listing_id) {
        const listing = await prisma.listing.findFirst({
          where: { listing_id: l.active_rental_listing_id },
          select: { status: true, list_price: true, days_on_market: true },
        });
        if (listing) {
          listing_status = listing.status;
          list_price = listing.list_price ? Number(listing.list_price) : null;
          dom = listing.days_on_market || 0;
        }
      }

      return {
        ...l,
        id: String(l.id),
        agent_id: l.agent_id ? String(l.agent_id) : null,
        listing_status,
        list_price,
        dom,
        showings_count: l.showings.length,
        name: `${l.first_name} ${l.last_name}`.trim(),
      };
    })
  );

  return NextResponse.json({ landlords: enriched });
}
