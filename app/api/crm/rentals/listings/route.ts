// /api/crm/rentals/listings — GET: all rental listings with performance
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const where: Record<string, unknown> = {
    listing_type: "rent",
  };

  if (auth.role !== "BROKER") {
    where.agent_id = auth.userId;
  }

  const listings = await prisma.listing.findMany({
    where,
    orderBy: { updated_at: "desc" },
    take: 200,
    include: {
      _count: {
        select: {
          showings: true,
        },
      },
    },
  });

  // Look up landlord names
  const listingIds = listings.map((l) => l.listing_id);
  const landlordLeads = listingIds.length > 0
    ? await prisma.lead.findMany({
        where: { active_rental_listing_id: { in: listingIds } },
        select: { active_rental_listing_id: true, first_name: true, last_name: true },
      })
    : [];
  const landlordMap = new Map(
    landlordLeads.map((l) => [l.active_rental_listing_id!, `${l.first_name} ${l.last_name}`.trim()])
  );

  const enriched = listings.map((l) => {
    const addr = typeof l.address === "object" && l.address !== null
      ? (l.address as Record<string, string>).UnparsedAddress || (l.address as Record<string, string>).full || ""
      : String(l.address || "");

    return {
      ...l,
      id: String(l.id),
      listing_id: l.listing_id,
      agent_id: l.agent_id ? String(l.agent_id) : null,
      address: addr,
      showings_count: l._count?.showings || 0,
      applications_count: 0, // TODO: wire when Application model exists
      landlord_name: landlordMap.get(l.listing_id) || "",
    };
  });

  return NextResponse.json({ listings: enriched });
}
