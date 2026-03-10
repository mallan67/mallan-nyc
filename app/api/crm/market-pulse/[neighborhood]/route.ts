// /api/crm/market-pulse/[neighborhood] — GET: neighborhood trend over time
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ neighborhood: string }> }
) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { neighborhood } = await params;
  const decoded = decodeURIComponent(neighborhood);
  const { searchParams } = req.nextUrl;
  const listingType = searchParams.get("listing_type") || "sale";

  const snapshots = await prisma.marketSnapshot.findMany({
    where: { neighborhood: decoded, listing_type: listingType },
    orderBy: { period: "desc" },
    take: 12,
  });

  if (snapshots.length === 0) {
    return NextResponse.json({ ok: false, error: "No market data for this neighborhood" }, { status: 404 });
  }

  const current = snapshots[0];
  const previous = snapshots[1] ?? null;
  const changes = previous ? {
    price_change_pct: current.median_price && previous.median_price
      ? Math.round(((Number(current.median_price) - Number(previous.median_price)) / Number(previous.median_price)) * 10000) / 100
      : null,
    inventory_change: current.inventory - (previous?.inventory ?? 0),
    dom_change: current.avg_dom !== null && previous?.avg_dom !== null
      ? (current.avg_dom ?? 0) - (previous?.avg_dom ?? 0)
      : null,
  } : null;

  return NextResponse.json({
    ok: true,
    neighborhood: decoded,
    current: { ...current, id: current.id.toString(), median_price: current.median_price?.toString() ?? null, avg_price: current.avg_price?.toString() ?? null, price_per_sqft: current.price_per_sqft?.toString() ?? null },
    changes,
    history: snapshots.map(s => ({
      ...s, id: s.id.toString(), median_price: s.median_price?.toString() ?? null, avg_price: s.avg_price?.toString() ?? null, price_per_sqft: s.price_per_sqft?.toString() ?? null,
    })),
  });
}
