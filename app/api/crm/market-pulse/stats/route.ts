// /api/crm/market-pulse/stats — GET: citywide market stats
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [saleStats, rentalStats, totalNeighborhoods, activeListings] = await Promise.all([
    prisma.marketSnapshot.aggregate({
      where: { period: currentPeriod, listing_type: "sale" },
      _avg: { median_price: true, avg_dom: true, price_per_sqft: true },
      _sum: { inventory: true, new_listings: true },
    }),
    prisma.marketSnapshot.aggregate({
      where: { period: currentPeriod, listing_type: "rent" },
      _avg: { median_price: true, avg_dom: true },
      _sum: { inventory: true, new_listings: true },
    }),
    prisma.marketSnapshot.findMany({
      where: { period: currentPeriod },
      select: { neighborhood: true },
      distinct: ["neighborhood"],
    }),
    prisma.listing.count({ where: { status: "Active" } }),
  ]);

  return NextResponse.json({
    ok: true,
    stats: {
      period: currentPeriod,
      neighborhoods_tracked: totalNeighborhoods.length,
      active_listings: activeListings,
      sales: {
        avg_median_price: saleStats._avg.median_price ? Math.round(Number(saleStats._avg.median_price)) : null,
        avg_dom: saleStats._avg.avg_dom ? Math.round(Number(saleStats._avg.avg_dom)) : null,
        avg_price_per_sqft: saleStats._avg.price_per_sqft ? Math.round(Number(saleStats._avg.price_per_sqft)) : null,
        total_inventory: saleStats._sum.inventory ?? 0,
        new_listings: saleStats._sum.new_listings ?? 0,
      },
      rentals: {
        avg_median_price: rentalStats._avg.median_price ? Math.round(Number(rentalStats._avg.median_price)) : null,
        avg_dom: rentalStats._avg.avg_dom ? Math.round(Number(rentalStats._avg.avg_dom)) : null,
        total_inventory: rentalStats._sum.inventory ?? 0,
        new_listings: rentalStats._sum.new_listings ?? 0,
      },
    },
  });
}
