// /api/crm/sales/listings — GET: all sale listings with performance metrics
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const where: Record<string, unknown> = {
    listing_type: "sale",
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

  // Look up seller names for these listings
  const listingIds = listings.map((l) => l.listing_id);
  const sellerLeads = listingIds.length > 0
    ? await prisma.lead.findMany({
        where: { active_sale_listing_id: { in: listingIds } },
        select: { active_sale_listing_id: true, first_name: true, last_name: true },
      })
    : [];
  const sellerMap = new Map(
    sellerLeads.map((s) => [s.active_sale_listing_id!, `${s.first_name} ${s.last_name}`.trim()])
  );

  const now = new Date();
  const enriched = listings.map((l) => {
    const addr = typeof l.address === "object" && l.address !== null
      ? (l.address as Record<string, string>).UnparsedAddress || (l.address as Record<string, string>).full || ""
      : String(l.address || "");

    const createdDate = l.created_at ? new Date(l.created_at) : now;
    const dom = Math.max(0, Math.floor((now.getTime() - createdDate.getTime()) / (24 * 3600 * 1000)));

    return {
      ...l,
      id: String(l.id),
      listing_id: l.listing_id,
      agent_id: l.agent_id ? String(l.agent_id) : null,
      address: addr,
      dom,
      showings_count: l._count?.showings || 0,
      inquiries_count: 0, // TODO: wire when Inquiry model exists
      seller_name: sellerMap.get(l.listing_id) || "",
    };
  });

  return NextResponse.json({ listings: enriched });
}
