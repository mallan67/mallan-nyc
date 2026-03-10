// /api/crm/market-pulse — GET: list market snapshots
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = req.nextUrl;
  const borough = searchParams.get("borough");
  const period = searchParams.get("period");
  const listingType = searchParams.get("listing_type") || "sale";
  const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);

  const where: Record<string, unknown> = { listing_type: listingType };
  if (borough) where.borough = borough;
  if (period) where.period = period;

  const snapshots = await prisma.marketSnapshot.findMany({
    where,
    orderBy: [{ period: "desc" }, { median_price: "desc" }],
    take: limit,
  });

  const serialized = snapshots.map(s => ({
    ...s, id: s.id.toString(),
    median_price: s.median_price?.toString() ?? null,
    avg_price: s.avg_price?.toString() ?? null,
    price_per_sqft: s.price_per_sqft?.toString() ?? null,
  }));

  return NextResponse.json({ ok: true, total: serialized.length, items: serialized });
}
